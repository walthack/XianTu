import type { CharacterBaseInfo, SaveData } from '@/types/game';

import type { ScenarioMod } from './schema';
import {
  createWorldSimulationDemoSave,
  WORLD_SIMULATION_DEMO_MOD_ID,
  WORLD_SIMULATION_DEMO_SITUATIONS,
} from './worldSimulationDemo';

export const WORLD_SIMULATION_PLAYTEST_CHARACTER_ID = 'char_world_sim_playtest_v1';
export const WORLD_SIMULATION_PLAYTEST_SLOT = '六朝世界试玩';
export const WORLD_SIMULATION_PLAYTEST_KIND = 'world-simulation-player-playtest-v1';

export interface WorldSimulationPlaytestFeedback {
  freedom?: number;
  canonFeel?: number;
  coherence?: number;
  notes?: string;
  savedAt?: string;
}

export interface WorldSimulationPlaytestMarker {
  kind: typeof WORLD_SIMULATION_PLAYTEST_KIND;
  disposable: true;
  persistence: 'isolated-local';
  scope: string;
  situationIds: string[];
  feedback?: WorldSimulationPlaytestFeedback;
}

const OPENING_TEXT = `洛都之乱方息，长秋宫外仍能听见昭阳宫方向的钟鼓。定陶王的继统已经成为各方必须面对的政治事实，但谁能活着走出接下来的宫变与权力交接，仍由人物选择、时间与玩家介入共同决定。

你是程宗扬。这里没有“完成原著下一拍”的任务：可以赶赴昭阳宫、联络霍子孟与吕雉、观察董卓和贾文和的安排，也可以暂不介入。世界会在每次重要行动后继续运转；若要改写郭解或董卓的命运，必须在局势窗口内用自己的话采取具体行动，并通过本地判定。`;

export function createWorldSimulationPlaytestSave(mod: ScenarioMod, generatedAt = new Date().toISOString()): SaveData {
  if (mod.manifest.id !== WORLD_SIMULATION_DEMO_MOD_ID) {
    throw new Error(`六朝世界试玩需要内置模组 ${WORLD_SIMULATION_DEMO_MOD_ID}`);
  }
  const save = createWorldSimulationDemoSave(mod);
  const preset = mod.scenario.opening.creationPreset;
  const identity = save.角色.身份 as CharacterBaseInfo;
  identity.名字 = preset?.characterName || '程宗扬';
  identity.世界 = mod.world as unknown as CharacterBaseInfo['世界'];
  identity.天资 = (preset?.talentTier || { name: '异世来客' }) as CharacterBaseInfo['天资'];
  identity.出生 = preset?.origin?.name || '殇侯门下';
  identity.灵根 = preset?.spiritRoot?.name || '生死根';
  identity.天赋 = (preset?.talents || []).map((talent, index) => ({
    id: 9100 + index,
    name: talent.name,
    description: talent.description,
    rarity: '特殊',
    talent_cost: 0,
  })) as unknown as CharacterBaseInfo['天赋'];

  save.元数据 = {
    ...save.元数据,
    存档ID: 'world-simulation-player-playtest-v1',
    存档名: WORLD_SIMULATION_PLAYTEST_SLOT,
    创建时间: generatedAt,
    更新时间: generatedAt,
  };
  delete save.系统.扩展.开发验收;
  save.系统.扩展.六朝世界试玩 = {
    kind: WORLD_SIMULATION_PLAYTEST_KIND,
    disposable: true,
    persistence: 'isolated-local',
    scope: 'lyg.dingtao_beijing/s01_05-s01_07',
    situationIds: Object.values(WORLD_SIMULATION_DEMO_SITUATIONS),
  } satisfies WorldSimulationPlaytestMarker;
  save.系统.历史.叙事 = [{
    type: 'gm',
    content: OPENING_TEXT,
    time: '【六朝·洛都暮色】',
    actionOptions: [
      '赶赴昭阳宫，亲眼确认拥立如何落成',
      '先联络霍子孟，询问北军与汉廷的底线',
      '暂不介入，观察各方下一步动作',
    ],
  }];
  save.社交.记忆.短期记忆 = [OPENING_TEXT];
  return save;
}

export function isWorldSimulationPlaytestSave(saveData: SaveData | null | undefined): boolean {
  return saveData?.系统?.扩展?.六朝世界试玩?.kind === WORLD_SIMULATION_PLAYTEST_KIND;
}

export function formatWorldSimulationPlaytestFeedback(saveData: SaveData): string {
  const runtime = saveData?.世界?.状态?.剧本模组;
  const marker = saveData?.系统?.扩展?.六朝世界试玩 as WorldSimulationPlaytestMarker | undefined;
  const feedback = marker?.feedback || {};
  const branch = (id: string) => runtime?.flags?.[`branch.${id}.active`] === true;
  const defaulted = (path: string) => runtime?.flags?.[path] === true;
  const guo = branch('lyg.if_guojie_longrest') ? '生还（长期休养 IF）'
    : defaulted('world.r2_10.lyg_event_s01_06.occurred') ? '默认结局' : '未结算';
  const dong = branch('lyg.if_dongzhuo_longrest') ? '生还（长期休养 IF）'
    : defaulted('world.r2_11.lyg_event_s01_07.occurred') ? '默认结局' : '未结算';
  return [
    '【六朝世界试玩反馈】',
    `世界回合：${Number(runtime?.worldTurn) || 0}`,
    `正式 IF：${(runtime?.divergences || []).filter((item: { branchId?: string }) => item.branchId).map((item: { branchId: string }) => item.branchId).join('、') || '无'}`,
    `郭解：${guo}`,
    `董卓：${dong}`,
    `自由感（1-5）：${feedback.freedom || '未填'}`,
    `原著感（1-5）：${feedback.canonFeel || '未填'}`,
    `因果连贯（1-5）：${feedback.coherence || '未填'}`,
    `补充：${feedback.notes?.trim() || '无'}`,
  ].join('\n');
}
