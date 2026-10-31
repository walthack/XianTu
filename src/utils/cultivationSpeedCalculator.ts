/** @deprecated Progression is settled by scenarioMods/levelProgression; no old resource multiplier model. */
export {};

/** 功法速度为倍率：0.56 → -44%，1.44 → +44%。 */
export function formatCultivationSpeedBonus(multiplier: number): string {
  const percent = Math.round((multiplier - 1) * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
}
