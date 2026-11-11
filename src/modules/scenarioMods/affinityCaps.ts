import { canonicalIdentityName } from './ledger/affinityIdentity';
/**
 * 好感天花板（R3-9 规格 §3.5 待拍板项 C，2026-08-15 用户批准）。
 *
 * 解决两个不同的问题，但用同一套机制——因为它们本质都是"这个人现在不可能跟你更近"：
 *
 *   1. **立场先于情感**：吕雉在飞羽族拿到实质保障前、义姁在太后仍是她主君时，
 *      好感再刷也不会把她们变成你的人。她们的忠诚有明确的排序，感情排在后面。
 *   2. **未触发加入事件**：惊理、蛇夫人这类**非剧情承重**角色，正典里都有明确的加入
 *      经过（registry `joining` 字段）。事件没发生就不该"刷好感刷成自己人"——
 *      用户口径：**没有触发的话不做入队**。
 *
 * 与 `affinityLadder` 的分工：阶梯说"这个数值是什么档"，本模块说"这个数值最高能到几"。
 * cap 由 `createAffinityCommandGate` 在命令层执行——模型加好感时超出部分直接削掉，
 * 而不是让数值涨上去再在表现层假装不亲近（那样存档与叙事会脱节）。
 *
 * 解除方式：**看关系标签**。当 `与玩家关系` 已表明其归属（阵营/后宫/心腹等），
 * 说明正典事件已经发生，cap 自动失效。不另建 flag，因为标签本来就是这件事的既有载体。
 *
 * 数据（B4 起）：13 条上限在人物包 `contentPacks/packs/characters/profiles.json` 的 `affinityCaps`，
 * 权威来源是那份 JSON；`TS_AFFINITY_CAPS` 为空表，导出名与查询函数不变。
 */

import { AFFINITY_TIERS } from './affinityLadder';
import { JOINED_RELATION_RE as SETTLED_RELATION_RE } from './acquaintanceLedger';
import { CONTENT_PACKS } from '../contentPacks';
import type { PackAffinityCap } from '../contentPacks/coreFormats';
import { packEntityNames } from './stanceProfiles';

export interface AffinityCap {
  names: string[];
  /** 好感上限（含）。取阶梯档位上界，不要写任意数字。 */
  cap: number;
  /** 为什么有上限——注入 prompt，让模型知道该怎么演这份距离感。 */
  reason: string;
  /** 什么条件解除。用于 prompt 说明与人工检索，不参与运行时判断。 */
  liftedBy: string;
}

const tierMax = (id: string) => AFFINITY_TIERS.find(t => t.id === id)!.max;

// 关系标签一旦表明归属，即视为正典加入事件已发生，cap 失效。
// 判据引用相识账本的唯一定义——此前本文件自带一份，与账本那份各自漏词（都漏了「主仆」）。

export const TS_AFFINITY_CAPS: AffinityCap[] = [];

/** TS 表在前、包条目按 catalog 顺序在后（affinityCapFor 用 find 取第一条命中）；capTier 是档位 id，取该档 max（F0a）。 */
export function mergeAffinityCaps(ts: readonly AffinityCap[], pack: readonly PackAffinityCap[]): AffinityCap[] {
  return [...ts, ...pack.map(entry => ({ names: packEntityNames(entry), cap: tierMax(entry.capTier), reason: entry.reason, liftedBy: entry.liftedBy }))];
}

/** 全部好感上限：TS 表加内容包 characterProfiles.affinityCaps。 */
export const AFFINITY_CAPS: readonly AffinityCap[] = mergeAffinityCaps(TS_AFFINITY_CAPS, CONTENT_PACKS.characterProfiles?.affinityCaps || []);

/**
 * 取该角色当前的好感上限。返回 `null` 表示无上限。
 *
 * `relationLabel` 传入存档里的 `与玩家关系`：一旦标签已表明归属，说明正典加入事件
 * 已经发生，cap 自动失效——避免"人都进后宫了好感还卡在陌路"这种自相矛盾。
 */
export function affinityCapFor(name: string, relationLabel?: string, displayName?: string): AffinityCap | null {
  const entry = AFFINITY_CAPS.find(item => item.names.includes(canonicalIdentityName(name) || displayName || name));
  if (!entry) return null;
  if (relationLabel && SETTLED_RELATION_RE.test(relationLabel)) return null;
  return entry;
}

/** 供 prompt 注入：说明这份距离感的由来，让模型演得出而不是硬顶着。 */
export function formatAffinityCap(name: string, relationLabel?: string): string {
  const entry = affinityCapFor(name, relationLabel);
  if (!entry) return '';
  const tier = AFFINITY_TIERS.find(t => entry.cap >= t.min && entry.cap <= t.max);
  return `  【关系上限】当前最多到「${tier?.name || ''}」（好感 ${entry.cap}）：${entry.reason}再多的好意也只会停在这条线上——不得写成她已归属于你，也不得让她主动越过这层。`;
}
