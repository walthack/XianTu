/**
 * 国家线收束档（身份账设计稿 2026-10-25 §3.2 / §3.3）：写进 flags 扁平键 line.<lineId>.outcome，不另加存档字段。
 * 档位集合（resolved/unresolved；「没去」＝无收束记录，不是档位）、是否只写一次、判档线集合、失败是否结束游戏只读数值配置 story.lineOutcome.{tiers,writeOnce,judgedLines,failEndsGame}；写入只由规则表驱动，按完成顺序幂等同步。
 * 「这条线收束了没有」只有一个读取点 lineClosed（总策划定，真机 1f9f24127b4e 报告③）：当前线卡、compass.anyLineClosed、太泉解锁都读它。
 */
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { orderedDoneEventIds, playerLedgerRules, type PlayerLedgerRules } from './playerLedgerRules';
import { logError } from '../diagnostics/log';
import { debugEnabled, debugLog } from '../diagnostics/debugLog';
import { CONTENT_PACKS } from '../contentPacks';

export const lineOutcomeTiers = (): readonly string[] => GAME_NUMBERS.story.lineOutcome.tiers;

/** 判档线集合（story.lineOutcome.judgedLines；用户 2026-10-26 定太泉不判档）。 */
export const judgedLineIds = (): readonly string[] => GAME_NUMBERS.story.lineOutcome.judgedLines;

/** 该判档线失败是否当场结束游戏（story.lineOutcome.failEndsGame，registry 保证键正好是判档线）；只有配置为 true 才结束，非判档线（如太泉）与未知 id 一律 false。本函数只读配置，不接游戏结束流程。 */
export const lineFailEndsGame = (lineId: string): boolean =>
  (GAME_NUMBERS.story.lineOutcome.failEndsGame as Record<string, boolean | undefined>)[lineId] === true;

/** 国家线 flags 命名空间：收束档只有规则表这一个写入口（模型 set、任务线 setState 都不得写），切关时整段继承。 */
export const LINE_FLAG_PREFIX = 'line.';

export const lineOutcomeKey = (lineId: string): string => `${LINE_FLAG_PREFIX}${lineId}.outcome`;

/** 扁平键优先，嵌套兜底。 */
export function readLineOutcome(flags: Record<string, unknown> | undefined, lineId: string): string | undefined {
  if (!flags) return undefined;
  const key = lineOutcomeKey(lineId);
  if (Object.prototype.hasOwnProperty.call(flags, key)) return flags[key] as string | undefined;
  let node: unknown = flags;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** 线的下一步表里的收束条件（line-compass.json closedWhen）：只许 done.*，可含 anyOf 组（validator 拦）。结构同 lineCompass.ts 的 LineCompassCondition，这里不反向依赖它。 */
type ClosedWhenCondition = { path?: string; operator?: string; value?: unknown; anyOf?: ClosedWhenCondition[] };
type ClosureLine = { lineId?: string; closedWhen?: ClosedWhenCondition[] };

export interface LineClosedOptions {
  /** 计入的收束档（太泉解锁读 story.lineUnlock.<id>.countTiers）；缺省取全部档位 */
  tiers?: readonly string[];
  /** 线的下一步表（右栏卡传它求值的表，测试夹具可替换）；缺省读内容包 line-compass.json */
  lines?: readonly ClosureLine[];
}

const packLines = (): readonly ClosureLine[] => ((CONTENT_PACKS as { lineCompass?: { lines?: ClosureLine[] } }).lineCompass?.lines) ?? [];

/** done.<eventId> eq/neq 按编年史（orderedDoneEventIds）判；别的路径一律不成立。 */
function closedWhenHolds(conds: readonly ClosedWhenCondition[], done: ReadonlySet<string>): boolean {
  const one = (c: ClosedWhenCondition): boolean => {
    if (Array.isArray(c?.anyOf)) return c.anyOf.some(one);
    if (typeof c?.path !== 'string' || !c.path.startsWith('done.')) return false;
    const actual = done.has(c.path.slice('done.'.length));
    return c.operator === 'eq' ? actual === c.value : c.operator === 'neq' ? actual !== c.value : false;
  };
  return conds.every(one);
}

const lastFallback = new Map<string, boolean>();

/**
 * 国家线是否已收束——唯一读取点（总策划定）。纯读，不写 flags。
 * ① line.<id>.outcome 已写（档位在 story.lineOutcome.tiers 里）：档位在 opts.tiers 里即收束，resolved、unresolved 都算；
 * ② 没写、规则表 lineOutcomes 里已有这条线的规则：未收束（等规则写档）；
 * ③ 规则表里还没有这条线的规则：退回读线的下一步表里配好的收束事件 closedWhen，按编年史判，记 identity 调试日志（结果变了才记）。
 * 「没去」「半路走掉」＝没有收束记录、也没走到收束事件，都不算（用户 2026-10-27 01:12 定）。不编各线胜负规则，规则表留给剧情侧填。
 * 太泉不计入由调用方的线集合决定（judgedLines、story.lineCompass.anyLineClosed.lineIds 都不含 taiquan）。
 */
export function lineClosed(lineId: string, runtime: unknown, opts: LineClosedOptions = {}): boolean {
  const flags = (runtime as { flags?: Record<string, unknown> } | undefined)?.flags;
  const outcome = readLineOutcome(flags && typeof flags === 'object' ? flags : undefined, lineId);
  if (outcome !== undefined && lineOutcomeTiers().includes(outcome)) return (opts.tiers ?? lineOutcomeTiers()).includes(outcome);
  if (playerLedgerRules().lineOutcomes.some(rule => rule.lineId === lineId)) return false;
  const closedWhen = (opts.lines ?? packLines()).find(line => line.lineId === lineId)?.closedWhen;
  const closed = !!closedWhen?.length && closedWhenHolds(closedWhen, new Set(orderedDoneEventIds(runtime)));
  if (debugEnabled('identity') && lastFallback.get(lineId) !== closed) {
    lastFallback.set(lineId, closed);
    debugLog('identity', `[收束] ${lineId}：规则表 lineOutcomes 还没有本线规则，退回读线的下一步表收束事件（closedWhen，按编年史）→ ${closed ? '已收束' : '未收束'}`, () => ({ lineId, closedWhen }));
  }
  return closed;
}

/** 已收束的判档线（太泉解锁设计稿 2026-10-27 §3）：按 judgedLineIds() 的顺序逐条读 lineClosed；tiers 缺省取全部档位。非判档线（太泉）不在其中。纯读，不写 flags。 */
export function closedLineIds(runtime: unknown, tiers: readonly string[] = lineOutcomeTiers()): string[] {
  return judgedLineIds().filter(lineId => lineClosed(lineId, runtime, { tiers }));
}

/** 写一条收束档；返回是否有改动。非判档线（不在 judgedLines，如太泉）与不在 tiers 里的档位拒写；writeOnce 时已收束的线不覆盖（同值静默跳过）；拒写记 LCQ-SAV-024。 */
export function writeLineOutcome(flags: Record<string, unknown>, lineId: string, outcome: string, eventId?: string): boolean {
  const from = eventId ? `（事件 ${eventId}）` : '';
  if (!judgedLineIds().includes(lineId)) {
    logError('LCQ-SAV-024', `${lineId} 不在 story.lineOutcome.judgedLines（非判档线），拒写收束档 ${String(outcome)}${from}`, { detail: { reason: 'notJudged', lineId, outcome, eventId } });
    return false;
  }
  if (!lineOutcomeTiers().includes(outcome)) {
    logError('LCQ-SAV-024', `${lineId} 收束档 ${String(outcome)} 不在 story.lineOutcome.tiers，拒写${from}`, { detail: { reason: 'tier', lineId, outcome, eventId } });
    return false;
  }
  const prior = readLineOutcome(flags, lineId);
  if (prior === outcome) return false;
  if (prior !== undefined && GAME_NUMBERS.story.lineOutcome.writeOnce) {
    logError('LCQ-SAV-024', `${lineId} 已收束为 ${prior}，writeOnce 不覆盖为 ${outcome}${from}`, { detail: { reason: 'writeOnce', lineId, outcome, prior, eventId } });
    return false;
  }
  flags[lineOutcomeKey(lineId)] = outcome;
  return true;
}

export interface SyncLineOutcomesOptions {
  /** 旧档回填。flags 只存档位字串，不落 backfilled 标记；保留参数与身份同步对齐 */
  backfilled?: boolean;
  /** 测试夹具可替换规则表；缺省读 mod-kit/player-ledger-rules.json */
  rules?: PlayerLedgerRules;
}

/** 按完成顺序扫规则表写 runtime.flags['line.<lineId>.outcome']；返回改动条数。 */
export function syncLineOutcomes(runtime: unknown, opts: SyncLineOutcomesOptions = {}): number {
  const rules = opts.rules ?? playerLedgerRules();
  if (!rules.lineOutcomes.length) return 0;
  const rt = runtime as { flags?: Record<string, unknown> };
  const byEvent = new Map<string, PlayerLedgerRules['lineOutcomes']>();
  for (const rule of rules.lineOutcomes) byEvent.set(rule.eventId, [...(byEvent.get(rule.eventId) || []), rule]);
  let changed = 0;
  for (const eventId of orderedDoneEventIds(runtime)) {
    for (const rule of byEvent.get(eventId) || []) {
      rt.flags ||= {};
      if (writeLineOutcome(rt.flags, rule.lineId, rule.outcome, eventId)) changed += 1;
    }
  }
  return changed;
}
