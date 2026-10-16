/**
 * 角色基础属性（总表 baseStats）与阶段档覆盖项（阶段档 stats）的合并规则。纯函数：不读总表、不读存档、不读配置，
 * 取值范围与属性名由调用方传入（来源 game-numbers），所以可以单独测试。规则全文见 docs/CHARACTER-DATA-STRUCTURE.md §8。
 *
 * 合并规则（覆盖项 = 阶段档里与基础不同的那几项）：
 * 1. 覆盖项缺省（键不存在或值为 undefined）= 沿用基础。
 * 2. 覆盖项存在 = 替换基础里的同名字段；显式 null 也是“存在”：表示本阶段该项不适用，不是 0，也不回落到基础。
 * 3. 嵌套对象（目前只有 attributes）逐键合并：覆盖项里写了的属性替换，没写的沿用基础；不是整体替换。
 *    标量与 levelSource 整体替换。
 * 4. 未知字段不进合并结果：顶层只认 STATS_KEYS，attributes 只认调用方给的属性名；越界或类型不对的值同样丢弃。
 *    被丢弃的字段路径记入 ignored，运行时只丢弃不报错；构建期与测试用 validateCharacterStats 把它们当错误。
 */
export const STATS_KEYS = ['level', 'levelSource', 'combatStrength', 'attributes'] as const;

export interface CharacterStats {
  /** 九级体系的级数；null = 不适用九级（不是 0）。 */
  level?: number | null;
  levelSource?: string;
  /** 战斗强度：战斗与判定算级差时读它；缺省或 null 时取 level。与 level 同单位（级数当量）。 */
  combatStrength?: number | null;
  /** 属性名 → 数值；属性名集合由调用方给出（现为判定权重表里的六司）。null = 该项不适用。 */
  attributes?: Record<string, number | null>;
}
export interface StatsRules {
  /** 级数与战斗强度的闭区间（来自 GAME_NUMBERS.levels.min / max）。 */
  levelMin: number;
  levelMax: number;
  /** attributes 允许的键。 */
  attributeKeys: readonly string[];
}
export interface MergeResult { stats: CharacterStats; ignored: string[] }

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** 把一份（可能不干净的）属性对象过滤成合法部分；非法项以字段路径记入 ignored。 */
function sanitize(input: unknown, rules: StatsRules, ignored: string[], label: string): CharacterStats {
  const out: CharacterStats = {};
  if (input === undefined) return out;
  if (!isPlainObject(input)) { ignored.push(label); return out; }
  for (const key of Object.keys(input)) {
    const value = input[key];
    if (!(STATS_KEYS as readonly string[]).includes(key)) { ignored.push(`${label}.${key}`); continue; }
    if (value === undefined) continue;
    if (key === 'level' || key === 'combatStrength') {
      if (value === null || (Number.isInteger(value) && (value as number) >= rules.levelMin && (value as number) <= rules.levelMax)) out[key] = value as number | null;
      else ignored.push(`${label}.${key}`);
    } else if (key === 'levelSource') {
      if (typeof value === 'string') out.levelSource = value; else ignored.push(`${label}.${key}`);
    } else if (!isPlainObject(value)) {
      ignored.push(`${label}.attributes`);
    } else {
      const attributes: Record<string, number | null> = {};
      for (const name of Object.keys(value)) {
        const v = value[name];
        if (v === undefined) continue;
        if (!rules.attributeKeys.includes(name) || !(v === null || (typeof v === 'number' && Number.isFinite(v)))) ignored.push(`${label}.attributes.${name}`);
        else attributes[name] = v as number | null;
      }
      out.attributes = attributes;
    }
  }
  return out;
}

/** 基础 ⊕ 覆盖项。两边都先过滤，所以未知字段永远进不了结果。 */
export function mergeCharacterStats(base: unknown, override: unknown, rules: StatsRules): MergeResult {
  const ignored: string[] = [];
  const b = sanitize(base, rules, ignored, 'base');
  const o = sanitize(override, rules, ignored, 'override');
  const stats: CharacterStats = { ...b };
  for (const key of Object.keys(o) as (keyof CharacterStats)[]) {
    if (key === 'attributes') stats.attributes = { ...(b.attributes || {}), ...o.attributes };
    else (stats as Record<string, unknown>)[key] = o[key];
  }
  return { stats, ignored };
}

/** 构建期/测试用：返回这份数据里所有会被丢弃的字段（空数组 = 干净）。 */
export function validateCharacterStats(input: unknown, rules: StatsRules, label = 'stats'): string[] {
  const ignored: string[] = [];
  sanitize(input, rules, ignored, label);
  return ignored;
}

/** 战斗与判定实际使用的级数当量：combatStrength 优先，其次 level；两者都没有或为 null = 无值（调用方按同级回落）。 */
export function combatLevelOf(stats: CharacterStats | undefined): number | undefined {
  return stats?.combatStrength ?? stats?.level ?? undefined;
}
