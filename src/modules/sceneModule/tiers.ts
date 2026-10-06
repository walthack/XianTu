import {GAME_NUMBERS} from './numbers';
// 四档判定：d20 ＋ 加值 对 难度，按差值分 大成功 / 成功 / 失败 / 大失败（参考 D&D）。
// 自然 20＝大成功；自然 1 默认降一档；优势 / 劣势并存互相抵消；多目标时按主目标定档（由调用方选目标）。

import type { SceneSettings, TierId } from './types';

export interface ResolvedSettings {
  tiers: {
    critSuccessMargin: number;
    critFailMargin: number;
    nat20: { grounded: 'crit' | 'success' | 'none'; ungrounded: 'crit' | 'success' | 'none' };
    nat1: 'stepDown' | 'fumble' | 'off';
    critBonus: Array<'noExposure' | 'tagPlus1' | 'credit' | 'flourish'>;
    failure: { edge: number; spendOneShot: boolean };
  };
  pricing: { premium: Record<string, number>; leverCap: number; leverMax: number; novelty: number; tagCash: number };
  attentionCap: Record<string, { primaryTargets: number; rangeClaim?: boolean }>;
  allowPlayerHarmAllies: boolean;
  enemyPhase: { maxRollsPerBeat: number };
  brief: { maxChars: number; digestKeep: number };
}

/** 模块默认值（只有定价、封顶这类通用调参；没有任何胜负、拍数、人头数门槛）。 */
export const DEFAULT_SETTINGS = GAME_NUMBERS.sceneDefaults as ResolvedSettings;

function merge<T>(base: T, over: unknown): T {
  if (over === undefined || over === null) return base;
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(over as Record<string, unknown>)) {
    out[key] = key in out ? merge(out[key], value) : value;
  }
  return out as T;
}

export function resolveSettings(settings?: SceneSettings): ResolvedSettings {
  return merge(GAME_NUMBERS.sceneDefaults as ResolvedSettings, settings);
}

const ORDER: TierId[] = ['critical_failure', 'failure', 'success', 'great_success'];
export const tierRank = (tier: TierId): number => ORDER.indexOf(tier);

export function stepDownTier(tier: TierId): TierId {
  return ORDER[Math.max(0, tierRank(tier) - 1)];
}

export function baseTierFor(margin: number, s: ResolvedSettings): TierId {
  if (margin >= s.tiers.critSuccessMargin) return 'great_success';
  if (margin >= 0) return 'success';
  if (margin >= -s.tiers.critFailMargin) return 'failure';
  return 'critical_failure';
}

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export function rollMode(hasAdvantage: boolean, hasDisadvantage: boolean): RollMode {
  if (hasAdvantage && hasDisadvantage) return 'normal'; // D&D：并存抵消，不论各有几个来源
  return hasAdvantage ? 'advantage' : hasDisadvantage ? 'disadvantage' : 'normal';
}

export function pickFace(faces: [number, number], mode: RollMode): number {
  if (mode === 'advantage') return Math.max(faces[0], faces[1]);
  if (mode === 'disadvantage') return Math.min(faces[0], faces[1]);
  return faces[0];
}

export interface CheckInput {
  face: number;
  modifier: number;
  difficulty: number;
  /** 有没有至少一个落地杠杆（只用于自然 20 的“有依据 / 无依据”开关）。 */
  grounded: boolean;
}

export interface CheckResult {
  face: number;
  total: number;
  margin: number;
  baseTier: TierId;
  tier: TierId;
  natTriggered: 'nat20' | 'nat1' | null;
}

export function resolveCheck(input: CheckInput, s: ResolvedSettings): CheckResult {
  const total = input.face + input.modifier;
  const margin = total - input.difficulty;
  const baseTier = baseTierFor(margin, s);
  let tier = baseTier;
  if (input.face === 20) {
    const rule = input.grounded ? s.tiers.nat20.grounded : s.tiers.nat20.ungrounded;
    if (rule === 'crit') tier = 'great_success';
    else if (rule === 'success') tier = tierRank(baseTier) >= tierRank('success') ? baseTier : 'success';
  } else if (input.face === 1) {
    if (s.tiers.nat1 === 'stepDown') tier = stepDownTier(baseTier);
    else if (s.tiers.nat1 === 'fumble') tier = 'critical_failure';
  }
  const natTriggered = tier !== baseTier ? (input.face === 20 ? 'nat20' : 'nat1') : null;
  return { face: input.face, total, margin, baseTier, tier, natTriggered };
}

/** 精确赔率（百分比，四档之和为 100）：枚举 d20（优势 / 劣势枚举两颗）。 */
export function oddsFor(input: Omit<CheckInput, 'face'> & { mode: RollMode }, s: ResolvedSettings): Record<TierId, number> {
  const counts: Record<TierId, number> = { great_success: 0, success: 0, failure: 0, critical_failure: 0 };
  let n = 0;
  for (let a = 1; a <= 20; a++) {
    for (let b = 1; b <= (input.mode === 'normal' ? 1 : 20); b++) {
      const face = pickFace([a, b], input.mode);
      counts[resolveCheck({ ...input, face }, s).tier] += 1;
      n += 1;
    }
  }
  return {
    great_success: (counts.great_success / n) * 100,
    success: (counts.success / n) * 100,
    failure: (counts.failure / n) * 100,
    critical_failure: (counts.critical_failure / n) * 100,
  };
}
