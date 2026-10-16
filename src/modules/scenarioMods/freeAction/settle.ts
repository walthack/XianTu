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
import { getJudgementState, verifyResolvedJudgementReceipt, type JudgementResolution } from '@/utils/judgementEngine';
import { getNarrativeTurn } from '@/utils/actionGate';
import { removeSceneInjury, sceneTime } from '../../sceneModule/host/injuries';
import { AFFINITY_TIERS, clampAffinity, stanceOf, tierOf } from '../affinityLadder';
import { affinityCapFor } from '../affinityCaps';
import { relationshipOf, runtimeEntityName } from '../ledger/affinityIdentity';
import npcProfiles from '../../../../mod-kit/entity-ledger/npc-profiles.json';
import { applyActorStatus } from './actorStatus';
import { withEncounteredTarget } from './encounter';
import { applyItemOnUse } from './itemUse';
import { checkGates, playerNameOf, transferRoom, targetNameOf, type FreeActionDeps, type GateOk } from './gates';
import { freeActionConfig, intimacyConfig, variantSpecOf, type VariantSpec } from './config';
import { factText, gateText, memoryText, protectedText, type FactSlots } from './facts';
import { pushLightMemory, pushMajorEpisode } from './memory';
import { protectedCapFor } from './protect';
import { noteSettled, readFreeActionState, runtimeOf, writableFreeActionState } from './state';
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

/** 好感写入：同一人同一回合只改一次；上限只限向上。 */
function writeAffinity(save: SaveData, targetId: string, delta: number, turn: number): { from: number; to: number; applied: boolean } {
  const runtime = runtimeOf(save), profile = relationshipOf(save as any, targetId)!.profile as any, from = Number(profile.好感度) || 0;
  const state = readFreeActionState(save);
  const already = state.affinityTurn[targetId] === turn
    || ((runtime.pendingLineAffinityGrants as Array<{ characterId?: string }> | undefined) || []).some(grant => grant.characterId === targetId);
  if (delta === 0 || already) return { from, to: from, applied: false };
  const cap = affinityCapFor(targetId, typeof profile.与玩家关系 === 'string' ? profile.与玩家关系 : undefined, runtimeEntityName(runtime, targetId))?.cap ?? 100;
  const to = clampAffinity(delta > 0 ? Math.max(from, Math.min(cap, from + delta)) : from + delta);
  profile.好感度 = to;
  writableFreeActionState(save).affinityTurn[targetId] = turn;
  return { from, to, applied: to !== from };
}

/** 结算入口：在场正典人物没有关系记录时先懒登记；这次没结算成（闸门不过、写入被拒、重放）就撤回。 */
export function settleFreeAction(save: SaveData, ticket: FreeActionTicket, resolution?: JudgementResolution, deps: SettleDeps = {}): SettleResult {
  return withEncounteredTarget(save, ticket.targetId, () => settleRegistered(save, ticket, resolution, deps), result => result.ok && !result.replay);
}

function settleRegistered(save: SaveData, ticket: FreeActionTicket, resolution: JudgementResolution | undefined, deps: SettleDeps): SettleResult {
  const spec = variantSpecOf(ticket.actionClass, ticket.variant);
  if (!spec || !spec.enabled || spec.route === 'none' || !ticket.targetId) return { ok: false, reason: 'disabled', facts: [] };
  const turn = getNarrativeTurn(save), key = `fa.${resolution?.id ?? `t${turn}`}.${ticket.targetId}.${ticket.variant}`;
  const prior = readFreeActionState(save).settled[key];
  if (prior) return { ok: true, replay: true, key, resultKey: prior.resultKey, facts: prior.facts };
  if (spec.route === 'judge' && (!resolution || resolution.status !== 'resolved' || !resolution.outcome)) return { ok: false, reason: 'unresolved', facts: [] };

  const gate = checkGates(save, ticket, deps);
  if (!gate.ok) return { ok: false, reason: gate.reason, key, facts: [gateText(gate.reason, gate.slots)] };

  const slots: FactSlots = { ...gate.slots, player: gate.slots.player || playerNameOf(save), target: gate.slots.target || targetNameOf(save, ticket.targetId) };
  const planned = plan(save, ticket, gate, resolution, key, slots, deps);
  if (!planned.apply()) return { ok: false, reason: 'refused_by_state', key, facts: [gateText('state_refused', slots)] };

  const resultKey = planned.resultKey, runtime = runtimeOf(save), cfg = freeActionConfig();
  const affinity = writeAffinity(save, ticket.targetId, planned.delta, turn);
  const major = Math.abs(planned.delta) >= cfg.affinity.majorAbs;
  const text = memoryText(spec.variant, resultKey, slots);
  pushLightMemory(save, ticket.targetId, text);
  if (major) {
    pushMajorEpisode(save, ticket.targetId, {
      id: `memory.free.${key}`, eventId: 'free_action', summary: text,
      tags: [`free:${spec.actionClass}.${spec.variant}`, 'major_episode', `receipt:${key}`],
      salience: cfg.affinity.majorSalienceFloor, occurredAtTurn: turn,
    });
  }
  if (affinity.applied) {
    (runtime.pendingLineAffinityGrants ||= []).push({
      characterId: ticket.targetId, from: affinity.from, to: affinity.to, weightId: `free.${spec.variant}`,
      receiptId: key, name: slots.target,
    });
  }
  const facts = [factText(spec.variant, resultKey, slots), ...planned.extraFacts];
  const state = writableFreeActionState(save);
  state.log.push({ key, turn, actionClass: spec.actionClass, variant: spec.variant, targetId: ticket.targetId, resultKey, delta: planned.delta, major });
  state.log = state.log.slice(-cfg.state.logKeep);
  state.focus = { turn, targetIds: [...new Set([...(state.focus?.turn === turn ? state.focus.targetIds : []), ticket.targetId])] };
  noteSettled(state, key, { facts, resultKey });
  return { ok: true, key, resultKey, facts, affinity: { ...affinity, delta: planned.delta }, major };
}

/** 判定确认后：票取自判定回执（不重跑 intent），回执必须与判定账本一致。 */
export function ticketFromResolution(save: SaveData, resolution: JudgementResolution | null | undefined): FreeActionTicket | null {
  const trusted = verifyResolvedJudgementReceipt(save, resolution);
  const receipt = trusted?.authorityReceipt;
  if (!trusted || receipt?.kind !== 'free_action_judgement') return null;
  return {
    actionClass: receipt.actionClass, variant: receipt.variant, targetId: receipt.targetId, degree: receipt.degree,
    performed: 'yes', evidence: '', itemId: receipt.itemId,
  };
}

export function settleFromResolution(save: SaveData, resolution: JudgementResolution | null | undefined, deps: SettleDeps = {}): SettleResult | null {
  const ticket = ticketFromResolution(save, resolution);
  if (!ticket) return null;
  const trusted = getJudgementState(save).recent.find(item => item.id === resolution!.id)!;
  return settleFreeAction(save, ticket, trusted, deps);
}
