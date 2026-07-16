import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/utils/initialGenerationPolicy.ts');

test('initial split generation never exceeds four calls or two retries', async () => {
  const { INITIAL_GENERATION_POLICY } = await modPromise;
  assert.equal(INITIAL_GENERATION_POLICY.attemptsPerStep * 2, 4);
  assert.equal(INITIAL_GENERATION_POLICY.maxCalls, 4);
  assert.equal(INITIAL_GENERATION_POLICY.maxRetries, 2);
});

test('only severely short or long opening narratives spend a retry', async () => {
  const { classifyInitialNarrativeLength, shouldRetryInitialNarrative } = await modPromise;
  assert.equal(classifyInitialNarrativeLength(199), 'hard_short');
  assert.equal(classifyInitialNarrativeLength(200), 'normal');
  assert.equal(classifyInitialNarrativeLength(1600), 'normal');
  assert.equal(classifyInitialNarrativeLength(1601), 'soft_long');
  assert.equal(classifyInitialNarrativeLength(2400), 'soft_long');
  assert.equal(classifyInitialNarrativeLength(2401), 'hard_long');

  assert.equal(shouldRetryInitialNarrative(2999), true);
  assert.equal(shouldRetryInitialNarrative(1800), false);
});

test('step token budgets are per-call safety rails, not global API limits', async () => {
  const { INITIAL_GENERATION_POLICY, initialGenerationRequestLimits } = await modPromise;
  assert.equal(INITIAL_GENERATION_POLICY.step1MaxTokens, 3072);
  assert.equal(INITIAL_GENERATION_POLICY.step2MaxTokens, 8192);
  assert.deepEqual(initialGenerationRequestLimits(3072), {
    maxTokens: 3072,
    requestMaxRetries: 0,
  });
});
