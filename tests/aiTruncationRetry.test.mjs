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

function directConfig() {
  return {
    provider: 'openai',
    url: 'https://fixture.example/v1',
    apiKey: 'not-a-secret',
    model: 'unknown-fixture-model',
    temperature: 0.2,
    maxTokens: 16000,
  };
}

test('typed truncation is not retried as a generic network error', async () => {
  const term = await loadTs('../src/services/aiResponseTermination.ts');
  const err = new term.OutputTruncationError({ finishReason: 'length', budget: 8192, attempt: 0 });
  assert.equal(term.isOutputTruncationError(err), true);
  assert.equal(term.isNonRetryableAiError(err), true);
  assert.equal(term.isNonRetryableAiError(new Error('网络错误：无法连接到API服务器')), false);
});

test('call-level budget is honored; unknown models keep the main safety cap', async () => {
  const { aiService } = await loadTs('../src/services/aiService.ts');
  assert.equal(aiService.getEffectiveRequestedMaxTokens('custom', 'unknown-163k-model', 16000, 'main'), 8192);
  assert.equal(aiService.getEffectiveRequestedMaxTokens('custom', 'unknown-163k-model', 16000, 'main', 2048), 2048);
  assert.equal(aiService.getEffectiveRequestedMaxTokens('custom', 'unknown-163k-model', 16000, 'event_reconcile'), 16000);
});

test('diagnostics record truncation separately from request attempts and omit secrets', async () => {
  const term = await loadTs('../src/services/aiResponseTermination.ts');
  term.clearAiRequestDiagnostics();
  term.recordAiRequestDiagnostic({
    usageType: 'main',
    requestId: 'req_1',
    attempt: 0,
    finishReason: 'length',
    budget: 8192,
    inputChars: 1200,
    usage: { total: 9000, output: 8192, reasoning: 4000 },
    truncated: true,
  });
  term.recordAiRequestDiagnostic({
    usageType: 'main',
    requestId: 'req_1',
    attempt: 1,
    finishReason: 'stop',
    budget: 16384,
    inputChars: 1200,
    truncated: false,
  });
  const rows = term.peekAiRequestDiagnostics();
  assert.equal(rows.length, 2);
  assert.equal(rows.filter(item => item.truncated).length, 1);
  assert.equal(rows[0].requestId, rows[1].requestId);
  assert.equal(JSON.stringify(rows).includes('sk-'), false);
  assert.equal(JSON.stringify(rows).includes('apiKey'), false);
  assert.equal(term.readUsageTotals({ total_tokens: null, completion_tokens: null })?.total, undefined);
  for (let i = 0; i < 50; i += 1) {
    term.recordAiRequestDiagnostic({ usageType: 'main', requestId: `req_${i}`, attempt: 0 });
  }
  assert.ok(term.peekAiRequestDiagnostics().length <= 40);
});

test('finish_reason=length does not start a retry storm and leaves no partial JSON', async () => {
  const { aiService } = await loadTs('../src/services/aiService.ts');
  const term = await loadTs('../src/services/aiResponseTermination.ts');
  term.clearAiRequestDiagnostics();
  const originalPost = axios.post;
  let calls = 0;
  axios.post = async () => {
    calls += 1;
    return {
      data: {
        choices: [{ message: { content: '{"text":"partial' }, finish_reason: 'length' }],
        usage: { total_tokens: 9000, completion_tokens: 8192 },
      },
    };
  };
  try {
    await assert.rejects(
      () => aiService.generateWithAPIConfig(
        { user_input: 'continue', should_stream: false, requestMaxRetries: 3, usageType: 'main' },
        directConfig(),
      ),
      term.isOutputTruncationError,
    );
    assert.equal(calls, 1);
  } finally {
    axios.post = originalPost;
  }
});

test('ordinary network errors still retry', async () => {
  const { aiService } = await loadTs('../src/services/aiService.ts');
  let calls = 0;
  await assert.rejects(() => aiService.executeWithRetry(async () => {
    calls += 1;
    throw new Error('网络错误：无法连接到API服务器');
  }, 'generate[main]', 1));
  assert.equal(calls, 2);
});

test('main narrative truncation recovers once with a larger, non-streaming budget', async () => {
  const { aiService, TRUNCATION_RECOVERY_MAX_TOKENS } = await loadTs('../src/services/aiService.ts');
  const term = await loadTs('../src/services/aiResponseTermination.ts');
  const original = aiService.generateOnce;
  const seen = [];
  const run = async (options, outcomes) => {
    seen.length = 0;
    aiService.generateOnce = async opts => {
      seen.push(opts);
      const next = outcomes[seen.length - 1];
      if (next instanceof Error) throw next;
      return next;
    };
    return aiService.generate(options);
  };
  const truncated = () => new term.OutputTruncationError({ budget: 8192 });
  const stream = () => {};
  try {
    assert.equal(
      await run({ user_input: 'x', usageType: 'main', should_stream: true, onStreamChunk: stream }, [truncated(), 'full']),
      'full',
    );
    assert.equal(seen.length, 2);
    assert.equal(seen[1].maxTokens, TRUNCATION_RECOVERY_MAX_TOKENS);
    assert.equal(seen[1].should_stream, false);
    assert.equal(seen[1].onStreamChunk, undefined);
    assert.equal(seen[1].requestMaxRetries, 0);

    await assert.rejects(
      () => run({ user_input: 'x' }, [truncated(), truncated()]),
      err => term.isOutputTruncationError(err) && err.recoveryAttempted === true,
    );
    assert.equal(seen.length, 2, 'recovery happens at most once');

    await assert.rejects(() => run({ user_input: 'x', usageType: 'main', maxTokens: 1024 }, [truncated()]), term.isOutputTruncationError);
    assert.equal(seen.length, 1, 'call-level budgets (intent classifier) do not recover');

    await assert.rejects(() => run({ user_input: 'x', usageType: 'event_reconcile' }, [truncated()]), term.isOutputTruncationError);
    assert.equal(seen.length, 1, 'non-main usage does not recover');

    await assert.rejects(() => run({ user_input: 'x', usageType: 'main' }, [new Error('网络错误')]), /网络错误/);
    assert.equal(seen.length, 1, 'ordinary errors are not treated as truncation');
  } finally {
    aiService.generateOnce = original;
  }
});
