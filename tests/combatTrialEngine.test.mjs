// 战斗试玩（src/dev/combatTrial）：引擎移植的行为与原型一致、骰子无偏可复现、真实判定因子与难度标定对得上。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import * as protoEngine from '../dev/combat-proto/engine.mjs';
import { scenario as protoScenario } from '../dev/combat-proto/scenario-f03.mjs';
import { loadTs } from './loadTs.mjs';

const stageMod = async () => JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_04.json', import.meta.url), 'utf8'));

async function setup() {
  const engine = await loadTs('../src/dev/combatTrial/engine.ts');
  const data = await loadTs('../src/dev/combatTrial/f03Scenario.ts');
  const real = await loadTs('../src/dev/combatTrial/realFactors.ts');
  const { createCombatTrialSave } = await loadTs('../src/dev/combatTrial/overlay.ts');
  const save = createCombatTrialSave(await stageMod(), { mode: 'B', generatedAt: '2026-10-04T12:00:00.000Z' });
  const scenario = data.f03Scenario(kind => real.realBaseFactors(save, kind));
  return { engine, data, real, save, scenario };
}

const sum = factors => factors.reduce((total, factor) => total + factor.value, 0);

test('档位阈值：直接取自 judgementEngine，且与原型逐点一致', async () => {
  const { engine } = await setup();
  for (let difficulty = 5; difficulty <= 40; difficulty++) {
    for (let total = -10; total <= 80; total++) {
      assert.equal(engine.outcomeForTotal(total, difficulty), protoEngine.outcomeForTotal(total, difficulty), `total=${total} difficulty=${difficulty}`);
    }
  }
  for (const [outcome, tier] of Object.entries(protoEngine.TIER_OF)) {
    assert.equal(engine.TIER_OF[outcome], tier);
  }
});

test('骰子：1–20 等概率；指定骰点优先，其后种子，种子可复现；skip 续用', async () => {
  const { engine } = await setup();
  const dice = engine.createDice({});
  const counts = new Array(21).fill(0);
  const N = 40000;
  for (let i = 0; i < N; i++) counts[dice.next().value]++;
  for (let face = 1; face <= 20; face++) {
    assert.ok(counts[face] > (N / 20) * 0.88 && counts[face] < (N / 20) * 1.12, `点数 ${face} 出现 ${counts[face]} 次，偏离过大`);
  }
  assert.equal(counts[0], 0);

  const forced = engine.createDice({ forced: [20, 1], seed: 7 });
  assert.deepEqual([forced.next(), forced.next()].map(item => [item.value, item.source]), [[20, '指定'], [1, '指定']]);
  const third = forced.next();
  assert.match(third.source, /^种子 7/);
  const again = engine.createDice({ forced: [20, 1], seed: 7 });
  again.next(); again.next();
  assert.equal(again.next().value, third.value, '同一种子同一位置结果相同');
  // 刷新后按已用骰数续用，不会回到序列开头
  const resumed = engine.createDice({ forced: [20, 1], seed: 7, skip: 3 });
  const original = engine.createDice({ forced: [20, 1], seed: 7 });
  for (let i = 0; i < 3; i++) original.next();
  assert.equal(resumed.next().value, original.next().value);
  assert.equal(resumed.used(), 4);
  // 不合法的指定骰点被丢弃
  assert.equal(engine.createDice({ forced: [0, 21, 1.5, 'x', 12] }).next().value, 12);
});

test('真实判定因子 + 难度标定：每种判定种类的基础加值与难度平移表对得上，试玩不会悄悄变难或变易', async () => {
  const { data, real, save } = await setup();
  for (const kind of ['combat', 'escape', 'scheme']) {
    const factors = real.realBaseFactors(save, kind);
    assert.ok(factors.some(factor => factor.label === '六司'), `${kind} 缺六司`);
    assert.ok(factors.some(factor => /^幸运（气运 6，固定值）$/.test(factor.label)), `${kind} 幸运应为固定值`);
    assert.ok(factors.some(factor => factor.label === '环境：浓雾' && factor.value === -3));
    assert.equal(sum(factors) - data.PROTO_BASE_MODIFIER, data.DIFFICULTY_SHIFT[kind], `${kind}：基础加值 ${sum(factors)} 与平移 ${data.DIFFICULTY_SHIFT[kind]} 不匹配`);
  }
});

test('幸运是固定值：同一存档每次取到的因子完全相同（不随机）', async () => {
  const { real, save } = await setup();
  const first = JSON.stringify(real.realBaseFactors(save, 'combat'));
  for (let i = 0; i < 20; i++) assert.equal(JSON.stringify(real.realBaseFactors(save, 'combat')), first);
});

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
}

test('与原型逐骰一致（B 分阶段）：同样的选择和骰点，档位、伤势、落账、因子差值完全相同', async () => {
  const { engine, scenario } = await setup();
  for (let seed = 1; seed <= 400; seed++) {
    const random = rng(seed);
    let proto = protoEngine.createPhasedBattle(protoScenario);
    let mine = engine.createPhasedBattle();
    while (!proto.done) {
      const protoOptions = protoEngine.phasedTactics(protoScenario, proto);
      const mineOptions = engine.phasedTactics(scenario, mine);
      assert.deepEqual(mineOptions.map(item => item.id), protoOptions.map(item => item.id));
      const index = Math.floor(random() * protoOptions.length);
      const roll = Math.floor(random() * 20) + 1;
      const a = protoEngine.resolvePhase(protoScenario, proto, protoOptions[index].id, { value: roll, source: 't' });
      const b = engine.resolvePhase(scenario, mine, mineOptions[index].id, { value: roll, source: 't' });
      proto = a.state; mine = b.state;
      assert.equal(b.resolution.outcome, a.resolution.outcome, `seed ${seed} 阶段 ${b.resolution.phase}`);
      assert.equal(b.resolution.tier, a.resolution.tier);
      assert.equal(b.resolution.total - b.resolution.difficulty, a.resolution.total - a.resolution.difficulty, '总值减难度必须一致');
    }
    assert.equal(mine.done, true);
    assert.equal(mine.finalTier, proto.finalTier);
    assert.equal(mine.playerWound, proto.playerWound);
    // 试玩在「信任 +1」这条后面多注了一句「只记录不结算」，其余逐字相同
    assert.deepEqual(mine.ledger.map(line => line.text.replace('；试玩只记录，不改好感值', '')), proto.ledger.map(line => line.text));
  }
});

test('与原型逐骰一致（A 回合制）：同样的选择和骰点，气血、回合数、结局、落账完全相同', async () => {
  const { engine, scenario } = await setup();
  for (let seed = 1; seed <= 400; seed++) {
    const random = rng(seed * 7919);
    let proto = protoEngine.createRoundBattle(protoScenario);
    let mine = engine.createRoundBattle(scenario);
    let guard = 0;
    while (!proto.done) {
      assert.ok(guard++ < 12, '回合制必须在 5 回合内结束');
      const protoOptions = protoEngine.roundActions(protoScenario, proto);
      const mineOptions = engine.roundActions(scenario, mine);
      assert.deepEqual(mineOptions.map(item => item.id), protoOptions.map(item => item.id));
      const index = Math.floor(random() * protoOptions.length);
      const roll = Math.floor(random() * 20) + 1;
      const a = protoEngine.resolveRound(protoScenario, proto, protoOptions[index].id, { value: roll, source: 't' });
      const b = engine.resolveRound(scenario, mine, mineOptions[index].id, { value: roll, source: 't' });
      proto = a.state; mine = b.state;
      assert.equal(b.resolution.outcome, a.resolution.outcome, `seed ${seed} 回合 ${b.resolution.round}`);
      assert.equal(b.resolution.dealt, a.resolution.dealt);
      assert.equal(b.resolution.taken, a.resolution.taken);
      assert.equal(mine.playerHp, proto.playerHp);
      assert.equal(mine.enemyHp, proto.enemyHp);
    }
    assert.equal(mine.done, true);
    assert.equal(mine.finalTier, proto.finalTier);
    assert.equal(mine.endingReason, proto.endingReason);
    assert.deepEqual(mine.ledger, proto.ledger);
  }
});

test('B 第二阶段各战术的胜率保持原型目标：高风险约 20%，借远程约 65%，其余约 55%', async () => {
  const { engine, scenario } = await setup();
  const winRate = (state, tacticId) => {
    let wins = 0;
    for (let roll = 1; roll <= 20; roll++) {
      if (engine.resolvePhase(scenario, state, tacticId, { value: roll, source: 't' }).resolution.tier === '胜') wins++;
    }
    return wins / 20;
  };
  let state = engine.createPhasedBattle();
  state = engine.resolvePhase(scenario, state, 'use_mist', { value: 1, source: 't' }).state; // 第一阶段大败，带伤进第二阶段
  const fresh = { ...state, playerWound: '无', carry: [] };
  assert.equal(winRate(fresh, 'shield_ningyu'), 0.2);
  assert.equal(winRate(fresh, 'call_suli'), 0.65);
  assert.equal(winRate(fresh, 'kite_rocks'), 0.55);
});

test('A 回合制：一路进攻与一路稳守的胜率落在原型区间；护住凝羽第二回合起才可选', async () => {
  const { engine, scenario } = await setup();
  const play = (strategy, seed) => {
    const dice = engine.createDice({ seed });
    let state = engine.createRoundBattle(scenario);
    while (!state.done) state = engine.resolveRound(scenario, state, strategy(state), dice.next()).state;
    return state;
  };
  const rate = strategy => {
    let wins = 0;
    const N = 3000;
    for (let seed = 1; seed <= N; seed++) if (play(strategy, seed).finalTier === '胜') wins++;
    return wins / N;
  };
  const attack = rate(() => 'attack');
  const guard = rate(() => 'guard');
  assert.ok(attack > 0.3 && attack < 0.6, `一路进攻胜率 ${attack}`);
  assert.ok(guard > 0.5 && guard < 0.95, `一路稳守胜率 ${guard}`);
  const first = engine.createRoundBattle(scenario);
  assert.deepEqual(engine.roundActions(scenario, first).map(item => item.id), ['attack', 'guard']);
  const second = engine.resolveRound(scenario, first, 'attack', { value: 10, source: 't' }).state;
  assert.deepEqual(engine.roundActions(scenario, second).map(item => item.id), ['attack', 'guard', 'protect']);
  assert.throws(() => engine.resolveRound(scenario, first, 'protect', { value: 10, source: 't' }), /本回合不可用/);
});

test('结束后不能再掷；未知战术报错', async () => {
  const { engine, scenario } = await setup();
  let state = engine.createPhasedBattle();
  assert.throws(() => engine.resolvePhase(scenario, state, 'nope', { value: 10, source: 't' }), /未知战术/);
  state = engine.resolvePhase(scenario, state, 'meet_axe', { value: 20, source: 't' }).state;
  state = engine.resolvePhase(scenario, state, 'call_suli', { value: 20, source: 't' }).state;
  assert.equal(state.done, true);
  assert.equal(state.finalTier, '胜');
  assert.throws(() => engine.resolvePhase(scenario, state, 'call_suli', { value: 20, source: 't' }), /战斗已结束/);
  assert.equal(engine.phasedTactics(scenario, state).length, 0);
});

test('模板叙事：每个战术 / 行动 × 每个档位都有文字，没有「缺模板」', async () => {
  const { engine, data, scenario } = await setup();
  for (const [phaseIndex, phase] of scenario.phased.phases.entries()) {
    for (const tactic of phase.tactics) {
      for (const roll of [20, 12, 1]) {
        const result = engine.resolvePhase(scenario, { ...engine.createPhasedBattle(), phaseIndex }, tactic.id, { value: roll, source: 't' });
        const text = data.narratePhase(result.resolution);
        assert.ok(text && !text.includes('缺模板'), `${tactic.id} ${result.resolution.tier}`);
      }
    }
  }
  for (const action of scenario.rounds.actions) {
    for (const roll of [20, 12, 1]) {
      const state = { ...engine.createRoundBattle(scenario), round: 2 };
      const result = engine.resolveRound(scenario, state, action.id, { value: roll, source: 't' });
      const text = data.narrateRound(result.resolution);
      assert.ok(text && !text.includes('缺模板'), `${action.id} ${result.resolution.tier}`);
    }
  }
});

test('模板叙事不与原著矛盾：玩家没有「打倒」武士，只在援手赶到前周旋', async () => {
  const { data } = await setup();
  const all = JSON.stringify([data.ENCOUNTER_TEXT, data.FINALE_TEXT, Object.values(data.EPILOGUES).map(item => item.fallbackText)]);
  assert.ok(!/你把.{0,6}(打倒|杀死|击杀)/.test(all));
});
