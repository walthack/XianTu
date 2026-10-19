/**
 * 道具品质：四品（凡品 / 珍品 / 仙品 / 神品），唯一权威是 mod-kit/item-grades.json（用户 2026-10-20 定，原著无道具品级体系）。
 * 存档 品质 = { quality: 四品单字, grade: 数字（只为兼容旧字段，道具不再显示上中下品） }。
 * 旧存档的七档单字（凡黄玄地天仙神）按配置 legacySaveQualities 换算成四品：读档修复（dataRepair）与 UI 显示都走这里。
 * 功法品级不走这张表（仍是七档 LegacyQuality，留待功法品级另定）。
 */
import table from '../../mod-kit/item-grades.json';

export type ItemTierShort = '凡' | '珍' | '仙' | '神';
/** 旧七档单字（功法仍在用；旧存档里的道具也可能是这些值）。 */
export type LegacyQuality = '神' | '仙' | '天' | '地' | '玄' | '黄' | '凡';
export type QualityType = ItemTierShort | LegacyQuality;
export type GradeType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface ItemTierDef {
  id: string; name: string; short: string; order: number;
  save: { quality: string; grade: number }; color: string; rarity: string;
}

export const ITEM_TIER_TABLE: readonly ItemTierDef[] = table.tiers;
const byId = new Map(ITEM_TIER_TABLE.map(t => [t.id, t]));
const DEFAULT_TIER = byId.get(table.defaultTier)!;

/** 任意写法（四品名、四品单字、旧七档单字、剧本 grade 字符串，带不带「品 / 阶」）→ 四品；认不出返回 undefined。 */
export function itemTierOfQuality(raw: unknown): ItemTierDef | undefined {
  const s = String(raw ?? '').trim();
  if (!s) return undefined;
  const direct = ITEM_TIER_TABLE.find(t => t.short === s || t.name === s);
  if (direct) return direct;
  const aliases = table.legacyAliases as Record<string, string>;
  const legacy = table.legacySaveQualities as Record<string, string>;
  const base = s.replace(/[品阶级]$/, '');
  const id = aliases[s] ?? legacy[s] ?? legacy[base] ?? aliases[base];
  return id ? byId.get(id) : undefined;
}

/** 道具存档品质 → 四品（认不出按默认凡品）。 */
export function itemTierOf(quality: unknown): ItemTierDef {
  const q = quality && typeof quality === 'object' ? (quality as { quality?: unknown }).quality : quality;
  return itemTierOfQuality(q) ?? DEFAULT_TIER;
}

/** 显示用：「凡品 / 珍品 / 仙品 / 神品」。 */
export const itemTierLabel = (quality: unknown): string => itemTierOf(quality).name;
export const itemTierColor = (quality: unknown): string => itemTierOf(quality).color;

/** 旧档迁移：把道具的 品质 换成四品写法（已是四品的保持不变，返回新对象）。 */
export function normalizeItemQuality(quality: unknown): { quality: ItemTierShort; grade: GradeType } {
  const raw = quality && typeof quality === 'object' ? (quality as { quality?: unknown }).quality : quality;
  const tier = itemTierOfQuality(raw) ?? DEFAULT_TIER;
  const already = raw === tier.short && quality && typeof quality === 'object' && Number.isFinite((quality as { grade?: unknown }).grade);
  return { quality: tier.short as ItemTierShort, grade: (already ? (quality as { grade: number }).grade : tier.save.grade) as GradeType };
}

/** 给 AI 的道具品质说明（四品，按配置生成）。 */
export function generateQualitySystemPrompt(): string {
  const lines = ITEM_TIER_TABLE.map(t => `- ${t.name}（quality:"${t.short}"）：${t.rarity}`).join('\n');
  return `
## 物品品质系统 (重要参考)
道具只分四品（从低到高），四品之内不再细分：
${lines}

存档格式：品质 {quality:"${ITEM_TIER_TABLE.map(t => t.short).join('|')}", grade: 数字（沿用字段，不表示品级）}。
命名直接用物品名（如"铁剑""金创药"），不要在名字前加品质。
重要提示：初始角色通常只有凡品物品，珍品以上极其稀少。
`;
}
