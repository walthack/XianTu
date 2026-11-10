/**
 * 双模型分工配置（mod-kit/dual-model.json；设计稿 2026-11-03-双模型分工 ⑤⑧，用户 22:26 定稿）。
 * 本文件只读配置并做形状校验，第1步不接线；数值与文案都在 JSON，这里不写默认值。
 */
import raw from '../../mod-kit/dual-model.json';
import { REASONING_EFFORT_LEVELS } from '@/modules/sceneModule/numbersRegistry';
import { IS_MODULE_DEV_BUILD, buildDefaultEnabled } from '@/utils/buildDefaults';

/** 玩家在 API 配置页可选的后端档位；'default'＝用 dualModel.backend.reasoningEffort。 */
export type BackendReasoningEffort = 'default' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface DualModelConfig {
  dualModel: {
    enabled: boolean;
    enabledDev: boolean;
    backend: {
      moduleId: string; inheritUsageType: string; defaultModel: string; reasoningEffort: string;
      summaryWindow: number; ledgerMemoryPerNpc: number; maxInputChars: number; continuityMaxItems: number;
      maxLagTurns: number; waitMs: number; timeoutMs: number; maxTokens: number; degradedAttempts: number; hourlyBudget: number;
      npcMemoryKeep: number; extensionKey: string; continuityHeading: string; instruction: string;
    };
    ui: {
      name: string; description: string; enabledLabel: string; reasoningLabel: string;
      defaultEffortLabel: string; unsupportedReasoning: string; inheritedModelWarning: string; paidConfirmation: string;
    };
    frontend: { writesNpcMemory: boolean; npcMemoryInstruction: string; summaryInstruction: string };
    billing: { allowedModels: string[]; blockUnlisted: boolean };
  };
  memory: { summaryMaxChars: number; moderatedPlaceholder: string };
}

export const DUAL_MODEL_CONFIG = raw as DualModelConfig;

const POSITIVE_INTS = ['summaryWindow', 'ledgerMemoryPerNpc', 'maxInputChars', 'continuityMaxItems', 'maxLagTurns', 'timeoutMs', 'maxTokens', 'hourlyBudget', 'npcMemoryKeep'] as const;
const NON_NEGATIVE_INTS = ['waitMs', 'degradedAttempts'] as const;

/** 形状校验：返回问题列表，空＝通过。reasoningEffort 取值与 numbersRegistry 的 mainNarrative.effort 同表。 */
export function validateDualModelConfig(cfg: unknown = DUAL_MODEL_CONFIG): string[] {
  const c = cfg as Partial<DualModelConfig> | undefined;
  const dm = c?.dualModel; const backend = dm?.backend as Record<string, unknown> | undefined;
  const problems: string[] = [];
  const text = (v: unknown) => typeof v === 'string' && v.trim() !== '';
  const int = (v: unknown, min: number) => Number.isInteger(v) && (v as number) >= min;
  if (typeof dm?.enabled !== 'boolean') problems.push('dualModel.enabled 须为布尔');
  if (typeof dm?.enabledDev !== 'boolean') problems.push('dualModel.enabledDev 须为布尔');
  if (!backend || typeof backend !== 'object') return [...problems, 'dualModel.backend 段缺失'];
  for (const key of ['moduleId', 'inheritUsageType', 'defaultModel', 'extensionKey', 'continuityHeading', 'instruction'] as const) if (!text(backend[key])) problems.push(`dualModel.backend.${key} 不能为空`);
  if (!REASONING_EFFORT_LEVELS.includes(backend.reasoningEffort as string)) problems.push(`dualModel.backend.reasoningEffort 须为 ${REASONING_EFFORT_LEVELS.join('/')} 之一`);
  for (const key of POSITIVE_INTS) if (!int(backend[key], 1)) problems.push(`dualModel.backend.${key} 须为正整数`);
  for (const key of NON_NEGATIVE_INTS) if (!int(backend[key], 0)) problems.push(`dualModel.backend.${key} 须为非负整数`);
  for (const key of ['name', 'description', 'enabledLabel', 'reasoningLabel', 'defaultEffortLabel', 'unsupportedReasoning', 'inheritedModelWarning', 'paidConfirmation'] as const) {
    if (!text(dm?.ui?.[key])) problems.push(`dualModel.ui.${key} 不能为空`);
  }
  for (const [key, placeholder] of [['defaultEffortLabel', '{effort}'], ['inheritedModelWarning', '{model}'], ['paidConfirmation', '{hourlyBudget}']] as const) {
    if (typeof dm?.ui?.[key] !== 'string' || !dm.ui[key].includes(placeholder)) problems.push(`dualModel.ui.${key} 须包含 ${placeholder}`);
  }
  if (typeof dm?.frontend?.writesNpcMemory !== 'boolean') problems.push('dualModel.frontend.writesNpcMemory 须为布尔');
  for (const key of ['npcMemoryInstruction', 'summaryInstruction'] as const) if (!text(dm?.frontend?.[key])) problems.push(`dualModel.frontend.${key} 不能为空`);
  if (typeof dm?.frontend?.summaryInstruction !== 'string' || !dm.frontend.summaryInstruction.includes('{summaryMaxChars}')) problems.push('dualModel.frontend.summaryInstruction 须包含 {summaryMaxChars}');
  const allowed = dm?.billing?.allowedModels;
  if (!Array.isArray(allowed) || allowed.some(p => !text(p))) problems.push('dualModel.billing.allowedModels 须为非空字符串数组');
  else for (const pattern of allowed) {
    try { new RegExp(pattern, 'i'); }
    // lcq-allow: 配置错误由本校验汇总报告。
    catch { problems.push(`dualModel.billing.allowedModels 含无效正则：${pattern}`); }
  }
  if (typeof dm?.billing?.blockUnlisted !== 'boolean') problems.push('dualModel.billing.blockUnlisted 须为布尔');
  if (!int(c?.memory?.summaryMaxChars, 1)) problems.push('memory.summaryMaxChars 须为正整数');
  if (!text(c?.memory?.moderatedPlaceholder)) problems.push('memory.moderatedPlaceholder 不能为空');
  return problems;
}

/** API 配置页后端档位下拉的取值：'default' 加上除 off 以外的推理档（off 不给玩家选，关后端用开关）。 */
export const BACKEND_REASONING_EFFORTS: readonly BackendReasoningEffort[] = [
  'default', ...REASONING_EFFORT_LEVELS.filter(level => level !== 'off'),
] as BackendReasoningEffort[];

export const isBackendReasoningEffort = (value: unknown): value is BackendReasoningEffort =>
  typeof value === 'string' && (BACKEND_REASONING_EFFORTS as readonly string[]).includes(value);

/** 模型名是否命中 billing.allowedModels（正则，大小写不敏感）；空名不算命中，无效正则跳过（由校验报告）。 */
export function isModelAllowed(model: string, config: DualModelConfig = DUAL_MODEL_CONFIG): boolean {
  const name = String(model || '').trim();
  if (!name) return false;
  return config.dualModel.billing.allowedModels.some(pattern => {
    try { return new RegExp(pattern, 'i').test(name); }
    // lcq-allow: 无效正则由 validateDualModelConfig 报告，这里按不命中处理。
    catch { return false; }
  });
}

/**
 * 按量付费确认（N1-B，22:18 起白名单只约束开发／测试默认值）：
 * 开发／测试构建不弹确认（白名单约束的是默认值，由 isModelAllowed 判断）；
 * 正式版不拦，只在模型名单外且该连接＋模型未确认过时返回 true。
 */
export function needsPaidConfirm(model: string, isDevBuild: boolean, confirmed: boolean, config: DualModelConfig = DUAL_MODEL_CONFIG): boolean {
  if (isDevBuild || confirmed) return false;
  return !isModelAllowed(model, config);
}

/** 总闸：正式版读 dualModel.enabled，内测版读 dualModel.enabledDev（buildDefaults.ts）。所有判总闸处走这里。 */
export function dualModelMasterEnabled(config: DualModelConfig = DUAL_MODEL_CONFIG, devBuild: boolean = IS_MODULE_DEV_BUILD): boolean {
  return buildDefaultEnabled(config.dualModel, devBuild);
}

/** 后端是否开启（N3-A）：总闸（dualModelMasterEnabled）与玩家开关 moduleEnabled.consistency 任一关即关。 */
export function consistencyEnabled(moduleSwitch: boolean, config: DualModelConfig = DUAL_MODEL_CONFIG, devBuild: boolean = IS_MODULE_DEV_BUILD): boolean {
  return dualModelMasterEnabled(config, devBuild) && moduleSwitch === true;
}
