import {
  createJudgementProposal,
  environmentFactorFor,
  type CreateJudgementProposalInput,
  type JudgementKind,
  type JudgementProposal,
} from './judgementEngine';
import { calculateTurnJudgementData } from './judgementRules';

const KEYWORDS: Array<[JudgementKind, RegExp]> = [
  ['combat', /攻击|出手|斩|杀|斗法|交手|战斗|迎战/],
  ['escape', /逃|撤退|脱身|突围/],
  ['stealth', /潜入|潜行|偷|窃|暗杀|躲过/],
  ['explore', /探索|搜查|探查|翻越|闯入|调查/],
  ['craft', /炼丹|炼器|制符|布阵|炼制/],
  ['cultivate', /突破|闭关|修炼|冲关/],
  ['social', /说服|威胁|交涉|谈判|收服|招揽/],
];

function difficultyFor(kind: JudgementKind): CreateJudgementProposalInput['difficulty'] {
  if (['combat', 'escape', 'stealth'].includes(kind)) return { band: 'hard', value: 20 };
  if (['cultivate', 'craft'].includes(kind)) return { band: 'severe', value: 25 };
  return { band: 'normal', value: 15 };
}

/** Conservative local classifier: uncertainty is left to normal narration, never silently rolled. */
export function buildLocalJudgementPreflight(
  actionText: string,
  saveData: any,
  currentTurn: number,
): JudgementProposal | null {
  const normalized = actionText.trim();
  const matched = KEYWORDS.find(([, matcher]) => matcher.test(normalized));
  if (!matched) return null;
  const [kind] = matched;
  const data = calculateTurnJudgementData(
    saveData?.角色?.属性?.先天六司,
    saveData?.角色?.属性?.后天六司,
    saveData?.角色?.位置,
  );
  const stakes = {
    success: '按当前做法取得直接进展。',
    partial: '达成部分目标，但会留下代价或余波。',
    failure: '行动受阻，局势可能恶化；可以换做法或先准备。',
  };
  return createJudgementProposal({
    actionText: normalized,
    kind,
    whyNow: '该行动存在可见风险或资源代价，需在叙事前确认。',
    difficulty: difficultyFor(kind),
    factors: [
      { label: '幸运', value: data.幸运点, source: 'condition' },
      environmentFactorFor(kind, data),
    ],
    stakes,
    canonPolicy: 'free',
    createdAtTurn: currentTurn,
  });
}
