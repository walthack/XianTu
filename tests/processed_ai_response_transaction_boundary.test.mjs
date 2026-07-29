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
    transactionCommitted: true,
  }), {
    isValid: true,
    errors: [],
    transactionCommitted: true,
  });
  assert.deepEqual(validateProcessedAIResponse({
    text: '局势仍在推进，但眼下还没有可确认的新结果。',
    transactionCommitted: true,
  }), {
    isValid: true,
    errors: [],
    transactionCommitted: true,
  });
});

test('uncommitted generation failures still request a structural retry', async () => {
  const { validateProcessedAIResponse } =
    await loadTs('../src/utils/processedAIResponseValidation.ts');

  assert.equal(validateProcessedAIResponse({ text: '' }).isValid, false);
  assert.equal(validateProcessedAIResponse({
    text: '（AI生成失败）',
    mid_term_memory: '',
    tavern_commands: [],
  }).isValid, false);
  assert.equal(validateProcessedAIResponse({
    text: '有效正文',
    mid_term_memory: {},
  }).isValid, false);
  assert.equal(validateProcessedAIResponse({
    text: '有效正文',
    tavern_commands: {},
  }).isValid, false);
});

test('committed responses never replay the player transaction for optional model fields', async () => {
  const { validateProcessedAIResponse } =
    await loadTs('../src/utils/processedAIResponseValidation.ts');

  const result = validateProcessedAIResponse({
    text: '有效正文',
    mid_term_memory: {},
    tavern_commands: {},
    transactionCommitted: true,
  });
  assert.equal(result.isValid, true);
  assert.equal(result.transactionCommitted, true);
});
