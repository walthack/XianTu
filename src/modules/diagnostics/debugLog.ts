/**
 * 调试日志入口：debugLog / debugEnabled，按大类开关（numbers 的 diagnostics.debug.categories，默认全关，可经 tuning.json 热改）。
 * 只打控制台：不进 logStore、不落盘、不进导出与反馈包、不弹 toast、不去重、不带码、不读 diagnostics.enabled。
 * 要排查、要留痕的异常用 logError / logEvent（登记码）；debugLog 不算已处理，catch 里只有它照样过不了 errorCodeGuard。
 * data 过 redact：密钥照 redactKeys / redactPatterns 处理，玩家原文类字段（textKeys）只留长度；看原文走 freeAction.debug.playerTextLog 专用通道。
 * 一律调用时再读配置，不在模块顶层缓存，否则热改不生效。永不抛错。
 */
import { diagnosticsConfig } from './config';
import { DEBUG_CATEGORY_IDS, type DebugCategory } from './debugCategories';
import { redact, scrubString } from './redact';

export type { DebugCategory };
export { DEBUG_CATEGORY_IDS };

type DebugConsole = (...args: unknown[]) => void;
let debugConsole: DebugConsole | null = null;

/** consolePatch 登记原始 console.debug（没有就用 console.log），绕开旧的 consoleDebug 隐藏逻辑；传 null 退回调用当时的 console.debug。 */
export function setDebugConsole(fn: DebugConsole | null): void { debugConsole = fn; }

/** 大类是否打开；用来包住代价高的整段调试代码。 */
export function debugEnabled(category: DebugCategory): boolean {
  try {
    return diagnosticsConfig().debug?.categories?.[category] === true;
  } catch {
    return false; // lcq-allow: 调试开关读取失败按关闭处理，调试通道不得抛错，也不记码
  }
}

/** 大类打开时打一行 `[dbg:<id>] msg` + 脱敏后的 data；data 可以传函数，关着时不求值。永不抛错。 */
export function debugLog(category: DebugCategory, msg: string, data?: unknown | (() => unknown)): void {
  try {
    if (!debugEnabled(category)) return;
    const cfg = diagnosticsConfig();
    const args: unknown[] = [`[dbg:${category}] ${scrubString(String(msg), cfg)}`];
    if (data !== undefined) {
      let value: unknown;
      try { value = typeof data === 'function' ? (data as () => unknown)() : data; }
      // lcq-allow: 调试数据回调出错只降级为占位文本，不影响调用方，也不记码
      catch (error) { value = `[调试数据求值失败：${error instanceof Error ? error.message : String(error)}]`; }
      args.push(redact(value, cfg));
    }
    (debugConsole ?? console.debug)(...args);
  } catch {
    /* lcq-allow: 调试输出自身故障（出口抛错等）不得向外抛，也不记码 */
  }
}
