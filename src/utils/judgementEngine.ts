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

function cultivationRecoveryEffects(saveData: unknown, proposal: JudgementProposal, outcome: JudgementOutcome): JudgementResolution['appliedEffects'] {
  const ratio = CULTIVATION_RECOVERY_RATIO[outcome];
  if (proposal.kind !== 'cultivate' || !ratio || !CULTIVATION_RECOVERY_KEYWORDS.test(proposal.actionText)) return [];
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
  if (['partial', 'success', 'great_success', 'perfect'].includes(outcome)) {
    effects.push(...cultivationRecoveryEffects(saveData, proposal, outcome));
  }
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
