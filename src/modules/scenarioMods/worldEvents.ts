/**
 * 世界事件（阶段 2b）：包里声明的、由玩家在右栏明确点选才开始的全局事件（manifest.worldEvents → catalog.worldEvents，编译期校验见 scripts/content-packs.mjs）。
 * 现在只有大祭一条（packs/festival），逻辑是原 heimohaiFestival.ts 去掉具体线后的通用版，语义逐行保留；heimohaiFestival.ts 留作兼容薄壳。
 * 通用模块（lineCompass、mapEntries、ledgerConditions、右栏）只依赖本模块，不 import 具体线。
 */
import type { SaveData } from '@/types/game';
import { CONTENT_PACKS, packText } from '../contentPacks';
import { getCanonRailProfile } from './canonRail';
import { activeScene } from '../sceneModule/host/ext';

export interface WorldEventClose { lineId: string; stageId: string; messageEventId: string }
export interface WorldEvent {
  id: string;
  /** 开始时记进 completedEventIds 的事件 id，编年史 id 为 chronicle.<modId>.<eventId>（存档里永久保留） */
  eventId: string;
  /** 右栏按钮传入的 actionId，不落档 */
  actionId: string;
  /** 已开始标记：系统.扩展.<startedExtensionKey> === true */
  startedExtensionKey: string;
  /** 只在这一关显示警示；可用要求这一关 rail 全部结算 */
  stageId: string;
  availableWhen: 'stageRailSettled';
  /** 在这些关里（地图入口关）不能开始，可用性按 系统.扩展.mapEntryResume.runtime 算 */
  blockedInStageIds: string[];
  /** 开始后、从没进过 stageId 的，关闭 lineId，并删掉当前关里的 messageEventId 口信拍 */
  closes: WorldEventClose[];
  textKeys: { label: string; warning: string; transition: string; blocked: string };
}
export interface WorldEventView { warning: string; available: boolean; blocked: string; transition: string }

export const WORLD_EVENTS: readonly WorldEvent[] = CONTENT_PACKS.worldEvents || [];
const runtime = (save: any) => save?.世界?.状态?.剧本模组;
const started = (save: any, def: WorldEvent) => save?.系统?.扩展?.[def.startedExtensionKey] === true;

export function worldEventText(def: WorldEvent, key: keyof WorldEvent['textKeys']): string {
  return packText(def.textKeys[key]);
}
/** 该世界事件的这一条关闭此刻是否生效：已开始，当前不在该关，且编年史里从没进过该关。 */
export function worldEventCloseHolds(save: any, rt: any, def: WorldEvent, close: WorldEventClose): boolean {
  return started(save, def) && rt?.modId !== close.stageId
    && !(rt?.chronicle || []).some((e: any) => e.stageId === close.stageId);
}
/** 该线是否已被世界事件关闭（包声明的派生条件 unlessLineClosedByWorldEvent、右栏线卡读）。rt 为 undefined 时取存档当前关。 */
export function lineClosedByWorldEvent(save: any, rt: unknown, lineId: string): boolean {
  const at = rt === undefined ? runtime(save) : rt;
  return WORLD_EVENTS.some(def => def.closes.some(c => c.lineId === lineId && worldEventCloseHolds(save, at, def, c)));
}
/** 该关（地图入口关）是否已被世界事件关闭：关闭后不再投递口信。rt 为 undefined 时取存档当前关。 */
export function stageClosedByWorldEvent(save: any, rt: unknown, stageId: string): boolean {
  const at = rt === undefined ? runtime(save) : rt;
  return WORLD_EVENTS.some(def => def.closes.some(c => c.stageId === stageId && worldEventCloseHolds(save, at, def, c)));
}
/** Same rail settlement rules as advanceScenarioRuntime/isEventSettled, including void beats. */
function stageRailSettled(rt: any, stageId: string): boolean {
  if (rt?.modId !== stageId) return false;
  const rail = getCanonRailProfile(rt);
  return !!rail?.orderedEventIds.length && rail.orderedEventIds.every(id => {
    if (rt.completedEventIds.includes(id) || (rt.offscreenResolvedEventIds || []).includes(id)) return true;
    const condition = rt.events.find((e: any) => e.id === id)?.completion?.[0];
    return condition?.path?.startsWith('flags.') && condition.path.endsWith('.done')
      && rt.flags[condition.path.slice('flags.'.length).replace(/\.done$/, '.void')] === true;
  });
}
export function worldEventView(save: any, def: WorldEvent): WorldEventView {
  const rt = runtime(save);
  const isStarted = started(save, def);
  const inBlocked = def.blockedInStageIds.includes(rt?.modId);
  const source = inBlocked ? save?.系统?.扩展?.mapEntryResume?.runtime : rt;
  return {
    warning: !isStarted && rt?.modId === def.stageId ? worldEventText(def, 'warning') : '',
    available: !isStarted && stageRailSettled(source, def.stageId) && !rt?.gameOver && !activeScene(save),
    blocked: inBlocked ? worldEventText(def, 'blocked') : '',
    transition: isStarted ? worldEventText(def, 'transition') : '',
  };
}
/** 右栏卡片：按声明顺序，每个世界事件一张。 */
export function worldEventViews(save: any): Array<{ id: string; actionId: string; label: string; view: WorldEventView }> {
  return WORLD_EVENTS.map(def => ({ id: def.id, actionId: def.actionId, label: worldEventText(def, 'label'), view: worldEventView(save, def) }));
}
/** Only the explicit UI choice calls this; ticks and narrative reconciliation never do. */
export function startWorldEvent(save: SaveData, id: string, choice: { source: string; actionId: string }) {
  const def = WORLD_EVENTS.find(x => x.id === id);
  if (!def) return { ok: false, note: '' };
  const view = worldEventView(save, def);
  if (view.blocked) return { ok: false, note: view.blocked };
  if (choice?.source !== 'player' || choice.actionId !== def.actionId || !view.available) return { ok: false, note: '' };
  const s = save as any, rt = runtime(save);
  ((s.系统 ||= {}).扩展 ||= {})[def.startedExtensionKey] = true;
  if (!rt.completedEventIds.includes(def.eventId)) rt.completedEventIds.push(def.eventId);
  const chronicle = rt.chronicle ||= [];
  chronicle.push({ id: `chronicle.${rt.modId}.${def.eventId}`, type: 'event', stageId: rt.modId,
    title: worldEventText(def, 'label'), detail: worldEventText(def, 'transition'), sequence: chronicle.length + 1 });
  for (const close of def.closes) {
    if (!worldEventCloseHolds(save, runtime(save), def, close)) continue;
    rt.activeEventIds = rt.activeEventIds.filter((x: string) => x !== close.messageEventId);
    for (const chapter of rt.chapters) chapter.eventIds = chapter.eventIds.filter((x: string) => x !== close.messageEventId);
  }
  return { ok: true, note: worldEventText(def, 'transition') };
}
