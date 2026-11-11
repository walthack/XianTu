import { CONTENT_PACKS } from '../contentPacks';
import type { ScenarioModEvent } from './schema';
import { isScopedPlayerPresentationEvent } from './playtestNarrativeScope';

/** 试玩事件窗里多动作事件的玩家句（F0b：与内容包 texts 的 scopedPlayerLine.<eventId>::<actionId> 合并，TS 表优先，编译期禁止两边都有）。B6 起数据全在塞外包 texts，TS 表留空。 */
export const TS_PLAYER_LINES: Readonly<Record<string, string>> = {};

const AUTHOR_LEAK = /不把|完整落账|先帮忙后|不让旁人|不借登场|不提前|只认眼前|不得|禁止|事件完成真值|结构化步骤/;

export function scopedPlayerLineKey(eventId: string, actionId: string): string {
  return `${eventId}::${actionId}`;
}

export function lookupScopedPlayerLine(eventId: string, actionId: string): string | undefined {
  const key = scopedPlayerLineKey(eventId, actionId);
  return (TS_PLAYER_LINES as Record<string, string>)[key] ?? CONTENT_PACKS.texts[`scopedPlayerLine.${key}`];
}

export function resolveScopedPlayerLine(
  event: Pick<ScenarioModEvent, 'id' | 'presentation' | 'playerCompletionContract'>,
  action: { id: string; label?: string; actionText?: string },
  storyMode?: string,
): string | undefined {
  if (!isScopedPlayerPresentationEvent(event.id, storyMode)) return undefined;
  if ((event.playerCompletionContract?.actions.length || 0) > 1) return lookupScopedPlayerLine(event.id, action.id) || action.actionText;
  const explicitLine = event.presentation?.playerLine?.trim();
  if (explicitLine) return explicitLine;
  return lookupScopedPlayerLine(event.id, action.id);
}

export function playerLineLeaksAuthorNotes(text: string): boolean {
  return AUTHOR_LEAK.test(String(text || ''));
}


/** 展示投影不改变合同actionText；作者约束仍留在模型侧。 */
export function playerFacingActionLine(line: string): string {
  if (!/不把尚未|不提前宣告|不走进下一章|不装作无事|不得|禁止|事件完成真值|结构化步骤|走投无路返回|我按当前主线目标行动[：:]/.test(line)) return line.trim();
  const clauses = String(line || '').split(/[，,。；;]/).map(s => s.trim()).filter(Boolean);
  const kept = clauses.filter(s => !/不把尚未|不提前宣告|不走进下一章|不装作无事|不得|禁止|事件完成真值|结构化步骤/.test(s));
  const result = kept.join('，').replace(/^我按当前主线目标行动[：:]/, '我');
  const firstPerson = result.indexOf('我');
  return result ? (firstPerson > 0 ? result.slice(firstPerson) : result).replace(/[。]+$/, '') + '。' : '我查看眼前的情况。';
}

/**
 * 动作显示覆写的 TS 侧表：键 `<eventId>::<actionId>`，`<eventId>::*` 是事件级（任何动作都返回）。
 * F0b：与内容包 texts 的 actionDisplay.<eventId>.<actionId|*>.line/label 合并；编译期禁止同一事件两边重叠。
 * B6 起数据在塞外、昭南包 texts，TS 表留空。武二郎工钱已改入源合同，不再由显示投影缩写。
 */
export const TS_ACTION_DISPLAY_OVERRIDES: Readonly<Record<string, { line: string; label: string }>> = {};

/** 旧合同在玩家面前不重复预设“离开后返回”，也不提前念阿葭死讯。顺序：texts 逐动作键 → texts 事件级通配键 → TS 表逐动作 → TS 表事件级。 */
export function playerActionDisplayOverride(eventId: string, actionId: string): { line: string; label?: string } | undefined {
  for (const key of [`actionDisplay.${eventId}.${actionId}`, `actionDisplay.${eventId}.*`]) {
    const line = CONTENT_PACKS.texts[`${key}.line`], label = CONTENT_PACKS.texts[`${key}.label`];
    if (line && label) return { line, label };
  }
  const table = TS_ACTION_DISPLAY_OVERRIDES as Record<string, { line: string; label: string }>;
  const hit = Object.prototype.hasOwnProperty.call(table, `${eventId}::${actionId}`) ? table[`${eventId}::${actionId}`]
    : Object.prototype.hasOwnProperty.call(table, `${eventId}::*`) ? table[`${eventId}::*`] : undefined;
  return hit ? { ...hit } : undefined;
}
