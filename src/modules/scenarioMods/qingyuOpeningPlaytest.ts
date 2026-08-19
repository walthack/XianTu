import type { CharacterBaseInfo, SaveData } from '@/types/game';
import { createMinimalSaveDataV3 } from '@/utils/dataRepair';

import type { ScenarioMod } from './schema';
import { advanceScenarioRuntime } from './runtime';
import { applyStrictScenarioInitializationToSave, buildStrictScenarioInitialization } from './strictInitializer';

export const QINGYU_OPENING_PLAYTEST_CHARACTER_ID = 'char_qingyu_opening_playtest_v1';
export const QINGYU_OPENING_PLAYTEST_SLOT = '清羽记开局';
export const QINGYU_OPENING_PLAYTEST_KIND = 'qingyu-demo-v1';
export const QINGYU_OPENING_PLAYTEST_MOD_ID = 'lcq.stage_01';
export const QINGYU_OPENING_PLAYTEST_END_MOD_ID = 'lcq.stage_02';
export const QINGYU_OPENING_PLAYTEST_EXTENSION_KEY = '清羽记开局';

export const QINGYU_OPENING_PLAYTEST_EVENT_IDS = [
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

export interface QingyuOpeningPlaytestMarker {
  kind: typeof QINGYU_OPENING_PLAYTEST_KIND;
  disposable: true;
  persistence: 'isolated-local';
  scope: string;
  startModId: typeof QINGYU_OPENING_PLAYTEST_MOD_ID;
  endModId: typeof QINGYU_OPENING_PLAYTEST_END_MOD_ID;
  eventIds: string[];
}

const OPENING_TEXT = `航班被紫色雷电击中之后，你和段强从现代世界坠入一片陌生草原。远处已有秦军与半兽人交战。

你是程宗扬。这一段按固定顺序走完十八拍：穿越、段强之死、战场遇月霜、太乙真宗救援、王哲传功与三托付、左武军覆灭、五原城落为奴隶、白湖商馆赌局，直到脱身。顺序由 Canon Rail 钉死，你可以决定怎么做，但不能改下一拍是什么。

任务栏会给出当前合同；右栏有完成合同按钮。有两处绝路会直接结束本局：战场上不走，会被王哲九阳自爆的焰浪吞没；在苏妲己面前拒绝三个月期限，会当场受炮烙。`;

function applyCreationPreset(save: SaveData, mod: ScenarioMod): void {
  const preset = mod.scenario.opening.creationPreset;
  const identity = save.角色.身份 as CharacterBaseInfo;
  identity.名字 = preset?.characterName || '程宗扬';
  if (preset?.gender) identity.性别 = preset.gender;
  if (preset?.race) identity.种族 = preset.race;
  identity.世界 = (mod.world?.name || '六朝') as unknown as CharacterBaseInfo['世界'];
  identity.天资 = (preset?.talentTier || { name: '异世来客' }) as CharacterBaseInfo['天资'];
  identity.出生 = preset?.origin?.name || '现代来客';
  identity.灵根 = (preset?.spiritRoot || { name: '生死根' }) as CharacterBaseInfo['灵根'];
  identity.天赋 = (preset?.talents || []).map((talent, index) => ({
    id: 9100 + index,
    name: talent.name,
    description: talent.description,
    rarity: '特殊',
    talent_cost: 0,
  })) as unknown as CharacterBaseInfo['天赋'];
  if (preset?.attributes) {
    identity.先天六司 = {
      根骨: preset.attributes.rootBone,
      灵性: preset.attributes.spirituality,
      悟性: preset.attributes.comprehension,
      气运: preset.attributes.fortune,
      魅力: preset.attributes.charm,
      心性: preset.attributes.temperament,
    };
  }
}

export function createQingyuOpeningPlaytestSave(mod: ScenarioMod, generatedAt = new Date().toISOString()): SaveData {
  if (mod.manifest.id !== QINGYU_OPENING_PLAYTEST_MOD_ID) {
    throw new Error(`清羽记开局试玩需要内置模组 ${QINGYU_OPENING_PLAYTEST_MOD_ID}`);
  }
  const save = applyStrictScenarioInitializationToSave(
    createMinimalSaveDataV3(),
    buildStrictScenarioInitialization(mod, generatedAt),
  );
  applyCreationPreset(save, mod);
  // 预跑一轮引擎，把首拍激活出来。
  //
  // 真机实测（2026-08-19）：不预跑的话，玩家进游戏第一屏的任务栏只有
  // 「章节：第1章·穿越」——**没有 objective、没有完成合同按钮**，因为激活发生在
  // `advanceScenarioRuntime` 内部，而它要等玩家先发一个回合才跑。
  // 本 demo 要验的正是"指引清不清楚"，第一屏空着就验不了。
  // （这不是 demo 专有的问题：正常开局同样如此，只是那里玩家习惯先自己描述一句。）
  const primed = advanceScenarioRuntime(save).saveData;
  save.世界 = primed.世界;

  save.元数据 = {
    ...save.元数据,
    存档ID: 'qingyu-opening-playtest-v1',
    存档名: QINGYU_OPENING_PLAYTEST_SLOT,
    创建时间: generatedAt,
    更新时间: generatedAt,
  };
  delete save.系统.扩展.开发验收;
  const marker: QingyuOpeningPlaytestMarker = {
    kind: QINGYU_OPENING_PLAYTEST_KIND,
    disposable: true,
    persistence: 'isolated-local',
    scope: 'lcq.stage_01-lcq.stage_02/s01_01-baihu_shangguan_escape',
    startModId: QINGYU_OPENING_PLAYTEST_MOD_ID,
    endModId: QINGYU_OPENING_PLAYTEST_END_MOD_ID,
    eventIds: [...QINGYU_OPENING_PLAYTEST_EVENT_IDS],
  };
  save.系统.扩展[QINGYU_OPENING_PLAYTEST_EXTENSION_KEY] = marker;
  save.系统.历史.叙事 = [{
    type: 'gm',
    content: OPENING_TEXT,
    time: '【清羽·草原落地】',
    actionOptions: [
      '先确认段强还在身边，弄清这片草原是哪里',
      '避开交战双方，找掩体观察',
      '先处理落地后的伤势与方位',
    ],
  }];
  save.社交.记忆.短期记忆 = [OPENING_TEXT];
  return save;
}

export function isQingyuOpeningPlaytestSave(saveData: SaveData | null | undefined): boolean {
  return saveData?.系统?.扩展?.[QINGYU_OPENING_PLAYTEST_EXTENSION_KEY]?.kind === QINGYU_OPENING_PLAYTEST_KIND;
}
