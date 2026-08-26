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

test('test outcome override is explicit, auditable, and still uses deterministic effects', async () => {
  const save = { 角色: { 属性: { 气血: { 当前: 100, 上限: 1000 }, 神识: { 当前: 100, 上限: 1000 } } }, 系统: { 扩展: {} } };
  const pending = await createPending(save, {
    actionText: '双修调息疗伤', kind: 'cultivate', difficulty: { band: 'severe', value: 25 }, factors: [{ label: '重伤', value: -15, source: 'condition' }],
  });
  const { resolvePendingJudgement, getJudgementState } = await loadTs('../src/utils/judgementEngine.ts');
  const result = resolvePendingJudgement(save, pending.id, { currentTurn: 5, roll: () => 1, testOutcome: 'great_success' });

  assert.equal(result.roll, 1);
  assert.equal(result.outcome, 'great_success');
  assert.equal(result.testOverride, 'great_success');
  assert.equal(save.角色.属性.气血.当前, 400);
  assert.equal(getJudgementState(save).recent[0].testOverride, 'great_success');
});

test('verifyResolvedJudgementReceipt returns the save copy and fail-closes on tamper or pending', async () => {
  const save = { 角色: { 属性: { 气血: { 当前: 80, 上限: 100 } } }, 系统: { 扩展: {} } };
  const pending = await createPending(save, { kind: 'combat', difficulty: { band: 'normal', value: 12 } });
  const {
    resolvePendingJudgement,
    verifyResolvedJudgementReceipt,
    formatVerifiedJudgementReceiptForPrompt,
    judgementHasLocalCombatHpWrite,
    persistPendingJudgement,
    createJudgementProposal,
  } = await loadTs('../src/utils/judgementEngine.ts');
  const resolution = resolvePendingJudgement(save, pending.id, { currentTurn: 5, roll: () => 4 });
  const trusted = verifyResolvedJudgementReceipt(save, resolution);

  assert.ok(trusted);
  assert.notEqual(trusted, resolution);
  assert.deepEqual(trusted, resolution);
  assert.equal(judgementHasLocalCombatHpWrite(trusted), true);
  const prompt = formatVerifiedJudgementReceiptForPrompt(trusted);
  assert.match(prompt, new RegExp(`判定ID=${trusted.id}`));
  assert.match(prompt, /类型=combat/);
  assert.match(prompt, /骰点=4/);
  assert.match(prompt, /结果=/);
  assert.match(prompt, /正典策略=/);
  assert.match(prompt, /结果文案=/);
  assert.match(prompt, /已写入=/);
  assert.match(prompt, /动作=翻越有守卫的城墙/);

  const callerMutated = structuredClone(resolution);
  callerMutated.outcome = 'perfect';
  assert.equal(verifyResolvedJudgementReceipt(save, callerMutated), null, 'tampered outcome');
  callerMutated.outcome = resolution.outcome;
  callerMutated.id = 'judge-forged';
  assert.equal(verifyResolvedJudgementReceipt(save, callerMutated), null, 'tampered id');
  const hashTamper = structuredClone(resolution);
  hashTamper.actionHash = `${resolution.actionHash}-x`;
  assert.equal(verifyResolvedJudgementReceipt(save, hashTamper), null, 'tampered actionHash');
  const difficultyTamper = structuredClone(resolution);
  difficultyTamper.difficulty = { ...resolution.difficulty, value: resolution.difficulty.value + 3 };
  assert.equal(verifyResolvedJudgementReceipt(save, difficultyTamper), null, 'tampered difficulty');
  const effectsTamper = structuredClone(resolution);
  effectsTamper.appliedEffects = [...resolution.appliedEffects, { key: '角色.属性.气血.当前', action: 'set', value: 1 }];
  assert.equal(verifyResolvedJudgementReceipt(save, effectsTamper), null, 'tampered effects');

  persistPendingJudgement(save, createJudgementProposal({
    actionText: '再冲一次',
    kind: 'escape',
    whyNow: '另一次风险',
    difficulty: { band: 'normal', value: 10 },
    factors: [],
    stakes: { success: '逃开', partial: '擦伤', failure: '被追上' },
    canonPolicy: 'free',
    createdAtTurn: 6,
  }));
  assert.equal(verifyResolvedJudgementReceipt(save, resolution), null, 'pending still open');
  assert.equal(verifyResolvedJudgementReceipt(save, null), null);
  assert.equal(verifyResolvedJudgementReceipt(save, { ...resolution, status: 'cancelled' }), null);
  assert.equal(judgementHasLocalCombatHpWrite({ ...resolution, kind: 'social' }), false);
});
