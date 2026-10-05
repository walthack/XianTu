import assert from 'node:assert/strict';
import test from 'node:test';
import { mod } from './sceneModuleFixture.mjs';

const S = mod.resolveSettings();
const check = (face, modifier, difficulty, grounded = true, settings = S) => mod.resolveCheck({ face, modifier, difficulty, grounded }, settings);

test('差值边界 ±15：+15 大成功，+14 成功，0 成功，−1 失败，−15 失败，−16 大失败', () => {
  // 取骰面 10、难度 20：总值 = 10 + 加值
  const tierAt = margin => check(10, 20 + margin - 10, 20).tier;
  assert.equal(tierAt(15), 'great_success');
  assert.equal(tierAt(14), 'success');
  assert.equal(tierAt(0), 'success');
  assert.equal(tierAt(-1), 'failure');
  assert.equal(tierAt(-15), 'failure');
  assert.equal(tierAt(-16), 'critical_failure');
});

test('自然 20＝大成功（不看总值、不看有无依据）；自然 1 默认降一档', () => {
  assert.equal(check(20, -50, 30).tier, 'great_success');
  assert.equal(check(20, -50, 30, false).tier, 'great_success');
  assert.equal(check(1, 12, 10).tier, 'failure', '基础成功 → 自然 1 降为失败');
  assert.equal(check(1, 0, 10).tier, 'critical_failure', '基础失败 → 自然 1 降为大失败');
  assert.equal(check(1, -30, 10).tier, 'critical_failure', '大失败不再降');
  assert.equal(check(1, 0, 10).natTriggered, 'nat1');
  assert.equal(check(20, 0, 30).natTriggered, 'nat20');
});

test('自然 20 / 自然 1 的开关', () => {
  const none = mod.resolveSettings({ tiers: { nat20: { grounded: 'crit', ungrounded: 'none' } } });
  assert.equal(check(20, -10, 30, false, none).tier, 'critical_failure', '无依据且 none：按差值判（总值 10 对难度 30）');
  assert.equal(check(20, 0, 30, true, none).tier, 'great_success');
  const success = mod.resolveSettings({ tiers: { nat20: { grounded: 'success', ungrounded: 'success' } } });
  assert.equal(check(20, 0, 30, true, success).tier, 'success', '至少成功');
  assert.equal(check(20, 20, 20, true, success).tier, 'great_success', '本来就是大成功不降');
  const fumble = mod.resolveSettings({ tiers: { nat1: 'fumble' } });
  assert.equal(check(1, 30, 10, true, fumble).tier, 'critical_failure');
  const off = mod.resolveSettings({ tiers: { nat1: 'off' } });
  assert.equal(check(1, 12, 10, true, off).tier, 'success');
});

test('优势与劣势并存互相抵消，只掷一颗', () => {
  assert.equal(mod.rollMode(true, true), 'normal');
  assert.equal(mod.rollMode(true, false), 'advantage');
  assert.equal(mod.rollMode(false, true), 'disadvantage');
  assert.equal(mod.pickFace([5, 17], 'advantage'), 17);
  assert.equal(mod.pickFace([5, 17], 'disadvantage'), 5);
  assert.equal(mod.pickFace([5, 17], 'normal'), 5);
});

test('赔率表与文档一致（默认边界 ±15，自然 20＝大成功，自然 1＝降一档）', () => {
  const row = (d, m, mode = 'normal') => {
    const o = mod.oddsFor({ modifier: m, difficulty: d, grounded: true, mode }, S);
    return [o.great_success, o.success, o.failure, o.critical_failure].map(x => Math.round(x));
  };
  assert.deepEqual(row(10, 6), [10, 75, 10, 5]);
  assert.deepEqual(row(15, 6), [5, 55, 35, 5]);
  assert.deepEqual(row(20, 10), [5, 50, 40, 5]);
  assert.deepEqual(row(25, 6), [5, 5, 75, 15]);
  assert.deepEqual(row(30, 6), [5, 0, 55, 40]);
  assert.deepEqual(row(20, 10, 'advantage'), [10, 70, 20, 0]);
  assert.deepEqual(row(20, 10, 'disadvantage'), [0, 30, 60, 10]);
  for (const d of [5, 15, 25]) for (const m of [-3, 6, 14]) {
    const sum = Object.values(mod.oddsFor({ modifier: m, difficulty: d, grounded: true, mode: 'advantage' }, S)).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 100) < 1e-9);
  }
});

test('骰子由种子派生：同种子同面，读档 / 回滚面不变；玩家检定与防御检定各有独立骰流', () => {
  const faces = Array.from({ length: 50 }, (_, i) => mod.dieAt(777, 'action', i));
  assert.deepEqual(faces, Array.from({ length: 50 }, (_, i) => mod.dieAt(777, 'action', i)));
  assert.ok(faces.every(f => f >= 1 && f <= 20));
  assert.notDeepEqual(faces, Array.from({ length: 50 }, (_, i) => mod.dieAt(778, 'action', i)));
  assert.notDeepEqual(faces, Array.from({ length: 50 }, (_, i) => mod.dieAt(777, 'defense', i)));
  // 大样本近似均匀
  const counts = new Array(21).fill(0);
  for (let i = 0; i < 20000; i++) counts[mod.dieAt(31337, 'action', i)] += 1;
  for (let f = 1; f <= 20; f++) assert.ok(counts[f] > 800 && counts[f] < 1200, `面 ${f} 出现 ${counts[f]} 次`);
});
