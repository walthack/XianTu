import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

async function createPending(save, overrides = {}) {
  const { createJudgementProposal, persistPendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');
  const proposal = createJudgementProposal({
    actionText: '翻越有守卫的城墙',
    kind: 'stealth',
    whyNow: '守卫巡逻存在暴露风险',
    difficulty: { band: 'hard', value: 20 },
    factors: [{ label: '夜色掩护', value: 3, source: 'condition' }],
    stakes: { success: '悄然通过', partial: '留下痕迹但进入内城', failure: '被守卫察觉' },
    canonPolicy: 'free',
    createdAtTurn: 4,
    ...overrides,
  });
  return persistPendingJudgement(save, proposal);
}

test('pending judgement persists across reload-shaped reads and cannot be overwritten', async () => {
  const save = { 系统: { 扩展: {} } };
  const pending = await createPending(save);
  const { getJudgementState, persistPendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');

  assert.equal(getJudgementState(JSON.parse(JSON.stringify(save))).pending.id, pending.id);
  await assert.rejects(() => createPending(save, { actionText: '另一个动作' }), /已有待确认判定/);
  assert.equal(persistPendingJudgement(save, pending).id, pending.id, '同一 proposal 可幂等恢复');
});

test('resolution rolls once and retry returns the saved result without rerolling', async () => {
  const save = { 系统: { 扩展: {} } };
  const pending = await createPending(save);
  const { resolvePendingJudgement, getJudgementState } = await loadTs('../src/utils/judgementEngine.ts');
  let rolls = 0;
  const first = resolvePendingJudgement(save, pending.id, { currentTurn: 5, roll: () => { rolls += 1; return 17; } });
  const retried = resolvePendingJudgement(save, pending.id, { currentTurn: 6, roll: () => { rolls += 1; return 1; } });

  assert.equal(rolls, 1);
  assert.equal(first.roll, 17);
  assert.deepEqual(retried, first);
  assert.equal(getJudgementState(save).pending, undefined);
});

test('cancellation leaves no roll or effects and is retained as an auditable resolution', async () => {
  const save = { 系统: { 扩展: {} } };
  const pending = await createPending(save);
  const { cancelPendingJudgement, getJudgementState } = await loadTs('../src/utils/judgementEngine.ts');
  const resolution = cancelPendingJudgement(save, pending.id, 5);

  assert.equal(resolution.status, 'cancelled');
  assert.equal(resolution.roll, undefined);
  assert.deepEqual(resolution.appliedEffects, []);
  assert.equal(getJudgementState(save).recent[0].id, pending.id);
});

test('a cancelled action can be proposed again without reusing its cancelled resolution', async () => {
  const save = { 系统: { 扩展: {} } };
  const first = await createPending(save);
  const { cancelPendingJudgement, resolvePendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');
  cancelPendingJudgement(save, first.id, 5);
  const second = await createPending(save);
  const result = resolvePendingJudgement(save, second.id, { currentTurn: 6, roll: () => 12 });

  assert.notEqual(second.id, first.id);
  assert.equal(result.status, 'resolved');
  assert.equal(result.roll, 12);
});

test('near-miss becomes partial while hard miss remains failure or critical failure', async () => {
  const { outcomeForTotal } = await loadTs('../src/utils/judgementEngine.ts');
  assert.equal(outcomeForTotal(19, 20), 'partial');
  assert.equal(outcomeForTotal(10, 20), 'failure');
  assert.equal(outcomeForTotal(4, 20), 'critical_failure');
});

test('non-success outcomes deterministically create an action gate exactly once', async () => {
  const save = { 系统: { 扩展: {} } };
  const pending = await createPending(save, { difficulty: { band: 'hard', value: 30 } });
  const { resolvePendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');
  const result = resolvePendingJudgement(save, pending.id, { currentTurn: 5, roll: () => 2 });
  resolvePendingJudgement(save, pending.id, { currentTurn: 6, roll: () => 20 });

  assert.equal(result.appliedEffects.length, 1);
  assert.equal(save.系统.扩展.行动门控.recent.length, 1);
  assert.equal(save.系统.扩展.行动门控.recent[0].outcome, 'failure');
});

test('combat failure applies source-rule health loss without reaching zero', async () => {
  const save = { 角色: { 属性: { 气血: { 当前: 30, 上限: 100 } } }, 系统: { 扩展: {} } };
  const pending = await createPending(save, { kind: 'combat', difficulty: { band: 'hard', value: 30 } });
  const { resolvePendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');
  const result = resolvePendingJudgement(save, pending.id, { currentTurn: 5, roll: () => 2 });

  assert.equal(save.角色.属性.气血.当前, 1);
  assert.ok(result.appliedEffects.some(effect => effect.key === '角色.属性.气血.当前'));
});

test('successful double-cultivation recovery writes core values and one temporary status', async () => {
  const save = {
    角色: { 属性: { 气血: { 当前: 100, 上限: 1000 }, 神识: { 当前: 200, 上限: 800 }, 效果: [] } },
    元数据: { 时间: { 年: 220, 月: 1, 日: 1, 小时: 1, 分钟: 1 } },
    系统: { 扩展: {} },
  };
  const pending = await createPending(save, {
    actionText: '与同伴双修调息疗伤，修复经脉', kind: 'cultivate', difficulty: { band: 'hard', value: 20 },
    factors: [{ label: '功法相合', value: 15, source: 'skill' }],
  });
  const { resolvePendingJudgement, describeJudgementEffect } = await loadTs('../src/utils/judgementEngine.ts');
  const result = resolvePendingJudgement(save, pending.id, { currentTurn: 5, roll: () => 20 });

  assert.equal(result.outcome, 'great_success');
  assert.equal(save.角色.属性.气血.当前, 400);
  assert.equal(save.角色.属性.神识.当前, 440);
  assert.deepEqual(save.角色.效果.map(effect => effect.状态名称), ['阴阳调和']);
  assert.equal(save.角色.效果[0].持续时间分钟, 360);
  assert.ok(result.appliedEffects.map(describeJudgementEffect).includes('气血恢复至 400'));

  resolvePendingJudgement(save, pending.id, { currentTurn: 6, roll: () => 1 });
  assert.equal(save.角色.属性.气血.当前, 400, '重试不会重复恢复');
  assert.equal(save.角色.效果.length, 1, '重试不会重复叠加状态');
});
