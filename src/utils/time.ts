import type { GameTime } from '@/types/game';
import { GAME_NUMBERS } from '@/modules/sceneModule/numbers';
export const calendarConfig = () => GAME_NUMBERS.story.actionTime.calendar;
/** 游戏唯一日历：30日/月、12月/年；序数零点为0年1月1日。 */
export function gameTimeMinutes(time: Partial<GameTime>): number {
  const c = calendarConfig();
  return (((Number(time.年 ?? 0) * c.monthsPerYear + Number(time.月 ?? 1) - 1) * c.daysPerMonth + Number(time.日 ?? 1) - 1) * 24 + Number(time.小时 ?? 0)) * 60 + Number(time.分钟 ?? 0);
}
export function gameTimeFromMinutes(total: number): GameTime {
  if (!Number.isFinite(total)) throw new Error('invalid_game_time');
  const c = calendarConfig(), day = Math.floor(total / 1440), yearDays = c.daysPerMonth * c.monthsPerYear;
  const year = Math.floor(day / yearDays), inYear = day - year * yearDays, inDay = total - day * 1440;
  return { 年: year, 月: Math.floor(inYear / c.daysPerMonth) + 1, 日: inYear % c.daysPerMonth + 1, 小时: Math.floor(inDay / 60), 分钟: inDay % 60 };
}
export function normalizeGameTime(time: GameTime): GameTime {
  return { ...gameTimeFromMinutes(gameTimeMinutes(time)), ...(time.相对日 ? { 相对日: time.相对日 } : {}) };
}
