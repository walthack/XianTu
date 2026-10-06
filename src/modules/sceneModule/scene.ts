// 场面模块的状态机：begin → preview / confirm（每拍一次）→ closing。全部是“状态进、状态出”的纯函数。
// 合同决定一切内容与门槛（胜负、拍数、敌方出手、大失败后果）；模块只执行规则。

import { evalExpr } from './conditions';
import { peekActionDice, newSeed } from './dice';
import { applyWorstCaseEnemyPhase, resolveEnemyPhase, type EnemyRoll } from './enemy';
import { lintContract } from './lint';
import { applyLocks, evaluatePlan, type PlanEvaluation } from './plan';
import { allTrackInfos, isPresent, partyDisplay, partyOf, playerParty, resolveTagTargets, trackInfo, trackLabel, trackStep } from './queries';
import { applyStatus, expireStatuses, persistentStatuses, type StatusEvent } from './statuses';
import { pickFace, resolveCheck, resolveSettings, type ResolvedSettings } from './tiers';
import {
  TIER_LABELS,
  type ActionPlan, type ActiveTag, type ClosingBranch, type Consequence, type Contract, type Cond, type Expr,
  type FixedEventEffect, type FumbleEntry, type PlayerChoiceCond, type SceneContext, type SceneOutcome, type SceneState, type TagDef, type TierId,
} from './types';

/** 存档里最多留多少条行动审计（计数器 counters 不受影响）。 */
const AUDIT_KEEP = 200;

export class SceneContractError extends Error {
  constructor(readonly problems: string[]) {
    super(`场面合同体检未通过：\n- ${problems.join('\n- ')}`);
    this.name = 'SceneContractError';
  }
}

// ---------- 开场 ----------

export interface BeginOptions {
  seed?: number;
  forced?: SceneState['forced'];
  ctx?: Pick<SceneContext, 'catalog'>;
}

export interface BeginResult {
  state: SceneState;
  events: Array<{ id: string; text?: string }>;
  warnings: string[];
}

export function beginScene(contract: Contract, options: BeginOptions = {}): BeginResult {
  const lint = lintContract(contract, options.ctx);
  if (lint.errors.length) throw new SceneContractError(lint.errors);
  const state: SceneState = {
    version: 1,
    contractId: contract.meta.id,
    contractVersion: contract.meta.version,
    status: 'engaged',
    beat: 1,
    seed: options.seed ?? newSeed(),
    cursors: { action: 0, defense: 0 },
    present: {},
    departed: [],
    tracks: {},
    sceneTracks: {},
    statuses: {},
    tags: [],
    leverUses: {},
    noveltySeen: [],
    credits: [],
    firedEvents: [],
    flags: {},
    digest: [],
    digestOlder: 0,
    audit: [],
    counters: { actions: 0, checks: 0, defenseRolls: 0 },
  };
  if (options.forced) state.forced = options.forced;
  for (const party of contract.parties) {
    state.present[party.id] = !party.absent;
    state.statuses[party.id] = [];
  }
  for (const info of allTrackInfos(contract)) (state.tracks[info.party] ||= {})[info.id] = info.initial;
  for (const track of contract.tracks || []) {
    if (!track.owner || track.owner === 'scene') state.sceneTracks[track.id] = Math.max(0, Math.min(track.scale.length - 1, track.initial ?? 0));
  }
  const events = fireBeatEvents(contract, state, options.ctx);
  return { state, events, warnings: lint.warnings };
}

// ---------- 固定事件与效果 ----------

function makeTag(def: TagDef, beat: number, on: string, extraBeats: number, sourceId: string): ActiveTag {
  const effect = typeof def.effect === 'string' ? { text: def.effect } : { ...(def.effect || {}) };
  return {
    id: def.id, label: def.label, on, effect, sourceId,
    expiresBeat: def.durationBeats === null ? null : beat + def.durationBeats + extraBeats,
  };
}

function addTag(state: SceneState, tag: ActiveTag): void {
  state.tags = state.tags.filter(item => !(item.id === tag.id && item.on === tag.on));
  state.tags.push(tag);
}

function setTrackLabel(contract: Contract, state: SceneState, party: string | undefined, trackId: string, label: string): void {
  if (!party || party === 'scene') {
    const global = contract.tracks?.find(t => t.id === trackId);
    const index = global?.scale.indexOf(label) ?? -1;
    if (index >= 0) state.sceneTracks[trackId] = index;
    return;
  }
  const info = trackInfo(contract, party, trackId);
  const index = info?.scale.indexOf(label) ?? -1;
  if (info && index >= 0) (state.tracks[party] ||= {})[trackId] = index;
}

function applyEffects(contract: Contract, state: SceneState, ctx: Pick<SceneContext, 'catalog'> | undefined, effects: FixedEventEffect[] | undefined, sourceId: string): StatusEvent[] {
  const events: StatusEvent[] = [];
  for (const effect of effects || []) {
    if (effect.setTrack) setTrackLabel(contract, state, effect.setTrack.party, effect.setTrack.track, effect.setTrack.to);
    if (effect.depart) {
      state.present[effect.depart] = false;
      if (!state.departed.includes(effect.depart)) state.departed.push(effect.depart);
    }
    if (effect.arrive) {
      state.present[effect.arrive] = true;
      state.departed = state.departed.filter(id => id !== effect.arrive);
    }
    if (effect.tag) for (const on of resolveTagTargets(contract, effect.tag.on)) addTag(state, makeTag(effect.tag, state.beat, on, 0, sourceId));
    if (effect.status) events.push(...applyStatus(state, contract, ctx, effect.status.party, effect.status, { cause: 'story', sourceId }));
  }
  return events;
}

/** 新一拍开始（含第 1 拍）：触发 onStart（只第 1 拍）和 atBeat 等于当前拍的固定事件。 */
function fireBeatEvents(contract: Contract, state: SceneState, ctx: Pick<SceneContext, 'catalog'> | undefined): Array<{ id: string; text?: string }> {
  const out: Array<{ id: string; text?: string }> = [];
  for (const event of contract.clock?.fixedEvents || []) {
    if (event.when || state.firedEvents.includes(event.id)) continue;
    const due = (event.onStart && state.beat === 1) || event.atBeat === state.beat;
    if (!due) continue;
    state.firedEvents.push(event.id);
    applyEffects(contract, state, ctx, event.effects, `event:${event.id}`);
    out.push({ id: event.id, text: event.text });
  }
  out.push(...fireConditionalEvents(contract,state,ctx,'beatStart'));
  return out;
}

/** Conditional events run at settled checkpoints, once per saved event id. No dice or model calls. */
export function fireConditionalEvents(contract: Contract, state: SceneState, ctx: Pick<SceneContext, 'catalog'> | undefined, trigger: NonNullable<import('./types').FixedEvent['trigger']>, enemyActionId?: string): Array<{id:string;text?:string}> {
  const out: Array<{id:string;text?:string}> = [];
  // Bounded fixed point: one event can make a later/earlier authored condition true.
  for (let pass=0; pass<(contract.clock?.fixedEvents?.length || 0); pass++) {
    let fired=false;
    for (const event of contract.clock?.fixedEvents || []) {
      if (!event.when || event.atClose || state.firedEvents.includes(event.id)) continue;
      if (event.trigger ? event.trigger!==trigger : trigger==='beforeEnemyAction') continue;
      if (event.enemyActionId && event.enemyActionId!==enemyActionId) continue;
      if (!evalExpr(event.when,contract,state,ctx)) continue;
      state.firedEvents.push(event.id);applyEffects(contract,state,ctx,event.effects,`event:${event.id}`);
      out.push({id:event.id,text:event.text});fired=true;
    }
    if (!fired) break;
  }
  return out;
}

// ---------- 胜负判断 ----------

function defeatConditions(contract: Contract): Array<Cond | Expr> {
  return (contract.defeat?.conditions || []).filter(c => (c as PlayerChoiceCond).kind !== 'playerChoice') as Array<Cond | Expr>;
}

export function isLost(contract: Contract, state: SceneState, ctx?: Pick<SceneContext, 'catalog'>): boolean {
  return defeatConditions(contract).some(cond => evalExpr(cond, contract, state, ctx));
}

export function isWon(contract: Contract, state: SceneState, ctx?: Pick<SceneContext, 'catalog'>): boolean {
  return !isLost(contract, state, ctx) && evalExpr(contract.objective.win, contract, state, ctx);
}

function decide(contract: Contract, state: SceneState, kind: SceneOutcome['kind'], reason: string): void {
  state.status = 'decided';
  const outcome: SceneOutcome = { kind, reason };
  if (kind === 'lose' && contract.defeat?.outcome?.type === 'ending') outcome.endingId = contract.defeat.outcome.endingId;
  state.outcome = outcome;
}

// ---------- 大失败的后果 ----------

function pickFumble(contract: Contract, ev: PlanEvaluation, face: number): FumbleEntry | undefined {
  const okKinds = ev.levers.filter(l => l.ok).map(l => l.elementKind);
  const eligible = (contract.fumble || []).filter(entry => {
    const when = entry.when;
    if (!when) return true;
    if (when.goal && when.goal !== ev.goal.id) return false;
    if (when.goalType && when.goalType !== (ev.goal.type || 'push')) return false;
    if (when.elementKind && !okKinds.includes(when.elementKind)) return false;
    return true;
  });
  return eligible.length ? eligible[(face - 1) % eligible.length] : undefined;
}

const DEFAULT_FUMBLE: FumbleEntry = {
  id: 'module.default_fumble', target: 'actor', consequence: { kind: 'status', status: 'off_balance' }, text: '架势散乱，下一拍处于劣势',
};

function resolveConsequenceTarget(contract: Contract, ev: PlanEvaluation, entry: FumbleEntry): string {
  const player = playerParty(contract)?.id || '';
  if (entry.target === 'actor') return player;
  if (entry.target === 'committed') {
    const committed = ev.levers.find(l => l.ok && l.owner && l.owner !== player);
    return committed?.owner || player;
  }
  return entry.target.party;
}

function applyConsequence(contract: Contract, state: SceneState, ctx: SceneContext, target: string, consequence: Consequence, sourceId: string): StatusEvent[] {
  if (consequence.kind === 'status') {
    return applyStatus(state, contract, ctx, target, consequence, { cause: 'combat', sourceId });
  }
  const party = consequence.party || target;
  const info = trackInfo(contract, party, consequence.track);
  if (info) {
    const next = Math.max(0, Math.min(info.scale.length - 1, trackStep(state, party, info.id) + consequence.steps));
    (state.tracks[party] ||= {})[info.id] = next;
  }
  return [];
}

// ---------- 预览 ----------

export interface ActionPreview extends PlanEvaluation {
  lock?: { id: string; reply: string; redirectTo?: string };
  warn: 'none' | 'pre' | 'danger';
  warnText?: string;
  tierLabels: Record<TierId, string>;
}

export function previewAction(contract: Contract, state: SceneState, planIn: ActionPlan, ctx: SceneContext): ActionPreview {
  const locked = applyLocks(contract, planIn);
  const evaluation = evaluatePlan(contract, state, locked.plan, ctx);
  const warn = assessDanger(contract, state, ctx);
  return {
    ...evaluation,
    lock: locked.lock,
    warn,
    warnText: warn === 'none' ? undefined : contract.defeat?.guards?.warnText || '此拍若出差错，可能触发败局',
    tierLabels: TIER_LABELS,
  };
}

// ---------- 结算一拍 ----------

export interface BeatResult {
  beat: number;
  index: number;
  goal: string;
  goalLabel: string;
  tier: TierId;
  tierLabel: string;
  baseTier: TierId;
  natTriggered: 'nat20' | 'nat1' | null;
  face: number;
  faces: [number, number];
  total: number;
  modifier: number;
  difficulty: number;
  margin: number;
  mode: PlanEvaluation['mode'];
  grounded: boolean;
  lock?: ActionPreview['lock'];
  claims: Array<{ party: string; track?: string; claimed: number; realized: number; from: number; to: number; clamped: boolean; blocked?: string; clampText?: string; label?: string }>;
  marks: string[];
  tagsCreated: string[];
  tagsCashed: string[];
  leversSpent: string[];
  leversKept: string[];
  credit: boolean;
  edge: boolean;
  fumble?: { entry: string; target: string; consequence: Consequence; text?: string; statuses: StatusEvent[] };
  enemy: EnemyRoll[];
  enemyTruncated: boolean;
  statusEvents: StatusEvent[];
  events: Array<{ id: string; text?: string }>;
  timeout?: boolean;
  outcome?: SceneOutcome;
  /** 为下一拍给界面 / 简报用的预警。 */
  warn: 'none' | 'pre' | 'danger';
}

export function confirmAction(contract: Contract, stateIn: SceneState, planIn: ActionPlan, ctx: SceneContext): { state: SceneState; result: BeatResult } {
  if (stateIn.status !== 'engaged') throw new Error(`场面已${stateIn.status === 'closed' ? '收束' : '分出胜负'}，不能再结算行动`);
  const state = structuredClone(stateIn);
  const settings = resolveSettings(contract.settings);
  const player = playerParty(contract)?.id || '';
  const locked = applyLocks(contract, planIn);
  const ev = evaluatePlan(contract, state, locked.plan, ctx);

  // 1) 掷骰（先推进游标，读档重放面不变）
  const index = state.cursors.action;
  const faces = peekActionDice(state);
  state.cursors.action += 1;
  state.counters.actions += 1;
  state.counters.checks += 1;
  const face = pickFace(faces, ev.mode);
  const check = resolveCheck({ face, modifier: ev.modifier, difficulty: ev.difficulty, grounded: ev.grounded }, settings);
  const tier = check.tier;
  const success = tier === 'great_success' || tier === 'success';
  const crit = tier === 'great_success';
  const bonus = new Set(settings.tiers.critBonus);
  const sourceId = `action:${state.beat}`;
  const statusEvents: StatusEvent[] = [];

  const result: BeatResult = {
    beat: state.beat, index, goal: ev.goal.id, goalLabel: ev.goal.label || ev.goal.text || ev.goal.id,
    tier, tierLabel: TIER_LABELS[tier], baseTier: check.baseTier, natTriggered: check.natTriggered,
    face, faces, total: check.total, modifier: ev.modifier, difficulty: ev.difficulty, margin: check.margin,
    mode: ev.mode, grounded: ev.grounded, lock: locked.lock, claims: [], marks: [], tagsCreated: [], tagsCashed: [],
    leversSpent: [], leversKept: [], credit: false, edge: false, enemy: [], enemyTruncated: false,
    statusEvents, events: [], warn: 'none',
  };

  // 2) 兑现主张（成功 / 大成功；受合同夹紧，大成功不多推一格）
  for (const target of ev.targets) {
    if (!target.track) continue;
    const from = trackStep(state, target.party, target.track);
    const realized = success && !target.blocked ? Math.max(0, Math.min(ev.goal.completeOnSuccess ? target.limit - from : ev.plan.magnitude, target.limit - from)) : 0;
    if (realized > 0) (state.tracks[target.party] ||= {})[target.track] = from + realized;
    const info = trackInfo(contract, target.party, target.track);
    if (realized > 0 && from + realized >= target.limit && ev.goal.finishAs && info?.ending?.alternatives?.includes(ev.goal.finishAs)) {
      state.tracks[target.party][target.track] = info.scale.indexOf(ev.goal.finishAs);
    }
    const label = trackLabel(state, contract, target.party, target.track);
    result.claims.push({
      party: target.party, track: target.track, claimed: ev.plan.magnitude, realized, from, to: trackStep(state, target.party, target.track),
      clamped: success && !target.blocked && realized < ev.plan.magnitude, blocked: target.blocked,
      clampText: realized < ev.plan.magnitude ? target.clampText : undefined, label,
    });
    if (success && !target.blocked && realized === 0 && target.limit === from) {
      const ending = trackInfo(contract, target.party, target.track)?.ending;
      for (const mark of ending?.permittedMarks || []) {
        const need = typeof mark.requires === 'object' ? mark.requires.magnitude ?? 1 : 1;
        if (ev.plan.magnitude >= need) result.marks.push(mark.id);
      }
    }
  }

  // 3) 态势：成功生成标签（大成功多留一拍）；失败不生成
  if (success) {
    const extra = crit && bonus.has('tagPlus1') ? 1 : 0;
    const created: TagDef[] = [];
    if (ev.goal.onSuccess?.tag) {
      const mode = ev.goal.onSuccess.tagOn || 'targets';
      const ons = mode === 'self' ? [player] : mode === 'allies'
        ? contract.parties.filter(p => p.side === 'player_side' && isPresent(state, p.id)).map(p => p.id)
        : ev.targets.length ? ev.targets.map(t => t.party) : [ev.goal.onSuccess.tag.on];
      for (const on of ons) addTag(state, makeTag(ev.goal.onSuccess.tag, state.beat, on, extra, sourceId));
      created.push(ev.goal.onSuccess.tag);
    }
    for (const lever of ev.levers.filter(l => l.ok && l.creates)) {
      const def = contract.tags?.find(t => t.id === lever.creates);
      if (!def) continue;
      for (const on of resolveTagTargets(contract, def.on)) addTag(state, makeTag(def, state.beat, on, extra, sourceId));
      created.push(def);
    }
    result.tagsCreated = created.map(t => t.id);
  }
  // 兑现过的态势用掉
  for (const item of ev.cash.filter(c => c.ok)) {
    state.tags = state.tags.filter(tag => tag.id !== item.tag);
    result.tagsCashed.push(item.tag);
  }

  // 4) 杠杆消耗：大成功免暴露（不消耗）；失败按设置
  const spend = crit && bonus.has('noExposure') ? false : tier === 'failure' ? settings.tiers.failure.spendOneShot : true;
  for (const lever of ev.levers.filter(l => l.ok)) {
    const element = contract.elements?.find(e => e.id === lever.element);
    if (element?.uses === undefined || element.uses === null) continue;
    if (spend) {
      state.leverUses[element.id] = (state.leverUses[element.id] || 0) + 1;
      result.leversSpent.push(element.id);
    } else result.leversKept.push(element.id);
  }
  if (ev.noveltyKey && !state.noveltySeen.includes(ev.noveltyKey)) state.noveltySeen.push(ev.noveltyKey);

  // 5) 大成功红利：功劳
  if (crit && bonus.has('credit')) {
    state.credits.push(`${state.beat}:${ev.goal.id}`);
    result.credit = true;
  }

  // 6) 失败：局面往敌人那边偏，人不直接掉东西；大失败：另有一个具体后果挂到具体角色
  if (!success) {
    for (const consequence of ev.goal.onFailure || []) statusEvents.push(...applyConsequence(contract, state, ctx, playerParty(contract)!.id, consequence, 'goal:failure'));
    result.edge = true;
    addTag(state, { id: 'edge', label: '敌占先', on: 'opposed', expiresBeat: state.beat, effect: { enemyDcBonus: settings.tiers.failure.edge, text: '本拍敌方出手更难防' }, sourceId });
    if (tier === 'critical_failure') {
      const entry = pickFumble(contract, ev, face) || DEFAULT_FUMBLE;
      const target = resolveConsequenceTarget(contract, ev, entry);
      const events = applyConsequence(contract, state, ctx, target, entry.consequence, `fumble:${entry.id}`);
      statusEvents.push(...events);
      result.fumble = { entry: entry.id, target, consequence: entry.consequence, text: entry.text, statuses: events };
    }
  }

  // 7) 审计
  state.audit.push({
    beat: state.beat, index, text: planIn.text?.slice(0, 80), goal: ev.goal.id, magnitude: ev.plan.magnitude, face, total: check.total,
    difficulty: ev.difficulty, margin: check.margin, mode: ev.mode, tier, baseTier: check.baseTier, natTriggered: check.natTriggered, grounded: ev.grounded,
  });

  if (state.audit.length > AUDIT_KEEP) state.audit.splice(0, state.audit.length - AUDIT_KEEP);

  // 8) 玩家这一动作之后：先看败，再看胜
  const ended = (): boolean => {
    if (isLost(contract, state, ctx)) { decide(contract, state, 'lose', '败局条件成立'); return true; }
    if (isWon(contract, state, ctx)) { decide(contract, state, 'win', '胜利条件成立'); return true; }
    return false;
  };
  result.events.push(...fireConditionalEvents(contract,state,ctx,'afterAction'));
  if (!ended()) {
    // 9) 敌方出手
    const phase = resolveEnemyPhase(contract, state, { ...ctx, playerDefense: (ctx.playerDefense || 0) + (ev.goal.defensePenalty || 0) }, (phase,actionId) => {
      const fired=fireConditionalEvents(contract,state,ctx,phase,actionId);
      result.events.push(...fired);
      return fired.length>0 && ended();
    });
    result.enemy = phase.rolls;
    result.enemyTruncated = phase.truncated;
    statusEvents.push(...phase.statusEvents);
    if (!ended()) {
      // 10) 一拍结束：到期移除；检查拍数；进入下一拍
      statusEvents.push(...expireStatuses(state, contract, ctx));
      state.tags = state.tags.filter(tag => tag.expiresBeat === null || tag.expiresBeat > state.beat);
      const timeout = clockTimeout(contract, state);
      if (timeout) {
        result.timeout = true;
        if (timeout.type === 'close') decide(contract, state, timeout.as, '拍数用完');
        else {
          statusEvents.push(...applyEffects(contract, state, ctx, timeout.events, 'clock:timeout'));
          if (timeout.text) result.events.push({ id: 'clock:timeout', text: timeout.text });
        }
      }
      if (state.status === 'engaged') {
        state.beat += 1;
        result.events.push(...fireBeatEvents(contract, state, ctx));
        if (isLost(contract, state, ctx)) decide(contract, state, 'lose', '败局条件成立');
        else if (isWon(contract, state, ctx)) decide(contract, state, 'win', '胜利条件成立');
      }
    }
  }
  if (state.status !== 'engaged') state.tags = state.tags.filter(tag => tag.id !== 'edge');
  result.outcome = state.outcome;
  result.warn = state.status === 'engaged' ? assessDanger(contract, state, ctx) : 'none';

  const parts = [
    `${ev.goal.label || ev.goal.text || ev.goal.id}→${TIER_LABELS[tier]}`,
    ...result.claims.filter(c => c.realized > 0).map(c => `${partyDisplay(contract, c.party)}${c.label}`),
    ...result.enemy.map(r => `${r.label}${r.outcome === 'hit' ? '命中' : '被挡'}${partyDisplay(contract, r.target)}`),
    ...(result.fumble ? [`后果:${result.fumble.text || result.fumble.entry}`] : []),
  ];
  pushDigest(state, settings, `第${result.beat}拍 ${parts.join('；')}`);
  return { state, result };
}

function clockTimeout(contract: Contract, state: SceneState): ({ type: 'close'; as: SceneOutcome['kind'] } | { type: 'continue'; events?: FixedEventEffect[]; text?: string }) | null {
  const beats = contract.clock?.beats;
  if (!beats || state.beat < beats || state.firedEvents.includes('clock:timeout')) return null;
  state.firedEvents.push('clock:timeout');
  const rule = contract.clock?.onTimeout;
  if (rule?.type === 'continue') return rule;
  // 拖满拍数默认不算赢：没写规则、或写了 timeout，都按“超时收束”；只有合同明写 win 才算赢。
  return { type: 'close', as: rule?.type === 'close' ? rule.as : 'timeout' };
}

function pushDigest(state: SceneState, settings: ResolvedSettings, line: string): void {
  state.digest.push(line);
  while (state.digest.length > settings.brief.digestKeep) {
    state.digest.shift();
    state.digestOlder += 1;
  }
}

// ---------- 危险拍预警（只对“败即结局”的合同；用最坏情形模拟，代替旧的伤害点预警） ----------

function allHitState(contract: Contract, state: SceneState, ctx: SceneContext): SceneState {
  const sim = structuredClone(state);
  applyWorstCaseEnemyPhase(contract, sim, ctx);
  return sim;
}

/** 大失败后果可能落在谁身上（预警要把每种可能都算进去）。 */
function possibleFumbleTargets(contract: Contract, entry: FumbleEntry): string[] {
  const player = playerParty(contract)?.id || '';
  if (entry.target === 'actor') return [player];
  if (entry.target === 'committed') {
    const owners = [...new Set((contract.elements || []).map(e => e.owner).filter((o): o is string => !!o && o !== player))];
    return owners.length ? owners : [player];
  }
  return [entry.target.party];
}

function worstCases(contract: Contract, state: SceneState, ctx: SceneContext): SceneState[] {
  const fumbles = contract.fumble && contract.fumble.length ? contract.fumble : [DEFAULT_FUMBLE];
  const out: SceneState[] = [allHitState(contract, state, ctx)];
  for (const entry of fumbles) {
    for (const target of possibleFumbleTargets(contract, entry)) {
      const st = structuredClone(state);
      applyConsequence(contract, st, ctx, target, entry.consequence, 'sim');
      out.push(allHitState(contract, st, ctx));
    }
  }
  return out;
}

export function assessDanger(contract: Contract, state: SceneState, ctx: SceneContext): 'none' | 'pre' | 'danger' {
  if (contract.defeat?.outcome?.type !== 'ending' || state.status !== 'engaged') return 'none';
  const beats = contract.clock?.beats;
  const timeoutLoses = !!beats && contract.clock?.onTimeout?.type === 'close' && contract.clock.onTimeout.as === 'lose';
  if (timeoutLoses && beats && state.beat >= beats) return 'danger';
  const loses = (st: SceneState): boolean => isLost(contract, st, ctx);
  const cases = worstCases(contract, state, ctx);
  if (cases.some(loses)) return 'danger';
  if (timeoutLoses && beats && state.beat + 1 >= beats) return 'pre';
  if (contract.defeat?.guards?.warnPre === false) return 'none';
  const next = cases.map(st => {
    const n = structuredClone(st);
    expireStatuses(n, contract, ctx);
    n.beat += 1;
    return n;
  });
  return next.some(n => worstCases(contract, n, ctx).some(loses)) ? 'pre' : 'none';
}

// ---------- 玩家的主动选择（只由玩家触发，不由骰子触发） ----------

export function matchPlayerChoice(contract: Contract, text: string): { id: string; label: string; endingId: string; confirmText: string } | null {
  const compact = (v: string): string => String(v || '').normalize('NFKC').replace(/\s+/g, '');
  const body = compact(text);
  for (const cond of contract.defeat?.conditions || []) {
    if ((cond as PlayerChoiceCond).kind !== 'playerChoice') continue;
    for (const choice of (cond as PlayerChoiceCond).choices) {
      if (choice.matchHints.some(hint => body.split(/[，。；,:：;]/).some(clause =>
        clause.includes(compact(hint)) && !/不|别|拒绝|绝无|休想|宁死|不会|不肯|不愿|岂|怎会|假如|如果|要是|是否|吗|[？?]/.test(clause.replace(compact(hint), '')) && !/不$/.test(clause.slice(0, clause.indexOf(compact(hint))))))) return choice;
    }
  }
  return null;
}

/** 玩家在专用确认卡上确认之后才调用。 */
export function applyPlayerChoice(contract: Contract, stateIn: SceneState, choiceId: string): SceneState {
  const choice = (contract.defeat?.conditions || [])
    .filter((c): c is PlayerChoiceCond => (c as PlayerChoiceCond).kind === 'playerChoice')
    .flatMap(c => c.choices).find(c => c.id === choiceId);
  if (!choice) throw new Error(`没有这个主动选择：${choiceId}`);
  const state = structuredClone(stateIn);
  state.status = 'decided';
  state.outcome = { kind: 'lose', reason: `玩家主动选择：${choice.label}`, endingId: choice.endingId, choiceId: choice.id };
  return state;
}

// ---------- 收束 ----------

export interface WriteBack {
  outcome: SceneOutcome;
  beats: number;
  finalStates: Array<{ party: string; ref: string; track: string; label: string }>;
  statusEvents: StatusEvent[];
  persistent: Array<{ party: string; ref: string; status: string; label: string; originScene?: string; minutes: number | null; cause: string; source?: string }>;
  costs: Array<{ id: string; target: string; effect?: string; anchorText?: string }>;
  rewards: Array<Record<string, unknown>>;
  flags: Record<string, string | number | boolean>;
  next: string | null;
  credits: string[];
  closingText?: string;
  events: Array<{ id: string; text?: string }>;
  violations: { redLines: string[]; afterState: string[] };
  /** 给长期记忆的一段摘要（{{ref:id}} 占位由宿主换成显示名）。 */
  memoryNote: string;
}

export function closeScene(contract: Contract, stateIn: SceneState, ctx: SceneContext): { state: SceneState; writeBack: WriteBack } {
  if (stateIn.status !== 'decided' || !stateIn.outcome) throw new Error('场面还没分出结果，不能收束');
  const state = structuredClone(stateIn);
  const outcome = state.outcome!;
  // Also normalize a saved, already-decided loss against the current contract.
  if (outcome.kind === 'lose' && contract.defeat?.outcome?.type === 'ending') outcome.endingId = contract.defeat.outcome.endingId;
  const branch: ClosingBranch = (outcome.choiceId ? contract.closing?.playerChoices?.[outcome.choiceId] : contract.closing?.[outcome.kind]) || {};
  const statusEvents: StatusEvent[] = [];
  const events: Array<{ id: string; text?: string }> = [];

  // 收束事件
  for (const event of contract.clock?.fixedEvents || []) {
    if (outcome.choiceId) continue;
    if (!event.atClose || state.firedEvents.includes(event.id)) continue;
    state.firedEvents.push(event.id);
    statusEvents.push(...applyEffects(contract, state, ctx, event.effects, `event:${event.id}`));
    events.push({ id: event.id, text: event.text });
  }

  // 过程与终态分离：赢的收束时，各轨道被置成合同规定的终态。
  if (outcome.kind === 'win') {
    for (const info of allTrackInfos(contract)) {
      if (!info.ending?.finalState || info.ending.preserveOnWin) continue;
      if (info.ending.alternatives?.includes(trackLabel(state, contract, info.party, info.id))) continue;
      const index = info.scale.indexOf(info.ending.finalState);
      if (index >= 0) (state.tracks[info.party] ||= {})[info.id] = index;
    }
  }
  for (const rule of branch.settle || []) {
    for (const info of allTrackInfos(contract)) {
      const party = partyOf(contract, info.party)!;
      if (rule.party && rule.party !== info.party) continue;
      if (rule.side && rule.side !== party.side) continue;
      if (rule.track && rule.track !== info.id) continue;
      if (rule.onlyUnfinished && trackStep(state, info.party, info.id) >= info.limit && info.limit > info.initial) continue;
      const index = info.scale.indexOf(rule.to);
      if (index >= 0) (state.tracks[info.party] ||= {})[info.id] = index;
    }
  }

  // 承重代价、旗标
  const costs: WriteBack['costs'] = [];
  for (const cost of branch.fixedCosts || []) {
    for (const ref of cost.statuses || []) statusEvents.push(...applyStatus(state, contract, ctx, cost.target, ref, { cause: 'story', sourceId: `cost:${cost.id}` }));
    costs.push({ id: cost.id, target: cost.target, effect: cost.effect, anchorText: cost.anchorText });
  }
  Object.assign(state.flags, branch.flags || {});

  statusEvents.push(...applyEffects(contract,state,ctx,contract.continuity?.effects,'continuity'));
  for (const cost of contract.continuity?.fixedCosts || []) {
    if (costs.some(item=>item.id===cost.id)) continue;
    for (const ref of cost.statuses || []) statusEvents.push(...applyStatus(state,contract,ctx,cost.target,ref,{cause:'story',sourceId:`continuity:${cost.id}`}));
    costs.push({id:cost.id,target:cost.target,effect:cost.effect,anchorText:cost.anchorText});
  }
  Object.assign(state.flags,contract.continuity?.flags || {});

  // 红线与事后状态：运行时再核一遍，违反的列出来（体检已证明不可达，这里是兜底）
  const violations = { redLines: [] as string[], afterState: [] as string[] };
  for (const line of contract.redLines || []) {
    const tracks = line.track ? [line.track] : Object.keys(state.tracks[line.party] || {});
    for (const track of tracks) {
      if (trackLabel(state, contract, line.party, track) === line.forbiddenFinalState) violations.redLines.push(`${line.party}/${track}=${line.forbiddenFinalState}`);
    }
  }
  if (outcome.kind === 'win') {
    for (const after of branch.afterState || []) {
      if (after.check && !evalExpr(after.check, contract, state, ctx)) violations.afterState.push(after.id);
    }
  }

  for (const check of contract.continuity?.checks || []) if (check.check && !evalExpr(check.check,contract,state,ctx)) violations.afterState.push(check.id);

  const finalStates: WriteBack['finalStates'] = allTrackInfos(contract).map(info => ({
    party: info.party, ref: partyOf(contract, info.party)!.ref, track: info.id, label: trackLabel(state, contract, info.party, info.id),
  }));
  const persistent = persistentStatuses(state, contract, ctx).map(item => ({
    originScene:item.active.originScene,
    party: item.party, ref: item.ref, status: item.def.id, label: item.def.label, minutes: item.def.afterScene?.minutes ?? null,
    cause: item.def.cause, source: item.def.source,
  }));
  const label = outcome.kind === 'win' ? '胜' : outcome.kind === 'lose' ? '败' : '超时收束';
  const memoryNote = [
    `${contract.objective.text}：${label}（共 ${state.audit.length} 拍行动）。`,
    persistent.length ? `留下的状态：${persistent.map(p => `${partyDisplay(contract, p.party)}${p.label}`).join('、')}。` : '',
    state.credits.length ? `玩家有 ${state.credits.length} 次大成功的功劳。` : '',
  ].filter(Boolean).join('');

  state.status = 'closed';
  state.closed = true;
  state.digest = [];
  state.digestOlder = 0;
  return {
    state,
    writeBack: {
      outcome, beats: state.audit.length, finalStates, statusEvents, persistent, costs, rewards: branch.rewards || [], flags: { ...(branch.flags || {}) },
      next: branch.next ?? null, credits: state.credits, closingText: branch.text, events, violations, memoryNote,
    },
  };
}
