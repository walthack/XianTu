import {GAME_NUMBERS} from './numbers';
import {levelModifier} from './levels';
// 玩家行动：识别层提议的校验（只许白名单），以及落地、定价、预览（只读，不改状态）。

import { isPresent, partyOf, playerParty, trackInfo, trackStep } from './queries';
import { isDowned, lockedBy, statusMode, statusRollModifier } from './statuses';
import { oddsFor, resolveSettings, rollMode, type ResolvedSettings, type RollMode } from './tiers';
import type { ActionPlan, Contract, ElementDef, GoalDef, PlanLever, SceneContext, SceneState, TierId, VerbDef } from './types';

const BANNED_KEYS = /^(difficulty|dc|result|outcome|tier|roll|modifier|damage|success|total)$/i;

/** 战斗场面没写 goals[] 时的默认目标集（只有定价基准，没有任何胜负、拍数门槛）。 */
export const DEFAULT_COMBAT_GOALS: GoalDef[] = [
  { id: 'attack', label: '进攻', type: 'push', get baseDifficulty(){return GAME_NUMBERS.combat.baselineDc;} },
  {
    id: 'guard', label: '掩护', type: 'support', get baseDifficulty(){return GAME_NUMBERS.combat.baselineDc;},
    onSuccess: { tagOn: 'allies', tag: { id: 'guarded', label: '受掩护', on: 'player_side', get durationBeats(){return GAME_NUMBERS.combat.guard.durationBeats;}, effect: { get defenseBonus(){return GAME_NUMBERS.combat.guard.defenseBonus;} } } },
  },
];

export function goalsOf(contract: Contract): GoalDef[] {
  if (contract.goals?.length) return contract.goals;
  return contract.meta.scene.kind === 'combat' ? DEFAULT_COMBAT_GOALS : [];
}

export const goalOf = (contract: Contract, id: string): GoalDef | undefined => goalsOf(contract).find(g => g.id === id);
const compact = (value: string): string => String(value || '').normalize('NFKC').replace(/\s+/g, '');
const CLAUSE_BREAK = /[，,。.！!？?；;：:“”"「」『』\n]/;
const UNCLEAR = /[？?]|(?:吗|呢)\s*$|如果|要是|假如|倘若|若是|要不要|是不是|并不是|并没有|才怪|不(?:要|用|会|能|想|肯|愿)|别|没(?:有|打算)/;

/** 依据所在分句本身要是肯定句（不是问句、假设、转述或否定）。 */
function clauseIsAffirmative(playerText: string, evidence: string, isUnclear: (text: string) => boolean): boolean {
  const hay = compact(playerText);
  const needle = compact(evidence);
  const start = hay.indexOf(needle);
  if (start < 0) return false;
  let from = start;
  while (from > 0 && !CLAUSE_BREAK.test(hay[from - 1])) from -= 1;
  let to = start + needle.length;
  while (to < hay.length && !CLAUSE_BREAK.test(hay[to])) to += 1;
  while (to < hay.length && /[？?！!。.]/.test(hay[to])) to += 1;
  return !isUnclear(hay.slice(from, to));
}

export interface ProposalResult {
  plan: ActionPlan | null;
  dropped: string[];
}

/**
 * 识别层（模型或规则）的提议 → 合法的行动计划。
 * 出现数字、难度、结果之类的字段整份丢弃；目标、要素、动词必须在白名单内；证据必须是玩家原话的子串且所在分句为肯定句。
 */
export function validateProposal(
  contract: Contract,
  state: SceneState,
  raw: any,
  playerText: string,
  settings: ResolvedSettings = resolveSettings(contract.settings),
  isUnclear: (text: string) => boolean = text => UNCLEAR.test(text),
): ProposalResult {
  const dropped: string[] = [];
  if (!raw || typeof raw !== 'object') return { plan: null, dropped: ['提议为空'] };
  const banned = Object.keys(raw).concat(Object.keys(raw.claim || {})).find(key => BANNED_KEYS.test(key));
  if (banned) return { plan: null, dropped: [`提议里出现了结算字段“${banned}”，整份丢弃`] };
  const goal = goalOf(contract, String(raw.goal || ''));
  if (goal && ((goal.availability?.fromBeat || 1) > state.beat || (goal.availability?.untilBeat ?? Infinity) < state.beat)) return { plan:null, dropped:['该目标不在当前阶段'] };
  if (!goal) return { plan: null, dropped: [`目标“${raw.goal}”不在本场目标里`] };
  const claim = raw.claim || raw;
  const magnitude = Math.min(3, Math.max(1, Math.round(Number(claim.magnitude) || 1))) as 1 | 2 | 3;
  const scope = ['single', 'group', 'all'].includes(claim.scope) ? claim.scope : 'single';
  const targets: string[] = [];
  for (const id of Array.isArray(claim.targets) ? claim.targets : []) {
    const party = partyOf(contract, String(id));
    if (!party) dropped.push(`目标“${id}”不在本场参与方里`);
    else if (!targets.includes(party.id)) targets.push(party.id);
  }
  const levers: PlanLever[] = [];
  for (const item of Array.isArray(raw.levers) ? raw.levers : []) {
    const element = contract.elements?.find(e => e.id === item?.element);
    const verb = element?.verbs?.find(v => v.id === item?.verb);
    if (!element || !verb) {
      dropped.push(`杠杆“${item?.element}/${item?.verb}”不在要素白名单里`);
      continue;
    }
    if (!item.evidence || compact(item.evidence).length < 2 || !compact(playerText).includes(compact(item.evidence))) {
      dropped.push(`杠杆“${element.label}”的依据不是玩家原话`);
      continue;
    }
    if (!clauseIsAffirmative(playerText, item.evidence, isUnclear)) {
      dropped.push(`杠杆“${element.label}”所在分句是问句、假设或否定`);
      continue;
    }
    if (element.actionPattern && !new RegExp(element.actionPattern).test(playerText)) { dropped.push(`杠杆“${element.label}”没有对应主动行为`); continue; }
    if (levers.some(l => l.element === element.id)) continue;
    if (levers.length >= settings.pricing.leverMax) {
      dropped.push(`杠杆“${element.label}”超出每拍 ${settings.pricing.leverMax} 个的上限`);
      continue;
    }
    levers.push({ element: element.id, verb: verb.id, evidence: String(item.evidence) });
  }
  const cash = (Array.isArray(raw.cash) ? raw.cash : []).map(String).filter((id: string) => state.tags.some(tag => tag.id === id));
  return { plan: { goal: goal.id, magnitude, scope, targets, levers, cash, text: playerText }, dropped };
}

// ---------- 原著锁 ----------

export function applyLocks(contract: Contract, plan: ActionPlan): { plan: ActionPlan; lock?: { id: string; reply: string; redirectTo?: string } } {
  const text = compact(plan.text || '');
  const hit = (contract.locks || []).find(lock => lock.matchHints.some(hint => text.includes(compact(hint))));
  if (!hit) return { plan };
  const redirected: ActionPlan = { ...plan };
  if (hit.redirectTo && goalOf(contract, hit.redirectTo)) redirected.goal = hit.redirectTo;
  return { plan: redirected, lock: { id: hit.id, reply: hit.reply, redirectTo: hit.redirectTo } };
}

// ---------- 落地与定价 ----------

export interface LeverEval {
  element: string;
  verb: string;
  label: string;
  elementKind: string;
  owner: string;
  power: number;
  ok: boolean;
  why?: string;
  creates?: string;
  related: boolean;
  oneShot: boolean;
}

export interface TargetEval {
  party: string;
  ref: string;
  track?: string;
  from: number;
  limit: number;
  claimed: number;
  realizable: number;
  blocked?: string;
  previewText?: string;
  clampText?: string;
}

export interface PlanEvaluation {
  plan: ActionPlan;
  goal: GoalDef;
  targets: TargetEval[];
  ignoredTargets: string[];
  levers: LeverEval[];
  cash: Array<{ tag: string; ok: boolean; bonus: number; why?: string }>;
  primary: string | null;
  difficulty: number;
  difficultyParts: { base: number; premium: number; pressure: number; resistance: number };
  modifier: number;
  modifierParts: { factors: number; levers: number; novelty: number; cash: number; status: number };
  mode: RollMode;
  grounded: boolean;
  odds: Record<TierId, number>;
  noveltyKey: string | null;
}

export function evaluatePlan(contract: Contract, state: SceneState, planIn: ActionPlan, ctx: SceneContext): PlanEvaluation {
  const settings = resolveSettings(contract.settings);
  const goal = goalOf(contract, planIn.goal);
  if (!goal) throw new Error(`场面合同 ${contract.meta.id} 没有目标 ${planIn.goal}`);
  const player = playerParty(contract);
  const playerId = player?.id || '';
  const plan: ActionPlan = { ...planIn, levers: planIn.levers.slice(), targets: planIn.targets.slice() };
  const pushGoal = (goal.type || 'push') === 'push';
  const kind = contract.meta.scene.kind;
  const cap = settings.attentionCap[kind] || settings.attentionCap.custom;

  // ---- 目标 ----
  const ignoredTargets: string[] = [];
  let candidates: string[] = plan.targets.slice();
  if (plan.scope === 'all' && pushGoal) {
    candidates = contract.parties.filter(p => p.side === 'opposed' && isPresent(state, p.id)).map(p => p.id);
  }
  const range = !!cap.rangeClaim && (plan.scope === 'group' || plan.scope === 'all');
  if (!range && candidates.length > cap.primaryTargets) {
    for (const extra of candidates.slice(cap.primaryTargets)) ignoredTargets.push(`${partyOf(contract, extra)?.ref || extra}：超出一次行动 ${cap.primaryTargets} 个主目标的上限`);
    candidates = candidates.slice(0, cap.primaryTargets);
  }
  const targets: TargetEval[] = [];
  for (const id of candidates) {
    const party = partyOf(contract, id);
    if (!party || !isPresent(state, id)) {
      ignoredTargets.push(`${party?.ref || id}：不在场`);
      continue;
    }
    if (!pushGoal) {
      targets.push({ party: id, ref: party.ref, from: 0, limit: 0, claimed: 0, realizable: 0 });
      continue;
    }
    const protectedSide = party.protected || party.side === 'player_side';
    const trackId = goal.track || party.tracks?.[0]?.track || party.tracks?.[0]?.id;
    const info = trackId ? trackInfo(contract, id, trackId) : undefined;
    if (protectedSide && !settings.allowPlayerHarmAllies) {
      targets.push({ party: id, ref: party.ref, track: trackId, from: 0, limit: 0, claimed: plan.magnitude, realizable: 0, blocked: '受保护的同伴，主张被拦下' });
      continue;
    }
    if (!info) {
      ignoredTargets.push(`${party.ref}：没有可推进的轨道`);
      continue;
    }
    const from = trackStep(state, id, info.id);
    if (goal.maxTargetGroups && from >= info.limit) continue;
    if (goal.maxTargetGroups) {
      const group = party.actionGroup || party.id;
      const groups = new Set(targets.map(t => { const p = partyOf(contract,t.party); return p?.actionGroup || t.party; }));
      if (!groups.has(group) && groups.size >= goal.maxTargetGroups) {
        ignoredTargets.push(`${party.ref}：一次行动最多解决 ${goal.maxTargetGroups} 组`);continue;
      }
    }
    targets.push({
      party: id, ref: party.ref, track: info.id, from, limit: info.limit, claimed: plan.magnitude,
      realizable: Math.max(0, Math.min(plan.magnitude, info.limit - from)),
      previewText: info.ending?.previewText, clampText: info.ending?.clampText,
    });
  }
  const primary = targets.find(t => !t.blocked)?.party ?? targets[0]?.party ?? null;

  // ---- 杠杆 ----
  const levers: LeverEval[] = [];
  const planElementIds = plan.levers.map(l => l.element);
  for (const item of plan.levers) {
    const element = contract.elements?.find(e => e.id === item.element);
    const verb = element?.verbs?.find(v => v.id === item.verb);
    const owner = element?.owner || playerId;
    const base = {
      element: item.element, verb: item.verb, label: element?.label || item.element, elementKind: element?.kind || '',
      owner, power: verb?.power ?? 0, creates: verb?.creates, related: false,
      oneShot: element?.uses === 1,
    };
    const fail = (why: string): void => { levers.push({ ...base, ok: false, why }); };
    if (!element || !verb) { fail('要素或动词不存在'); continue; }
    base.related = !verb.goalTags?.length || verb.goalTags.includes(goal.id) || goal.type === 'support';
    if (levers.filter(l => l.ok).length >= settings.pricing.leverMax) { fail(`超出每拍 ${settings.pricing.leverMax} 个杠杆的上限`); continue; }
    const why = whyNotLanded(contract, state, ctx, element, verb, goal, planElementIds, plan.cash || [], levers.filter(l => l.ok).map(l => l.element));
    if (why) { fail(why); continue; }
    levers.push({ ...base, ok: true });
  }
  const okLevers = levers.filter(l => l.ok);
  const grounded = okLevers.length > 0;
  for (const target of targets) {
    const entry = partyOf(contract, target.party)?.tracks?.find(t => (t.track || t.id) === target.track);
    if (entry?.requiresLever?.length && !okLevers.some(l => entry.requiresLever!.includes(l.element))) {
      target.blocked = '这条轨道需要指定的有效要素'; target.realizable = 0;
    }
    if (!target.blocked && goal.completeOnSuccess) target.realizable = Math.max(0, target.limit - target.from);
  }


  // ---- 态势兑现 ----
  const cash = (plan.cash || []).map(tagId => {
    const tag = state.tags.find(t => t.id === tagId);
    if (!tag) return { tag: tagId, ok: false, bonus: 0, why: '这个态势已经不在了' };
    return { tag: tagId, ok: true, bonus: tag.effect.cash ?? settings.pricing.tagCash };
  });

  // ---- 难度与加值 ----
  const primaryParty = primary ? partyOf(contract, primary) : undefined;
  const pressure = contract.beats?.[state.beat - 1]?.pressure ?? 0;
  const difficultyParts = {
    base: goal.baseDifficulty,
    premium: settings.pricing.premium[String(plan.magnitude)] ?? 0,
    pressure,
    resistance: pushGoal ? primaryParty?.resistance ?? 0 : 0,
  };
  const difficulty = difficultyParts.base + difficultyParts.premium + difficultyParts.pressure + difficultyParts.resistance;
  const noveltyKey = grounded ? okLevers.map(l => `${l.element}:${l.verb}`).sort().join('+') : null;
  const leverSum = Math.min(settings.pricing.leverCap, okLevers.reduce((sum, l) => sum + l.power, 0));
  const modifierParts = {
    factors: ctx.factors + (state.levels && playerId && primary ? levelModifier(state.levels[playerId],state.levels[primary]) : 0),
    levers: leverSum,
    novelty: noveltyKey && !state.noveltySeen.includes(noveltyKey) ? settings.pricing.novelty : 0,
    cash: cash.reduce((sum, c) => sum + (c.ok ? c.bonus : 0), 0),
    status: playerId ? statusRollModifier(state, contract, ctx, playerId, 'action') : 0,
  };
  const modifier = modifierParts.factors + modifierParts.levers + modifierParts.novelty + modifierParts.cash + modifierParts.status;

  // ---- 优势 / 劣势 ----
  const own = playerId ? statusMode(state, contract, ctx, playerId, 'action') : { advantage: false, disadvantage: false };
  const cashAdvantage = (plan.cash || []).some(id => state.tags.find(t => t.id === id)?.effect.advantage);
  const leverAdvantage = okLevers.length >= 2 && okLevers.some(l => l.related);
  const mode = rollMode(own.advantage || cashAdvantage || leverAdvantage, own.disadvantage);
  const odds = oddsFor({ modifier, difficulty, grounded, mode }, settings);

  return {
    plan, goal, targets, ignoredTargets, levers, cash, primary, difficulty, difficultyParts, modifier, modifierParts,
    mode, grounded, odds, noveltyKey,
  };
}

function whyNotLanded(
  contract: Contract, state: SceneState, ctx: SceneContext, element: ElementDef, verb: VerbDef, goal: GoalDef,
  planElementIds: string[], cashTags: string[], landedElements: string[],
): string | null {
  const av = element.availability;
  if (av?.fromBeat !== undefined && state.beat < av.fromBeat) return `第 ${av.fromBeat} 拍起才可用`;
  if (av?.untilBeat !== undefined && state.beat > av.untilBeat) return '已过了可用的拍';
  if (element.uses !== undefined && element.uses !== null && (state.leverUses[element.id] || 0) >= element.uses) return '已经用掉了';
  const owner = element.owner || playerParty(contract)?.id || '';
  if (owner) {
    if (!isPresent(state, owner)) return '使用者不在场';
    if (isDowned(state, contract, ctx, owner)) return '使用者已倒下';
    if (lockedBy(state, contract, ctx, owner, element)) return '被当前状态锁住（如兵器脱手）';
  }
  for (const other of Array.isArray(element.excludes) ? element.excludes : []) {
    if (landedElements.includes(other) || (state.leverUses[other] || 0) > 0) return `与“${contract.elements?.find(e => e.id === other)?.label || other}”互斥`;
  }
  if (verb.goalTags?.length && !verb.goalTags.includes(goal.id) && goal.type !== 'support') {
    return '这个动词对本次目标不起作用';
  }
  for (const need of Array.isArray(verb.requires) ? verb.requires : []) {
    const [kind, ref] = need.split(':');
    if (kind === 'tag') {
      if (!state.tags.some(tag => tag.id === ref) && !cashTags.includes(ref)) return `需要先铺好“${contract.tags?.find(t => t.id === ref)?.label || ref}”`;
    } else if (kind === 'lever') {
      if (!planElementIds.includes(ref)) return `需要同时用到“${contract.elements?.find(e => e.id === ref)?.label || ref}”`;
    } else if (kind === 'present') {
      if (!isPresent(state, ref)) return `需要“${partyOf(contract, ref)?.ref || ref}”在场`;
    } else return `前置条件“${need}”无法识别`;
  }
  return null;
}
