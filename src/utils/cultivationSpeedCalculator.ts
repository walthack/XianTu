/** @deprecated Progression is settled by scenarioMods/levelProgression; no old resource multiplier model. */
export {};

/** 功法速度为倍率：0.56 → -44%，1.44 → +44%。 */
export function formatCultivationSpeedBonus(multiplier: number): string {
  const percent = Math.round((multiplier - 1) * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
}

/** 按舍入后的数值定符号（同 formatCultivationSpeedBonus）：不出现「+-」与「-0」。 */
function signedNumber(value: number, digits = 0): string {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor || 0;
  return `${rounded >= 0 ? '+' : ''}${rounded}`;
}

/**
 * 背包功法详情的「功法效果」可读文本（真机 REPORT-8091-cd167d7a：原样显示 JSON）。
 * 修炼速度加成按 techniques.cultivationSpeedBonus.semantics＝fraction_increment 读：0.56 → 修炼速度 +56%。
 * 属性加成逐项「悟性 +7」；其余键原样「键：值」。字符串原样返回。
 */
export function formatTechniqueEffects(effects: unknown): string {
  if (effects === null || effects === undefined) return '';
  if (typeof effects === 'string') return effects;
  if (typeof effects === 'number') return signedNumber(effects, 2);
  if (Array.isArray(effects)) return effects.map(formatTechniqueEffects).filter(Boolean).join('、');
  if (typeof effects !== 'object') return String(effects);
  const parts: string[] = [];
  for (const [key, value] of Object.entries(effects as Record<string, unknown>)) {
    if (value === null || value === undefined || value === '') continue;
    if (key === '修炼速度加成' && typeof value === 'number') parts.push(`修炼速度 ${signedNumber(value * 100)}%`);
    else if (key === '属性加成' && value && typeof value === 'object' && !Array.isArray(value)) {
      const attrs = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
        .map(([name, v]) => `${name} ${signedNumber(v as number, 2)}`);
      if (attrs.length) parts.push(attrs.join('、'));
    } else if (typeof value === 'number') parts.push(`${key.replace(/加成$/, '')} ${signedNumber(value, 2)}`);
    else {
      const text = formatTechniqueEffects(value);
      if (text) parts.push(`${key}：${text}`);
    }
  }
  return parts.join('；');
}
