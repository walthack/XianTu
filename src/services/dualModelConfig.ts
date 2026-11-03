/**
 * 双模型分工配置（mod-kit/dual-model.json；设计稿 2026-11-03-双模型分工 ⑤⑧，用户 22:26 定稿）。
 * 本文件只读配置并做形状校验，第1步不接线；数值与文案都在 JSON，这里不写默认值。
 */
import raw from '../../mod-kit/dual-model.json';
import { REASONING_EFFORT_LEVELS } from '@/modules/sceneModule/numbersRegistry';

/** 玩家在 API 配置页可选的后端档位；'default'＝用 dualModel.backend.reasoningEffort。 */
export type BackendReasoningEffort = 'default' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface DualModelConfig {
  dualModel: {
    enabled: boolean;
    backend: {
      moduleId: string; inheritUsageType: string; defaultModel: string; reasoningEffort: string;
      summaryWindow: number; ledgerMemoryPerNpc: number; maxInputChars: number; continuityMaxItems: number;
      maxLagTurns: number; waitMs: number; timeoutMs: number; degradedAttempts: number; hourlyBudget: number;
    };
    frontend: { writesNpcMemory: boolean };
    billing: { allowedModels: string[]; blockUnlisted: boolean };
  };
  memory: { summaryMaxChars: number; moderatedPlaceholder: string };
}

export const DUAL_MODEL_CONFIG = raw as DualModelConfig;

const POSITIVE_INTS = ['summaryWindow', 'ledgerMemoryPerNpc', 'maxInputChars', 'continuityMaxItems', 'maxLagTurns', 'timeoutMs', 'hourlyBudget'] as const;
const NON_NEGATIVE_INTS = ['waitMs', 'degradedAttempts'] as const;

/** 形状校验：返回问题列表，空＝通过。reasoningEffort 取值与 numbersRegistry 的 mainNarrative.effort 同表。 */
export function validateDualModelConfig(cfg: unknown = DUAL_MODEL_CONFIG): string[] {
  const c = cfg as Partial<DualModelConfig> | undefined;
  const dm = c?.dualModel; const backend = dm?.backend as Record<string, unknown> | undefined;
  const problems: string[] = [];
  const text = (v: unknown) => typeof v === 'string' && v.trim() !== '';
  const int = (v: unknown, min: number) => Number.isInteger(v) && (v as number) >= min;
  if (typeof dm?.enabled !== 'boolean') problems.push('dualModel.enabled 须为布尔');
  if (!backend || typeof backend !== 'object') return [...problems, 'dualModel.backend 段缺失'];
  for (const key of ['moduleId', 'inheritUsageType', 'defaultModel'] as const) if (!text(backend[key])) problems.push(`dualModel.backend.${key} 不能为空`);
  if (!REASONING_EFFORT_LEVELS.includes(backend.reasoningEffort as string)) problems.push(`dualModel.backend.reasoningEffort 须为 ${REASONING_EFFORT_LEVELS.join('/')} 之一`);
  for (const key of POSITIVE_INTS) if (!int(backend[key], 1)) problems.push(`dualModel.backend.${key} 须为正整数`);
  for (const key of NON_NEGATIVE_INTS) if (!int(backend[key], 0)) problems.push(`dualModel.backend.${key} 须为非负整数`);
  if (typeof dm?.frontend?.writesNpcMemory !== 'boolean') problems.push('dualModel.frontend.writesNpcMemory 须为布尔');
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
