import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/utils/boundedAuxiliaryTask.ts');

test('returns completed value before the deadline', async () => {
  const { runBoundedAuxiliaryTask } = await modPromise;
  const result = await runBoundedAuxiliaryTask(async () => 42, 50);
  assert.deepEqual(result, { status: 'completed', value: 42 });
});

test('returns failed without throwing into the primary transaction', async () => {
  const { runBoundedAuxiliaryTask } = await modPromise;
  const error = new Error('aux failed');
  const result = await runBoundedAuxiliaryTask(async () => { throw error; }, 50);
  assert.equal(result.status, 'failed');
  assert.equal(result.error, error);
});

test('times out while a late isolated mutation remains uncommitted', async () => {
  const { runBoundedAuxiliaryTask } = await modPromise;
  const primary = { value: 'primary' };
  const isolated = structuredClone(primary);

  const result = await runBoundedAuxiliaryTask(async () => {
    await new Promise(resolve => setTimeout(resolve, 30));
    isolated.value = 'late auxiliary value';
    return isolated;
  }, 5);

  assert.deepEqual(result, { status: 'timed_out' });
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(primary.value, 'primary');
  assert.equal(isolated.value, 'late auxiliary value');
});
