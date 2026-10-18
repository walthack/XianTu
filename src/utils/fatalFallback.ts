/**
 * 顶层兜底界面：原生 DOM + 内联样式，不依赖 Vue 渲染、外部 CSS。
 * 启动阶段（Vue 还没挂载）或运行中崩溃时都能显示；同一页面只渲染一次。
 * 被 src/main.ts 引用；doc / 导出 / 重新载入都可注入，便于测试。
 */
import { downloadLogs } from '@/modules/diagnostics/export';
import { logError } from '@/modules/diagnostics/log';

export const FATAL_FALLBACK_ID = 'lcq-fatal-fallback';

/** 兜底界面用到的最小 DOM 能力（真 Document 满足；测试可用假对象）。 */
export interface FallbackDoc {
  body: FallbackNode | null;
  getElementById(id: string): unknown;
  createElement(tag: string): FallbackNode;
}
export interface FallbackNode {
  id: string;
  textContent: string | null;
  disabled?: boolean;
  type?: string;
  style: { cssText: string };
  onclick: ((ev?: unknown) => unknown) | null;
  appendChild(child: FallbackNode): unknown;
}

export interface FatalFallbackOptions {
  /** 错误码，显示在界面上方便玩家反馈。 */
  code?: string;
  doc?: FallbackDoc;
  exportLogs?: () => Promise<boolean> | boolean;
  reload?: () => void;
}

const OVERLAY_STYLE = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#14110f;color:#e8e0d0;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:16px;box-sizing:border-box;';
const CARD_STYLE = 'max-width:480px;width:100%;background:#211c18;border:1px solid #5a4a36;border-radius:8px;padding:24px;box-sizing:border-box;line-height:1.7;';
const BUTTON_STYLE = 'margin:12px 12px 0 0;padding:8px 18px;font-size:15px;color:#e8e0d0;background:#3a2f22;border:1px solid #8a6f48;border-radius:4px;cursor:pointer;';

/** 渲染兜底界面；已存在或没有可挂载的 body 时返回 false（不重复渲染）。 */
export function showFatalFallback(options: FatalFallbackOptions = {}): boolean {
  const doc = options.doc ?? (typeof document === 'undefined' ? undefined : (document as unknown as FallbackDoc));
  if (!doc?.body || doc.getElementById(FATAL_FALLBACK_ID)) return false;
  const exportLogs = options.exportLogs ?? downloadLogs;
  const reload = options.reload ?? (() => location.reload());

  const el = (tag: string, text: string | null, style: string): FallbackNode => {
    const node = doc.createElement(tag);
    node.textContent = text;
    node.style.cssText = style;
    return node;
  };
  const overlay = el('div', null, OVERLAY_STYLE);
  overlay.id = FATAL_FALLBACK_ID;
  const card = el('div', null, CARD_STYLE);
  const status = el('div', '', 'margin-top:12px;font-size:13px;color:#b9a888;min-height:20px;');

  const exportButton = el('button', '导出日志', BUTTON_STYLE);
  exportButton.type = 'button';
  exportButton.onclick = async () => {
    exportButton.disabled = true;
    status.textContent = '正在导出…';
    let ok = false;
    try { ok = await exportLogs(); } catch { ok = false; /* lcq-allow: 导出失败只在界面提示，downloadLogs 自身已记 LCQ-UI-003 */ }
    status.textContent = ok ? '日志已导出，反馈问题时请附上该文件。' : '日志导出失败，请换个浏览器再试，或直接重新载入。';
    exportButton.disabled = false;
  };
  const reloadButton = el('button', '重新载入', BUTTON_STYLE);
  reloadButton.type = 'button';
  reloadButton.onclick = () => { reload(); };

  card.appendChild(el('div', '出错了', 'font-size:20px;font-weight:bold;color:#e8c987;margin-bottom:8px;'));
  card.appendChild(el('div', '游戏遇到了无法继续的问题。你的存档不会因此被清除或改写；建议先点「导出日志」留存，再点「重新载入」重试。', 'font-size:15px;'));
  if (options.code) card.appendChild(el('div', `错误码：${options.code}`, 'margin-top:8px;font-size:13px;color:#b9a888;'));
  card.appendChild(exportButton);
  card.appendChild(reloadButton);
  card.appendChild(status);
  overlay.appendChild(card);
  doc.body.appendChild(overlay);
  return true;
}

/** 启动阶段失败：记 LCQ-UI-005 并显示兜底界面（界面已存在则不重复渲染）。 */
export function failStartup(stage: string, error: unknown, options: FatalFallbackOptions = {}): void {
  logError('LCQ-UI-005', error, { detail: { stage } });
  showFatalFallback({ code: 'LCQ-UI-005', ...options });
}

/**
 * app.config.errorHandler：记 LCQ-UI-004（玩家提示由诊断 toast 按码限频），不显示兜底界面、不抛错。
 * Vue 设了 errorHandler 后不再自己往控制台报错；日志因去重/关闭而没打出时在这里补一条，保证开发期控制台不丢。
 */
export function handleVueError(error: unknown, instance?: unknown, info?: string): void {
  const options = (instance as { $options?: { name?: string; __name?: string } } | null | undefined)?.$options;
  const entry = logError('LCQ-UI-004', error, { detail: { info, component: options?.name ?? options?.__name } });
  if (!entry) console.error('[Vue]', error, info);
}
