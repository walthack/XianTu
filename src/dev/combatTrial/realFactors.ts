// 基础判定因子取自真实判定引擎（judgementPreflight.buildEventActionJudgementProposal），
// 只做两处替换：幸运不再随机而是按气运取固定值（试玩要可复现、可比较）；再加上本场的浓雾环境。
import type { SaveData } from '@/types/game';
import type { JudgementKind } from '@/utils/judgementEngine';
import { buildEventActionJudgementProposal } from '@/utils/judgementPreflight';
import { fixedLuck, type Factor } from './engine';
import { F03_EVENT_ID } from './f03Scenario';

export const FOG_FACTOR: Factor = { label: '环境：浓雾', value: -3, source: 'environment' };

export function effectiveFortune(save: SaveData): number {
  const identity = (save as any)?.角色?.身份;
  const innate = Number(identity?.先天六司?.气运) || 5;
  const acquired = Number(identity?.后天六司?.气运) || 0;
  return Math.min(10, Math.max(0, innate + acquired));
}

export function realBaseFactors(save: SaveData, kind: JudgementKind): Factor[] {
  const proposal = buildEventActionJudgementProposal(save, 0, {
    eventId: F03_EVENT_ID,
    actionId: 'trial_combat_preview',
    actionText: '山涧雾战',
    contractHash: 'combat-trial',
    judgement: { kind, difficulty: 'normal', difficultyValue: 15, successOutcomes: ['success', 'great_success', 'perfect'] },
  });
  const fortune = effectiveFortune(save);
  const factors: Factor[] = proposal.factors
    .map(factor => (factor.label === '幸运'
      ? { ...factor, label: `幸运（气运 ${fortune}，固定值）`, value: fixedLuck(fortune) }
      : factor))
    // 数值为 0 的环境项没有信息量，不占卡片位置。
    .filter(factor => !(factor.source === 'environment' && factor.value === 0));
  return [...factors, FOG_FACTOR];
}
