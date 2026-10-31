import { randomUUID } from '@/utils/uuid';
import runtimeNumbers from '../../../../mod-kit/numbers-runtime.json';
import { mapEntryReady } from '../mapEntries';
import { transitionToMapEntryStage } from '../strictInitializer';
import locations from '../../../../mod-kit/entity-catalog/locations.json';
import { CONTENT_PACKS } from '../../contentPacks';
import type { SaveData } from '@/types/game';
import { currentLocation } from './travelLedger';
import { canonicalLocationId } from './locationIds';
import { SEVERAL_DAYS_PLACEHOLDER } from '../openWorldSlice';
import { settleTime } from '../actionTime';
import { logEvent } from '../../diagnostics/log';
export interface MapTravelRoute { id: string; fromId: string; toId: string; dayCost: number | 'several'; unlockWhen?: string[] }
export interface MapTravelSelection { source: 'map'; actionId: string; fromId: string; toId: string; routeId: string }
export function countryOf(id: string | undefined): string | undefined {
  if (!id) return undefined;
  const canonical = canonicalLocationId(id);
  const e = locations.entries.find(e => canonicalLocationId(e.id) === canonical || (e.aliases as string[]).includes(id));
  return (e?.definition as any)?.country || undefined;
}
export function isCrossCountry(fromId: string, toId: string): boolean {
  const from = countryOf(fromId), to = countryOf(toId);
  return !!from && !!to && from !== to;
}
const crossCountryTravel = runtimeNumbers.crossCountryTravel;
const capitals: Readonly<Record<string, string>> = crossCountryTravel.capitals;
/** 跨国可点落点（按国）；不在表内的国别只可出发、不可作跨国目的地（域外、晴州无代表点）。 */
const destinations: Readonly<Record<string, readonly string[]>> = crossCountryTravel.destinations;
/** 单独落点的「出发国→该点」天数表，自该点出发去该国同天数（来回对称）；未列落点用国别矩阵。 */
const destinationRawDays: Readonly<Record<string, Readonly<Record<string, number>>>> = crossCountryTravel.destinationRawDays;
/** 各关共用的地图跨国落点标记；始终取总表坐标，不受当前关地点列表限制。 */
export function mapCapitalMarkers() {
  return Object.entries(destinations).flatMap(([country, ids]) => ids.map(id => [country, id] as const)).flatMap(([country, id]) => {
    const entry = locations.entries.find(e => e.id === canonicalLocationId(id));
    const definition = entry?.definition;
    return definition?.coordinates ? [{ ...definition, id: entry!.id, country,
      coordinates: { ...definition.coordinates }, iconColor: '#b45309' }] : [];
  });
}

/** 地图隐藏地点（numbers-runtime ui.worldMap.hiddenLocationIds）：不画、不能点；地点数据照留。 */
export function isMapHiddenLocation(id: string | undefined): boolean {
  const hidden: readonly string[] = runtimeNumbers.ui.worldMap.hiddenLocationIds;
  const canonical = canonicalLocationId(id);
  return !!canonical && hidden.some(h => canonicalLocationId(h) === canonical);
}
export function withoutMapHiddenLocations<T extends { id?: string }>(points: T[]): T[] {
  return points.filter(point => !isMapHiddenLocation(point.id));
}

/** 代表点优先插入：同坐标地点的最近点命中平手时仍能点到代表点。 */
export function withMapCapitalMarkers<T extends { id?: string; name?: string }>(points: T[]) {
  const markers = mapCapitalMarkers();
  return [...markers, ...points.filter(point => !markers.some(marker =>
    canonicalLocationId(point.id) === marker.id || point.name === marker.name))];
}
const rawDays: Readonly<Record<string, Readonly<Record<string, number>>>> = crossCountryTravel.rawDays;
/** UI 与结算共用跨国目的地限制；国内仍由原入口/路线合同处理。 */
export function mapTravelRestriction(save: SaveData, toId: string): string | undefined {
  if (isMapHiddenLocation(toId)) return '此地不在地图上。';
  const from = countryOf(currentLocation(save).canonicalLocationId), to = countryOf(toId);
  if (!from || !to) return '此处国别未定，暂无主动路线。';
  if (!capitals[from] || !capitals[to]) return '此国别暂不开放主动路线。';
  if (from !== to && !destinations[to]?.length) return '此国别暂不开放跨国落点。';
  if (from !== to && !destinations[to].some(id => canonicalLocationId(id) === canonicalLocationId(toId))) return '跨国须前往该国都城/代表地点';
  return undefined;
}
/** 作者登记路线优先（包括未解锁路线）；没有地点路线才按国别回退。 */
export function mapRoutes(save: SaveData, toId: string): MapTravelRoute[] {
  const fromId = currentLocation(save).canonicalLocationId;
  const done = (save as any).世界?.状态?.剧本模组?.completedEventIds || [];
  if (!fromId || mapTravelRestriction(save, toId)) return [];
  const targetId = canonicalLocationId(toId);
  const authored = (CONTENT_PACKS.mapRoutes || []).filter(r => canonicalLocationId(r.fromId) === fromId && canonicalLocationId(r.toId) === targetId);
  if (authored.length) return authored.filter(r => (r.unlockWhen || []).every(id => done.includes(id)));
  const from = countryOf(fromId)!, to = countryOf(targetId)!;
  if (from === to) {
    const rule = crossCountryTravel.domesticRepresentative;
    if (!rule.enabled || fromId === targetId || !destinations[to]?.includes(targetId)) return [];
    const start = locations.entries.find(e => canonicalLocationId(e.id) === fromId)?.definition.coordinates;
    const end = locations.entries.find(e => canonicalLocationId(e.id) === targetId)?.definition.coordinates;
    if (!start || !end) return [];
    const days = Math.max(rule.minDays, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) * rule.coordinateLi / crossCountryTravel.liPerDay));
    return [{ id: `domestic:${fromId}:${targetId}`, fromId, toId: targetId, dayCost: days }];
  }
  // 带表落点来回对称：出发点表取目标国、目标点表取出发国；两端都带表时取较大值以保持对称；都没有才用国别矩阵。
  const pointRaw = [destinationRawDays[fromId]?.[to], destinationRawDays[targetId]?.[from]].filter((d): d is number => d !== undefined);
  const raw = pointRaw.length ? Math.max(...pointRaw) : rawDays[from]?.[to] ?? rawDays[to]?.[from];
  return raw === undefined ? [] : [{ id: `xc:${from}:${to}`, fromId, toId: targetId, dayCost: Math.min(raw, crossCountryTravel.dayCap) }];
}
export function selectMapTravel(save: SaveData, toId: string): MapTravelSelection | undefined {
  if (mapTravelRestriction(save, toId)) return undefined;
  const entry = CONTENT_PACKS.mapEntries?.find(e => e.locationId === canonicalLocationId(toId));
  if (entry) return mapEntryReady(save, entry) ? { source: 'map', actionId: randomUUID(), fromId: currentLocation(save).canonicalLocationId || '', toId: entry.locationId, routeId: entry.id } : undefined;
  const route = mapRoutes(save, toId)[0], fromId = currentLocation(save).canonicalLocationId;
  return route && fromId ? { source: 'map', actionId: randomUUID(), fromId, toId: canonicalLocationId(toId), routeId: route.id } : undefined;
}
/** 调用入口仅地图按钮；模型与自然语言不进入此函数。提交者先克隆存档，落账后原子持久化。 */
export function settleMapTravel(save: SaveData, selection: MapTravelSelection): boolean {
  if (selection?.source !== 'map' || !selection.actionId) return false;
  // 重放按原收据核验，不以抵达后的当前国别重新生成路线。
  const source = `map:${selection.routeId}:${selection.fromId}:${selection.toId}`;
  const prior = (save as any).系统?.扩展?.actionTime?.receipts?.['map:' + selection.actionId];
  if (prior) return prior.source === source;
  if (mapTravelRestriction(save, selection.toId)) return false;
  const entry = CONTENT_PACKS.mapEntries?.find(e => e.locationId === canonicalLocationId(selection.toId));
  if (entry) {
    if (selection.routeId !== entry.id || selection.fromId !== (currentLocation(save).canonicalLocationId || '') || !mapEntryReady(save, entry)) return false;
    const result = transitionToMapEntryStage(save, entry, CONTENT_PACKS.stages);
    if (!result.ok) return false;
    // 位置描述与普通地图抵达同口径「国别·地名」：新关开场位置是「大陆·地名」（中州·咸阳），顶栏会显示成中州（真机 REPORT-8091-fbef6792）。
    const arrived = result.saveData.角色.位置, entryLoc = locations.entries.find(e => canonicalLocationId(e.id) === entry.locationId)?.definition;
    arrived.locationId = entry.locationId;
    if (countryOf(entry.locationId) && entryLoc?.name) arrived.描述 = `${countryOf(entry.locationId)}·${entryLoc.name}`;
    Object.assign(save, result.saveData);
    return true;
  }
  const route = currentLocation(save).canonicalLocationId === selection.fromId ? mapRoutes(save, selection.toId).find(r => r.id === selection.routeId) : undefined;
  if (!route) { logEvent({ code: 'LCQ-SAV-038', detail: { reason: 'invalid_map_selection' } }); return false; }
  const days = route.dayCost === 'several' ? SEVERAL_DAYS_PLACEHOLDER : route.dayCost;
  settleTime(save, 'map:' + selection.actionId, days * 1440, source);
  if (route.dayCost === 'several') (save as any).元数据.时间.相对日 = '数日后';
  const loc = locations.entries.find(e => canonicalLocationId(e.id) === selection.toId)?.definition;
  const position = (save as any).角色.位置;
  position.locationId = selection.toId; position.描述 = `${countryOf(selection.toId)}·${loc?.name || ''}`;
  if (loc?.coordinates) { position.x = loc.coordinates.x; position.y = loc.coordinates.y; }
  return true;
}

/** 已知跨国文字意图只提供准备材料，不能签发地图选择。 */
export function mapPreparation(save: SaveData, text: string): string | undefined {
  if (!/(?:去|到|前往|赴|出发|动身)/.test(text) || /(?:不去|别去|不前往|取消前往)/.test(text)) return undefined;
  const from = countryOf(currentLocation(save).canonicalLocationId);
  const places = locations.entries.filter(e => text.includes(e.definition.name) && countryOf(e.id) && countryOf(e.id) !== from).sort((a,b)=>b.definition.name.length-a.definition.name.length);
  const nations = [...new Set(locations.entries.map(e => (e.definition as any).country).filter(Boolean))] as string[];
  const target = places[0]?.definition.name || nations.find(n => n !== from && text.includes(n + '国'));
  return target ? `你正在准备前往${target}。请打开地图选择已开放路线；本轮尚未出发，不能叙述已经跨国抵达。` : undefined;
}
/** 正文里的明确跨国抵达也须与本地位置一致，避免状态拦住而正文偷偷瞬移。 */
export function mapArrivalViolation(save: SaveData, text: string): boolean {
  const from = countryOf(currentLocation(save).canonicalLocationId);
  if (!from) return false; // 无法判定国别时不猜正文国家，位置写入仍fail-closed。
  const countries = [...new Set(locations.entries.map(e => (e.definition as any).country).filter(Boolean))] as string[];
  return countries.some(country => country !== from && new RegExp(`你(?:已经|终于|顺利)?(?:抵达|到达|进入|来到)${country}国`).test(text));
}

/** 无副作用的出发预览；确认时必须重新核对，避免弹窗打开后路线或存档改变。 */
export function mapTravelPreview(save: SaveData, toId: string): { key: string; label: string; days: number | null } | undefined {
  if (mapTravelRestriction(save, toId)) return undefined;
  const fromId = currentLocation(save).canonicalLocationId;
  if (!fromId) return undefined;
  const entry = CONTENT_PACKS.mapEntries?.find(e => e.locationId === canonicalLocationId(toId));
  if (entry) return mapEntryReady(save, entry) ? { key: `${fromId}:${entry.id}`, label: '剧情入口转场（不另计路程天数）', days: null } : undefined;
  const route = mapRoutes(save, toId)[0];
  if (!route) return undefined;
  const days = route.dayCost === 'several' ? SEVERAL_DAYS_PLACEHOLDER : route.dayCost;
  return { key: `${fromId}:${route.toId}:${route.id}:${days}`, label: `约${days}日路程`, days };
}
export function mapTravelConfirmed(preview: ReturnType<typeof mapTravelPreview>, confirmationKey: string | null): boolean {
  return !!preview && preview.key === confirmationKey;
}
export function mapPreparationNotice(save: SaveData, text: string): string | undefined {
  return mapPreparation(save, text) ? '跨国出行请打开世界地图选择目的地' : undefined;
}
