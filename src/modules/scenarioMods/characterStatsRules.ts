import { GAME_NUMBERS } from '../sceneModule/numbers';
import type { StatsRules } from './characterStatsMerge';

/** 属性名取自判定权重表里出现过的六司，不另立名单；级数范围取自 levels 配置。 */
export function statsRules(): StatsRules {
  const names = new Set<string>();
  for (const pairs of Object.values(GAME_NUMBERS.weights) as Array<Array<[string, number]>>) for (const [name] of pairs) names.add(name);
  return { levelMin: GAME_NUMBERS.levels.min, levelMax: GAME_NUMBERS.levels.max, attributeKeys: [...names] };
}
