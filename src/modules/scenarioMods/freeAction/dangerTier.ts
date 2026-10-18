/**
 * 地点危险档：地点总表（mod-kit/entity-catalog/locations.json）的 definition.dangerTier 可选，缺省 = 配置 defaultDangerTier（safe）。
 * 判定难度 = 变体难度 + 该类 dangerTierShift[档] + difficultyModifiers（扩展挂点）；没有标档的地点、没有 dangerTierShift 的类，行为与原来完全一致。
 */
import type { SaveData } from '@/types/game';
import { namedEntity } from '../namedEntities';
import { currentLocation } from '../travel/travelLedger';
import { freeActionConfig, type VariantSpec } from './config';
import type { FreeActionTicket } from './ticket';

/** 玩家当前所在地点的危险档 id；位置查不到、总表没标、标的档不在词表里，一律取默认档。 */
export function dangerTierOf(save: SaveData, cfg = freeActionConfig()): string {
  const id = currentLocation(save).canonicalLocationId;
  const tier = id ? namedEntity('location', id)?.dangerTier : undefined;
  return typeof tier === 'string' && cfg.dangerTiers.includes(tier) ? tier : cfg.defaultDangerTier;
}

export interface DifficultyContext { save: SaveData; spec: VariantSpec; ticket: FreeActionTicket; tier: string }

/**
 * 难度修正的扩展挂点：以后按在场敌人、时间（夜 / 昼）、天气等再加修正，就在这里累加并返回；各项数值照例放配置，别写字面量。
 * 现在没有任何修正，恒为 0。
 */
export function difficultyModifiers(_ctx: DifficultyContext): number {
  return 0;
}

/** 签发判定卡的最终难度。 */
export function adjustedDifficulty(save: SaveData, ticket: FreeActionTicket, spec: VariantSpec, cfg = freeActionConfig()): number {
  const tier = dangerTierOf(save, cfg), shift = cfg.classes[spec.actionClass]?.dangerTierShift?.[tier] ?? 0;
  return (spec.difficulty as number) + shift + difficultyModifiers({ save, spec, ticket, tier });
}
