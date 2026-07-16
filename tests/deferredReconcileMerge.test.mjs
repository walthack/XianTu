import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/modules/scenarioMods/deferredReconcileMerge.ts');

function save(flags, divergences = []) {
  return { 世界: { 状态: { 剧本模组: { flags, divergences } } } };
}

test('deferred reconcile merges only isolated flag deltas and preserves later current state', async () => {
  const { mergeDeferredReconcileResult } = await modPromise;
  const baseline = save({ 'event.s06_03.done': false, untouched: 'base' });
  const isolated = save({ 'event.s06_03.done': true, untouched: 'base' });
  const current = save({ 'event.s06_03.done': false, untouched: 'later player value', laterFlag: true });

  assert.equal(mergeDeferredReconcileResult(current, baseline, isolated), true);
  assert.deepEqual(current.世界.状态.剧本模组.flags, {
    'event.s06_03.done': true,
    untouched: 'later player value',
    laterFlag: true,
  });
});

test('deferred reconcile appends divergence records idempotently', async () => {
  const { mergeDeferredReconcileResult } = await modPromise;
  const baseline = save({}, []);
  const divergence = { id: 'divergence.lcq.event.s06_03.1', eventId: 'lcq.event.s06_03', worldDelta: '谢艺生还' };
  const isolated = save({ 'event.s06_03.void': true }, [divergence]);
  const current = save({ playerChoice: true }, []);

  assert.equal(mergeDeferredReconcileResult(current, baseline, isolated), true);
  assert.equal(current.世界.状态.剧本模组.divergences.length, 1);
  assert.equal(mergeDeferredReconcileResult(current, baseline, isolated), true);
  assert.equal(current.世界.状态.剧本模组.divergences.length, 1);
});
