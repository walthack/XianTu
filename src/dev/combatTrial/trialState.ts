// 战斗试玩的存档扩展：模式、骰流、战斗进度、战前快照。每掷一次骰都整体写回存档，刷新不会重掷。
import type { SaveData } from '@/types/game';
import type { BattleMode, BattleState, Tier } from './engine';

export const COMBAT_TRIAL_EXTENSION_KEY = '战斗试玩';
export const COMBAT_TRIAL_FLAG_RESULT = 'trial.combat.result';
export const COMBAT_TRIAL_FLAG_MODE = 'trial.combat.mode';
export const COMBAT_TRIAL_PREPARATION = 'combat_engaged';
/** 战斗进行中给 body 加的类：隐藏主线按钮和输入框（样式在 CombatEncounterCard.vue 的全局块里）。 */
export const COMBAT_TRIAL_FIGHTING_CLASS = 'combat-trial-fighting';

export type TrialResult = 'win' | 'lose' | 'rout';

export interface CombatTrialState {
  version: 1;
  mode: BattleMode;
  /** idle＝尚未遇敌；engaged＝战斗卡片进行中；resolved＝已分出档位并已落账。 */
  status: 'idle' | 'engaged' | 'resolved';
  seed: number | null;
  forced: number[];
  /** 本场战斗已经消耗的骰数（指定/种子骰刷新后据此续用）。 */
  diceUsed: number;
  battle: BattleState | null;
  /** 战斗实录写在 narrativeHistory 的哪一条上（同一条原地追加）。 */
  narrativeIndex: number | null;
  tier: Tier | null;
  /** 战前快照：遇敌文字落账之后、第一骰之前的整档（不含本扩展）。 */
  snapshot: SaveData | null;
  /** 已完整打过几场（含重打），仅用于界面提示。 */
  rematches: number;
}

export function initialTrialState(mode: BattleMode, seed: number | null, forced: number[]): CombatTrialState {
  return { version: 1, mode, status: 'idle', seed, forced, diceUsed: 0, battle: null, narrativeIndex: null, tier: null, snapshot: null, rematches: 0 };
}

export function readTrialState(save: SaveData | null | undefined): CombatTrialState | null {
  const state = (save as any)?.系统?.扩展?.[COMBAT_TRIAL_EXTENSION_KEY] as CombatTrialState | undefined;
  return state && state.version === 1 ? state : null;
}

export function writeTrialState(save: SaveData, state: CombatTrialState): void {
  (save as any).系统.扩展[COMBAT_TRIAL_EXTENSION_KEY] = state;
}

export function trialRuntime(save: SaveData | null | undefined): any {
  return (save as any)?.世界?.状态?.剧本模组;
}

/** 玩家点过「迎向雾里」并且还没有战斗结果：战斗卡片应当出现。 */
export function isCombatEngaged(save: SaveData | null | undefined, eventId: string): boolean {
  const runtime = trialRuntime(save);
  if (!runtime || !readTrialState(save)) return false;
  const prepared: string[] = runtime.eventActionStates?.[eventId]?.preparations || [];
  return prepared.includes(COMBAT_TRIAL_PREPARATION) && !runtime.flags?.[COMBAT_TRIAL_FLAG_RESULT];
}
