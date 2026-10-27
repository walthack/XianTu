import {trainingRealm} from '../modules/scenarioMods/levelProgression';
import { rollD20 } from './diceRoller';
import { judgementNumbers } from './judgementConfig';
import { GAME_NUMBERS } from '../modules/sceneModule/numbers';
import { affinityOf } from '../modules/scenarioMods/ledger/affinityIdentity';
import { JUDGEMENT_STATE_PATH, type TurnJudgementData } from './judgementRules';
import type { ActionClass, Degree } from '@/modules/scenarioMods/freeAction/config';
import { dualBuffConfig, failureAftermathEffects, selfBuffEffect } from '@/modules/scenarioMods/freeAction/outcomeEffects';

export interface EventActionJudgementReceipt {
  kind: 'event_action_judgement';
  eventId: string;
  actionId: string;
  contractHash: string;
}

/** 自由行动票的判定回执：票随判定存活，确认后不再重跑 intent；只由本地签发，前端不能伪造。 */
export interface FreeActionJudgementReceipt {
  kind: 'free_action_judgement';
  ticketId: string;
  actionClass: ActionClass;
  variant: string;
  /** 无对象的变体（自修、场面）为 null；有对象的变体缺它，结算侧一律不认。 */
  targetId: string | null;
  degree: Degree;
  itemId: string | null;
  /** 票上的好感浮动位（可选），随回执存活到结算。 */
  affinityDelta?: number;
}

export type JudgementAuthorityReceipt = EventActionJudgementReceipt | FreeActionJudgementReceipt;

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
export type JudgementCanonPolicy = 'free' | 'route_process_only';

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
  /** 判定之后、结算那一步才落账的效果（如休整解伤），只用于回执展示；不进权威快照，不再执行。 */
  settledEffects?: Array<{ key: string; action: string; value: unknown }>;
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
  if (value.kind === 'free_action_judgement') {
    const receipt = value as Partial<FreeActionJudgementReceipt>;
    const ticketId = normalizeText(receipt.ticketId);
    const actionClass = normalizeText(receipt.actionClass);
    const variant = normalizeText(receipt.variant);
    const targetId = normalizeText(receipt.targetId) || null;
    const degree = normalizeText(receipt.degree);
    const itemId = normalizeText(receipt.itemId);
    if (!ticketId || !actionClass || !variant || !degree) return undefined;
    const affinityDelta = typeof receipt.affinityDelta === 'number' && Number.isFinite(receipt.affinityDelta) ? receipt.affinityDelta : undefined;
    return {
      kind: 'free_action_judgement', ticketId, actionClass: actionClass as ActionClass, variant, targetId,
      degree: degree as Degree, itemId: itemId || null, ...(affinityDelta !== undefined ? { affinityDelta } : {}),
    };
  }
  return undefined;
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
  const canonPolicy: JudgementCanonPolicy = ['free', 'route_process_only'].includes(String(value.canonPolicy))
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
    (typeof roll !== 'number' || !Number.isInteger(roll) || roll < 1 || roll > judgementNumbers().dice.sides ||
      typeof total !== 'number' || !Number.isFinite(total) || !isOutcome(outcome))
  ) return null;
  const effectsOf = (list: unknown) => Array.isArray(list)
    ? list.filter(effect => effect && typeof effect === 'object' && normalizeText((effect as any).key) && normalizeText((effect as any).action))
        .map(effect => ({ key: normalizeText((effect as any).key), action: normalizeText((effect as any).action), value: (effect as any).value }))
    : [];
  const appliedEffects = effectsOf(value.appliedEffects), settledEffects = effectsOf(value.settledEffects);
  return {
    ...proposal,
    status,
    ...(status === 'resolved' ? { roll, total, outcome } : {}),
    ...(testOverride ? { testOverride } : {}),
    appliedEffects,
    ...(settledEffects.length ? { settledEffects } : {}),
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
    ? value.recent.map(normalizeResolution).filter((resolution): resolution is JudgementResolution => !!resolution).slice(-judgementNumbers().recentKeep)
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

/**
 * 给叙事模型看的回执里，类型／结果／正典策略／已写入效果只写中文（真机 db4278a0247b：冲关叙事夹了英文词，
 * 回执里原样给的 cultivate／success／route_process_only／「角色.属性.境界 set」是漏给模型的英文）。判定ID 原样保留。
 */
export const JUDGEMENT_KIND_LABELS: Record<JudgementKind, string> = {
  combat: '战斗', cultivate: '修炼', craft: '炼制', explore: '探查', social: '交涉', escape: '身法', stealth: '潜行', scheme: '谋略',
};
export const JUDGEMENT_OUTCOME_LABELS: Record<JudgementOutcome, string> = {
  critical_failure: '大失败', failure: '失败', partial: '部分成功', success: '成功', great_success: '大成功', perfect: '完美',
};
export const JUDGEMENT_CANON_POLICY_LABELS: Record<JudgementCanonPolicy, string> = {
  free: '自由演绎', route_process_only: '只演过程',
};
const JUDGEMENT_EFFECT_ACTION_LABELS: Record<string, string> = { set: '已改写', add: '已增减', upsert: '已写入', remove: '已移除', push: '已追加' };
/** 回执里的类型、结果、正典策略（中文；未知值原样）。 */
export function judgementPromptLabels(resolution: Pick<JudgementResolution, 'kind' | 'outcome' | 'canonPolicy'>): { kind: string; outcome: string; canonPolicy: string } {
  return {
    kind: JUDGEMENT_KIND_LABELS[resolution.kind] ?? String(resolution.kind),
    outcome: resolution.outcome ? JUDGEMENT_OUTCOME_LABELS[resolution.outcome] ?? resolution.outcome : String(resolution.outcome),
    canonPolicy: JUDGEMENT_CANON_POLICY_LABELS[resolution.canonPolicy] ?? String(resolution.canonPolicy),
  };
}

export function formatVerifiedJudgementReceiptForPrompt(resolution: JudgementResolution): string {
  const effectSummary = (resolution.appliedEffects || []).map(describeJudgementEffect).join('；') || '无';
  const outcomeText = describeJudgementOutcomeText(resolution) || '无';
  const labels = judgementPromptLabels(resolution);
  return [
    '只可演出同一判定ID给出的既定骰点、总值、结果与已写入效果；不得重新计算、掷骰或输出判定卡。',
    `动作=${resolution.actionText}`,
    `判定ID=${resolution.id}`,
    `类型=${labels.kind}`,
    `骰点=${resolution.roll}`,
    `总值=${resolution.total}`,
    `难度=${resolution.difficulty.value}`,
    `结果=${labels.outcome}`,
    `正典策略=${labels.canonPolicy}`,
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
  const lines = judgementNumbers().outcomeLines;
  if (total >= difficulty + lines.perfect) return 'perfect';
  if (total >= difficulty + lines.greatSuccess) return 'great_success';
  if (total >= difficulty + lines.success) return 'success';
  // P1 的适度软化：接近难度时保留代价成功空间；P2 UI 会明确展示该后果。
  if (total >= difficulty + lines.partial) return 'partial';
  if (total >= difficulty + lines.failure) return 'failure';
  return 'critical_failure';
}

function archiveResolution(state: JudgementState, resolution: JudgementResolution): JudgementState {
  return {
    version: 1,
    recent: [...state.recent.filter(item => item.id !== resolution.id), resolution].slice(-judgementNumbers().recentKeep),
  };
}

/** 自由行动的判定：失败余波（扣气血、行动门控）和双修的阴阳调和由 freeAction/settle.ts 落账，引擎不再自己写。 */
const isFreeActionJudgement = (proposal: JudgementProposal): boolean => proposal.authorityReceipt?.kind === 'free_action_judgement';

export const CULTIVATION_RECOVERY_KEYWORDS = /疗伤|疗愈|调息|恢复|修复|经脉|丹田|双修/;

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

/** 双修专属收益的好感门槛（配置 freeAction.dualCultivation.requires.minGoodwill）；只在判定带目标时检查，不另设“对方同意”一层。 */
function dualCultivationGoodwillMet(saveData: unknown, proposal: JudgementProposal): boolean {
  if (!proposal.target) return true;
  return affinityOf(saveData as any, proposal.target) >= GAME_NUMBERS.freeAction.dualCultivation.requires.minGoodwill;
}

function cultivationRecoveryEffects(saveData: unknown, proposal: JudgementProposal, outcome: JudgementOutcome): JudgementResolution['appliedEffects'] {
  const ratio = (judgementNumbers().cultivationRecovery as Partial<Record<JudgementOutcome, number>>)[outcome];
  if (
    proposal.applyCultivationRecovery === false
    || proposal.kind !== 'cultivate'
    || !ratio
    // 自由行动的变体显式声明 applyRecovery（true）就回血，不看文本；没声明的旧判定仍按关键词。
    || (proposal.applyCultivationRecovery !== true && !CULTIVATION_RECOVERY_KEYWORDS.test(proposal.actionText))
  ) return [];
  const root = saveData as any;
  const effects: JudgementResolution['appliedEffects'] = [];
  for (const attribute of ['气血', '神识'] as const) {
    const target = targetAfterRecovery(root, attribute, ratio);
    if (target !== null) effects.push({ key: `角色.属性.${attribute}.当前`, action: 'set', value: target });
  }
  // 旧判定（关键词预检）的双修收益；自由行动的双修走 intimate 变体，门槛在闸门、收益在 settle.ts。
  if (!isFreeActionJudgement(proposal) && /双修/.test(proposal.actionText) && dualCultivationGoodwillMet(saveData, proposal)) {
    const buff = selfBuffEffect(root, dualBuffConfig(), outcome);
    if (buff) effects.push(buff);
  }
  return effects;
}

function deterministicOutcomeEffects(saveData: unknown, proposal: JudgementProposal, outcome: JudgementOutcome, currentTurn: number): JudgementResolution['appliedEffects'] {
  const effects: JudgementResolution['appliedEffects'] = [];
  if (['partial', 'success', 'great_success', 'perfect'].includes(outcome)) {
    effects.push(...cultivationRecoveryEffects(saveData, proposal, outcome));
  }
  if(proposal.kind==='cultivate'){const realm=trainingRealm(saveData,proposal.actionText,outcome);if(realm)effects.push({key:'角色.属性.境界',action:'set',value:realm});}
  effects.push(...spiritCostEffects(saveData, proposal, outcome));
  if (isFreeActionJudgement(proposal)) return effects;
  effects.push(...failureAftermathEffects(saveData, { kind: proposal.kind, actionText: proposal.actionText, target: proposal.target, outcome, turn: currentTurn }));
  return effects;
}

export function applyDeterministicEffects(saveData: unknown, effects: JudgementResolution['appliedEffects']): void {
  if (!effects.length) return;
  const root = saveData as any;
  if (!root.系统) root.系统 = {};
  if (!root.系统.扩展) root.系统.扩展 = {};
  if (!root.系统.扩展.行动门控) root.系统.扩展.行动门控 = { version: 1, recent: [] };
  if (!Array.isArray(root.系统.扩展.行动门控.recent)) root.系统.扩展.行动门控.recent = [];
  for (const effect of effects) {
    if(effect.key==='角色.属性.境界'&&effect.action==='set'&&effect.value&&typeof effect.value==='object'){root.角色 ||= {};root.角色.属性 ||= {};root.角色.属性.境界=clone(effect.value);}
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
  if (effect.key === '角色.效果' && effect.action === 'remove') return `解除「${(effect.value as any)?.状态名称 || '未知'}」`;
  if (effect.key === '系统.扩展.行动门控.recent') return '写入行动余波';
  if (effect.key === '角色.属性.境界' && effect.action === 'set') {
    const realm = effect.value as { 名称?: unknown; 阶段?: unknown; 当前进度?: unknown } | null;
    return realm?.名称 ? `境界记为${String(realm.名称)}${String(realm.阶段 ?? '')}（进度 ${Number(realm.当前进度) || 0}）` : '境界已改写';
  }
  return `${effect.key} ${JUDGEMENT_EFFECT_ACTION_LABELS[effect.action] ?? '已改动'}`;
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

  const roll = Math.max(1, Math.min(judgementNumbers().dice.sides, Math.floor((options.roll || rollD20)())));
  const total = roll + state.pending.factors.reduce((sum, factor) => sum + factor.value, 0);
  const testOutcome = options.testOutcome && isOutcome(options.testOutcome) ? options.testOutcome : undefined;
  const outcome = testOutcome || outcomeForTotal(total, state.pending.difficulty.value);
  const appliedEffects = options.appliedEffects ? clone(options.appliedEffects) : deterministicOutcomeEffects(saveData, state.pending, outcome, normalizeTurn(options.currentTurn));
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

/**
 * 结算之后才落账的效果（自由行动休整解伤等）补记到同一判定的 settledEffects，界面“已写入”才看得到。只记账，不再执行；同一条不重复记。
 * 不碰 appliedEffects：它在权威快照里，改了叙事侧的回执校验（verifyResolvedJudgementReceipt）就对不上。
 */
export function noteResolutionEffects(saveData: unknown, judgementId: string, effects: JudgementResolution['appliedEffects']): void {
  if (!effects.length) return;
  const state = getJudgementState(saveData), at = state.recent.findIndex(item => item.id === judgementId);
  if (at < 0) return;
  const row = state.recent[at], prior = row.settledEffects || [], seen = new Set(prior.map(effect => JSON.stringify(effect)));
  const added = effects.filter(effect => !seen.has(JSON.stringify(effect)));
  if (!added.length) return;
  const recent = [...state.recent];
  recent[at] = { ...row, settledEffects: [...prior, ...clone(added)] };
  writeJudgementState(saveData, { ...state, recent });
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
