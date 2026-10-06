// 运行时覆盖：把南荒 04 关的 s04_02（鬼王峒武士袭击）改成「迎敌 → 战斗 → 收尾」三段合同，
// 并造一份带「清羽记开局」试玩签名的隔离存档。不改任何数据文件、不改任何已有源码。
//
// 合同形状（只用引擎已有特性）：
//   trial_engage      prepare，forceFixed 固定遇敌文字，授予 combat_engaged
//   trial_after_win   requiresPreparation + visibleWhen(flags.trial.combat.result = win)
//   trial_after_lose  同上，= lose
//   trial_after_rout  同上，= rout
// 战斗卡片结束时写 flags['trial.combat.result']，对应的那一个收尾动作才会出现。
import type { CharacterBaseInfo, SaveData } from '@/types/game';
import { createMinimalSaveDataV3 } from '@/utils/dataRepair';
import type { ScenarioMod } from '@/modules/scenarioMods/schema';
import { advanceScenarioRuntime } from '@/modules/scenarioMods/runtime';
import { applyStrictScenarioInitializationToSave, buildStrictScenarioInitialization } from '@/modules/scenarioMods/strictInitializer';
import {
  QINGYU_OPENING_PLAYTEST_EXTENSION_KEY,
  QINGYU_OPENING_PLAYTEST_KIND,
} from '@/modules/scenarioMods/qingyuOpeningPlaytest';
import { ENCOUNTER_TEXT, EPILOGUES, F03_EVENT_ID } from './f03Scenario';
import type { BattleMode } from './engine';
import {
  COMBAT_TRIAL_EXTENSION_KEY,
  COMBAT_TRIAL_FLAG_RESULT,
  COMBAT_TRIAL_PREPARATION,
  initialTrialState,
} from './trialState';

export const COMBAT_TRIAL_MOD_ID = 'lcq.stage_04';
export const COMBAT_TRIAL_CHARACTER_ID = 'char_combat_trial_v1';
export const COMBAT_TRIAL_SLOT = '战斗试玩';
export const COMBAT_TRIAL_ENGAGE_ACTION_ID = 'trial_engage';

type Contract = NonNullable<NonNullable<ScenarioMod['scenario']['events']>[number]['playerCompletionContract']>;
type Action = Contract['actions'][number];

export function overlayCombatTrialStage(mod: ScenarioMod): ScenarioMod {
  if (mod.manifest.id !== COMBAT_TRIAL_MOD_ID) {
    throw new Error(`战斗试玩需要内置模组 ${COMBAT_TRIAL_MOD_ID}，拿到的是 ${mod.manifest.id}`);
  }
  const next = structuredClone(mod);
  const event = next.scenario.events?.find(item => item.id === F03_EVENT_ID);
  const original = event?.playerCompletionContract?.actions?.find(item => item.id === 'advance_declared_objective');
  if (!event || !original) {
    throw new Error(`战斗试玩覆盖失败：${COMBAT_TRIAL_MOD_ID} 里找不到 ${F03_EVENT_ID} 的 advance_declared_objective 动作（04 关数据形状已变）`);
  }
  const scene = {
    cast: original.cast,
    sceneLocation: original.sceneLocation,
    dayPart: original.dayPart,
    previousBeat: original.previousBeat,
  };
  const engage: Action = {
    id: COMBAT_TRIAL_ENGAGE_ACTION_ID,
    kind: 'prepare',
    grantsPreparation: COMBAT_TRIAL_PREPARATION,
    label: '循着哨声迎向雾里',
    actionText: '我循着雾里的哨声迎了上去',
    timeCost: 1,
    ...scene,
    forceFixed: true,
    fallbackText: ENCOUNTER_TEXT,
    outcomeText: {
      success: '你循着哨声迎进了雾里；遭遇已经发生，战斗尚未结束。',
      partial: '该动作类型不产生 partial。',
      failure: '该动作类型不产生 failure。',
    },
  };
  const after = Object.values(EPILOGUES).map((ep): Action => ({
    id: ep.actionId,
    label: ep.label,
    actionText: ep.actionText,
    timeCost: 1,
    requiresPreparation: [COMBAT_TRIAL_PREPARATION],
    visibleWhen: [{ path: `flags.${COMBAT_TRIAL_FLAG_RESULT}`, operator: 'eq', value: ep.result }],
    ...scene,
    previousBeat: '山涧雾战已经分出结果，援手赶到。',
    forceFixed: true,
    fallbackText: ep.fallbackText,
    fixedFacts: ep.facts,
    factChecks: ep.factChecks,
    ledgerEffects: {
      worldFacts: ep.worldFacts,
      ...(Object.keys(ep.injuries).length ? { injuries: ep.injuries } : {}),
    },
    outcomeText: {
      success: `你${ep.label}；这一拍到此结束。`,
      partial: '该动作类型不产生 partial。',
      failure: '该动作类型不产生 failure。',
    },
  }));
  event.playerCompletionContract = { kind: 'objective_action', settleOn: ['success'], actions: [engage, ...after] };
  // 原回执绑在被替换掉的 advance_declared_objective 上；改绑到三个收尾动作，免得事实账少一条。
  event.narrativeFactReceipts = (event.narrativeFactReceipts || []).flatMap(receipt => (
    receipt.actionId === 'advance_declared_objective'
      ? Object.values(EPILOGUES).map(ep => ({ ...receipt, id: `${receipt.id}.${ep.result}`, actionId: ep.actionId }))
      : [receipt]
  ));
  return next;
}

/** 与 qingyuOpeningPlaytest.ts 内（未导出）的 applyCreationPreset 同逻辑：把开局预设写进主角身份。 */
function applyCreationPreset(save: SaveData, mod: ScenarioMod): void {
  const preset = mod.scenario.opening.creationPreset;
  const identity = save.角色.身份 as CharacterBaseInfo;
  identity.名字 = preset?.characterName || identity.名字;
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

export interface CombatTrialSaveOptions {
  mode: BattleMode;
  seed?: number | null;
  forced?: number[];
  generatedAt?: string;
}

export function createCombatTrialSave(mod: ScenarioMod, options: CombatTrialSaveOptions): SaveData {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const trialMod = overlayCombatTrialStage(mod);
  const save = applyStrictScenarioInitializationToSave(
    createMinimalSaveDataV3(),
    buildStrictScenarioInitialization(trialMod, generatedAt),
  );
  applyCreationPreset(save, mod);
  // 预跑一轮引擎：激活发生在 advanceScenarioRuntime 内部，不预跑第一屏没有任务栏和动作按钮。
  save.世界 = advanceScenarioRuntime(save).saveData.世界;

  save.元数据 = {
    ...save.元数据,
    存档ID: 'combat-trial-v1',
    存档名: COMBAT_TRIAL_SLOT,
    创建时间: generatedAt,
    更新时间: generatedAt,
  };
  // 开场正文是黎明；固定到 6 点，免得收尾动作的「清晨」时段把时钟推到次日。
  (save.元数据.时间 as any).小时 = 6;
  (save.元数据.时间 as any).分钟 = 0;
  delete (save.系统.扩展 as any).开发验收;
  // 借用「清羽记开局」签名，让这份存档走模块演出链路（固定文本不请求模型）、并启用终点卡片。
  (save.系统.扩展 as any)[QINGYU_OPENING_PLAYTEST_EXTENSION_KEY] = {
    kind: QINGYU_OPENING_PLAYTEST_KIND,
    disposable: true,
    persistence: 'isolated-local',
    scope: `${COMBAT_TRIAL_MOD_ID}-s04_02-combat-trial`,
    startModId: COMBAT_TRIAL_MOD_ID,
    endModId: COMBAT_TRIAL_MOD_ID,
    endEventId: F03_EVENT_ID,
    eventIds: [F03_EVENT_ID],
  };
  (save.系统.扩展 as any)[COMBAT_TRIAL_EXTENSION_KEY] = initialTrialState(options.mode, options.seed ?? null, options.forced || []);
  save.系统.历史.叙事 = [{
    type: 'gm',
    content: trialMod.scenario.opening.text,
    time: '【南荒·熊耳铺外】',
    actionOptions: [],
  }];
  save.社交.记忆.短期记忆 = [trialMod.scenario.opening.text];
  return save;
}

/** New isolated trial: preserve the real event contract and start the same scene host used by the game. */
export function createSceneCombatTrialSave(mod: ScenarioMod, options: CombatTrialSaveOptions): SaveData {
  const save = createCombatTrialSave(mod, options);
  const runtime = (save.世界 as any).状态.剧本模组;
  runtime.events = structuredClone(mod.scenario.events || []);
  const before = runtime.events.find((event: any) => event.id === 'lcq.event.s04_01');
  if (before) runtime.flags['event.s04_01.done'] = true;
  runtime.completedEventIds = [...new Set([...(runtime.completedEventIds || []), 'lcq.event.s04_01'])];
  runtime.activeEventIds = [F03_EVENT_ID];
  runtime.completedEventIds = runtime.completedEventIds.filter((id:string) => id !== F03_EVENT_ID);
  return save;
}
