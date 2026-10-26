/**
 * 按剧情进度计的期限（身份账补充设计稿 2026-10-26 §4）：deadline.<id> 的唯一数据源。
 * - 起点事件完成起算，之后每完成一个刻度事件（所属线不在 excludeLineIds）计数加一，计到 due 即到期；到期前完成解除事件即解除。
 *   规则读 mod-kit/player-ledger-rules.json 的 progressTicks / progressDeadlines，due / urgentAt 读 story.progressDeadline.limits，首版都为空。
 * - 不加存档字段：running / urgent 每次读取从编年史（orderedDoneEventIds）现算，任何先后顺序都得到确定结果；
 *   到终态 due / cleared 才锁存进 flags 扁平键 deadline.<id>.state，写一次不再改（数值可热改，不锁存会让已到期的倒退）。
 *   锁存只由本模块写：切关整段继承（strictInitializer）、模型不能写（canonGuard）、任务线 setState 不能写（questLines），同 line.*。
 * - 到期后果（坏结局、开放接回、换文案）不在机制里，内容用 deadline.<id> eq due 自己接；本模块不写 gameOver。
 * - 出错记 LCQ-SAV-027，不抛、不阻断回合；SAV-023（身份账/收束档）含义不变。
 */
import { orderedDoneEventIds, playerLedgerRules, type PlayerLedgerRules, type ProgressDeadlineDef, type ProgressTick } from './playerLedgerRules';
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { logError, logEventOnce } from '../diagnostics/log';
import { debugLog } from '../diagnostics/debugLog';

export const DEADLINE_STATES = ['running', 'urgent', 'due', 'cleared'] as const;
export type DeadlineState = typeof DEADLINE_STATES[number];
/** 终态：到了就锁存，之后以锁存为准。 */
export const DEADLINE_TERMINAL_STATES: readonly DeadlineState[] = ['due', 'cleared'];

/** 期限 flags 命名空间：锁存只有本模块这一个写入口（模型 set、任务线 setState 都不得写），切关时整段继承。 */
export const DEADLINE_FLAG_PREFIX = 'deadline.';
export const deadlineStateKey = (deadlineId: string): string => `${DEADLINE_FLAG_PREFIX}${deadlineId}.state`;

export interface DeadlineLimit { due: number; urgentAt: number }
export type DeadlineLimits = Record<string, DeadlineLimit | undefined>;

export interface DeadlineComputation {
  state: DeadlineState | undefined;
  /** 起算事件 */
  startedAt?: string;
  /** 已计刻度数 */
  ticks: number;
  /** 到终态的那个事件 */
  settledAt?: string;
}

const isTerminal = (value: unknown): value is DeadlineState => (DEADLINE_TERMINAL_STATES as readonly unknown[]).includes(value);

/** 现算并带上过程（调试日志与锁存事件用）。纯函数。 */
export function computeDeadline(orderedDone: readonly string[], def: ProgressDeadlineDef, limit: DeadlineLimit, ticks: readonly ProgressTick[]): DeadlineComputation {
  const starts = new Set(def.startEventIds);
  const start = orderedDone.findIndex(id => starts.has(id));
  if (start < 0) return { state: undefined, ticks: 0 };
  const clears = new Set(def.clearEventIds);
  const excluded = new Set(def.excludeLineIds ?? []);
  const lineOf = new Map(ticks.map(tick => [tick.eventId, tick.lineId]));
  const startedAt = orderedDone[start];
  let count = 0;
  for (const eventId of orderedDone.slice(start + 1)) {
    // 同一事件既是刻度又是解除时先判解除
    if (clears.has(eventId)) return { state: 'cleared', startedAt, ticks: count, settledAt: eventId };
    const lineId = lineOf.get(eventId);
    if (lineId === undefined || excluded.has(lineId)) continue;
    count += 1;
    if (count >= limit.due) return { state: 'due', startedAt, ticks: count, settledAt: eventId };
  }
  return { state: count >= limit.urgentAt ? 'urgent' : 'running', startedAt, ticks: count };
}

/** 纯函数：未起算为 undefined。 */
export function computeDeadlineState(orderedDone: readonly string[], def: ProgressDeadlineDef, limit: DeadlineLimit, ticks: readonly ProgressTick[]): DeadlineState | undefined {
  return computeDeadline(orderedDone, def, limit, ticks).state;
}

export interface ProgressDeadlineOptions {
  /** 测试夹具可替换规则表；缺省读 mod-kit/player-ledger-rules.json */
  rules?: PlayerLedgerRules;
  /** 测试夹具可替换数值表；缺省读 story.progressDeadline.limits（可热改） */
  limits?: DeadlineLimits;
}

interface DeadlineRuntime { modId?: string; flags?: Record<string, unknown> }

const limitsOf = (opts: ProgressDeadlineOptions): DeadlineLimits => opts.limits ?? (GAME_NUMBERS.story.progressDeadline.limits as DeadlineLimits);

function limitOf(limits: DeadlineLimits, id: string): DeadlineLimit {
  const limit = limits[id];
  if (!limit) throw new Error(`story.progressDeadline.limits 缺期限 ${id}`);
  return limit;
}

interface Resolved { state: DeadlineState | undefined; latched: boolean; computation: DeadlineComputation }

/** 锁存优先；锁存非法改为现算（invalid_latch），锁存与现算不一致以锁存为准（latch_conflict）。两类都同一期限本会话只记一次。 */
function resolveDeadline(runtime: unknown, def: ProgressDeadlineDef, orderedDone: readonly string[], rules: PlayerLedgerRules, limits: DeadlineLimits): Resolved {
  const rt = (runtime || {}) as DeadlineRuntime;
  const flags = rt.flags && typeof rt.flags === 'object' ? rt.flags : {};
  const key = deadlineStateKey(def.id);
  const computation = computeDeadline(orderedDone, def, limitOf(limits, def.id), rules.progressTicks ?? []);
  if (!Object.prototype.hasOwnProperty.call(flags, key)) return { state: computation.state, latched: false, computation };
  const latch = flags[key];
  if (!isTerminal(latch)) {
    logEventOnce(`LCQ-SAV-027:invalid_latch:${def.id}`, {
      code: 'LCQ-SAV-027', msg: `期限 ${def.id} 的锁存值 ${String(latch)} 不是 due/cleared，本次改为现算`,
      detail: { reason: 'invalid_latch', deadlineId: def.id, latch, computed: computation.state, modId: rt.modId },
    });
    return { state: computation.state, latched: false, computation };
  }
  if (computation.state !== latch) {
    logEventOnce(`LCQ-SAV-027:latch_conflict:${def.id}`, {
      code: 'LCQ-SAV-027', msg: `期限 ${def.id} 已锁存为 ${latch}，现算为 ${String(computation.state)}，以锁存为准`,
      detail: { reason: 'latch_conflict', deadlineId: def.id, latch, computed: computation.state, modId: rt.modId },
    });
  }
  return { state: latch, latched: true, computation };
}

/** deadline.<id> 的读值：锁存优先，否则现算；未起算或未知期限为 undefined。读取出错时有锁存回锁存、否则 undefined，记 SAV-027 sync_failed（phase=read，只记一次）。 */
export function deadlineState(runtime: unknown, id: string, opts: ProgressDeadlineOptions = {}): DeadlineState | undefined {
  try {
    const rules = opts.rules ?? playerLedgerRules();
    const def = (rules.progressDeadlines ?? []).find(d => d.id === id);
    if (!def) return undefined;
    return resolveDeadline(runtime, def, orderedDoneEventIds(runtime), rules, limitsOf(opts)).state;
  } catch (error) {
    logEventOnce('LCQ-SAV-027:read', { code: 'LCQ-SAV-027', cause: error, detail: { reason: 'sync_failed', phase: 'read', deadlineId: id } });
    const latch = ((runtime as DeadlineRuntime | undefined)?.flags || {})[deadlineStateKey(id)];
    return isTerminal(latch) ? latch : undefined;
  }
}

/** 把已到终态的期限锁存进 flags；已锁存的不再改。自带 try/catch，失败记 LCQ-SAV-027 不抛、不写半截（下一回合或读档重试）。返回锁存条数。 */
export function syncProgressDeadlines(runtime: unknown, opts: ProgressDeadlineOptions = {}): number {
  try {
    const rules = opts.rules ?? playerLedgerRules();
    const defs = rules.progressDeadlines ?? [];
    if (!defs.length) return 0;
    const limits = limitsOf(opts);
    const orderedDone = orderedDoneEventIds(runtime);
    const rt = runtime as DeadlineRuntime;
    if (rt.flags !== undefined && (!rt.flags || typeof rt.flags !== 'object' || Array.isArray(rt.flags))) throw new Error('runtime.flags 不是对象');
    const writes: Array<[string, DeadlineState, Resolved]> = [];
    for (const def of defs) {
      const resolved = resolveDeadline(runtime, def, orderedDone, rules, limits);
      const { computation } = resolved;
      debugLog('identity', `[期限] ${def.id} 起算@${computation.startedAt ?? '未起算'} 刻度 ${computation.ticks}/${limitOf(limits, def.id).due} 状态=${resolved.state ?? '未开始'}${resolved.latched ? '（锁存）' : ''}`);
      if (!resolved.latched && isTerminal(resolved.state)) writes.push([def.id, resolved.state, resolved]);
    }
    if (!writes.length) return 0;
    rt.flags ||= {};
    for (const [id, state, resolved] of writes) {
      rt.flags[deadlineStateKey(id)] = state;
      debugLog('identity', `[期限] 锁存 ${id}=${state} @${resolved.computation.settledAt}`);
    }
    return writes.length;
  } catch (error) {
    // 期限同步失败不阻断回合，带码写持久日志；锁存幂等，下回合或读档补记
    logError('LCQ-SAV-027', error, { detail: { reason: 'sync_failed', modId: (runtime as DeadlineRuntime | null)?.modId } });
    return 0;
  }
}
