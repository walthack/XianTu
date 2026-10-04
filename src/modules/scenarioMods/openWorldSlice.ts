import { canonicalLocationId } from './travel/locationIds';

export type OpenWorldReliability = 'confirmed' | 'credible' | 'rumor';
export type OpenWorldProblemOutcome = 'success' | 'partial' | 'failure-forward';
export type OpenWorldZoneKind = 'settlement' | 'street' | 'interior' | 'compound';
export type OpenWorldTravelMode = 'player' | 'forced';
/** local：区内路线，玩家可主动走；journey：跨区路程，只能由强制移动触发。缺省 local。 */
export type OpenWorldRouteKind = 'local' | 'journey';
/** 路程天数；原著没写的路段填 'several'（叙事只写「数日」，内部按 SEVERAL_DAYS_PLACEHOLDER 推进）。 */
export type OpenWorldDayCost = number | 'several';
/** 强制移动的触发：前一拍完成，或转关（如 'lcq.stage_02→lcq.stage_03b_snake_flower_bridge'）。 */
export type OpenWorldForcedBy = { afterEventDone: string } | { stageTransition: string };
/** 地点三态：隐藏（不画）／听闻（只显示名字）／到过。 */
export type OpenWorldVisibility = 'hidden' | 'heard' | 'visited';

export const SEVERAL_DAYS_PLACEHOLDER = 3;

export interface OpenWorldZone {
  id: string;
  name: string;
  aliases?: string[];
  kind?: OpenWorldZoneKind;
  parentZoneId?: string;
  worldLocationId?: string;
  /** Containers default not standable. Leaves default standable. */
  standable?: boolean;
  /** 所属行旅区；缺省沿父节点向上找。 */
  areaId?: string;
  /** 这些事件全部完成后算「听闻」。 */
  heardWhen?: string[];
}

/** 行旅区：地点层上的分组视图，不进位置字符串。 */
export interface OpenWorldArea {
  id: string;
  name: string;
  continent?: string;
  /** after 全部完成、且 until 未全部完成时，区内 local 路线开放自由移动。未声明则不开放。 */
  freeRoamWhen?: { after?: string[]; until?: string[] };
  /** 按时点分段的背景：取最后一条 when 全部完成的。 */
  background?: Array<{ when: string[]; text: string }>;
}

export interface OpenWorldRoute {
  id: string;
  fromZoneId: string;
  toZoneId: string;
  label: string;
  aliases?: string[];
  turnCost: number;
  requirementKey?: string;
  kind?: OpenWorldRouteKind;
  /** 只用于 journey。 */
  dayCost?: OpenWorldDayCost;
  /** 原著/策划的耗时显示，独立于内部日历量。 */
  durationLabel?: string;
  forcedBy?: OpenWorldForcedBy;
  /** 这些事件全部完成后路线才可用。 */
  unlockWhen?: string[];
  companions?: string[];
  /** 固定的路途概要文字，不经 LLM。 */
  summary?: string;
}

export interface OpenWorldActorDefinition {
  id: string;
  name: string;
  initialZoneId: string;
  desire: string;
  initialStatus: string;
}

export interface OpenWorldNotice {
  id: string;
  source: string;
  reliability: OpenWorldReliability;
  text: string;
  atZoneId: string;
  unlockZoneIds?: string[];
  unlockRouteIds?: string[];
  unlockRequirementKeys?: string[];
}

export interface OpenWorldConsequenceEffect {
  actorStatus?: string;
  actorZoneId?: string;
  problemId?: string;
  problemState?: string;
  unlockZoneIds?: string[];
  unlockRouteIds?: string[];
  unlockRequirementKeys?: string[];
}

export interface OpenWorldDelayedConsequence {
  id: string;
  delayTurns: number;
  cause: string;
  effect: string;
  actorId?: string;
  apply?: OpenWorldConsequenceEffect;
}

export interface OpenWorldProblemAction {
  id: string;
  problemId: string;
  label: string;
  actionText: string;
  aliases: string[];
  rejectIf?: string[];
  availableInStates: string[];
  outcome: OpenWorldProblemOutcome;
  nextProblemState: string;
  settledFacts: string[];
  costs?: string[];
  consequences?: OpenWorldDelayedConsequence[];
}

export interface OpenWorldProblem {
  id: string;
  atZoneId: string;
  title: string;
  objective: string;
  initialState: string;
  terminalStates?: string[];
  actionIds: string[];
}

export interface OpenWorldSliceDefinition {
  id: string;
  initialZoneId: string;
  zones: OpenWorldZone[];
  routes: OpenWorldRoute[];
  notices: OpenWorldNotice[];
  actors: OpenWorldActorDefinition[];
  problems: OpenWorldProblem[];
  actions: OpenWorldProblemAction[];
  areas?: OpenWorldArea[];
}

export interface OpenWorldTravelReceipt {
  receiptId: string;
  routeId: string;
  fromZoneId: string;
  toZoneId: string;
  departedAtTurn: number;
  arrivedAtTurn: number;
  turnCost: number;
  mode: OpenWorldTravelMode;
  causeEventId?: string;
  /** journey 才有：实际推进的天数；several 时为占位天数并带 dayCostSeveral。 */
  dayCost?: number;
  dayCostSeveral?: true;
}

export interface OpenWorldNoticeReceipt {
  receiptId: string;
  noticeId: string;
  readAtTurn: number;
}

export interface OpenWorldActionReceipt {
  receiptId: string;
  actionId: string;
  problemId: string;
  outcome: OpenWorldProblemOutcome;
  settledAtTurn: number;
  settledFacts: string[];
  costs: string[];
}

export interface OpenWorldPendingConsequence {
  receiptId: string;
  consequenceId: string;
  dueTurn: number;
  cause: string;
  effect: string;
  actorId?: string;
  apply?: OpenWorldConsequenceEffect;
}

export interface OpenWorldConsequenceReceipt extends OpenWorldPendingConsequence {
  settledAtTurn: number;
}

export interface OpenWorldActorState {
  actorId: string;
  currentZoneId: string;
  desire: string;
  status: string;
}

export interface OpenWorldChronicleEntry {
  id: string;
  atTurn: number;
  cause: string;
  effect: string;
  text: string;
}

export interface OpenWorldSliceRuntime {
  version: 1;
  sliceId: string;
  currentZoneId: string;
  knownZoneIds: string[];
  knownRouteIds: string[];
  requirements: string[];
  elapsedTurns: number;
  travelReceipts: OpenWorldTravelReceipt[];
  noticeReceipts: OpenWorldNoticeReceipt[];
  actionReceipts: OpenWorldActionReceipt[];
  consequenceReceipts: OpenWorldConsequenceReceipt[];
  pendingConsequences: OpenWorldPendingConsequence[];
  problemStates: Record<string, string>;
  actorStates: Record<string, OpenWorldActorState>;
  chronicle: OpenWorldChronicleEntry[];
}

export type OpenWorldMatch<T> =
  | { status: 'matched'; value: T }
  | { status: 'none' | 'negated' | 'ambiguous' };

export interface OpenWorldSettlementResult<T> {
  status: 'settled' | 'idempotent' | 'rejected';
  receipt?: T;
  reason?: string;
}

const NEGATION_TERMS = ['不去', '别去', '不要去', '暂时不去', '先不去', '不打算去'];

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '');
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function includesPhrase(text: string, phrase: string): boolean {
  const normalized = normalize(phrase);
  return Boolean(normalized) && text.includes(normalized);
}

function zoneById(definition: OpenWorldSliceDefinition, id: string): OpenWorldZone | undefined {
  return definition.zones.find(zone => zone.id === id);
}

export function zoneIsStandable(zone: OpenWorldZone | undefined): boolean {
  if (!zone) return false;
  if (zone.standable === false) return false;
  if (zone.standable === true) return true;
  return zone.kind !== 'settlement' && zone.kind !== 'compound';
}

export function worldLocationIdOf(definition: OpenWorldSliceDefinition, zoneId: string): string {
  let current = zoneById(definition, zoneId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.worldLocationId) return current.worldLocationId;
    current = current.parentZoneId ? zoneById(definition, current.parentZoneId) : undefined;
  }
  return '';
}

function firstStandableZoneId(definition: OpenWorldSliceDefinition, preferred?: string): string {
  if (preferred && zoneIsStandable(zoneById(definition, preferred))) return preferred;
  if (zoneIsStandable(zoneById(definition, definition.initialZoneId))) return definition.initialZoneId;
  return definition.zones.find(zone => zoneIsStandable(zone))?.id || definition.initialZoneId;
}

function hydrateTravelReceipt(raw: Partial<OpenWorldTravelReceipt> | undefined): OpenWorldTravelReceipt | undefined {
  if (!raw?.receiptId || !raw.routeId || !raw.fromZoneId || !raw.toZoneId) return undefined;
  return {
    receiptId: String(raw.receiptId),
    routeId: String(raw.routeId),
    fromZoneId: String(raw.fromZoneId),
    toZoneId: String(raw.toZoneId),
    departedAtTurn: Math.max(0, Number(raw.departedAtTurn) || 0),
    arrivedAtTurn: Math.max(0, Number(raw.arrivedAtTurn) || 0),
    turnCost: Math.max(0, Number(raw.turnCost) || 0),
    mode: raw.mode === 'forced' ? 'forced' : 'player',
    ...(raw.causeEventId ? { causeEventId: String(raw.causeEventId) } : {}),
    ...(Number(raw.dayCost) > 0 ? { dayCost: Number(raw.dayCost) } : {}),
    ...(raw.dayCostSeveral === true ? { dayCostSeveral: true as const } : {}),
  };
}

/** journey 的天数；several 解析成占位天数。local 路线为 0。 */
export function routeDayCost(route: OpenWorldRoute): { days: number; several: boolean } {
  if (route.kind !== 'journey') return { days: 0, several: false };
  if (route.dayCost === 'several') return { days: SEVERAL_DAYS_PLACEHOLDER, several: true };
  return { days: Math.max(0, Number(route.dayCost) || 0), several: false };
}

function journeyReceiptFields(route: OpenWorldRoute): Pick<OpenWorldTravelReceipt, 'dayCost' | 'dayCostSeveral'> {
  const { days, several } = routeDayCost(route);
  return {
    ...(days > 0 ? { dayCost: days } : {}),
    ...(several ? { dayCostSeveral: true as const } : {}),
  };
}

function routeById(definition: OpenWorldSliceDefinition, id: string): OpenWorldRoute | undefined {
  return definition.routes.find(route => route.id === id);
}

function actionById(definition: OpenWorldSliceDefinition, id: string): OpenWorldProblemAction | undefined {
  return definition.actions.find(action => action.id === id);
}

function actorById(definition: OpenWorldSliceDefinition, id: string): OpenWorldActorDefinition | undefined {
  return definition.actors.find(actor => actor.id === id);
}

function appendChronicle(
  state: OpenWorldSliceRuntime,
  id: string,
  cause: string,
  effect: string,
): void {
  if (state.chronicle.some(entry => entry.id === id)) return;
  state.chronicle.push({ id, atTurn: state.elapsedTurns, cause, effect, text: `因为${cause}，所以${effect}` });
}

/**
 * 旧档只补缺失字段，不重置已有回执。定义中的角色、问题和初始地点都是本地 allowlist。
 */
export function hydrateOpenWorldSliceRuntime(
  raw: Partial<OpenWorldSliceRuntime> | null | undefined,
  definition: OpenWorldSliceDefinition,
): OpenWorldSliceRuntime {
  const currentZoneId = firstStandableZoneId(
    definition,
    raw?.currentZoneId && zoneById(definition, raw.currentZoneId) ? raw.currentZoneId : undefined,
  );
  const actorStates = { ...(raw?.actorStates || {}) };
  for (const actor of definition.actors) {
    actorStates[actor.id] ||= {
      actorId: actor.id,
      currentZoneId: actor.initialZoneId,
      desire: actor.desire,
      status: actor.initialStatus,
    };
  }
  const problemStates = { ...(raw?.problemStates || {}) };
  for (const problem of definition.problems) problemStates[problem.id] ||= problem.initialState;
  return {
    version: 1,
    sliceId: definition.id,
    currentZoneId,
    knownZoneIds: unique([currentZoneId, ...(raw?.knownZoneIds || [])]).filter(id => Boolean(zoneById(definition, id))),
    knownRouteIds: unique(raw?.knownRouteIds || []).filter(id => Boolean(routeById(definition, id))),
    requirements: unique(raw?.requirements || []),
    elapsedTurns: Math.max(0, Number(raw?.elapsedTurns) || 0),
    travelReceipts: (raw?.travelReceipts || []).map(hydrateTravelReceipt).filter((item): item is OpenWorldTravelReceipt => Boolean(item)),
    noticeReceipts: [...(raw?.noticeReceipts || [])],
    actionReceipts: [...(raw?.actionReceipts || [])],
    consequenceReceipts: [...(raw?.consequenceReceipts || [])],
    pendingConsequences: [...(raw?.pendingConsequences || [])],
    problemStates,
    actorStates,
    chronicle: [...(raw?.chronicle || [])],
  };
}

function reachableRoutes(state: OpenWorldSliceRuntime, definition: OpenWorldSliceDefinition): OpenWorldRoute[] {
  return definition.routes.filter(route =>
    route.kind !== 'journey'
    && route.fromZoneId === state.currentZoneId
    && state.knownRouteIds.includes(route.id)
    && state.knownZoneIds.includes(route.toZoneId)
    && (!route.requirementKey || state.requirements.includes(route.requirementKey)));
}

export function matchOpenWorldTravelInput(
  state: OpenWorldSliceRuntime,
  definition: OpenWorldSliceDefinition,
  playerText: string,
): OpenWorldMatch<{ routeId: string; destinationZoneId: string }> {
  const text = normalize(playerText || '');
  if (!text) return { status: 'none' };
  const routes = reachableRoutes(state, definition);
  const mentioned = routes.filter(route => {
    const zone = zoneById(definition, route.toZoneId)!;
    return [zone.name, ...(zone.aliases || [])].some(alias => includesPhrase(text, alias));
  });
  if (!mentioned.length) return { status: 'none' };
  if (NEGATION_TERMS.some(term => includesPhrase(text, term))) return { status: 'negated' };
  const destinations = unique(mentioned.map(route => route.toZoneId));
  if (destinations.length !== 1) return { status: 'ambiguous' };
  if (mentioned.length === 1) {
    return { status: 'matched', value: { routeId: mentioned[0].id, destinationZoneId: mentioned[0].toZoneId } };
  }
  const routeSpecific = mentioned.filter(route => (route.aliases || []).some(alias => includesPhrase(text, alias)));
  return routeSpecific.length === 1
    ? { status: 'matched', value: { routeId: routeSpecific[0].id, destinationZoneId: routeSpecific[0].toZoneId } }
    : { status: 'ambiguous' };
}

function receiptConflict(
  state: OpenWorldSliceRuntime,
  receiptId: string,
): { kind: 'travel' | 'notice' | 'action'; identity: string } | undefined {
  const travel = state.travelReceipts.find(item => item.receiptId === receiptId);
  if (travel) return { kind: 'travel', identity: travel.routeId };
  const notice = state.noticeReceipts.find(item => item.receiptId === receiptId);
  if (notice) return { kind: 'notice', identity: notice.noticeId };
  const action = state.actionReceipts.find(item => item.receiptId === receiptId);
  if (action) return { kind: 'action', identity: action.actionId };
  return undefined;
}

export function settleOpenWorldTravel(
  state: OpenWorldSliceRuntime,
  definition: OpenWorldSliceDefinition,
  routeId: string,
  receiptId: string,
): OpenWorldSettlementResult<OpenWorldTravelReceipt> {
  const existing = receiptConflict(state, receiptId);
  if (existing) {
    const receipt = state.travelReceipts.find(item => item.receiptId === receiptId);
    return existing.kind === 'travel' && existing.identity === routeId
      ? { status: 'idempotent', receipt }
      : { status: 'rejected', reason: 'receipt_conflict' };
  }
  const route = routeById(definition, routeId);
  if (!route) return { status: 'rejected', reason: 'unknown_route' };
  if (route.kind === 'journey') return { status: 'rejected', reason: 'forced_only' };
  if (route.fromZoneId !== state.currentZoneId) return { status: 'rejected', reason: 'not_adjacent' };
  if (!state.knownRouteIds.includes(route.id) || !state.knownZoneIds.includes(route.toZoneId)) {
    return { status: 'rejected', reason: 'not_known' };
  }
  if (route.requirementKey && !state.requirements.includes(route.requirementKey)) {
    return { status: 'rejected', reason: 'requirement_missing' };
  }
  if (!zoneIsStandable(zoneById(definition, route.toZoneId))) {
    return { status: 'rejected', reason: 'not_standable' };
  }
  const departedAtTurn = state.elapsedTurns;
  state.elapsedTurns += route.turnCost;
  const receipt: OpenWorldTravelReceipt = {
    receiptId,
    routeId,
    fromZoneId: route.fromZoneId,
    toZoneId: route.toZoneId,
    departedAtTurn,
    arrivedAtTurn: state.elapsedTurns,
    turnCost: route.turnCost,
    mode: 'player',
  };
  state.travelReceipts.push(receipt);
  state.currentZoneId = route.toZoneId;
  const from = zoneById(definition, route.fromZoneId)?.name || '原地';
  const to = zoneById(definition, route.toZoneId)?.name || '目的地';
  appendChronicle(state, `travel:${receiptId}`, `你从${from}选择${route.label}`, `你在付出${route.turnCost}轮路程后抵达${to}`);
  settleDueConsequences(state, definition);
  return { status: 'settled', receipt };
}

export function forcedTravelReceiptId(causeEventId: string, routeId: string): string {
  return `forced:${causeEventId}:${routeId}`;
}

function existingForcedTravel(
  state: OpenWorldSliceRuntime,
  causeEventId: string,
  routeId: string,
): OpenWorldTravelReceipt | undefined {
  return state.travelReceipts.find(item => item.mode === 'forced' && item.causeEventId === causeEventId && item.routeId === routeId);
}

export function settleOpenWorldForcedTravel(
  state: OpenWorldSliceRuntime,
  definition: OpenWorldSliceDefinition,
  routeId: string,
  causeEventId: string,
  receiptId = forcedTravelReceiptId(causeEventId, routeId),
): OpenWorldSettlementResult<OpenWorldTravelReceipt> {
  const cause = String(causeEventId || '').trim();
  if (!cause) return { status: 'rejected', reason: 'missing_cause' };
  const already = existingForcedTravel(state, cause, routeId);
  if (already) return { status: 'idempotent', receipt: already };
  const existing = receiptConflict(state, receiptId);
  if (existing) {
    const receipt = state.travelReceipts.find(item => item.receiptId === receiptId);
    return existing.kind === 'travel' && existing.identity === routeId
      ? { status: 'idempotent', receipt }
      : { status: 'rejected', reason: 'receipt_conflict' };
  }
  const route = routeById(definition, routeId);
  if (!route) return { status: 'rejected', reason: 'unknown_route' };
  if (route.fromZoneId !== state.currentZoneId) return { status: 'rejected', reason: 'not_adjacent' };
  if (!zoneIsStandable(zoneById(definition, route.toZoneId))) {
    return { status: 'rejected', reason: 'not_standable' };
  }
  const departedAtTurn = state.elapsedTurns;
  state.elapsedTurns += route.turnCost;
  const receipt: OpenWorldTravelReceipt = {
    receiptId,
    routeId,
    fromZoneId: route.fromZoneId,
    toZoneId: route.toZoneId,
    departedAtTurn,
    arrivedAtTurn: state.elapsedTurns,
    turnCost: route.turnCost,
    mode: 'forced',
    causeEventId: cause,
    ...journeyReceiptFields(route),
  };
  state.travelReceipts.push(receipt);
  state.currentZoneId = route.toZoneId;
  state.knownZoneIds = unique([...state.knownZoneIds, route.toZoneId]).filter(id => Boolean(zoneById(definition, id)));
  state.knownRouteIds = unique([...state.knownRouteIds, route.id]).filter(id => Boolean(routeById(definition, id)));
  const from = zoneById(definition, route.fromZoneId)?.name || '原地';
  const to = zoneById(definition, route.toZoneId)?.name || '目的地';
  appendChronicle(state, `travel:${receiptId}`, `事件将你从${from}沿${route.label}带走`, `你被带到${to}`);
  settleDueConsequences(state, definition);
  return { status: 'settled', receipt };
}

export function settleOpenWorldForcedTravelChain(
  state: OpenWorldSliceRuntime,
  definition: OpenWorldSliceDefinition,
  routeIds: string[],
  causeEventId: string,
): OpenWorldSettlementResult<OpenWorldTravelReceipt[]> {
  const preview = structuredClone(state);
  const receipts: OpenWorldTravelReceipt[] = [];
  let anySettled = false;
  for (const routeId of routeIds) {
    const hop = settleOpenWorldForcedTravel(preview, definition, routeId, causeEventId);
    if (hop.status === 'rejected' || !hop.receipt) {
      return { status: 'rejected', reason: hop.reason };
    }
    if (hop.status === 'settled') anySettled = true;
    receipts.push(hop.receipt);
  }
  Object.assign(state, preview);
  return { status: anySettled ? 'settled' : 'idempotent', receipt: receipts };
}

/**
 * If already at the destination, record the historical hop without walking.
 * If standing on the route origin, settle normally. Never warp from a third zone.
 */
export function rememberOpenWorldForcedTravel(
  state: OpenWorldSliceRuntime,
  definition: OpenWorldSliceDefinition,
  routeId: string,
  causeEventId: string,
): OpenWorldSettlementResult<OpenWorldTravelReceipt> {
  const cause = String(causeEventId || '').trim();
  if (!cause) return { status: 'rejected', reason: 'missing_cause' };
  const already = existingForcedTravel(state, cause, routeId);
  if (already) return { status: 'idempotent', receipt: already };
  const route = routeById(definition, routeId);
  if (!route) return { status: 'rejected', reason: 'unknown_route' };
  const receipt: OpenWorldTravelReceipt = {
    receiptId: forcedTravelReceiptId(cause, routeId),
    routeId,
    fromZoneId: route.fromZoneId,
    toZoneId: route.toZoneId,
    departedAtTurn: state.elapsedTurns,
    arrivedAtTurn: state.elapsedTurns,
    turnCost: 0,
    mode: 'forced',
    causeEventId: cause,
  };
  state.travelReceipts.push(receipt);
  state.knownZoneIds = unique([...state.knownZoneIds, route.toZoneId]).filter(id => Boolean(zoneById(definition, id)));
  state.knownRouteIds = unique([...state.knownRouteIds, route.id]).filter(id => Boolean(routeById(definition, id)));
  return { status: 'settled', receipt };
}

export function backfillOrSettleForcedTravel(
  state: OpenWorldSliceRuntime,
  definition: OpenWorldSliceDefinition,
  routeId: string,
  causeEventId: string,
): OpenWorldSettlementResult<OpenWorldTravelReceipt> {
  const already = existingForcedTravel(state, causeEventId, routeId);
  if (already) return { status: 'idempotent', receipt: already };
  const route = routeById(definition, routeId);
  if (!route) return { status: 'rejected', reason: 'unknown_route' };
  if (state.currentZoneId === route.toZoneId) {
    const receipt: OpenWorldTravelReceipt = {
      receiptId: forcedTravelReceiptId(causeEventId, routeId),
      routeId,
      fromZoneId: route.fromZoneId,
      toZoneId: route.toZoneId,
      departedAtTurn: state.elapsedTurns,
      arrivedAtTurn: state.elapsedTurns,
      turnCost: 0,
      mode: 'forced',
      causeEventId,
    };
    state.travelReceipts.push(receipt);
    state.knownZoneIds = unique([...state.knownZoneIds, route.toZoneId]).filter(id => Boolean(zoneById(definition, id)));
    state.knownRouteIds = unique([...state.knownRouteIds, route.id]).filter(id => Boolean(routeById(definition, id)));
    return { status: 'settled', receipt };
  }
  return settleOpenWorldForcedTravel(state, definition, routeId, causeEventId);
}

export function presentOpenWorldNotice(notice: OpenWorldNotice): string {
  const reliability = notice.reliability === 'confirmed' ? '已证实' : notice.reliability === 'credible' ? '较可信' : '传闻';
  return `来源：${notice.source}｜可信度：${reliability}\n${notice.text}`;
}

export function readOpenWorldNotice(
  state: OpenWorldSliceRuntime,
  definition: OpenWorldSliceDefinition,
  noticeId: string,
  receiptId: string,
): OpenWorldSettlementResult<OpenWorldNoticeReceipt> {
  const existing = receiptConflict(state, receiptId);
  if (existing) {
    const receipt = state.noticeReceipts.find(item => item.receiptId === receiptId);
    return existing.kind === 'notice' && existing.identity === noticeId
      ? { status: 'idempotent', receipt }
      : { status: 'rejected', reason: 'receipt_conflict' };
  }
  const notice = definition.notices.find(item => item.id === noticeId);
  if (!notice) return { status: 'rejected', reason: 'unknown_notice' };
  if (notice.atZoneId !== state.currentZoneId) return { status: 'rejected', reason: 'wrong_location' };
  const receipt = { receiptId, noticeId, readAtTurn: state.elapsedTurns };
  state.noticeReceipts.push(receipt);
  state.knownZoneIds = unique([...state.knownZoneIds, ...(notice.unlockZoneIds || [])])
    .filter(id => Boolean(zoneById(definition, id)));
  state.knownRouteIds = unique([...state.knownRouteIds, ...(notice.unlockRouteIds || [])])
    .filter(id => Boolean(routeById(definition, id)));
  state.requirements = unique([...state.requirements, ...(notice.unlockRequirementKeys || [])]);
  appendChronicle(state, `notice:${receiptId}`, `你查阅了${notice.source}留下的消息`, `你得知了新的可追查去处，但仍保留其${notice.reliability === 'rumor' ? '传闻' : '可信'}属性`);
  return { status: 'settled', receipt };
}

export function matchOpenWorldProblemAction(
  state: OpenWorldSliceRuntime,
  definition: OpenWorldSliceDefinition,
  problemId: string,
  playerText: string,
): OpenWorldMatch<{ actionId: string }> {
  const text = normalize(playerText || '');
  if (!text) return { status: 'none' };
  const currentState = state.problemStates[problemId];
  const problem = definition.problems.find(item => item.id === problemId);
  if (!problem || problem.atZoneId !== state.currentZoneId) return { status: 'none' };
  const candidates = definition.actions.filter(action =>
    action.problemId === problemId && action.availableInStates.includes(currentState));
  const positive = candidates.filter(action => action.aliases.some(alias => includesPhrase(text, alias)));
  if (!positive.length) return { status: 'none' };
  if (positive.some(action => (action.rejectIf || []).some(term => includesPhrase(text, term)))) return { status: 'negated' };
  return positive.length === 1
    ? { status: 'matched', value: { actionId: positive[0].id } }
    : { status: 'ambiguous' };
}

export function settleOpenWorldProblemAction(
  state: OpenWorldSliceRuntime,
  definition: OpenWorldSliceDefinition,
  actionId: string,
  receiptId: string,
): OpenWorldSettlementResult<OpenWorldActionReceipt> {
  const existing = receiptConflict(state, receiptId);
  if (existing) {
    const receipt = state.actionReceipts.find(item => item.receiptId === receiptId);
    return existing.kind === 'action' && existing.identity === actionId
      ? { status: 'idempotent', receipt }
      : { status: 'rejected', reason: 'receipt_conflict' };
  }
  const action = actionById(definition, actionId);
  if (!action) return { status: 'rejected', reason: 'unknown_action' };
  const problem = definition.problems.find(item => item.id === action.problemId);
  if (!problem || problem.atZoneId !== state.currentZoneId) return { status: 'rejected', reason: 'wrong_location' };
  const currentState = state.problemStates[action.problemId];
  if (!action.availableInStates.includes(currentState)) return { status: 'rejected', reason: 'action_unavailable' };
  const receipt: OpenWorldActionReceipt = {
    receiptId,
    actionId,
    problemId: action.problemId,
    outcome: action.outcome,
    settledAtTurn: state.elapsedTurns,
    settledFacts: [...action.settledFacts],
    costs: [...(action.costs || [])],
  };
  state.actionReceipts.push(receipt);
  state.problemStates[action.problemId] = action.nextProblemState;
  for (const consequence of action.consequences || []) {
    if (consequence.actorId && !actorById(definition, consequence.actorId)) continue;
    const pendingReceiptId = `${receiptId}:${consequence.id}`;
    if (state.pendingConsequences.some(item => item.receiptId === pendingReceiptId)
      || state.consequenceReceipts.some(item => item.receiptId === pendingReceiptId)) continue;
    state.pendingConsequences.push({
      receiptId: pendingReceiptId,
      consequenceId: consequence.id,
      dueTurn: state.elapsedTurns + consequence.delayTurns,
      cause: consequence.cause,
      effect: consequence.effect,
      actorId: consequence.actorId,
      apply: consequence.apply,
    });
  }
  appendChronicle(state, `action:${receiptId}`, action.actionText, `${problem?.title || '眼前问题'}进入了新的局面：${action.nextProblemState}`);
  return { status: 'settled', receipt };
}

function applyConsequenceEffect(
  state: OpenWorldSliceRuntime,
  definition: OpenWorldSliceDefinition,
  pending: OpenWorldPendingConsequence,
): void {
  const effect = pending.apply;
  if (!effect) return;
  if (pending.actorId) {
    const actor = actorById(definition, pending.actorId);
    const actorState = state.actorStates[pending.actorId];
    if (actor && actorState) {
      if (effect.actorStatus !== undefined) actorState.status = effect.actorStatus;
      if (effect.actorZoneId && zoneById(definition, effect.actorZoneId)) actorState.currentZoneId = effect.actorZoneId;
    }
  }
  if (effect.problemId && effect.problemState && definition.problems.some(item => item.id === effect.problemId)) {
    state.problemStates[effect.problemId] = effect.problemState;
  }
  state.knownZoneIds = unique([...state.knownZoneIds, ...(effect.unlockZoneIds || [])])
    .filter(id => Boolean(zoneById(definition, id)));
  state.knownRouteIds = unique([...state.knownRouteIds, ...(effect.unlockRouteIds || [])])
    .filter(id => Boolean(routeById(definition, id)));
  state.requirements = unique([...state.requirements, ...(effect.unlockRequirementKeys || [])]);
}

function settleDueConsequences(state: OpenWorldSliceRuntime, definition: OpenWorldSliceDefinition): void {
  const due = state.pendingConsequences.filter(item => item.dueTurn <= state.elapsedTurns);
  state.pendingConsequences = state.pendingConsequences.filter(item => item.dueTurn > state.elapsedTurns);
  for (const pending of due) {
    if (state.consequenceReceipts.some(item => item.receiptId === pending.receiptId)) continue;
    applyConsequenceEffect(state, definition, pending);
    const receipt = { ...pending, settledAtTurn: state.elapsedTurns };
    state.consequenceReceipts.push(receipt);
    appendChronicle(state, `consequence:${pending.receiptId}`, pending.cause, pending.effect);
  }
}

export function advanceOpenWorldTurns(
  state: OpenWorldSliceRuntime,
  definition: OpenWorldSliceDefinition,
  turns = 1,
): void {
  state.elapsedTurns += Math.max(0, Math.trunc(turns));
  settleDueConsequences(state, definition);
}

export function getOpenWorldSliceView(state: OpenWorldSliceRuntime, definition: OpenWorldSliceDefinition): {
  currentLocation: string;
  destinations: Array<{ routeId: string; label: string; destination: string; turnCost: number }>;
  notices: Array<{ id: string; presentation: string }>;
  actorsHere: Array<{ id: string; name: string; desire: string; status: string }>;
  problems: Array<{ id: string; title: string; objective: string; state: string; actions: Array<{ id: string; label: string; actionText: string }> }>;
} {
  const currentLocation = zoneById(definition, state.currentZoneId)?.name || '位置未明';
  const destinations = reachableRoutes(state, definition).map(route => ({
    routeId: route.id,
    label: route.label,
    destination: zoneById(definition, route.toZoneId)?.name || '去处未明',
    turnCost: route.turnCost,
  }));
  const notices = definition.notices
    .filter(notice => notice.atZoneId === state.currentZoneId
      && !state.noticeReceipts.some(receipt => receipt.noticeId === notice.id))
    .map(notice => ({ id: notice.id, presentation: presentOpenWorldNotice(notice) }));
  const actorsHere = definition.actors.flatMap(actor => {
    const actorState = state.actorStates[actor.id];
    return actorState?.currentZoneId === state.currentZoneId
      ? [{ id: actor.id, name: actor.name, desire: actorState.desire, status: actorState.status }]
      : [];
  });
  const problems = definition.problems.filter(problem => problem.atZoneId === state.currentZoneId).map(problem => {
    const problemState = state.problemStates[problem.id];
    return {
      id: problem.id,
      title: problem.title,
      objective: problem.objective,
      state: problemState,
      actions: definition.actions.filter(action =>
        action.problemId === problem.id && action.availableInStates.includes(problemState))
        .map(action => ({ id: action.id, label: action.label, actionText: action.actionText })),
    };
  }).filter(problem => problem.actions.length > 0);
  return { currentLocation, destinations, notices, actorsHere, problems };
}

function allDone(eventIds: string[] | undefined, done: ReadonlySet<string>): boolean {
  return Boolean(eventIds?.length) && eventIds!.every(id => done.has(id));
}

/** 节点所属行旅区：自身 areaId，否则沿父节点向上找。 */
export function areaIdOf(definition: OpenWorldSliceDefinition, zoneId: string): string {
  let current = zoneById(definition, zoneId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.areaId) return current.areaId;
    current = current.parentZoneId ? zoneById(definition, current.parentZoneId) : undefined;
  }
  return '';
}

/** 自由段是否开放。未声明 freeRoamWhen 的区不开放（04 全关、古道→入峒等强制段）。 */
export function areaFreeRoamOpen(area: OpenWorldArea | undefined, doneEventIds: Iterable<string>): boolean {
  const window = area?.freeRoamWhen;
  if (!window) return false;
  const done = new Set(doneEventIds);
  if (window.after?.length && !allDone(window.after, done)) return false;
  return !allDone(window.until, done);
}

/** 当前时点的区域背景：最后一条 when 全部完成的段落；都不满足则空。 */
export function areaBackground(area: OpenWorldArea | undefined, doneEventIds: Iterable<string>): string {
  const done = new Set(doneEventIds);
  const hit = (area?.background || []).filter(item => item.when.length === 0 || allDone(item.when, done));
  return hit.at(-1)?.text || '';
}

export function routeUnlocked(route: OpenWorldRoute, doneEventIds: Iterable<string>): boolean {
  return !route.unlockWhen?.length || allDone(route.unlockWhen, new Set(doneEventIds));
}

/** 由触发找强制路线：前一拍完成或转关。 */
export function forcedRoutesFor(definition: OpenWorldSliceDefinition, trigger: OpenWorldForcedBy): OpenWorldRoute[] {
  return definition.routes.filter(route => {
    const by = route.forcedBy;
    if (!by) return false;
    if ('afterEventDone' in trigger) return 'afterEventDone' in by && by.afterEventDone === trigger.afterEventDone;
    return 'stageTransition' in by && by.stageTransition === trigger.stageTransition;
  });
}

/**
 * 地点三态，推导不存储：
 * 到过＝当前所在或任一回执的起止点；听闻＝heardWhen 全部完成；其余一律隐藏（fail closed）。
 */
export function zoneVisibility(
  state: OpenWorldSliceRuntime,
  definition: OpenWorldSliceDefinition,
  zoneId: string,
  doneEventIds: Iterable<string>,
): OpenWorldVisibility {
  const zone = zoneById(definition, zoneId);
  if (!zone) return 'hidden';
  if (state.currentZoneId === zoneId
    || state.travelReceipts.some(item => item.toZoneId === zoneId || item.fromZoneId === zoneId)) return 'visited';
  return allDone(zone.heardWhen, new Set(doneEventIds)) ? 'heard' : 'hidden';
}

const VISIBILITY_RANK: Record<OpenWorldVisibility, number> = { hidden: 0, heard: 1, visited: 2 };

/** 世界地点（按规范 id 比较）的三态：取挂在它下面所有节点的最高态；定义里没有的地点一律隐藏。 */
export function worldLocationVisibility(
  state: OpenWorldSliceRuntime,
  definition: OpenWorldSliceDefinition,
  worldLocationId: string,
  doneEventIds: Iterable<string>,
): OpenWorldVisibility {
  const target = canonicalLocationId(worldLocationId);
  const done = [...doneEventIds];
  return definition.zones
    .filter(zone => canonicalLocationId(worldLocationIdOf(definition, zone.id)) === target)
    .map(zone => zoneVisibility(state, definition, zone.id, done))
    .reduce<OpenWorldVisibility>((best, item) => (VISIBILITY_RANK[item] > VISIBILITY_RANK[best] ? item : best), 'hidden');
}

export interface OpenWorldZoneTravelStatus {
  visibility: OpenWorldVisibility;
  current: boolean;
  /** 当前可沿已知 local 路线主动前往。 */
  canTravel: boolean;
  /** 到过但现在去不了（不在当前区、自由段未开或被 rail 甩在身后）：可查看，不能前往，不再新生成区域图。 */
  label?: '到过·当前不可前往';
}

export function zoneTravelStatus(
  state: OpenWorldSliceRuntime,
  definition: OpenWorldSliceDefinition,
  zoneId: string,
  doneEventIds: Iterable<string>,
): OpenWorldZoneTravelStatus {
  const done = [...doneEventIds];
  const visibility = zoneVisibility(state, definition, zoneId, done);
  const current = state.currentZoneId === zoneId;
  const currentAreaId = areaIdOf(definition, state.currentZoneId);
  const area = (definition.areas || []).find(item => item.id === currentAreaId);
  const canTravel = visibility === 'visited' && !current
    && Boolean(currentAreaId) && areaIdOf(definition, zoneId) === currentAreaId
    && areaFreeRoamOpen(area, done)
    && reachableRoutes(state, definition).some(route => route.toZoneId === zoneId && routeUnlocked(route, done));
  return {
    visibility,
    current,
    canTravel,
    ...(visibility === 'visited' && !current && !canTravel ? { label: '到过·当前不可前往' as const } : {}),
  };
}
