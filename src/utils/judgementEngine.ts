import { rollD20 } from './diceRoller';
import { JUDGEMENT_STATE_PATH, type TurnJudgementData } from './judgementRules';

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
  source: 'attribute' | 'realm' | 'skill' | 'item' | 'condition' | 'environment' | 'ally';
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
  stakes: { success: string; partial: string; failure: string };
  canonPolicy: JudgementCanonPolicy;
  sourceEventId?: string;
  createdAtTurn: number;
}

export interface JudgementResolution extends Omit<JudgementProposal, 'status'> {
  status: 'resolved' | 'cancelled';
  roll?: number;
  total?: number;
  outcome?: JudgementOutcome;
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
}

const MAX_RECENT_RESOLUTIONS = 20;

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
  if (!['attribute', 'realm', 'skill', 'item', 'condition', 'environment', 'ally'].includes(String(source))) return null;
  return { label, value, source: source as JudgementFactor['source'] };
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
      success: normalizeText(stakes.success),
      partial: normalizeText(stakes.partial),
      failure: normalizeText(stakes.failure),
    },
    canonPolicy,
    ...(normalizeText(value.sourceEventId) ? { sourceEventId: normalizeText(value.sourceEventId) } : {}),
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
    id: normalizeText(input.id) || `judge-${currentTurn}-${actionHash}`,
    status: 'pending',
    actionText,
    actionHash,
    target: normalizeText(input.target) || undefined,
    whyNow: normalizeText(input.whyNow),
    factors: input.factors.map(factor => ({ ...factor, label: normalizeText(factor.label), value: Number(factor.value) })),
    stakes: {
      success: normalizeText(input.stakes.success),
      partial: normalizeText(input.stakes.partial),
      failure: normalizeText(input.stakes.failure),
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
  const resolution: JudgementResolution = {
    ...state.pending,
    status: 'resolved',
    roll,
    total,
    outcome: outcomeForTotal(total, state.pending.difficulty.value),
    appliedEffects: clone(options.appliedEffects || []),
    resolvedAtTurn: normalizeTurn(options.currentTurn),
  };
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
