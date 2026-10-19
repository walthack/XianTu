// 场面战斗拍数门禁（numbers-combat.json combat.beatLimit.max）：默认 0＝不设上限（用户定 2026-10-19：战斗拍数默认不限，
// 只有合同显式声明为限时战 clock.beats + onTimeout 才在时限到时按合同判赢或输）。
// max 设为正整数时作诊断：还没分出胜负、已打完的拍数超过 max 就记 LCQ-SAV-020；只记录、不改判。
import { logEvent } from '../diagnostics/log';
import { GAME_NUMBERS, registerNumbersValidator } from './numbers';
import type { Contract, SceneState } from './types';

export interface BeatLimitConfig { max: number }
export const beatLimitConfig = (): BeatLimitConfig => (GAME_NUMBERS.combat as unknown as { beatLimit: BeatLimitConfig }).beatLimit;

export function validateBeatLimit(cfg: BeatLimitConfig | undefined = beatLimitConfig()): string[] {
  return Number.isInteger(cfg?.max) && cfg!.max >= 0 ? [] : ['combat.beatLimit.max 须为 ≥0 的整数（0＝不限）'];
}
registerNumbersValidator(() => validateBeatLimit());

/** 已打完的拍数（state.beat 是下一拍的序号）。 */
export const beatsPlayed = (state: SceneState): number => Math.max(0, state.beat - 1);

/** 交战中且已打完的拍数超过上限：记错误码（每多打一拍记一次），返回是否超限。 */
export function checkBeatLimit(contract: Contract, state: SceneState, cfg: BeatLimitConfig = beatLimitConfig()): boolean {
  const played = beatsPlayed(state);
  if (cfg.max <= 0 || state.status !== 'engaged' || played <= cfg.max) return false;
  logEvent({
    code: 'LCQ-SAV-020', module: 'sceneModule',
    detail: { contractId: contract.meta.id, beat: played, max: cfg.max, tracks: state.tracks, statuses: Object.fromEntries(Object.entries(state.statuses).map(([party, list]) => [party, list.map(s => s.id)])) },
  });
  return true;
}
