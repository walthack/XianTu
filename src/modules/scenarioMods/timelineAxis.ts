import { CONTENT_PACKS, type PackTimeline } from '../contentPacks';

/** C01 时间线的纯轴序换算（不碰存档）：原著事件的游戏年＝原著当下年＋该点之前插入事件的年数。 */
export const timelineConfig = (): PackTimeline => CONTENT_PACKS.timeline;

/** 轴序 axisSeq 之前（含挂在它前面的）所有插入事件的年数之和。 */
export function timelineShiftAt(axisSeq: number, timeline: PackTimeline = timelineConfig()): number {
  if (!Number.isFinite(axisSeq)) return 0;
  return timeline.inserts.filter(x => x.anchor.beforeAxisSeq <= axisSeq).reduce((sum, x) => sum + x.years, 0);
}

/** 原著轴序在本局时间线上的游戏年：原著当下年＋该点之前插入事件的年数。 */
export function timelineGameYearAt(axisSeq: number, timeline: PackTimeline = timelineConfig()): number {
  return timeline.canonPresentYear + timelineShiftAt(axisSeq, timeline);
}
