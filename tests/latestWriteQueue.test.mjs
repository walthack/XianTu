import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/utils/latestWriteQueue.ts');

test('latest-write queue serializes writes and collapses queued intermediate values', async () => {
  const { createLatestWriteQueue } = await modPromise;
  const writes = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const queue = createLatestWriteQueue(async (value) => {
    writes.push(value);
    if (value === 1) await firstGate;
  });

  queue.enqueue(1);
  queue.enqueue(2);
  queue.enqueue(3);
  releaseFirst();
  await queue.flush();

  assert.deepEqual(writes, [1, 3]);
});

test('latest-write queue can be reused after a completed flush', async () => {
  const { createLatestWriteQueue } = await modPromise;
  const writes = [];
  const queue = createLatestWriteQueue(async (value) => { writes.push(value); });
  queue.enqueue('a');
  await queue.flush();
  queue.enqueue('b');
  await queue.flush();
  assert.deepEqual(writes, ['a', 'b']);
});
