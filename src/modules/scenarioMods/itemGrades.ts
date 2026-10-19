/**
 * 道具四品（配置 mod-kit/item-grades.json）：凡品 / 灵品 / 仙品 / 神品，含旧 grade 字符串的映射。
 * - itemTierOf：grade 字符串 → 四品；表里没有的（其他书的天品、地品等）返回 undefined，由调用方按旧规则兜底。
 * - itemSaveQuality：写进存档 品质 的值；没填 grade 按 defaultTier。
 */
import table from '../../../mod-kit/item-grades.json';

export interface ItemTier { id: string; name: string; order: number; save: { quality: string; grade: number } }
export const ITEM_TIERS: readonly ItemTier[] = table.tiers;
const byId = new Map(ITEM_TIERS.map(t => [t.id, t]));

export function itemTierOf(grade?: string): ItemTier | undefined {
  if (!grade) return byId.get(table.defaultTier);
  const id = (table.legacyAliases as Record<string, string>)[grade.trim()];
  return id ? byId.get(id) : undefined;
}

/** 存档品质；fallback 处理表外的旧字符串（保持原有映射）。 */
export function itemSaveQuality(grade: string | undefined, fallback: (grade?: string) => { quality: string; grade: number }): { quality: string; grade: number } {
  const tier = itemTierOf(grade);
  return tier ? { ...tier.save } : fallback(grade);
}
