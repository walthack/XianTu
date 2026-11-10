import { resolveStoryEventActionFromPlayerText } from '../runtime';
import { randomUUID } from '@/utils/uuid';
import runtimeNumbers from '../../../../mod-kit/numbers-runtime.json';
import travelUi from '../../../../mod-kit/cross-country-travel-ui.json';
import { mapEntryReady } from '../mapEntries';
import { syncPersistentLineEntries } from '../persistentLineEntries';
import { transitionToMapEntryStage } from '../strictInitializer';
import locations from '../../../../mod-kit/entity-catalog/locations.json';
import { CONTENT_PACKS, packText } from '../../contentPacks';
import type { SaveData } from '@/types/game';
import { currentLocation, isNanhuangTravelStage, noteNanhuangArrival } from './travelLedger';
import { canonicalLocationId, locationDescriptionWithCountry } from './locationIds';
import { SEVERAL_DAYS_PLACEHOLDER } from '../openWorldSlice';
import { settleTime, actionTimeConfig } from '../actionTime';
import { logEvent } from '../../diagnostics/log';
import { domesticTravelDays } from './routeDays';
import { calendarConfig, gameTimeFromMinutes, gameTimeMinutes } from '@/utils/time';
/** questRoute：剧情路程特例（questRouteDays 名单节点），国内也按两地路程天数结算。 */
export interface MapTravelRoute { id: string; fromId: string; toId: string; dayCost: number | 'several'; unlockWhen?: string[]; questRoute?: boolean }
/** 国内地图移动按原方式计时（片刻，story.actionTime.minutes.moment）；只有跨国才按路程天数（REPORT-8091-4c8245a5 P1）。 */
export const MOMENT_DAY_COST = 0;
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
  if (canonicalLocationId(toId) === currentLocation(save).canonicalLocationId) return '你已在此地。';
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
  const quest = questRouteDaysRoute(save, fromId, targetId);
  if (quest) return [quest];
  const authored = (CONTENT_PACKS.mapRoutes || []).filter(r => canonicalLocationId(r.fromId) === fromId && canonicalLocationId(r.toId) === targetId);
  if (authored.length) return authored.filter(r => (r.unlockWhen || []).every(id => done.includes(id)));
  const from = countryOf(fromId)!, to = countryOf(targetId)!;
  if (from === to) {
    const rule = crossCountryTravel.domesticRepresentative;
    if (!rule.enabled || fromId === targetId || !destinations[to]?.includes(targetId)) return [];
    // 国内只耗片刻，不按坐标折天（留仙坪→长安曾按地图算成约10日，REPORT-8091-4c8245a5 P1）。
    return [{ id: `domestic:${fromId}:${targetId}`, fromId, toId: targetId, dayCost: MOMENT_DAY_COST }];
  }
  // 带表落点来回对称：出发点表取目标国、目标点表取出发国；两端都带表时取较大值以保持对称；都没有才用国别矩阵。
  const pointRaw = [destinationRawDays[fromId]?.[to], destinationRawDays[targetId]?.[from]].filter((d): d is number => d !== undefined);
  const raw = pointRaw.length ? Math.max(...pointRaw) : rawDays[from]?.[to] ?? rawDays[to]?.[from];
  return raw === undefined ? [] : [{ id: `xc:${from}:${to}`, fromId, toId: targetId, dayCost: Math.min(raw, crossCountryTravel.dayCap) }];
}
/**
 * 剧情路程特例优先（REPORT-8091-f9737e0d ②）：story.actionTime.questRouteDays.eventIds 里的节点正在进行、地图目的地正是该拍地点时，
 * 地图与罗盘同口径按两地路程天数（travel/routeDays）结算，不套国内片刻（汉 08 舞都→洛都约 11 日，曾被 3285eece 的国内规则改成片刻）。
 * 名单外、或算不出路程（同城、跨国）时返回 undefined，照常走作者路线/国内片刻/跨国天数。
 */
function questRouteDaysRoute(save: SaveData, fromId: string, targetId: string | undefined): MapTravelRoute | undefined {
  const runtime = (save as any)?.世界?.状态?.剧本模组;
  if (!runtime || !targetId || isNanhuangTravelStage(runtime.modId)) return undefined;
  const listed: readonly string[] = actionTimeConfig().questRouteDays.eventIds;
  const active: string[] = runtime.activeEventIds || [], done: string[] = runtime.completedEventIds || [];
  const event = (runtime.events || []).find((e: any) => listed.includes(e.id) && active.includes(e.id) && !done.includes(e.id)
    && canonicalLocationId(e.locationId) === targetId);
  const days = event ? domesticTravelDays(fromId, targetId) : undefined;
  return days === undefined ? undefined : { id: `quest:${event.id}:${fromId}:${targetId}`, fromId, toId: targetId, dayCost: days, questRoute: true };
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
    clearDepartureActionOptions(save);
    return true;
  }
  const route = currentLocation(save).canonicalLocationId === selection.fromId ? mapRoutes(save, selection.toId).find(r => r.id === selection.routeId) : undefined;
  if (!route) { logEvent({ code: 'LCQ-SAV-038', detail: { reason: 'invalid_map_selection' } }); return false; }
  settleTime(save, 'map:' + selection.actionId, mapRouteMinutes(route), source);
  if (route.dayCost === 'several') (save as any).元数据.时间.相对日 = '数日后';
  const loc = locations.entries.find(e => canonicalLocationId(e.id) === selection.toId)?.definition;
  const position = (save as any).角色.位置;
  position.locationId = selection.toId; position.描述 = `${countryOf(selection.toId)}·${loc?.name || ''}`;
  if (loc?.coordinates) { position.x = loc.coordinates.x; position.y = loc.coordinates.y; }
  // 南荒国内落点记行旅账（母地点权威），下一回合对账不再拉回旧地点；不加路线、不耗日。
  const runtime = (save as any).世界?.状态?.剧本模组;
  if (runtime) noteNanhuangArrival(runtime, selection.toId, `arrive:map:${selection.actionId}`);
  clearDepartureActionOptions(save);
  syncPersistentLineEntries(save);
  return true;
}
/**
 * 地图抵达后清掉出发地那段正文附带的模型建议（「其他行动」）：那是按旧地点写的（江州渡口「确认航线后登上快船」到临安仍挂着，REPORT-8091-2ba71102 P2-B）。
 * 正文本身保留；新地点的主线/探索建议由引擎按新位置现算，不受影响。
 */
function clearDepartureActionOptions(save: SaveData): void {
  const latest = (save as any).系统?.历史?.叙事?.at?.(-1);
  if (latest && Array.isArray(latest.actionOptions) && latest.actionOptions.length) latest.actionOptions = [];
}

/** 地图出行落账后的弹窗提示：写明实际落点（与顶栏「国别·地名」同口径），不留旧关文案（REPORT-8091-da90cb13 P2-2）。 */
export function mapTravelArrivalNotice(save: SaveData): string {
  const where = String((save as any).角色?.位置?.描述 || '').trim();
  return where ? `已按地图路线抵达${where}。` : '已按地图路线抵达。';
}

/**
 * 跨国须在地图上点选目的地（REPORT-8091-75eaaee0 P2-2，全局规则）：剧情罗盘移动（runtime 的 travel:<地点>，按钮或手打）若跨国，
 * 本轮不交给事件引擎换国，只写准备并引导打开地图；地图落点取目标地点本身，不是地图落点时取该国代表地点（到了再走国内罗盘）。
 * 例外＝剧情写死的跨国转场：南荒行旅关（自有路线与时钟）与 crossCountryTravel.storyTransitionEventIds（如五原→南荒商队）。
 * 目标国在地图上也去不了时返回 undefined，沿用罗盘，免得卡关。
 */
export function crossCountryStoryTravel(save: SaveData, action: { source?: string; eventId?: string; actionId?: string } | null | undefined): CrossCountryTravelTarget | undefined {
  const actionId = String(action?.actionId || '');
  if (action?.source !== 'event_engine' || !actionId.startsWith('travel:')) return undefined;
  if (isNanhuangTravelStage((save as any)?.世界?.状态?.剧本模组?.modId)) return undefined;
  if ((crossCountryTravel.storyTransitionEventIds as readonly string[]).includes(String(action.eventId || ''))) return undefined;
  const toId = canonicalLocationId(actionId.slice('travel:'.length)), fromId = currentLocation(save).canonicalLocationId;
  if (!toId || !fromId || !isCrossCountry(fromId, toId)) return undefined;
  return crossCountryTarget(save, toId);
}
export interface CrossCountryTravelTarget { toId: string; name: string; mapTargetId: string; mapTargetName: string }
/**
 * 跨国切关（用户 2026-11-02 拍板④）：下一关开场地点与玩家所在不同国时，启程改为在地图上点选（同剧情罗盘的地图落点口径）。
 * 南荒行旅关自有路线与时钟，不算；地图上也去不了时 undefined（照常直接启程，免得卡关）。
 */
export function crossCountryStageDeparture(save: SaveData, nextStageId: string, nextOpeningLocationId: string | undefined): CrossCountryTravelTarget | undefined {
  if (isNanhuangTravelStage((save as any)?.世界?.状态?.剧本模组?.modId) || isNanhuangTravelStage(nextStageId)) return undefined;
  const toId = canonicalLocationId(nextOpeningLocationId || ''), fromId = currentLocation(save).canonicalLocationId;
  if (!toId || !fromId || !isCrossCountry(fromId, toId)) return undefined;
  return crossCountryTarget(save, toId);
}
const locationName = (id: string) => locations.entries.find(e => canonicalLocationId(e.id) === canonicalLocationId(id))?.definition.name || '';
/** 地图落点取目标地点本身，不是地图落点时取该国代表地点；地图上也去不了时 undefined。 */
function crossCountryTarget(save: SaveData, toId: string): CrossCountryTravelTarget | undefined {
  const mapTargetId = [toId, capitals[countryOf(toId)!]].find(id => id && mapTravelPreview(save, id));
  return mapTargetId ? { toId, name: locationName(toId), mapTargetId: canonicalLocationId(mapTargetId)!, mapTargetName: locationName(mapTargetId) } : undefined;
}
const fillTravelUi = (template: string, target: { name: string; mapTargetName: string }) =>
  template.replace(/\{name\}/g, target.name).replace(/\{mapTargetName\}/g, target.mapTargetName);
/** 跨国剧情罗盘移动发给叙事的准备说明（本轮未出发）。文案在 mod-kit/cross-country-travel-ui.json。 */
export const crossCountryStoryTravelPreparation = (target: { name: string; mapTargetName: string }): string =>
  fillTravelUi(target.name === target.mapTargetName ? travelUi.preparationDirect : travelUi.preparationVia, target);
/** 跨国剧情罗盘移动给玩家的提示（toast）。 */
export function crossCountryStoryTravelToast(target: { mapTargetName: string }): string {
  return fillTravelUi(travelUi.toast, { name: '', ...target });
}

/** 手打文字里点名的跨国地点/国别（不经剧情罗盘）；与罗盘同口径给出地图落点（REPORT-8091-2ba71102 P2-A：舞都手打「我要去大明宫」须点名长安）。 */
function crossCountryTextIntent(save: SaveData, text: string): { name: string; target?: CrossCountryTravelTarget } | undefined {
  if (!/(?:去|到|前往|赴|出发|动身)/.test(text) || /(?:不去|别去|不前往|取消前往)/.test(text)) return undefined;
  const from = countryOf(currentLocation(save).canonicalLocationId);
  const places = locations.entries.filter(e => text.includes(e.definition.name) && countryOf(e.id) && countryOf(e.id) !== from).sort((a,b)=>b.definition.name.length-a.definition.name.length);
  const nations = [...new Set(locations.entries.map(e => (e.definition as any).country).filter(Boolean))] as string[];
  const name = places[0]?.definition.name || nations.find(n => n !== from && text.includes(n + '国'));
  if (!name) return undefined;
  // 同名地点（如两份「大明宫」）取第一处地图上走得通的；只点了国别时取该国代表地点。
  const candidates = places.length ? places.filter(e => e.definition.name === name).map(e => e.id) : [capitals[name]].filter(Boolean);
  for (const id of candidates) {
    const target = crossCountryTarget(save, canonicalLocationId(id)!);
    if (target) return { name, target: places.length ? target : { ...target, name: target.mapTargetName } };
  }
  return { name };
}

/**
 * 手打国内移动（REPORT-8091-f9737e0d ③）：「我去长安」这类点名同国地图落点的句子，与地图「前往此地」同一结果——直接移动、按地图路线计时
 * （国内片刻；剧情路程特例按天）。只认地图上走得通的普通路线（不走剧情入口转场、不在南荒行旅关）；否定、问句、假设句不算。
 * 当前剧情罗盘/开放世界动作能接住的句子由调用方先交给它们，这里不抢。
 */
export function domesticTypedTravel(save: SaveData, text: string): MapTravelSelection | undefined {
  const raw = String(text || '').trim();
  if (!raw || /[？?]\s*$/.test(raw) || /^(?:如果|要是|假如|倘若|若是)/.test(raw)) return undefined;
  if (!/(?:去|到|前往|赴|动身|回)/.test(raw) || /(?:不|别|没|勿|莫|未)(?:想|要|愿|必|用|敢|能|打算)?(?:去|到|前往|赴|动身|回)|取消前往/.test(raw)) return undefined;
  if (isNanhuangTravelStage((save as any)?.世界?.状态?.剧本模组?.modId)) return undefined;
  const from = currentLocation(save).canonicalLocationId, country = countryOf(from);
  if (!from || !country) return undefined;
  const named = locations.entries
    .filter(e => countryOf(e.id) === country && canonicalLocationId(e.id) !== from && e.definition.name && raw.includes(e.definition.name))
    .sort((a, b) => b.definition.name.length - a.definition.name.length);
  for (const entry of named) {
    const toId = canonicalLocationId(entry.id)!;
    if (CONTENT_PACKS.mapEntries?.some(e => e.locationId === toId)) continue;
    const selection = selectMapTravel(save, toId);
    if (selection) return selection;
  }
  return undefined;
}
/** 手打国内移动落账：与地图同一结算（settleMapTravel），并补一段本地回执正文（文案在 mod-kit/cross-country-travel-ui.json）。 */
export function settleDomesticTypedTravel(save: SaveData, selection: MapTravelSelection, playerText: string): boolean {
  if (!settleMapTravel(save, selection)) return false;
  const name = locationName(selection.toId), where = String((save as any).角色?.位置?.描述 || name);
  const system = ((save as any).系统 ||= {}), rows = ((system.历史 ||= {}).叙事 ||= []);
  rows.push({ type: 'gm', role: 'assistant', content: travelUi.domesticTypedArrival.replace(/\{name\}/g, name).replace(/\{where\}/g, where), time: '', userIntent: playerText, actionOptions: [] });
  return true;
}

/** 已知跨国文字意图只提供准备材料，不能签发地图选择。 */
export function mapPreparation(save: SaveData, text: string): string | undefined {
  const intent = mapPreparationIntent(save, text);
  return intent && crossCountryStoryTravelPreparation(intent.target || { name: intent.name, mapTargetName: intent.name });
}
function mapPreparationIntent(save: SaveData, text: string): { name: string; target?: CrossCountryTravelTarget } | undefined {
  // 已命中当前剧情罗盘移动：国内（或剧情写死的跨国转场）走本地剧情转场，不提示地图；跨国罗盘只写准备、引导地图。
  // 解析会整理合同缓存，因此只在副本上预览。
  const storyAction = resolveStoryEventActionFromPlayerText(structuredClone(save), text);
  if (storyAction?.actionId.startsWith('travel:')) {
    const across = crossCountryStoryTravel(save, storyAction);
    return across ? { name: across.name, target: across } : undefined;
  }
  return crossCountryTextIntent(save, text);
}
/** 发送时的 toast：点名地图落点；地图上去不了的只给通用提示。 */
export function mapPreparationToast(save: SaveData, text: string): string | undefined {
  const intent = mapPreparationIntent(save, text);
  return intent && (intent.target ? crossCountryStoryTravelToast(intent.target) : travelUi.genericToast);
}
/** 正文里的明确跨国抵达也须与本地位置一致，避免状态拦住而正文偷偷瞬移。 */
export function mapArrivalViolation(save: SaveData, text: string): boolean {
  const from = countryOf(currentLocation(save).canonicalLocationId);
  if (!from) return false; // 无法判定国别时不猜正文国家，位置写入仍fail-closed。
  const countries = [...new Set(locations.entries.map(e => (e.definition as any).country).filter(Boolean))] as string[];
  return countries.some(country => country !== from && new RegExp(`你(?:已经|终于|顺利)?(?:抵达|到达|进入|来到)${country}国`).test(text));
}

/** 无副作用的出发预览；确认时必须重新核对，避免弹窗打开后路线或存档改变。 */
export function mapTravelPreview(save: SaveData, toId: string): { key: string; label: string; days: number | null; description?: string; arrival?: string } | undefined {
  if (mapTravelRestriction(save, toId)) return undefined;
  const fromId = currentLocation(save).canonicalLocationId;
  if (!fromId) return undefined;
  const entry = CONTENT_PACKS.mapEntries?.find(e => e.locationId === canonicalLocationId(toId));
  if (entry) return mapEntryReady(save, entry) ? { key: `${fromId}:${entry.id}`, label: '剧情入口转场（不另计路程天数）', days: null, description: entry.previewTextId ? packText(entry.previewTextId) : undefined } : undefined;
  const route = mapRoutes(save, toId)[0];
  if (!route) return undefined;
  if (isDomesticMapRoute(route)) return { key: `${fromId}:${route.toId}:${route.id}:moment`, label: travelUi.domesticMapLabel, days: null };
  const days = route.dayCost === 'several' ? SEVERAL_DAYS_PLACEHOLDER : route.dayCost;
  const label = route.questRoute ? travelUi.questRouteMapLabel.replace(/\{days\}/g, String(days)) : `约${days}日路程`;
  const arrival = route.dayCost === 'several' ? undefined : mapArrivalLine(save, mapRouteMinutes(route));
  return { key: `${fromId}:${route.toId}:${route.id}:${days}`, label, days, ...(arrival ? { arrival } : {}) };
}
/**
 * 按天路线的预计抵达日（REPORT-8091-f9737e0d P2-4：临安弹窗「约60日」，测试按公历数成 61 天）。本世界历每月 30 日（story.actionTime.calendar），
 * 3/28 起 60 日正好是 5/28；这里用与结算同一换算（utils/time）写出抵达日，弹窗天数与实际扣的天数、日期三者一致。文案在 mod-kit/cross-country-travel-ui.json。
 */
function mapArrivalLine(save: SaveData, minutes: number): string | undefined {
  const now = (save as any)?.元数据?.时间;
  if (!now || !Number.isFinite(minutes)) return undefined;
  const at = gameTimeFromMinutes(gameTimeMinutes(now) + minutes);
  return travelUi.arrivalDateLine.replace(/\{daysPerMonth\}/g, String(calendarConfig().daysPerMonth))
    .replace(/\{year\}/g, String(at.年)).replace(/\{month\}/g, String(at.月)).replace(/\{day\}/g, String(at.日));
}
/** 国内路线（作者登记的也算）一律片刻；跨国、剧情路程特例按天数。 */
function isDomesticMapRoute(route: MapTravelRoute): boolean {
  if (route.questRoute) return false;
  const from = countryOf(route.fromId), to = countryOf(route.toId);
  return !!from && from === to;
}
export function mapRouteMinutes(route: MapTravelRoute): number {
  if (isDomesticMapRoute(route)) return actionTimeConfig().minutes.moment;
  return (route.dayCost === 'several' ? SEVERAL_DAYS_PLACEHOLDER : route.dayCost) * 1440;
}
export function mapTravelConfirmed(preview: ReturnType<typeof mapTravelPreview>, confirmationKey: string | null): boolean {
  return !!preview && preview.key === confirmationKey;
}
/** 输入区常驻提示：点名「先开地图去某代表地点」（REPORT-8091-2ba71102 P2-A）；地图上去不了的只给通用提示。 */
export function mapPreparationNotice(save: SaveData, text: string): string | undefined {
  const intent = mapPreparationIntent(save, text);
  if (!intent) return undefined;
  const { target } = intent;
  return target ? fillTravelUi(target.name === target.mapTargetName ? travelUi.noticeDirect : travelUi.noticeVia, target) : travelUi.genericNotice;
}
/**
 * 地图标头（REPORT-8091-f76e07a7 ⑥）：剧本档的世界名称／背景是开关时写死的（唐关＝「六朝·唐国长安」＋长安、太真简介），人走到别处仍照旧。
 * 剧本档标头改写玩家当前所在（与顶栏同口径「国别·地名」）；背景只在提到当前地名时保留，否则不显示。非剧本档原样。
 */
export function mapHeaderInfo(worldInfo: { 世界名称?: unknown; 世界背景?: unknown } | null | undefined, position: { locationId?: string; 描述?: string } | null | undefined, scenario: boolean): { name: string; background: string } {
  const name = String(worldInfo?.世界名称 || '') || '修仙界', background = String(worldInfo?.世界背景 || '');
  if (!scenario) return { name, background };
  const here = locationDescriptionWithCountry(position || undefined);
  const place = here.split('·').filter(Boolean).at(-1) || '';
  return { name: here || name, background: place && background.includes(place) ? background : '' };
}
