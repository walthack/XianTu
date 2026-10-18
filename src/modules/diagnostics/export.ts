/** 日志导出：整份（含磁盘里旧会话的记录）打成 JSON，经 Blob 触发浏览器下载。内容已在写入时脱敏。 */
import { SESSION_ID, logError } from './log';
import { logStore, type LogEntry } from './store';
import { getBuildInfo } from './buildInfo';
import { collectStats } from './statsProviders';

export interface LogExport { app: string; version: string; buildId: string; contentPackVersion: string; exportedAt: string; sessionId: string; count: number; /** 各层登记的聚合统计（statsProviders）；perf = 回合/模型耗时（p50/p95 等，见 turnTelemetry）。 */ stats: Record<string, unknown>; entries: LogEntry[] }

const APP_NAME = 'XianTu';

export async function buildLogExport(): Promise<LogExport> {
  const entries = (await logStore.all()).map(({ seq: _seq, ...entry }) => entry);
  const { version, buildId, contentPackVersion } = getBuildInfo();
  return { app: APP_NAME, version, buildId, contentPackVersion, exportedAt: new Date().toISOString(), sessionId: SESSION_ID, count: entries.length, stats: collectStats(), entries };
}

export const exportFileName = (at: Date = new Date()): string => `lcq-log-${at.toISOString().replace(/[:.]/g, '-')}.json`;

/** 经临时 <a download> 触发浏览器下载（日志导出与反馈包共用）。 */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = fileName;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** 触发下载；成功返回 true，失败记 LCQ-UI-003 并返回 false（不抛错）。 */
export async function downloadLogs(): Promise<boolean> {
  try {
    await logStore.flush();
    saveBlob(new Blob([JSON.stringify(await buildLogExport(), null, 2)], { type: 'application/json' }), exportFileName());
    return true;
  } catch (error) {
    logError('LCQ-UI-003', error);
    return false;
  }
}
