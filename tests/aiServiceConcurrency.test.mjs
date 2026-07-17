import assert from 'node:assert/strict';
import test from 'node:test';

import axios from 'axios';
import { loadTs } from './loadTs.mjs';

if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
  };
}

const modPromise = loadTs('../src/services/aiService.ts');

function directConfig(url, model) {
  return {
    provider: 'openai',
    url,
    apiKey: `key-${model}`,
    model,
    temperature: 0.2,
    maxTokens: 512,
  };
}

test('main narrative output reserves context headroom on unknown compatible models', async () => {
  const { aiService } = await modPromise;
  assert.equal(aiService.getEffectiveRequestedMaxTokens('custom', 'unknown-163k-model', 16000, 'main'), 8192);
  assert.equal(aiService.getEffectiveRequestedMaxTokens('custom', 'unknown-163k-model', 16000, 'event_reconcile'), 16000);
});

test('concurrent direct calls keep immutable per-request API configurations', async () => {
  const { aiService } = await modPromise;
  const originalPost = axios.post;
  const pending = [];
  axios.post = (url, body, options) => new Promise((resolve, reject) => {
    pending.push({ url, body, options, resolve, reject });
  });

  try {
    const first = aiService.generateWithAPIConfig(
      { user_input: 'first', should_stream: false, requestMaxRetries: 0 },
      directConfig('https://one.example/v1', 'model-one'),
    );
    const second = aiService.generateWithAPIConfig(
      { user_input: 'second', should_stream: false, requestMaxRetries: 0 },
      directConfig('https://two.example/v1', 'model-two'),
    );

    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pending.length, 2);
    assert.match(pending[0].url, /one\.example\/v1\/chat\/completions$/);
    assert.equal(pending[0].body.model, 'model-one');
    assert.match(pending[1].url, /two\.example\/v1\/chat\/completions$/);
    assert.equal(pending[1].body.model, 'model-two');
    assert.notEqual(pending[0].options.signal, pending[1].options.signal);

    pending[1].resolve({ data: { choices: [{ message: { content: 'second-result' }, finish_reason: 'stop' }] } });
    pending[0].resolve({ data: { choices: [{ message: { content: 'first-result' }, finish_reason: 'stop' }] } });
    assert.deepEqual(await Promise.all([first, second]), ['first-result', 'second-result']);
  } finally {
    axios.post = originalPost;
  }
});

test('cancelAllRequests aborts every active request instead of only the newest one', async () => {
  const { aiService } = await modPromise;
  const originalPost = axios.post;
  const signals = [];
  axios.post = (_url, _body, options) => new Promise((_resolve, reject) => {
    signals.push(options.signal);
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });

  try {
    const first = aiService.generateWithAPIConfig(
      { user_input: 'first', should_stream: false, requestMaxRetries: 0 },
      directConfig('https://one.example/v1', 'model-one'),
    );
    const second = aiService.generateWithAPIConfig(
      { user_input: 'second', should_stream: false, requestMaxRetries: 0 },
      directConfig('https://two.example/v1', 'model-two'),
    );

    await new Promise(resolve => setImmediate(resolve));
    assert.equal(signals.length, 2);
    aiService.cancelAllRequests();
    assert.equal(signals.every(signal => signal.aborted), true);
    await assert.rejects(first, /abort/i);
    await assert.rejects(second, /abort/i);
  } finally {
    axios.post = originalPost;
  }
});

test('fetching models for an edited API never swaps the saved global configuration', async () => {
  const { aiService } = await modPromise;
  const originalGet = axios.get;
  aiService.saveConfig({ customAPI: directConfig('https://main.example/v1', 'main-model') });
  const before = aiService.getConfig();
  let requestedUrl = '';
  axios.get = async (url) => {
    requestedUrl = url;
    return { data: { data: [{ id: 'edited-model' }] } };
  };

  try {
    const models = await aiService.fetchModelsForConfig(directConfig('https://edited.example/v1', 'draft-model'));
    assert.deepEqual(models, ['edited-model']);
    assert.match(requestedUrl, /edited\.example\/v1\/models$/);
    assert.deepEqual(aiService.getConfig().customAPI, before.customAPI);
  } finally {
    axios.get = originalGet;
  }
});
