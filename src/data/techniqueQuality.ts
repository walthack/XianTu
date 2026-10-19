/**
 * 功法品质：与道具共用四品表（mod-kit/item-grades.json，用户 2026-10-20 定「功法改四品」）。
 * 功法专属数值（修炼速度、突破率、进度系数、藏经阁楼层、排序）在同一配置的 technique 段，这里不写死。
 * 旧存档功法的七档单字（凡黄玄地天仙神）按 legacySaveQualities 自动换算；grade 0–10 原样保留（只为兼容旧字段）。
 */
import table from '../../mod-kit/item-grades.json';
import { ITEM_TIER_TABLE, itemTierOf, itemTierOfQuality, type GradeType, type ItemTierDef, type ItemTierShort } from './itemQuality';

export interface TechniqueTierNumbers { speedBonus: number; breakthroughChance: number; progressFactor: number; libraryFloor: number; sortRank: number }
const NUMBERS = (table as any).technique.tiers as Record<string, TechniqueTierNumbers>;
export const TECHNIQUE_BREAKTHROUGH_CAP: number = (table as any).technique.breakthroughCap;

export const techniqueTierOf = (quality: unknown): ItemTierDef => itemTierOf(quality);
export const techniqueNumbersOf = (quality: unknown): TechniqueTierNumbers => NUMBERS[techniqueTierOf(quality).id];
export const techniqueTierLabel = (quality: unknown): string => techniqueTierOf(quality).name;
export const techniqueTierShort = (quality: unknown): ItemTierShort => techniqueTierOf(quality).short as ItemTierShort;

/** 旧档迁移：功法 品质 → 四品单字，grade 保留（0–10 夹紧，缺省 1）。 */
export function normalizeTechniqueQuality(quality: unknown): { quality: ItemTierShort; grade: GradeType } {
  const raw = quality && typeof quality === 'object' ? (quality as { quality?: unknown }).quality : quality;
  const g = Number(quality && typeof quality === 'object' ? (quality as { grade?: unknown }).grade : NaN);
  return { quality: techniqueTierShort(raw), grade: (Number.isFinite(g) ? Math.max(0, Math.min(10, Math.round(g))) : 1) as GradeType };
}

/** 剧本/目录 grade 字符串 → 存档 品质（四品单字）。 */
export function techniqueSaveQuality(grade?: string): { quality: ItemTierShort; grade: GradeType } {
  const tier = itemTierOfQuality(grade) ?? itemTierOf(undefined);
  return { quality: tier.short as ItemTierShort, grade: tier.save.grade as GradeType };
}

/** 提示词用：「凡品|珍品|仙品|神品」/「凡|珍|仙|神」。 */
export const TECHNIQUE_TIER_NAMES = ITEM_TIER_TABLE.map(t => t.name).join('|');
export const TECHNIQUE_TIER_SHORTS = ITEM_TIER_TABLE.map(t => t.short).join('|');

/** 按四品统计功法数量（ids 不同即算不同条目）。 */
export function countTechniquesByTier(grades: unknown[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(ITEM_TIER_TABLE.map(t => [t.name, 0]));
  for (const g of grades) out[techniqueTierOf(g).name]++;
  return out;
}
