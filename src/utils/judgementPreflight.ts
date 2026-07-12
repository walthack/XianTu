import {
  createJudgementProposal,
  environmentFactorFor,
  type CreateJudgementProposalInput,
  type JudgementKind,
  type JudgementProposal,
} from './judgementEngine';
import { calculateTurnJudgementData } from './judgementRules';
import { getCanonRailContract, getCanonRailProfile } from '@/modules/scenarioMods/canonRail';
import { getNarrativeAnchorEvent } from '@/modules/scenarioMods/runtime';

const KEYWORDS: Array<[JudgementKind, RegExp]> = [
  ['combat', /攻击|出手|斩|杀|斗法|交手|战斗|迎战/],
  ['escape', /逃|撤退|脱身|突围/],
  ['stealth', /潜入|潜行|偷|窃|暗杀|躲过/],
  ['explore', /探索|搜查|探查|翻越|闯入|调查/],
  ['craft', /炼丹|炼器|制符|布阵|炼制/],
  ['cultivate', /突破|闭关|修炼|冲关|双修|调息|疗伤/],
  ['social', /说服|威胁|交涉|谈判|收服|招揽/],
];
const EXPLICIT_IF_INTENT = /收服|招揽|结盟|策反|纳入后宫|纳妾|改写命运|救下.*不死|提前杀死/;

/** The queued action is part of the submitted intent and must be preflighted too. */
export function composeJudgementAction(intentText: string, actionQueueText: string): string {
  const intent = intentText.trim();
  const queue = actionQueueText.trim();
  if (!queue || intent.includes(queue)) return intent;
  if (!intent) return queue;
  return `${intent}\n\n${queue}`;
}

const STAT_WEIGHTS: Record<JudgementKind, Array<[string, number]>> = {
  combat: [['根骨', .5], ['灵性', .3], ['气运', .2]], cultivate: [['悟性', .5], ['灵性', .3], ['心性', .2]],
  craft: [['悟性', .5], ['灵性', .3], ['心性', .2]], explore: [['气运', .5], ['灵性', .3], ['悟性', .2]],
  social: [['魅力', .5], ['悟性', .3], ['心性', .2]], escape: [['灵性', .5], ['气运', .3], ['根骨', .2]],
  stealth: [['灵性', .5], ['气运', .3], ['心性', .2]], scheme: [['悟性', .5], ['心性', .3], ['魅力', .2]],
};

function numeric(value: unknown): number { const n = Number(value); return Number.isFinite(n) ? n : 0; }

function stateFactors(kind: JudgementKind, saveData: any) {
  const innate = saveData?.角色?.身份?.先天六司 || {};
  const acquired = saveData?.角色?.身份?.后天六司 || {};
  const weighted = STAT_WEIGHTS[kind].reduce((sum, [key, weight]) => sum + (numeric(innate[key]) + numeric(acquired[key])) * weight, 0);
  const factors: any[] = [{ label: '六司', value: Math.round(weighted), source: 'attribute' }];
  const hp = saveData?.角色?.属性?.气血;
  if (numeric(hp?.上限) > 0 && numeric(hp?.当前) / numeric(hp?.上限) < .25) factors.push({ label: '重伤', value: -15, source: 'condition' });
  return factors;
}

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
  const runtime = saveData?.世界?.状态?.剧本模组;
  const profile = getCanonRailProfile(runtime);
  const activeEventId = getNarrativeAnchorEvent(runtime || {})?.id
    || (Array.isArray(runtime?.activeEventIds) ? runtime.activeEventIds[0] : undefined);
  const contract = activeEventId ? getCanonRailContract(profile, activeEventId) : null;
  // IF 改写是正典边界，不依赖“战斗/潜入”等普通风险词命中。
  if (contract && EXPLICIT_IF_INTENT.test(normalized)) {
    return createJudgementProposal({
      actionText: normalized, kind: 'scheme', whyNow: '此行动会改写活动正典拍，默认线必须先进入显式 IF。',
      difficulty: { band: 'extreme', value: 100 }, factors: [],
      stakes: { greatSuccess: '仅 IF 支线可继续裁定。', success: '仅 IF 支线可继续裁定。', partial: '默认线不产生部分成功。', failure: '默认线拒绝执行。' },
      canonPolicy: 'if_only', sourceEventId: contract.eventId, createdAtTurn: currentTurn,
    });
  }
  const matched = KEYWORDS.find(([, matcher]) => matcher.test(normalized));
  if (!matched) return null;
  const [kind] = matched;
  const data = calculateTurnJudgementData(
    saveData?.角色?.身份?.先天六司,
    saveData?.角色?.身份?.后天六司,
    saveData?.角色?.位置,
  );
  const stakes = {
    perfect: '以压倒性优势达成目标，且不留下额外代价。',
    greatSuccess: '大幅推进当前目标，并取得额外收益。',
    success: '按当前做法取得直接进展。',
    partial: '达成部分目标，但会留下代价或余波。',
    failure: '行动受阻，局势可能恶化；可以换做法或先准备。',
    criticalFailure: '局势显著恶化，必须承接更重的余波。',
  };
  return createJudgementProposal({
    actionText: normalized,
    kind,
    whyNow: '该行动存在可见风险或资源代价，需在叙事前确认。',
    difficulty: difficultyFor(kind),
    factors: [
      ...stateFactors(kind, saveData),
      { label: '幸运', value: data.幸运点, source: 'condition' },
      environmentFactorFor(kind, data),
    ],
    stakes,
    canonPolicy: contract ? 'route_process_only' : 'free',
    ...(contract ? { sourceEventId: contract.eventId } : {}),
    createdAtTurn: currentTurn,
  });
}
