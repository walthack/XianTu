import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

test('processed response accepts an empty optional memory without replaying the player action', async () => {
  const { validateProcessedAIResponse } =
    await loadTs('../src/utils/processedAIResponseValidation.ts');

  assert.deepEqual(validateProcessedAIResponse({
    text: '局势仍在推进，但眼下还没有可确认的新结果。',
    mid_term_memory: '',
    tavern_commands: [],
  }), {
    isValid: true,
    errors: [],
  });
  assert.deepEqual(validateProcessedAIResponse({
    text: '局势仍在推进，但眼下还没有可确认的新结果。',
    tavern_commands: [],
  }), {
    isValid: true,
    errors: [],
  });
});

test('processed response still rejects malformed state-bearing fields', async () => {
  const { validateProcessedAIResponse } =
    await loadTs('../src/utils/processedAIResponseValidation.ts');

  assert.equal(validateProcessedAIResponse({ text: '' }).isValid, false);
  assert.equal(validateProcessedAIResponse({
    text: '有效正文',
    mid_term_memory: {},
  }).isValid, false);
  assert.equal(validateProcessedAIResponse({
    text: '有效正文',
    tavern_commands: {},
  }).isValid, false);
});
