/**
 * 账本条件读取（身份账设计稿 2026-10-25 §4）：变体求值用的五类路径
 * identity.* / done.* / line.*.outcome / acq.* / knows.player.*，以及只留位的 party.*。
 * 只读不写；读不到的账本一律当空。不是本模块的前缀交还原 flags 逻辑。
 * narrativeVariants.when 走 evaluateLedgerCondition；activation/completion 等由 runtime.ts 的 resolveConditionValue 委托 resolveLedgerPath（T4，
 * 用户 2026-10-25 23:24 批），那里 gt/gte/lt/lte 只比数字，相识等级比较只在变体里可用（validator 拦）。
 */
import type { ScenarioCondition, ScenarioConditionOperator } from './schema';
import { orderedDoneEventIds } from './playerLedgerRules';
import type { PlayerIdentityLedger } from './identityLedger';
import { readLineOutcome } from './lineOutcomes';
import { isAcquaintanceKind, rankOf, type AcquaintanceLedger } from './acquaintanceLedger';

export type LedgerPathKind = 'identity' | 'done' | 'line' | 'acq' | 'knows' | 'party';

export interface ParsedLedgerPath {
  kind: LedgerPathKind;
  /** identityId / eventId / lineId / characterId / propositionId；格式不对时为空串 */
  id: string;
  /** 仅 identity：active＝是否持有，status / from＝子读取 */
  field?: 'active' | 'status' | 'from';
  /** 前缀属于本模块但形状不对（如 line.<id> 缺 .outcome、knows.<非 player>） */
  invalid?: boolean;
}

/** 各类路径支持的 operator（§4.1）。party 留位，任何 operator 都不命中。 */
export const LEDGER_OPERATORS: Record<LedgerPathKind, readonly ScenarioConditionOperator[]> = {
  identity: ['eq', 'neq', 'exists'],
  done: ['eq', 'neq'],
  line: ['eq', 'neq', 'exists'],
  acq: ['eq', 'neq', 'exists', 'gt', 'gte', 'lt', 'lte'],
  knows: ['eq', 'neq'],
  party: [],
};

const RANK_OPERATORS = new Set<ScenarioConditionOperator>(['gt', 'gte', 'lt', 'lte']);

/** 不是账本前缀返回 undefined。 */
export function parseLedgerPath(path: string): ParsedLedgerPath | undefined {
  if (typeof path !== 'string') return undefined;
  const rest = (prefix: string): string => path.slice(prefix.length);
  if (path.startsWith('identity.')) {
    const tail = rest('identity.');
    for (const field of ['from', 'status'] as const) {
      if (tail.endsWith(`.${field}`)) return { kind: 'identity', id: tail.slice(0, -field.length - 1), field };
    }
    return { kind: 'identity', id: tail, field: 'active' };
  }
  if (path.startsWith('done.')) return { kind: 'done', id: rest('done.') };
  if (path.startsWith('line.')) {
    const tail = rest('line.');
    return tail.endsWith('.outcome') && tail.length > '.outcome'.length
      ? { kind: 'line', id: tail.slice(0, -'.outcome'.length) }
      : { kind: 'line', id: '', invalid: true };
  }
  if (path.startsWith('acq.')) return { kind: 'acq', id: rest('acq.') };
  if (path.startsWith('knows.')) {
    return path.startsWith('knows.player.') ? { kind: 'knows', id: rest('knows.player.') } : { kind: 'knows', id: '', invalid: true };
  }
  if (path.startsWith('party.')) return { kind: 'party', id: rest('party.') };
  return undefined;
}

/** 已完成事件集合（口径见 orderedDoneEventIds：编年史为准，补本关 completedEventIds）。 */
export function completedEventSet(runtime: unknown): Set<string> {
  return new Set(orderedDoneEventIds(runtime));
}

/** 带顺序的版本；与规则处理共用同一实现。 */
export const orderedCompletedEvents = orderedDoneEventIds;

type LedgerRuntime = {
  playerIdentities?: PlayerIdentityLedger;
  flags?: Record<string, unknown>;
  acquaintances?: AcquaintanceLedger;
  actorEngine?: { acquaintance?: AcquaintanceLedger };
  playerKnowledge?: Record<string, { factId?: string; propositionId?: string; status?: string } | undefined>;
};

const asRecord = <T>(value: unknown): T | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as T : undefined;

function readPath(parsed: ParsedLedgerPath, runtime: unknown): unknown {
  const rt = (asRecord<LedgerRuntime>(runtime) || {}) as LedgerRuntime;
  switch (parsed.kind) {
    case 'identity': {
      // 无记录为 undefined：eq true＝持有中，exists＝曾持有（撤销后记录保留）
      const record = asRecord<PlayerIdentityLedger>(rt.playerIdentities)?.[parsed.id];
      if (!record) return undefined;
      if (parsed.field === 'status') return record.status;
      if (parsed.field === 'from') return record.acquiredAtEventId;
      return record.status === 'active';
    }
    case 'done':
      return completedEventSet(runtime).has(parsed.id);
    case 'line':
      return readLineOutcome(asRecord(rt.flags), parsed.id);
    case 'acq': {
      // 新账优先，旧 actorEngine.acquaintance 兜底，同 legacyNarratorPacket
      const record = asRecord<AcquaintanceLedger>(rt.acquaintances)?.[parsed.id]
        ?? asRecord<AcquaintanceLedger>(rt.actorEngine?.acquaintance)?.[parsed.id];
      return record?.kind;
    }
    case 'knows':
      return Object.values(asRecord<NonNullable<LedgerRuntime['playerKnowledge']>>(rt.playerKnowledge) || {})
        .some(fact => fact?.status === 'confirmed' && (fact.propositionId === parsed.id || fact.factId === parsed.id));
    case 'party':
      return undefined;
  }
}

/** 解析五类路径；不是本模块的前缀返回 { handled:false }。rankCompare＝gt/gte/lt/lte 按相识等级比较。 */
export function resolveLedgerPath(path: string, runtime: unknown): { handled: boolean; value?: unknown; rankCompare?: boolean } {
  const parsed = parseLedgerPath(path);
  if (!parsed) return { handled: false };
  if (parsed.invalid || !parsed.id) return { handled: true, value: undefined };
  return { handled: true, value: readPath(parsed, runtime), ...(parsed.kind === 'acq' ? { rankCompare: true } : {}) };
}

/**
 * undefined＝不是本模块的路径，交给原逻辑。
 * 账本路径在没有 runtime、路径形状不对、operator 不支持或 party 留位时一律不命中（false），不回落 flags。
 */
export function evaluateLedgerCondition(condition: ScenarioCondition, runtime?: unknown): boolean | undefined {
  const parsed = parseLedgerPath(condition?.path);
  if (!parsed) return undefined;
  if (!runtime || parsed.invalid || !parsed.id || !LEDGER_OPERATORS[parsed.kind].includes(condition.operator)) return false;
  const { value: actual, rankCompare } = resolveLedgerPath(condition.path, runtime);
  if (condition.operator === 'exists') return actual !== undefined;
  if (condition.operator === 'eq') return actual === condition.value;
  if (condition.operator === 'neq') return actual !== condition.value;
  if (!rankCompare || !RANK_OPERATORS.has(condition.operator) || !isAcquaintanceKind(condition.value)) return false;
  const left = isAcquaintanceKind(actual) ? rankOf(actual) : 0;
  const right = rankOf(condition.value);
  if (condition.operator === 'gt') return left > right;
  if (condition.operator === 'gte') return left >= right;
  if (condition.operator === 'lt') return left < right;
  return left <= right;
}
