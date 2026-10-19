// 状态的分项效果（精神、五感、神志、行动细分、外貌标签）：把一组状态的效果汇总成一份“画像”，并校验状态定义。
// 名单与取值范围全部来自 GAME_NUMBERS.status；本文件不写任何数值。气血不在这里（NPC 气血字段本轮不依赖）。
import { GAME_NUMBERS } from './numbers';
import type { StatusDef, StatusEffectSpec } from './types';

export interface StatusProfile {
  /** 精神：各状态之和，夹在 psycheRange 内（负＝受损）。 */
  psyche: number;
  /** 六识（眼耳鼻舌身意，名单在 status.senses）：每一识各状态之和，夹在 senseRange 内；没受影响的感官不出现。 */
  senses: Record<string, number>;
  /** 神志：取最重的一档；`downed` 效果按最重档计。 */
  consciousness: string;
  /** 行动细分：被限制的动作（并集）。 */
  restricted: string[];
  /** 外貌标签：按出现顺序去重。 */
  appearance: string[];
}

const clamp = (n: number, range: { min: number; max: number }): number => Math.max(range.min, Math.min(range.max, n));

export function emptyProfile(): StatusProfile {
  return { psyche: 0, senses: {}, consciousness: GAME_NUMBERS.status.consciousnessLevels[0], restricted: [], appearance: [] };
}

/** 汇总一组效果。名单之外的感官、动作、神志档、空标签一律忽略（定义层由 validateStatusDef 报错）。 */
export function summarizeEffects(effects: StatusEffectSpec[]): StatusProfile {
  const cfg = GAME_NUMBERS.status, out = emptyProfile();
  let level = 0;
  for (const effect of effects) {
    if (effect.kind === 'psyche' && Number.isFinite(effect.value)) out.psyche += effect.value;
    else if (effect.kind === 'sense' && cfg.senses.includes(effect.sense) && Number.isFinite(effect.value)) out.senses[effect.sense] = (out.senses[effect.sense] ?? 0) + effect.value;
    else if (effect.kind === 'consciousness') level = Math.max(level, cfg.consciousnessLevels.indexOf(effect.level));
    else if (effect.kind === 'downed') level = cfg.consciousnessLevels.length - 1;
    else if (effect.kind === 'restrict') for (const action of effect.actions || []) { if (cfg.actionKinds.includes(action) && !out.restricted.includes(action)) out.restricted.push(action); }
    else if (effect.kind === 'appearance' && typeof effect.tag === 'string' && effect.tag.trim() && !out.appearance.includes(effect.tag)) out.appearance.push(effect.tag);
  }
  out.psyche = clamp(out.psyche, cfg.psycheRange);
  for (const sense of Object.keys(out.senses)) out.senses[sense] = clamp(out.senses[sense], cfg.senseRange);
  out.consciousness = cfg.consciousnessLevels[Math.max(0, level)];
  return out;
}

/** 状态定义体检（构建期与测试用）：分项效果的名单、范围、标签长度，下限计数与永久伤残的写法。 */
export function validateStatusDef(def: StatusDef): string[] {
  const cfg = GAME_NUMBERS.status, errors: string[] = [], where = def.id;
  const inRange = (v: unknown, r: { min: number; max: number }): boolean => Number.isInteger(v) && (v as number) >= r.min && (v as number) <= r.max;
  for (const [i, effect] of def.effects.entries()) {
    const at = `${where}.effects[${i}]`;
    if (effect.kind === 'psyche' && !inRange(effect.value, cfg.psycheRange)) errors.push(`${at}：精神值需为 ${cfg.psycheRange.min}..${cfg.psycheRange.max} 的整数`);
    if (effect.kind === 'sense') {
      if (!cfg.senses.includes(effect.sense) && effect.sense !== '$senses') errors.push(`${at}：未知感官 ${String(effect.sense)}`);
      if (!inRange(effect.value, cfg.senseRange)) errors.push(`${at}：五感值需为 ${cfg.senseRange.min}..${cfg.senseRange.max} 的整数`);
    }
    if (effect.kind === 'consciousness' && !cfg.consciousnessLevels.includes(effect.level)) errors.push(`${at}：未知神志档 ${String(effect.level)}`);
    if (effect.kind === 'restrict') {
      if (!Array.isArray(effect.actions) || !effect.actions.length) errors.push(`${at}：actions 不能为空`);
      for (const action of Array.isArray(effect.actions) ? effect.actions : []) if (!cfg.actionKinds.includes(action)) errors.push(`${at}：未知行动 ${String(action)}`);
    }
    if (effect.kind === 'appearance' && !(typeof effect.tag === 'string' && effect.tag.trim() && effect.tag.length <= cfg.appearance.tagChars)) errors.push(`${at}：外貌标签需为 1..${cfg.appearance.tagChars} 字的文字`);
  }
  if (def.lifeFloor) {
    const { max, perDose } = def.lifeFloor;
    if (!Number.isInteger(max) || max < 1 || !Number.isInteger(perDose) || perDose < 1 || perDose > max) errors.push(`${where}.lifeFloor：max/perDose 需为正整数且 perDose≤max`);
  }
  if (def.permanent) {
    if (def.afterScene?.minutes !== null) errors.push(`${where}：永久伤残的 afterScene.minutes 必须为 null`);
    if (!def.remove?.length || def.remove.some(rule => rule.kind !== 'story')) errors.push(`${where}：永久伤残只能由剧情旗标解除（remove 只允许 story）`);
  }
  return errors;
}
