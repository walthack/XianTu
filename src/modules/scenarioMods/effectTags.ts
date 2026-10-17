import vocab from '../../../mod-kit/entity-catalog/effect-tags.json';
import type { ScenarioModActivation } from './schema/content';

/** 道具/装备/功法共用的效果标签词表与生效方式，权威是 mod-kit/entity-catalog/effect-tags.json。 */
export const EFFECT_VOCAB = vocab as {
  activations: Record<string, { kinds: string[]; itemTypes?: string[] }>;
  tags: Record<string, { activation: string[] }>;
};

export type EffectKind = 'item' | 'technique';

const SIX_FACULTIES = ['根骨', '灵性', '悟性', '气运', '魅力', '心性'];
const CAP_KEYS = ['气血上限', '灵气上限', '神识上限'];
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** 道具按类型推出生效方式；功法只有一种（词表里 kinds 含 technique 的那项）。 */
export function activationOf(kind: EffectKind, def: Record<string, unknown>): ScenarioModActivation | undefined {
  const found = Object.entries(EFFECT_VOCAB.activations).find(([, a]) => a.kinds.includes(kind) && (kind === 'technique' || a.itemTypes?.includes(String(def.type))));
  return found?.[0] as ScenarioModActivation | undefined;
}

/** 数值加成（装备 attributeBonus 与功法 bonus 同构）的结构检查；修炼速度加成只有功法有。 */
export function bonusProblems(bonus: unknown, allowCultivationSpeed: boolean): string[] {
  if (!isRecord(bonus) || !Object.keys(bonus).length) return ['加成需为非空对象（没有就整个字段省略）'];
  const out: string[] = [];
  for (const [key, value] of Object.entries(bonus)) {
    if (CAP_KEYS.includes(key) || (allowCultivationSpeed && key === '修炼速度加成')) {
      if (typeof value !== 'number' || !Number.isFinite(value)) out.push(`${key} 需为有限数字`);
    } else if (key === '后天六司') {
      if (!isRecord(value) || !Object.keys(value).length) out.push('后天六司 需为非空对象');
      else for (const [attr, v] of Object.entries(value)) if (!SIX_FACULTIES.includes(attr) || typeof v !== 'number' || !Number.isFinite(v)) out.push(`后天六司.${attr} 非法`);
    } else out.push(`未知加成字段 ${key}`);
  }
  return out;
}

/** 生效方式、效果标签、加成、多部装备开关的统一检查，返回错误信息（不含定位前缀）。 */
export function effectProblems(kind: EffectKind, def: Record<string, unknown>, opts: { requireActivation?: boolean } = {}): string[] {
  const out: string[] = [];
  const expected = activationOf(kind, def);
  if (def.activation === undefined) {
    if (kind === 'technique' && opts.requireActivation) out.push(`activation 必填（功法应为 ${expected}）`);
  } else if (def.activation !== expected) out.push(`activation ${String(def.activation)} 与${kind === 'item' ? `类型 ${String(def.type)} ` : '功法类'}不一致（应为 ${String(expected)}）`);
  if (def.effectTags !== undefined) {
    const tags = def.effectTags;
    if (!Array.isArray(tags) || !tags.length || new Set(tags).size !== tags.length) out.push('effectTags 需为非空且不重复的数组（没有效果就整个字段省略）');
    else for (const tag of tags) {
      const spec = typeof tag === 'string' ? EFFECT_VOCAB.tags[tag] : undefined;
      if (!spec) out.push(`未知效果标签 ${String(tag)}`);
      else if (!expected) out.push(`该类型没有生效方式，不能带 effectTags（${tag}）`);
      else if (!spec.activation.includes(expected)) out.push(`效果标签 ${tag} 不适用于 ${expected}（适用：${spec.activation.join('/')}）`);
    }
  }
  if (def.onUse !== undefined && expected !== 'consumable') out.push(`onUse 只用于 consumable（当前 ${String(expected)}）`);
  if (kind === 'technique') {
    if (def.techniqueEffects !== undefined) out.push('techniqueEffects 已改名 bonus');
    if (def.bonus !== undefined) out.push(...bonusProblems(def.bonus, true).map(m => `bonus：${m}`));
    if (def.allowMultiEquip !== undefined && typeof def.allowMultiEquip !== 'boolean') out.push('allowMultiEquip 需为布尔值');
  } else {
    if (def.allowMultiEquip !== undefined) out.push('allowMultiEquip 只用于功法');
    if (def.attributeBonus !== undefined) {
      if (expected !== 'equipped') out.push('attributeBonus 只用于装备（weapon/armor）');
      out.push(...bonusProblems(def.attributeBonus, false).map(m => `attributeBonus：${m}`));
    }
  }
  return out;
}
