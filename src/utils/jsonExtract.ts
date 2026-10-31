export function stripModelThinking(text: string): string {
  return String(text || '')
    .replace(/<(?:ant[-_]?)?(?:think|thinking)>[\s\S]*?<\/(?:ant[-_]?)?(?:think|thinking)>/gi, '')
    .replace(/<(?:analysis|reasoning|thought)>[\s\S]*?<\/(?:analysis|reasoning|thought)>/gi, '')
    .replace(/<(?:ant[-_]?)?(?:think|thinking)>[\s\S]*/gi, '')
    .replace(/<(?:analysis|reasoning|thought)>[\s\S]*/gi, '')
    .trim();
}

export function extractFirstJsonSnippet(text: string): string | null {
  if (!text) return null;

  // 1) Prefer fenced code blocks (```json ... ```)
  const fenceRe = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  for (const match of text.matchAll(fenceRe)) {
    const candidate = (match[1] || '').trim();
    if (!candidate) continue;
    if (candidate.includes('{') || candidate.includes('[')) return candidate;
  }

  // 2) Fallback: find first balanced {...} or [...]
  const starts: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{' || ch === '[') starts.push(i);
  }

  for (const startIndex of starts) {
    const snippet = extractBalancedJson(text, startIndex);
    if (snippet) return snippet;
  }

  return null;
}

function extractBalancedJson(
  text: string,
  startIndex: number
): string | null {
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') {
      if (stack.length === 0 || stack[stack.length - 1] !== ch) return null;
      stack.pop();
      if (stack.length === 0) {
        return text.slice(startIndex, i + 1).trim();
      }
    }
  }

  return null;
}

/**
 * JSON 片段之外的正文：去掉被解析的那段 JSON（含代码围栏）后剩下的文字。
 * 模型把叙事写在 JSON 外、JSON 里只给指令时，用它保住叙事。
 */
export function narrativeOutsideJson(text: string): string {
  const cleaned = stripModelThinking(text);
  if (!cleaned) return '';
  let rest: string | null = null;
  const fenceRe = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  for (const match of cleaned.matchAll(fenceRe)) {
    const candidate = (match[1] || '').trim();
    if (!candidate || !(candidate.includes('{') || candidate.includes('['))) continue;
    rest = cleaned.slice(0, match.index) + '\n' + cleaned.slice((match.index || 0) + match[0].length);
    break;
  }
  if (rest === null) {
    for (let i = 0; i < cleaned.length && rest === null; i++) {
      if (cleaned[i] !== '{' && cleaned[i] !== '[') continue;
      const snippet = extractBalancedJson(cleaned, i);
      if (snippet) rest = cleaned.slice(0, i) + '\n' + cleaned.slice(i + snippet.length);
    }
  }
  if (rest === null) return '';
  return rest.replace(/```(?:json)?/gi, '').replace(/\n{3,}/g, '\n\n').trim();
}

export function parseJsonFromText<T = unknown>(text: string): T {
  const snippet = extractFirstJsonSnippet(text);
  if (!snippet) {
    throw new Error('未找到可解析的 JSON 片段');
  }
  return JSON.parse(snippet) as T;
}

/**
 * 智能JSON解析 - 自动适配强JSON模式和普通文本模式
 *
 * @param text - AI返回的文本内容
 * @param forceJsonMode - 是否启用了强JSON模式
 * @returns 解析后的JSON对象
 *
 * 使用场景:
 * - forceJsonMode=true: 直接解析整个文本为JSON(DeepSeek强JSON格式)
 * - forceJsonMode=false: 从文本中提取JSON片段再解析(传统模式)
 */
export function parseJsonSmart<T = unknown>(text: string, forceJsonMode: boolean = false): T {
  const cleanedText = stripModelThinking(text);
  if (!cleanedText) {
    throw new Error('AI返回内容为空');
  }

  // 强JSON模式: 直接解析整个文本
  if (forceJsonMode) {
    try {
      return JSON.parse(cleanedText) as T;
    } catch (error) {
      // 如果直接解析失败,尝试提取JSON片段(容错处理)
      console.warn('[JSON解析] 强JSON模式解析失败,尝试提取JSON片段:', error);
      const snippet = extractFirstJsonSnippet(cleanedText);
      if (!snippet) {
        throw new Error('强JSON模式下解析失败,且未找到可提取的JSON片段');
      }
      return JSON.parse(snippet) as T;
    }
  }

  // 普通模式: 提取JSON片段
  return parseJsonFromText<T>(cleanedText);
}
