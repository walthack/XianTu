// 场面战斗拍数门禁：还没分出胜负、已打完的拍数超过配置上限（numbers-combat.json combat.beatLimit.max）就记 LCQ-SAV-020。
// 只记录、不改判：到上限之后怎么判尚待拍板。
import { logEvent } from '../diagnostics/log';
import { GAME_NUMBERS, registerNumbersValidator } from './numbers';
import type { Contract, SceneState } from './types';

export interface BeatLimitConfig { max: number }
export const beatLimitConfig = (): BeatLimitConfig => (GAME_NUMBERS.combat as unknown as { beatLimit: BeatLimitConfig }).beatLimit;

export function validateBeatLimit(cfg: BeatLimitConfig | undefined = beatLimitConfig()): string[] {
  return Number.isInteger(cfg?.max) && cfg!.max >= 1 ? [] : ['combat.beatLimit.max 须为正整数'];
}
registerNumbersValidator(() => validateBeatLimit());

/** 已打完的拍数（state.beat 是下一拍的序号）。 */
export const beatsPlayed = (state: SceneState): number => Math.max(0, state.beat - 1);

/** 交战中且已打完的拍数超过上限：记错误码（每多打一拍记一次），返回是否超限。 */
export function checkBeatLimit(contract: Contract, state: SceneState, cfg: BeatLimitConfig = beatLimitConfig()): boolean {
  const played = beatsPlayed(state);
  if (state.status !== 'engaged' || played <= cfg.max) return false;
  logEvent({
    code: 'LCQ-SAV-020', module: 'sceneModule',
    detail: { contractId: contract.meta.id, beat: played, max: cfg.max, tracks: state.tracks, statuses: Object.fromEntries(Object.entries(state.statuses).map(([party, list]) => [party, list.map(s => s.id)])) },
  });
  return true;
}
