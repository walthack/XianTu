/**
 * 判定引擎的数值读取：骰子、结果档线、重伤、环境修正、幸运点、预检难度都在 game-numbers.qingyu.json 的 judgement 段，代码不写字面量。
 * 内置默认 = 打包进来的这份 JSON；热改（tuning.json 的 numbers 段）经 applyGameNumbers 合并后，这里的体检不过会整份退回。
 * 一律调用时再读，不要在模块顶层缓存数值，否则热改不生效。
 */
import { GAME_NUMBERS, registerNumbersValidator, resolveNumberRef } from '../modules/sceneModule/numbers';
import type { JudgementDifficultyBand, JudgementKind } from './judgementEngine';

export interface DifficultySpec { band: JudgementDifficultyBand; value: number | string }
export interface JudgementNumbers {
  dice: { sides: number; rerollOnOneChance: number };
  /** 总值 ≥ 难度 + 该值 即达到该档；success 线相对难度为 0。 */
  outcomeLines: { perfect: number; greatSuccess: number; success: number; partial: number; failure: number };
  /** 2026-10-20：「气血低于阈值加重伤」已去掉，这里只剩正文补账两项。 */
  injury: {
    /** 正文写了受伤但没写扣血时的自动补账（narratedDamage.ts）：判定差 ≤ majorMargin 算重伤扣 majorRatio，否则按正文轻重扣 severe / moderate / light 的比例（占气血上限）。 */
    narrated: { majorMargin: number; majorRatio: number; severeRatio: number; moderateRatio: number; lightRatio: number };
    /** 气血被扣到 0 而正文没写死亡时，保底恢复到上限的这个比例（至少 1 点）。 */
    zeroHealthRecoveryRatio: number;
  };
  /** 修正 = round((灵气浓度 − neutralSpiritDensity) / divisor)；浓度缺失（或 0）取 defaultSpiritDensity。 */
  environment: { defaultSpiritDensity: number; neutralSpiritDensity: number; divisor: { cultivate: number; craft: number; combat: number } };
  /** 幸运点：随机底 = floor(random × randomSpan) + randomOffset；气运缺失（或 0）取 defaultInnate。 */
  luck: { defaultInnate: number; randomSpan: number; randomOffset: number; lowerBonusRatio: number };
  preflight: { talentBonus: number; difficulty: { default: DifficultySpec; byKind: Partial<Record<JudgementKind, DifficultySpec>> } };
  recentKeep: number;
  cultivationRecovery: Record<'partial' | 'success' | 'great_success' | 'perfect', number>;
}

export const judgementNumbers = (): JudgementNumbers => GAME_NUMBERS.judgement as unknown as JudgementNumbers;

const BANDS: readonly string[] = ['easy', 'normal', 'hard', 'severe', 'extreme'];

/** 配置体检：返回错误列表（空 = 通过）。 */
export function validateJudgementNumbers(cfg: JudgementNumbers = judgementNumbers()): string[] {
  const errors: string[] = [], finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!cfg || typeof cfg !== 'object') return ['judgement 段缺失'];
  const { dice, outcomeLines: lines, injury, environment: env, luck, preflight, cultivationRecovery } = cfg;
  if (!(Number.isInteger(dice?.sides) && dice.sides >= 2)) errors.push('judgement.dice.sides 须为不小于 2 的整数');
  if (!(finite(dice?.rerollOnOneChance) && dice.rerollOnOneChance >= 0 && dice.rerollOnOneChance <= 1)) errors.push('judgement.dice.rerollOnOneChance 须在 [0,1]');
  const order = [lines?.perfect, lines?.greatSuccess, lines?.success, lines?.partial, lines?.failure];
  if (!order.every(finite) || order.some((v, i) => i > 0 && !(order[i - 1]! > v!))) errors.push('judgement.outcomeLines 须为数，且 perfect > greatSuccess > success > partial > failure');
  if (injury && ('hpRatioBelow' in injury || 'penalty' in injury)) errors.push('judgement.injury 不再接受 hpRatioBelow / penalty（气血低于阈值加重伤已去掉，重伤只跟伤势状态走）');
  const narrated = injury?.narrated;
  if (!finite(narrated?.majorMargin) || !(['majorRatio', 'severeRatio', 'moderateRatio', 'lightRatio'] as const).every(key => finite(narrated[key]) && narrated[key] > 0 && narrated[key] < 1)) errors.push('judgement.injury.narrated 须有数值 majorMargin 和 (0,1) 的各档比例');
  if (!(finite(injury?.zeroHealthRecoveryRatio) && injury.zeroHealthRecoveryRatio > 0 && injury.zeroHealthRecoveryRatio <= 1)) errors.push('judgement.injury.zeroHealthRecoveryRatio 须在 (0,1]');
  if (!finite(env?.defaultSpiritDensity) || !finite(env?.neutralSpiritDensity)) errors.push('judgement.environment 的默认 / 基准灵气浓度须为数');
  for (const key of ['cultivate', 'craft', 'combat'] as const) if (!(finite(env?.divisor?.[key]) && env.divisor[key] > 0)) errors.push(`judgement.environment.divisor.${key} 须为正数`);
  if (!finite(luck?.defaultInnate) || !finite(luck?.randomOffset) || !(finite(luck?.randomSpan) && luck.randomSpan > 0) || !(finite(luck?.lowerBonusRatio) && luck.lowerBonusRatio >= 0)) errors.push('judgement.luck 配置无效');
  if (!finite(preflight?.talentBonus)) errors.push('judgement.preflight.talentBonus 须为数');
  const specs: Array<[string, DifficultySpec | undefined]> = [['default', preflight?.difficulty?.default], ...Object.entries(preflight?.difficulty?.byKind || {})];
  const kinds = Object.keys(GAME_NUMBERS.weights);
  for (const [name, spec] of specs) {
    if (!spec || !BANDS.includes(spec.band) || !Number.isFinite(resolveNumberRef(spec.value))) errors.push(`judgement.preflight.difficulty.${name} 须有有效的 band 与数值（或数值键引用）`);
    if (name !== 'default' && !kinds.includes(name)) errors.push(`judgement.preflight.difficulty.byKind 的 ${name} 不是判定类型`);
  }
  if (!(Number.isInteger(cfg.recentKeep) && cfg.recentKeep > 0)) errors.push('judgement.recentKeep 须为正整数');
  for (const outcome of ['partial', 'success', 'great_success', 'perfect'] as const) if (!(finite(cultivationRecovery?.[outcome]) && cultivationRecovery[outcome] >= 0)) errors.push(`judgement.cultivationRecovery.${outcome} 须为非负数`);
  return errors;
}

registerNumbersValidator(() => validateJudgementNumbers());
