import { extractFirstJsonSnippet, stripModelThinking } from './jsonExtract';

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
  if (!cleaned || META_INSTRUCTION_RE.test(cleaned)) return '';
  return cleaned;
}

export function sanitizePersistedMemoryArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const single = sanitizePersistedMemoryEntry(value);
    return single ? [single] : [];
  }
  return value.map(sanitizePersistedMemoryEntry).filter(Boolean);
}
