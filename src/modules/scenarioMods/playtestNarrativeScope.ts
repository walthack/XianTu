import type { SaveData } from '@/types/game';

/** 与清羽开局试玩事件窗对齐；本文件保持无环，避免 runtime 初始化时拿不到名单。 */
export const SCOPED_NARRATIVE_EVENT_IDS = [
  'lcq.event.s01_01',
  'lcq.event.s01_02',
  'lcq.event.s01_03',
  'lcq.event.s01_04',
  'lcq.event.s01_06',
  'lcq.event.s01_05',
  'lcq.event.s02_01',
  'lcq.event.s02_03',
  'lcq.event.s02_02',
  'lcq.event.s02_04',
  'lcq.event.s02_05',
  'lcq.event.s02_06',
  'lcq.event.ningyu_enters_gamble',
  'lcq.event.sudaji_south_pact',
  'lcq.event.gamble_bond_signed',
  'lcq.event.charge_sudaji_fee',
  'lcq.event.free_ajiman',
  'lcq.event.baihu_shangguan_escape',
] as const;

const SCOPED_EVENT_IDS = new Set<string>(SCOPED_NARRATIVE_EVENT_IDS);
const ESCAPE_EVENT_ID = 'lcq.event.baihu_shangguan_escape';
const QINGYU_KIND = 'qingyu-demo-v1';
const LANDING_KIND = 'xingyuehu-landing-through-v1';

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
  return extensionKind(saveData, '清羽记开局') === QINGYU_KIND
    || extensionKind(saveData, '星月湖落地连续试玩') === LANDING_KIND;
}

export function isWithinBaihuEscapeNarrativeWindow(saveData: SaveData | null | undefined): boolean {
  const runtime = runtimeOf(saveData);
  if (!runtime) return false;
  if (runtime.storyMode === 'world_sim') return false;
  const completed = Array.isArray(runtime.completedEventIds) ? runtime.completedEventIds : [];
  return !completed.includes(ESCAPE_EVENT_ID);
}

/** 已授权清羽/星月湖试玩全剧情链的自然输入；世界模拟仍走独立入口。 */
export function isScopedNaturalIntentSave(saveData: SaveData | null | undefined): boolean {
  return isScopedPlaytestSave(saveData) && runtimeOf(saveData)?.storyMode !== 'world_sim';
}

export function isScopedPlayerPresentationEvent(eventId: string | undefined, storyMode?: string): boolean {
  if (storyMode === 'world_sim') return false;
  return isQingyuOpeningPlaytestEventId(eventId);
}
