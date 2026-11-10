import { GAME_NUMBERS, registerNumbersValidator } from '@/modules/sceneModule/numbers';
import { composeShortTermMemoryEntry, stripNarrativeTimePrefix } from '@/utils/memorySanitizer';

/**
 * 详细描写不入档（设计稿 2026-11-03「提示词历史与审核拒绝」第七节方案 B）的纯函数。
 * 系统.历史.叙事、短期记忆、隐式中期记忆都只写概要 mid_term_memory；概要为空写「无概要」标记，不截正文。
 * 提示词侧跳过无概要条；prompt.recentContext.tailChars>0 时附最新正文末尾若干字。
 */

const marker = (): string => GAME_NUMBERS.narrative.noSummaryMarker;

registerNumbersValidator(() => (marker().trim() ? [] : ['narrative.noSummaryMarker 不能为空']));

/** 要写进 历史.叙事 / 短期记忆 / 隐式中期记忆 的概要条；概要为空时返回无概要标记条。 */
export function summaryEntry(timePrefix: string, midTermContent: unknown): string {
  return composeShortTermMemoryEntry(timePrefix, midTermContent) || `${timePrefix}${marker()}`;
}

export function isNoSummary(entry: unknown): boolean {
  return typeof entry === 'string' && stripNarrativeTimePrefix(entry.trim()).trim() === marker();
}

/** 发给模型的最近事件：跳过无概要条；tailChars>0 且给了最新正文时，末尾附正文最后 tailChars 字。 */
export function entriesForPrompt(shortTerm: readonly string[], latestRaw?: string): string[] {
  const out = shortTerm.filter(entry => !isNoSummary(entry));
  const tailChars = GAME_NUMBERS.prompt.recentContext.tailChars;
  const raw = typeof latestRaw === 'string' ? latestRaw.trim() : '';
  if (tailChars > 0 && raw) out.push(Array.from(raw).slice(-tailChars).join(''));
  return out;
}

export interface LocalNarrativeInserts { before: string[]; after: string[] }

/** 回看与旧正文迁移共用：无概要标记不成为追加稿之间的正文。 */
export function withLocalNarrativeInserts(content: string, inserts?: LocalNarrativeInserts): string {
  return [...(inserts?.before || []), isNoSummary(content) ? '' : content, ...(inserts?.after || [])].filter(Boolean).join('\n\n');
}

/**
 * 回看显示用的正文：有本地全文副本显示副本，没有显示存档里的概要；
 * 概要是无概要标记、又没有副本时返回 null，由界面显示提示文案。
 */
export function reviewTextOf(entry: { content?: unknown; localInserts?: LocalNarrativeInserts } | null | undefined, detail?: string): string | null {
  if (typeof detail === 'string' && detail.trim()) {
    return withLocalNarrativeInserts(detail, entry?.localInserts);
  }
  const content = typeof entry?.content === 'string' ? entry.content : '';
  return isNoSummary(content) ? null : content;
}
