/**
 * 自由行动签发判定卡：按变体行的 kind / difficulty / modifierProfile 组因子，票写进 authorityReceipt。
 * 因子只有六司加权、重伤、幸运、环境，以及 modifierProfile 声明 levelGap 时的“境界差”（source:'realm'）；
 * 玩家原话不进判定（actionText 由模板生成），所以不会命中任何关键词判定或修炼进度的正则。
 */
import type { SaveData } from '@/types/game';
import { boundedLuck, GAME_NUMBERS } from '../../sceneModule/numbers';
import { goalModifierRule, levelModifier } from '../../sceneModule/levels';
import { calculateTurnJudgementData } from '@/utils/judgementRules';
import { createJudgementProposal, environmentFactorFor, type JudgementDifficultyBand, type JudgementFactor, type JudgementProposal } from '@/utils/judgementEngine';
import { stateFactors } from '@/utils/judgementPreflight';
import { levelOf } from '@/utils/realmUtils';
import { packText } from '@/modules/contentPacks';
import { effectiveLevel, levelFact } from '../characterLevels';
import { relationshipOf } from '../ledger/affinityIdentity';
import { namingChapter } from '../ledger/naming';
import { combatLevelOf, resolveActorStats } from '../characterStats';
import { freeActionConfig, type VariantSpec } from './config';
import { whyNowText } from './facts';
import type { FreeActionTicket } from './ticket';

const runtimeOf = (save: unknown): any => (save as any)?.世界?.状态?.剧本模组;

function bandFor(value: number): JudgementDifficultyBand {
  const bands = freeActionConfig().judgement.bands;
  return value < bands.normal ? 'easy' : value < bands.hard ? 'normal' : value < bands.severe ? 'hard' : value < bands.extreme ? 'severe' : 'extreme';
}

/** NPC 级数：时点表 → 总表合并结果/关系记录境界（与 snapshotLevels 同一回落链）→ 查不到就是 undefined（按同级，差 0）。 */
export function targetLevelOf(save: SaveData, targetId: string): number | undefined {
  const runtime = runtimeOf(save), fact = levelFact(targetId, namingChapter(runtime || {}));
  if (fact) return effectiveLevel(fact);
  const fallback = Math.max(levelOf((relationshipOf(save as any, targetId)?.profile as any)?.境界) ?? -1, combatLevelOf(resolveActorStats(runtime, targetId)?.stats) ?? -1);
  return fallback < 0 ? undefined : fallback;
}

export function buildFreeActionJudgementProposal(
  save: SaveData, currentTurn: number, ticket: FreeActionTicket, spec: VariantSpec, names: { player: string; target: string },
): JudgementProposal {
  const kind = spec.kind!, root = save as any;
  const data = calculateTurnJudgementData(root?.角色?.身份?.先天六司, root?.角色?.身份?.后天六司, root?.角色?.位置);
  const factors: JudgementFactor[] = [
    ...stateFactors(kind, root),
    { label: '幸运', value: boundedLuck(Number(root?.角色?.身份?.先天六司?.气运 ?? GAME_NUMBERS.factors.center) + Number(root?.角色?.身份?.后天六司?.气运 ?? 0)), source: 'condition' },
    environmentFactorFor(kind, data),
  ];
  if (goalModifierRule(spec.modifierProfile).levelGap) {
    const mine = levelOf(root?.角色?.属性?.境界) ?? 0, theirs = targetLevelOf(save, ticket.targetId!);
    factors.splice(1, 0, { label: theirs === undefined ? '境界差（无级数数据，按同级）' : '境界差', value: levelModifier(mine, theirs), source: 'realm' });
  }
  const stakeKey = `free.stakes.${spec.actionClass}.`, stake = (name: string) => packText(`${stakeKey}${name}`);
  return createJudgementProposal({
    actionText: `对${names.target}施行「${spec.label}」（自由行动）`,
    kind,
    target: ticket.targetId!,
    whyNow: whyNowText({ ...names, label: spec.label }),
    difficulty: { band: bandFor(spec.difficulty!), value: spec.difficulty! },
    factors,
    stakes: {
      perfect: stake('perfect'), greatSuccess: stake('greatSuccess'), success: stake('success'),
      partial: stake('partial'), failure: stake('failure'), criticalFailure: stake('criticalFailure'),
    },
    canonPolicy: 'route_process_only',
    authorityReceipt: {
      kind: 'free_action_judgement', ticketId: `${currentTurn}.${ticket.targetId}.${spec.variant}`,
      actionClass: ticket.actionClass, variant: ticket.variant, targetId: ticket.targetId!, degree: ticket.degree, itemId: ticket.itemId,
      ...(ticket.affinityDelta !== undefined ? { affinityDelta: ticket.affinityDelta } : {}),
    },
    applyCultivationRecovery: false,
    createdAtTurn: currentTurn,
  });
}

