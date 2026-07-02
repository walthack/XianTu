import { get, set } from 'lodash';

export type ActionGateOutcome = 'failure' | 'partial' | 'blocked';
export type ActionGateScope = 'scene' | 'npc' | 'location' | 'item' | 'quest' | 'combat' | 'social' | string;

export interface ActionGateEntry {
  actionLabel: string;
  outcome: ActionGateOutcome;
  scope: ActionGateScope;
  target?: string;
  reason: string;
  effect: string;
  createdAtTurn?: number;
  expiresAtTurn?: number;
  ttlTurns?: number;
}

export interface ActionGateState {
  version?: number;
  recent?: ActionGateEntry[];
}

const ACTION_GATE_PATH = '系统.扩展.行动门控';
const MAX_ACTIVE_GATES = 6;

function toFiniteNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function getNarrativeTurn(saveData: unknown): number {
  const root = saveData as any;
  const history = get(root, '系统.历史.叙事');
  if (Array.isArray(history)) return history.length;

  const shortTerm = get(root, '社交.记忆.短期记忆');
  if (Array.isArray(shortTerm)) return shortTerm.length;

  return 0;
}

export function normalizeActionGateEntry(raw: unknown): ActionGateEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;

  const actionLabel = typeof value.actionLabel === 'string'
    ? value.actionLabel.trim()
    : (typeof value.动作 === 'string' ? value.动作.trim() : '');
  const reason = typeof value.reason === 'string'
    ? value.reason.trim()
    : (typeof value.原因 === 'string' ? value.原因.trim() : '');
  const effect = typeof value.effect === 'string'
    ? value.effect.trim()
    : (typeof value.影响 === 'string' ? value.影响.trim() : '');
  const scope = typeof value.scope === 'string'
    ? value.scope.trim()
    : (typeof value.范围 === 'string' ? value.范围.trim() : 'scene');
  const outcomeRaw = typeof value.outcome === 'string'
    ? value.outcome.trim()
    : (typeof value.结果 === 'string' ? value.结果.trim() : 'failure');
  const outcome = ['failure', 'partial', 'blocked'].includes(outcomeRaw)
    ? outcomeRaw as ActionGateOutcome
    : 'failure';

  if (!actionLabel || !reason || !effect) return null;

  const target = typeof value.target === 'string'
    ? value.target.trim()
    : (typeof value.目标 === 'string' ? value.目标.trim() : undefined);
  const createdAtTurn = toFiniteNumber(value.createdAtTurn);
  const expiresAtTurn = toFiniteNumber(value.expiresAtTurn);
  const ttlTurns = toFiniteNumber(value.ttlTurns);

  return {
    actionLabel,
    outcome,
    scope: scope || 'scene',
    ...(target ? { target } : {}),
    reason,
    effect,
    ...(createdAtTurn !== null ? { createdAtTurn } : {}),
    ...(expiresAtTurn !== null ? { expiresAtTurn } : {}),
    ...(ttlTurns !== null ? { ttlTurns } : {}),
  };
}

export function getActiveActionGates(saveData: unknown, currentTurn = getNarrativeTurn(saveData)): ActionGateEntry[] {
  const recent = get(saveData as any, `${ACTION_GATE_PATH}.recent`);
  if (!Array.isArray(recent)) return [];

  return (recent as unknown[])
    .map(normalizeActionGateEntry)
    .filter((entry): entry is ActionGateEntry => {
      if (!entry) return false;
      if (typeof entry.expiresAtTurn === 'number' && currentTurn > entry.expiresAtTurn) return false;
      if (
        typeof entry.createdAtTurn === 'number' &&
        typeof entry.ttlTurns === 'number' &&
        currentTurn > entry.createdAtTurn + entry.ttlTurns
      ) {
        return false;
      }
      return true;
    })
    .slice(-MAX_ACTIVE_GATES);
}

export function pruneExpiredActionGates(saveData: unknown, currentTurn = getNarrativeTurn(saveData)): {
  before: ActionGateEntry[];
  after: ActionGateEntry[];
  changed: boolean;
} {
  const recent = get(saveData as any, `${ACTION_GATE_PATH}.recent`);
  const before = Array.isArray(recent)
    ? (recent as unknown[]).map(normalizeActionGateEntry).filter((entry): entry is ActionGateEntry => !!entry)
    : [];
  const after = getActiveActionGates(saveData, currentTurn);
  const changed = before.length !== after.length;

  if (changed) {
    set(saveData as object, ACTION_GATE_PATH, { version: 1, recent: after });
  }

  return { before, after, changed };
}

export function buildActionGatePrompt(saveData: unknown, currentTurn = getNarrativeTurn(saveData)): string {
  const active = getActiveActionGates(saveData, currentTurn);
  const lines = [
    '# 行动门控',
    `当前叙事回合:${currentTurn}`,
    '用途:记录最近失败/受阻动作造成的场景惯性,不是预设分支树。',
    '规则:玩家可重复尝试,但不能把重复尝试当作全新无后果判定;必须承接既有失败后果,通常提高难度、要求新筹码/新路线,或触发更坏后果。',
    '行动选项:不得原样推荐仍受门控影响的失败动作;应提供绕路、缓和、准备、撤退、换目标等替代路线。',
    '写入:当本回合动作失败/部分成功/被阻断且会影响后续尝试时,用 tavern_commands push 到 系统.扩展.行动门控.recent。',
    `写入格式:{"action":"push","key":"系统.扩展.行动门控.recent","value":{"actionLabel":"动作短名","outcome":"failure|partial|blocked","scope":"scene|npc|location|item|quest|combat|social","target":"对象或地点","reason":"失败原因","effect":"后续影响","createdAtTurn":${currentTurn},"ttlTurns":3}}`,
  ];

  if (active.length > 0) {
    lines.push('当前活跃门控:');
    active.forEach((entry, index) => {
      const target = entry.target ? `,目标=${entry.target}` : '';
      const expiry = typeof entry.expiresAtTurn === 'number'
        ? `,到期回合=${entry.expiresAtTurn}`
        : (typeof entry.ttlTurns === 'number' ? `,持续=${entry.ttlTurns}回合` : '');
      lines.push(`${index + 1}. 动作=${entry.actionLabel},结果=${entry.outcome},范围=${entry.scope}${target},原因=${entry.reason},影响=${entry.effect}${expiry}`);
    });
  } else {
    lines.push('当前活跃门控:无');
  }

  return lines.join('\n');
}
