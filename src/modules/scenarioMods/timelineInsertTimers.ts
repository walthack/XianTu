/**
 * 插入事件拨钟时各计时器的到期口径（设计稿 2026-11-11「四年跳计时器口径」§2；用户 00:35 定，总策划 00:43 审定）。
 * 只由 advanceClock 在带插入标记（applyTimelineInserts → settleTime → advanceClock）时调用，写入新日期之后、
 * syncMaigu / pruneSceneInjuries / updateStatusEffects 之前。普通推进不调用。
 * 类别、策略（natural / freeze）与存档锚点全部读 story.timeline.insertTimers；本文件不写类别名、路径与数值。
 * freeze：锚点加上跳过的分钟（minutes）、日序差（days）或把 生成时间 后移（gameTime），剩余时长不变；natural：不动。
 */
import type { GameTime, SaveData } from '@/types/game';
import { GAME_NUMBERS, registerNumbersValidator } from '../sceneModule/numbers';
import { gameTimeFromMinutes, gameTimeMinutes } from '@/utils/time';
import { gameDayOf } from './affinityLadder';

export type InsertTimerPolicy = 'natural' | 'freeze';
export type InsertTimerUnit = 'minutes' | 'days' | 'gameTime';
export interface InsertTimerAnchor { path: string; unit: InsertTimerUnit; where?: Record<string, unknown>; linkPlayerEffect?: boolean }
export interface InsertTimerCategory { policy: InsertTimerPolicy; anchors: InsertTimerAnchor[]; note?: string }
export interface InsertTimersConfig { categories: Record<string, InsertTimerCategory> }

export const insertTimersConfig = (): InsertTimersConfig =>
  (GAME_NUMBERS.story.timeline as unknown as { insertTimers: InsertTimersConfig }).insertTimers;

const POLICIES: readonly string[] = ['natural', 'freeze'];
const UNITS: readonly string[] = ['minutes', 'days', 'gameTime'];

/** 路径上每个叶子：所在对象与键（* 匹配任一键或数组项）。 */
function leaves(root: unknown, segments: string[]): Array<[any, string]> {
  let frontier: any[] = [root];
  for (const seg of segments.slice(0, -1)) {
    const next: any[] = [];
    for (const node of frontier) {
      if (!node || typeof node !== 'object') continue;
      if (seg === '*') next.push(...Object.values(node));
      else if (Object.hasOwn(node, seg)) next.push(node[seg]);
    }
    frontier = next;
  }
  const last = segments[segments.length - 1], out: Array<[any, string]> = [];
  for (const node of frontier) {
    if (!node || typeof node !== 'object') continue;
    for (const key of last === '*' ? Object.keys(node) : [last]) if (Object.hasOwn(node, key)) out.push([node, key]);
  }
  return out;
}

const isPermanentEffect = (effect: any): boolean => {
  const d = effect?.持续时间分钟;
  return typeof d === 'number' && (d < 0 || d >= GAME_NUMBERS.status.permanentMinutesThreshold);
};

/**
 * 插入事件拨钟钩子：按配置平移 freeze 类锚点。同一字段只平移一次（多类登记到同一字段时不叠加）。
 * 返回各类被平移的字段数（仅供日志与测试）。
 */
export function applyInsertEventTimers(save: SaveData, oldTime: GameTime, newTime: GameTime): Record<string, number> {
  const minutes = gameTimeMinutes(newTime) - gameTimeMinutes(oldTime);
  const days = gameDayOf(newTime) - gameDayOf(oldTime);
  const out: Record<string, number> = {};
  if (!(minutes > 0)) return out;
  const shifted = new WeakMap<object, Set<string>>();
  const claim = (obj: object, key: string): boolean => {
    const keys = shifted.get(obj) || new Set<string>();
    if (keys.has(key)) return false;
    keys.add(key); shifted.set(obj, keys);
    return true;
  };
  const shiftStart = (effect: any): boolean => {
    if (!effect?.生成时间 || typeof effect.生成时间 !== 'object' || isPermanentEffect(effect) || !claim(effect, '生成时间')) return false;
    effect.生成时间 = gameTimeFromMinutes(gameTimeMinutes(effect.生成时间) + minutes);
    return true;
  };
  for (const [name, category] of Object.entries(insertTimersConfig()?.categories || {})) {
    if (category.policy !== 'freeze') continue;
    let count = 0;
    for (const anchor of category.anchors || []) {
      for (const [obj, key] of leaves(save, anchor.path.split('.'))) {
        if (anchor.where && !Object.entries(anchor.where).every(([k, v]) => obj[k] === v)) continue;
        if (anchor.unit === 'gameTime') {
          if (key === '生成时间' && shiftStart(obj)) count++;
          continue;
        }
        const value = obj[key];
        if (typeof value !== 'number' || !Number.isFinite(value) || !claim(obj, key)) continue;
        obj[key] = value + (anchor.unit === 'days' ? days : minutes);
        count++;
        if (anchor.linkPlayerEffect && obj.player === true) {
          for (const effect of (save as any)?.角色?.效果 || []) if (effect?.来源 === obj.sourceScene && effect?.状态名称 === obj.label && shiftStart(effect)) count++;
        }
      }
    }
    out[name] = count;
  }
  return out;
}

registerNumbersValidator(() => {
  const errors: string[] = [], categories = insertTimersConfig()?.categories;
  if (!categories || typeof categories !== 'object') return ['story.timeline.insertTimers.categories 缺失'];
  for (const [name, c] of Object.entries(categories)) {
    const at = `story.timeline.insertTimers.categories.${name}`;
    if (!POLICIES.includes(c?.policy)) errors.push(`${at}.policy 须为 natural|freeze`);
    if (!Array.isArray(c?.anchors)) { errors.push(`${at}.anchors 须为数组`); continue; }
    c.anchors.forEach((a, i) => {
      if (typeof a?.path !== 'string' || !a.path || a.path.split('.').some(s => !s)) errors.push(`${at}.anchors.${i}.path 无效`);
      if (!UNITS.includes(a?.unit)) errors.push(`${at}.anchors.${i}.unit 须为 minutes|days|gameTime`);
      if (a?.where !== undefined && (!a.where || typeof a.where !== 'object' || Array.isArray(a.where))) errors.push(`${at}.anchors.${i}.where 须为对象`);
    });
  }
  return errors;
});
