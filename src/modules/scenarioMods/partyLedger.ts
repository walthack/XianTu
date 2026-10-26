/**
 * 在队账（身份账补充设计稿 2026-10-26 §3；总策划已审 Q4）：party.<characterId> 的唯一数据源。
 * - 显式在队账＝开局关在队名单（partyOpenings）→ 按编年史完成顺序逐个事件应用离队/入队（partyLeaves / partyJoins，
 *   whenReceiptId 用路径回执区分玩家选择，如凝羽离队/留队；同一事件先离后入）→ 去掉 runtime.departedCast（死亡或永久离场）。
 * - 不加存档字段：每次读取从编年史推导（orderedDoneEventIds），任何先后顺序都得到确定结果；规则只读 mod-kit/player-ledger-rules.json，首版为空。
 * - 启发式同行名单（travelLedger 的 currentTravelCompanions、locationLoot 的 presentCompanionIds）只用于演出，这里不读。
 * - 推导失败按「不在队」处理（偏保守，倾向锁节点），记 LCQ-SAV-026；读取频繁，同一 reason 只记一次。
 */
import { orderedDoneEventIds, playerLedgerRules, type PartyRule, type PlayerLedgerRules } from './playerLedgerRules';
import { logEventOnce } from '../diagnostics/log';
import { debugLog } from '../diagnostics/debugLog';

interface PartyRuntime {
  modId?: string;
  chronicle?: Array<{ stageId?: string; sequence?: number }>;
  pathReceipts?: Record<string, unknown>;
  departedCast?: Array<string | { id?: string }>;
}

/** 开局关：编年史 sequence 最小且带 stageId 的那条；没有编年史时取当前 modId（兼顾序幕开局与各试玩入口开局）。 */
export function partyOpeningStage(runtime: unknown): string | undefined {
  const rt = (runtime || {}) as PartyRuntime;
  let first: { stageId?: string; sequence?: number } | undefined;
  for (const entry of Array.isArray(rt.chronicle) ? rt.chronicle : []) {
    if (!entry?.stageId) continue;
    if (!first || (entry.sequence ?? 0) < (first.sequence ?? 0)) first = entry;
  }
  return first?.stageId || rt.modId || undefined;
}

function deriveRoster(runtime: unknown, rules: PlayerLedgerRules): Set<string> {
  const joins = rules.partyJoins ?? [];
  const leaves = rules.partyLeaves ?? [];
  const openings = rules.partyOpenings ?? [];
  const roster = new Set<string>();
  if (!joins.length && !leaves.length && !openings.length) return roster;
  const rt = (runtime || {}) as PartyRuntime;
  const stageId = partyOpeningStage(runtime);
  for (const id of openings.find(opening => opening.stageId === stageId)?.characterIds ?? []) roster.add(id);
  const opened = [...roster];
  const receipts = rt.pathReceipts && typeof rt.pathReceipts === 'object' ? rt.pathReceipts : {};
  const applies = (rule: PartyRule): boolean => rule.whenReceiptId === undefined || Boolean(receipts[rule.whenReceiptId]);
  const applied: string[] = [];
  for (const eventId of orderedDoneEventIds(runtime)) {
    for (const rule of leaves) if (rule.eventId === eventId && applies(rule)) { roster.delete(rule.characterId); applied.push(`leave ${rule.characterId}@${eventId}`); }
    for (const rule of joins) if (rule.eventId === eventId && applies(rule)) { roster.add(rule.characterId); applied.push(`join ${rule.characterId}@${eventId}`); }
  }
  const departed = (Array.isArray(rt.departedCast) ? rt.departedCast : []).map(d => typeof d === 'string' ? d : d?.id).filter(id => id && roster.has(id)) as string[];
  for (const id of departed) roster.delete(id);
  debugLog('identity', `[在队账] 开局关=${stageId} 名单=${opened.join('、') || '无'} 应用 ${applied.join('、') || '无'} 去掉已离场 ${departed.join('、') || '无'} → ${[...roster].join('、') || '无'}`);
  return roster;
}

/** 在队角色 id 集合（纯推导，不写存档）。规则表为空且无开局名单时为空集；规则表或推导出错时为空集并记 LCQ-SAV-026。 */
export function partyRoster(runtime: unknown, rules?: PlayerLedgerRules): Set<string> {
  let table: PlayerLedgerRules;
  try {
    table = rules ?? playerLedgerRules();
  } catch (error) {
    logEventOnce('LCQ-SAV-026:rules_invalid', { code: 'LCQ-SAV-026', cause: error, detail: { reason: 'rules_invalid' } });
    return new Set();
  }
  try {
    return deriveRoster(runtime, table);
  } catch (error) {
    logEventOnce('LCQ-SAV-026:derive_failed', { code: 'LCQ-SAV-026', cause: error, detail: { reason: 'derive_failed', modId: (runtime as PartyRuntime | undefined)?.modId } });
    return new Set();
  }
}

/** party.<characterId> 的读值：在队为 true，否则 false（不是 undefined）。 */
export function isInParty(runtime: unknown, characterId: string): boolean {
  return partyRoster(runtime).has(characterId);
}
