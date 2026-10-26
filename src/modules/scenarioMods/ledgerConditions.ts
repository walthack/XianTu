/**
 * 账本条件读取（身份账设计稿 2026-10-25 §4）：变体求值用的五类路径
 * identity.* / done.* / line.*.outcome / acq.* / knows.player.*，道具来路 item.*（补充设计稿 2026-10-26 §2.4），在队 party.*（同稿 §3.4，数据源 partyLedger.ts），进度期限 deadline.*（同稿 §4.5，数据源 progressDeadlines.ts）。
 * 只读不写；读不到的账本一律当空。不是本模块的前缀交还原 flags 逻辑。
 * narrativeVariants.when 走 evaluateLedgerCondition；activation/completion 等由 runtime.ts 的 resolveConditionValue 委托 resolveLedgerPath（T4，
 * 用户 2026-10-25 23:24 批），那里 gt/gte/lt/lte 只比数字，相识等级比较只在变体里可用（validator 拦）。
 */
import type { ScenarioCondition, ScenarioConditionOperator } from './schema';
import { orderedDoneEventIds } from './playerLedgerRules';
import type { PlayerIdentityLedger } from './identityLedger';
import { readLineOutcome } from './lineOutcomes';
import { isAcquaintanceKind, rankOf, type AcquaintanceLedger } from './acquaintanceLedger';
import { firstItemReceipt } from './itemProvenance';
import { isInParty } from './partyLedger';
import { deadlineState } from './progressDeadlines';

export type LedgerPathKind = 'identity' | 'done' | 'line' | 'acq' | 'knows' | 'item' | 'party' | 'deadline';

export interface ParsedLedgerPath {
  kind: LedgerPathKind;
  /** identityId / eventId / lineId / characterId / propositionId / 道具组 id 或 itemId / 期限 id；格式不对时为空串 */
  id: string;
  /** identity：active＝是否持有，status / from＝子读取；item：active＝是否得过，from＝最早回执的 sourceEventId */
  field?: 'active' | 'status' | 'from';
  /** 前缀属于本模块但形状不对（如 line.<id> 缺 .outcome、knows.<非 player>、deadline.<id>.state 锁存键） */
  invalid?: boolean;
}

/** 各类路径支持的 operator（§4.1）。party.<characterId> 恒为 boolean，只有 eq / neq；deadline.<id> 的 exists＝已起算。 */
export const LEDGER_OPERATORS: Record<LedgerPathKind, readonly ScenarioConditionOperator[]> = {
  identity: ['eq', 'neq', 'exists'],
  done: ['eq', 'neq'],
  line: ['eq', 'neq', 'exists'],
  acq: ['eq', 'neq', 'exists', 'gt', 'gte', 'lt', 'lte'],
  knows: ['eq', 'neq'],
  item: ['eq', 'neq', 'exists'],
  party: ['eq', 'neq'],
  deadline: ['eq', 'neq', 'exists'],
};

/** item.<id>（是否得过）恒为 boolean，只有 eq / neq；exists 只给 item.<id>.from。 */
const ITEM_OBTAINED_OPERATORS: readonly ScenarioConditionOperator[] = ['eq', 'neq'];

/** 该路径实际可用的 operator（validator 与求值共用）。 */
export function ledgerOperatorsOf(parsed: ParsedLedgerPath): readonly ScenarioConditionOperator[] {
  return parsed.kind === 'item' && parsed.field !== 'from' ? ITEM_OBTAINED_OPERATORS : LEDGER_OPERATORS[parsed.kind];
}

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
  if (path.startsWith('item.')) {
    const tail = rest('item.');
    return tail.endsWith('.from') ? { kind: 'item', id: tail.slice(0, -'.from'.length), field: 'from' } : { kind: 'item', id: tail, field: 'active' };
  }
  if (path.startsWith('party.')) return { kind: 'party', id: rest('party.') };
  if (path.startsWith('deadline.')) {
    // deadline.<id>.state 是 flags 锁存键，条件只读 deadline.<id>（期限 id 末段不能是 state）
    const tail = rest('deadline.');
    return tail === 'state' || tail.endsWith('.state') ? { kind: 'deadline', id: '', invalid: true } : { kind: 'deadline', id: tail };
  }
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
    case 'item': {
      // 只看回执（含读档回填）；没得过：item.<id> 为 false，.from 为 undefined
      const receipt = firstItemReceipt(runtime, parsed.id);
      return parsed.field === 'from' ? receipt?.sourceEventId : receipt !== undefined;
    }
    case 'party':
      // 显式在队账（开局名单 → 编年史顺序入/离队 → 去掉 departedCast）；不在队为 false
      return isInParty(runtime, parsed.id);
    case 'deadline':
      // 锁存（due / cleared）优先，否则按编年史现算；未起算为 undefined
      return deadlineState(runtime, parsed.id);
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
 * 账本路径在没有 runtime、路径形状不对或 operator 不支持时一律不命中（false），不回落 flags。
 */
export function evaluateLedgerCondition(condition: ScenarioCondition, runtime?: unknown): boolean | undefined {
  const parsed = parseLedgerPath(condition?.path);
  if (!parsed) return undefined;
  if (!runtime || parsed.invalid || !parsed.id || !ledgerOperatorsOf(parsed).includes(condition.operator)) return false;
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
