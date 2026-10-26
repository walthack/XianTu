/**
 * 国家线收束档（身份账设计稿 2026-10-25 §3.2 / §3.3）：写进 flags 扁平键 line.<lineId>.outcome，不另加存档字段。
 * 档位集合与是否只写一次只读数值配置 story.lineOutcome.{tiers,writeOnce}；写入只由规则表驱动，按完成顺序幂等同步。
 */
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { orderedDoneEventIds, playerLedgerRules, type PlayerLedgerRules } from './playerLedgerRules';
import { logError } from '../diagnostics/log';

export const lineOutcomeTiers = (): readonly string[] => GAME_NUMBERS.story.lineOutcome.tiers;

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

/** 写一条收束档；返回是否有改动。不在 tiers 里拒写；writeOnce 时已收束的线不覆盖（同值静默跳过）；拒写记 LCQ-SAV-024。 */
export function writeLineOutcome(flags: Record<string, unknown>, lineId: string, outcome: string, eventId?: string): boolean {
  const from = eventId ? `（事件 ${eventId}）` : '';
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
