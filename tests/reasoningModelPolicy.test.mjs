import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
import { loadTs } from './loadTs.mjs';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const policy = await loadTs('../src/services/aiReasoningModelPolicy.ts');
const { aiService } = await loadTs('../src/services/aiService.ts');
const API = { provider: 'custom', url: 'https://fixture.invalid/v1', apiKey: '', model: 'MiniMax-M3.1-Flash' };
const call = (extra = {}) => aiService.generate({ user_input: 'fixture', should_stream: false, apiConfigOverride: API, maxTokens: 3072, requestMaxRetries: 0, background: true, ...extra });
const reply = (content, reasoning, finish_reason) => ({ data: { choices: [{ message: { content, reasoning }, finish_reason }] } });
async function withAxios(responses, fn) {
  const original = axios.post; const calls = [];
  axios.post = async (_url, body, options) => { calls.push({ body, options }); return responses[Math.min(calls.length - 1, responses.length - 1)]; };
  try { await fn(calls); } finally { axios.post = original; }
}
test('known model detection and baseline budgets leave ordinary models unchanged', () => {
  for (const model of ['MiniMax-M3.1-Flash', 'deepseek-r1', 'foo-thinking', 'reasoner']) {
    assert.equal(policy.reasoningPolicy(model), true);
    assert.equal(policy.reasoningLimits(model, 3072), 16384);
    assert.equal(policy.reasoningTimeout(model, 120000), 360000);
  }
  assert.equal(policy.reasoningLimits('ordinary', 3072), 3072);
  assert.equal(policy.reasoningTimeout('ordinary', 120000), 120000);
});
test('response fields and closed/unfinished think tags are remembered without returning reasoning', () => {
  assert.equal(policy.observeReasoning('dynamic-a', '', 'private thought'), '');
  assert.equal(policy.reasoningPolicy('DYNAMIC-A'), true);
  assert.equal(policy.observeReasoning('dynamic-b', '<think>thought</think>visible'), 'visible');
  assert.equal(policy.observeReasoning('dynamic-c', '<think>unfinished'), '');
  assert.equal(policy.reasoningPolicy('dynamic-c'), true);
});
test('known nonstream model gets larger budget and exactly one exhausted retry', async () => {
  await withAxios([reply('', 'thought', 'length'), reply('visible', '', 'stop')], async calls => {
    assert.equal(await call(), 'visible');
    assert.deepEqual(calls.map(c => c.body.max_tokens), [16384, 32768]);
    assert.ok(calls.every(c => c.options.timeout >= 300000));
  });
});
test('unknown response is recognized dynamically; retry and next call use larger limits', async () => {
  const api = { ...API, model: 'dynamic-transport' };
  await withAxios([reply('', 'thought', 'length'), reply('visible', '', 'stop')], async calls => {
    assert.equal(await call({ apiConfigOverride: api }), 'visible');
    assert.deepEqual(calls.map(c => c.body.max_tokens), [3072, 16384]);
    await call({ apiConfigOverride: api });
    assert.equal(calls[2].body.max_tokens, 16384);
    assert.ok(calls[1].options.timeout >= 300000);
  });
});
test('repeated reasoning exhaustion stops after two requests even with generic retries enabled', async () => {
  await withAxios([reply('', 'thought', 'length')], async calls => {
    await assert.rejects(call({ requestMaxRetries: 3 }), policy.ReasoningExhaustedError);
    assert.equal(calls.length, 2);
  });
});
test('visible length truncation and empty stop do not trigger reasoning recovery', async () => {
  await withAxios([reply('partial', 'thought', 'length')], async calls => {
    await assert.rejects(call()); assert.equal(calls.length, 1);
  });
  await withAxios([reply('', 'thought', 'stop')], async calls => {
    assert.equal(await call(), ''); assert.equal(calls.length, 1);
  });
});
test('cancelled exhausted request never starts retry', async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(policy.retryReasoningOnce(3072, async () => {
    calls++; controller.abort(); throw new policy.ReasoningExhaustedError(3072);
  }, controller.signal));
  assert.equal(calls, 1);
});
test('stream reasoning-only length response retries once and separates visible output', async () => {
  const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    const first = calls.length === 1;
    const events = [{ choices: [{ delta: first ? { reasoning_content: 'thought' } : { content: 'visible' } }] }, { choices: [{ delta: {}, finish_reason: first ? 'length' : 'stop' }] }];
    return new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  };
  try {
    assert.equal(await call({ should_stream: true }), 'visible');
    assert.deepEqual(calls.map(c => c.max_tokens), [16384, 32768]);
  } finally { globalThis.fetch = original; }
});
test('thinking budget is disabled by default', () => {
  assert.deepEqual(policy.reasoningBudgetParam('https://openrouter.ai/api/v1'), {});
  assert.deepEqual(policy.reasoningBudgetParam('https://api.minimaxi.com/v1'), {});
});
test('turn deadline extension is idempotent and preserves invalidation', async () => {
  const turns = await loadTs('../src/services/qingyuTurnLongRequests.ts');
  const id = turns.beginQingyuTurnLongRequests({ 世界: { 状态: { 剧本模组: { modId: 'lcq.stage_01' } } } });
  try {
    // Fixed-world deadline remains anchored at the original turn start.
    const before = turns.remainingQingyuTurnTimeMs(id);
    turns.extendQingyuTurnDeadline(id, 720000);
    const after = turns.remainingQingyuTurnTimeMs(id);
    turns.extendQingyuTurnDeadline(id, 720000);
    assert.ok(before > 0 && before <= 60000);
    assert.ok(after > 719000 && after <= 720000);
    if (after !== null) assert.ok(turns.remainingQingyuTurnTimeMs(id) <= after);
    turns.invalidateQingyuTurnLongRequests(id);
    turns.extendQingyuTurnDeadline(id, 1000000);
    assert.equal(turns.remainingQingyuTurnLongRequests(id), 0);
  } finally { turns.releaseQingyuTurnLongRequests(id); }
});
test('optional reasoning budget is sent only to supported host; invalid regex is rejected', async () => {
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  const before = structuredClone(numbers.GAME_NUMBERS.aiRetry.reasoning);
  try {
    numbers.applyGameNumbers({ aiRetry: { reasoning: { budgetTokens: 2048 } } });
    assert.deepEqual(policy.reasoningBudgetParam('https://openrouter.ai/api/v1'), { reasoning: { max_tokens: 2048 } });
    assert.deepEqual(policy.reasoningBudgetParam('https://api.minimaxi.com/v1'), {});
    assert.throws(() => numbers.applyGameNumbers({ aiRetry: { reasoning: { modelPattern: '[' } } }));
  } finally { numbers.applyGameNumbers({ aiRetry: { reasoning: before } }); }
});
test('stream installs enlarged first-byte and total timers, including content-idle mode', async () => {
  const originalFetch = globalThis.fetch, originalTimer = globalThis.setTimeout;
  const timers = [];
  globalThis.setTimeout = (fn, ms, ...args) => { timers.push(ms); return originalTimer(fn, ms, ...args); };
  globalThis.fetch = async () => new Response('data: {"choices":[{"delta":{"content":"visible"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  try {
    assert.equal(await call({ should_stream: true }), 'visible');
    assert.ok(timers.includes(360000));
    assert.ok(timers.includes(300000));
    assert.ok(timers.includes(720000));
    timers.length = 0;
    assert.equal(await call({ should_stream: true, timeoutMode: 'content_idle' }), 'visible');
    assert.ok(timers.filter(ms => ms === 300000).length >= 2);
    assert.ok(!timers.includes(30000));
  } finally { globalThis.fetch = originalFetch; globalThis.setTimeout = originalTimer; }
});
test('stream unsupported fallback keeps enlarged axios timeout and token limit', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } });
  try {
    await withAxios([reply('visible', 'thought', 'stop')], async calls => {
      assert.equal(await call({ should_stream: true }), 'visible');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].body.max_tokens, 16384);
      assert.equal(calls[0].options.timeout, 300000);
    });
  } finally { globalThis.fetch = original; }
});
test('think-only length in content dynamically triggers recovery', async () => {
  await withAxios([reply('<think>unfinished', '', 'length'), reply('<think>done</think>visible', '', 'stop')], async calls => {
    assert.equal(await call({ apiConfigOverride: { ...API, model: 'tagged-dynamic' } }), 'visible');
    assert.deepEqual(calls.map(c => c.body.max_tokens), [3072, 16384]);
  });
});
test('partial retry does not start a third generic truncation recovery', async () => {
  await withAxios([reply('', 'thought', 'length'), reply('partial', '', 'length')], async calls => {
    await assert.rejects(call({ maxTokens: undefined }));
    assert.equal(calls.length, 2);
  });
});
