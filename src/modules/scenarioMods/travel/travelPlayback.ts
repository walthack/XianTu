/**
 * 地图「赶路过程」回放（地图移动方案第一步，用户 2026-11-16 09:05 批）：纯表现，结算早已落账（先落账、存档，再演）。
 * 纯函数：不碰 DOM、不读存档全局。坐标与地图地点坐标同口径（游戏坐标，entity-catalog/locations.json 的 coordinates，0–10000）。
 * 时长几个数是表现常量，有意不进 mod-kit 配置。
 */
export interface TravelPoint { x: number; y: number }
/** 天数：与结算同源（mapTravel.mapRoutePlaybackDays）。0＝片刻；'several'＝「数日」不写具体天数。 */
export type TravelPlaybackDays = number | 'several';
export interface TravelPlaybackInput { from: TravelPoint; to: TravelPoint; days: TravelPlaybackDays; via?: readonly TravelPoint[]; destinationName: string }
export interface TravelPlaybackPlan { path: TravelPoint[]; lengths: number[]; durationMs: number; days: TravelPlaybackDays; destinationName: string }
export interface TravelPlaybackFrame { point: TravelPoint; traveled: TravelPoint[]; dayLine: string; arrived: boolean }

/** 片刻的路约 1 秒。 */
export const MOMENT_DURATION_MS = 1000;
/** 1–5 日（及「数日」）约 2.5 秒。 */
export const SHORT_DURATION_MS = 2500;
export const SHORT_MAX_DAYS = 5;
/** 超过 5 日每多一日加 0.1 秒（29 日约 4.9 秒）。 */
export const EXTRA_DAY_MS = 100;
/** 最长约 6 秒。 */
export const MAX_DURATION_MS = 6000;
/** 无途经点时弧线的拱高（占两点距离的比例）。 */
const ARC_BULGE = 0.15;
const SAMPLES_PER_SEGMENT = 24;

export function travelPlaybackDuration(days: TravelPlaybackDays): number {
  if (days === 'several') return SHORT_DURATION_MS;
  if (!Number.isFinite(days) || days <= 0) return MOMENT_DURATION_MS;
  return Math.min(MAX_DURATION_MS, SHORT_DURATION_MS + Math.max(0, Math.ceil(days) - SHORT_MAX_DAYS) * EXTRA_DAY_MS);
}

const lerp = (a: TravelPoint, b: TravelPoint, t: number): TravelPoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** 两点间略带弧度的二次贝塞尔。 */
function arcPath(from: TravelPoint, to: TravelPoint): TravelPoint[] {
  const dx = to.x - from.x, dy = to.y - from.y;
  const control = { x: (from.x + to.x) / 2 - dy * ARC_BULGE, y: (from.y + to.y) / 2 + dx * ARC_BULGE };
  return Array.from({ length: SAMPLES_PER_SEGMENT * 2 + 1 }, (_, i) => {
    const t = i / (SAMPLES_PER_SEGMENT * 2);
    return lerp(lerp(from, control, t), lerp(control, to, t), t);
  });
}

/** 过各途经点的 Catmull-Rom 平滑曲线（端点重复）。 */
function smoothPath(points: TravelPoint[]): TravelPoint[] {
  const out: TravelPoint[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 1; s <= SAMPLES_PER_SEGMENT; s++) {
      const t = s / SAMPLES_PER_SEGMENT, t2 = t * t, t3 = t2 * t;
      const axis = (k: 'x' | 'y') => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3);
      out.push({ x: axis('x'), y: axis('y') });
    }
  }
  return out;
}

export function travelPlaybackPlan(input: TravelPlaybackInput): TravelPlaybackPlan {
  const via = (input.via || []).filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y));
  const path = via.length ? smoothPath([input.from, ...via, input.to]) : arcPath(input.from, input.to);
  const lengths = [0];
  for (let i = 1; i < path.length; i++) lengths.push(lengths[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  return { path, lengths, durationMs: travelPlaybackDuration(input.days), days: input.days, destinationName: input.destinationName };
}

/** 慢起慢收。 */
const ease = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/** 进度 t∈[0,1] → 标记位置、已走过的路、日期行。 */
export function travelPlaybackFrame(plan: TravelPlaybackPlan, t: number): TravelPlaybackFrame {
  const raw = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 1)), p = ease(raw), arrived = raw >= 1;
  const total = plan.lengths[plan.lengths.length - 1], target = total * p;
  let i = 1;
  while (i < plan.path.length - 1 && plan.lengths[i] < target) i++;
  const segment = plan.lengths[i] - plan.lengths[i - 1];
  const point = arrived || plan.path.length < 2 ? plan.path[plan.path.length - 1]
    : lerp(plan.path[i - 1], plan.path[i], segment > 0 ? (target - plan.lengths[i - 1]) / segment : 1);
  const traveled = arrived ? [...plan.path] : [...plan.path.slice(0, i), point];
  return { point, traveled, dayLine: travelPlaybackDayLine(plan.days, p, arrived, plan.destinationName), arrived };
}

/** 「第 N 日 · 途中」→「第 N 日 · 抵达某地」；片刻与「数日」只显示「途中 → 抵达某地」，不翻日期。 */
export function travelPlaybackDayLine(days: TravelPlaybackDays, progress: number, arrived: boolean, destinationName: string): string {
  const where = arrived ? `抵达${destinationName}` : '途中';
  if (days === 'several' || !Number.isFinite(days) || days < 1) return where;
  const total = Math.ceil(days);
  const day = arrived ? total : Math.min(total, Math.max(1, Math.ceil(progress * total)));
  return `第 ${day} 日 · ${where}`;
}
