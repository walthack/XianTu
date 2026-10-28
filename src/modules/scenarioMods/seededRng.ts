/**
 * 存档种子骰子（从 locationLoot.ts 抽出，行为不变；搜刮与随机遇敌共用）。
 * 同一存档、同一盐串永远掷出同一序列：重载、重试、预演克隆都不改骰。
 */
import type { SaveData } from '@/types/game';

/** FNV-1a 32 位。 */
export function seedHash(text: string): number {
  let n = 2166136261;
  for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}

/** mulberry32：每次调用返回 [0,1) 的下一个数。 */
export function seededRoller(seed: number): () => number {
  let rng = seed;
  return () => { rng = (rng + 0x6D2B79F5) >>> 0; let t = Math.imul(rng ^ (rng >>> 15), 1 | rng); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** 存档身份、创建时间、版本派生初始种子；salt 为空时与搜刮的旧种子一致。 */
export function saveSeed(save: SaveData, salt?: string): number {
  const base = [(save as any).角色?.身份, (save as any).元数据?.创建时间, (save as any).元数据?.版本];
  return seedHash(JSON.stringify(salt ? [...base, salt] : base));
}
