import type { SaveData } from '@/types/game';
import { createMinimalSaveDataV3 } from '@/utils/dataRepair';
import { buildLocalJudgementPreflight } from '@/utils/judgementPreflight';
import { persistPendingJudgement, resolvePendingJudgement, type JudgementOutcome } from '@/utils/judgementEngine';

import type { ScenarioMod } from './schema';
import { advanceScenarioRuntime } from './runtime';
import { applyStrictScenarioInitializationToSave, buildStrictScenarioInitialization } from './strictInitializer';
import {
  confirmWorldSimulationDivergence,
  getCurrentWorldSituation,
  settleWorldSimulationJudgement,
  type WorldSimulationRuntime,
} from './worldSimulation';

export const WORLD_SIMULATION_DEMO_MOD_ID = 'lyg.dingtao_beijing';
export const WORLD_SIMULATION_DEMO_GENERATED_AT = '2026-08-13T00:00:00.000Z';
export const WORLD_SIMULATION_DEMO_SITUATIONS = {
  enthronement: 'world-sim.lyg.s01_05.enthronement',
  guoJie: 'world-sim.lyg.s01_06.assassination',
  dongZhuo: 'world-sim.lyg.s01_07.liangzhou_handoff',
} as const;

export interface WorldSimulationDemoStep {
  saveData: SaveData;
  steps: number;
  transitions: string[];
}

function runtimeOf(saveData: SaveData): WorldSimulationRuntime {
  const worldState = saveData.世界?.状态 as unknown as { 剧本模组?: WorldSimulationRuntime };
  const runtime = worldState?.剧本模组;
  if (!runtime || runtime.storyMode !== 'world_sim') throw new Error('Demo 存档没有六朝世界运行时');
  return runtime;
}

function cloneDemoSave(saveData: SaveData): SaveData {
  // Vue 会把 ref 内的存档变成 Proxy；JSON 真值本就是存档的持久化边界，
  // 用同一边界克隆可避免 structuredClone(proxy) 在浏览器抛错。
  return JSON.parse(JSON.stringify(saveData)) as SaveData;
}

/** 构造纯内存、可丢弃的世界模式存档。调用方不会得到任何持久化副作用。 */
export function createWorldSimulationDemoSave(mod: ScenarioMod): SaveData {
  if (mod.manifest.id !== WORLD_SIMULATION_DEMO_MOD_ID || !mod.scenario.worldSimulation) {
    throw new Error(`六朝世界 Demo 需要内置模组 ${WORLD_SIMULATION_DEMO_MOD_ID}`);
  }
  const base = createMinimalSaveDataV3();
  const preset = mod.scenario.opening.creationPreset;
  if (preset) {
    base.角色.身份 = {
      ...base.角色.身份,
      名字: `[Demo] ${preset.characterName}`,
      性别: preset.gender,
      种族: preset.race,
      出生: preset.origin.name,
      先天六司: {
        根骨: preset.attributes.rootBone,
        灵性: preset.attributes.spirituality,
        悟性: preset.attributes.comprehension,
        气运: preset.attributes.fortune,
        魅力: preset.attributes.charm,
        心性: preset.attributes.temperament,
      },
    };
  }
  base.元数据 = {
    ...base.元数据,
    存档ID: 'dev-world-simulation-demo-memory-only',
    存档名: '[DEV] 六朝世界隔离演示（不保存）',
    创建时间: WORLD_SIMULATION_DEMO_GENERATED_AT,
    更新时间: WORLD_SIMULATION_DEMO_GENERATED_AT,
  };
  base.系统.扩展 = {
    ...(base.系统.扩展 || {}),
    开发验收: {
      kind: 'world-simulation-demo',
      disposable: true,
      persistence: 'memory-only',
    },
  };
  return applyStrictScenarioInitializationToSave(
    base,
    buildStrictScenarioInitialization(mod, WORLD_SIMULATION_DEMO_GENERATED_AT, { storyMode: 'world_sim' }),
  );
}

export function advanceWorldSimulationDemo(saveData: SaveData, count = 1): WorldSimulationDemoStep {
  let next = cloneDemoSave(saveData);
  const transitions: string[] = [];
  const safeCount = Math.max(0, Math.min(64, Math.floor(count)));
  for (let index = 0; index < safeCount; index += 1) {
    const result = advanceScenarioRuntime(next);
    next = result.saveData;
    transitions.push(...result.transitions.map(item => `${item.type}:${item.id}`));
  }
  return { saveData: next, steps: safeCount, transitions };
}

export function advanceWorldSimulationDemoToSituation(
  saveData: SaveData,
  situationId: string,
  maxSteps = 48,
): WorldSimulationDemoStep {
  let next = cloneDemoSave(saveData);
  const transitions: string[] = [];
  let steps = 0;
  while (steps < maxSteps && getCurrentWorldSituation(runtimeOf(next))?.id !== situationId) {
    const result = advanceScenarioRuntime(next);
    next = result.saveData;
    transitions.push(...result.transitions.map(item => `${item.type}:${item.id}`));
    steps += 1;
    if (!getCurrentWorldSituation(runtimeOf(next))) break;
  }
  if (getCurrentWorldSituation(runtimeOf(next))?.id !== situationId) {
    throw new Error(`未能在 ${maxSteps} 轮内到达局势 ${situationId}`);
  }
  return { saveData: next, steps, transitions };
}

export function prepareWorldSimulationDemoCandidate(
  saveData: SaveData,
  situationId: string,
  actionText: string,
  testOutcome: Extract<JudgementOutcome, 'success' | 'great_success' | 'perfect'> = 'great_success',
): WorldSimulationDemoStep {
  const arrived = advanceWorldSimulationDemoToSituation(saveData, situationId);
  const next = arrived.saveData;
  const runtime = runtimeOf(next);
  const proposal = buildLocalJudgementPreflight(actionText, next, Number(runtime.worldTurn) || 0);
  if (!proposal || proposal.authorityReceipt?.kind !== 'world_sim_intervention') {
    throw new Error('演示行动没有得到世界合同签发的本地判定回执');
  }
  persistPendingJudgement(next, proposal);
  const resolution = resolvePendingJudgement(next, proposal.id, {
    currentTurn: Number(runtime.worldTurn) || 0,
    testOutcome,
  });
  const settled = settleWorldSimulationJudgement(next, resolution);
  if (!settled.pending) throw new Error('固定成功判定没有生成待确认 IF 候选');
  return {
    saveData: next,
    steps: arrived.steps,
    transitions: [...arrived.transitions, `judgement_resolved:${resolution.id}:${resolution.outcome}`],
  };
}

export function confirmWorldSimulationDemoCandidate(saveData: SaveData): SaveData {
  const next = cloneDemoSave(saveData);
  const result = confirmWorldSimulationDivergence(next);
  if (!result.ok) throw new Error(result.reason || '确认 IF 失败');
  return next;
}

export function runDefaultWorldSimulationDemo(mod: ScenarioMod): WorldSimulationDemoStep {
  let next = createWorldSimulationDemoSave(mod);
  const transitions: string[] = [];
  let steps = 0;
  while (steps < 48 && getCurrentWorldSituation(runtimeOf(next))) {
    const result = advanceScenarioRuntime(next);
    next = result.saveData;
    transitions.push(...result.transitions.map(item => `${item.type}:${item.id}`));
    steps += 1;
  }
  if (getCurrentWorldSituation(runtimeOf(next))) throw new Error('默认世界线未能在 48 轮内完成三项结算');
  return { saveData: next, steps, transitions };
}
