/**
 * 新界面窄屏摆法（?ui=new 且窗口 <1024）用的纯函数。
 */
import { SEGMENT_MAX_LEN } from '@/utils/narrativeSegments';

/**
 * 字框一段最多几个字：电脑宽（≥1024）沿用 SEGMENT_MAX_LEN；更窄时随宽度变，
 * 390 宽约 85 字、430 宽约 93 字，最少 60、最多不超过电脑宽的上限。
 */
export function segmentMaxLenForWidth(width: number, minWide = 1024): number {
  if (!Number.isFinite(width) || width >= minWide) return SEGMENT_MAX_LEN;
  return Math.min(SEGMENT_MAX_LEN, Math.max(60, Math.round(width / 4.6)));
}

/** 底行时间：窄屏只留时分（「仙道200年1月1日 08:15」→「08:15」；「今日 08:15」→「今日 08:15」原样）。 */
export function shortGameTime(full: string): string {
  const m = /^(.*\d日)\s+(\d{1,2}:\d{2})$/.exec(String(full || '').trim());
  return m ? m[2] : String(full || '');
}
