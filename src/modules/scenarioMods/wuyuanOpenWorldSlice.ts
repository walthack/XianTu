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
  getCurrentStoryEventActions,
  recordStoryEventStructuredAction,
  type ScenarioEventActionSelection,
} from './runtime';
import { resolveLocationIdFromPosition } from './secondaryLines';

export const WUYUAN_OPEN_WORLD_SLICE_ID = 'lcq.open_world.wuyuan_v1';
export const WUYUAN_SETTLEMENT_ID = 'lcq.settlement.wuyuan.v1';
export const WUYUAN_MARKET_ARRIVAL_ID = 'lcq.route.wuyuan.arrive_market';
export const WUYUAN_WORLD_LOCATION_ID = 'liuchao.location.wuyuan';
const SETTLEMENT_ZONE_ID = 'lcq.zone.wuyuan.settlement';
const MARKET_ZONE_ID = 'lcq.zone.wuyuan.market';
const PASTRY_ZONE_ID = 'lcq.zone.wuyuan.pastry_shop';
const FRONT_STREET_ZONE_ID = 'lcq.zone.wuyuan.baihu_front_street';
const COMPOUND_ZONE_ID = 'lcq.zone.wuyuan.baihu_compound';
const HALL_ZONE_ID = 'lcq.zone.wuyuan.baihu_hall';
const PRISON_ZONE_ID = 'lcq.zone.wuyuan.water_prison';
const GATE_ZONE_ID = 'lcq.zone.wuyuan.baihu_gate';
const PASTRY_TO_PRISON_ROUTE = 'lcq.route.wuyuan.pastry_taken_to_prison';
const MARKET_TO_PRISON_ROUTE = 'lcq.route.wuyuan.market_taken_to_prison';
const PRISON_TO_HALL_ROUTE = 'lcq.route.wuyuan.prison_taken_to_hall';
const HALL_TO_GATE_ROUTE = 'lcq.route.baihu.hall_to_gate';
const EXIT_FRONT_GATE_ROUTE = 'lcq.route.baihu.exit_front_gate';

const WUYUAN_LEAF_RANK: Record<string, number> = {
  [MARKET_ZONE_ID]: 0,
  [PASTRY_ZONE_ID]: 0,
  [PRISON_ZONE_ID]: 1,
  [HALL_ZONE_ID]: 2,
  [GATE_ZONE_ID]: 3,
  [FRONT_STREET_ZONE_ID]: 4,
};

export const WUYUAN_OPEN_WORLD_DEFINITION: OpenWorldSliceDefinition = {
  id: WUYUAN_OPEN_WORLD_SLICE_ID,
  initialZoneId: MARKET_ZONE_ID,
  zones: [
    {
      id: SETTLEMENT_ZONE_ID, name: '五原城镇', kind: 'settlement', standable: false,
      worldLocationId: WUYUAN_WORLD_LOCATION_ID,
    },
    {
      id: MARKET_ZONE_ID, name: '五原露天市集', aliases: ['五原市集', '露天市集', '市集'],
      kind: 'street', parentZoneId: SETTLEMENT_ZONE_ID, worldLocationId: WUYUAN_WORLD_LOCATION_ID,
    },
    {
      id: PASTRY_ZONE_ID, name: '点心铺', aliases: ['糕饼铺', '饼铺'],
      kind: 'interior', parentZoneId: SETTLEMENT_ZONE_ID, worldLocationId: WUYUAN_WORLD_LOCATION_ID,
    },
    {
      id: FRONT_STREET_ZONE_ID, name: '白湖商馆门前街', aliases: ['商馆门前', '门前街'],
      kind: 'street', parentZoneId: SETTLEMENT_ZONE_ID, worldLocationId: WUYUAN_WORLD_LOCATION_ID,
    },
    {
      id: COMPOUND_ZONE_ID, name: '白湖商馆', aliases: ['五原商馆'],
      kind: 'compound', parentZoneId: SETTLEMENT_ZONE_ID, worldLocationId: WUYUAN_WORLD_LOCATION_ID, standable: false,
    },
    {
      id: HALL_ZONE_ID, name: '白湖商馆内院', aliases: ['商馆内院'],
      kind: 'interior', parentZoneId: COMPOUND_ZONE_ID, worldLocationId: WUYUAN_WORLD_LOCATION_ID,
    },
    {
      id: PRISON_ZONE_ID, name: '白湖商馆水牢', aliases: ['水牢'],
      kind: 'interior', parentZoneId: COMPOUND_ZONE_ID, worldLocationId: WUYUAN_WORLD_LOCATION_ID,
    },
    {
      id: GATE_ZONE_ID, name: '白湖商馆大门', aliases: ['商馆大门'],
      kind: 'interior', parentZoneId: COMPOUND_ZONE_ID, worldLocationId: WUYUAN_WORLD_LOCATION_ID,
    },
  ],
  routes: [
    {
      id: 'lcq.route.wuyuan.market_to_pastry_street',
      fromZoneId: MARKET_ZONE_ID, toZoneId: PASTRY_ZONE_ID,
      label: '沿人多的街面过去', aliases: ['走街面', '沿街', '人多的路'], turnCost: 1,
    },
    {
      id: 'lcq.route.wuyuan.market_to_pastry_alley',
      fromZoneId: MARKET_ZONE_ID, toZoneId: PASTRY_ZONE_ID,
      label: '绕较安静的后巷', aliases: ['走后巷', '绕后巷', '安静的路'], turnCost: 2,
      requirementKey: 'lcq.knowledge.wuyuan.pastry_back_alley',
    },
    {
      id: PASTRY_TO_PRISON_ROUTE,
      fromZoneId: PASTRY_ZONE_ID, toZoneId: PRISON_ZONE_ID,
      label: '被押往水牢', aliases: ['押走'], turnCost: 1,
    },
    {
      id: MARKET_TO_PRISON_ROUTE,
      fromZoneId: MARKET_ZONE_ID, toZoneId: PRISON_ZONE_ID,
      label: '被带进水牢', aliases: ['押进商馆'], turnCost: 1,
    },
    {
      id: PRISON_TO_HALL_ROUTE,
      fromZoneId: PRISON_ZONE_ID, toZoneId: HALL_ZONE_ID,
      label: '被带到内院', aliases: ['带去内院'], turnCost: 1,
    },
    {
      id: HALL_TO_GATE_ROUTE,
      fromZoneId: HALL_ZONE_ID, toZoneId: GATE_ZONE_ID,
      label: '走到商馆大门', aliases: ['去大门'], turnCost: 1,
    },
    {
      id: EXIT_FRONT_GATE_ROUTE,
      fromZoneId: GATE_ZONE_ID, toZoneId: FRONT_STREET_ZONE_ID,
      label: '迈出五原商馆', aliases: ['出馆', '出门前街'], turnCost: 1,
    },
  ],
  notices: [
    {
      id: 'lcq.notice.wuyuan.market_layout',
      source: '市集货棚旁的旧木牌', reliability: 'confirmed', atZoneId: 'lcq.zone.wuyuan.market',
      text: '木牌只画了眼前市集的货棚、马匹摊位和点心铺方向；这里没有城门与官署标记。',
    },
    {
      id: 'lcq.notice.wuyuan.pastry_back_alley',
      source: '相邻货摊摊主的低声提醒', reliability: 'rumor', atZoneId: 'lcq.zone.wuyuan.market',
      text: '摊主说点心铺后面另有一条安静窄巷，但他没有保证巷里一定安全。',
      unlockZoneIds: ['lcq.zone.wuyuan.pastry_shop'],
      unlockRouteIds: ['lcq.route.wuyuan.market_to_pastry_alley'],
      unlockRequirementKeys: ['lcq.knowledge.wuyuan.pastry_back_alley'],
    },
  ],
  // 只引用 stage02 已有角色 ID。王哲属于此前帅帐阶段，明确不在本表。
  actors: [
    {
      id: 'liuchao.character.ning_yu', name: '凝羽', initialZoneId: 'lcq.zone.wuyuan.baihu_hall',
      desire: '观察局势，判断眼前的人是否值得出手相助', initialStatus: '尚未与玩家照面',
    },
    {
      id: 'liuchao.character.su_daji', name: '苏妲己', initialZoneId: 'lcq.zone.wuyuan.baihu_hall',
      desire: '掌握商馆内的谈判与交易主动', initialStatus: '尚未与玩家照面',
    },
  ],
  problems: [{
    id: 'lcq.problem.wuyuan.pastry_capture', atZoneId: 'lcq.zone.wuyuan.pastry_shop',
    title: '点心铺里的逼近', objective: '陌生人从两面逼近；先保住性命并看清他们把人往哪里带',
    initialState: 'confronted', terminalStates: ['captured_observant', 'captured_injured'],
    actionIds: ['lcq.action.wuyuan.delay_and_observe', 'lcq.action.wuyuan.break_for_exit'],
  }],
  actions: [
    {
      id: 'lcq.action.wuyuan.delay_and_observe', problemId: 'lcq.problem.wuyuan.pastry_capture',
      label: '用话头拖住他们', actionText: '你不报来历，先用话头拖住逼近的人，同时看清门窗与押送方向。',
      aliases: ['拖住他们', '用话头拖延', '先交涉', '观察退路'], rejectIf: ['不交涉', '不说话'],
      availableInStates: ['confronted'], outcome: 'partial', nextProblemState: 'captured_observant',
      settledFacts: ['对方没有被说服，只短暂停了手', '你看清了门窗与后来押送的方向', '人数差距使你最终仍被制住'],
      costs: ['外地口音引来额外留意'],
      consequences: [
        {
          id: 'ningyu_notices_composure', delayTurns: 4, actorId: 'liuchao.character.ning_yu',
          cause: '你在点心铺被围时仍先观察而没有乱报身份', effect: '凝羽后来见到你时先留意你的镇定与观察力',
          apply: { actorStatus: '留意玩家是否能在受制时保持清醒' },
        },
        {
          id: 'remembered_route_opens', delayTurns: 12,
          cause: '你在被押走前记住了门窗与转折方向', effect: '商馆内出现可继续核对的脱身路线线索',
          apply: { problemId: 'lcq.problem.wuyuan.pastry_capture', problemState: 'route_memory_available' },
        },
      ],
    },
    {
      id: 'lcq.action.wuyuan.break_for_exit', problemId: 'lcq.problem.wuyuan.pastry_capture',
      label: '撞开桌案抢出口', actionText: '你抢先撞开桌案冲向出口，不把这次突围写成已经逃脱。',
      aliases: ['撞开桌案', '抢出口', '冲向出口', '动手脱身'], rejectIf: ['不动手', '不冲'],
      availableInStates: ['confronted'], outcome: 'failure-forward', nextProblemState: 'captured_injured',
      settledFacts: ['你撞开了第一人，却被更多人从侧后封住', '你没有逃脱，但记住了对方合围与押送的次序', '你带着新伤被制住'],
      costs: ['新增一处可见伤势'],
      consequences: [
        {
          id: 'ningyu_notices_injury', delayTurns: 4, actorId: 'liuchao.character.ning_yu',
          cause: '你在点心铺抢出口失败并带伤被押走', effect: '凝羽后来见到你时先判断伤势与仍可行动的余地',
          apply: { actorStatus: '先观察玩家伤势与行动余地' },
        },
        {
          id: 'guard_pattern_remembered', delayTurns: 12,
          cause: '你亲身撞过合围并记住押送次序', effect: '商馆内出现可利用的换岗与合围空隙线索',
          apply: { problemId: 'lcq.problem.wuyuan.pastry_capture', problemState: 'guard_pattern_available' },
        },
      ],
    },
  ],
};

export type WuyuanOpenWorldSelection = {
  source: 'open_world_engine';
  kind: 'travel' | 'notice' | 'problem_action';
  identityId: string;
  receiptId: string;
  label: string;
  actionText: string;
  settledFacts: string[];
};

type RuntimeWithSlice = {
  modId?: string;
  storyMode?: 'canon_companion' | 'world_sim';
  worldTurn?: number;
  activeEventIds?: string[];
  completedEventIds?: string[];
  openWorldSlice?: OpenWorldSliceRuntime;
  openWorldSliceLastWorldTurn?: number;
};

function runtimeOf(saveData: SaveData): RuntimeWithSlice | undefined {
  return (saveData as any)?.世界?.状态?.剧本模组;
}

function completedIds(runtime: RuntimeWithSlice): string[] {
  return runtime.completedEventIds || [];
}

function wangZheFallen(runtime: RuntimeWithSlice): boolean {
  return completedIds(runtime).includes('lcq.event.s02_02');
}

function playerLocationDescription(saveData: SaveData): string {
  return String((saveData as { 角色?: { 位置?: { 描述?: unknown } } })?.角色?.位置?.描述 || '');
}

function playerInWuyuan(saveData: SaveData, runtime: RuntimeWithSlice): boolean {
  const desc = playerLocationDescription(saveData);
  if (desc.includes('五原')) return true;
  const locId = resolveLocationIdFromPosition(desc, (runtime as { canon?: { locations?: Array<{ id: string; name: string }> } }).canon?.locations);
  return locId === 'liuchao.location.wuyuan';
}

function inWuyuanSlice(runtime: RuntimeWithSlice, saveData: SaveData): boolean {
  if (runtime.modId !== 'lcq.stage_02' || !wangZheFallen(runtime)) return false;
  if (playerInWuyuan(saveData, runtime)) return true;
  return completedIds(runtime).some(id => (
    id === 'lcq.event.s02_04' || id === 'lcq.event.s02_05' || id === 'lcq.event.s02_06'
  ));
}

function isWuyuanMarketTravelText(playerText: string): boolean {
  const normalized = playerText.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '');
  if (!normalized) return false;
  if (normalized.includes('点心铺') || normalized.includes('糕饼铺') || normalized.includes('后巷')) return false;
  return /去五原|前往五原|去市集|前往五原露天市集/.test(normalized);
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
  if (!runtime || !inWuyuanSlice(runtime, saveData)) return undefined;
  const state = hydrateWuyuanSlice(runtime);
  applyCanonForcedRoutes(runtime);
  projectPlayerPosition(saveData, state);
  return state;
}

function receiptId(state: OpenWorldSliceRuntime, kind: WuyuanOpenWorldSelection['kind'], id: string): string {
  return `${WUYUAN_OPEN_WORLD_SLICE_ID}:${kind}:${id}:${state.elapsedTurns}`;
}

function marketArrivalSelection(saveData: SaveData): WuyuanOpenWorldSelection {
  const from = playerLocationDescription(saveData) || '帅帐';
  const to = '五原露天市集';
  return {
    source: 'open_world_engine',
    kind: 'travel',
    identityId: WUYUAN_MARKET_ARRIVAL_ID,
    receiptId: `${WUYUAN_OPEN_WORLD_SLICE_ID}:travel:${WUYUAN_MARKET_ARRIVAL_ID}:arrive`,
    label: '前往 · 五原露天市集',
    actionText: '我去五原城。',
    settledFacts: [`你从${from}出发`, `你抵达${to}`, '路程消耗1轮'],
  };
}

export function getWuyuanOpenWorldSelections(saveData: SaveData): WuyuanOpenWorldSelection[] {
  const runtime = runtimeOf(saveData);
  if (!runtime || runtime.modId !== 'lcq.stage_02' || !wangZheFallen(runtime)) return [];
  if (!inWuyuanSlice(runtime, saveData)) return [marketArrivalSelection(saveData)];
  const state = ensureWuyuanOpenWorldSlice(saveData);
  if (!state) return [];
  const view = getOpenWorldSliceView(state, WUYUAN_OPEN_WORLD_DEFINITION);
  return [
    ...view.destinations.map(item => ({
      source: 'open_world_engine' as const, kind: 'travel' as const, identityId: item.routeId,
      receiptId: receiptId(state, 'travel', item.routeId), label: `前往 · ${item.destination}`,
      actionText: `我选择${item.label}，前往${item.destination}。`,
      settledFacts: [`你从${view.currentLocation}出发`, `你沿“${item.label}”前往${item.destination}`, `路程消耗${item.turnCost}轮`],
    })),
    ...view.notices.map(item => ({
      source: 'open_world_engine' as const, kind: 'notice' as const, identityId: item.id,
      receiptId: receiptId(state, 'notice', item.id), label: '查看 · 现场消息',
      actionText: `我停下来查看这条现场消息：${item.presentation}`,
      settledFacts: [item.presentation],
    })),
    ...view.problems.flatMap(problem => problem.actions.map(action => {
      const definition = WUYUAN_OPEN_WORLD_DEFINITION.actions.find(item => item.id === action.id)!;
      return {
        source: 'open_world_engine' as const, kind: 'problem_action' as const, identityId: action.id,
        receiptId: receiptId(state, 'problem_action', action.id), label: action.label, actionText: action.actionText,
        settledFacts: [...definition.settledFacts, ...(definition.costs || []).map(cost => `代价：${cost}`)],
      };
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
  const fromName = playerLocationDescription(saveData) || '帅帐';
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
  if (selection.kind === 'problem_action' && runtime.storyMode !== 'world_sim') {
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
    lines.push('你从帅帐抵达五原露天市集。');
    lines.push('露天货棚和摊位挤在这一片，摊位直接铺到街面上。');
  } else if (zoneId === PASTRY_ZONE_ID) {
    lines.push('你沿街面进入点心铺。');
    lines.push('点心铺这一侧，甜香和麦粉味压过街面的尘。');
  } else if (zoneId === PRISON_ZONE_ID) {
    lines.push('应对失败或部分成功后你仍被制住，被押入白湖商馆水牢。');
    lines.push('水汽和石壁压得很近。你还在商馆这一截里。');
  } else {
    const place = WUYUAN_OPEN_WORLD_DEFINITION.zones.find(zone => zone.id === zoneId)?.name;
    if (place) lines.push(`你来到${place}。`);
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
