import type { CharacterBaseInfo, SaveData } from '@/types/game';
import { createMinimalSaveDataV3 } from '@/utils/dataRepair';

import type { ScenarioMod } from './schema';
import { advanceScenarioRuntime } from './runtime';
import { applyStrictScenarioInitializationToSave, buildStrictScenarioInitialization } from './strictInitializer';

export const XINGYUEHU_QUEST_PLAYTEST_CHARACTER_ID = 'char_xingyuehu_quest_playtest_v1';
export const XINGYUEHU_QUEST_PLAYTEST_SLOT = '星月湖任务线试玩';
export const XINGYUEHU_QUEST_PLAYTEST_KIND = 'xingyuehu-quest-demo-v1';
export const XINGYUEHU_QUEST_PLAYTEST_EXTENSION_KEY = '星月湖任务线试玩';
export const XINGYUEHU_QUEST_PLAYTEST_START_MOD_ID = 'playtest.xingyuehu.old_war';
export const XINGYUEHU_QUEST_PLAYTEST_FATE_MOD_ID = 'playtest.xingyuehu.entrustment';
export const XINGYUEHU_QUEST_PLAYTEST_END_MOD_ID = 'playtest.xingyuehu.jiankang';

export const XINGYUEHU_QUEST_PLAYTEST_START_SOURCE_MOD_ID = 'lcq.stage_04b_lingfei_baiyi_crisis';
export const XINGYUEHU_QUEST_PLAYTEST_FATE_SOURCE_MOD_ID = 'lcq.stage_05b';
export const XINGYUEHU_QUEST_PLAYTEST_END_SOURCE_MOD_ID = 'lcq.stage_07_qingyuan_jiankang';

export const XINGYUEHU_QUEST_PLAYTEST_EVENT_IDS = [
  'lcq.event.xieyi_biling_war',
  'lcq.event.xieyi_entrustment',
  'lcq.event.xiaoyaoyi_arrives',
  'lcq.event.s07_05_eight_steeds_informed',
  'lcq.event.xiao_opens_resources',
] as const;

const STAGE_CONFIG: Record<string, {
  playtestModId: string;
  name: string;
  chapterId: string;
  chapterTitle: string;
  opening: string;
  openingLocationId?: string;
  eventIds: readonly string[];
  nextStageId?: string;
  nextStageName?: string;
}> = {
  [XINGYUEHU_QUEST_PLAYTEST_START_SOURCE_MOD_ID]: {
    playtestModId: XINGYUEHU_QUEST_PLAYTEST_START_MOD_ID,
    name: '星月湖任务线试玩·碧鲮旧战',
    chapterId: 'playtest.xingyuehu.chapter.old_war',
    chapterTitle: '碧鲮旧战',
    opening: '海神殿里的潮声一阵紧过一阵。谢艺把朱狐冠搁在膝前，示意你坐近些——有些关于碧鲮族、鲛族和岳帅旧部的事，他只打算说这一次。',
    openingLocationId: 'liuchao.location.sea_temple',
    eventIds: ['lcq.event.xieyi_biling_war'],
    nextStageId: XINGYUEHU_QUEST_PLAYTEST_FATE_SOURCE_MOD_ID,
    nextStageName: '星月湖任务线试玩·鬼王峒托付',
  },
  [XINGYUEHU_QUEST_PLAYTEST_FATE_SOURCE_MOD_ID]: {
    playtestModId: XINGYUEHU_QUEST_PLAYTEST_FATE_MOD_ID,
    name: '星月湖任务线试玩·鬼王峒托付',
    chapterId: 'playtest.xingyuehu.chapter.entrustment',
    chapterTitle: '鬼王峒托付',
    opening: '鬼王峒的乱石间还残着龙神坠落后的腥风。乐明珠跪在谢艺身旁，指间银针已经展开；谢艺却先看向你，像是还有一件事必须交代。',
    openingLocationId: 'liuchao.location.gui_wang_dong',
    eventIds: ['lcq.event.xieyi_entrustment'],
    nextStageId: XINGYUEHU_QUEST_PLAYTEST_END_SOURCE_MOD_ID,
    nextStageName: '星月湖任务线试玩·建康回响',
  },
  [XINGYUEHU_QUEST_PLAYTEST_END_SOURCE_MOD_ID]: {
    playtestModId: XINGYUEHU_QUEST_PLAYTEST_END_MOD_ID,
    name: '星月湖任务线试玩·建康回响',
    chapterId: 'playtest.xingyuehu.chapter.jiankang',
    chapterTitle: '建康回响',
    opening: '南荒的消息已经先一步传到建康。萧遥逸登门时没有带随从；你得把眼前这件事当面说清。',
    openingLocationId: 'liuchao.location.jiankang',
    eventIds: [
      'lcq.event.xiaoyaoyi_arrives',
      'lcq.event.s07_05_eight_steeds_informed',
      'lcq.event.xiao_opens_resources',
    ],
  },
};

export interface XingyuehuQuestPlaytestMarker {
  kind: typeof XINGYUEHU_QUEST_PLAYTEST_KIND;
  disposable: true;
  persistence: 'isolated-local';
  scope: string;
  startModId: typeof XINGYUEHU_QUEST_PLAYTEST_START_MOD_ID;
  endModId: typeof XINGYUEHU_QUEST_PLAYTEST_END_MOD_ID;
  eventIds: string[];
}

/**
 * 在内存副本中把每关裁成星月湖纵切；builtin/canon 源数据保持不变。
 * 试玩使用独立 modId，因此不会把原关卡未载入的 Canon Rail 事件误判为待完成内容。
 */
export function overlayXingyuehuQuestPlaytestStage(mod: ScenarioMod): ScenarioMod {
  const config = STAGE_CONFIG[mod.manifest.id];
  if (!config) return mod;
  const next = structuredClone(mod);
  const selected = new Set(config.eventIds);
  const events = (next.scenario.events || []).filter(event => selected.has(event.id));
  if (events.length !== selected.size) throw new Error(`星月湖试玩事件缺失：${config.eventIds.join(', ')}`);
  const initialFlags: Record<string, string | number | boolean | null> = {};
  for (const event of events) {
    for (const condition of event.completion || []) {
      if (condition.path.startsWith('flags.') && condition.operator === 'eq' && condition.value === true) {
        initialFlags[condition.path.slice('flags.'.length)] = false;
      }
    }
  }

  if (next.manifest.id === XINGYUEHU_QUEST_PLAYTEST_FATE_SOURCE_MOD_ID) {
    initialFlags['event.slay_dragon.done'] = true;
  }
  // 建康回响按试玩顺序逐拍开放；命运仍只从上一幕的本地结算继承。
  if (next.manifest.id === XINGYUEHU_QUEST_PLAYTEST_END_SOURCE_MOD_ID) {
    initialFlags['event.xieyi_entrustment.done'] = true;
    const informed = events.find(event => event.id === 'lcq.event.s07_05_eight_steeds_informed');
    const resources = events.find(event => event.id === 'lcq.event.xiao_opens_resources');
    if (informed) informed.conditions = [{ path: 'flags.event.xiaoyaoyi_arrives.done', operator: 'eq', value: true }];
    if (resources) resources.conditions = [{ path: 'flags.event.s07_05.done', operator: 'eq', value: true }];
  }

  next.scenario.initialFlags = initialFlags;
  next.scenario.events = events;
  next.scenario.chapters = [{
    id: config.chapterId,
    title: config.chapterTitle,
    summary: config.opening,
    eventIds: [...config.eventIds],
    activation: [],
    completion: structuredClone(events.at(-1)?.completion || []),
  }];
  delete next.scenario.worldSimulation;
  next.scenario.opening = {
    ...next.scenario.opening,
    text: config.opening,
    ...(config.openingLocationId ? { locationId: config.openingLocationId } : {}),
  };
  next.manifest = {
    ...next.manifest,
    id: config.playtestModId,
    name: config.name,
    description: '隔离试玩：只保留星月湖任务线的承重事件，使用正式游戏界面与本地结算。',
    nextStageId: config.nextStageId,
    nextStageName: config.nextStageName,
  };
  return next;
}

function applyPlayerIdentity(save: SaveData): void {
  const identity = save.角色.身份 as CharacterBaseInfo;
  identity.名字 = '程宗扬';
  identity.性别 = '男';
  identity.种族 = '人族';
  identity.世界 = '六朝' as unknown as CharacterBaseInfo['世界'];
  identity.出生 = '现代来客';
}

export function createXingyuehuQuestPlaytestSave(
  mods: readonly ScenarioMod[],
  generatedAt = new Date().toISOString(),
): SaveData {
  const source = mods.find(mod => mod.manifest.id === XINGYUEHU_QUEST_PLAYTEST_START_SOURCE_MOD_ID);
  if (!source) throw new Error(`星月湖任务线试玩需要内置模组 ${XINGYUEHU_QUEST_PLAYTEST_START_SOURCE_MOD_ID}`);
  const playtestMod = overlayXingyuehuQuestPlaytestStage(source);
  let save = applyStrictScenarioInitializationToSave(
    createMinimalSaveDataV3(),
    buildStrictScenarioInitialization(playtestMod, generatedAt),
  );
  applyPlayerIdentity(save);
  save.元数据 = {
    ...save.元数据,
    存档ID: 'xingyuehu-quest-playtest-v1',
    存档名: XINGYUEHU_QUEST_PLAYTEST_SLOT,
    创建时间: generatedAt,
    更新时间: generatedAt,
  };
  delete save.系统.扩展.开发验收;
  const marker: XingyuehuQuestPlaytestMarker = {
    kind: XINGYUEHU_QUEST_PLAYTEST_KIND,
    disposable: true,
    persistence: 'isolated-local',
    scope: 'xieyi_biling_war-xiao_opens_resources',
    startModId: XINGYUEHU_QUEST_PLAYTEST_START_MOD_ID,
    endModId: XINGYUEHU_QUEST_PLAYTEST_END_MOD_ID,
    eventIds: [...XINGYUEHU_QUEST_PLAYTEST_EVENT_IDS],
  };
  save.系统.扩展[XINGYUEHU_QUEST_PLAYTEST_EXTENSION_KEY] = marker;
  save.系统.历史.叙事 = [{
    type: 'gm',
    content: playtestMod.scenario.opening.text,
    time: '【南荒·海神殿】',
    actionOptions: [
      '听谢艺讲清碧鲮族与鲛族旧战',
      '先问清朱狐冠从何而来',
      '听他说岳帅还有什么未竟之事',
    ],
  }];
  save.社交.记忆.短期记忆 = [playtestMod.scenario.opening.text];
  save = advanceScenarioRuntime(save).saveData;
  return save;
}

export function isXingyuehuQuestPlaytestSave(saveData: SaveData | null | undefined): boolean {
  return saveData?.系统?.扩展?.[XINGYUEHU_QUEST_PLAYTEST_EXTENSION_KEY]?.kind
    === XINGYUEHU_QUEST_PLAYTEST_KIND;
}

export function isXingyuehuQuestPlaytestFinished(saveData: SaveData | null | undefined): boolean {
  if (!isXingyuehuQuestPlaytestSave(saveData)) return false;
  const runtime = (saveData as any)?.世界?.状态?.剧本模组;
  return runtime?.modId === XINGYUEHU_QUEST_PLAYTEST_END_MOD_ID
    && runtime?.flags?.['event.xiao_opens_resources.done'] === true
    && !runtime?.currentChapterId
    && (!Array.isArray(runtime?.activeEventIds) || runtime.activeEventIds.length === 0);
}
