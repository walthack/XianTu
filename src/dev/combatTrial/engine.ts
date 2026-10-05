// 战斗试玩的纯逻辑（由 dev/combat-proto/engine.mjs 移植）。无界面、无存档依赖。
// A＝回合制（每回合一骰、扣气血）；B＝分阶段判定（每阶段一骰、按档落代价）。
// 档位阈值直接取 judgementEngine 的 outcomeForTotal，不另抄一份。
import { outcomeForTotal, type JudgementFactor, type JudgementKind, type JudgementOutcome } from '@/utils/judgementEngine';

export { outcomeForTotal };

export type Tier = '胜' | '败' | '大败';
export type Wound = '无' | '轻' | '中' | '重';
export type BattleMode = 'A' | 'B';
export type Factor = JudgementFactor;

export const OUTCOME_LABELS: Record<JudgementOutcome, string> = {
  perfect: '完美',
  great_success: '大成功',
  success: '成功',
  partial: '部分成功',
  failure: '失败',
  critical_failure: '大失败',
};

/** 引擎六档 → 剧情侧三档（需求 10 号文档 §0）。 */
export const TIER_OF: Record<JudgementOutcome, Tier> = {
  perfect: '胜',
  great_success: '胜',
  success: '胜',
  partial: '败',
  failure: '败',
  critical_failure: '大败',
};

/** 幸运按气运给固定值：取现有随机幸运（judgementRules.ts）的期望值，不再另掷。 */
export function fixedLuck(fortune: number): number {
  const f = Math.min(10, Math.max(0, Number(fortune) || 0));
  return Math.round(-2.5 + f / 2 + Math.ceil(f / 2));
}

// ---------- 骰子：无偏 d20；可选种子或指定骰点（开发参数） ----------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cryptoUnit(): number {
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    // 拒绝采样保证 1–20 等概率。
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / 20) * 20;
    for (;;) {
      c.getRandomValues(buf);
      if (buf[0] < limit) return (buf[0] % 20) / 20;
    }
  }
  return Math.random();
}

export interface DiceOptions {
  seed?: number | null;
  /** 按顺序先用；用完后有种子用种子，否则真随机。 */
  forced?: number[];
  /** 已经掷过的次数：刷新页面后跳过，保证同一场战斗不重掷。 */
  skip?: number;
}
export interface Die { value: number; source: string }
export interface Dice { next(): Die; used(): number }

export function createDice(options: DiceOptions = {}): Dice {
  const forced = (options.forced || []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 20);
  const hasSeed = typeof options.seed === 'number' && Number.isFinite(options.seed);
  const seeded = hasSeed ? mulberry32(Number(options.seed)) : null;
  let used = 0;
  const draw = (): Die => {
    const index = used++;
    if (index < forced.length) return { value: forced[index], source: '指定' };
    if (seeded) return { value: Math.floor(seeded() * 20) + 1, source: `种子 ${options.seed}` };
    return { value: Math.floor(cryptoUnit() * 20) + 1, source: '真随机' };
  };
  // 真随机无法重放：skip 只对指定/种子骰有意义，真随机的已掷结果存在存档里。
  for (let i = 0; i < (options.skip || 0); i++) draw();
  return { next: draw, used: () => used };
}

const sum = (factors: Factor[]): number => factors.reduce((total, factor) => total + factor.value, 0);

export interface Resolution {
  id: string;
  label: string;
  kind: JudgementKind;
  roll: number;
  rollSource: string;
  factors: Factor[];
  modifier: number;
  total: number;
  difficulty: number;
  needed: number;
  outcome: JudgementOutcome;
  outcomeLabel: string;
  tier: Tier;
  effects?: string[];
  phase?: number;
  phaseTitle?: string;
  tacticId?: string;
  round?: number;
  actionId?: string;
  dealt?: number;
  taken?: number;
  scripted?: string[];
  hpAfter?: { player: number; enemy: number };
}

function judge(input: { step: string; label: string; kind: JudgementKind; difficulty: number; factors: Factor[]; die: Die }): Resolution {
  const modifier = sum(input.factors);
  const total = input.die.value + modifier;
  const outcome = outcomeForTotal(total, input.difficulty);
  return {
    id: `${input.step}-${input.label}`,
    label: input.label,
    kind: input.kind,
    roll: input.die.value,
    rollSource: input.die.source,
    factors: input.factors,
    modifier,
    total,
    difficulty: input.difficulty,
    needed: input.difficulty - modifier,
    outcome,
    outcomeLabel: OUTCOME_LABELS[outcome],
    tier: TIER_OF[outcome],
  };
}

const WOUND_ORDER: Wound[] = ['无', '轻', '中', '重'];
const worse = (a: Wound, b: Wound): Wound => (WOUND_ORDER.indexOf(a) >= WOUND_ORDER.indexOf(b) ? a : b);

export interface LedgerLine { step: string; text: string }

// ---------- 场景数据的类型 ----------

export interface TierCost { playerWound: Wound; effects: string[]; carry?: Factor[] }
export interface PhasedTactic {
  id: string; label: string; kind: JudgementKind; difficulty: number; hint: string;
  factors?: Factor[]; costs: Record<Tier, TierCost>;
}
export interface PhasedPhase { title: string; prompt: string; factors: Factor[]; tactics: PhasedTactic[] }
export interface RoundAction {
  id: string; label: string; kind: JudgementKind; difficulty: number; dealScale: number; takeShift: number;
  hint: string; protectsNingyu?: boolean; fromRound?: number; factors?: Factor[];
}
export interface BattleScenario {
  /** 按判定种类给基础因子（真实判定里六司权重随种类不同）。 */
  baseFactors: (kind: JudgementKind) => Factor[];
  woundPenalty: Record<Wound, number>;
  phased: {
    phases: PhasedPhase[];
    finalByTier: Record<Tier, { playerWound: Wound; effects: string[] }>;
  };
  rounds: {
    playerHp: number; enemyHp: number; rescueRound: number; winHpRatio: number; winEnemyHp: number;
    shengsigenFromRound: number;
    actions: RoundAction[];
    damage: { deal: Record<JudgementOutcome, number>; take: Record<JudgementOutcome, number> };
    scripted: Array<{ afterRound: number; text: string; enemyDamage?: number }>;
    unprotectedNingyuEffect: string;
    finalByTier: Record<Tier, { effects: string[] }>;
  };
}

// ---------- B：分阶段判定 ----------

export interface PhasedState {
  mode: 'B';
  phaseIndex: number;
  resolutions: Resolution[];
  playerWound: Wound;
  /** 上一阶段结果带进下一阶段的因子（如「站稳脚跟 +2」）。 */
  carry: Factor[];
  ledger: LedgerLine[];
  done: boolean;
  finalTier: Tier | null;
}

export function createPhasedBattle(): PhasedState {
  return { mode: 'B', phaseIndex: 0, resolutions: [], playerWound: '无', carry: [], ledger: [], done: false, finalTier: null };
}

export function phasedFactors(scenario: BattleScenario, state: PhasedState, tactic: PhasedTactic): Factor[] {
  const phase = scenario.phased.phases[state.phaseIndex];
  const factors = [...scenario.baseFactors(tactic.kind), ...(phase.factors || []), ...(state.carry || []), ...(tactic.factors || [])];
  const penalty = scenario.woundPenalty[state.playerWound] || 0;
  if (penalty) factors.push({ label: `伤势（${state.playerWound}）`, value: penalty, source: 'condition' });
  return factors;
}

export interface TacticPreview extends PhasedTactic { previewFactors: Factor[]; previewModifier: number; needed: number }

export function phasedTactics(scenario: BattleScenario, state: PhasedState): TacticPreview[] {
  if (state.done) return [];
  const phase = scenario.phased.phases[state.phaseIndex];
  return phase.tactics.map(tactic => {
    const factors = phasedFactors(scenario, state, tactic);
    return { ...tactic, previewFactors: factors, previewModifier: sum(factors), needed: tactic.difficulty - sum(factors) };
  });
}

export function resolvePhase(scenario: BattleScenario, state: PhasedState, tacticId: string, die: Die): { state: PhasedState; resolution: Resolution } {
  if (state.done) throw new Error('战斗已结束');
  const phase = scenario.phased.phases[state.phaseIndex];
  const tactic = phase.tactics.find(item => item.id === tacticId);
  if (!tactic) throw new Error(`未知战术 ${tacticId}`);
  const resolution: Resolution = {
    ...judge({ step: `P${state.phaseIndex + 1}`, label: tactic.label, kind: tactic.kind, difficulty: tactic.difficulty, factors: phasedFactors(scenario, state, tactic), die }),
    phase: state.phaseIndex + 1,
    phaseTitle: phase.title,
    tacticId,
  };
  const cost = tactic.costs[resolution.tier];
  resolution.effects = cost.effects;
  const next: PhasedState = {
    ...state,
    resolutions: [...state.resolutions, resolution],
    playerWound: worse(state.playerWound, cost.playerWound || '无'),
    ledger: [...state.ledger, ...cost.effects.map(text => ({ step: resolution.id, text }))],
    phaseIndex: state.phaseIndex + 1,
    carry: cost.carry || [],
  };
  if (next.phaseIndex >= scenario.phased.phases.length) {
    const final = scenario.phased.finalByTier[resolution.tier];
    next.done = true;
    next.finalTier = resolution.tier;
    next.playerWound = worse(next.playerWound, final.playerWound);
    next.ledger = [...next.ledger, ...final.effects.map(text => ({ step: '战后', text }))];
  }
  return { state: next, resolution };
}

// ---------- A：回合制 ----------

export interface RoundState {
  mode: 'A';
  round: number;
  playerHp: number;
  enemyHp: number;
  protectedNingyu: boolean;
  resolutions: Resolution[];
  ledger: LedgerLine[];
  events: Array<{ afterRound: number; text: string }>;
  done: boolean;
  finalTier: Tier | null;
  endingReason?: 'player_down' | 'enemy_down' | 'rescue';
}

export function createRoundBattle(scenario: BattleScenario): RoundState {
  const r = scenario.rounds;
  return { mode: 'A', round: 1, playerHp: r.playerHp, enemyHp: r.enemyHp, protectedNingyu: false, resolutions: [], ledger: [], events: [], done: false, finalTier: null };
}

export function hpWound(scenario: BattleScenario, hp: number): Wound {
  const ratio = hp / scenario.rounds.playerHp;
  if (hp <= 0) return '重';
  if (ratio <= 1 / 3) return '重';
  if (ratio <= 2 / 3) return '中';
  if (ratio < 1) return '轻';
  return '无';
}

export function roundFactors(scenario: BattleScenario, state: RoundState, action: RoundAction): Factor[] {
  const factors = [...scenario.baseFactors(action.kind), ...(action.factors || [])];
  if (state.round >= scenario.rounds.shengsigenFromRound) factors.push({ label: '生死根续航', value: 2, source: 'talent' });
  const wound = hpWound(scenario, state.playerHp);
  const penalty = scenario.woundPenalty[wound] || 0;
  if (penalty) factors.push({ label: `伤势（${wound}）`, value: penalty, source: 'condition' });
  return factors;
}

export interface ActionPreview extends RoundAction { previewFactors: Factor[]; previewModifier: number; needed: number }

export function roundActions(scenario: BattleScenario, state: RoundState): ActionPreview[] {
  if (state.done) return [];
  return scenario.rounds.actions
    .filter(action => !action.fromRound || state.round >= action.fromRound)
    .map(action => {
      const factors = roundFactors(scenario, state, action);
      return { ...action, previewFactors: factors, previewModifier: sum(factors), needed: action.difficulty - sum(factors) };
    });
}

export function resolveRound(scenario: BattleScenario, state: RoundState, actionId: string, die: Die): { state: RoundState; resolution: Resolution } {
  if (state.done) throw new Error('战斗已结束');
  const r = scenario.rounds;
  const action = r.actions.find(item => item.id === actionId && (!item.fromRound || state.round >= item.fromRound));
  if (!action) throw new Error(`本回合不可用的行动 ${actionId}`);
  const resolution: Resolution = {
    ...judge({ step: `R${state.round}`, label: action.label, kind: action.kind, difficulty: action.difficulty, factors: roundFactors(scenario, state, action), die }),
    round: state.round,
    actionId,
  };
  const dealt = Math.max(0, Math.floor(r.damage.deal[resolution.outcome] * action.dealScale));
  const taken = Math.max(0, r.damage.take[resolution.outcome] + action.takeShift);
  resolution.dealt = dealt;
  resolution.taken = taken;
  const next: RoundState = {
    ...state,
    playerHp: Math.max(0, state.playerHp - taken),
    enemyHp: Math.max(0, state.enemyHp - dealt),
    protectedNingyu: state.protectedNingyu || (Boolean(action.protectsNingyu) && resolution.tier !== '大败'),
    resolutions: [...state.resolutions, resolution],
    events: [...state.events],
  };
  // 固定插手：每回合结束后按回合号发生，所有分支都会出现。
  const scripted = r.scripted.filter(item => item.afterRound === state.round);
  for (const item of scripted) {
    if (item.enemyDamage) next.enemyHp = Math.max(0, next.enemyHp - item.enemyDamage);
    next.events.push({ afterRound: state.round, text: item.text });
  }
  resolution.scripted = scripted.map(item => item.text);
  resolution.hpAfter = { player: next.playerHp, enemy: next.enemyHp };

  let ending: Tier | null = null;
  if (next.playerHp <= 0) ending = '大败';
  else if (next.enemyHp <= 0) ending = '胜';
  // 援手赶到时：气血保住一半以上，或把武士压到 winEnemyHp 以下，算胜。
  else if (state.round >= r.rescueRound) {
    ending = next.playerHp / r.playerHp >= r.winHpRatio || next.enemyHp <= r.winEnemyHp ? '胜' : '败';
  }
  if (ending) {
    const final = r.finalByTier[ending];
    next.done = true;
    next.finalTier = ending;
    next.ledger = [
      ...final.effects.map(text => ({ step: '战后', text })),
      ...(!next.protectedNingyu && ending !== '胜' ? [{ step: '战后', text: r.unprotectedNingyuEffect }] : []),
    ];
    next.endingReason = next.playerHp <= 0 ? 'player_down' : next.enemyHp <= 0 ? 'enemy_down' : 'rescue';
  } else {
    next.round = state.round + 1;
  }
  return { state: next, resolution };
}

export type BattleState = PhasedState | RoundState;

/** 战斗终局时主角的伤势档：B 直接取累计，A 取 hpWound 与战后账里较重者。 */
export function finalPlayerWound(scenario: BattleScenario, state: BattleState): Wound {
  if (state.mode === 'B') return state.playerWound;
  const byHp = hpWound(scenario, state.playerHp);
  const byTier: Wound = state.finalTier === '胜' ? '轻' : state.finalTier === '败' ? '中' : '重';
  return worse(byHp, byTier);
}
