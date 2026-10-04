import type { GameTime, SaveData } from '@/types/game';
import { computePresentNames, departedPresentNames } from '../presence';
import { normalizeGameTime } from '@/utils/time';
import {
  SEVERAL_DAYS_PLACEHOLDER,
  areaIdOf,
  forcedRoutesFor,
  hydrateOpenWorldSliceRuntime,
  rememberOpenWorldForcedTravel,
  routeDayCost,
  settleOpenWorldForcedTravel,
  worldLocationIdOf,
  zoneTravelStatus,
  type OpenWorldForcedBy,
  type OpenWorldSliceRuntime,
  type OpenWorldVisibility,
} from '../openWorldSlice';
import { resolveLocationIdFromPosition } from '../secondaryLines';
import {
  BIYU_POSITION_NODES,
  BIYU_POSITION_SEGMENT,
  BIYU_WORLD_LOCATION_ID,
  NANHUANG_STAGE_IDS,
  QINGYU_NANHUANG_DEFINITION,
} from './defs/qingyuNanhuang';
import { WUYUAN_POSITION_SEGMENT, WUYUAN_WORLD_LOCATION_ID, WUYUAN_ZONES } from './defs/qingyuWuyuanZones';
import { canonicalLocationId, locationIdByRegisteredName } from './locationIds';

/**
 * 运行时位置门面（P0-4 第 1 步）：所有「玩家现在在哪」的读取都走这里。
 *
 * 位置串按三段「大陆·地点·建筑或区内节点」读（解析顺序见 locationFromPosition）。
 * 南荒关卡由行旅账（第 3 步）推进位置：强制移动先落回执，再把位置串投影成账上的当前节点。
 */
export interface CurrentLocation {
  /** 原始位置串，如「中州·帅帐」。 */
  text: string;
  /** 位置串第一段（大陆）；没有「·」时为空。 */
  continent: string;
  /** 解析出的地点 id；解析不出为 undefined。 */
  locationId?: string;
  /** locationId 过别名表后的规范 id。 */
  canonicalLocationId?: string;
  /** 第三段命中区内节点时的 zone id。 */
  zoneId?: string;
}

/**
 * 区内节点表：位置串「大陆·地点·节点」第二段命中 segment、第三段命中节点 → 该地点＋zone。
 * allowBareNode：两段串「大陆·节点」也认（剧情裁定：「南荒·海神殿」＝碧鲮族＋海神殿）。
 */
const POSITION_NODE_TABLES: ReadonlyArray<{
  continent: string;
  segment: string;
  placeLocationId: string;
  nodes: ReadonlyArray<{ zoneId: string; names: string[] }>;
  allowBareNode?: boolean;
}> = [
  {
    continent: '中州',
    segment: WUYUAN_POSITION_SEGMENT,
    placeLocationId: WUYUAN_WORLD_LOCATION_ID,
    nodes: WUYUAN_ZONES.map(zone => ({ zoneId: zone.id, names: [zone.name, ...(zone.aliases || [])] })),
  },
  {
    continent: '南荒',
    segment: BIYU_POSITION_SEGMENT,
    placeLocationId: BIYU_WORLD_LOCATION_ID,
    nodes: BIYU_POSITION_NODES,
    allowBareNode: true,
  },
];

function compact(value: string): string {
  return value.replace(/\s+/g, '');
}

function zoneFromSegments(text: string): { zoneId: string; worldLocationId: string } | undefined {
  const parts = text.split('·').map(compact);
  const hit = (table: typeof POSITION_NODE_TABLES[number], node: string) =>
    table.nodes.find(item => item.names.some(name => compact(name) === node));
  if (parts.length >= 3) {
    const node = parts.slice(2).join('·');
    for (const table of POSITION_NODE_TABLES) {
      const found = table.segment === parts[1] ? hit(table, node) : undefined;
      if (found) return { zoneId: found.zoneId, worldLocationId: table.placeLocationId };
    }
  }
  if (parts.length === 2) {
    for (const table of POSITION_NODE_TABLES) {
      const found = table.allowBareNode && table.continent === parts[0] ? hit(table, parts[1]) : undefined;
      if (found) return { zoneId: found.zoneId, worldLocationId: table.placeLocationId };
    }
  }
  return undefined;
}

/** 按规范名／显示别名找（当前关正典里没有该地点时，如只有「白夷谷」的串）。只认整段相等。 */
function registeredNameFromSegments(text: string): string | undefined {
  const parts = text.split('·').map(compact).filter(Boolean);
  for (const part of parts.slice(1).reverse()) {
    const id = locationIdByRegisteredName(part);
    if (id) return id;
  }
  return parts.length === 1 ? locationIdByRegisteredName(parts[0]) : undefined;
}

type LocationList = ReadonlyArray<{ id: string; name: string }> | undefined;

/**
 * 解析顺序：正典地点名最长匹配（原来能解析的串结果不变）→ 区内节点表 → 规范名／显示别名。
 * 都不中则 locationId 为空，调用方一律按不在场处理（fail closed）。
 */
export function locationFromPosition(positionDescription: unknown, locations: LocationList): CurrentLocation {
  const text = String(positionDescription || '');
  const continent = text.includes('·') ? text.slice(0, text.indexOf('·')) : '';
  const zone = zoneFromSegments(text);
  const locationId = resolveLocationIdFromPosition(text, locations) || zone?.worldLocationId || registeredNameFromSegments(text);
  return {
    text,
    continent,
    ...(locationId ? { locationId, canonicalLocationId: canonicalLocationId(locationId) } : {}),
    ...(zone ? { zoneId: zone.zoneId } : {}),
  };
}

/** 读存档的位置；locations 缺省取存档里当前剧本运行时的正典地点。 */
export function currentLocation(saveData: SaveData | null | undefined, locations?: LocationList): CurrentLocation {
  const save = saveData as { 角色?: { 位置?: { 描述?: unknown } }; 世界?: { 状态?: { 剧本模组?: { canon?: { characters?: Array<{ id: string; name: string; role?: string; description?: string; affiliations?: Array<{ role?: string }>; isProtagonist?: boolean }>; locations?: LocationList } } } } } | null | undefined;
  return locationFromPosition(
    save?.角色?.位置?.描述,
    locations ?? save?.世界?.状态?.剧本模组?.canon?.locations,
  );
}

export const RELATIVE_DAY_LABEL = '数日后';

export type ClockAdvance = { minutes: number } | { days: number | 'several' };

/**
 * 唯一的推进时钟入口（P0-4 第 2 步）。区内移动与普通回合按分钟（沿用 N10）；journey 按天，
 * 但只动日历、不动 worldTurn——几天路程不得一次触发几百回合的期限与延迟后果。
 * 'several'＝原著没写天数：内部按占位天数推进，给玩家看的日期改为「数日后」，直到下一次按具体天数推进。
 * 冰蛊不读本时钟。cause 只供回执与日志。
 */
export function advanceClock(
  saveData: SaveData,
  advance: ClockAdvance,
  cause: string,
): { oldValue: GameTime; newValue: GameTime; cause: string } | null {
  const meta = (saveData as { 元数据?: { 时间?: GameTime } } | null | undefined)?.元数据;
  if (!meta?.时间) return null;
  const oldValue = structuredClone(meta.时间);
  let newValue: GameTime;
  if ('minutes' in advance) {
    newValue = normalizeGameTime({ ...oldValue, 分钟: (Number(oldValue.分钟) || 0) + Math.max(0, Number(advance.minutes) || 0) });
  } else {
    const several = advance.days === 'several';
    const days = several ? SEVERAL_DAYS_PLACEHOLDER : Math.max(0, Number(advance.days) || 0);
    const { 相对日: _dropped, ...base } = oldValue;
    newValue = normalizeGameTime({ ...base, 日: (Number(base.日) || 0) + Math.floor(days), 分钟: (Number(base.分钟) || 0) + Math.round((days % 1) * 1440) });
    if (several) newValue.相对日 = RELATIVE_DAY_LABEL;
  }
  meta.时间 = newValue;
  return { oldValue, newValue, cause };
}

// ===== 南荒行旅账（P0-4 第 3 步） =====

/** 固定文本的路途卡：出发→途中→到达、耗时、同行者。不经 LLM。 */
export interface TravelCard {
  receiptId: string;
  from: string;
  to: string;
  label: string;
  summary?: string;
  duration: string;
  companions?: string[];
  text: string;
}

export interface NanhuangTravelLedger {
  sliceId: string;
  state: OpenWorldSliceRuntime;
  /** 跨关累积的已完成事件（切关后 completedEventIds 从空开始，三态与触发要看全程）。 */
  doneEventIds: string[];
  /** 旧档首次接入时按现位置推导，已完成拍只补 0 耗时回执。 */
  backfilled?: true;
  lastCard?: TravelCard;
  /** 位置串与账不一致、或强制路线起点不是当前节点时的改投影记录。 */
  reprojections?: Array<{ atTurn: number; fromZoneId: string; toZoneId: string; cause: string }>;
}

type LedgerRuntime = {
  modId?: string;
  worldTurn?: number;
  completedEventIds?: string[];
  activeEventIds?: string[];
  events?: Array<{ id: string; locationId?: string; relatedCharacterIds?: string[] }>;
  flags?: Record<string, unknown>;
  departedCast?: string[];
  opening?: { locationId?: string; text?: string };
  canon?: { characters?: Array<{ id: string; name: string; role?: string; description?: string; affiliations?: Array<{ role?: string }>; isProtagonist?: boolean }>; locations?: Array<{ id: string; name: string; coordinates?: { x?: number; y?: number } }> };
  travelLedger?: NanhuangTravelLedger;
};

const DEF = QINGYU_NANHUANG_DEFINITION;

export function isNanhuangTravelStage(modId: string | undefined): boolean {
  return (NANHUANG_STAGE_IDS as readonly string[]).includes(String(modId || ''));
}

/** 地点 → 行旅节点：优先 zone 提示，否则取 worldLocationId 规范相同的节点。 */
function zoneForLocation(locationId: string | undefined, zoneHint?: string): string | undefined {
  if (zoneHint && DEF.zones.some(zone => zone.id === zoneHint)) return zoneHint;
  if (!locationId) return undefined;
  const target = canonicalLocationId(locationId);
  return DEF.zones.find(zone => zone.worldLocationId && canonicalLocationId(zone.worldLocationId) === target)?.id;
}

function backfillZone(saveData: SaveData, runtime: LedgerRuntime): string | undefined {
  const segment = String((saveData as any).角色?.位置?.描述 || "").split("·").at(-1);
  const roadZone = DEF.zones.find(zone => zone.name === segment);
  if (roadZone) return roadZone.id;
  const here = currentLocation(saveData, runtime.canon?.locations);
  const fromPosition = zoneForLocation(here.locationId, here.zoneId);
  if (fromPosition) return fromPosition;
  const focus = (runtime.activeEventIds || [])
    .map(id => (runtime.events || []).find(event => event.id === id))
    .find(event => event?.locationId);
  return zoneForLocation(focus?.locationId) || zoneForLocation(runtime.opening?.locationId);
}

/** 取（必要时建立）行旅账。只在南荒关卡或已有账时建立；旧档按现位置推导，已完成拍补 0 耗时回执。 */
export function ensureNanhuangLedger(saveData: SaveData, runtime: LedgerRuntime): NanhuangTravelLedger | undefined {
  if (runtime.travelLedger?.state) {
    runtime.travelLedger.state = hydrateOpenWorldSliceRuntime(runtime.travelLedger.state, DEF);
    runtime.travelLedger.doneEventIds = Array.isArray(runtime.travelLedger.doneEventIds) ? runtime.travelLedger.doneEventIds : [];
    return runtime.travelLedger;
  }
  if (!isNanhuangTravelStage(runtime.modId)) return undefined;
  const zoneId = backfillZone(saveData, runtime);
  if (!zoneId) return undefined;
  const state = hydrateOpenWorldSliceRuntime({ currentZoneId: zoneId }, DEF);
  const done = [...(runtime.completedEventIds || [])];
  // 旧档已经焚尸或整拍完成时，补零耗时回执，不重新走营地到熊耳铺。
  if (done.includes('lcq.event.s03b_yinzhu_xiongerpu') || (runtime as any).eventActionStates?.['lcq.event.s03b_yinzhu_xiongerpu']?.preparations?.includes('ajia_mourned')) {
    rememberOpenWorldForcedTravel(state, DEF, 'nh.r.after.wanwu_night', 'lcq.event.s03b_yinzhu_xiongerpu::burn_yinzhu_victim');
  }
  for (const eventId of done) {
    for (const route of forcedRoutesFor(DEF, { afterEventDone: eventId })) rememberOpenWorldForcedTravel(state, DEF, route.id, eventId);
  }
  state.currentZoneId = zoneId;
  runtime.travelLedger = { sliceId: DEF.id, state, doneEventIds: done, backfilled: true };
  return runtime.travelLedger;
}

function zoneName(zoneId: string): string {
  return DEF.zones.find(zone => zone.id === zoneId)?.name || '';
}

/** 把位置串投影成账上的当前节点：`大陆·节点名`，坐标取正典。 */
function projectPosition(saveData: SaveData, runtime: LedgerRuntime, zoneId: string): void {
  const position = (saveData as { 角色?: { 位置?: { 描述?: unknown; x?: number; y?: number } } }).角色?.位置;
  if (!position || typeof position !== 'object') return;
  const area = (DEF.areas || []).find(item => item.id === areaIdOf(DEF, zoneId));
  position.描述 = `${area?.continent || '南荒'}·${zoneName(zoneId)}`;
  const target = canonicalLocationId(worldLocationIdOf(DEF, zoneId));
  const loc = (runtime.canon?.locations || []).find(item => canonicalLocationId(item.id) === target && typeof item.coordinates?.x === 'number');
  if (typeof loc?.coordinates?.x === 'number') position.x = loc.coordinates.x;
  if (typeof loc?.coordinates?.y === 'number') position.y = loc.coordinates.y;
}

/** 从当前运行时及同处关系取随队角色，排除主角、已故/离场者；不硬填原著名单。 */
export function currentTravelCompanions(saveData: SaveData, runtime: LedgerRuntime, sourceEventId?: string): string[] {
  const characters = runtime.canon?.characters || [];
  const related = new Set([...new Set([...(runtime.activeEventIds || []), ...(sourceEventId ? [sourceEventId] : (runtime.completedEventIds || []).slice(-1))])].flatMap(id => runtime.events?.find(e => e.id === id)?.relatedCharacterIds || []));
  const team = characters.filter(c => !c.isProtagonist && c.id !== 'liuchao.character.cheng_zongyang'
    && /商队|商会|送亲|随行|同行|护卫|向导|行商|佣兵|执事|队友/.test(`${c.role || ''} ${c.description || ''}`));
  const present = computePresentNames({ playerLocation: String((saveData as any).角色?.位置?.描述 || ''),
    relations: (saveData as any).社交?.关系,
    eventCharacterNames: team.filter(c => related.has(c.id)).map(c => c.name),
    excludeNames: departedPresentNames(runtime),
  });
  // 在场事件清空和NPC位置未定都不意味着队伍解散；延续上次真实出发快照。
  const departed = new Set(departedPresentNames(runtime));
  const carried = new Set(runtime.travelLedger?.lastCard?.companions || []);
  const names = new Set(team.filter(c => !departed.has(c.name)
    && (present.has(c.name) || carried.has(c.name) || c.role === '商队成员' || c.affiliations?.some(a => /商队成员|商队护卫/.test(a.role || '')))).map(c => c.name));
  // 早期stage_02卡缺武二郎；读取已经落账的加入合同，不能因此漏掉刚加入的队友。
  const joinedWuer = [...(runtime.completedEventIds || []), ...(runtime.travelLedger?.doneEventIds || [])].includes('lcq.event.wuerlang_joins');
  const wuer = (saveData as any).社交?.关系?.武二郎;
  if (joinedWuer && wuer && !departedPresentNames(runtime).includes('武二郎')) names.add(String(wuer.名字 || '武二郎'));
  return [...names];
}

function travelCard(receiptId: string, routeId: string, companions: string[]): TravelCard | undefined {
  const route = DEF.routes.find(item => item.id === routeId);
  if (!route) return undefined;
  const { days, several } = routeDayCost(route);
  const duration = route.durationLabel || (route.kind !== 'journey' ? '片刻' : several ? '数日' : days === 0.5 ? '半日' : days === 1 ? '一日' : `${days}日`);
  const from = zoneName(route.fromZoneId);
  const to = zoneName(route.toZoneId);
  const text = [`【路途】${from} → ${to}`, route.summary || route.label, `耗时：${duration}`, ...(companions.length ? [`同行：${companions.join('、')}`] : [])].join('｜');
  return { receiptId, from, to, label: route.label, ...(route.summary ? { summary: route.summary } : {}), duration, ...(companions.length ? { companions: [...companions] } : {}), text };
}

/**
 * 强制移动：先预演整条结算，成立后再提交回执、推进日历（journey）、投影位置串。
 * 已在终点只补 0 耗时回执；起点不是当前节点时先改投影到起点并记录（不从第三处瞬移到终点）。
 * 返回本次新落账的路途卡。
 */
export function settleNanhuangForcedTravel(
  saveData: SaveData,
  runtime: LedgerRuntime,
  trigger: OpenWorldForcedBy,
  departureCompanions = currentTravelCompanions(saveData, runtime, 'afterEventDone' in trigger ? trigger.afterEventDone : undefined),
): TravelCard[] {
  const routes = forcedRoutesFor(DEF, trigger);
  if (!routes.length) return [];
  // 转关时新关开场位置已写进存档，不能按它推导（会把账建在终点、吞掉路途）；没有账就从路线起点建。
  if (!runtime.travelLedger?.state && ('stageTransition' in trigger || ('afterEventDone' in trigger && trigger.afterEventDone === 'lcq.event.wuerlang_joins'))) {
    runtime.travelLedger = { sliceId: DEF.id, state: hydrateOpenWorldSliceRuntime({ currentZoneId: routes[0].fromZoneId }, DEF), doneEventIds: [] };
  }
  const ledger = ensureNanhuangLedger(saveData, runtime);
  if (!ledger) return [];
  const cause = 'afterEventDone' in trigger ? trigger.afterEventDone : `stage:${trigger.stageTransition}`;
  const preview = structuredClone(ledger.state);
  const reprojections: NonNullable<NanhuangTravelLedger['reprojections']> = [];
  const settled: Array<{ receiptId: string; routeId: string }> = [];
  for (const route of routes) {
    if (preview.currentZoneId === route.toZoneId) {
      rememberOpenWorldForcedTravel(preview, DEF, route.id, cause);
      continue;
    }
    if (preview.currentZoneId !== route.fromZoneId) {
      reprojections.push({ atTurn: Math.max(0, Number(runtime.worldTurn) || 0), fromZoneId: preview.currentZoneId, toZoneId: route.fromZoneId, cause });
      preview.currentZoneId = route.fromZoneId;
    }
    const result = settleOpenWorldForcedTravel(preview, DEF, route.id, cause);
    if (result.status === 'rejected') return [];
    if (result.status === 'settled' && result.receipt) settled.push({ receiptId: result.receipt.receiptId, routeId: route.id });
  }
  ledger.state = preview;
  if (reprojections.length) ledger.reprojections = [...(ledger.reprojections || []), ...reprojections].slice(-20);
  const cards: TravelCard[] = [];
  for (const item of settled) {
    const route = DEF.routes.find(entry => entry.id === item.routeId)!;
    if (route.kind === 'journey') {
      advanceClock(saveData, { days: route.dayCost === 'several' ? 'several' : routeDayCost(route).days }, item.receiptId);
    }
    else advanceClock(saveData, { minutes: Math.max(1, route.turnCost) }, item.receiptId);
    const card = travelCard(item.receiptId, item.routeId, departureCompanions);
    if (card) cards.push(card);
  }
  if (cards.length) ledger.lastCard = cards[cards.length - 1];
  if (settled.length || reprojections.length) projectPosition(saveData, runtime, ledger.state.currentZoneId);
  return cards;
}

/** 每回合：新完成的拍触发对应强制移动。旧档首次接入不回放已完成拍。 */
export function syncNanhuangRailTravel(saveData: SaveData, runtime: LedgerRuntime): TravelCard[] {
  if (!isNanhuangTravelStage(runtime.modId)) return [];
  // 新离开五原时必须先记南下账；旧档已在路上则只回填0耗时。
  if (runtime.modId === 'lcq.stage_02' && !runtime.travelLedger?.state
    && runtime.completedEventIds?.includes('lcq.event.wuerlang_joins')
    && /五原|白湖/.test(String((saveData as any).角色?.位置?.描述 || ''))) {
    settleNanhuangForcedTravel(saveData, runtime, { afterEventDone: 'lcq.event.wuerlang_joins' });
  }
  const ledger = ensureNanhuangLedger(saveData, runtime);
  if (!ledger) return [];
  const cards: TravelCard[] = [];
  for (const eventId of runtime.completedEventIds || []) {
    if (ledger.doneEventIds.includes(eventId)) continue;
    cards.push(...settleNanhuangForcedTravel(saveData, runtime, { afterEventDone: eventId }));
    ledger.doneEventIds.push(eventId);
  }
  return cards;
}

/** 切关：携带旧账，结算转关强制路线；没有转关路线时，以账为准投影位置（开场地点只在账为空时生效）。 */
export function settleNanhuangStageTransition(
  saveData: SaveData,
  runtime: LedgerRuntime,
  fromStageId: string,
  toStageId: string,
  carried: NanhuangTravelLedger | undefined,
  departureCompanions = currentTravelCompanions(saveData, runtime),
): TravelCard[] {
  if (carried) runtime.travelLedger = structuredClone(carried);
  const cards = settleNanhuangForcedTravel(saveData, runtime, { stageTransition: `${fromStageId}→${toStageId}` }, departureCompanions);
  if (!cards.length && runtime.travelLedger?.state && isNanhuangTravelStage(toStageId)) {
    projectPosition(saveData, runtime, runtime.travelLedger.state.currentZoneId);
  }
  return cards;
}

export function getTravelCard(saveData: SaveData | null | undefined): TravelCard | undefined {
  return ((saveData as { 世界?: { 状态?: { 剧本模组?: LedgerRuntime } } } | null | undefined)?.世界?.状态?.剧本模组?.travelLedger?.lastCard);
}

/** 地图／顶栏用：南荒每个节点的三态与可否前往。定义外的地点由调用方按隐藏处理（fail closed）。 */
export function getNanhuangLocationStates(saveData: SaveData | null | undefined): Array<{
  zoneId: string;
  locationId: string;
  name: string;
  visibility: OpenWorldVisibility;
  current: boolean;
  canTravel: boolean;
  label?: '到过·当前不可前往';
}> {
  const runtime = (saveData as { 世界?: { 状态?: { 剧本模组?: LedgerRuntime } } } | null | undefined)?.世界?.状态?.剧本模组;
  const ledger = runtime?.travelLedger;
  if (!ledger?.state) return [];
  const state = hydrateOpenWorldSliceRuntime(ledger.state, DEF);
  const done = [...new Set([...(ledger.doneEventIds || []), ...(runtime?.completedEventIds || []),
    ...(runtime?.activeEventIds?.includes('lcq.event.s05b_03_saan_secret_path') ? ['lcq.event.s05b_03_saan_secret_path'] : [])])];
  return DEF.zones.map(zone => ({
    zoneId: zone.id,
    locationId: canonicalLocationId(worldLocationIdOf(DEF, zone.id)),
    name: zone.name,
    ...zoneTravelStatus(state, DEF, zone.id, done),
  }));
}

/** 罗盘移动（到达≠完成的「去X」）落地后让账跟上：记一条改投影，不推进日历。 */
export function noteNanhuangArrival(runtime: LedgerRuntime, locationId: string, cause: string): void {
  const ledger = runtime.travelLedger;
  const zoneId = zoneForLocation(locationId);
  if (!ledger?.state || !zoneId || ledger.state.currentZoneId === zoneId) return;
  ledger.reprojections = [...(ledger.reprojections || []), {
    atTurn: Math.max(0, Number(runtime.worldTurn) || 0), fromZoneId: ledger.state.currentZoneId, toZoneId: zoneId, cause,
  }].slice(-20);
  ledger.state.currentZoneId = zoneId;
  ledger.state.knownZoneIds = [...new Set([...ledger.state.knownZoneIds, zoneId])];
}
