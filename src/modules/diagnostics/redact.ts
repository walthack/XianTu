/**
 * 脱敏：写进日志的 detail / msg / stack 一律先过这里。
 * - redactKeys：键名（忽略大小写与 _ - 符号）等于或以其结尾的值整个替换（apiKey、accessToken、Authorization…）
 * - redactPatterns：任何字符串里匹配到的密钥形状（sk-…、Bearer …）替换掉
 * - textKeys：玩家原文类字段只保留前 textChars 个字（默认 0 = 只记长度，不记原文）
 * - 其余字符串截到 detailChars；对象限深 maxDepth、限键数 maxKeys，循环引用安全；永不抛错。
 */
import { diagnosticsConfig, type DiagnosticsConfig } from './config';

export const REDACTED = '[已脱敏]';
const normalizeKey = (key: string): string => key.toLowerCase().replace(/[_\-\s]/g, '');

const patternCache = new Map<string, RegExp | null>();
function compiled(pattern: string): RegExp | null {
  if (!patternCache.has(pattern)) {
    let re: RegExp | null = null;
    try { re = new RegExp(pattern, 'g'); } catch { /* lcq-allow: 非法正则由配置体检拦截，这里降级为不匹配，脱敏不得抛错 */ }
    patternCache.set(pattern, re);
  }
  return patternCache.get(pattern)!;
}

export function scrubString(text: string, cfg: DiagnosticsConfig = diagnosticsConfig(), limit: number = cfg.detailChars): string {
  let out = text;
  for (const pattern of cfg.redactPatterns) {
    const re = compiled(pattern);
    if (re) { re.lastIndex = 0; out = out.replace(re, REDACTED); }
  }
  const chars = [...out];
  return chars.length > limit ? `${chars.slice(0, limit).join('')}…（共${chars.length}字）` : out;
}

const isSecretKey = (key: string, cfg: DiagnosticsConfig): boolean => {
  const k = normalizeKey(key);
  return cfg.redactKeys.some(entry => { const e = normalizeKey(entry); return k === e || k.endsWith(e); });
};
const isTextKey = (key: string, cfg: DiagnosticsConfig): boolean => cfg.textKeys.some(entry => normalizeKey(entry) === normalizeKey(key));

function omitText(text: string, cfg: DiagnosticsConfig): string {
  const chars = [...text];
  if (cfg.textChars <= 0) return `[文本已省略，${chars.length}字]`;
  return chars.length > cfg.textChars ? `${scrubString(chars.slice(0, cfg.textChars).join(''), cfg, cfg.textChars)}…（共${chars.length}字，已截断）` : scrubString(text, cfg, cfg.textChars);
}

export function redact(value: unknown, cfg: DiagnosticsConfig = diagnosticsConfig(), key?: string, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  try {
    if (key !== undefined && isSecretKey(key, cfg)) return REDACTED;
    if (typeof value === 'string') return key !== undefined && isTextKey(key, cfg) ? omitText(value, cfg) : scrubString(value, cfg);
    if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return String(value);
    if (typeof value === 'function' || typeof value === 'symbol') return `[${typeof value}]`;
    if (value instanceof Error) return { name: value.name, message: scrubString(value.message, cfg), ...((value as { code?: unknown }).code !== undefined ? { code: redact((value as { code?: unknown }).code, cfg) } : {}) };
    if (seen.has(value as object)) return '[循环引用]';
    if (depth >= cfg.maxDepth) return Array.isArray(value) ? `[数组，${value.length}项]` : '[对象]';
    seen.add(value as object);
    if (Array.isArray(value)) {
      const items = value.slice(0, cfg.maxKeys).map(item => redact(item, cfg, key !== undefined && isTextKey(key, cfg) ? key : undefined, depth + 1, seen));
      return value.length > cfg.maxKeys ? [...items, `…（共${value.length}项）`] : items;
    }
    const entries = Object.entries(value as Record<string, unknown>);
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries.slice(0, cfg.maxKeys)) out[k] = redact(v, cfg, k, depth + 1, seen);
    if (entries.length > cfg.maxKeys) out['…'] = `共${entries.length}项`;
    return out;
  } catch {
    return '[无法序列化]'; // lcq-allow: 脱敏本身不得抛错（getter 抛错、Proxy 等），降级为占位符
  }
}

export function redactStack(stack: string | undefined, cfg: DiagnosticsConfig = diagnosticsConfig()): string | undefined {
  return typeof stack === 'string' && stack ? scrubString(stack, cfg, cfg.stackChars) : undefined;
}
