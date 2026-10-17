import {CONTENT_PACKS,packPlaytest} from '../contentPacks';
import type { SaveData } from '@/types/game';

/** 与清羽开局试玩事件窗对齐；本文件保持无环，避免 runtime 初始化时拿不到名单。 */
export const SCOPED_NARRATIVE_EVENT_IDS = packPlaytest('qingyu').eventIds;
const SCOPED_EVENT_IDS=new Set(CONTENT_PACKS.playtests.flatMap(p=>p.eventIds));
const ESCAPE_EVENT_ID=packPlaytest('qingyu').endEventId;

type RuntimeLike = {
  storyMode?: string;
  modId?: string;
  completedEventIds?: string[];
  activeEventIds?: string[];
};

function runtimeOf(saveData: SaveData | null | undefined): RuntimeLike | undefined {
  return (saveData as { 世界?: { 状态?: { 剧本模组?: RuntimeLike } } } | null | undefined)
    ?.世界?.状态?.剧本模组;
}

function extensionKind(saveData: SaveData | null | undefined, key: string): string {
  return String((saveData as { 系统?: { 扩展?: Record<string, { kind?: string }> } } | null | undefined)
    ?.系统?.扩展?.[key]?.kind || '');
}

export function isQingyuOpeningPlaytestEventId(eventId: string | undefined): boolean {
  return !!eventId && SCOPED_EVENT_IDS.has(eventId);
}

export function isScopedPlaytestSave(saveData: SaveData | null | undefined): boolean {
  return CONTENT_PACKS.playtests.some(p=>extensionKind(saveData,p.extensionKey)===p.kind);
}

export function isWithinBaihuEscapeNarrativeWindow(saveData: SaveData | null | undefined): boolean {
  const runtime = runtimeOf(saveData);
  if (!runtime) return false;
  const completed = Array.isArray(runtime.completedEventIds) ? runtime.completedEventIds : [];
  return !completed.includes(ESCAPE_EVENT_ID);
}

/** 已授权清羽/星月湖试玩全剧情链的自然输入；世界模拟仍走独立入口。 */
export function isScopedNaturalIntentSave(saveData: SaveData | null | undefined): boolean {
  return isScopedPlaytestSave(saveData);
}

export function isScopedPlayerPresentationEvent(eventId: string | undefined, storyMode?: string): boolean {
  return isQingyuOpeningPlaytestEventId(eventId);
}
