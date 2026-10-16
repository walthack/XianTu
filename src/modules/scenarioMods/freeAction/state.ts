/**
 * 自由行动在存档里的账：runtime.freeAction。全部有上限，不随游玩长度增长。
 * - log：最近结算摘要（只给人看/审计，不进提示词）；settled：幂等键 → 当时的事实行（重试/读档同键不再写）；
 * - focus：本回合被作用的人（让角色卡把他们排到前面）；
 * - affinityTurn：每个人上次被自由行动改好感的回合（同一人同一回合只改一次）；
 * - transferBudget / cooldowns：传功的阶段预算与冷却。
 */
import type { SaveData } from '@/types/game';
import { freeActionConfig } from './config';

export interface FreeActionLogRow {
  key: string; turn: number; actionClass: string; variant: string; targetId: string;
  resultKey?: string; delta?: number; major?: boolean;
}
export interface FreeActionState {
  log: FreeActionLogRow[];
  settled: Record<string, { facts: string[]; resultKey?: string }>;
  focus?: { turn: number; targetIds: string[] };
  affinityTurn: Record<string, number>;
  transferBudget: Record<string, { phase: string; used: number }>;
  cooldowns: Record<string, number>;
}

export const runtimeOf = (save: unknown): any => (save as any)?.世界?.状态?.剧本模组;

/** 只读视图：存档里没有就返回空账，不创建字段。 */
export function readFreeActionState(save: SaveData): FreeActionState {
  const raw = runtimeOf(save)?.freeAction;
  return {
    log: Array.isArray(raw?.log) ? raw.log : [],
    settled: raw?.settled && typeof raw.settled === 'object' ? raw.settled : {},
    ...(raw?.focus ? { focus: raw.focus } : {}),
    affinityTurn: raw?.affinityTurn && typeof raw.affinityTurn === 'object' ? raw.affinityTurn : {},
    transferBudget: raw?.transferBudget && typeof raw.transferBudget === 'object' ? raw.transferBudget : {},
    cooldowns: raw?.cooldowns && typeof raw.cooldowns === 'object' ? raw.cooldowns : {},
  };
}

/** 写入用：补齐字段并按上限修剪（最早的先丢）。 */
export function writableFreeActionState(save: SaveData): FreeActionState {
  const runtime = runtimeOf(save);
  const state = runtime.freeAction = { ...readFreeActionState(save) };
  const cfg = freeActionConfig().state;
  if (state.log.length > cfg.logKeep) state.log = state.log.slice(-cfg.logKeep);
  const trim = <T>(record: Record<string, T>, keep: number): Record<string, T> => {
    const keys = Object.keys(record);
    return keys.length <= keep ? record : Object.fromEntries(keys.slice(-keep).map(key => [key, record[key]]));
  };
  state.settled = trim(state.settled, cfg.settledKeep);
  state.affinityTurn = trim(state.affinityTurn, cfg.budgetKeep);
  state.cooldowns = trim(state.cooldowns, cfg.budgetKeep);
  return state;
}

export function noteSettled(state: FreeActionState, key: string, entry: { facts: string[]; resultKey?: string }): void {
  delete state.settled[key];
  state.settled[key] = entry;
  const cfg = freeActionConfig().state;
  const keys = Object.keys(state.settled);
  for (const old of keys.slice(0, Math.max(0, keys.length - cfg.settledKeep))) delete state.settled[old];
}
