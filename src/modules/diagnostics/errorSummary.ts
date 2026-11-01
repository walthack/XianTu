/**
 * 错误码日志的 detail 摘要辅助：把异常压成 { name, message（截断）, stack 第一行 }，把列表截成有限条数。
 * 只给 catch / 失败分支里追加的 logEvent 拼 detail 用；全部永不抛错（getter 抛错、Proxy 等降级为占位）。
 * 不记完整提示词或消息体：调用方只传异常与少量定位字段（id、槽位、阶段），列表经 summarizeList 截断。
 */

export const ERROR_MESSAGE_CHARS = 300;

export interface ErrorSummary { name: string; message: string; stack?: string; code?: string }

const clip = (text: string, limit: number): string => {
  const chars = [...text];
  return chars.length > limit ? `${chars.slice(0, limit).join('')}…（共${chars.length}字）` : text;
};

/**
 * 异常摘要。omitMessage：异常信息可能夹带原文（如 JSON.parse 的报错会引用被解析的配置片段）时只记 name。
 */
export function summarizeError(error: unknown, options: { omitMessage?: boolean } = {}): ErrorSummary {
  try {
    if (error instanceof Error || (error !== null && typeof error === 'object' && 'message' in (error as object))) {
      const err = error as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown };
      const name = typeof err.name === 'string' && err.name ? err.name : 'Error';
      // code：业务错误码（如 generationError.code、HTTP 状态），只收短字符串或数字。
      const code = (typeof err.code === 'string' && err.code) || typeof err.code === 'number' ? { code: clip(String(err.code), 80) } : {};
      if (options.omitMessage) return { name, message: '[已省略]', ...code };
      const message = clip(String(err.message ?? ''), ERROR_MESSAGE_CHARS);
      const firstLine = typeof err.stack === 'string' ? err.stack.split('\n')[0]?.trim() : '';
      return firstLine ? { name, message, stack: clip(firstLine, ERROR_MESSAGE_CHARS), ...code } : { name, message, ...code };
    }
    if (options.omitMessage) return { name: typeof error, message: '[已省略]' };
    return { name: typeof error, message: clip(String(error), ERROR_MESSAGE_CHARS) };
  } catch {
    return { name: 'Unknown', message: '[无法读取异常]' }; // lcq-allow: 摘要本身不得抛错，降级为占位
  }
}

const itemText = (item: unknown): string => {
  try { return JSON.stringify(item) ?? String(item); } catch { return String(item); /* lcq-allow: 无法序列化的条目退回 String() */ }
};

/** 列表摘要：最多 maxItems 条、每条最多 maxChars 字，附总条数。非数组按单条处理。 */
export function summarizeList(list: unknown, maxItems = 8, maxChars = 200): { total: number; items: string[] } {
  try {
    const arr = Array.isArray(list) ? list : list === undefined || list === null ? [] : [list];
    const items = arr.slice(0, maxItems).map(item => clip(typeof item === 'string' ? item : itemText(item), maxChars));
    return { total: arr.length, items };
  } catch {
    return { total: 0, items: [] }; // lcq-allow: 摘要本身不得抛错
  }
}

/** 从对象上安全取定位 id：按 keys 顺序取第一个非空的字符串/数字值，取不到返回 undefined。 */
export function pickId(value: unknown, ...keys: string[]): string | undefined {
  try {
    if (value === null || typeof value !== 'object') return undefined;
    for (const key of keys) {
      const v = (value as Record<string, unknown>)[key];
      if ((typeof v === 'string' && v) || typeof v === 'number') return clip(String(v), 120);
    }
    return undefined;
  } catch {
    return undefined; // lcq-allow: 读 id 失败（getter 抛错）只是少一个定位字段
  }
}
