/**
 * 自由行动签发判定卡：按变体行的 kind / difficulty / modifierProfile 组因子，票写进 authorityReceipt。
 * 因子有六司加权、重伤、幸运、环境，modifierProfile 声明 levelGap 时的“境界差”（source:'realm'），以及按行动类匹配的技能/天赋加成（没有则一行“未掌握”提示，值 0，见 skillMatch.ts）；
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
import { adjustedDifficulty } from './dangerTier';
import { whyNowText, whySelfText } from './facts';
import { skillTalentFactors } from './skillMatch';
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

/**
 * 判定卡上的行动文本，由模板生成，不含玩家原话。无对象的自修靠模板里的变体名命中旧引擎的修炼结算（trainingRealm 认“修炼/冲关”），
 * 所以变体 label 是接口的一部分——改名要同步 tests/freeActionSolo.test.mjs。
 */
export function freeActionText(spec: VariantSpec, targetName: string): string {
  return spec.target === 'none' ? `自行「${spec.label}」（自由行动）` : `对${targetName}施行「${spec.label}」（自由行动）`;
}

export function buildFreeActionJudgementProposal(
  save: SaveData, currentTurn: number, ticket: FreeActionTicket, spec: VariantSpec, names: { player: string; target: string },
): JudgementProposal {
  const kind = spec.kind!, root = save as any, difficulty = adjustedDifficulty(save, ticket, spec);
  const data = calculateTurnJudgementData(root?.角色?.身份?.先天六司, root?.角色?.身份?.后天六司, root?.角色?.位置);
  const factors: JudgementFactor[] = [
    ...stateFactors(kind, root),
    ...skillTalentFactors(save, spec),
    { label: '幸运', value: boundedLuck(Number(root?.角色?.身份?.先天六司?.气运 ?? GAME_NUMBERS.factors.center) + Number(root?.角色?.身份?.后天六司?.气运 ?? 0)), source: 'condition' },
    environmentFactorFor(kind, data),
  ];
  if (ticket.targetId && goalModifierRule(spec.modifierProfile).levelGap) {
    const mine = levelOf(root?.角色?.属性?.境界) ?? 0, theirs = targetLevelOf(save, ticket.targetId);
    factors.splice(1, 0, { label: theirs === undefined ? '境界差（无级数数据，按同级）' : '境界差', value: levelModifier(mine, theirs), source: 'realm' });
  }
  const stakeKey = `free.stakes.${spec.actionClass}.`, stake = (name: string) => packText(`${stakeKey}${name}`);
  return createJudgementProposal({
    actionText: freeActionText(spec, names.target),
    kind,
    target: ticket.targetId ?? undefined,
    whyNow: (ticket.targetId ? whyNowText : whySelfText)({ ...names, label: spec.label }),
    difficulty: { band: bandFor(difficulty), value: difficulty },
    factors,
    stakes: {
      perfect: stake('perfect'), greatSuccess: stake('greatSuccess'), success: stake('success'),
      partial: stake('partial'), failure: stake('failure'), criticalFailure: stake('criticalFailure'),
    },
    canonPolicy: 'route_process_only',
    authorityReceipt: {
      kind: 'free_action_judgement', ticketId: `${currentTurn}.${ticket.targetId ?? spec.actionClass}.${spec.variant}`,
      actionClass: ticket.actionClass, variant: ticket.variant, targetId: ticket.targetId, degree: ticket.degree, itemId: ticket.itemId,
      ...(ticket.affinityDelta !== undefined ? { affinityDelta: ticket.affinityDelta } : {}),
    },
    applyCultivationRecovery: spec.applyRecovery === true,
    createdAtTurn: currentTurn,
  });
}

