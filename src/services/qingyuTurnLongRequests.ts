import { usesFixedScenarioInventory } from '@/modules/scenarioMods/fixedInventoryContracts';
import type { SaveData } from '@/types/game';

export const QINGYU_TURN_LONG_REQUEST_LIMIT = 2;
/** 整个叙事阶段共享截止，含补救与门禁重写；不是30秒性能验收结论。 */
export const QINGYU_TURN_DEADLINE_MS = 60000;

interface QingyuTurnBudget {
  remaining: number | null;
  expiresAt: number | null;
  depth: number;
  invalidated: boolean;
}

const turns = new Map<string, QingyuTurnBudget>();
let activeTurnId: string | null = null;

export function createQingyuTurnId(): string {
  return `qingyu_turn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function peekActiveQingyuTurnId(): string | null {
  return activeTurnId;
}

function getTurn(turnId?: string | null): QingyuTurnBudget | undefined {
  const id = turnId || activeTurnId;
  return id ? turns.get(id) : undefined;
}

export function beginQingyuTurnLongRequests(save: SaveData | null | undefined, turnId?: string): string {
  if (turnId) {
    const existing = turns.get(turnId);
    if (existing) {
      existing.depth += 1;
      if (!existing.invalidated) activeTurnId = turnId;
      return turnId;
    }
  }
  if (!turnId && activeTurnId) {
    const current = turns.get(activeTurnId);
    if (current && !current.invalidated) {
      current.depth += 1;
      return activeTurnId;
    }
  }
  const id = createQingyuTurnId();
  turns.set(id, {
    remaining: save && usesFixedScenarioInventory(save) ? QINGYU_TURN_LONG_REQUEST_LIMIT : null,
    expiresAt: save && usesFixedScenarioInventory(save) ? Date.now() + QINGYU_TURN_DEADLINE_MS : null,
    depth: 1,
    invalidated: false,
  });
  activeTurnId = id;
  return id;
}

export function endQingyuTurnLongRequests(turnId?: string): void {
  const id = turnId || activeTurnId;
  if (!id) return;
  const turn = turns.get(id);
  if (!turn) return;
  turn.depth = Math.max(0, turn.depth - 1);
  if (turn.depth === 0) {
    turns.delete(id);
    if (activeTurnId === id) activeTurnId = null;
  }
}

/** 只释放指定回合。省略 id 时只释放当前 active，不得误清另一回合。 */
export function releaseQingyuTurnLongRequests(turnId?: string): void {
  const id = turnId || activeTurnId;
  if (!id) return;
  if (!turns.has(id)) return;
  turns.delete(id);
  if (activeTurnId === id) activeTurnId = null;
}

export function invalidateQingyuTurnLongRequests(turnId?: string): void {
  if (turnId) {
    const turn = turns.get(turnId);
    if (turn) turn.invalidated = true;
    if (activeTurnId === turnId) activeTurnId = null;
    return;
  }
  for (const turn of turns.values()) turn.invalidated = true;
  activeTurnId = null;
}

export function remainingQingyuTurnLongRequests(turnId?: string): number | null {
  const turn = getTurn(turnId);
  if (!turn) return null;
  if (turn.invalidated) return 0;
  return turn.remaining;
}

export function isLongNarrativeRequest(options?: { usageType?: string; maxTokens?: number }): boolean {
  if ((options?.usageType || 'main') !== 'main') return false;
  if (typeof options?.maxTokens === 'number' && options.maxTokens <= 1024) return false;
  return true;
}

/** false = 本回合长请求预算已用尽，调用方不得再发长请求。 */
export function consumeQingyuTurnLongRequest(
  options?: { usageType?: string; maxTokens?: number; qingyuTurnId?: string },
  turnId?: string,
): boolean {
  const id = turnId || options?.qingyuTurnId || activeTurnId;
  if (!id) return true;
  const turn = turns.get(id);
  if (!turn) return true;
  if (turn.invalidated) return false;
  if (turn.remaining === null) return true;
  if (options && !isLongNarrativeRequest(options)) return true;
  if (turn.remaining <= 0) return false;
  turn.remaining -= 1;
  return true;
}

export class QingyuTurnLongRequestBudgetError extends Error {
  readonly code = 'QINGYU_TURN_LONG_REQUEST_BUDGET';
  constructor() {
    super('本回合长请求预算已用尽');
    this.name = 'QingyuTurnLongRequestBudgetError';
  }
}

/** 所有嵌套生成消费同一墙钟预算；普通游戏返回null，保留既有行为。 */
export function remainingQingyuTurnTimeMs(turnId?: string): number | null {
  const turn = getTurn(turnId);
  if (!turn || turn.expiresAt === null) return null;
  if (turn.invalidated) return 0;
  return Math.max(0, turn.expiresAt - Date.now());
}
