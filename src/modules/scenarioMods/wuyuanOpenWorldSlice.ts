import type { JudgementKind } from '@/utils/judgementEngine';
import {entityNamePattern,entityRecognitionLabel} from './namedEntities';
import {entityName} from './namedEntities';
import {refreshSaveEntityReferences} from './entitySaveRefs';
import {canonicalEntityId} from './namedEntities';
import type { SaveData } from '@/types/game';

import {
  advanceOpenWorldTurns,
  getOpenWorldSliceView,
  hydrateOpenWorldSliceRuntime,
  matchOpenWorldProblemAction,
  matchOpenWorldTravelInput,
  readOpenWorldNotice,
  rememberOpenWorldForcedTravel,
  settleOpenWorldForcedTravel,
  settleOpenWorldForcedTravelChain,
  settleOpenWorldProblemAction,
  settleOpenWorldTravel,
  type OpenWorldSliceDefinition,
  type OpenWorldSliceRuntime,
  type OpenWorldTravelReceipt,
} from './openWorldSlice';
import {
  advanceScenarioRuntime,
  getScenarioFocusEvent,
  getCurrentStoryEventActions,
  recordStoryEventStructuredAction,
  type ScenarioEventActionSelection,
} from './runtime';
import { storyRouteLocation } from './eventNarrativeView';
import { locationFromPosition } from './travel/travelLedger';
import { applyTimelineInserts } from './timelineInserts';
import {
  HALL_ZONE_ID,
  MARKET_ZONE_ID,
  PASTRY_ZONE_ID,
  PRISON_ZONE_ID,
  WUYUAN_WORLD_LOCATION_ID,
} from './travel/defs/qingyuWuyuanZones';
import { CONTENT_PACKS } from '../contentPacks';
import { resolveOpenWorldSlice, type TsOpenWorldSlicePart } from './travel/openWorldSlices';

export type WuyuanOpenWorldSelection = {
  source: 'open_world_engine';
  kind: 'travel' | 'notice' | 'problem_action';
  identityId: string;
  receiptId: string;
  label: string;
  actionText: string;
  settledFacts: string[];
  timeCost?: number;
  /** 作者写给拍子判定小请求看的动作描述（只发给模型，不参与按字匹配）。 */
  intentMatch?: { describe: string };
  /** 作者声明的判定类别（掷骰第一档）：拍子判中此动作时按这个类别出风险判定卡，不靠旧风险词表。 */
  judgement?: { kind: JudgementKind };
};

/**
 * TS 侧的五原切片（除节点表外的一份）：已整份搬进内容包，只留 key。B8（2026-11-11）起五原切片的数据（路线、告示、角色、问题、动作、
 * 节点深浅、判定类别、动作描述，以及逻辑代码按名取的 id）整份在塞外包 open-world-slices.json（key 'wuyuan'，原注释在条目 note 里）；
 * 下面的导出名不变，从解析结果取。
 */
export const TS_WUYUAN_OPEN_WORLD_SLICE: TsOpenWorldSlicePart = { key: 'wuyuan' };

const WUYUAN = resolveOpenWorldSlice(CONTENT_PACKS.openWorldSlices || [], TS_WUYUAN_OPEN_WORLD_SLICE);
const wuyuanId = (name: string): string => WUYUAN.constants?.[name] || '';
export const WUYUAN_OPEN_WORLD_SLICE_ID: string = WUYUAN.definition.id;
export const WUYUAN_SETTLEMENT_ID = wuyuanId('WUYUAN_SETTLEMENT_ID');
export const WUYUAN_MARKET_ARRIVAL_ID = wuyuanId('WUYUAN_MARKET_ARRIVAL_ID');
export { WUYUAN_WORLD_LOCATION_ID };
const PASTRY_TO_PRISON_ROUTE = wuyuanId('PASTRY_TO_PRISON_ROUTE');
const MARKET_TO_PRISON_ROUTE = wuyuanId('MARKET_TO_PRISON_ROUTE');
const PRISON_TO_HALL_ROUTE = wuyuanId('PRISON_TO_HALL_ROUTE');
const HALL_TO_GATE_ROUTE = wuyuanId('HALL_TO_GATE_ROUTE');
const EXIT_FRONT_GATE_ROUTE = wuyuanId('EXIT_FRONT_GATE_ROUTE');
const WUYUAN_LEAF_RANK: Readonly<Record<string, number>> = WUYUAN.zoneRanks || {};
export const WUYUAN_OPEN_WORLD_DEFINITION: OpenWorldSliceDefinition = WUYUAN.definition;
export const WUYUAN_PROBLEM_ACTION_JUDGEMENT: Readonly<Record<string, { kind: JudgementKind }>> = WUYUAN.actionJudgement || {};
export const WUYUAN_PROBLEM_ACTION_DESCRIBE: Readonly<Record<string, string>> = WUYUAN.actionDescribe || {};

type RuntimeWithSlice = {
  modId?: string;
  storyMode?: string;
  worldTurn?: number;
  activeEventIds?: string[];
  completedEventIds?: string[];
  openWorldSlice?: OpenWorldSliceRuntime;
  openWorldSliceLastWorldTurn?: number;
};

function runtimeOf(saveData: SaveData): RuntimeWithSlice | undefined {
  return (saveData as any)?.世界?.状态?.剧本模组;
}

// 场外到点收束的拍（offscreenResolvedEventIds）同样算已发生：s02_02／s02_03 战局停滞后由世界收束时，
// 只认 completedEventIds 会让「王哲已殉」永远不成立，五原切片不开、s02_04 永远完成不了（REPORT-8091-ef573ece P1）。
function completedIds(runtime: RuntimeWithSlice): string[] {
  return [...(runtime.completedEventIds || []), ...((runtime as { offscreenResolvedEventIds?: string[] }).offscreenResolvedEventIds || [])];
}

function wangZheFallen(runtime: RuntimeWithSlice): boolean {
  return completedIds(runtime).includes('lcq.event.s02_02');
}

function playerLocationDescription(saveData: SaveData): string {
  return String((saveData as { 角色?: { 位置?: { 描述?: unknown } } })?.角色?.位置?.描述 || '');
}

function playerInWuyuan(saveData: SaveData, runtime: RuntimeWithSlice): boolean {
  const desc = playerLocationDescription(saveData);
  if (desc.includes(entityRecognitionLabel('location','liuchao.location.wuyuan','short'))) return true;
  const locId = locationFromPosition(desc, (runtime as { canon?: { locations?: Array<{ id: string; name: string }> } }).canon?.locations).locationId;
  return locId === 'liuchao.location.wuyuan';
}

function hasDepartedWuyuan(runtime: RuntimeWithSlice): boolean {
  const routeEvents = ['lcq.event.iron_bridge_ambush', 'lcq.event.ningyu_regicide_offer', 'lcq.event.zixi_taiyi_intercept', 'lcq.event.rainforest_black_shoal', 'lcq.event.silent_sheyi_village'];
  return completedIds(runtime).includes('lcq.event.wuerlang_joins')
    || [...(runtime.activeEventIds || []), ...completedIds(runtime)].some(id => routeEvents.includes(id));
}

function inWuyuanSlice(runtime: RuntimeWithSlice, saveData: SaveData): boolean {
  if (runtime.modId !== 'lcq.stage_02' || !wangZheFallen(runtime) || hasDepartedWuyuan(runtime)) return false;
  if (playerInWuyuan(saveData, runtime)) return true;
  return completedIds(runtime).some(id => (
    id === 'lcq.event.s02_04' || id === 'lcq.event.s02_05' || id === 'lcq.event.s02_06'
  ));
}

function isWuyuanMarketTravelText(playerText: string): boolean {
  const normalized = playerText.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '');
  if (!normalized) return false;
  if (normalized.includes(entityName("location","lcq.zone.wuyuan.pastry_shop")) || normalized.includes('糕饼铺') || normalized.includes('后巷')) return false;
  return new RegExp(`(?:去|前往)(?:${entityNamePattern('location','liuchao.location.wuyuan')})|去市集`).test(normalized);
}

function leafRank(zoneId: string): number {
  return WUYUAN_LEAF_RANK[zoneId] ?? 0;
}

function applyForcedHop(state: OpenWorldSliceRuntime, routeId: string, causeEventId: string): void {
  const route = WUYUAN_OPEN_WORLD_DEFINITION.routes.find(item => item.id === routeId);
  if (!route) return;
  if (state.currentZoneId === route.fromZoneId) {
    settleOpenWorldForcedTravel(state, WUYUAN_OPEN_WORLD_DEFINITION, routeId, causeEventId);
    return;
  }
  if (leafRank(state.currentZoneId) >= leafRank(route.toZoneId)) {
    rememberOpenWorldForcedTravel(state, WUYUAN_OPEN_WORLD_DEFINITION, routeId, causeEventId);
  }
}

function applyCanonForcedRoutes(runtime: RuntimeWithSlice): OpenWorldTravelReceipt[] {
  const state = runtime.openWorldSlice;
  if (!state) return [];
  const before = state.travelReceipts.length;
  const completed = completedIds(runtime);
  if (completed.includes('lcq.event.s02_04')) {
    if (state.currentZoneId === PASTRY_ZONE_ID) applyForcedHop(state, PASTRY_TO_PRISON_ROUTE, 'lcq.event.s02_04');
    else if (state.currentZoneId === MARKET_ZONE_ID) applyForcedHop(state, MARKET_TO_PRISON_ROUTE, 'lcq.event.s02_04');
    else applyForcedHop(state, PASTRY_TO_PRISON_ROUTE, 'lcq.event.s02_04');
  }
  if (completed.includes('lcq.event.s02_06') || (completed.includes('lcq.event.s02_05') && leafRank(state.currentZoneId) >= leafRank(HALL_ZONE_ID))) {
    applyForcedHop(state, PRISON_TO_HALL_ROUTE, completed.includes('lcq.event.s02_06') ? 'lcq.event.s02_06' : 'lcq.event.s02_05');
  }
  if (completed.includes('lcq.event.baihu_shangguan_escape')) {
    if (state.currentZoneId === HALL_ZONE_ID) {
      settleOpenWorldForcedTravelChain(
        state,
        WUYUAN_OPEN_WORLD_DEFINITION,
        [HALL_TO_GATE_ROUTE, EXIT_FRONT_GATE_ROUTE],
        'lcq.event.baihu_shangguan_escape',
      );
    } else {
      applyForcedHop(state, HALL_TO_GATE_ROUTE, 'lcq.event.baihu_shangguan_escape');
      applyForcedHop(state, EXIT_FRONT_GATE_ROUTE, 'lcq.event.baihu_shangguan_escape');
    }
  }
  return state.travelReceipts.slice(before);
}

function projectPlayerPosition(saveData: SaveData, state: OpenWorldSliceRuntime): void {
  const zone = WUYUAN_OPEN_WORLD_DEFINITION.zones.find(item => item.id === state.currentZoneId);
  const position = (saveData as any)?.角色?.位置;
  if (!zone || !position || typeof position !== 'object') return;
  position.zoneId=zone.id;
  position.locationId=canonicalEntityId('location',zone.worldLocationId || 'liuchao.location.wuyuan');
  position.描述 = `中州·五原·${zone.name}`;
}

function hydrateWuyuanSlice(runtime: RuntimeWithSlice): OpenWorldSliceRuntime {
  const next = hydrateOpenWorldSliceRuntime(runtime.openWorldSlice, WUYUAN_OPEN_WORLD_DEFINITION);
  if (runtime.openWorldSlice && runtime.openWorldSlice.sliceId === WUYUAN_OPEN_WORLD_SLICE_ID) {
    Object.assign(runtime.openWorldSlice, next);
  } else {
    runtime.openWorldSlice = next;
  }
  if (!runtime.openWorldSlice.knownZoneIds.includes('lcq.zone.wuyuan.pastry_shop')) {
    runtime.openWorldSlice.knownZoneIds.push('lcq.zone.wuyuan.pastry_shop');
  }
  if (!runtime.openWorldSlice.knownRouteIds.includes('lcq.route.wuyuan.market_to_pastry_street')) {
    runtime.openWorldSlice.knownRouteIds.push('lcq.route.wuyuan.market_to_pastry_street');
  }
  if (!runtime.openWorldSlice.knownRouteIds.includes('lcq.route.wuyuan.pastry_to_market_street')) {
    runtime.openWorldSlice.knownRouteIds.push('lcq.route.wuyuan.pastry_to_market_street');
  }
  const now = Math.max(0, Number(runtime.worldTurn) || 0);
  const last = runtime.openWorldSliceLastWorldTurn;
  if (typeof last === 'number' && now > last) {
    advanceOpenWorldTurns(runtime.openWorldSlice, WUYUAN_OPEN_WORLD_DEFINITION, now - last);
  }
  runtime.openWorldSliceLastWorldTurn = now;
  return runtime.openWorldSlice;
}

export function ensureWuyuanOpenWorldSlice(saveData: SaveData): OpenWorldSliceRuntime | undefined {
  const runtime = runtimeOf(saveData);
  if (!runtime) return undefined;
  if (hasDepartedWuyuan(runtime)) {
    const focus = getScenarioFocusEvent(runtime as any);
    const ledger = (runtime as { travelLedger?: unknown }).travelLedger as { doneEventIds?: string[]; deferredDepartureEventIds?: string[] } | undefined;
    // 可选姿态拍的窗口开着时，玩家停在上一拍的路上节点（行程账负责），不跟着下一主线拍的地点走。
    const held = (ledger?.deferredDepartureEventIds || []).some(id => !ledger?.doneEventIds?.includes(id));
    const location = focus && !held ? storyRouteLocation(focus.id) : undefined;
    if (location &&(saveData as any)?.角色?.位置) { (saveData as any).角色.位置.描述 = `中州·${location}`; refreshSaveEntityReferences(saveData); }
    return undefined;
  }
  if (!inWuyuanSlice(runtime, saveData)) return undefined;
  const state = hydrateWuyuanSlice(runtime);
  // 没走「前往五原」路线就到了城里（位置直写等侧门）：进切片即算过了草原四年，同样拨一次时间线。
  applyTimelineInserts(saveData);
  applyCanonForcedRoutes(runtime);
  projectPlayerPosition(saveData, state);
  return state;
}

function receiptId(state: OpenWorldSliceRuntime, kind: WuyuanOpenWorldSelection['kind'], id: string): string {
  return `${WUYUAN_OPEN_WORLD_SLICE_ID}:${kind}:${id}:${state.elapsedTurns}`;
}

function marketArrivalSelection(saveData: SaveData): WuyuanOpenWorldSelection {
  const from = playerLocationDescription(saveData) || entityName("location","lcq.location.shuai_zhang");
  const to = '五原露天市集';
  return {
    source: 'open_world_engine',
    kind: 'travel',
    identityId: WUYUAN_MARKET_ARRIVAL_ID,
    receiptId: `${WUYUAN_OPEN_WORLD_SLICE_ID}:travel:${WUYUAN_MARKET_ARRIVAL_ID}:arrive`,
    label: '前往 · 五原露天市集', timeCost: 1,
    actionText: '我去五原城。',
    settledFacts: [`你从${from}出发`, `你抵达${to}`, '路程消耗1轮'],
  };
}

export function getWuyuanOpenWorldSelections(saveData: SaveData): WuyuanOpenWorldSelection[] {
  const runtime = runtimeOf(saveData);
  if (!runtime || runtime.modId !== 'lcq.stage_02' || !wangZheFallen(runtime) || hasDepartedWuyuan(runtime)) return [];
  if (!inWuyuanSlice(runtime, saveData)) return [marketArrivalSelection(saveData)];
  const state = ensureWuyuanOpenWorldSlice(saveData);
  if (!state) return [];
  const view = getOpenWorldSliceView(state, WUYUAN_OPEN_WORLD_DEFINITION);
  // 点心铺的应对（完成 s02_04 的唯一入口）排在最前：首条建议若是「前往」会把人带离问题所在地，来回走永远进不了 s02_04（REPORT-8091-f76e07a7 ⑧）。
  const problemActions = view.problems.flatMap(problem => problem.actions.map(action => {
    const definition = WUYUAN_OPEN_WORLD_DEFINITION.actions.find(item => item.id === action.id)!;
    return {
      source: 'open_world_engine' as const, kind: 'problem_action' as const, identityId: action.id,
      receiptId: receiptId(state, 'problem_action', action.id), label: action.label, timeCost: 1, actionText: action.actionText,
      ...(WUYUAN_PROBLEM_ACTION_DESCRIBE[action.id] ? { intentMatch: { describe: WUYUAN_PROBLEM_ACTION_DESCRIBE[action.id] } } : {}),
      ...(WUYUAN_PROBLEM_ACTION_JUDGEMENT[action.id] ? { judgement: { ...WUYUAN_PROBLEM_ACTION_JUDGEMENT[action.id] } } : {}),
      settledFacts: [...definition.settledFacts, ...(definition.costs || []).map(cost => `代价：${cost}`)],
    };
  }));
  return [
    ...problemActions,
    ...view.destinations.map(item => ({
      source: 'open_world_engine' as const, kind: 'travel' as const, identityId: item.routeId,
      receiptId: receiptId(state, 'travel', item.routeId), label: `前往 · ${item.destination}`, timeCost: item.turnCost,
      actionText: `我选择${item.label}，前往${item.destination}。`,
      settledFacts: [`你从${view.currentLocation}出发`, `你沿“${item.label}”前往${item.destination}`, `路程消耗${item.turnCost}轮`],
    })),
    ...view.notices.filter((item, index, items) => items.findIndex(other => other.presentation === item.presentation) === index).map(item => ({
      source: 'open_world_engine' as const, kind: 'notice' as const, identityId: item.id,
      receiptId: receiptId(state, 'notice', item.id), label: `查看 · ${item.id === 'lcq.notice.wuyuan.market_layout' ? '市集木牌' : item.id === 'lcq.notice.wuyuan.pastry_back_alley' ? '摊主提醒' : '地方消息'}`, timeCost: 1,
      actionText: `我停下来查看这条现场消息：${item.presentation}`,
      settledFacts: [item.presentation],
    })),
  ];
}

export function resolveWuyuanOpenWorldSelectionFromText(saveData: SaveData, playerText: string): WuyuanOpenWorldSelection | undefined {
  const runtime = runtimeOf(saveData);
  if (!runtime || !wangZheFallen(runtime)) return undefined;
  if (!inWuyuanSlice(runtime, saveData)) {
    if (!isWuyuanMarketTravelText(playerText)) return undefined;
    return marketArrivalSelection(saveData);
  }
  const state = ensureWuyuanOpenWorldSlice(saveData);
  if (!state) return undefined;
  const available = getWuyuanOpenWorldSelections(saveData);
  const travel = matchOpenWorldTravelInput(state, WUYUAN_OPEN_WORLD_DEFINITION, playerText);
  if (travel.status === 'matched') return available.find(item => item.kind === 'travel' && item.identityId === travel.value.routeId);
  const problem = WUYUAN_OPEN_WORLD_DEFINITION.problems.find(item => item.atZoneId === state.currentZoneId);
  if (problem) {
    const action = matchOpenWorldProblemAction(state, WUYUAN_OPEN_WORLD_DEFINITION, problem.id, playerText);
    if (action.status === 'matched') return available.find(item => item.kind === 'problem_action' && item.identityId === action.value.actionId);
  }
  return undefined;
}

function settleArriveWuyuanMarket(saveData: SaveData, selection: WuyuanOpenWorldSelection): {
  settled: boolean;
  idempotent: boolean;
  reason?: string;
  settledFacts: string[];
} {
  const runtime = runtimeOf(saveData);
  if (!runtime || !wangZheFallen(runtime) || selection?.identityId !== WUYUAN_MARKET_ARRIVAL_ID) {
    return { settled: false, idempotent: false, reason: 'inactive_slice', settledFacts: [] };
  }
  const state = hydrateWuyuanSlice(runtime);
  const already = state.travelReceipts.some(item => item.routeId === WUYUAN_MARKET_ARRIVAL_ID);
  if (already && playerInWuyuan(saveData, runtime) && state.currentZoneId === MARKET_ZONE_ID) {
    return { settled: true, idempotent: true, settledFacts: selection.settledFacts };
  }
  const fromName = playerLocationDescription(saveData) || entityName("location","lcq.location.shuai_zhang");
  const departedAtTurn = state.elapsedTurns;
  state.elapsedTurns += 1;
  state.currentZoneId = MARKET_ZONE_ID;
  state.knownZoneIds = [...new Set([...state.knownZoneIds, MARKET_ZONE_ID])];
  const receiptId = selection.receiptId;
  if (!state.travelReceipts.some(item => item.receiptId === receiptId)) {
    state.travelReceipts.push({
      receiptId,
      routeId: WUYUAN_MARKET_ARRIVAL_ID,
      fromZoneId: 'lcq.location.command_tent',
      toZoneId: MARKET_ZONE_ID,
      departedAtTurn,
      arrivedAtTurn: state.elapsedTurns,
      turnCost: 1,
      mode: 'player',
    });
  }
  const to = WUYUAN_OPEN_WORLD_DEFINITION.zones.find(zone => zone.id === MARKET_ZONE_ID)?.name || '五原露天市集';
  if (!state.chronicle.some(entry => entry.id === `travel:${receiptId}`)) {
    state.chronicle.push({
      id: `travel:${receiptId}`,
      atTurn: state.elapsedTurns,
      cause: `你从${fromName}前往五原`,
      effect: `你在付出1轮路程后抵达${to}`,
      text: `因为你从${fromName}前往五原，所以你在付出1轮路程后抵达${to}`,
    });
  }
  applyTimelineInserts(saveData);
  projectPlayerPosition(saveData, state);
  return { settled: true, idempotent: false, settledFacts: selection.settledFacts };
}

export function settleWuyuanOpenWorldSelection(saveData: SaveData, selection: WuyuanOpenWorldSelection): {
  settled: boolean;
  idempotent: boolean;
  reason?: string;
  settledFacts: string[];
  canonEventCompleted?: boolean;
} {
  if (selection?.identityId === WUYUAN_MARKET_ARRIVAL_ID) {
    return settleArriveWuyuanMarket(saveData, selection);
  }
  const runtime = runtimeOf(saveData);
  if (!runtime || selection?.source !== 'open_world_engine' || !ensureWuyuanOpenWorldSlice(saveData)) {
    return { settled: false, idempotent: false, reason: 'inactive_slice', settledFacts: [] };
  }
  const current = getWuyuanOpenWorldSelections(saveData).find(item =>
    item.kind === selection.kind && item.identityId === selection.identityId);
  const state = runtime.openWorldSlice;
  if (!state) {
    return { settled: false, idempotent: false, reason: 'inactive_slice', settledFacts: [] };
  }
  if (!current) {
    const already = selection.kind === 'travel'
      ? state.travelReceipts.some(item => item.routeId === selection.identityId || item.receiptId === selection.receiptId)
      : selection.kind === 'notice'
        ? state.noticeReceipts.some(item => item.noticeId === selection.identityId || item.receiptId === selection.receiptId)
        : state.actionReceipts.some(item => item.actionId === selection.identityId || item.receiptId === selection.receiptId);
    return already
      ? { settled: true, idempotent: true, settledFacts: selection.settledFacts }
      : { settled: false, idempotent: false, reason: 'stale_selection', settledFacts: [] };
  }
  const receiptId = current.receiptId;
  const result = selection.kind === 'travel'
    ? settleOpenWorldTravel(state, WUYUAN_OPEN_WORLD_DEFINITION, selection.identityId, receiptId)
    : selection.kind === 'notice'
      ? readOpenWorldNotice(state, WUYUAN_OPEN_WORLD_DEFINITION, selection.identityId, receiptId)
      : settleOpenWorldProblemAction(state, WUYUAN_OPEN_WORLD_DEFINITION, selection.identityId, receiptId);
  if (result.status === 'rejected') {
    return { settled: false, idempotent: false, reason: result.reason, settledFacts: [] };
  }
  projectPlayerPosition(saveData, state);
  let canonEventCompleted = false;
  if (selection.kind === 'problem_action') {
    const eventSelection = getCurrentStoryEventActions(saveData)
      .find(item => item.eventId === 'lcq.event.s02_04');
    if (eventSelection) canonEventCompleted = recordStoryEventStructuredAction(saveData, eventSelection).completed;
    if (canonEventCompleted) ensureWuyuanOpenWorldSlice(saveData);
  }
  return {
    settled: true,
    idempotent: result.status === 'idempotent',
    settledFacts: selection.settledFacts,
    ...(canonEventCompleted ? { canonEventCompleted } : {}),
  };
}

const WUYUAN_GATE_LEAK_RE = /城门|门洞|城墙|县衙/;
const WUYUAN_MECHANIC_LEAK_RE = /已经结算|没落地|把结果认下来|没有官署可过|回执|机制/;

function playerFacingFact(fact: string): boolean {
  if (!fact) return false;
  return !WUYUAN_GATE_LEAK_RE.test(fact) && !WUYUAN_MECHANIC_LEAK_RE.test(fact);
}

/** Local hop/action prose from the already-final slice, not from a mid-transaction pastry snapshot. */
export function composeWuyuanOpenWorldNarrative(
  saveData: SaveData,
  selection: WuyuanOpenWorldSelection,
): string {
  const state = ensureWuyuanOpenWorldSlice(saveData);
  const zoneId = state?.currentZoneId || '';
  const lines = (selection.settledFacts || [])
    .map(item => String(item || '').trim())
    .filter(playerFacingFact)
    .map(fact => /[。！？]$/.test(fact) ? fact : `${fact}。`);
  if (zoneId === MARKET_ZONE_ID) {
    lines.push('露天货棚和摊位挤在这一片，摊位直接铺到街面上。');
  } else if (zoneId === PASTRY_ZONE_ID) {
    lines.push('点心铺这一侧，甜香和麦粉味压过街面的尘。');
  } else if (zoneId === PRISON_ZONE_ID) {
    if (!lines.some(line => /押入|水牢/.test(line))) lines.push('你被押入白湖商馆水牢。');
    lines.push('水汽和石壁压得很近。你还在商馆这一截里。');
  } else {
    const place = WUYUAN_OPEN_WORLD_DEFINITION.zones.find(zone => zone.id === zoneId)?.name;
    if (place && !lines.some(line => line.includes(place))) lines.push(`你来到${place}。`);
  }
  return lines.filter(line => playerFacingFact(line)).join('');
}

/** Clone-and-preview the formal transaction, then compose. The clone is discarded. */
export function previewWuyuanOpenWorldNarrative(
  saveData: SaveData,
  input: {
    openWorldAction?: WuyuanOpenWorldSelection;
    eventAction?: ScenarioEventActionSelection;
  },
): string {
  if (!input.openWorldAction) return '';
  const clone = structuredClone(saveData);
  settleWuyuanOpenWorldSelection(clone, input.openWorldAction);
  if (input.eventAction) recordStoryEventStructuredAction(clone, input.eventAction);
  const advanced = advanceScenarioRuntime(clone).saveData;
  ensureWuyuanOpenWorldSlice(advanced);
  return composeWuyuanOpenWorldNarrative(advanced, input.openWorldAction);
}

export function getWuyuanOpenWorldPrompt(saveData: SaveData): string {
  const state = ensureWuyuanOpenWorldSlice(saveData);
  if (!state) return '';
  const view = getOpenWorldSliceView(state, WUYUAN_OPEN_WORLD_DEFINITION);
  const destinations = view.destinations.length
    ? view.destinations.map(item => `${item.destination}（${item.label}，耗时${item.turnCost}轮）`).join('；')
    : '眼下没有新的本地可达去处';
  const actors = view.actorsHere.length
    ? view.actorsHere.map(actor => `${actor.name}：${actor.status}；当前意图=${actor.desire}`).join('；')
    : '当前地点没有已登记的承重人物在场';
  const problems = view.problems.map(problem => `${problem.title}：${problem.objective}`).join('；') || '无';
  return `# 五原局部行动账（本地真值）\n当前位置：${view.currentLocation}\n已知可去处：${destinations}\n在场人物：${actors}\n眼前可处理的问题：${problems}\n只可描写以上已知地点、路线与人物状态；不得用正文把玩家移动到未结算地点。`;
}
