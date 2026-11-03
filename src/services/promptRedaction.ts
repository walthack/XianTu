import moderationConfig from '../../mod-kit/ai-content-moderation.json';

/**
 * 422/1026 降级重发用的纯函数：把发给模型的「最近事件」从短期记忆原文换成隐式中期记忆摘要。
 * 只产出新数组，不改入参，也不碰存档（系统.历史.叙事 原文不动）。
 */

export type DegradedContextMode = 'summary' | 'rawLatestOnly';

/** AIBS 拼「最近事件」assistant 消息的标记前缀。 */
export const RECENT_EVENTS_PREFIX = '# 【最近事件】';

/** AIBS 拼「最近事件」消息的原尾句（照抄 AIBidirectionalSystem.ts，勿改字）。 */
export const RECENT_EVENTS_TAIL = '。根据这刚刚发生的文本事件，合理生成下一次文本信息，要保证衔接流畅、不断层，符合上文的文本信息';

type PromptMessage = { role: string; content: unknown };

/** 短期记忆第 index 条按末尾对齐对应的隐式中期记忆摘要；缺失或空白返回 undefined。 */
export function alignedSummary(shortTerm: readonly string[], implicitMid: readonly string[], index: number): string | undefined {
  const midIndex = implicitMid.length - (shortTerm.length - index);
  if (midIndex < 0) return undefined;
  const summary = implicitMid[midIndex];
  return typeof summary === 'string' && summary.trim() ? summary : undefined;
}

/**
 * 降级上下文的最近事件：summary 全换摘要；rawLatestOnly 只留最后一条原文、其余换摘要。
 * 对应摘要缺失的条目丢弃，不发原文。
 */
export function degradedRecentEvents(shortTerm: readonly string[], implicitMid: readonly string[], mode: DegradedContextMode): string[] {
  const lastIndex = shortTerm.length - 1;
  const out: string[] = [];
  shortTerm.forEach((entry, index) => {
    if (mode === 'rawLatestOnly' && index === lastIndex) {
      out.push(entry);
      return;
    }
    const summary = alignedSummary(shortTerm, implicitMid, index);
    if (summary !== undefined) out.push(summary);
  });
  return out;
}

/** 第 attempt 次（从 1 起）降级重发用的上下文形态；超出配置项数取最后一项。 */
export function degradedModeForAttempt(attempt: number): DegradedContextMode {
  const contexts = moderationConfig.degradedContexts as DegradedContextMode[];
  const index = Math.min(Math.max(Math.floor(attempt) - 1, 0), contexts.length - 1);
  return contexts[index];
}

function isRecentEventsMessage(message: PromptMessage): boolean {
  return message.role === 'assistant' && typeof message.content === 'string' && message.content.startsWith(`${RECENT_EVENTS_PREFIX}\n`);
}

/**
 * 用 newEntries 重建「最近事件」消息正文；newEntries 为空时删除该消息。
 * 返回新数组，原数组与原消息对象不改。
 */
export function replaceRecentEventsMessage<T extends PromptMessage>(messages: readonly T[], newEntries: readonly string[]): T[] {
  if (newEntries.length === 0) return messages.filter(message => !isRecentEventsMessage(message));
  return messages.map(message => isRecentEventsMessage(message)
    ? { ...message, content: `${RECENT_EVENTS_PREFIX}\n${newEntries.join('\n')}${RECENT_EVENTS_TAIL}` }
    : message);
}

/** 手动入口：最近 n 条短期记忆换成对应摘要，缺摘要的保持原样。 */
export function summarizeRecentShortTerm(shortTerm: readonly string[], implicitMid: readonly string[], n: number): string[] {
  const start = shortTerm.length - Math.max(Math.floor(n), 0);
  return shortTerm.map((entry, index) => index >= start
    ? alignedSummary(shortTerm, implicitMid, index) ?? entry
    : entry);
}

type MemoryLike = { 短期记忆?: unknown; 隐式中期记忆?: unknown };

const stringsOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

/**
 * 记忆中心手动按钮：按配置 manualSummaryRecentN 把 社交.记忆.短期记忆 最近 N 条换成对应摘要。
 * 返回新的短期记忆数组与实际换掉的条数；只读入参，调用方写回存档（系统.历史.叙事 不经此处）。
 */
export function summarizeMemoryShortTerm(memory: MemoryLike | null | undefined, n: number = moderationConfig.manualSummaryRecentN): { shortTerm: string[]; replaced: number } {
  const before = stringsOf(memory?.短期记忆);
  const shortTerm = summarizeRecentShortTerm(before, stringsOf(memory?.隐式中期记忆), n);
  const replaced = shortTerm.filter((entry, index) => entry !== before[index]).length;
  return { shortTerm, replaced };
}
