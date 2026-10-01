import type { SaveData } from '@/types/game';

import type { ScenarioMod } from './schema';
import {
  createQingyuOpeningPlaytestSave,
  overlayQingyuStage02Opening,
  QINGYU_OPENING_PLAYTEST_EXTENSION_KEY,
  QINGYU_OPENING_PLAYTEST_MOD_ID,
} from './qingyuOpeningPlaytest';
import { QINGYU_OPENING_TEXT, QINGYU_STAGE_02_OPENING_TEXT } from './qingyuOpeningTexts';

export const XINGYUEHU_LANDING_PLAYTEST_CHARACTER_ID = 'char_xingyuehu_landing_playtest_v1';
export const XINGYUEHU_LANDING_PLAYTEST_SLOT = '星月湖从落地开始';
export const XINGYUEHU_LANDING_PLAYTEST_KIND = 'xingyuehu-landing-through-v1';
export const XINGYUEHU_LANDING_PLAYTEST_EXTENSION_KEY = '星月湖落地连续试玩';
export const XINGYUEHU_LANDING_PLAYTEST_SAVE_ID = 'xingyuehu-landing-playtest-v1';
export const XINGYUEHU_LANDING_ROUTE_MODE = 'from-landing' as const;
export const XINGYUEHU_LANDING_PLAYTEST_START_MOD_ID = 'lcq.stage_01';
export const XINGYUEHU_LANDING_PLAYTEST_END_MOD_ID = 'lcq.stage_07_qingyuan_jiankang';
export const XINGYUEHU_LANDING_PLAYTEST_END_EVENT_ID = 'lcq.event.xiao_opens_resources';

export const XINGYUEHU_LANDING_ROUTE_STAGE_IDS = [
  'lcq.stage_01',
  'lcq.stage_02',
  'lcq.stage_03b_snake_flower_bridge',
  'lcq.stage_04',
  'lcq.stage_04b_lingfei_baiyi_crisis',
  'lcq.stage_05b',
  'lcq.stage_07_qingyuan_jiankang',
] as const;

export const XINGYUEHU_LANDING_QUARANTINED_SKIPPED_STAGE_IDS = [
  'lcq.stage_03',
  'lcq.stage_05',
  'lcq.stage_06',
] as const;

const FUTURE_DONE_FLAGS = [
  'event.slay_dragon.done',
  'event.xieyi_entrustment.done',
  'event.xiaoyaoyi_arrives.done',
  'event.s07_05.done',
  'event.xiao_opens_resources.done',
] as const;

/** 切关时只替换开场阅读面，不裁事件、不改 stage id。 */
const SAFE_STAGE_OPENINGS: Record<string, string> = {
  [XINGYUEHU_LANDING_PLAYTEST_START_MOD_ID]: QINGYU_OPENING_TEXT,
  'lcq.stage_02': QINGYU_STAGE_02_OPENING_TEXT,
  'lcq.stage_03b_snake_flower_bridge':
    '南荒腹地的危险第一次正面咬住商队。先撑过眼前这一波，再决定下一步怎么走。',
  'lcq.stage_04':
    '浓雾里有人截住了商队。先看清眼前这一仗，再顾后面的路。',
  'lcq.stage_04b_lingfei_baiyi_crisis':
    '商队还夹在两族之间往前走。先把眼前这件事看清，再说话。',
  'lcq.stage_05b':
    '这一路已经进到更深的地方。先看清眼前的人在做什么，再决定怎么应。',
  [XINGYUEHU_LANDING_PLAYTEST_END_MOD_ID]:
    '人已经到了清远一带。先把眼前要当面处理的事看清。这还不是整段旅途的尽头。',
};

export interface XingyuehuLandingPlaytestMarker {
  kind: typeof XINGYUEHU_LANDING_PLAYTEST_KIND;
  routeMode: typeof XINGYUEHU_LANDING_ROUTE_MODE;
  disposable: true;
  persistence: 'isolated-local';
  scope: string;
  startModId: typeof XINGYUEHU_LANDING_PLAYTEST_START_MOD_ID;
  endModId: typeof XINGYUEHU_LANDING_PLAYTEST_END_MOD_ID;
  endEventId: typeof XINGYUEHU_LANDING_PLAYTEST_END_EVENT_ID;
  routeStageIds: string[];
}

function extensionOf(saveData: SaveData | null | undefined): any {
  return saveData?.系统?.扩展?.[XINGYUEHU_LANDING_PLAYTEST_EXTENSION_KEY];
}

export function isXingyuehuLandingPlaytestSave(saveData: SaveData | null | undefined): boolean {
  const marker = extensionOf(saveData);
  return marker?.kind === XINGYUEHU_LANDING_PLAYTEST_KIND
    && marker?.routeMode === XINGYUEHU_LANDING_ROUTE_MODE;
}

export function isXingyuehuLandingPlaytestFinished(saveData: SaveData | null | undefined): boolean {
  if (!isXingyuehuLandingPlaytestSave(saveData)) return false;
  const runtime = (saveData as any)?.世界?.状态?.剧本模组;
  return runtime?.modId === XINGYUEHU_LANDING_PLAYTEST_END_MOD_ID
    && runtime?.flags?.['event.xiao_opens_resources.done'] === true;
}

/**
 * 完整关卡安全文案与五原自然意图；不裁剪事件，不改 lcq stage id，
 * 不把 slay_dragon / 托付 / 开库写成初始 done。
 */
export function overlayXingyuehuLandingPlaytestStage(mod: ScenarioMod): ScenarioMod {
  if (mod.manifest.id === 'lcq.stage_02') {
    return overlayQingyuStage02Opening(mod);
  }
  const next = structuredClone(mod);
  const safeOpening = SAFE_STAGE_OPENINGS[next.manifest.id];
  if (safeOpening) {
    next.scenario.opening = {
      ...next.scenario.opening,
      text: safeOpening,
    };
  }
  const initialFlags = { ...(next.scenario.initialFlags || {}) };
  for (const key of FUTURE_DONE_FLAGS) {
    if (initialFlags[key] === true) initialFlags[key] = false;
  }
  next.scenario.initialFlags = initialFlags;
  return next;
}

export function createXingyuehuLandingPlaytestSave(
  mods: readonly ScenarioMod[],
  generatedAt = new Date().toISOString(),
): SaveData {
  const source = mods.find(mod => mod.manifest.id === QINGYU_OPENING_PLAYTEST_MOD_ID);
  if (!source) throw new Error(`从落地开始的星月湖试玩需要内置模组 ${QINGYU_OPENING_PLAYTEST_MOD_ID}`);
  const save = createQingyuOpeningPlaytestSave(source, generatedAt);
  delete save.系统.扩展[QINGYU_OPENING_PLAYTEST_EXTENSION_KEY];
  save.元数据 = {
    ...save.元数据,
    存档ID: XINGYUEHU_LANDING_PLAYTEST_SAVE_ID,
    存档名: XINGYUEHU_LANDING_PLAYTEST_SLOT,
    创建时间: generatedAt,
    更新时间: generatedAt,
  };
  const marker: XingyuehuLandingPlaytestMarker = {
    kind: XINGYUEHU_LANDING_PLAYTEST_KIND,
    routeMode: XINGYUEHU_LANDING_ROUTE_MODE,
    disposable: true,
    persistence: 'isolated-local',
    scope: 'lcq.stage_01-xiao_opens_resources',
    startModId: XINGYUEHU_LANDING_PLAYTEST_START_MOD_ID,
    endModId: XINGYUEHU_LANDING_PLAYTEST_END_MOD_ID,
    endEventId: XINGYUEHU_LANDING_PLAYTEST_END_EVENT_ID,
    routeStageIds: [...XINGYUEHU_LANDING_ROUTE_STAGE_IDS],
  };
  save.系统.扩展[XINGYUEHU_LANDING_PLAYTEST_EXTENSION_KEY] = marker;
  return save;
}
