/** 回合/模型耗时监控的数值：数值在 game-numbers.qingyu.json 的 perf 段，代码里不写数字；这里只读取与登记体检。调用时再读，热改才生效。 */
import { GAME_NUMBERS, registerNumbersValidator } from '../sceneModule/numbers';

export interface PerfConfig {
  /** 内存里保留最近多少个回合的耗时样本（环形）。 */
  sampleWindow: number;
  /** 样本数少于此值时 p50/p95 不给（null），避免几个样本就当趋势。 */
  minSamplesForPercentile: number;
  /** 回合总耗时超过它记 LCQ-NET-010。 */
  turnWarnMs: number;
  /** 模型调用耗时超过它记 LCQ-NET-011。 */
  modelWarnMs: number;
}

export const perfConfig = (): PerfConfig => (GAME_NUMBERS as { perf: PerfConfig }).perf;

export function validatePerfConfig(cfg: PerfConfig | undefined = (GAME_NUMBERS as { perf?: PerfConfig }).perf): string[] {
  if (!cfg || typeof cfg !== 'object') return ['perf 段缺失'];
  const problems: string[] = [], pos = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
  for (const key of ['sampleWindow', 'minSamplesForPercentile', 'turnWarnMs', 'modelWarnMs'] as const) if (!pos(cfg[key])) problems.push(`perf.${key} 须为正整数`);
  if (pos(cfg.sampleWindow) && pos(cfg.minSamplesForPercentile) && cfg.minSamplesForPercentile > cfg.sampleWindow) problems.push('perf.minSamplesForPercentile 不能大于 perf.sampleWindow');
  if (pos(cfg.turnWarnMs) && pos(cfg.modelWarnMs) && cfg.modelWarnMs > cfg.turnWarnMs) problems.push('perf.modelWarnMs 不应大于 perf.turnWarnMs（模型耗时是回合耗时的一部分）');
  return problems;
}
registerNumbersValidator(() => validatePerfConfig());
