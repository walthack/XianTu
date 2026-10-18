// 经过 aiService.generate 的真实重试路径（axios / fetch 打桩）：可重试状态集合真的生效、退避、Retry-After、等待可取消、超时开关、玩家提示。
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

const { aiService } = await loadTs('../src/services/aiService.ts');
const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const log = await loadTs('../src/modules/diagnostics/log.ts');
const { logStore } = await loadTs('../src/modules/diagnostics/store.ts');

const API = { provider: 'openai', url: 'https://fixture.example/v1', apiKey: 'not-a-secret', model: 'fixture-model', temperature: 0.2, maxTokens: 512 };
const FAST = { maxRetries: 1, baseDelayMs: 5, maxDelayMs: 20, factor: 2, jitter: 0, retryOnTimeout: false, retryAfterMaxMs: 120 };

const axiosFailure = (status, headers = {}) => new axios.AxiosError(`status ${status}`, 'ERR_BAD_RESPONSE', {}, {}, { status, data: { error: 'boom' }, headers });
const okReply = text => ({ data: { choices: [{ message: { content: text }, finish_reason: 'stop' }] } });

/** 用 steps 依次回应 axios.post：函数 = 抛/返回，其余当结果。返回 { calls, restore }。 */
function stubAxios(steps) {
  const original = axios.post;
  const state = { calls: 0, times: [] };
  axios.post = async () => {
    const step = steps[Math.min(state.calls, steps.length - 1)];
    state.calls++;
    state.times.push(Date.now());
    if (step instanceof Error) throw step;
    return step;
  };
  state.restore = () => { axios.post = original; };
  return state;
}

async function withNumbers(patch, body) {
  const before = structuredClone(numbers.GAME_NUMBERS.aiRetry);
  numbers.applyGameNumbers({ aiRetry: patch });
  const savedRetries = aiService.getConfig().maxRetries;
  try { return await body(); } finally { numbers.applyGameNumbers({ aiRetry: before }); aiService.saveConfig({ maxRetries: savedRetries }); }
}

const call = (extra = {}) => aiService.generate({ user_input: 'hi', should_stream: false, apiConfigOverride: API, background: true, ...extra });
const quiet = async fn => { const { log: l, warn, error } = console; console.log = console.warn = console.error = () => {}; try { return await fn(); } finally { console.log = l; console.warn = warn; console.error = error; } };

// ───────────── (a) 状态集合真正生效 ─────────────

test('不在可重试集合里的状态（400/401/403/404/422）只请求一次，不再白白重试', async () => {
  await withNumbers(FAST, async () => {
    for (const status of [400, 401, 403, 404, 422]) {
      const stub = stubAxios([axiosFailure(status)]);
      try { await assert.rejects(quiet(() => call()), err => err.status === status, String(status)); } finally { stub.restore(); }
      assert.equal(stub.calls, 1, `HTTP ${status} 不该重试`);
    }
  });
});

test('在可重试集合里的状态（408/409/425/429/500/502/503/504）会重试，第二次成功就返回结果', async () => {
  await withNumbers(FAST, async () => {
    for (const status of [408, 409, 425, 429, 500, 502, 503, 504]) {
      const stub = stubAxios([axiosFailure(status), okReply(`ok-${status}`)]);
      try { assert.equal(await quiet(() => call()), `ok-${status}`); } finally { stub.restore(); }
      assert.equal(stub.calls, 2, `HTTP ${status} 应重试一次`);
    }
  });
});

test('可重试集合改了，行为跟着改：把 429 拿掉就不重试，把 400 加进去就重试', async () => {
  await withNumbers({ ...FAST, retryStatuses: [400] }, async () => {
    const s429 = stubAxios([axiosFailure(429)]);
    try { await assert.rejects(quiet(() => call())); } finally { s429.restore(); }
    assert.equal(s429.calls, 1);
    const s400 = stubAxios([axiosFailure(400), okReply('later')]);
    try { assert.equal(await quiet(() => call()), 'later'); } finally { s400.restore(); }
    assert.equal(s400.calls, 2);
  });
});

test('没有状态码的未知错误（如配置缺失）不重试；网络错误重试', async () => {
  await withNumbers(FAST, async () => {
    const unknown = stubAxios([new Error('某个奇怪的内部错误')]);
    try { await assert.rejects(quiet(() => call()), /奇怪的内部错误/); } finally { unknown.restore(); }
    assert.equal(unknown.calls, 1);
    const network = stubAxios([Object.assign(new axios.AxiosError('Network Error', 'ERR_NETWORK', {}, {}), { request: {} }), okReply('back')]);
    try { assert.equal(await quiet(() => call()), 'back'); } finally { network.restore(); }
    assert.equal(network.calls, 2);
  });
});

test('重试次数：调用方 requestMaxRetries 优先于玩家设置，玩家设置优先于 game-numbers', async () => {
  await withNumbers({ ...FAST, maxRetries: 2 }, async () => {
    const run = async (extra) => { const s = stubAxios([axiosFailure(503)]); try { await assert.rejects(quiet(() => call(extra))); } finally { s.restore(); } return s.calls; };
    aiService.saveConfig({ maxRetries: undefined });
    assert.equal(await run({}), 3, '都没指定 → game-numbers 的 2 次重试');
    aiService.saveConfig({ maxRetries: 1 });
    assert.equal(await run({}), 2, '玩家设了 1');
    assert.equal(await run({ requestMaxRetries: 3 }), 4, '调用方指定 3');
    assert.equal(await run({ requestMaxRetries: 0 }), 1, '调用方指定 0 = 不重试');
  });
});

// ───────────── (b)(c) 退避与 Retry-After ─────────────

test('指数退避：连续重试的间隔逐次翻倍并封顶', async () => {
  await withNumbers({ ...FAST, maxRetries: 3, baseDelayMs: 40, factor: 2, maxDelayMs: 100 }, async () => {
    const stub = stubAxios([axiosFailure(503)]);
    try { await assert.rejects(quiet(() => call())); } finally { stub.restore(); }
    assert.equal(stub.calls, 4);
    const gaps = stub.times.slice(1).map((t, i) => t - stub.times[i]);
    assert.ok(gaps[0] >= 35 && gaps[0] < 80, `第一次等约 40ms：${gaps}`);
    assert.ok(gaps[1] >= 75 && gaps[1] < 140, `第二次等约 80ms：${gaps}`);
    assert.ok(gaps[2] >= 95 && gaps[2] < 170, `第三次封顶约 100ms：${gaps}`);
  });
});

test('Retry-After（axios 响应头）比退避长就等它，且按 retryAfterMaxMs 截断', async () => {
  await withNumbers({ ...FAST, baseDelayMs: 5, maxDelayMs: 20, retryAfterMaxMs: 150 }, async () => {
    const stub = stubAxios([axiosFailure(429, { 'retry-after': '30' }), okReply('ok')]);
    try { assert.equal(await quiet(() => call()), 'ok'); } finally { stub.restore(); }
    const gap = stub.times[1] - stub.times[0];
    assert.ok(gap >= 140 && gap < 1000, `30 秒被截到 150ms：${gap}`);
  });
});

test('Retry-After 为 HTTP 日期、或比退避短时：日期被读到，短的不缩短退避', async () => {
  await withNumbers({ ...FAST, baseDelayMs: 60, maxDelayMs: 200, retryAfterMaxMs: 5000 }, async () => {
    const stub = stubAxios([axiosFailure(503, { 'Retry-After': '0' }), okReply('ok')]);
    try { await quiet(() => call()); } finally { stub.restore(); }
    assert.ok(stub.times[1] - stub.times[0] >= 55, 'Retry-After: 0 不会把退避缩成 0');
  });
});

test('流式 fetch 的 429：Retry-After 从 Response 头读到并生效，状态码保留', async () => {
  await withNumbers({ ...FAST, retryAfterMaxMs: 150 }, async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    const times = [];
    globalThis.fetch = async () => {
      calls++; times.push(Date.now());
      if (calls === 1) return new Response('slow down', { status: 429, headers: { 'Retry-After': '30' } });
      return new Response('data: {"choices":[{"delta":{"content":"流式成功"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
    try { assert.equal(await quiet(() => call({ should_stream: true })), '流式成功'); } finally { globalThis.fetch = originalFetch; }
    assert.equal(calls, 2);
    assert.ok(times[1] - times[0] >= 140, `按 Retry-After（截到 150ms）等待：${times[1] - times[0]}`);
  });
});

// ───────────── (d) 等待期间可取消 ─────────────

test('退避等待中取消：立即结束，不再发第二次请求', async () => {
  await withNumbers({ ...FAST, baseDelayMs: 5000, maxDelayMs: 5000 }, async () => {
    const stub = stubAxios([axiosFailure(503)]);
    const controller = new AbortController();
    const started = Date.now();
    const pending = quiet(() => call({ signal: controller.signal }));
    setTimeout(() => controller.abort(), 80);
    try { await assert.rejects(pending, /取消|abort/i); } finally { stub.restore(); }
    assert.ok(Date.now() - started < 2000, `没等满 5 秒：${Date.now() - started}ms`);
    assert.equal(stub.calls, 1);
  });
});

// ───────────── (e) 玩家可读提示 ─────────────

test('重试用尽后的错误是玩家读得懂的话：写明状态与“已自动重试 N 次”，保留 status 和原始 cause', async () => {
  await withNumbers({ ...FAST, maxRetries: 2 }, async () => {
    const cases = [
      [429, /请求过于频繁（429）.*已自动重试 2 次仍失败/],
      [503, /服务暂不可用（503）.*已自动重试 2 次仍失败/],
      [502, /服务暂时出错（502）.*已自动重试 2 次仍失败/],
    ];
    for (const [status, pattern] of cases) {
      const stub = stubAxios([axiosFailure(status)]);
      try {
        await assert.rejects(quiet(() => call()), err => {
          assert.match(err.message, pattern);
          assert.equal(err.status, status);
          assert.equal(err.retryAttempts, 2);
          assert.ok(err.cause, '保留原始错误');
          assert.doesNotMatch(err.message, /boom|\{/, '不把服务商返回的 JSON 原样甩给玩家');
          return true;
        });
      } finally { stub.restore(); }
      assert.equal(stub.calls, 3);
    }
  });
});

test('网络错误重试用尽：提示检查网络与 API 地址', async () => {
  await withNumbers(FAST, async () => {
    const stub = stubAxios([Object.assign(new axios.AxiosError('Network Error', 'ERR_NETWORK', {}, {}), { request: {} })]);
    try { await assert.rejects(quiet(() => call()), /无法连接到 AI 服务器.*已自动重试 1 次仍失败.*网络/); } finally { stub.restore(); }
  });
});

test('不重试的失败不谎称重试过：401 给密钥提示，maxRetries=0 的 429 不带“已自动重试”', async () => {
  await withNumbers(FAST, async () => {
    const s401 = stubAxios([axiosFailure(401)]);
    try { await assert.rejects(quiet(() => call()), err => /密钥无效或已过期/.test(err.message) && !/已自动重试/.test(err.message)); } finally { s401.restore(); }
    const s429 = stubAxios([axiosFailure(429)]);
    try { await assert.rejects(quiet(() => call({ requestMaxRetries: 0 })), err => /请求过于频繁（429）/.test(err.message) && !/已自动重试/.test(err.message)); } finally { s429.restore(); }
    assert.equal(s429.calls, 1);
  });
});

test('重试与耗尽分别记 LCQ-NET-008 / LCQ-NET-009', async () => {
  await withNumbers({ ...FAST, maxRetries: 1 }, async () => {
    await log.resetLogState();
    const stub = stubAxios([axiosFailure(429, { 'retry-after': '1' })]);
    try { await assert.rejects(quiet(() => call())); } finally { stub.restore(); }
    const entries = logStore.recent(200).filter(entry => entry.code === 'LCQ-NET-008' || entry.code === 'LCQ-NET-009');
    const retry = entries.find(entry => entry.code === 'LCQ-NET-008');
    const spent = entries.find(entry => entry.code === 'LCQ-NET-009');
    assert.ok(retry, `缺 NET-008：${entries.map(e => e.code)}`);
    assert.ok(spent, `缺 NET-009：${entries.map(e => e.code)}`);
    assert.equal(retry.detail.status, 429);
    assert.equal(retry.detail.source, 'retry-after');
    assert.equal(spent.detail.why, 'retries_exhausted');
    await log.resetLogState();
  });
});

// ───────────── (f) 超时 ─────────────

const timeoutFailure = () => new axios.AxiosError('timeout of 120000ms exceeded', 'ECONNABORTED', { timeout: 120000 });

test('超时默认不自动重试（retryOnTimeout=false）：只请求一次，原样给出“请手动重试”的超时错误', async () => {
  await withNumbers(FAST, async () => {
    const stub = stubAxios([timeoutFailure()]);
    try { await assert.rejects(quiet(() => call()), err => err.code === 'AI_REQUEST_TIMEOUT' && /请手动重试/.test(err.message)); } finally { stub.restore(); }
    assert.equal(stub.calls, 1);
  });
});

test('retryOnTimeout=true 才重试超时；耗尽后仍是原来的超时错误（不被改写）', async () => {
  await withNumbers({ ...FAST, retryOnTimeout: true }, async () => {
    const recovered = stubAxios([timeoutFailure(), okReply('after-timeout')]);
    try { assert.equal(await quiet(() => call()), 'after-timeout'); } finally { recovered.restore(); }
    assert.equal(recovered.calls, 2);
    const stuck = stubAxios([timeoutFailure()]);
    try { await assert.rejects(quiet(() => call()), err => err.code === 'AI_REQUEST_TIMEOUT'); } finally { stuck.restore(); }
    assert.equal(stuck.calls, 2);
  });
});

// ───────────── 酒馆路径：内外两层不重复重试 ─────────────

test('酒馆路径的内层重试用尽后，外层不再叠加一轮（总请求数 = 1 + 重试次数）', async () => {
  await withNumbers(FAST, async () => {
    let calls = 0;
    const hadWindow = 'window' in globalThis;
    const previousWindow = globalThis.window;
    globalThis.window = { TavernHelper: { generate: async () => { calls++; throw Object.assign(new Error('rate limited'), { status: 429 }); } } };
    try {
      await assert.rejects(quiet(() => aiService.generate({ user_input: 'hi', background: true })), err => /请求过于频繁（429）.*已自动重试 1 次仍失败/.test(err.message));
    } finally {
      if (hadWindow) globalThis.window = previousWindow; else delete globalThis.window;
      aiService.saveConfig({ mode: 'custom' });
    }
    assert.equal(calls, 2);
  });
});
