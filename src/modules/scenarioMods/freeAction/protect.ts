/**
 * 必须活着（mustSurvive）：只约束玩家自由行动路径（计划 §7.3 硬规则）。
 * 只许由 freeAction/ 下的结算函数调用；不得接进 injuries.ts、runtime.ts、host/writeback.ts、canonGuard.ts、
 * fixedEndingNarratives.ts 等共用写入或守卫——剧情合同安排的死亡不受它限制。
 */
import { GAME_NUMBERS } from '../../sceneModule/numbers';
import { getRegistryMustSurvive } from '../characterResolver';

/** 总表里该 id（实例 id 按其种类）是否标了必须活着。 */
export function isMustSurvive(actorId: string): boolean {
  return getRegistryMustSurvive(actorId);
}

/** 变体带 protectedForbid（持续限制类，默认关闭）时，受保护的目标一律拒绝。 */
export function protectedForbids(actorId: string, spec: { protectedForbid?: boolean }): boolean {
  return spec.protectedForbid === true && isMustSurvive(actorId);
}

/** 夺取类致死的一击：受保护的目标一律拒绝（不论玩家有没有确认）。 */
export function lethalForbidden(actorId: string): boolean {
  return isMustSurvive(actorId);
}

/** 受保护的目标：结果档超出封顶表时降成封顶的档（如攻击最多到“受创”）；不受保护或不在表里返回 undefined。 */
export function protectedCapFor(actorId: string, spec: { protectedCap?: Record<string, string> }, resultKey: string): string | undefined {
  return isMustSurvive(actorId) ? spec.protectedCap?.[resultKey] : undefined;
}

/**
 * 下限计数的下限：必须活着的角色 = max(status.lifeFloor.min, ceil(max × status.lifeFloor.ratio))，且不超过 max；
 * 其余角色 = 0（计数可以降到 0，即致命）。
 */
export function lifeFloorFor(actorId: string, max: number): number {
  if (!isMustSurvive(actorId)) return 0;
  const { ratio, min } = GAME_NUMBERS.status.lifeFloor;
  return Math.min(max, Math.max(min, Math.ceil(max * ratio)));
}
