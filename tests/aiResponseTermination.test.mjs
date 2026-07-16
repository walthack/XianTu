import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/services/aiResponseTermination.ts');

test('recognizes provider-specific output truncation reasons', async () => {
  const { isTruncatedFinishReason } = await modPromise;
  assert.equal(isTruncatedFinishReason('length'), true);
  assert.equal(isTruncatedFinishReason('max_tokens'), true);
  assert.equal(isTruncatedFinishReason('MAX_TOKENS'), true);
  assert.equal(isTruncatedFinishReason('stop'), false);
  assert.equal(isTruncatedFinishReason(undefined), false);
});
