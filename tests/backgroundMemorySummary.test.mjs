import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

test('automatic summary threshold is deterministic and invalid settings fall back safely', async () => {
  const { shouldQueueAutomaticMemorySummary } = await loadTs('../src/utils/backgroundMemorySummary.ts');
  const save = { 社交: { 记忆: { 中期记忆: ['a', 'b', 'c'] } } };
  assert.equal(shouldQueueAutomaticMemorySummary(save, { midTermTrigger: 3 }), true);
  assert.equal(shouldQueueAutomaticMemorySummary(save, { midTermTrigger: 4 }), false);
  assert.equal(shouldQueueAutomaticMemorySummary(save, { midTermTrigger: 'broken' }), false);
});

test('failed memory summary runs only after the successful narrative commit and cannot roll it back', async () => {
  const { queueIsolatedMemorySummary } = await loadTs('../src/utils/backgroundMemorySummary.ts');
  const state = { narrative: null, errors: [] };
  const scheduled = [];

  state.narrative = '正文已成功提交';
  queueIsolatedMemorySummary(
    async () => { throw new Error('injected memory-summary API failure'); },
    error => state.errors.push(error.message),
    callback => scheduled.push(callback),
  );

  assert.equal(state.narrative, '正文已成功提交');
  assert.equal(state.errors.length, 0);
  assert.equal(scheduled.length, 1);
  scheduled[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.narrative, '正文已成功提交');
  assert.deepEqual(state.errors, ['injected memory-summary API failure']);
});

test('summary commit preserves memories appended by a later successful narrative while the API was in flight', async () => {
  const { remainingMemoriesAfterSummary } = await loadTs('../src/utils/backgroundMemorySummary.ts');
  const summarized = ['old-1', 'old-2'];
  assert.deepEqual(
    remainingMemoriesAfterSummary(['old-1', 'old-2', 'kept', 'newly-appended'], summarized),
    ['kept', 'newly-appended'],
  );
  assert.equal(
    remainingMemoriesAfterSummary(['changed-prefix', 'old-2', 'newly-appended'], summarized),
    null,
    'a changed prefix must abort instead of deleting or overwriting current memory',
  );
});

test('Q23：等回合结束的等待——没有回合立即返回、回合结束返回 settled、可取消、有上限', async () => {
  const { waitForForegroundTurnToSettle } = await loadTs('../src/utils/backgroundMemorySummary.ts');
  assert.equal(await waitForForegroundTurnToSettle(() => false, { timeoutMs: 0 }), 'settled');
  let active = true;
  setTimeout(() => { active = false; }, 30);
  assert.equal(await waitForForegroundTurnToSettle(() => active, { timeoutMs: 1000, pollMs: 5 }), 'settled');
  let switched = false;
  setTimeout(() => { switched = true; }, 20);
  assert.equal(await waitForForegroundTurnToSettle(() => true, { timeoutMs: 1000, pollMs: 5, shouldCancel: () => switched }), 'cancelled');
  const started = Date.now();
  assert.equal(await waitForForegroundTurnToSettle(() => true, { timeoutMs: 40, pollMs: 5 }), 'timeout');
  assert.ok(Date.now() - started < 500);
});
