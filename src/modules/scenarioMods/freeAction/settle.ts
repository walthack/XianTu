/**
 * 自由行动结算：一个函数 settleFreeAction，先闸门、再算出全部结果、最后一次写完。
 * 好感（±perBeatCap 钳制、上限只限向上）、NPC 记忆（轻记忆 + ≥majorAbs 的大事 episode）、物品消耗、状态、冷却/预算、
 * 玩家可见的 grant、幂等键，全在这里；叙事模型只拿到返回的“既定事实”去演。
 *
 * 路由（代码只认类的路由家族与有限的 effect 种类，不认变体名）：
 *   judge：玩家已确认的判定回执（resolution.outcome）决定结果档；table：不掷骰，按好感档/阶段门/气质或物品效果查表。
 * 必须活着的保护只在自由行动路径里生效（经 protect.ts）；剧情合同安排的死亡不受它限制。
 */
import type { SaveData } from '@/types/game';
import { applyDeterministicEffects, getJudgementState, verifyResolvedJudgementReceipt, type JudgementResolution } from '@/utils/judgementEngine';
import { getNarrativeTurn } from '@/utils/actionGate';
import { removeSceneInjury, sceneTime } from '../../sceneModule/host/injuries';
import { AFFINITY_TIERS, clampAffinity, stanceOf, tierOf } from '../affinityLadder';
import { affinityCapFor } from '../affinityCaps';
import { relationshipOf, runtimeEntityName } from '../ledger/affinityIdentity';
import { drainedRealm } from '../levelProgression';
import npcProfiles from '../../../../mod-kit/entity-ledger/npc-profiles.json';
import { applyActorStatus } from './actorStatus';
import { withEncounteredTarget } from './encounter';
import { applyItemOnUse } from './itemUse';
import { checkGates, drainPlan, drainSelfCost, playerNameOf, transferRoom, targetNameOf, type FreeActionDeps, type GateOk } from './gates';
import { freeActionConfig, intimacyConfig, selfBuffOf, variantSpecOf, type VariantSpec } from './config';
import { affinityNoteText, aftermathHpText, factText, gateText, memoryText, protectedText, type FactSlots } from './facts';
import { failureAftermathEffects, selfBuffEffect } from './outcomeEffects';
import { pushLightMemory, pushMajorEpisode } from './memory';
import { lethalForbidden, protectedCapFor } from './protect';
import { noteDrain } from './playerTextDebug';
import { logGateRefusal } from './refusalLog';
import { affinityBeatTaken, noteSettled, readFreeActionState, runtimeOf, writableFreeActionState } from './state';
import type { FreeActionTicket } from './ticket';
import { playerIdOf } from './ticket';

export interface SettleResult {
  ok: boolean;
  /** 同一幂等键已结算过：原样返回当时的事实，不再写。 */
  replay?: boolean;
  /** ok=false 时：闸门原因（GateReason）或 unresolved / disabled。 */
  reason?: string;
  key?: string;
  resultKey?: string;
  facts: string[];
  affinity?: { from: number; to: number; delta: number; applied: boolean };
  major?: boolean;
}

export interface NpcProfile { id: string; temperament?: string; intimacyGate?: { minTier?: string; afterEventId?: string } }
export interface SettleDeps extends FreeActionDeps { npcProfiles?: NpcProfile[] }

const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));
const beatClamp = (value: number): number => clamp(Math.round(value), -freeActionConfig().affinity.perBeatCap, freeActionConfig().affinity.perBeatCap);
const tierIndex = (id: string): number => AFFINITY_TIERS.findIndex(tier => tier.id === id);

/** 亲近类：好感档 × 阶段门 × 气质 → 反应。没有人物条目的人用默认（宁严勿松）。 */
function intimateReaction(save: SaveData, ticket: FreeActionTicket, spec: VariantSpec, deps: SettleDeps): { reaction: string; delta: number } {
  const cfg = intimacyConfig()!, targetId = ticket.targetId!;
  const profile = (deps.npcProfiles ?? (npcProfiles.profiles as NpcProfile[])).find(row => row.id === targetId);
  const favor = Number((relationshipOf(save as any, targetId)!.profile as any).好感度) || 0;
  const gateTier = profile?.intimacyGate?.minTier ?? cfg.defaultGateTier, after = profile?.intimacyGate?.afterEventId;
  const eventDone = !after || ((runtimeOf(save)?.completedEventIds as string[] | undefined) || []).includes(after);
  const open = tierIndex(tierOf(favor).id) >= tierIndex(gateTier) && eventDone;
  const temperament = profile?.temperament ?? cfg.defaultTemperament;
  const base = spec.matrix![stanceOf(favor)][open ? 'open' : 'closed'];
  const reaction = cfg.temperamentRemap[temperament]?.[base] ?? base;
  return { reaction, delta: cfg.reactionEffect[reaction].delta };
}

function consumeItem(save: SaveData, itemId: string, count: number): void {
  const items = (save as any).角色.背包.物品;
  const key = Object.keys(items).find(k => (items[k]?.物品ID || k) === itemId)!;
  items[key].数量 -= count;
  if (items[key].数量 <= 0) delete items[key];
}

function giveToNpc(save: SaveData, targetId: string, itemId: string): void {
  const items = (save as any).角色.背包.物品;
  const source = items[Object.keys(items).find(k => (items[k]?.物品ID || k) === itemId)!];
  const profile = relationshipOf(save as any, targetId)!.profile as any;
  const pack = (profile.背包 ||= {}).物品 ||= {};
  if (pack[itemId]) pack[itemId].数量 = (Number(pack[itemId].数量) || 0) + 1;
  else {
    const copy = structuredClone(source);
    delete copy.已装备;
    delete copy.槽位;
    pack[itemId] = { ...copy, 数量: 1 };
  }
}

function payCost(save: SaveData, spec: VariantSpec, outcome: string | undefined): void {
  if (!spec.cost) return;
  const resource = (save as any).角色.属性[spec.cost.resource];
  const ratio = outcome === 'critical_failure' ? spec.cost.criticalFailureRatio : spec.cost.onResolveRatio;
  resource.当前 = Math.max(0, Number(resource.当前) - Math.round(Number(resource.上限) * ratio));
}

interface Planned { resultKey: string; delta: number; extraFacts: string[]; apply: () => boolean }

/**
 * 夺取类：先吸目标灵气、灵气吸空后再吸气血（gates.ts drainPlan，闸门同一个函数；气血最多吸到 drain.hpFloor）；
 * 吸到的量按 drain.gain 补给玩家灵气，并折成玩家修炼进度（drainedRealm，满了按现有小阶段升级逻辑结算）；不再扣目标的境界进度。
 * 目标已在 hpFloor 再吸 = 吸到对方倒下：不再要玩家确认，目标不是必须活着的角色就直接结算，
 * 气血归零并挂 drain.lethalStatus（只落成状态，不写 dead / missing / departed，见 actorStatus.ts）；必须活着的角色闸门已拒绝（drain_survivor）。
 * 每次施行结算成功后记一条后台日志（playerTextDebug.noteDrain）。
 * 每次施行先扣玩家气血（上限 × drain.selfCostHpRatio，闸门已保证付得起），无冷却。好感走 base × 轻重 × 敌意结果系数，和攻击同一条路径（beatClamp）。
 * 吸取量 = drainPlan(scale = 轻重 × 结果档系数 × 递减)；递减按目标记次数，随时间恢复。吸到 0 = 无所获：不挂状态、不记次数，事实取 failure 档。
 */
function planDrain(save: SaveData, ticket: FreeActionTicket, spec: VariantSpec, outcome: NonNullable<JudgementResolution['outcome']>, key: string, slots: FactSlots): Planned {
  const cfg = freeActionConfig(), drain = spec.drain!, targetId = ticket.targetId!, degree = cfg.degreeFactor[ticket.degree], now = sceneTime(save);
  const ledger = readFreeActionState(save).drainLedger[targetId];
  const effCount = ledger ? Math.max(0, ledger.count - Math.floor((now - ledger.lastAt) / drain.diminish.recoverMinutes)) : 0;
  const diminish = Math.max(drain.diminish.floor, Math.pow(drain.diminish.perUse, effCount));
  const wanted = drainPlan(save, targetId, spec, degree * drain.outcomeFactor[outcome] * diminish);
  const kills = wanted.lethal && !lethalForbidden(targetId);
  const qi = wanted.qi, hp = wanted.lethal && !kills ? 0 : wanted.hp, taken = qi + hp;
  const gainQi = Math.round(taken * drain.gain.qiPerPoint), nextRealm = drainedRealm(save, Math.round(taken * drain.gain.progressPerPoint));
  const drained = taken > 0 || drain.outcomeFactor[outcome] <= 0;
  const resultKey = kills ? 'drained_lethal' : spec.npcOutcomes![drained ? outcome : 'failure'];
  const backlash = outcome === 'critical_failure' ? spec.backlash?.critical_failure : undefined, selfCost = drainSelfCost(save, spec);
  const realmNow = (save as any).角色.属性.境界, advanced = Boolean(nextRealm && nextRealm.阶段 !== realmNow.阶段);
  const qiSlots = { ...slots, amount: String(qi) }, hpSlots = { ...slots, amount: String(hp) };
  const write = (): boolean => {
    // 最可能被拒的先写：玩家反噬 → 目标状态（含致死状态）→ 目标灵气 / 气血 → 账 → 玩家灵气与修炼进度。
    if (backlash && !applyActorStatus(save, playerIdOf(save)!, backlash, { sourceId: key }).ok) return false;
    if (taken > 0) for (const id of drain.afterStatuses) if (!applyActorStatus(save, targetId, id, { sourceId: key, minutes: drain.statusMinutes[id] }).ok) return false;
    if (kills && !applyActorStatus(save, targetId, drain.lethalStatus, { sourceId: key, minutes: null }).ok) return false;
    const theirs = (relationshipOf(save as any, targetId)!.profile as any).属性;
    if (qi > 0) theirs.灵气.当前 = Math.max(0, Number(theirs.灵气.当前) - qi);
    if (hp > 0) theirs.气血.当前 = Math.max(0, Number(theirs.气血.当前) - hp);
    const state = writableFreeActionState(save);
    if (taken > 0) state.drainLedger[targetId] = { count: effCount + 1, lastAt: now };
    const mine = (save as any).角色.属性.灵气;
    if (gainQi > 0 && Number(mine?.上限) > 0) mine.当前 = Math.min(Number(mine.上限), (Number(mine.当前) || 0) + gainQi);
    if (nextRealm) (save as any).角色.属性.境界 = nextRealm;
    return true;
  };
  return {
    resultKey, delta: beatClamp((spec.base ?? 0) * degree * (spec.outcomeFactor?.[outcome] ?? 1)),
    extraFacts: [
      factText(spec.variant, 'self_cost', slots),
      ...(qi > 0 ? [factText(spec.variant, 'took_qi', qiSlots)] : []), ...(hp > 0 ? [factText(spec.variant, 'took_hp', hpSlots)] : []),
      ...(advanced ? [factText(spec.variant, 'realm_up', { ...slots, label: String(nextRealm.阶段) })] : []),
      ...(backlash ? [factText(spec.variant, 'backlash', slots)] : []),
    ],
    apply: () => {
      // 先扣玩家气血（不论结果档）；后面的写入被状态拒绝就原样退回。
      const hpNow = (save as any).角色.属性.气血, hpBefore = Number(hpNow.当前);
      hpNow.当前 = hpBefore - selfCost;
      if (write()) { noteDrain({ actor: slots.player, target: slots.target, qi, hp, dying: kills }); return true; }
      hpNow.当前 = hpBefore;
      return false;
    },
  };
}

/** 算出本次的结果与“怎么写”，不改存档；apply() 里才写，且按“最可能失败的先写”排序。 */
function plan(save: SaveData, ticket: FreeActionTicket, gate: GateOk, resolution: JudgementResolution | undefined, key: string, slots: FactSlots, deps: SettleDeps): Planned {
  const spec = gate.spec, cfg = freeActionConfig(), targetId = ticket.targetId!, degree = cfg.degreeFactor[ticket.degree];
  const outcome = resolution?.outcome;
  const factor = outcome && spec.outcomeFactor ? spec.outcomeFactor[outcome] : 1;
  const base = spec.base ?? 0;
  const none = (): boolean => true;

  // 亲近：查表
  if (spec.matrix) {
    const { reaction, delta } = intimateReaction(save, ticket, spec, deps);
    return { resultKey: reaction, delta, extraFacts: [], apply: none };
  }

  // 自身增益（双修的阴阳调和）：判定档决定事实与有没有增益，增益写在玩家身上；好感照 base × 轻重 × 结果系数（base 为 0 就不动）。
  if (spec.effect === 'selfBuff' && spec.npcOutcomes && outcome) {
    const buff = selfBuffEffect(save, selfBuffOf(spec), outcome);
    return {
      resultKey: spec.npcOutcomes[outcome], delta: beatClamp(base * degree * factor), extraFacts: buff ? [factText(spec.variant, 'buff', slots)] : [],
      apply: () => { if (buff) applyDeterministicEffects(save, [buff]); return true; },
    };
  }

  // 夺取类（drainProgress）——对方已设防失效（gates.ts 闸门）才走到这里；必须排在下面的敌意分支之前，否则会被它的空 apply 截走。
  if (spec.effect === 'drainProgress' && spec.npcOutcomes && outcome) return planDrain(save, ticket, spec, outcome, key, slots);

  // 敌意（肢体/言语）：判定结果档决定事实，好感按 base × 轻重 × 结果系数
  if (spec.npcOutcomes && outcome) {
    let resultKey = spec.npcOutcomes[outcome];
    const extraFacts: string[] = [];
    const capped = protectedCapFor(targetId, spec, resultKey);
    if (capped) { resultKey = capped; extraFacts.push(protectedText(slots)); }
    return { resultKey, delta: beatClamp(base * degree * factor), extraFacts, apply: none };
  }

  const itemId = ticket.itemId;
  const consume = (): void => { if (spec.needsItem && itemId) consumeItem(save, itemId, spec.consume ?? 1); };

  if (spec.effect === 'transferItem') {
    return { resultKey: 'done', delta: beatClamp(base * degree), extraFacts: [], apply: () => { giveToNpc(save, targetId, itemId!); consume(); return true; } };
  }

  if (spec.effect === 'practiceProgress') {
    const room = transferRoom(save, targetId, spec);
    const gain = clamp(Math.round(spec.gain!.base * degree * factor), 0, Math.min(spec.gain!.perTransferCap, room));
    const backlash = outcome === 'failure' || outcome === 'critical_failure' ? spec.backlash?.[outcome] : undefined;
    return {
      resultKey: gain > 0 ? 'gain' : 'no_gain', delta: beatClamp(base * degree * factor),
      extraFacts: backlash ? [factText(spec.variant, 'backlash', slots)] : [],
      apply: () => {
        if (backlash && !applyActorStatus(save, playerIdOf(save)!, backlash, { sourceId: key }).ok) return false;
        const realm = (relationshipOf(save as any, targetId)!.profile as any).境界;
        realm.当前进度 = (Number(realm.当前进度) || 0) + gain;
        const state = writableFreeActionState(save), phase = `${realm.名称}/${realm.阶段}`, prior = state.transferBudget[targetId];
        state.transferBudget[targetId] = { phase, used: (prior && prior.phase === phase ? prior.used : 0) + gain };
        state.cooldowns[`${spec.variant}:${targetId}`] = sceneTime(save);
        payCost(save, spec, outcome);
        return true;
      },
    };
  }

  if (spec.effect === 'removeStatus') {
    const worked = factor > 0 && gate.treat;
    const downgrade = worked ? spec.downgrade?.[gate.treat!.row.statusId] : undefined;
    return {
      resultKey: worked ? (downgrade ? 'done_downgraded' : 'done') : 'failed', delta: beatClamp(base * degree * factor), extraFacts: [],
      apply: () => {
        if (worked && !removeSceneInjury(save, { actorId: targetId }, gate.treat!.row.statusId, 'item', gate.treat!.tag)) return false;
        if (downgrade && !applyActorStatus(save, targetId, downgrade, { sourceId: key }).ok) return false;
        consume();
        return true;
      },
    };
  }

  // 护卫：只给被护者挂限时状态（状态 id 与时长来自变体行）。与必须活着保护（protect.ts）是两套机制，本版不读这个状态改任何结算。
  if (spec.effect === 'applyStatus') {
    return {
      resultKey: 'done', delta: beatClamp(base * degree), extraFacts: [],
      apply: () => applyActorStatus(save, targetId, spec.statusId!, { sourceId: key, minutes: spec.maxStatusMinutes }).ok,
    };
  }

  // itemDefined：喂药 / 下毒共用一套结算，差别只来自物品效果标签
  const item = gate.item!;
  if (gate.toxic || item.onUse.length) {
    const outcomes: ReturnType<typeof applyItemOnUse> = [];
    return {
      get resultKey() {
        if (!gate.toxic) return 'sedative_done';
        if (outcomes.some(r => r.lethal)) return 'toxic_dying';
        return outcomes.some(r => r.counter && r.counter.floor > 0 && r.counter.after <= r.counter.floor) ? 'toxic_floor' : 'toxic_done';
      },
      delta: beatClamp((gate.toxic ? spec.toxicBase ?? 0 : base) * degree), extraFacts: [],
      apply: () => {
        outcomes.push(...applyItemOnUse(save, targetId, itemId!, key));
        if (outcomes.some(r => !r.ok)) return false;
        consume();
        return true;
      },
    };
  }
  return {
    resultKey: 'benefit_done', delta: beatClamp(base * degree), extraFacts: [],
    apply: () => {
      if (gate.treat && !removeSceneInjury(save, { actorId: targetId }, gate.treat.row.statusId, 'item', gate.treat.tag)) return false;
      consume();
      return true;
    },
  };
}

/**
 * 基础值（plan 算出）→ 实际要写的好感变化：
 *   1. 正向按“目标:行动类”窗口内的次数乘 affinity.repeat.factors（敌意不递减）；
 *   2. 递减后的基础值为 0 就是 0，不看票上的浮动位（被拒、没做成、失败的基础值本来就是 0）；
 *   3. 否则票上的浮动位在 [基础 − floatBand, 基础 + floatBand] 内采纳，再钳到单拍上限。
 */
function shapeDelta(save: SaveData, ticket: FreeActionTicket, base: number, now: number): { delta: number; worn: boolean; group: string; used: number; since: number } {
  const { floatBand, repeat } = freeActionConfig().affinity, group = `${ticket.targetId}:${ticket.actionClass}`;
  const ledger = readFreeActionState(save).repeatLedger[group];
  const inWindow = ledger !== undefined && now - ledger.since < repeat.windowMinutes, used = inWindow ? ledger.count : 0, since = inWindow ? ledger.since : now;
  const effective = base > 0 ? beatClamp(base * repeat.factors[Math.min(used, repeat.factors.length - 1)]) : base;
  const worn = base > 0 && effective === 0;
  if (effective === 0 || ticket.affinityDelta === undefined) return { delta: effective, worn, group, used, since };
  return { delta: beatClamp(clamp(ticket.affinityDelta, effective - floatBand, effective + floatBand)), worn, group, used, since };
}

/** 好感写入：同一人同一回合只改一次（blocked = 这一拍已被动过）；上限只限向上。 */
function writeAffinity(save: SaveData, targetId: string, delta: number, turn: number): { from: number; to: number; applied: boolean; blocked: boolean } {
  const profile = relationshipOf(save as any, targetId)!.profile as any, from = Number(profile.好感度) || 0;
  const blocked = affinityBeatTaken(save, targetId, turn);
  if (delta === 0 || blocked) return { from, to: from, applied: false, blocked };
  const cap = affinityCapFor(targetId, typeof profile.与玩家关系 === 'string' ? profile.与玩家关系 : undefined, runtimeEntityName(runtimeOf(save), targetId))?.cap ?? 100;
  const to = clampAffinity(delta > 0 ? Math.max(from, Math.min(cap, from + delta)) : from + delta);
  profile.好感度 = to;
  writableFreeActionState(save).affinityTurn[targetId] = turn;
  return { from, to, applied: to !== from, blocked };
}

/** 结算入口：在场正典人物没有关系记录时先懒登记；这次没结算成（闸门不过、写入被拒、重放）就撤回。 */
export function settleFreeAction(save: SaveData, ticket: FreeActionTicket, resolution?: JudgementResolution, deps: SettleDeps = {}): SettleResult {
  return withEncounteredTarget(save, ticket.targetId, () => settleRegistered(save, ticket, resolution, deps), result => result.ok && !result.replay);
}

/**
 * 判定非成功档的余波（combat 类扣气血、行动门控）：旧引擎对 free_action 回执不再写（见 judgementEngine），由这里落账，数值全在配置 freeAction.aftermath。
 * 只在判定路由且已结算成功时调用；幂等键拦住重放，所以只写一次。返回给叙事的事实行（扣了气血才有）。
 */
function writeAftermath(save: SaveData, resolution: JudgementResolution | undefined, slots: FactSlots): string[] {
  if (!resolution?.outcome) return [];
  const effects = failureAftermathEffects(save, { kind: resolution.kind, actionText: resolution.actionText, target: resolution.target, outcome: resolution.outcome, turn: resolution.resolvedAtTurn });
  applyDeterministicEffects(save, effects);
  const hp = effects.find(effect => effect.key === '角色.属性.气血.当前');
  return hp ? [aftermathHpText({ ...slots, amount: String(Math.abs(Number(hp.value))) })] : [];
}

/**
 * 无对象的票（自修、场面）：旧引擎在确认判定时已按 kind 落账境界进度与自修回血；失败余波（气血、行动门控）由这里写。并给叙事一行按结果档取的既定事实。
 * 不写好感、记忆、重复账，也不回头过闸门（落账之后境界已变，再试算会把已发生的事判成“没发生”）。
 */
function settleTargetless(save: SaveData, spec: VariantSpec, resolution: JudgementResolution, key: string, turn: number): SettleResult {
  const outcome = resolution.outcome!, slots = { player: playerNameOf(save), target: '' };
  const facts = [factText(spec.variant, outcome, slots), ...writeAftermath(save, resolution, slots)];
  const state = writableFreeActionState(save);
  state.log.push({ key, turn, actionClass: spec.actionClass, variant: spec.variant, targetId: null, resultKey: outcome, delta: 0, major: false });
  state.log = state.log.slice(-freeActionConfig().state.logKeep);
  noteSettled(state, key, { facts, resultKey: outcome });
  return { ok: true, key, resultKey: outcome, facts };
}

function settleRegistered(save: SaveData, ticket: FreeActionTicket, resolution: JudgementResolution | undefined, deps: SettleDeps): SettleResult {
  const spec = variantSpecOf(ticket.actionClass, ticket.variant);
  if (!spec || !spec.enabled || spec.route === 'none' || (!ticket.targetId && spec.target !== 'none')) return { ok: false, reason: 'disabled', facts: [] };
  const turn = getNarrativeTurn(save), key = `fa.${resolution?.id ?? `t${turn}`}.${ticket.targetId ?? spec.actionClass}.${ticket.variant}`;
  const prior = readFreeActionState(save).settled[key];
  if (prior) return { ok: true, replay: true, key, resultKey: prior.resultKey, facts: prior.facts };
  if (spec.route === 'judge' && (!resolution || resolution.status !== 'resolved' || !resolution.outcome)) return { ok: false, reason: 'unresolved', facts: [] };
  if (spec.target === 'none') return settleTargetless(save, spec, resolution!, key, turn);
  const targetId = ticket.targetId!; // 有对象的变体：缺 targetId 的票上面已按 disabled 退回

  const gate = checkGates(save, ticket, deps);
  if (!gate.ok) {
    logGateRefusal(gate.reason, 'settle', ticket);
    return { ok: false, reason: gate.reason, key, facts: [gateText(gate.reason, gate.slots, spec.variant)] };
  }

  const slots: FactSlots = { ...gate.slots, player: gate.slots.player || playerNameOf(save), target: gate.slots.target || targetNameOf(save, targetId) };
  const planned = plan(save, ticket, gate, resolution, key, slots, deps);
  if (!planned.apply()) {
    logGateRefusal('state_refused', 'settle', ticket);
    return { ok: false, reason: 'refused_by_state', key, facts: [gateText('state_refused', slots, spec.variant)] };
  }
  const aftermath = writeAftermath(save, resolution, slots);

  const resultKey = planned.resultKey, runtime = runtimeOf(save), cfg = freeActionConfig(), now = sceneTime(save);
  const shaped = shapeDelta(save, ticket, planned.delta, now);
  const affinity = writeAffinity(save, targetId, shaped.delta, turn);
  // 大事看实际生效的变化：同拍被拦、被上限卡住都不算。
  const major = affinity.applied && Math.abs(affinity.to - affinity.from) >= cfg.affinity.majorAbs;
  if (planned.delta > 0 && !affinity.blocked) {
    writableFreeActionState(save).repeatLedger[shaped.group] = { count: Math.min(shaped.used + 1, cfg.affinity.repeat.factors.length), since: shaped.since };
  }
  // 好感没涨的原因交给叙事（不然会把关系写得更近）：重复到 0 / 已到上限。
  const notes = shaped.worn ? [affinityNoteText('worn', slots)]
    : shaped.delta > 0 && !affinity.blocked && affinity.to < affinity.from + shaped.delta ? [affinityNoteText('capped', slots)] : [];
  const text = memoryText(spec.variant, resultKey, slots);
  pushLightMemory(save, targetId, text);
  if (major) {
    pushMajorEpisode(save, targetId, {
      id: `memory.free.${key}`, eventId: 'free_action', summary: text,
      tags: [`free:${spec.actionClass}.${spec.variant}`, 'major_episode', `receipt:${key}`],
      salience: cfg.affinity.majorSalienceFloor, occurredAtTurn: turn,
    });
  }
  if (affinity.applied) {
    (runtime.pendingLineAffinityGrants ||= []).push({
      characterId: targetId, from: affinity.from, to: affinity.to, weightId: `free.${spec.variant}`,
      receiptId: key, name: slots.target,
    });
  }
  const facts = [factText(spec.variant, resultKey, slots), ...planned.extraFacts, ...aftermath, ...notes];
  const state = writableFreeActionState(save);
  state.log.push({ key, turn, actionClass: spec.actionClass, variant: spec.variant, targetId: targetId, resultKey, delta: shaped.delta, major });
  state.log = state.log.slice(-cfg.state.logKeep);
  state.focus = { turn, targetIds: [...new Set([...(state.focus?.turn === turn ? state.focus.targetIds : []), targetId])] };
  noteSettled(state, key, { facts, resultKey });
  return { ok: true, key, resultKey, facts, affinity: { from: affinity.from, to: affinity.to, applied: affinity.applied, delta: shaped.delta }, major };
}

/** 判定确认后：票取自判定回执（不重跑 intent），回执必须与判定账本一致。 */
export function ticketFromResolution(save: SaveData, resolution: JudgementResolution | null | undefined): FreeActionTicket | null {
  const trusted = verifyResolvedJudgementReceipt(save, resolution);
  const receipt = trusted?.authorityReceipt;
  if (!trusted || receipt?.kind !== 'free_action_judgement') return null;
  return {
    actionClass: receipt.actionClass, variant: receipt.variant, targetId: receipt.targetId, degree: receipt.degree,
    performed: 'yes', evidence: '', itemId: receipt.itemId,
    ...(receipt.affinityDelta !== undefined ? { affinityDelta: receipt.affinityDelta } : {}),
  };
}

export function settleFromResolution(save: SaveData, resolution: JudgementResolution | null | undefined, deps: SettleDeps = {}): SettleResult | null {
  const ticket = ticketFromResolution(save, resolution);
  if (!ticket) return null;
  const trusted = getJudgementState(save).recent.find(item => item.id === resolution!.id)!;
  return settleFreeAction(save, ticket, trusted, deps);
}
