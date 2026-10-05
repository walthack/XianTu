// 战斗试玩原型的纯逻辑（浏览器与 node 通用，无依赖）。
// A＝回合制（每回合一骰、扣气血）；B＝分阶段判定（每阶段一骰、按档落代价）。
// 档位阈值与 src/utils/judgementEngine.ts 的 outcomeForTotal 一致（tests/combatProto.test.mjs 校验）。

export const OUTCOME_LABELS = {
  perfect: '完美',
  great_success: '大成功',
  success: '成功',
  partial: '部分成功',
  failure: '失败',
  critical_failure: '大失败',
};

/** 引擎六档 → 剧情侧三档（需求 §0）。 */
export const TIER_OF = {
  perfect: '胜',
  great_success: '胜',
  success: '胜',
  partial: '败',
  failure: '败',
  critical_failure: '大败',
};

export function outcomeForTotal(total, difficulty) {
  if (total >= difficulty + 30) return 'perfect';
  if (total >= difficulty + 15) return 'great_success';
  if (total >= difficulty) return 'success';
  if (total >= difficulty - 5) return 'partial';
  if (total >= difficulty - 15) return 'failure';
  return 'critical_failure';
}

/** 幸运按气运给固定值：取现有随机幸运（judgementRules.ts）的期望值，不再另掷。 */
export function fixedLuck(fortune) {
  const f = Math.min(10, Math.max(0, Number(fortune) || 0));
  return Math.round(-2.5 + f / 2 + Math.ceil(f / 2));
}

// ---------- 骰子：无偏 d20；可选种子或指定骰点（开发参数） ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cryptoUnit() {
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

/**
 * @param {{ seed?: number|null, forced?: number[] }} options
 * forced 按顺序先用；用完后有种子用种子，否则真随机。
 */
export function createDice(options = {}) {
  const forced = (options.forced || []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 20);
  const seeded = Number.isFinite(options.seed) ? mulberry32(Number(options.seed)) : null;
  let used = 0;
  return {
    next() {
      if (used < forced.length) return { value: forced[used++], source: '指定' };
      if (seeded) return { value: Math.floor(seeded() * 20) + 1, source: `种子 ${options.seed}` };
      return { value: Math.floor(cryptoUnit() * 20) + 1, source: '真随机' };
    },
  };
}

function sum(factors) {
  return factors.reduce((total, factor) => total + factor.value, 0);
}

function judge({ step, label, kind, difficulty, factors, die }) {
  const modifier = sum(factors);
  const total = die.value + modifier;
  const outcome = outcomeForTotal(total, difficulty);
  return {
    id: `${step}-${label}`,
    label,
    kind,
    roll: die.value,
    rollSource: die.source,
    factors,
    modifier,
    total,
    difficulty,
    needed: difficulty - modifier,
    outcome,
    outcomeLabel: OUTCOME_LABELS[outcome],
    tier: TIER_OF[outcome],
  };
}

const WOUND_ORDER = ['无', '轻', '中', '重'];
function worse(a, b) {
  return WOUND_ORDER.indexOf(a) >= WOUND_ORDER.indexOf(b) ? a : b;
}

// ---------- B：分阶段判定 ----------

export function createPhasedBattle(scenario) {
  return {
    mode: 'B',
    phaseIndex: 0,
    resolutions: [],
    playerWound: '无',
    /** 上一阶段结果带进下一阶段的因子（如「站稳脚跟 +2」）。 */
    carry: [],
    ledger: [],
    done: false,
    finalTier: null,
  };
}

export function phasedFactors(scenario, state, tactic) {
  const phase = scenario.phased.phases[state.phaseIndex];
  const factors = [...scenario.baseFactors(), ...(phase.factors || []), ...(state.carry || []), ...(tactic.factors || [])];
  const penalty = scenario.woundPenalty[state.playerWound] || 0;
  if (penalty) factors.push({ label: `伤势（${state.playerWound}）`, value: penalty, source: 'condition' });
  return factors;
}

export function phasedTactics(scenario, state) {
  if (state.done) return [];
  const phase = scenario.phased.phases[state.phaseIndex];
  return phase.tactics.map(tactic => {
    const factors = phasedFactors(scenario, state, tactic);
    return { ...tactic, previewFactors: factors, previewModifier: sum(factors), needed: tactic.difficulty - sum(factors) };
  });
}

export function resolvePhase(scenario, state, tacticId, die) {
  if (state.done) throw new Error('战斗已结束');
  const phase = scenario.phased.phases[state.phaseIndex];
  const tactic = phase.tactics.find(item => item.id === tacticId);
  if (!tactic) throw new Error(`未知战术 ${tacticId}`);
  const resolution = {
    ...judge({ step: `P${state.phaseIndex + 1}`, label: tactic.label, kind: tactic.kind, difficulty: tactic.difficulty, factors: phasedFactors(scenario, state, tactic), die }),
    phase: state.phaseIndex + 1,
    phaseTitle: phase.title,
    tacticId,
  };
  const cost = tactic.costs[resolution.tier];
  resolution.effects = cost.effects;
  const next = {
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

export function createRoundBattle(scenario) {
  const r = scenario.rounds;
  return {
    mode: 'A',
    round: 1,
    playerHp: r.playerHp,
    enemyHp: r.enemyHp,
    protectedNingyu: false,
    resolutions: [],
    ledger: [],
    events: [],
    done: false,
    finalTier: null,
  };
}

export function hpWound(scenario, hp) {
  const ratio = hp / scenario.rounds.playerHp;
  if (hp <= 0) return '重';
  if (ratio <= 1 / 3) return '重';
  if (ratio <= 2 / 3) return '中';
  if (ratio < 1) return '轻';
  return '无';
}

export function roundFactors(scenario, state, action) {
  const factors = [...scenario.baseFactors(), ...(action.factors || [])];
  if (state.round >= scenario.rounds.shengsigenFromRound) factors.push({ label: '生死根续航', value: 2, source: 'talent' });
  const wound = hpWound(scenario, state.playerHp);
  const penalty = scenario.woundPenalty[wound] || 0;
  if (penalty) factors.push({ label: `伤势（${wound}）`, value: penalty, source: 'condition' });
  return factors;
}

export function roundActions(scenario, state) {
  if (state.done) return [];
  return scenario.rounds.actions
    .filter(action => !action.fromRound || state.round >= action.fromRound)
    .map(action => {
      const factors = roundFactors(scenario, state, action);
      return { ...action, previewFactors: factors, previewModifier: sum(factors), needed: action.difficulty - sum(factors) };
    });
}

export function resolveRound(scenario, state, actionId, die) {
  if (state.done) throw new Error('战斗已结束');
  const r = scenario.rounds;
  const action = r.actions.find(item => item.id === actionId && (!item.fromRound || state.round >= item.fromRound));
  if (!action) throw new Error(`本回合不可用的行动 ${actionId}`);
  const resolution = {
    ...judge({ step: `R${state.round}`, label: action.label, kind: action.kind, difficulty: action.difficulty, factors: roundFactors(scenario, state, action), die }),
    round: state.round,
    actionId,
  };
  const dealt = Math.max(0, Math.floor(r.damage.deal[resolution.outcome] * action.dealScale));
  const taken = Math.max(0, r.damage.take[resolution.outcome] + action.takeShift);
  resolution.dealt = dealt;
  resolution.taken = taken;
  const next = {
    ...state,
    playerHp: Math.max(0, state.playerHp - taken),
    enemyHp: Math.max(0, state.enemyHp - dealt),
    protectedNingyu: state.protectedNingyu || (action.protectsNingyu && resolution.tier !== '大败'),
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

  let ending = null;
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
