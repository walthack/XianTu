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
/** 主动旅行只消费作者已登记路程与解锁条件，不把强制剧情路线自动开放给地图。 */
export function mapRoutes(save: SaveData, toId: string): MapTravelRoute[] {
  const fromId = currentLocation(save).canonicalLocationId;
  const done = (save as any).世界?.状态?.剧本模组?.completedEventIds || [];
  if (!fromId || !countryOf(fromId) || !countryOf(toId)) return [];
  return (CONTENT_PACKS.mapRoutes || []).filter(r => canonicalLocationId(r.fromId) === fromId && canonicalLocationId(r.toId) === canonicalLocationId(toId) && (r.unlockWhen || []).every(id => done.includes(id)));
}
export function selectMapTravel(save: SaveData, toId: string): MapTravelSelection | undefined {
  const entry = CONTENT_PACKS.mapEntries?.find(e => e.locationId === canonicalLocationId(toId));
  if (entry) return mapEntryReady(save, entry) ? { source: 'map', actionId: crypto.randomUUID(), fromId: currentLocation(save).canonicalLocationId || '', toId: entry.locationId, routeId: entry.id } : undefined;
  const route = mapRoutes(save, toId)[0], fromId = currentLocation(save).canonicalLocationId;
  return route && fromId ? { source: 'map', actionId: crypto.randomUUID(), fromId, toId: canonicalLocationId(toId), routeId: route.id } : undefined;
}
/** 调用入口仅地图按钮；模型与自然语言不进入此函数。提交者先克隆存档，落账后原子持久化。 */
export function settleMapTravel(save: SaveData, selection: MapTravelSelection): boolean {
  if (selection?.source !== 'map' || !selection.actionId) return false;
  const entry = CONTENT_PACKS.mapEntries?.find(e => e.locationId === canonicalLocationId(selection.toId));
  if (entry) {
    if (selection.routeId !== entry.id || selection.fromId !== (currentLocation(save).canonicalLocationId || '') || !mapEntryReady(save, entry)) return false;
    const result = transitionToMapEntryStage(save, entry, CONTENT_PACKS.stages);
    if (!result.ok) return false;
    result.saveData.角色.位置.locationId = entry.locationId;
    Object.assign(save, result.saveData);
    return true;
  }
  const source = `map:${selection.routeId}:${selection.fromId}:${selection.toId}`;
  const prior = (save as any).系统?.扩展?.actionTime?.receipts?.['map:' + selection.actionId];
  if (prior) return prior.source === source;
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
