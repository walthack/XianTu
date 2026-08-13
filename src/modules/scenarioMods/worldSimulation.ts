import type { SaveData } from '@/types/game';
import type { JudgementOutcome, JudgementResolution } from '@/utils/judgementEngine';

import type {
  ScenarioCondition,
  ScenarioForkableOutcome,
  ScenarioModEvent,
  ScenarioStructuralAnchor,
  ScenarioWorldIntervention,
  ScenarioWorldOmen,
  ScenarioWorldSimulation,
  ScenarioWorldSituation,
} from './schema';
import {
  recordReconcileDivergences,
  resolveReconcileBranchId,
  type ScenarioDivergence,
} from './divergenceLedger';

export interface WorldSimulationAuthorityReceipt {
  kind: 'world_sim_intervention';
  situationId: string;
  outcomeId: string;
  sourceEventId: string;
  branchId: string;
  interventionId: string;
}

export interface WorldSimulationActionReceipt {
  id: string;
  judgementId: string;
  situationId: string;
  outcomeId: string;
  interventionId: string;
  result: JudgementOutcome | 'cancelled' | 'expired';
  detail: string;
  resolvedAtTurn: number;
}

export interface PendingWorldSimulationDivergence {
  id: string;
  judgementId: string;
  situationId: string;
  outcomeId: string;
  sourceEventId: string;
  branchId: string;
  interventionId: string;
  characterStates: Record<string, string>;
  worldDelta: string;
  evidence: string;
  preserveAnchorIds: string[];
  createdAtTurn: number;
}

export interface WorldSimulationRuntimeState {
  actionReceipts: WorldSimulationActionReceipt[];
  pendingDivergence?: PendingWorldSimulationDivergence;
  confirmedJudgementIds?: string[];
  /** 已送达征兆的稳定 ID；只防重复演出，不构成知情账。 */
  deliveredOmenIds?: string[];
  /** 本轮刚送达、供主阅读面与下一轮叙事使用。 */
  pendingOmenIds?: string[];
}

export interface WorldSimulationRuntime {
  storyMode?: 'canon_companion' | 'world_sim';
  worldSimulation?: ScenarioWorldSimulation;
  worldSimulationState?: WorldSimulationRuntimeState;
  events: ScenarioModEvent[];
  flags: Record<string, unknown>;
  completedEventIds?: string[];
  offscreenResolvedEventIds?: string[];
  divergences?: ScenarioDivergence[];
  worldTurn?: number;
  stallTurns?: number;
  canon?: { characters?: Array<{ id: string; name: string }> };
  eventTimeline?: Record<string, {
    eligibleAtTurn: number;
    occurredAtTurn?: number;
    outcome?: 'participated' | 'offscreen';
  }>;
}

export interface WorldSimulationPresentationNotice {
  kind: 'report' | 'omen';
  eventId: string;
  omenId?: string;
  title: string;
  detail: string;
}

function runtimeFromSave(saveData: SaveData): WorldSimulationRuntime | undefined {
  return (saveData as any)?.世界?.状态?.剧本模组 as WorldSimulationRuntime | undefined;
}

function readFlag(runtime: WorldSimulationRuntime, path: string): unknown {
  if (!path.startsWith('flags.')) return undefined;
  return runtime.flags?.[path.slice('flags.'.length)];
}

function conditionMatches(runtime: WorldSimulationRuntime, condition: ScenarioCondition): boolean {
  const actual = readFlag(runtime, condition.path);
  const expected = condition.value;
  switch (condition.operator) {
    case 'eq': return actual === expected;
    case 'neq': return actual !== expected;
    case 'gt': return Number(actual) > Number(expected);
    case 'gte': return Number(actual) >= Number(expected);
    case 'lt': return Number(actual) < Number(expected);
    case 'lte': return Number(actual) <= Number(expected);
    case 'includes': return Array.isArray(actual)
      ? actual.includes(expected)
      : typeof actual === 'string' && actual.includes(String(expected ?? ''));
    case 'exists': return expected === false ? actual === undefined : actual !== undefined;
    default: return false;
  }
}

function allMatch(runtime: WorldSimulationRuntime, conditions: ScenarioCondition[] | undefined): boolean {
  return Boolean(conditions?.length) && conditions!.every(condition => conditionMatches(runtime, condition));
}

function anyGroupMatches(runtime: WorldSimulationRuntime, groups: ScenarioCondition[][]): boolean {
  return groups.some(group => group.length > 0 && group.every(condition => conditionMatches(runtime, condition)));
}

export function isWorldSimulationRuntime(runtime: Pick<WorldSimulationRuntime, 'storyMode' | 'worldSimulation'> | null | undefined): boolean {
  return runtime?.storyMode === 'world_sim';
}

export function getCurrentWorldSituation(runtime: WorldSimulationRuntime): ScenarioWorldSituation | undefined {
  if (!isWorldSimulationRuntime(runtime) || runtime.worldSimulation?.version !== 1) return undefined;
  return runtime.worldSimulation.situations.find(situation => !anyGroupMatches(runtime, situation.settledWhenAny));
}

interface ResolvedWorldOmen {
  omen: ScenarioWorldOmen;
  eventId: string;
  situationId?: string;
}

function eventAlreadySettled(runtime: WorldSimulationRuntime, eventId: string): boolean {
  return (runtime.completedEventIds || []).includes(eventId)
    || (runtime.offscreenResolvedEventIds || []).includes(eventId)
    || runtime.eventTimeline?.[eventId]?.occurredAtTurn !== undefined;
}

function listDeclaredWorldOmens(runtime: WorldSimulationRuntime): ResolvedWorldOmen[] {
  const items: ResolvedWorldOmen[] = [];
  for (const situation of runtime.worldSimulation?.situations || []) {
    if (situation.omen) items.push({ omen: situation.omen, eventId: situation.sourceEventId, situationId: situation.id });
  }
  for (const event of runtime.events || []) {
    if (event.timeline?.omen) items.push({ omen: event.timeline.omen, eventId: event.id });
  }
  items.sort((left, right) => left.omen.id.localeCompare(right.omen.id));
  return items;
}

export function findWorldOmen(
  runtime: WorldSimulationRuntime | null | undefined,
  omenId: string,
): ResolvedWorldOmen | undefined {
  if (!runtime || !omenId) return undefined;
  return listDeclaredWorldOmens(runtime).find(item => item.omen.id === omenId);
}

function omenClockAge(runtime: WorldSimulationRuntime, eventId: string): number | undefined {
  const event = runtime.events.find(item => item.id === eventId);
  const timeline = runtime.eventTimeline?.[eventId];
  if (event?.timeline) {
    if (!timeline) return undefined;
    return Math.max(0, (Number(runtime.worldTurn) || 0) - timeline.eligibleAtTurn);
  }
  return Math.max(0, Number(runtime.stallTurns) || 0);
}

function omenDue(runtime: WorldSimulationRuntime, item: ResolvedWorldOmen): boolean {
  if (eventAlreadySettled(runtime, item.eventId)) return false;
  if (item.situationId) {
    const current = getCurrentWorldSituation(runtime);
    if (!current || current.id !== item.situationId) return false;
  }
  const age = omenClockAge(runtime, item.eventId);
  return age !== undefined && age >= item.omen.afterTurns;
}

/**
 * 把引擎转移翻译成主阅读面可见回执。world_event_resolved 本身绝不展示，只有
 * event_revealed 才能把场外结果写给玩家，避免右栏或正文先知式泄漏。
 * event_omen 只送达未结算承重事件的软性征兆，不预告结局。
 */
export function getWorldSimulationPresentationNotices(
  runtime: WorldSimulationRuntime | null | undefined,
  changes: Array<{ action?: unknown; newValue?: unknown }> | null | undefined,
): WorldSimulationPresentationNotice[] {
  if (!runtime || !isWorldSimulationRuntime(runtime) || !Array.isArray(changes)) return [];
  const notices: WorldSimulationPresentationNotice[] = [];
  const seen = new Set<string>();
  const transitions = changes
    .map(change => ({ action: String(change?.action || ''), id: String(change?.newValue || '') }))
    .filter(change => change.id);

  for (const transition of transitions) {
    if (transition.action === 'event_omen') {
      const found = findWorldOmen(runtime, transition.id);
      const detail = String(found?.omen.presentation.text || '').trim();
      if (!found || !detail || seen.has(found.omen.id)) continue;
      seen.add(found.omen.id);
      notices.push({
        kind: 'omen',
        eventId: found.eventId,
        omenId: found.omen.id,
        title: found.omen.presentation.title,
        detail,
      });
      continue;
    }
    if (transition.action !== 'event_revealed') continue;
    const divergence = runtime.divergences?.find(item => item.eventId === transition.id);
    const event = runtime.events.find(item => item.id === transition.id);
    const presentation = event?.timeline?.reveal.presentation;
    const detail = String(
      presentation?.text
      || (divergence?.worldDelta ? `一名信使带来消息：${divergence.worldDelta}` : event?.description)
      || '',
    ).trim();
    if (!detail || seen.has(detail)) continue;
    seen.add(detail);
    notices.push({ kind: 'report', eventId: transition.id, title: presentation?.title || '来报', detail });
  }
  return notices;
}

/**
 * 在世界结算之后检查事前征兆。已结算或本批即将过期的事件不补送；
 * 只改 delivered/pending omen id，不写 flags、知情、分歧或关系。
 */
export function deliverDueWorldOmens(
  runtime: WorldSimulationRuntime | null | undefined,
  transitions: Array<{ type: string; id: string }>,
): WorldSimulationPresentationNotice[] {
  if (!runtime || !isWorldSimulationRuntime(runtime) || runtime.worldSimulation?.version !== 1) return [];
  const state = ensureState(runtime);
  state.pendingOmenIds = [];
  const delivered = new Set(state.deliveredOmenIds || []);
  const settledThisBatch = new Set<string>();
  for (const transition of transitions) {
    if (transition.type === 'event_completed') settledThisBatch.add(transition.id);
    if (transition.type === 'world_event_resolved') {
      for (const event of runtime.events) {
        if (event.offscreenResolution?.id === transition.id) {
          for (const resolvedId of event.offscreenResolution.resolvedEventIds || []) settledThisBatch.add(resolvedId);
        }
      }
    }
  }
  const notices: WorldSimulationPresentationNotice[] = [];
  for (const item of listDeclaredWorldOmens(runtime)) {
    if (delivered.has(item.omen.id)) continue;
    if (eventAlreadySettled(runtime, item.eventId) || settledThisBatch.has(item.eventId)) {
      delivered.add(item.omen.id);
      state.deliveredOmenIds = [...delivered];
      continue;
    }
    if (!omenDue(runtime, item)) continue;
    delivered.add(item.omen.id);
    state.deliveredOmenIds = [...delivered];
    state.pendingOmenIds.push(item.omen.id);
    transitions.push({ type: 'event_omen', id: item.omen.id });
    notices.push({
      kind: 'omen',
      eventId: item.eventId,
      omenId: item.omen.id,
      title: item.omen.presentation.title,
      detail: item.omen.presentation.text,
    });
  }
  return notices;
}

export function formatPendingWorldOmenPrompt(runtime: WorldSimulationRuntime): string {
  const pending = runtime.worldSimulationState?.pendingOmenIds || [];
  if (!pending.length || !isWorldSimulationRuntime(runtime)) return '';
  const names = new Map((runtime.canon?.characters || []).map(item => [item.id, item.name]));
  const lines = pending.flatMap(omenId => {
    const found = findWorldOmen(runtime, omenId);
    if (!found) return [];
    const carriers = (found.omen.transmitters || []).map(item => {
      const who = item.characterId ? (names.get(item.characterId) || item.characterId) : '';
      if (item.kind === 'related_npc') return who ? `在场相关人物${who}` : '在场相关人物';
      if (item.kind === 'companion') return who ? `同行伙伴${who}` : '同行伙伴';
      if (item.kind === 'messenger') return who ? `可信使者${who}` : '可信使者';
      return '环境异动';
    });
    const carrierLine = carriers.length
      ? `候选传递者：${carriers.join('、')}。他们只知道这些可见动静，不是全知。`
      : '用急报、异动、传讯或风声带出；不得让人物全知。';
    return [
      `- ${found.omen.presentation.text}可观察事实：${found.omen.observableFacts.join('；')}。${carrierLine}`
      + `无人可传时用环境异动：${found.omen.environmentFallback}。`
      + '玩家已经在上一拍收到这条征兆；接续当前场景时只承接人物反应或行动，不要逐字复述。'
      + '软性可忽略；不得预告确定结局，不得替玩家决定去留，不得当成事件已完成，也不得据此写 flags、知情或 IF。',
    ];
  });
  return lines.length ? `\n【剧情内征兆·仅演出】\n${lines.join('\n')}` : '';
}

export function getWorldSimulationFocusEvent(runtime: WorldSimulationRuntime): ScenarioModEvent | undefined {
  const situation = getCurrentWorldSituation(runtime);
  return situation ? runtime.events.find(event => event.id === situation.sourceEventId) : undefined;
}

export function getSatisfiedStructuralAnchors(runtime: WorldSimulationRuntime): ScenarioStructuralAnchor[] {
  if (!isWorldSimulationRuntime(runtime) || runtime.worldSimulation?.version !== 1) return [];
  return runtime.worldSimulation.structuralAnchors
    .filter(anchor => anyGroupMatches(runtime, anchor.satisfiedWhenAny));
}

export function getOpenStructuralAnchors(runtime: WorldSimulationRuntime): ScenarioStructuralAnchor[] {
  if (!isWorldSimulationRuntime(runtime) || runtime.worldSimulation?.version !== 1) return [];
  return runtime.worldSimulation.structuralAnchors
    .filter(anchor => !anyGroupMatches(runtime, anchor.satisfiedWhenAny));
}

function findOutcome(runtime: WorldSimulationRuntime, outcomeId: string): ScenarioForkableOutcome | undefined {
  return runtime.worldSimulation?.forkableOutcomes.find(outcome => outcome.id === outcomeId);
}

function outcomeAlreadySettled(runtime: WorldSimulationRuntime, outcome: ScenarioForkableOutcome): boolean {
  return allMatch(runtime, outcome.defaultWhen)
    || outcome.replacementBranches.some(branch => allMatch(runtime, branch.activeWhen))
    || (runtime.offscreenResolvedEventIds || []).includes(outcome.sourceEventId);
}

function normalizedAction(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

function interventionMatches(actionText: string, intervention: ScenarioWorldIntervention): boolean {
  const action = normalizedAction(actionText);
  if ((intervention.rejectIf || []).some(term => action.includes(normalizedAction(term)))) return false;
  return intervention.matchAny.some(term => action.includes(normalizedAction(term)));
}

export function findWorldSimulationIntervention(
  saveData: SaveData,
  actionText: string,
): { situation: ScenarioWorldSituation; outcome: ScenarioForkableOutcome; branchId: string; intervention: ScenarioWorldIntervention } | undefined {
  const runtime = runtimeFromSave(saveData);
  const situation = runtime && getCurrentWorldSituation(runtime);
  if (!runtime || !situation || !actionText.trim() || runtime.worldSimulationState?.pendingDivergence) return undefined;
  for (const outcomeId of situation.outcomeIds || []) {
    const outcome = findOutcome(runtime, outcomeId);
    if (!outcome || outcome.sourceEventId !== situation.sourceEventId || outcomeAlreadySettled(runtime, outcome)) continue;
    for (const branch of outcome.replacementBranches) {
      if (interventionMatches(actionText, branch.intervention)) {
        return { situation, outcome, branchId: branch.branchId, intervention: branch.intervention };
      }
    }
  }
  return undefined;
}

function ensureState(runtime: WorldSimulationRuntime): WorldSimulationRuntimeState {
  const state = runtime.worldSimulationState ||= { actionReceipts: [] };
  state.actionReceipts = Array.isArray(state.actionReceipts) ? state.actionReceipts : [];
  state.confirmedJudgementIds = Array.isArray(state.confirmedJudgementIds) ? state.confirmedJudgementIds : [];
  return state;
}

function upsertActionReceipt(
  runtime: WorldSimulationRuntime,
  resolution: JudgementResolution,
  authority: WorldSimulationAuthorityReceipt,
  result: WorldSimulationActionReceipt['result'],
  detail: string,
): void {
  const state = ensureState(runtime);
  if (state.actionReceipts.some(receipt => receipt.judgementId === resolution.id)) return;
  state.actionReceipts.push({
    id: `world-sim.receipt.${resolution.id}`,
    judgementId: resolution.id,
    situationId: authority.situationId,
    outcomeId: authority.outcomeId,
    interventionId: authority.interventionId,
    result,
    detail,
    resolvedAtTurn: Math.max(0, Number(resolution.resolvedAtTurn) || 0),
  });
  state.actionReceipts = state.actionReceipts.slice(-20);
}

/** 只消费判定提案中由本地合同签发的 receipt；绝不读取玩家或 LLM 正文猜测生还。 */
export function settleWorldSimulationJudgement(
  saveData: SaveData,
  resolution: JudgementResolution,
): { pending: boolean; expired: boolean } {
  const authority = resolution.authorityReceipt;
  const runtime = runtimeFromSave(saveData);
  if (!runtime || !isWorldSimulationRuntime(runtime) || runtime.worldSimulation?.version !== 1
    || authority?.kind !== 'world_sim_intervention') {
    return { pending: false, expired: false };
  }
  const state = ensureState(runtime);
  if (state.pendingDivergence?.judgementId === resolution.id) return { pending: true, expired: false };
  if (state.pendingDivergence) {
    upsertActionReceipt(runtime, resolution, authority, 'expired', '已有一项世界线变化等待确认，本次判定不能覆盖它。');
    return { pending: false, expired: true };
  }
  if (state.confirmedJudgementIds?.includes(resolution.id)
    || state.actionReceipts.some(receipt => receipt.judgementId === resolution.id)) {
    return { pending: false, expired: false };
  }
  const situation = runtime.worldSimulation!.situations.find(item => item.id === authority.situationId);
  const outcome = findOutcome(runtime, authority.outcomeId);
  const branch = outcome?.replacementBranches.find(item => item.branchId === authority.branchId);
  const intervention = branch?.intervention;
  if (!situation || !outcome || !branch || !intervention
    || situation.sourceEventId !== authority.sourceEventId
    || outcome.sourceEventId !== authority.sourceEventId
    || intervention.id !== authority.interventionId
    || outcomeAlreadySettled(runtime, outcome)) {
    upsertActionReceipt(runtime, resolution, authority, 'expired', '局势已先行结算，本次旧判定不能再改写世界结果。');
    return { pending: false, expired: true };
  }
  const result = resolution.status === 'cancelled' ? 'cancelled' : resolution.outcome || 'failure';
  if (!intervention.successOutcomes.includes(result as 'success' | 'great_success' | 'perfect')) {
    upsertActionReceipt(runtime, resolution, authority, result, '本地行动未达到替代默认结果的门槛；世界线未改写。');
    return { pending: false, expired: false };
  }
  const preserved = outcome.preserveAnchorIds.every(anchorId => {
    const anchor = runtime.worldSimulation!.structuralAnchors.find(item => item.id === anchorId);
    return Boolean(anchor && anyGroupMatches(runtime, anchor.satisfiedWhenAny));
  });
  if (!preserved) {
    upsertActionReceipt(runtime, resolution, authority, 'expired', '承重锚点尚未成立，不能确认这条替代结果。');
    return { pending: false, expired: true };
  }
  state.pendingDivergence = {
    id: `world-sim.pending.${resolution.id}`,
    judgementId: resolution.id,
    situationId: situation.id,
    outcomeId: outcome.id,
    sourceEventId: outcome.sourceEventId,
    branchId: branch.branchId,
    interventionId: intervention.id,
    characterStates: { [intervention.characterState.characterId]: intervention.characterState.status },
    worldDelta: intervention.worldDelta,
    evidence: `${intervention.evidence}；本地判定=${resolution.id}/${resolution.outcome}`,
    preserveAnchorIds: [...outcome.preserveAnchorIds],
    createdAtTurn: Math.max(0, Number(resolution.resolvedAtTurn) || 0),
  };
  return { pending: true, expired: false };
}

export function confirmWorldSimulationDivergence(saveData: SaveData): { ok: boolean; reason?: string } {
  const runtime = runtimeFromSave(saveData);
  const state = runtime && ensureState(runtime);
  const pending = state?.pendingDivergence;
  if (!runtime || !state || !pending) return { ok: false, reason: '没有待确认的世界线变化' };
  if (state.confirmedJudgementIds?.includes(pending.judgementId)) {
    delete state.pendingDivergence;
    return { ok: true };
  }
  const outcome = findOutcome(runtime, pending.outcomeId);
  if (!outcome || outcomeAlreadySettled(runtime, outcome)) {
    delete state.pendingDivergence;
    return { ok: false, reason: '默认结果已经先行结算，这次候选已过期' };
  }
  const anchorsStillHold = pending.preserveAnchorIds.every(anchorId => {
    const anchor = runtime.worldSimulation!.structuralAnchors.find(item => item.id === anchorId);
    return Boolean(anchor && anyGroupMatches(runtime, anchor.satisfiedWhenAny));
  });
  if (!anchorsStillHold) return { ok: false, reason: '承重锚点状态已变化，不能应用候选' };
  const divergenceInput = {
    id: pending.sourceEventId,
    verdict: 'void' as const,
    evidence: pending.evidence,
    worldDelta: pending.worldDelta,
    characterStates: pending.characterStates,
  };
  if (resolveReconcileBranchId(divergenceInput) !== pending.branchId) {
    return { ok: false, reason: '现有 IF registry 与世界合同不一致，世界状态未改动' };
  }
  const added = recordReconcileDivergences(runtime, [divergenceInput]);
  const applied = added.some(item => item.eventId === pending.sourceEventId && item.branchId === pending.branchId)
    || (runtime.divergences || []).some(item => item.eventId === pending.sourceEventId && item.branchId === pending.branchId);
  if (!applied) return { ok: false, reason: '现有 IF 门闩拒绝了这次候选，世界状态未改动' };
  // 正式 IF 已替代源事件的默认期限结果；统一 settlement registry 必须同时关闭，
  // 否则 Rail 的 offscreen resolver 会在若干轮后再次写入旧死亡结局。
  runtime.offscreenResolvedEventIds = [...new Set([
    ...(runtime.offscreenResolvedEventIds || []),
    pending.sourceEventId,
  ])];
  state.confirmedJudgementIds = [...new Set([...(state.confirmedJudgementIds || []), pending.judgementId])];
  delete state.pendingDivergence;
  return { ok: true };
}

export function cancelWorldSimulationDivergence(saveData: SaveData): { ok: boolean; reason?: string } {
  const runtime = runtimeFromSave(saveData);
  const state = runtime && ensureState(runtime);
  const pending = state?.pendingDivergence;
  if (!runtime || !state || !pending) return { ok: false, reason: '没有待确认的世界线变化' };
  const authority: WorldSimulationAuthorityReceipt = {
    kind: 'world_sim_intervention',
    situationId: pending.situationId,
    outcomeId: pending.outcomeId,
    sourceEventId: pending.sourceEventId,
    branchId: pending.branchId,
    interventionId: pending.interventionId,
  };
  upsertActionReceipt(runtime, {
    id: pending.judgementId,
    status: 'cancelled',
    actionText: '', actionHash: '', kind: 'scheme', whyNow: '',
    difficulty: { band: 'extreme', value: 0 }, factors: [],
    stakes: { success: '', partial: '', failure: '' }, canonPolicy: 'route_process_only',
    createdAtTurn: pending.createdAtTurn, appliedEffects: [], resolvedAtTurn: pending.createdAtTurn,
  }, authority, 'cancelled', '玩家没有确认这项会改写枢纽结果的最终行动。');
  delete state.pendingDivergence;
  return { ok: true };
}

export function formatWorldSimulationPrompt(runtime: WorldSimulationRuntime): string {
  const situation = getCurrentWorldSituation(runtime);
  if (!situation || !isWorldSimulationRuntime(runtime)) return '';
  const currentAnchors = runtime.worldSimulation!.structuralAnchors
    .filter(anchor => (situation.anchorIds || []).includes(anchor.id));
  const outcomeLines = (situation.outcomeIds || []).flatMap(id => {
    const outcome = findOutcome(runtime, id);
    if (!outcome) return [];
    if (allMatch(runtime, outcome.defaultWhen)) return [`- 已结算：${outcome.defaultSummary}`];
    const activeBranch = outcome.replacementBranches.find(branch => allMatch(runtime, branch.activeWhen));
    if (activeBranch) return [`- 已结算：${activeBranch.summary}`];
    return [`- 默认未来（尚未发生）：${outcome.defaultSummary}；只有本地行动结算并确认正式 IF 才可替代。`];
  });
  const reference = runtime.worldSimulation!.referenceBeats.find(beat =>
    beat.situationId === situation.id
    && allMatch(runtime, beat.availableWhen)
    && !(beat.invalidWhen?.length && allMatch(runtime, beat.invalidWhen)));
  const receipts = (runtime.worldSimulationState?.actionReceipts || []).slice(-3);
  const receiptLine = receipts.length
    ? `\n最近的本地介入回执：\n${receipts.map(receipt => `- ${receipt.detail}`).join('\n')}`
    : '';
  const pendingLine = runtime.worldSimulationState?.pendingDivergence
    ? `\n待玩家确认的 IF 候选：${runtime.worldSimulationState.pendingDivergence.worldDelta}。确认前不得当成已经发生。`
    : '';
  const anchorLine = currentAnchors.length
    ? `承重事实：${currentAnchors.map(anchor => `${anyGroupMatches(runtime, anchor.satisfiedWhenAny) ? '【已成立且必须保留】' : '【尚待世界成立】'}${anchor.summary}`).join('；')}\n`
    : '';
  return `【六朝世界模式·本地真值】\n当前局势：${situation.title}——${situation.summary}\n${anchorLine}${outcomeLines.join('\n')}${reference ? `\n可用原著演出素材（结果已经成立后才可使用）：${reference.summary}` : ''}${receiptLine}${pendingLine}${formatPendingWorldOmenPrompt(runtime)}\n玩家可以介入或忽略；不得为了复演原著逐拍而替玩家行动，也不得由正文、猜测或 tavern_commands 写入锚点、死亡、生还、IF 或世界时钟。`;
}
