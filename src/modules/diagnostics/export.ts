/** 日志导出：整份（含磁盘里旧会话的记录）打成 JSON，经 Blob 触发浏览器下载。内容已在写入时脱敏。 */
import { SESSION_ID, logError } from './log';
import { logStore, type LogEntry } from './store';

export interface LogExport { app: string; exportedAt: string; sessionId: string; count: number; entries: LogEntry[] }

const APP_NAME = 'XianTu';

export async function buildLogExport(): Promise<LogExport> {
  const entries = (await logStore.all()).map(({ seq: _seq, ...entry }) => entry);
  return { app: APP_NAME, exportedAt: new Date().toISOString(), sessionId: SESSION_ID, count: entries.length, entries };
}

export const exportFileName = (at: Date = new Date()): string => `lcq-log-${at.toISOString().replace(/[:.]/g, '-')}.json`;

/** 触发下载；成功返回 true，失败记 LCQ-UI-003 并返回 false（不抛错）。 */
export async function downloadLogs(): Promise<boolean> {
  try {
    await logStore.flush();
    const blob = new Blob([JSON.stringify(await buildLogExport(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = exportFileName();
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch (error) {
    logError('LCQ-UI-003', error);
    return false;
  }
}
