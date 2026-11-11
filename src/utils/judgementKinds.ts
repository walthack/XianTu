/**
 * 判定类别（B8 从 judgementEngine.ts 原样拆出，judgementEngine 原名转导出）。
 * 纯模块：不 import 任何会读 catalog 的模块——内容包编译器校验 openWorldSlices.actionJudgement 时要在 catalog.json 不存在时读它（M2）。
 */
export type JudgementKind =
  | 'combat'
  | 'cultivate'
  | 'craft'
  | 'explore'
  | 'social'
  | 'escape'
  | 'stealth'
  | 'scheme';

/** 现有判定类别全集（模型报风险只能从这里选，不新增类别）。 */
export const JUDGEMENT_KINDS: readonly JudgementKind[] = ['combat', 'escape', 'stealth', 'craft', 'cultivate', 'social', 'scheme', 'explore'];
