import { rollD20 } from './diceRoller';
import { JUDGEMENT_STATE_PATH, type TurnJudgementData } from './judgementRules';
import type { WorldSimulationAuthorityReceipt } from '@/modules/scenarioMods/worldSimulation';

export interface EventActionJudgementReceipt {
  kind: 'event_action_judgement';
  eventId: string;
  actionId: string;
  contractHash: string;
}

export type JudgementAuthorityReceipt = WorldSimulationAuthorityReceipt | EventActionJudgementReceipt;

export interface JudgementSpiritCost {
  onResolveRatio: number;
  criticalFailureRatio: number;
}

export type JudgementKind =
  | 'combat'
  | 'cultivate'
  | 'craft'
  | 'explore'
  | 'social'
  | 'escape'
  | 'stealth'
  | 'scheme';

export type JudgementDifficultyBand = 'easy' | 'normal' | 'hard' | 'severe' | 'extreme';
export type JudgementOutcome = 'critical_failure' | 'failure' | 'partial' | 'success' | 'great_success' | 'perfect';
export type JudgementCanonPolicy = 'free' | 'route_process_only' | 'if_only';

export interface JudgementFactor {
  label: string;
  value: number;
  source: 'attribute' | 'realm' | 'skill' | 'talent' | 'item' | 'condition' | 'environment' | 'ally';
}

export interface JudgementProposal {
  id: string;
  status: 'pending';
  actionText: string;
  actionHash: string;
  kind: JudgementKind;
  target?: string;
  whyNow: string;
  difficulty: { band: JudgementDifficultyBand; value: number };
  factors: JudgementFactor[];
  stakes: {
    perfect?: string;
    greatSuccess?: string;
    success: string;
    partial: string;
    failure: string;
    criticalFailure?: string;
  };
  canonPolicy: JudgementCanonPolicy;
  sourceEventId?: string;
  /** 仅由本地合同签发；玩家输入和 LLM 正文都不能自行构造真值。 */
  authorityReceipt?: JudgementAuthorityReceipt;
  /** false 时不套用自我疗伤回血。缺省保持关键词修炼的既有行为。 */
  applyCultivationRecovery?: boolean;
  spiritCost?: JudgementSpiritCost;
  createdAtTurn: number;
}

export interface JudgementResolution extends Omit<JudgementProposal, 'status'> {
  status: 'resolved' | 'cancelled';
  roll?: number;
  total?: number;
  outcome?: JudgementOutcome;
  /** Present only when a development-only test control forced the result. */
  testOverride?: JudgementOutcome;
  appliedEffects: Array<{ key: string; action: string; value: unknown }>;
  resolvedAtTurn: number;
}

export interface JudgementState {
  version: 1;
  pending?: JudgementProposal;
  recent: JudgementResolution[];
}

export type CreateJudgementProposalInput = Omit<JudgementProposal, 'id' | 'status' | 'actionHash'> & {
  id?: string;
};

export interface ResolveJudgementOptions {
  currentTurn: number;
  roll?: () => number;
  appliedEffects?: JudgementResolution['appliedEffects'];
  testOutcome?: JudgementOutcome;
}

const MAX_RECENT_RESOLUTIONS = 20;
let judgementInstanceSequence = 0;

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizeTurn(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? Math.floor(numberValue) : 0;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Small stable hash; it identifies an action across reload/retry without using browser-only crypto APIs. */
export function hashJudgementAction(actionText: string): string {
  let hash = 2166136261;
  for (const char of normalizeText(actionText)) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function readRawState(saveData: unknown): unknown {
  const root = saveData as Record<string, any> | null;
  return root?.系统?.扩展?.判定;
}

function isDifficultyBand(value: unknown): value is JudgementDifficultyBand {
  return ['easy', 'normal', 'hard', 'severe', 'extreme'].includes(String(value));
}

function isKind(value: unknown): value is JudgementKind {
  return ['combat', 'cultivate', 'craft', 'explore', 'social', 'escape', 'stealth', 'scheme'].includes(String(value));
}

function normalizeFactor(raw: unknown): JudgementFactor | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const factor = raw as Partial<JudgementFactor>;
  const label = normalizeText(factor.label);
  const value = Number(factor.value);
  const source = factor.source;
  if (!label || !Number.isFinite(value)) return null;
  if (!['attribute', 'realm', 'skill', 'talent', 'item', 'condition', 'environment', 'ally'].includes(String(source))) return null;
  return { label, value, source: source as JudgementFactor['source'] };
}

function normalizeSpiritCost(raw: unknown): JudgementSpiritCost | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Partial<JudgementSpiritCost>;
  const onResolveRatio = Number(value.onResolveRatio);
  const criticalFailureRatio = Number(value.criticalFailureRatio);
  if (!Number.isFinite(onResolveRatio) || onResolveRatio < 0 || onResolveRatio > 1) return undefined;
  if (!Number.isFinite(criticalFailureRatio) || criticalFailureRatio < 0 || criticalFailureRatio > 1) return undefined;
  return { onResolveRatio, criticalFailureRatio };
}

function normalizeAuthorityReceipt(raw: unknown): JudgementAuthorityReceipt | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Partial<JudgementAuthorityReceipt> & { kind?: string };
  if (value.kind === 'event_action_judgement') {
    const receipt = value as Partial<EventActionJudgementReceipt>;
    const eventId = normalizeText(receipt.eventId);
    const actionId = normalizeText(receipt.actionId);
    const contractHash = normalizeText(receipt.contractHash);
    if (!eventId || !actionId || !contractHash) return undefined;
    return { kind: 'event_action_judgement', eventId, actionId, contractHash };
  }
  if (value.kind !== 'world_sim_intervention') return undefined;
  const intervention = value as Partial<WorldSimulationAuthorityReceipt>;
  const fields = ['situationId', 'outcomeId', 'sourceEventId', 'branchId', 'interventionId'] as const;
  if (fields.some(field => !normalizeText(intervention[field]))) return undefined;
  return {
    kind: 'world_sim_intervention',
    situationId: normalizeText(intervention.situationId),
    outcomeId: normalizeText(intervention.outcomeId),
    sourceEventId: normalizeText(intervention.sourceEventId),
    branchId: normalizeText(intervention.branchId),
    interventionId: normalizeText(intervention.interventionId),
  };
}

function normalizeProposal(raw: unknown): JudgementProposal | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Partial<JudgementProposal>;
  const actionText = normalizeText(value.actionText);
  const whyNow = normalizeText(value.whyNow);
  const difficultyValue = Number(value.difficulty?.value);
  const difficultyBand = value.difficulty?.band;
  if (
    value.status !== 'pending' ||
    !normalizeText(value.id) ||
    !actionText ||
    !isKind(value.kind) ||
    !whyNow ||
    !isDifficultyBand(difficultyBand) ||
    !Number.isFinite(difficultyValue)
  ) return null;

  const stakes = value.stakes;
  if (!stakes || !normalizeText(stakes.success) || !normalizeText(stakes.partial) || !normalizeText(stakes.failure)) return null;
  const canonPolicy: JudgementCanonPolicy = ['free', 'route_process_only', 'if_only'].includes(String(value.canonPolicy))
    ? value.canonPolicy as JudgementCanonPolicy
    : 'free';
  const factors = Array.isArray(value.factors)
    ? value.factors.map(normalizeFactor).filter((factor): factor is JudgementFactor => !!factor)
    : [];

  return {
    id: normalizeText(value.id),
    status: 'pending',
    actionText,
    actionHash: normalizeText(value.actionHash) || hashJudgementAction(actionText),
    kind: value.kind,
    ...(normalizeText(value.target) ? { target: normalizeText(value.target) } : {}),
    whyNow,
    difficulty: { band: difficultyBand, value: difficultyValue },
    factors,
    stakes: {
      ...(normalizeText(stakes.perfect) ? { perfect: normalizeText(stakes.perfect) } : {}),
      ...(normalizeText(stakes.greatSuccess) ? { greatSuccess: normalizeText(stakes.greatSuccess) } : {}),
      success: normalizeText(stakes.success),
      partial: normalizeText(stakes.partial),
      failure: normalizeText(stakes.failure),
      ...(normalizeText(stakes.criticalFailure) ? { criticalFailure: normalizeText(stakes.criticalFailure) } : {}),
    },
    canonPolicy,
    ...(normalizeText(value.sourceEventId) ? { sourceEventId: normalizeText(value.sourceEventId) } : {}),
    ...(normalizeAuthorityReceipt(value.authorityReceipt)
      ? { authorityReceipt: normalizeAuthorityReceipt(value.authorityReceipt) }
      : {}),
    ...(value.applyCultivationRecovery === false ? { applyCultivationRecovery: false } : {}),
    ...(normalizeSpiritCost(value.spiritCost) ? { spiritCost: normalizeSpiritCost(value.spiritCost) } : {}),
    createdAtTurn: normalizeTurn(value.createdAtTurn),
  };
}

function normalizeResolution(raw: unknown): JudgementResolution | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Partial<JudgementResolution>;
  const proposal = normalizeProposal({ ...value, status: 'pending' });
  if (!proposal || !['resolved', 'cancelled'].includes(String(value.status))) return null;
  const status = value.status as JudgementResolution['status'];
  const roll = value.roll === undefined ? undefined : Number(value.roll);
  const total = value.total === undefined ? undefined : Number(value.total);
  const outcome = value.outcome;
  const testOverride = isOutcome(value.testOverride) ? value.testOverride : undefined;
  if (
    status === 'resolved' &&
    (typeof roll !== 'number' || !Number.isInteger(roll) || roll < 1 || roll > 20 ||
      typeof total !== 'number' || !Number.isFinite(total) || !isOutcome(outcome))
  ) return null;
  const appliedEffects = Array.isArray(value.appliedEffects)
    ? value.appliedEffects.filter(effect => effect && typeof effect === 'object' && normalizeText((effect as any).key) && normalizeText((effect as any).action))
        .map(effect => ({ key: normalizeText((effect as any).key), action: normalizeText((effect as any).action), value: (effect as any).value }))
    : [];
  return {
    ...proposal,
    status,
    ...(status === 'resolved' ? { roll, total, outcome } : {}),
    ...(testOverride ? { testOverride } : {}),
    appliedEffects,
    resolvedAtTurn: normalizeTurn(value.resolvedAtTurn),
  };
}

function isOutcome(value: unknown): value is JudgementOutcome {
  return ['critical_failure', 'failure', 'partial', 'success', 'great_success', 'perfect'].includes(String(value));
}

/** Safe reader for old or malformed saves; invalid entries do not become game facts. */
export function getJudgementState(saveData: unknown): JudgementState {
  const raw = readRawState(saveData);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { version: 1, recent: [] };
  const value = raw as Partial<JudgementState>;
  const pending = normalizeProposal(value.pending);
  const recent = Array.isArray(value.recent)
    ? value.recent.map(normalizeResolution).filter((resolution): resolution is JudgementResolution => !!resolution).slice(-MAX_RECENT_RESOLUTIONS)
    : [];
  return { version: 1, ...(pending ? { pending } : {}), recent };
}

function judgementAuthoritySnapshot(resolution: JudgementResolution): Record<string, unknown> {
  return {
    id: resolution.id,
    status: resolution.status,
    actionText: resolution.actionText,
    actionHash: resolution.actionHash,
    kind: resolution.kind,
    target: resolution.target ?? null,
    whyNow: resolution.whyNow,
    difficulty: resolution.difficulty,
    factors: resolution.factors,
    stakes: resolution.stakes,
    canonPolicy: resolution.canonPolicy,
    sourceEventId: resolution.sourceEventId ?? null,
    authorityReceipt: resolution.authorityReceipt ?? null,
    createdAtTurn: resolution.createdAtTurn,
    roll: resolution.roll ?? null,
    total: resolution.total ?? null,
    outcome: resolution.outcome ?? null,
    testOverride: resolution.testOverride ?? null,
    appliedEffects: resolution.appliedEffects,
    resolvedAtTurn: resolution.resolvedAtTurn,
  };
}

/**
 * Returns the save's trusted resolved copy when the caller receipt matches
 * the current judgement ledger. Fail closed: never throws.
 */
export function verifyResolvedJudgementReceipt(
  saveData: unknown,
  resolution: JudgementResolution | null | undefined,
): JudgementResolution | null {
  try {
    if (!resolution || typeof resolution !== 'object' || Array.isArray(resolution)) return null;
    if (resolution.status !== 'resolved') return null;
    const state = getJudgementState(saveData);
    if (state.pending) return null;
    const recent = state.recent.find(item => item.id === resolution.id);
    if (!recent || recent.status !== 'resolved') return null;
    if (JSON.stringify(judgementAuthoritySnapshot(recent)) !== JSON.stringify(judgementAuthoritySnapshot(resolution))) {
      return null;
    }
    return clone(recent);
  } catch {
    return null;
  }
}

export function describeJudgementOutcomeText(resolution: JudgementResolution): string {
  const stakes = resolution.stakes;
  if (resolution.outcome === 'perfect') return normalizeText(stakes.perfect) || normalizeText(stakes.greatSuccess) || normalizeText(stakes.success);
  if (resolution.outcome === 'great_success') return normalizeText(stakes.greatSuccess) || normalizeText(stakes.success);
  if (resolution.outcome === 'success') return normalizeText(stakes.success);
  if (resolution.outcome === 'partial') return normalizeText(stakes.partial);
  if (resolution.outcome === 'critical_failure') return normalizeText(stakes.criticalFailure) || normalizeText(stakes.failure);
  if (resolution.outcome === 'failure') return normalizeText(stakes.failure);
  return '';
}

export function formatVerifiedJudgementReceiptForPrompt(resolution: JudgementResolution): string {
  const effectSummary = (resolution.appliedEffects || []).map(describeJudgementEffect).join('；') || '无';
  const outcomeText = describeJudgementOutcomeText(resolution) || '无';
  return [
    '只可演出同一判定ID给出的既定骰点、总值、结果与已写入效果；不得重新计算、掷骰或输出判定卡。',
    `动作=${resolution.actionText}`,
    `判定ID=${resolution.id}`,
    `类型=${resolution.kind}`,
    `骰点=${resolution.roll}`,
    `总值=${resolution.total}`,
    `难度=${resolution.difficulty.value}`,
    `结果=${resolution.outcome}`,
    `正典策略=${resolution.canonPolicy}`,
    `结果文案=${outcomeText}`,
    `已写入=${effectSummary}`,
  ].join('；');
}

export function judgementHasLocalCombatHpWrite(resolution: JudgementResolution | null | undefined): boolean {
  if (!resolution || resolution.status !== 'resolved' || resolution.kind !== 'combat') return false;
  return (resolution.appliedEffects || []).some(effect => effect.key === '角色.属性.气血.当前');
}

function writeJudgementState(saveData: unknown, state: JudgementState): void {
  const root = saveData as Record<string, any>;
  if (!root || typeof root !== 'object') throw new Error('无法写入判定状态：存档无效');
  if (!root.系统 || typeof root.系统 !== 'object') root.系统 = {};
  if (!root.系统.扩展 || typeof root.系统.扩展 !== 'object') root.系统.扩展 = {};
  root.系统.扩展.判定 = clone(state);
}

export function createJudgementProposal(input: CreateJudgementProposalInput): JudgementProposal {
  const actionText = normalizeText(input.actionText);
  if (!actionText) throw new Error('判定行动不能为空');
  const currentTurn = normalizeTurn(input.createdAtTurn);
  const actionHash = hashJudgementAction(actionText);
  return {
    ...input,
    // actionHash identifies the wording; the suffix identifies this distinct attempt.
    // A cancelled attempt must never shadow a later retry of the same wording.
    id: normalizeText(input.id) || `judge-${currentTurn}-${actionHash}-${Date.now().toString(36)}-${++judgementInstanceSequence}`,
    status: 'pending',
    actionText,
    actionHash,
    target: normalizeText(input.target) || undefined,
    whyNow: normalizeText(input.whyNow),
    factors: input.factors.map(factor => ({ ...factor, label: normalizeText(factor.label), value: Number(factor.value) })),
    stakes: {
      ...(normalizeText(input.stakes.perfect) ? { perfect: normalizeText(input.stakes.perfect) } : {}),
      ...(normalizeText(input.stakes.greatSuccess) ? { greatSuccess: normalizeText(input.stakes.greatSuccess) } : {}),
      success: normalizeText(input.stakes.success),
      partial: normalizeText(input.stakes.partial),
      failure: normalizeText(input.stakes.failure),
      ...(normalizeText(input.stakes.criticalFailure) ? { criticalFailure: normalizeText(input.stakes.criticalFailure) } : {}),
    },
    sourceEventId: normalizeText(input.sourceEventId) || undefined,
    createdAtTurn: currentTurn,
  };
}

/** Stores exactly one pending proposal. Existing pending work is never overwritten silently. */
export function persistPendingJudgement(saveData: unknown, proposal: JudgementProposal): JudgementProposal {
  const state = getJudgementState(saveData);
  if (state.pending) {
    if (state.pending.id === proposal.id) return clone(state.pending);
    throw new Error('已有待确认判定；请先执行、换一种做法或撤回');
  }
  writeJudgementState(saveData, { ...state, pending: clone(proposal) });
  return clone(proposal);
}

export function outcomeForTotal(total: number, difficulty: number): JudgementOutcome {
  if (total >= difficulty + 30) return 'perfect';
  if (total >= difficulty + 15) return 'great_success';
  if (total >= difficulty) return 'success';
  // P1 的适度软化：接近难度时保留代价成功空间；P2 UI 会明确展示该后果。
  if (total >= difficulty - 5) return 'partial';
  if (total >= difficulty - 15) return 'failure';
  return 'critical_failure';
}

function archiveResolution(state: JudgementState, resolution: JudgementResolution): JudgementState {
  return {
    version: 1,
    recent: [...state.recent.filter(item => item.id !== resolution.id), resolution].slice(-MAX_RECENT_RESOLUTIONS),
  };
}

function gateScopeFor(kind: JudgementKind): string {
  if (kind === 'combat' || kind === 'escape') return 'combat';
  if (kind === 'social' || kind === 'scheme') return 'social';
  return 'scene';
}

const CULTIVATION_RECOVERY_KEYWORDS = /疗伤|疗愈|调息|恢复|修复|经脉|丹田|双修/;
const CULTIVATION_RECOVERY_RATIO: Partial<Record<JudgementOutcome, number>> = {
  partial: .05,
  success: .15,
  great_success: .3,
  perfect: .4,
};

function targetAfterRecovery(root: any, attribute: '气血' | '神识', ratio: number): number | null {
  const current = Number(root?.角色?.属性?.[attribute]?.当前);
  const max = Number(root?.角色?.属性?.[attribute]?.上限);
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) return null;
  return Math.min(max, Math.max(0, current + Math.max(1, Math.round(max * ratio))));
}

function spiritCostEffects(
  saveData: unknown,
  proposal: JudgementProposal,
  outcome: JudgementOutcome,
): JudgementResolution['appliedEffects'] {
  const cost = proposal.spiritCost;
  if (!cost) return [];
  const ratio = outcome === 'critical_failure' ? cost.criticalFailureRatio : cost.onResolveRatio;
  if (!Number.isFinite(ratio) || ratio <= 0) return [];
  const root = saveData as any;
  const current = Number(root?.角色?.属性?.神识?.当前);
  const max = Number(root?.角色?.属性?.神识?.上限);
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) return [];
  const target = Math.max(0, current - Math.max(0, Math.round(max * ratio)));
  if (target === current) return [];
  return [{ key: '角色.属性.神识.当前', action: 'set', value: target }];
}

/** C02：合意须明确记录；强迫信号优先，药物/控制不能充当同意。 */
export function mutualCultivationConsent(actionText: string): 'consensual' | 'unconfirmed' | 'coercive' {
  if (!/双修|采补/.test(actionText)) return 'unconfirmed';
  if (/强迫|胁迫|逼迫|迫使|威胁|迷药|麻古|下药|催情|制住|制服|控制|绑住|束缚|强行|不愿|不情愿|不同意|不合意|非自愿|被迫|拒绝|昏迷|失去意识|神志不清|不能反抗|不得不|乘人之危/.test(actionText)) return 'coercive';
  return /双方(?:都)?(?:合意|同意|自愿)|两人(?:都)?(?:同意|自愿)|彼此(?:同意|自愿)/.test(actionText) ? 'consensual' : 'unconfirmed';
}

function cultivationRecoveryEffects(saveData: unknown, proposal: JudgementProposal, outcome: JudgementOutcome): JudgementResolution['appliedEffects'] {
  const ratio = CULTIVATION_RECOVERY_RATIO[outcome];
  if (
    proposal.applyCultivationRecovery === false
    || proposal.kind !== 'cultivate'
    || !ratio
    || !CULTIVATION_RECOVERY_KEYWORDS.test(proposal.actionText)
  ) return [];
  const root = saveData as any;
  const effects: JudgementResolution['appliedEffects'] = [];
  for (const attribute of ['气血', '神识'] as const) {
    const target = targetAfterRecovery(root, attribute, ratio);
    if (target !== null) effects.push({ key: `角色.属性.${attribute}.当前`, action: 'set', value: target });
  }
  if (/双修/.test(proposal.actionText)) {
    const durationByOutcome: Partial<Record<JudgementOutcome, number>> = {
      partial: 120, success: 240, great_success: 360, perfect: 480,
    };
    effects.push({
      key: '角色.效果', action: 'upsert', value: {
        状态名称: '阴阳调和', 类型: 'buff', 生成时间: clone(root?.元数据?.时间 || {}),
        持续时间分钟: durationByOutcome[outcome] || 120,
        状态描述: '本地双修疗伤结算获得：修炼速度+10%，伤势恢复速度+20%，双修效果+30%。',
        强度: 1, 来源: '本地判定',
      },
    });
  }
  return effects;
}

function deterministicOutcomeEffects(saveData: unknown, proposal: JudgementProposal, outcome: JudgementOutcome, currentTurn: number): JudgementResolution['appliedEffects'] {
  const effects: JudgementResolution['appliedEffects'] = [];
  if (/双修|采补/.test(proposal.actionText) && mutualCultivationConsent(proposal.actionText) !== 'consensual') {
    return []; // 非自愿/未确认合意不恢复、不发buff，也不接收外部增益。
  }
  if (['partial', 'success', 'great_success', 'perfect'].includes(outcome)) {
    effects.push(...cultivationRecoveryEffects(saveData, proposal, outcome));
  }
  effects.push(...spiritCostEffects(saveData, proposal, outcome));
  if (!['partial', 'failure', 'critical_failure'].includes(outcome)) return effects;
  if (proposal.kind === 'combat') {
    const root = saveData as any;
    const current = Number(root?.角色?.属性?.气血?.当前);
    const max = Number(root?.角色?.属性?.气血?.上限);
    const ratio = outcome === 'critical_failure' ? .4 : outcome === 'failure' ? .15 : .05;
    if (Number.isFinite(current) && Number.isFinite(max) && current > 1 && max > 0) {
      effects.push({ key: '角色.属性.气血.当前', action: 'add', value: -Math.min(current - 1, Math.max(1, Math.round(max * ratio))) });
    }
  }
  const gateOutcome = outcome === 'partial' ? 'partial' : 'failure';
  const severity = outcome === 'critical_failure' ? '局势明显恶化' : outcome === 'failure' ? '行动受阻' : '目标虽有进展但留下破绽';
  effects.push({
    key: '系统.扩展.行动门控.recent',
    action: 'push',
    value: {
      actionLabel: proposal.actionText.slice(0, 48),
      outcome: gateOutcome,
      scope: gateScopeFor(proposal.kind),
      ...(proposal.target ? { target: proposal.target } : {}),
      reason: `${severity}（本地判定：${outcome}）`,
      effect: '重复同一路线须承接既有余波，改做准备、绕行或换目标可降低风险。',
      createdAtTurn: currentTurn,
      ttlTurns: 3,
    },
  });
  return effects;
}

function applyDeterministicEffects(saveData: unknown, effects: JudgementResolution['appliedEffects']): void {
  if (!effects.length) return;
  const root = saveData as any;
  if (!root.系统) root.系统 = {};
  if (!root.系统.扩展) root.系统.扩展 = {};
  if (!root.系统.扩展.行动门控) root.系统.扩展.行动门控 = { version: 1, recent: [] };
  if (!Array.isArray(root.系统.扩展.行动门控.recent)) root.系统.扩展.行动门控.recent = [];
  for (const effect of effects) {
    if (effect.key === '角色.属性.气血.当前' && effect.action === 'add' && typeof effect.value === 'number') {
      root.角色 ??= {}; root.角色.属性 ??= {}; root.角色.属性.气血 ??= {};
      root.角色.属性.气血.当前 = Math.max(1, Number(root.角色.属性.气血.当前 || 1) + effect.value);
    }
    if (effect.key === '角色.属性.神识.当前' && effect.action === 'add' && typeof effect.value === 'number') {
      root.角色 ??= {}; root.角色.属性 ??= {}; root.角色.属性.神识 ??= {};
      const max = Number(root.角色.属性.神识.上限);
      const next = Number(root.角色.属性.神识.当前 || 0) + effect.value;
      root.角色.属性.神识.当前 = Number.isFinite(max) && max > 0
        ? Math.min(max, Math.max(0, Math.round(next)))
        : Math.max(0, Math.round(next));
    }
    if ((effect.key === '角色.属性.气血.当前' || effect.key === '角色.属性.神识.当前') && effect.action === 'set' && typeof effect.value === 'number') {
      const attribute = effect.key.includes('气血') ? '气血' : '神识';
      root.角色 ??= {}; root.角色.属性 ??= {}; root.角色.属性[attribute] ??= {};
      const max = Number(root.角色.属性[attribute].上限);
      root.角色.属性[attribute].当前 = Number.isFinite(max)
        ? Math.min(max, Math.max(0, Math.round(effect.value)))
        : Math.max(0, Math.round(effect.value));
    }
    if (effect.key === '角色.效果' && effect.action === 'upsert' && effect.value && typeof effect.value === 'object') {
      const status = clone(effect.value as Record<string, unknown>);
      const name = normalizeText(status.状态名称);
      if (name) {
        root.角色 ??= {}; root.角色.效果 ??= [];
        if (!Array.isArray(root.角色.效果)) root.角色.效果 = [];
        const index = root.角色.效果.findIndex((item: any) => normalizeText(item?.状态名称) === name);
        if (index >= 0) root.角色.效果[index] = status;
        else root.角色.效果.push(status);
      }
    }
    if (effect.key === '系统.扩展.行动门控.recent' && effect.action === 'push') root.系统.扩展.行动门控.recent.push(clone(effect.value));
  }
}

/** User-facing receipt text for deterministic changes; never inferred from model prose. */
export function describeJudgementEffect(effect: JudgementResolution['appliedEffects'][number]): string {
  if (effect.key === '角色.属性.气血.当前') return effect.action === 'set' ? `气血恢复至 ${effect.value}` : `气血 ${Number(effect.value) >= 0 ? '+' : ''}${effect.value}`;
  if (effect.key === '角色.属性.神识.当前') return effect.action === 'set' ? `神识恢复至 ${effect.value}` : `神识 ${Number(effect.value) >= 0 ? '+' : ''}${effect.value}`;
  if (effect.key === '角色.效果' && effect.action === 'upsert') return `获得临时状态「${(effect.value as any)?.状态名称 || '未知'}」`;
  if (effect.key === '系统.扩展.行动门控.recent') return '写入行动余波';
  return `${effect.key} ${effect.action}`;
}

/**
 * Resolves a persisted pending proposal once. Calling it again with the same id returns the
 * stored resolution, so retry/reload cannot reroll or duplicate effects.
 */
export function resolvePendingJudgement(
  saveData: unknown,
  judgementId: string,
  options: ResolveJudgementOptions,
): JudgementResolution {
  const state = getJudgementState(saveData);
  const existing = state.recent.find(item => item.id === judgementId);
  if (existing) return clone(existing);
  if (!state.pending || state.pending.id !== judgementId) throw new Error('找不到待确认判定');

  const roll = Math.max(1, Math.min(20, Math.floor((options.roll || rollD20)())));
  const total = roll + state.pending.factors.reduce((sum, factor) => sum + factor.value, 0);
  const testOutcome = options.testOutcome && isOutcome(options.testOutcome) ? options.testOutcome : undefined;
  const consentBlocked = /双修|采补/.test(state.pending.actionText) && mutualCultivationConsent(state.pending.actionText) !== 'consensual';
  const outcome = consentBlocked ? 'failure' : testOutcome || outcomeForTotal(total, state.pending.difficulty.value);
  const appliedEffects = consentBlocked ? [] : options.appliedEffects ? clone(options.appliedEffects) : deterministicOutcomeEffects(saveData, state.pending, outcome, normalizeTurn(options.currentTurn));
  const resolution: JudgementResolution = {
    ...state.pending,
    status: 'resolved',
    roll,
    total,
    outcome,
    ...(testOutcome ? { testOverride: testOutcome } : {}),
    appliedEffects,
    resolvedAtTurn: normalizeTurn(options.currentTurn),
  };
  applyDeterministicEffects(saveData, appliedEffects);
  writeJudgementState(saveData, archiveResolution(state, resolution));
  return clone(resolution);
}

/** Cancellation is an auditable no-op: no die roll and no applied effects. */
export function cancelPendingJudgement(saveData: unknown, judgementId: string, currentTurn: number): JudgementResolution {
  const state = getJudgementState(saveData);
  const existing = state.recent.find(item => item.id === judgementId);
  if (existing) return clone(existing);
  if (!state.pending || state.pending.id !== judgementId) throw new Error('找不到待确认判定');
  const resolution: JudgementResolution = {
    ...state.pending,
    status: 'cancelled',
    appliedEffects: [],
    resolvedAtTurn: normalizeTurn(currentTurn),
  };
  writeJudgementState(saveData, archiveResolution(state, resolution));
  return clone(resolution);
}

/** P1's shared, inspectable environment factor for proposal builders. */
export function environmentFactorFor(kind: JudgementKind, data: TurnJudgementData): JudgementFactor {
  const value = kind === 'cultivate'
    ? data.环境.修炼修正
    : kind === 'craft'
      ? data.环境.炼制修正
      : data.环境.战斗修正;
  return { label: '环境', value, source: 'environment' };
}

export { JUDGEMENT_STATE_PATH };
