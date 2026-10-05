// 战斗试玩原型（dev/combat-proto）的确定性测试：用指定骰点把 A、B 两种模式分别走到胜、败、大败。
// 单独运行：node --test tests/combatProto.test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const engine = await import('../dev/combat-proto/engine.mjs');
const { scenario, narratePhase, narrateRound } = await import('../dev/combat-proto/scenario-f03.mjs');

function playB(tactics, rolls) {
  const dice = engine.createDice({ forced: rolls });
  let state = engine.createPhasedBattle(scenario);
  const resolutions = [];
  for (const tactic of tactics) {
    const result = engine.resolvePhase(scenario, state, tactic, dice.next());
    state = result.state;
    resolutions.push(result.resolution);
  }
  return { state, resolutions };
}

function playA(action, rolls) {
  const dice = engine.createDice({ forced: rolls });
  let state = engine.createRoundBattle(scenario);
  const resolutions = [];
  while (!state.done) {
    const available = engine.roundActions(scenario, state).map(item => item.id);
    const result = engine.resolveRound(scenario, state, available.includes(action) ? action : 'attack', dice.next());
    state = result.state;
    resolutions.push(result.resolution);
  }
  return { state, resolutions };
}

test('档位阈值与正式判定引擎 outcomeForTotal 一致', async () => {
  const { outcomeForTotal } = await loadTs('../src/utils/judgementEngine.ts');
  for (let difficulty = 5; difficulty <= 30; difficulty += 1) {
    for (let total = -30; total <= 70; total += 1) {
      assert.equal(engine.outcomeForTotal(total, difficulty), outcomeForTotal(total, difficulty), `${total} vs ${difficulty}`);
    }
  }
});

test('骰子：无偏 d20；指定骰点按序先用，种子可复现；幸运是固定值', () => {
  const forcedDice = engine.createDice({ forced: [20, 1], seed: 7 });
  assert.deepEqual([forcedDice.next(), forcedDice.next()].map(item => [item.value, item.source]), [[20, '指定'], [1, '指定']]);
  const a = engine.createDice({ seed: 42 });
  const b = engine.createDice({ seed: 42 });
  const seqA = Array.from({ length: 50 }, () => a.next().value);
  assert.deepEqual(seqA, Array.from({ length: 50 }, () => b.next().value), '同一种子同一序列');
  const counts = new Array(21).fill(0);
  const random = engine.createDice();
  for (let i = 0; i < 40000; i += 1) counts[random.next().value] += 1;
  for (let face = 1; face <= 20; face += 1) {
    assert.ok(counts[face] > 1600 && counts[face] < 2400, `面 ${face} 出现 ${counts[face]} 次，偏离 2000 过多`);
  }
  assert.equal(counts[0], 0);
  assert.equal(engine.fixedLuck(5), 3);
  assert.equal(engine.fixedLuck(5), engine.fixedLuck(5));
});

test('B 分阶段：两次骰走到胜', () => {
  const { state, resolutions } = playB(['meet_axe', 'call_suli'], [20, 20]);
  assert.equal(resolutions.length, 2);
  assert.equal(state.done, true);
  assert.equal(state.finalTier, '胜');
  assert.ok(state.ledger.some(item => item.text.includes('1 名商馆护卫被鬼角刺死')));
  assert.equal(resolutions[1].factors.some(item => item.label.startsWith('生死根')), true, '第二阶段带生死根因子');
});

test('B 分阶段：走到败（原著结果照旧，代价加重）', () => {
  const { state } = playB(['use_mist', 'kite_rocks'], [2, 2]);
  assert.equal(state.finalTier, '败');
  assert.ok(state.ledger.some(item => item.text.includes('祁远 肩伤加重一级')));
  assert.equal(state.playerWound, '中');
});

test('B 分阶段：高风险战术掷出 1 走到大败，凝羽内伤', () => {
  const { state, resolutions } = playB(['meet_axe', 'shield_ningyu'], [1, 1]);
  assert.equal(resolutions[1].outcome, 'critical_failure');
  assert.equal(state.finalTier, '大败');
  assert.equal(state.playerWound, '重');
  assert.ok(state.ledger.some(item => item.text.startsWith('凝羽 内伤（中）')));
});

test('A 回合制：全 20 进攻，把武士打倒，胜', () => {
  const { state, resolutions } = playA('attack', Array(10).fill(20));
  assert.equal(state.finalTier, '胜');
  assert.ok(resolutions.length >= 4 && resolutions.length <= 5, `回合数 ${resolutions.length}`);
});

test('A 回合制：一路勉强（全 9）撑到援手，败', () => {
  const { state, resolutions } = playA('attack', Array(10).fill(9));
  assert.equal(resolutions.length, scenario.rounds.rescueRound);
  assert.equal(state.endingReason, 'rescue');
  assert.equal(state.finalTier, '败');
  assert.ok(state.playerHp > 0);
});

test('A 回合制：全 1 被打到气血归零，大败；没护住凝羽另记内伤', () => {
  const { state } = playA('attack', Array(10).fill(1));
  assert.equal(state.finalTier, '大败');
  assert.equal(state.endingReason, 'player_down');
  assert.equal(state.playerHp, 0);
  assert.ok(state.ledger.some(item => item.text.startsWith('凝羽 内伤（中）')));
});

test('A 回合制：护住凝羽后，败局里不再记凝羽内伤；固定插手按回合发生', () => {
  const dice = engine.createDice({ forced: Array(10).fill(9) });
  let state = engine.createRoundBattle(scenario);
  const plan = ['attack', 'protect', 'attack', 'attack', 'attack'];
  const seen = [];
  for (const action of plan) {
    const result = engine.resolveRound(scenario, state, action, dice.next());
    state = result.state;
    seen.push(...result.resolution.scripted);
  }
  assert.equal(state.done, true);
  assert.equal(state.protectedNingyu, true);
  assert.equal(state.ledger.some(item => item.text.startsWith('凝羽 内伤')), false);
  assert.ok(seen.some(text => text.includes('苏荔')));
  assert.ok(seen.some(text => text.includes('生死根')));
});

test('护凝羽第 1 回合不可用；已结束的战斗不能再掷', () => {
  const state = engine.createRoundBattle(scenario);
  assert.equal(engine.roundActions(scenario, state).some(item => item.id === 'protect'), false);
  assert.throws(() => engine.resolveRound(scenario, state, 'protect', { value: 10, source: '指定' }));
  const { state: done } = playB(['meet_axe', 'call_suli'], [20, 20]);
  assert.throws(() => engine.resolvePhase(scenario, done, 'meet_axe', { value: 10, source: '指定' }));
});

test('每个战术、行动的每一档都有模板叙事', () => {
  for (const phase of scenario.phased.phases) {
    for (const tactic of phase.tactics) {
      for (const tier of ['胜', '败', '大败']) {
        const text = narratePhase({ tacticId: tactic.id, tier, id: 'x', roll: 1 });
        assert.ok(text && !text.includes('缺模板'), `${tactic.id} ${tier}`);
      }
    }
  }
  for (const action of scenario.rounds.actions) {
    for (const tier of ['胜', '败', '大败']) {
      assert.ok(!narrateRound({ actionId: action.id, tier, id: 'x', roll: 1 }).includes('缺模板'), `${action.id} ${tier}`);
    }
  }
});

test('试玩服务：页面与脚本可访问，未配置模型时只给模板', async () => {
  const port = 18000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ['dev/combat-proto/serve.mjs', '--port', String(port)], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, PROTO_LLM_MODEL: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise((resolve, reject) => {
      child.stdout.on('data', chunk => { if (String(chunk).includes('战斗试玩原型')) resolve(); });
      child.on('exit', code => reject(new Error(`服务退出 ${code}`)));
      setTimeout(() => reject(new Error('服务启动超时')), 5000);
    });
    const base = `http://127.0.0.1:${port}`;
    for (const path of ['/', '/?mode=A', '/?mode=B', '/app.mjs', '/engine.mjs', '/scenario-f03.mjs', '/style.css']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200, path);
    }
    assert.equal((await fetch(`${base}/../../.env`)).status, 404, '不得越出本目录');
    assert.deepEqual(await (await fetch(`${base}/api/config`)).json(), { llm: { available: false, model: null } });
  } finally {
    child.kill();
  }
});
