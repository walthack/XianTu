import { extractFirstJsonSnippet, stripModelThinking } from './jsonExtract';
import { stripInternalNarrativeControlLeaks } from './textSanitizer';

const META_INSTRUCTION_RE = /^(?:用户要求我|用户希望我|我的任务是|作为(?:AI|助手|模型)|以下是(?:对|根据).{0,20}(?:记忆|内容)的总结|请(?:生成|输出|总结)|需要(?:生成|输出|总结)).{0,80}/i;

/**
 * 清理旧存档中曾误写入记忆的模型思维链、JSON 包装与任务说明。
 * 只处理明确的模型产物；普通剧情文本原样保留。
 */
export function sanitizePersistedMemoryEntry(value: unknown): string {
  if (typeof value !== 'string') return '';
  let cleaned = stripModelThinking(value)
    .replace(/<\/input>/gi, '')
    .trim();
  if (!cleaned) return '';

  const jsonSnippet = extractFirstJsonSnippet(cleaned);
  if (jsonSnippet) {
    try {
      const parsed = JSON.parse(jsonSnippet) as Record<string, unknown>;
      const text = parsed.text ?? parsed.summary ?? parsed.总结;
      if (typeof text === 'string' && text.trim()) cleaned = stripModelThinking(text).trim();
    } catch {
      // 非严格 JSON 留给下方保守清理，不凭猜测改写剧情。
    }
  }

  cleaned = cleaned
    .replace(/^```(?:json|text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  cleaned = stripInternalNarrativeControlLeaks(cleaned);
  if (!cleaned || META_INSTRUCTION_RE.test(cleaned)) return '';
  return cleaned;
}

const TIME_PREFIX_RE = /^【(?:仙道|仙历|未知时间)/;

/**
 * 逐轮正文写入短期记忆的统一入口：先过持久化清洗（剥思维链/JSON 壳/围栏），
 * 再拼时间前缀；清洗后的文本若自带时间前缀则不重复叠加（防【10:30】【09:45】双戳）。
 * 返回空串表示该条不应入库。（内测台账 #11：逐轮路径曾绕过清洗落入 {"text": 原壳）
 */
export function composeShortTermMemoryEntry(timePrefix: string, rawText: unknown): string {
  const cleaned = sanitizePersistedMemoryEntry(rawText);
  if (!cleaned) return '';
  return TIME_PREFIX_RE.test(cleaned) ? cleaned : `${timePrefix}${cleaned}`;
}

export function sanitizePersistedMemoryArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const single = sanitizePersistedMemoryEntry(value);
    return single ? [single] : [];
  }
  return value.map(sanitizePersistedMemoryEntry).filter(Boolean);
}
