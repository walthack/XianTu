/**
 * 诊断日志入口：logEvent / logError。写日志永不抛错、不改调用方行为（观察用）。
 * 字段：ts、level、code、module、sessionId、turnId、requestId?、msg、detail（脱敏）、stack?。
 * 码不在 codes.ts 里 → 落到 LCQ-SYS-000「未登记」，原码记进 detail.originalCode。
 * 有意不记玩家原文：detail 里 textKeys 下的字符串只留长度（textChars=0），见 redact.ts；也不要与 playerTextDebug 混用。
 */
import { ERROR_CODES, UNREGISTERED_CODE, isRegisteredCode, specOf } from './codes';
import { diagnosticsConfig, levelAtLeast, type LogLevel } from './config';
import { redact, redactStack, scrubString } from './redact';
import { logStore, onStoreDegrade, type LogEntry } from './store';

export interface LogContext { sessionId?: string; turnId?: string | null; requestId?: string }
export interface LogEventInput {
  /** 缺省取码表里的默认级别。 */
  level?: LogLevel;
  code: string;
  /** 缺省取码表里的模块。 */
  module?: string;
  detail?: unknown;
  /** 原始异常（取 message / stack，脱敏后落盘；控制台会原样打出便于开发排查）。 */
  cause?: unknown;
  /** 覆盖 msg（缺省 = 码表含义 + 异常信息）。 */
  msg?: string;
  ctx?: LogContext;
  /** false = 不再往控制台打（来源本身就是 console，已经打过了）。 */
  echo?: boolean;
}

export const SESSION_ID = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

let contextProvider: (() => LogContext) | null = null;
/** 请求生命周期诊断登记当前 turnId 的读取方式（避免日志模块反向依赖 services）。 */
export const setLogContextProvider = (fn: (() => LogContext) | null): void => { contextProvider = fn; };

type ToastSink = (level: LogLevel, message: string) => void;
let toastSink: ToastSink | null = null;
export const setToastSink = (fn: ToastSink | null): void => { toastSink = fn; };

let emitting = false;
/** 日志自己正在往控制台 / toast 输出：consolePatch 据此跳过，避免递归记录。 */
export const isEmittingLog = (): boolean => emitting;

const repeats = new Map<string, { at: number; suppressed: number }>();
const toastedAt = new Map<string, number>();
const onceKeys = new Set<string>();

/** 仅供测试：清去重 / 单次记录状态与内存缓冲。 */
export async function resetLogState(): Promise<void> {
  repeats.clear(); toastedAt.clear(); onceKeys.clear();
  await logStore.clear();
}

const toText = (value: unknown): string => {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  try { return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value); } catch { return String(value); } // lcq-allow: 无法序列化的异常值退回 String()，日志不得抛错
};

function printConsole(entry: LogEntry, cause: unknown): void {
  emitting = true;
  try {
    const line = `[${entry.code}] ${entry.msg}`;
    const args: unknown[] = [line];
    if (entry.detail !== undefined) args.push(entry.detail);
    if (cause !== undefined) args.push(cause);
    if (entry.level === 'error') console.error(...args);
    else if (entry.level === 'warn') console.warn(...args);
    else if (entry.level === 'info') console.info(...args);
    else console.debug(...args);
  } finally { emitting = false; }
}

function maybeToast(entry: LogEntry): void {
  const cfg = diagnosticsConfig().toast;
  if (!toastSink || !cfg.enabled || !specOf(entry.code).toast || !levelAtLeast(entry.level, cfg.minLevel)) return;
  const now = Date.now(), last = toastedAt.get(entry.code);
  if (last !== undefined && now - last < cfg.dedupeMs) return;
  toastedAt.set(entry.code, now);
  emitting = true;
  try { toastSink(entry.level, `${specOf(entry.code).meaning}（${entry.code}）`); } finally { emitting = false; }
}

export function logEvent(input: LogEventInput): LogEntry | null {
  try {
    const cfg = diagnosticsConfig();
    if (!cfg.enabled) return null;
    const registered = isRegisteredCode(input.code);
    const code = registered ? input.code : UNREGISTERED_CODE;
    const base = ERROR_CODES[code as keyof typeof ERROR_CODES];
    const level = input.level ?? base.level;
    if (!levelAtLeast(level, cfg.minLevel)) return null;

    const cause = input.cause;
    const causeText = cause === undefined ? '' : scrubString(toText(cause), cfg);
    const msg = scrubString(input.msg ?? (causeText ? `${base.meaning}：${causeText}` : base.meaning), cfg, cfg.detailChars);
    let detail = input.detail === undefined ? undefined : redact(input.detail, cfg);
    if (!registered) {
      const extra = { originalCode: scrubString(String(input.code), cfg, cfg.detailChars) };
      detail = detail && typeof detail === 'object' && !Array.isArray(detail) ? { ...extra, ...(detail as object) } : detail === undefined ? extra : { ...extra, detail };
    }

    // 同样的事件（码、模块、消息、detail 全同）在 repeatMs 内只记第一条，后面计数，下一条带出 suppressedBefore。
    const module = input.module ?? base.module, now = Date.now();
    const key = `${code}|${module}|${msg}|${(() => { try { return JSON.stringify(detail) ?? ''; } catch { return ''; } })()}`; // lcq-allow: 去重键，序列化失败按空串
    const seen = repeats.get(key);
    if (seen && now - seen.at < cfg.repeatMs) { seen.suppressed++; return null; }
    repeats.delete(key);
    repeats.set(key, { at: now, suppressed: 0 });
    while (repeats.size > cfg.repeatKeys) repeats.delete(repeats.keys().next().value!);
    if (seen?.suppressed) detail = detail && typeof detail === 'object' && !Array.isArray(detail) ? { ...(detail as object), suppressedBefore: seen.suppressed } : { detail, suppressedBefore: seen.suppressed };

    const ctx = { ...(contextProvider?.() ?? {}), ...(input.ctx ?? {}) };
    const entry: LogEntry = {
      ts: new Date(now).toISOString(), level, code, module,
      sessionId: ctx.sessionId ?? SESSION_ID,
      turnId: ctx.turnId ?? null,
      ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
      msg,
      ...(detail !== undefined ? { detail } : {}),
      ...(cause instanceof Error && redactStack(cause.stack, cfg) ? { stack: redactStack(cause.stack, cfg) } : {}),
    };
    logStore.add(entry, levelAtLeast(level, cfg.persistLevel));
    if (input.echo !== false && levelAtLeast(level, cfg.consoleLevel)) printConsole(entry, cause);
    maybeToast(entry);
    return entry;
  } catch {
    return null; // lcq-allow: 日志自身故障不得向外抛（也不能再记日志，会递归）
  }
}

/** 记一个异常：码不变，级别与模块取码表默认，可在 extra 里覆盖并附 detail 与 ctx 字段。 */
export function logError(code: string, err: unknown, extra: LogContext & { level?: LogLevel; module?: string; detail?: unknown } = {}): LogEntry | null {
  const { level, module, detail, ...ctx } = extra;
  return logEvent({ code, level, module, detail, cause: err, ctx });
}

/** 同一 key 本会话只记一次（远程存档降级这类“每次请求都会重复失败”的场景）。 */
export function logEventOnce(key: string, input: LogEventInput): LogEntry | null {
  if (onceKeys.has(key)) return null;
  onceKeys.add(key);
  return logEvent(input);
}

/** consolePatch 用：console.error / console.warn 捕获为 LCQ-SYS-000（未登记）。 */
export function logConsole(level: 'warn' | 'error', args: unknown[]): void {
  if (emitting) return;
  const first = args.find(arg => typeof arg === 'string') as string | undefined;
  const cause = args.find(arg => arg instanceof Error);
  logEvent({ level, code: UNREGISTERED_CODE, module: 'console', echo: false, detail: { args }, cause: cause as Error | undefined, msg: first ? `${ERROR_CODES[UNREGISTERED_CODE].meaning}：${first}` : undefined });
}

onStoreDegrade((reason, to) => { logEvent({ code: 'LCQ-SYS-001', detail: { to }, cause: reason }); });
