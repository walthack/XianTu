/**
 * 全局Console补丁
 *
 * 功能:
 * - 根据调试模式控制console输出
 * - 非调试模式下隐藏log/warn/info等输出
 * - error级别始终显示
 * - console.error / console.warn 不论是否显示，都另记一条诊断日志（LCQ-SYS-000「未登记」，见 src/modules/diagnostics）
 * - window error / unhandledrejection 记入诊断日志（LCQ-UI-001 / LCQ-UI-002）
 * - 带玩家提示标记的错误码经 toast 弹出
 *
 * 被以下文件引用:
 * - src/main.ts (全局初始化)
 */

import { debugLogger } from '@/utils/debug';
import { toast } from '@/utils/toast';
import { logConsole, logError, setToastSink } from '@/modules/diagnostics/log';

type ConsoleMethod = (...args: any[]) => void;

const original = {
  log: console.log.bind(console) as ConsoleMethod,
  warn: console.warn.bind(console) as ConsoleMethod,
  info: console.info.bind(console) as ConsoleMethod,
  debug: (console as any).debug ? (console as any).debug.bind(console) as ConsoleMethod : undefined,
  table: console.table ? console.table.bind(console) as ConsoleMethod : undefined,
  group: console.group ? console.group.bind(console) as ConsoleMethod : undefined,
  groupCollapsed: (console as any).groupCollapsed ? (console as any).groupCollapsed.bind(console) as ConsoleMethod : undefined,
  groupEnd: console.groupEnd ? console.groupEnd.bind(console) as ConsoleMethod : undefined,
  error: console.error.bind(console) as ConsoleMethod,
};

// Helper guards
const canConsoleDebug = () => debugLogger.isConsoleDebugEnabled();
const isDebugMode = () => debugLogger.isDebugMode();

// Patch non-error outputs
console.log = ((...args: any[]) => {
  if (canConsoleDebug()) original.log(...args);
}) as ConsoleMethod;

console.warn = ((...args: any[]) => {
  if (canConsoleDebug() || args[0] === '[DEMO_MODULE_ONLY]') original.warn(...args);
  logConsole('warn', args);
}) as ConsoleMethod;

console.info = ((...args: any[]) => {
  if (isDebugMode()) original.info(...args);
}) as ConsoleMethod;

if (original.debug) {
  (console as any).debug = ((...args: any[]) => {
    if (canConsoleDebug()) (original.debug as ConsoleMethod)(...args);
  }) as ConsoleMethod;
}

if (original.table) {
  console.table = ((...args: any[]) => {
    if (canConsoleDebug()) (original.table as ConsoleMethod)(...args);
  }) as ConsoleMethod;
}

if (original.group) {
  console.group = ((...args: any[]) => {
    if (canConsoleDebug()) (original.group as ConsoleMethod)(...args);
  }) as ConsoleMethod;
}

if (original.groupCollapsed) {
  (console as any).groupCollapsed = ((...args: any[]) => {
    if (canConsoleDebug()) (original.groupCollapsed as ConsoleMethod)(...args);
  }) as ConsoleMethod;
}

if (original.groupEnd) {
  console.groupEnd = ((...args: any[]) => {
    if (canConsoleDebug()) (original.groupEnd as ConsoleMethod)(...args);
  }) as ConsoleMethod;
}

// console.error 始终原样显示（不隐藏真实错误），只是多记一条诊断日志。
console.error = ((...args: any[]) => {
  original.error(...args);
  logConsole('error', args);
}) as ConsoleMethod;

setToastSink((level, message) => { if (level === 'error') toast.error(message); else toast.warning(message); });

let globalHandlersInstalled = false;
/** window.onerror / unhandledrejection 进诊断日志；不拦截、不 preventDefault，浏览器照常在控制台报。 */
export function installGlobalErrorHandlers(target: Window | undefined = typeof window === 'undefined' ? undefined : window): void {
  if (!target || typeof target.addEventListener !== 'function' || globalHandlersInstalled) return;
  globalHandlersInstalled = true;
  target.addEventListener('error', (event: ErrorEvent) => {
    // 没有 error / message 的（资源加载失败等）不记；ResizeObserver 的循环告警是浏览器已知的良性噪声。
    if (!(event.error || event.message) || event.message?.startsWith('ResizeObserver loop')) return;
    logError('LCQ-UI-001', event.error ?? event.message, { detail: { file: event.filename, line: event.lineno, col: event.colno } });
  });
  target.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => { logError('LCQ-UI-002', event.reason); });
}
installGlobalErrorHandlers();

