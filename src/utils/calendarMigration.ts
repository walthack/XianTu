import { calendarConfig, gameTimeMinutes, gameTimeFromMinutes } from './time';
import { GAME_NUMBERS } from '@/modules/sceneModule/numbers';
import { logEvent } from '@/modules/diagnostics/log';
/** 只平移已知游戏绝对分钟，不碰现实时间、历史、相对日与永久状态。先验证全部字段，再原子写入。 */
export function migrateCalendar(save: any): void {
  if (!save?.元数据 || save.元数据.calendarVersion === calendarConfig().version) return;
  const t = save.元数据.时间;
  if (!t) return;
  const date = new Date(0);
  date.setUTCFullYear(t.年, t.月 - 1, t.日); date.setUTCHours(t.小时 ?? 0, t.分钟 ?? 0, 0, 0);
  const old = date.getTime() / 60000, delta = gameTimeMinutes(t) - old;
  const writes: Array<[any, string, unknown]> = [];
  const add = (obj: any, key: string) => {
    const v = obj?.[key];
    if (v == null) return;
    if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isFinite(delta) || (v !== 0 && key !== 'expiresAt' && v > old)) throw new Error('invalid_absolute_game_minutes');
    writes.push([obj, key, v + delta]);
  };
  try {
    const rt = save.世界?.状态?.剧本模组;
    const store = rt?.sceneLedger?.statusRecords;
    for (const bank of [store?.actors, store?.groups, store?.disabilities])
      for (const rows of Object.values(bank || {}) as any[][]) for (const row of rows) { add(row, 'appliedAt'); add(row, 'expiresAt'); }
    for (const clock of Object.values(rt?.maiguClock || {}) as any[]) { add(clock, 'lastDoseAt'); add(clock, 'withdrawalAt'); }
    add(save.系统?.扩展?.lcq_shiweimo, 'endedAt');
    for (const key of Object.keys(rt?.freeAction?.cooldowns || {})) add(rt.freeAction.cooldowns, key);
    for (const row of Object.values(rt?.freeAction?.drainLedger || {}) as any[]) add(row, 'lastAt');
    for (const row of Object.values(rt?.freeAction?.repeatLedger || {}) as any[]) add(row, 'since');
    const oldMixed = (x: any) => ((x.年 * 365 + x.月 * 30 + x.日) * 24 + (x.小时 || 0)) * 60 + (x.分钟 || 0);
    for (const effect of save.角色?.效果 || []) {
      if (!effect) continue;
      if (effect.生成时间 && typeof effect.持续时间分钟 === 'number') {
        if (effect.持续时间分钟 >= GAME_NUMBERS.status.permanentMinutesThreshold || effect.持续时间分钟 < 0) continue;
        const elapsed = oldMixed(t) - oldMixed(effect.生成时间);
        if (!Number.isFinite(elapsed)) throw new Error('invalid_effect_time');
        writes.push([effect, '生成时间', gameTimeFromMinutes(gameTimeMinutes(t) - elapsed)]);
      } else {
        const text = effect.剩余时间 || effect.duration;
        if (typeof text !== 'string') continue;
        const units: Record<string, number> = { 年: 365 * 1440, 月: 30 * 1440, 天: 1440, 小时: 60, 分钟: 1 };
        let minutes = 0;
        for (const match of text.matchAll(/(\d+)(年|月|天|小时|分钟)/g)) minutes += Number(match[1]) * units[match[2]];
        writes.push([effect, '生成时间', structuredClone(t)], [effect, '持续时间分钟', minutes]);
      }
    }
    for (const [obj, key, value] of writes) obj[key] = value;
    save.元数据.calendarVersion = calendarConfig().version;
  } catch { logEvent({ code: 'LCQ-SAV-040', detail: { reason: 'invalid_timestamp' } }); throw new Error('LCQ-SAV-040'); }
}
