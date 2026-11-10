import type { SaveData } from '@/types/game';
import type { PackTimeline, PackTimelineInsert } from '../contentPacks';
import { timelineConfig } from './timelineAxis';
import { calendarConfig } from '@/utils/time';
import { settleTime } from './actionTime';
import { logEvent } from '../diagnostics/log';
export { timelineConfig, timelineShiftAt, timelineGameYearAt } from './timelineAxis';

/**
 * C01 时间线插入事件（用户 2026-11-10 定）：内容包 timeline.json 声明原创事件挂在哪两个轴序之间、占几年；
 * 插入点之后的原著事件整体顺延这些年。日历只随「已经过了的」插入事件前进，年龄一律由当前年现算。
 * 改年数时只补差额（已过挂点的旧档增加年数补差额；减少不回拨日历），删掉插入事件不回拨。
 */
const yearMinutes = () => { const c = calendarConfig(); return c.daysPerMonth * c.monthsPerYear * 1440; };
const runtimeOf = (save: SaveData): any => (save as any)?.世界?.状态?.剧本模组;
const receiptsOf = (save: SaveData): Record<string, any> => (save as any)?.系统?.扩展?.actionTime?.receipts || {};

function completedIds(runtime: any): string[] {
  return [...(runtime?.completedEventIds || []), ...(runtime?.offscreenResolvedEventIds || [])];
}

/** 本局剧情进度在全局轴上的位置：当前关的轴窗下沿与已完成事件轴序取大。 */
export function timelineProgressAxis(save: SaveData): number {
  const runtime = runtimeOf(save);
  if (!runtime) return -Infinity;
  const done = new Set(completedIds(runtime));
  const seqs = (runtime.events || []).filter((e: any) => done.has(e.id) && Number.isFinite(e.axisSeq)).map((e: any) => e.axisSeq);
  const lo = Number(runtime.axisSeqLo);
  return Math.max(Number.isFinite(lo) ? lo : -Infinity, ...seqs);
}

/** 插入事件在本局是否已经过了（任一条件成立即算）。 */
export function timelineInsertPassed(save: SaveData, insert: PackTimelineInsert, reachedAxisSeq = -Infinity): boolean {
  const runtime = runtimeOf(save);
  if (!runtime) return false;
  const p = insert.passedWhen;
  const minAxis = p?.minAxisSeq ?? insert.anchor.beforeAxisSeq;
  if (Math.max(timelineProgressAxis(save), reachedAxisSeq) >= minAxis) return true;
  if (p?.anyEventDone?.some(id => completedIds(runtime).includes(id))) return true;
  if (p?.sliceEntered && runtime.openWorldSlice?.sliceId === p.sliceEntered) return true;
  return !!insert.trigger?.routeId && (runtime.openWorldSlice?.travelReceipts || []).some((r: any) => r.routeId === insert.trigger!.routeId);
}

const receiptPrefix = (insert: PackTimelineInsert) => `author:timeline:${insert.id}:`;

/** 本局已为该插入事件拨过的年数：时间线回执累计，加上旧挂点（supersedes）已跳过的年数。 */
export function timelineAppliedYears(save: SaveData, insert: PackTimelineInsert): number {
  const receipts = receiptsOf(save), year = yearMinutes();
  let minutes = 0;
  for (const [id, r] of Object.entries(receipts)) if (id.startsWith(receiptPrefix(insert))) minutes += Number(r?.minutes) || 0;
  for (const old of insert.supersedes || []) minutes += Number(receipts[`author:${old}`]?.minutes) || 0;
  return Math.floor(minutes / year);
}

export interface TimelineApplyResult { insertId: string; years: number; fromYear: number; toYear: number }

/**
 * 把已经过了的插入事件补拨到日历上（只增不减）。silent=false 时排队过渡正文（排在本回合正文之前），
 * silent=true 用于开局、切关与读档：只补年数，不重播过场。reachedAxisSeq：正在结算的原著事件轴序（该事件之前的插入事件算已过）。
 */
export function applyTimelineInserts(save: SaveData, options: { silent?: boolean; timeline?: PackTimeline; reachedAxisSeq?: number } = {}): TimelineApplyResult[] {
  const runtime = runtimeOf(save), meta = (save as any)?.元数据;
  if (!runtime || !meta?.时间) return [];
  const timeline = options.timeline || timelineConfig();
  const out: TimelineApplyResult[] = [];
  for (const insert of timeline.inserts) {
    if (!timelineInsertPassed(save, insert, options.reachedAxisSeq)) continue;
    const applied = timelineAppliedYears(save, insert);
    if (insert.years <= applied) continue;
    const fromYear = Number(meta.时间.年);
    settleTime(save, `${receiptPrefix(insert)}y${insert.years}`, (insert.years - applied) * yearMinutes(), 'author');
    const result = { insertId: insert.id, years: insert.years - applied, fromYear, toYear: Number(meta.时间.年) };
    out.push(result);
    if (options.silent) {
      logEvent({ code: 'LCQ-SAV-063', detail: result });
      continue;
    }
    runtime.authorTimeConsumedAtTurn = runtime.worldTurn;
    if (insert.interludeTextKey) runtime.timeSkipInterlude = { eventId: insert.id, actionId: 'timeline', textKey: insert.interludeTextKey, years: insert.years, placement: 'before', ...(insert.yearsPath ? { yearsPath: insert.yearsPath } : {}) };
  }
  return out;
}
