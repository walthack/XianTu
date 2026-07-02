import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const { buildOpenAICompatibleEndpoint, normalizeOpenAIBaseUrl } = await loadTs('../src/services/openAIEndpoint.ts');

test('normalizes OpenAI-compatible base URLs without duplicating v1', () => {
  assert.equal(normalizeOpenAIBaseUrl(' https://api.minimaxi.com/v1/ '), 'https://api.minimaxi.com/v1');
  assert.equal(
    buildOpenAICompatibleEndpoint('https://api.minimaxi.com', 'chat/completions'),
    'https://api.minimaxi.com/v1/chat/completions'
  );
  assert.equal(
    buildOpenAICompatibleEndpoint('https://api.minimaxi.com/v1/', 'chat/completions'),
    'https://api.minimaxi.com/v1/chat/completions'
  );
  assert.equal(
    buildOpenAICompatibleEndpoint('https://api.minimaxi.com/v1/chat/completions', 'chat/completions'),
    'https://api.minimaxi.com/v1/chat/completions'
  );
});

test('derives the models endpoint from root, v1, or a complete chat endpoint', () => {
  for (const url of [
    'https://api.minimaxi.com',
    'https://api.minimaxi.com/v1',
    'https://api.minimaxi.com/v1/chat/completions'
  ]) {
    assert.equal(
      buildOpenAICompatibleEndpoint(url, 'models'),
      'https://api.minimaxi.com/v1/models'
    );
  }
});

