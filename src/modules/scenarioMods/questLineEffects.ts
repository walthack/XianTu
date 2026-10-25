/**
 * 任务线效果结算（从冻结的 runtime.ts settleOptionalLine 迁出，2026-10-19 用户批准的小批解冻）。
 * runtime 只调用一次 settleQuestLineEffects，并把“物品 / 记忆 / 知识 / 回执”这组完成效果的落账函数传进来
 * （applyStoryEventOutcomeEffects 仍在 runtime 内，这里不复制它）。
 *
 * - 写入前先整体校验引用的资源，任何一项不合法就整次不写。
 * - kind==='ending'：任务线（人物线）的结局只记角色归宿，写进 questLineState.actorResolutions，并关掉这条线；
 *   不写 gameOver。整局结束只有主角死亡或走到主线结局（用户定，2026-10-19）。
 * - 新效果种类的扩展点：LINE_EFFECT_HANDLERS。势力声望 / 货币 / 路线解锁三种只预留类型名（RESERVED_LINE_EFFECT_KINDS），这轮不实现：
 *   questLines 的效果白名单也没收这三种，内容里写了在解析时就报错；没有处理器的种类在结算前校验时同样报错，不会被静默吞掉。
 *   接入一种新效果 = 在 questLines 效果白名单登记字段 + 在这里加 {validate, apply} 处理器（数值走配置）。
 * - 数值全部读配置：单次好感上限 freeAction.affinity.perBeatCap；重大回应门槛与显著度下限 lineBonds.majorResponse。
 */
import type { SaveData } from '@/types/game';
import type { ScenarioModEvent, ScenarioPlayerCompletionEffects } from './schema';
import type { ScenarioInventorySettlement } from './inventoryTransactions';
import type { RuntimeState } from './runtime';
import { LINE_RESOURCES, lineText, settleLineInsertion, type ActorResolution, type LineEffect, type LineState, type QuestLine } from './questLines';
import { questLineOffer } from './questLineContext';
import { relationshipOf, runtimeEntityName } from './ledger/affinityIdentity';
import { affinityCapFor } from './affinityCaps';
import { clampAffinity } from './affinityLadder';
import { namedEntity } from './namedEntities';
import statusCatalog from '../sceneModule/contracts/statuses.json';
import { toPlayerStatusEffect } from '../sceneModule/statusAdapters';
import { injuryStore, renderInjuryViews, sceneTime } from '../sceneModule/host/injuries';
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { applyGrantRule, revokePlayerIdentity, type LedgerOpContext, type PlayerIdentityLedger } from './identityLedger';
import { playerIdentityDef } from './playerLedgerRules';

export type { ActorResolution };

/** 预留的效果种类（只搭结构，这轮没有处理器）。 */
export const RESERVED_LINE_EFFECT_KINDS = ['factionReputation', 'currency', 'routeUnlock'] as const;

interface EffectContext {
  save: SaveData; r: RuntimeState; event: ScenarioModEvent; actionId: string; receiptId: string;
  line: QuestLine; beatObjective: string; hostDelta?: number; majorResponse: boolean;
  effects: ScenarioPlayerCompletionEffects; changes: any[]; state: LineState;
}
type Handler = { validate?: (e: any, ctx: EffectContext) => void; apply: (e: any, ctx: EffectContext) => void };

const numbers = () => GAME_NUMBERS as any;
/** 单次任务线好感变化的上下限（freeAction.affinity.perBeatCap）。 */
export function clampLineAffinityDelta(value: number): number {
  const cap = Number(numbers().freeAction.affinity.perBeatCap);
  return Number.isFinite(value) ? Math.max(-cap, Math.min(cap, value)) : 0;
}

/** runtime.playerIdentities（类型不进冻结的 RuntimeState，局部收窄）；缺失时新建。 */
function identityLedgerOf(r: RuntimeState): PlayerIdentityLedger {
  const rt = r as { playerIdentities?: PlayerIdentityLedger };
  return (rt.playerIdentities && typeof rt.playerIdentities === 'object') ? rt.playerIdentities : (rt.playerIdentities = {});
}
const identityOpContext = (c: EffectContext): LedgerOpContext => ({ stageId: (c.r as { modId?: string }).modId, worldTurn: Number(c.r.worldTurn) || 0 });

export const LINE_EFFECT_HANDLERS: Record<string, Handler> = {
  itemGrant: { apply: (e, c) => { (c.effects.inventoryTransfers ||= []).push({ transferId: `${c.receiptId}.${e.itemId}`, itemId: e.itemId, quantity: e.quantity }); } },
  memoryTicket: {
    validate: e => { if (!(LINE_RESOURCES.memories as any)[e.episodeTemplateId]) throw Error('unknown memory template'); },
    apply: (e, c) => {
      const m = (LINE_RESOURCES.memories as any)[e.episodeTemplateId], salience = (LINE_RESOURCES.salience as any)[m.salienceId];
      const major = numbers().lineBonds.majorResponse;
      (c.effects.memories ||= []).push({ actorIds: [e.actorId], summary: m.summary, tags: [`receipt:${c.receiptId}`, `template:${e.episodeTemplateId}`, ...(c.majorResponse ? ['major_episode'] : [])], salience: c.majorResponse ? Math.max(major.salienceFloor, salience) : salience });
    },
  },
  npcKnowledge: { apply: (e, c) => { (c.effects.npcKnowledge ||= []).push({ actorIds: e.actorIds, factId: e.factId }); } },
  reveal: {
    validate: e => { if (!(LINE_RESOURCES.facts as any)[e.factId]) throw Error('unknown fact'); },
    apply: (e, c) => {
      const f = (LINE_RESOURCES.facts as any)[e.factId];
      (c.effects.playerKnowledge ||= []).push({ factId: e.factId, subjectId: f.subjectId, predicate: 'known', claim: f.claim, status: 'confirmed', disclosureScope: 'player', source: { kind: e.source === 'told_privately' ? 'npc_statement' : 'observed', label: c.beatObjective } } as any);
    },
  },
  setReceipt: { apply: (e, c) => { (c.effects.pathReceipts ||= []).push({ receiptId: e.receiptId, sourceEventId: c.event.id, choiceId: c.actionId, mutexGroupId: e.mutexGroupId || e.receiptId, dimension: 'method', label: c.beatObjective, consumeAtEventIds: e.consumeAtEventIds }); } },
  setState: { apply: (e, c) => { c.r.flags[e.stateId] = e.value; } },
  // 身份账（身份账设计稿 §3.4）：eventId 取本拍 event.id，与规则表同一组函数，同一 (eventId, op) 幂等。
  identityGrant: {
    validate: e => { for (const id of [e.identityId, e.redirectIdentityId]) if (id !== undefined && !playerIdentityDef(id)) throw Error(`unknown identity ${id}`); },
    apply: (e, c) => { applyGrantRule(identityLedgerOf(c.r), { ...e, eventId: c.event.id }, c.event.id, identityOpContext(c)); },
  },
  identityRevoke: {
    validate: e => { if (!playerIdentityDef(e.identityId)) throw Error(`unknown identity ${e.identityId}`); },
    apply: (e, c) => { revokePlayerIdentity(identityLedgerOf(c.r), { ...identityOpContext(c), identityId: e.identityId, eventId: c.event.id }); },
  },
  affinityGrant: {
    validate: (e, c) => {
      if (!Number.isFinite((LINE_RESOURCES.affinityWeights as any)[e.weightId])) throw Error(`pending affinity weight ${e.weightId}`);
      if (!relationshipOf(c.save, e.actorId)) throw Error('line owner missing');
    },
    apply: (e, c) => {
      const npc = relationshipOf(c.save, e.actorId)?.profile as any; if (!npc) throw Error(`line owner missing ${e.actorId}`);
      const delta = clampLineAffinityDelta(c.hostDelta ?? Number((LINE_RESOURCES.affinityWeights as any)[e.weightId])), from = Number(npc.好感度) || 0;
      const cap = affinityCapFor(e.actorId, typeof npc.与玩家关系 === 'string' ? npc.与玩家关系 : undefined, runtimeEntityName(c.r, e.actorId))?.cap ?? 100;
      const to = clampAffinity(delta > 0 ? Math.max(from, Math.min(cap, from + delta)) : from + delta); npc.好感度 = to;
      c.changes.push({ characterId: e.actorId, from, to, weightId: e.weightId, receiptId: c.receiptId, name: runtimeEntityName(c.r, e.actorId), eventId: c.event.id, eventName: c.event.name });
    },
  },
  status: {
    validate: e => { if (!(statusCatalog as any[]).some(d => d.id === e.statusId)) throw Error('unknown line status'); },
    apply: (e, c) => {
      const def = (statusCatalog as any[]).find(d => d.id === e.statusId)!, minutes = def.afterScene?.minutes ?? null, store = injuryStore(c.save), now = sceneTime(c.save);
      const player = e.actorId === c.r.opening?.playerCharacterId;
      (store.actors[e.actorId] ||= []).push({ player, statusId: def.id, label: def.label, sourceScene: c.receiptId, cause: def.cause, source: def.source, appliedAt: now, expiresAt: minutes === null ? null : now + minutes, effects: def.effects, remove: def.remove });
      if (player) { const row = { party: e.actorId, ref: e.actorId, status: def.id, label: def.label, minutes, cause: def.cause, source: c.receiptId }; ((c.save as any).角色.效果 ||= []).push(toPlayerStatusEffect(row as any, (c.save as any).元数据.时间, def)); }
      renderInjuryViews(c.save);
    },
  },
  // 人物线结局 = 角色归宿：记下归宿、关掉该线；不写 gameOver（整局只由主角死亡或主线结局收束）。
  ending: {
    apply: (e, c) => {
      const actorIds = e.actorId ? [e.actorId] : [...c.line.ownerCharacterIds];
      const label = e.textId ? lineText(e.textId) : String(namedEntity('ending', e.endingId)?.name || e.endingId);
      (c.state.actorResolutions ||= {})[c.line.id] = <ActorResolution>{ lineId: c.line.id, actorIds, resolutionId: e.endingId, ...(e.textId ? { textId: e.textId } : {}), label, atTurn: Number(c.r.worldTurn) || 0, sourceEventId: c.event.id };
      (c.state.closedLines ||= {})[c.line.id] = Number(c.r.worldTurn) || 0;
    },
  },
};

/** 这条线是否已因角色归宿关闭。 */
export const questLineClosed = (state: any, lineId: string): boolean => state?.closedLines?.[lineId] !== undefined;

/**
 * 自己行动回执是任务线好感、记忆与奖励的唯一写入点。applyCompletion：runtime 的完成效果落账（物品、记忆、知识、回执），返回入账结果。
 */
export function settleQuestLineEffects(
  save: SaveData, r: RuntimeState, event: ScenarioModEvent, actionId: string, outcome: string, hostDelta: number | undefined,
  applyCompletion: (effects: ScenarioPlayerCompletionEffects) => ScenarioInventorySettlement[],
): ScenarioInventorySettlement[] {
  const offer = questLineOffer(save, event.id); if (!offer) return [];
  const anyR = r as any, state = anyR.questLineState ||= { version: 1, receipts: {} };
  const receiptId = `line.${event.id}.${actionId}`;
  const plan = settleLineInsertion(offer.line, offer.beat.id, { id: receiptId, eventId: event.id, actionId, outcome, turn: Number(r.worldTurn) || 0 }, offer.ctx, state); if (!plan) return [];
  const ctx: EffectContext = {
    save, r, event, actionId, receiptId, line: offer.line, beatObjective: offer.beat.objective, hostDelta,
    majorResponse: hostDelta !== undefined && Math.abs(clampLineAffinityDelta(hostDelta)) >= Number(numbers().lineBonds.majorResponse.delta),
    effects: {}, changes: [], state: plan.state,
  };
  // 写入前整体校验：任何一项不合法就整次不写。
  for (const e of plan.effects as LineEffect[]) {
    const handler = LINE_EFFECT_HANDLERS[e.kind];
    if (!handler) throw Error(`line effect kind not implemented: ${e.kind}`);
    handler.validate?.(e, ctx);
  }
  for (const e of plan.effects as LineEffect[]) LINE_EFFECT_HANDLERS[e.kind].apply(e, ctx);
  const inventory = applyCompletion(ctx.effects);
  for (const e of plan.effects as LineEffect[]) if (e.kind === 'memoryTicket') {
    const npc = relationshipOf(save, e.actorId)?.profile as any, m = (LINE_RESOURCES.memories as any)[e.episodeTemplateId];
    if (npc) { npc.记忆 = Array.isArray(npc.记忆) ? npc.记忆 : []; npc.记忆.push(m.summary); npc.记忆 = npc.记忆.slice(-Number(numbers().lineBonds.majorResponse.memoryKeep)); }
  }
  (anyR.pendingLineAffinityGrants ||= []).push(...ctx.changes);
  anyR.questLineState = ctx.state; (anyR.questLineState.affinityChanges ||= []).push(...ctx.changes);
  return inventory;
}
