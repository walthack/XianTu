export type OpenWorldReliability = 'confirmed' | 'credible' | 'rumor';
export type OpenWorldProblemOutcome = 'success' | 'partial' | 'failure-forward';
export type OpenWorldZoneKind = 'settlement' | 'street' | 'interior' | 'compound';
export type OpenWorldTravelMode = 'player' | 'forced';

export interface OpenWorldZone {
  id: string;
  name: string;
  aliases?: string[];
  kind?: OpenWorldZoneKind;
  parentZoneId?: string;
  worldLocationId?: string;
  /** Containers default not standable. Leaves default standable. */
  standable?: boolean;
}

export interface OpenWorldRoute {
  id: string;
  fromZoneId: string;
  toZoneId: string;
  label: string;
  aliases?: string[];
  turnCost: number;
  requirementKey?: string;
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
    route.fromZoneId === state.currentZoneId
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
  const receipts: OpenWorldTravelReceipt[] = [];
  let anySettled = false;
  for (const routeId of routeIds) {
    const hop = settleOpenWorldForcedTravel(state, definition, routeId, causeEventId);
    if (hop.status === 'rejected' || !hop.receipt) {
      return { status: 'rejected', reason: hop.reason, receipt: receipts };
    }
    if (hop.status === 'settled') anySettled = true;
    receipts.push(hop.receipt);
  }
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
