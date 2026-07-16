import type { CharacterProfile, SaveData, SaveSlot } from '@/types/game';
import { createMinimalSaveDataV3 } from '@/utils/dataRepair';

import type { ScenarioMod } from './schema';
import { applyStrictScenarioInitializationToSave, buildStrictScenarioInitialization } from './strictInitializer';

export const R2_ACCEPTANCE_CHARACTER_NAME = '[DEV] R2-0V 谢艺三路线';
export const R2_ACCEPTANCE_MARKER = 'r2-0v-xieyi-branchpoint';
export const R2_ACCEPTANCE_SLOT_NAMES = [
  'R2-0V-正典路线起点',
  'R2-0V-生还路线起点',
  'R2-0V-失踪路线起点',
] as const;

type AcceptanceProfile = CharacterProfile & {
  开发测试标记: { kind: typeof R2_ACCEPTANCE_MARKER; disposable: true; createdAt: string };
};

function buildPlayerIdentity(mod: ScenarioMod, save: SaveData): void {
  const preset = mod.scenario.opening.creationPreset;
  if (!preset) throw new Error('lcq.stage_06 缺少锁定创角预设，不能生成验收角色');
  const attributes = preset.attributes;
  save.角色.身份 = {
    ...save.角色.身份,
    名字: preset.characterName,
    性别: preset.gender,
    出生日期: { 年: 200, 月: 1, 日: 1 },
    种族: preset.race,
    世界: mod.world.name as any,
    天资: preset.talentTier as any,
    出生: preset.origin.name,
    灵根: preset.spiritRoot as any,
    天赋: preset.talents as any,
    先天六司: {
      根骨: attributes.rootBone,
      灵性: attributes.spirituality,
      悟性: attributes.comprehension,
      气运: attributes.fortune,
      魅力: attributes.charm,
      心性: attributes.temperament,
    },
    后天六司: { 根骨: 0, 灵性: 0, 悟性: 0, 气运: 0, 魅力: 0, 心性: 0 },
  };
  save.角色.属性.境界 = {
    名称: '四级·入微·中',
    阶段: '中',
    当前进度: 50,
    下一级所需: 100,
    突破描述: '金丹中期，足以参与鬼王峒围猎。',
  };
  save.角色.属性.气血 = { 当前: 2700, 上限: 2700 };
  save.角色.属性.灵气 = { 当前: 13500, 上限: 13500 };
  save.角色.属性.神识 = { 当前: 3800, 上限: 3800 };
  save.角色.属性.寿命 = { 当前: 20, 上限: 105 };
  save.角色.属性.声望 = 200;
}

/**
 * Build one neutral, pre-s06_03 save. All three slots are independent clones
 * of this same branch point; no expected outcome is baked into the save.
 */
export function buildR20VBranchpointSave(mod: ScenarioMod, slotName: string, generatedAt: string): SaveData {
  if (mod.manifest.id !== 'lcq.stage_06') throw new Error('R2-0V 验收入口只接受 lcq.stage_06');
  const base = createMinimalSaveDataV3();
  buildPlayerIdentity(mod, base);
  const initialized = applyStrictScenarioInitializationToSave(
    base,
    buildStrictScenarioInitialization(mod, generatedAt),
  );
  const runtime = (initialized as any).世界.状态.剧本模组;
  runtime.flags['event.s06_01.done'] = true;
  runtime.flags['event.s06_02.done'] = true;
  runtime.flags['event.s06_03.done'] = false;
  runtime.completedEventIds = ['lcq.event.s06_01', 'lcq.event.s06_02'];
  runtime.activeEventIds = ['lcq.event.s06_03'];
  runtime.completedChapterIds = [];
  runtime.currentChapterId = 'lcq.chapter.stage_06';
  runtime.divergences = [];
  runtime.offscreenResolvedEventIds = [];
  runtime.stallTurns = 0;
  delete runtime.nextStageReadyId;
  delete runtime.flags['event.s06_03.void'];
  delete runtime.flags['branch.lcq.if_xieyi_longrest.unlocked'];
  delete runtime.flags['branch.lcq.if_xieyi_longrest.active'];
  delete runtime.flags['character.xie_yi.status'];
  delete runtime.flags['world.xieyi_absence.active'];

  initialized.社交.记忆.短期记忆 = [
    '【DEV-only 验收起点】鬼巫王已败，商队正在围猎龙神；谢艺仍在战场，最终生死尚未发生。',
  ];
  initialized.社交.记忆.中期记忆 = [];
  initialized.社交.记忆.长期记忆 = [];
  initialized.社交.记忆.隐式中期记忆 = [];
  initialized.系统.历史 = { 叙事: [] };
  initialized.系统.扩展 = {
    ...(initialized.系统.扩展 || {}),
    开发验收: { kind: R2_ACCEPTANCE_MARKER, disposable: true, generatedAt },
  };
  initialized.元数据 = {
    ...initialized.元数据,
    存档ID: `${R2_ACCEPTANCE_MARKER}-${slotName}`,
    存档名: slotName,
    游戏版本: APP_VERSION,
    创建时间: generatedAt,
    更新时间: generatedAt,
    时间: { 年: 220, 月: 1, 日: 1, 小时: 12, 分钟: 0 },
  };
  return initialized;
}

export function buildR20VAcceptancePack(mod: ScenarioMod, generatedAt = new Date().toISOString()): {
  profile: AcceptanceProfile;
  saves: SaveSlot[];
} {
  const saves = R2_ACCEPTANCE_SLOT_NAMES.map((slotName): SaveSlot => ({
    存档名: slotName,
    保存时间: generatedAt,
    角色名字: '程宗扬',
    境界: '四级·入微·中',
    位置: '南荒·鬼王峒',
    游戏内时间: '仙道220年1月1日',
    存档数据: buildR20VBranchpointSave(mod, slotName, generatedAt),
  }));
  return {
    profile: {
      模式: '单机',
      角色: {
        ...saves[0].存档数据!.角色.身份,
        名字: R2_ACCEPTANCE_CHARACTER_NAME,
      },
      存档列表: {},
      开发测试标记: { kind: R2_ACCEPTANCE_MARKER, disposable: true, createdAt: generatedAt },
    },
    saves,
  };
}

export function isR20VAcceptanceProfile(profile: unknown): boolean {
  return (profile as any)?.开发测试标记?.kind === R2_ACCEPTANCE_MARKER;
}
