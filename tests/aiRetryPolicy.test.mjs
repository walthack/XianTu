import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const policy = await loadTs('../src/services/aiRetryPolicy.ts');
const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const { OutputTruncationError } = await loadTs('../src/services/aiResponseTermination.ts');
const { AiRequestTimeoutError } = await loadTs('../src/services/aiRequestDeadline.ts');
const { QingyuTurnLongRequestBudgetError } = await loadTs('../src/services/qingyuTurnLongRequests.ts');

const cfg = (patch = {}) => ({ ...policy.aiRetryConfig(), jitter: 0, ...patch });

// ───────────── 配置 ─────────────

test('aiRetry 段在 game-numbers 里，字段齐全，默认值过体检；超时默认不重试', () => {
  const json = JSON.parse(readFileSync(new URL('../mod-kit/game-numbers.qingyu.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(json.aiRetry).sort(), ['baseDelayMs', 'factor', 'jitter', 'maxDelayMs', 'maxRetries', 'retryAfterMaxMs', 'retryOnTimeout', 'retryStatuses']);
  assert.equal(json.aiRetry.retryOnTimeout, false);
  assert.deepEqual(policy.validateAiRetryConfig(), []);
  assert.deepEqual(policy.aiRetryConfig(), json.aiRetry);
});

test('体检拒绝坏值，热改走 applyGameNumbers 整份退回（LCQ-NUM-006）', () => {
  const bad = [
    [{ maxRetries: 6 }, /maxRetries/], [{ maxRetries: 1.5 }, /maxRetries/],
    [{ retryStatuses: [200] }, /retryStatuses/], [{ retryStatuses: ['429'] }, /retryStatuses/],
    [{ baseDelayMs: 0 }, /baseDelayMs/], [{ maxDelayMs: 10 }, /maxDelayMs/],
    [{ factor: 0.5 }, /factor/], [{ factor: 11 }, /factor/],
    [{ jitter: 1.5 }, /jitter/], [{ jitter: -0.1 }, /jitter/],
    [{ retryOnTimeout: 'yes' }, /retryOnTimeout/], [{ retryAfterMaxMs: -1 }, /retryAfterMaxMs/],
  ];
  for (const [patch, pattern] of bad) {
    const problems = policy.validateAiRetryConfig({ ...policy.aiRetryConfig(), ...patch });
    assert.ok(problems.some(p => pattern.test(p)), `${JSON.stringify(patch)} 应被体检拒绝：${problems}`);
  }
  const before = structuredClone(policy.aiRetryConfig());
  assert.throws(() => numbers.applyGameNumbers({ aiRetry: { jitter: 2 } }), err => err.code === 'LCQ-NUM-006' && /jitter/.test(err.message));
  assert.throws(() => numbers.applyGameNumbers({ aiRetry: { retryOnTimeout: 1 } }), err => err.code === 'LCQ-NUM-003', '布尔字段写成数字直接拒');
  assert.throws(() => numbers.applyGameNumbers({ aiRetry: { noSuchKey: 1 } }), err => err.code === 'LCQ-NUM-002');
  assert.deepEqual(policy.aiRetryConfig(), before, '被拒后原值仍在');
});

// ───────────── 指数退避 + 抖动 ─────────────

test('退避：base×factor^n 指数增长，封顶 maxDelayMs', () => {
  const c = cfg({ baseDelayMs: 1000, factor: 2, maxDelayMs: 5000 });
  assert.deepEqual([0, 1, 2, 3, 4, 10].map(n => policy.computeBackoffDelayMs(n, c, () => 0.5)), [1000, 2000, 4000, 5000, 5000, 5000]);
  assert.equal(policy.computeBackoffDelayMs(1, cfg({ baseDelayMs: 100, factor: 3, maxDelayMs: 99999 }), () => 0.5), 300);
});

test('抖动：随机数 0/0.5/1 对应 ×(1-j)/×1/×(1+j)，且任何情况下不超过 maxDelayMs', () => {
  const c = cfg({ baseDelayMs: 1000, factor: 2, maxDelayMs: 10000, jitter: 0.25 });
  assert.equal(policy.computeBackoffDelayMs(1, c, () => 0), 1500);
  assert.equal(policy.computeBackoffDelayMs(1, c, () => 0.5), 2000);
  assert.equal(policy.computeBackoffDelayMs(1, c, () => 1), 2500);
  const capped = cfg({ baseDelayMs: 1000, factor: 2, maxDelayMs: 4000, jitter: 0.5 });
  for (const r of [0, 0.3, 0.7, 1]) for (let n = 0; n < 8; n++) {
    const d = policy.computeBackoffDelayMs(n, capped, () => r);
    assert.ok(d >= 0 && d <= 4000, `n=${n} r=${r} d=${d}`);
  }
  assert.equal(policy.computeBackoffDelayMs(5, capped, () => 1), 4000, '封顶后再抖也不越过上限');
  assert.equal(policy.computeBackoffDelayMs(-3, c, () => 0.5), 1000, '负数次数按首次算');
});

test('用真随机数时落在 [(1-j)×raw, min(max,(1+j)×raw)] 内', () => {
  const c = cfg({ baseDelayMs: 1000, factor: 2, maxDelayMs: 8000, jitter: 0.25 });
  for (let i = 0; i < 200; i++) {
    const d = policy.computeBackoffDelayMs(1, c);
    assert.ok(d >= 1500 && d <= 2500, String(d));
  }
});

// ───────────── Retry-After ─────────────

test('Retry-After：秒数', () => {
  assert.equal(policy.parseRetryAfterMs('3'), 3000);
  assert.equal(policy.parseRetryAfterMs(' 120 '), 120000);
  assert.equal(policy.parseRetryAfterMs('0'), 0);
  assert.equal(policy.parseRetryAfterMs('1.5'), 1500);
  assert.equal(policy.parseRetryAfterMs(2), 2000);
});

test('Retry-After：HTTP 日期（相对 now 的差；已过期为 0）', () => {
  const now = Date.parse('Wed, 21 Oct 2026 07:27:00 GMT');
  assert.equal(policy.parseRetryAfterMs('Wed, 21 Oct 2026 07:28:00 GMT', now), 60000);
  assert.equal(policy.parseRetryAfterMs('Wed, 21 Oct 2026 07:20:00 GMT', now), 0);
});

test('Retry-After：识别不了的返回 undefined，不抛', () => {
  for (const bad of [undefined, null, '', '   ', 'soon', '-5', '1e3', {}, NaN, -1, '12abc']) assert.equal(policy.parseRetryAfterMs(bad), undefined, String(bad));
});

test('读响应头：Headers / 普通对象（大小写不敏感）/ 没有', () => {
  assert.equal(policy.readRetryAfterHeader(new Headers({ 'Retry-After': '7' })), '7');
  assert.equal(policy.readRetryAfterHeader({ 'retry-after': '8' }), '8');
  assert.equal(policy.readRetryAfterHeader({ 'Retry-After': '9' }), '9');
  assert.equal(policy.readRetryAfterHeader({ 'content-type': 'x' }), undefined);
  assert.equal(policy.readRetryAfterHeader(undefined), undefined);
});

test('AiHttpError：保留 message 格式，带 status 与解析好的 retryAfterMs', () => {
  const e = new policy.AiHttpError('API错误 429: {"e":1}', { status: 429, retryAfter: '4' });
  assert.equal(e.message, 'API错误 429: {"e":1}');
  assert.equal(e.status, 429);
  assert.equal(e.retryAfterMs, 4000);
  assert.ok(e instanceof Error);
});

// ───────────── 可重试判断 ─────────────

test('可重试 HTTP 状态集合来自配置：集合内重试，其余（含 400/401/403/404/422）不重试', () => {
  const c = cfg();
  for (const status of [408, 409, 425, 429, 500, 502, 503, 504]) {
    assert.deepEqual(policy.classifyAiError(new policy.AiHttpError('x', { status }), c), { retry: true, reason: 'status', status });
  }
  for (const status of [400, 401, 402, 403, 404, 413, 422]) {
    const v = policy.classifyAiError(new policy.AiHttpError('x', { status }), c);
    assert.equal(v.retry, false, String(status));
    assert.equal(v.reason, 'status_not_retryable');
  }
  assert.equal(policy.classifyAiError({ status: 599 }, cfg({ retryStatuses: [599] })).retry, true, '集合改了判断就跟着改');
  assert.equal(policy.classifyAiError({ status: 429 }, cfg({ retryStatuses: [] })).retry, false);
});

test('状态码的几种来源：status / response.status / cause.status / 仅 message', () => {
  const c = cfg();
  assert.equal(policy.classifyAiError({ response: { status: 503 } }, c).retry, true);
  assert.equal(policy.classifyAiError({ cause: { response: { status: 404 } } }, c).retry, false);
  assert.equal(policy.classifyAiError(new Error('API错误 502: bad gateway'), c).retry, true);
  assert.equal(policy.classifyAiError(new Error('Claude API错误 400: bad'), c).retry, false);
  assert.equal(policy.classifyAiError(new Error('Service Unavailable'), c).retry, true);
  assert.equal(policy.classifyAiError(new Error('API上下文长度不足：输入过长（估算输入≈500 tokens）'), c).retry, false, '正文里碰巧有 500 不算状态码');
});

test('网络错误重试；未知错误（配置缺失等）不重试', () => {
  const c = cfg();
  assert.equal(policy.classifyAiError(new policy.AiHttpError('网络错误：无法连接到API服务器', { kind: 'network' }), c).reason, 'network');
  for (const msg of ['Network Error', 'network blip', 'TypeError: fetch failed', 'Failed to fetch', 'Load failed', 'read ECONNRESET', 'terminated']) {
    assert.deepEqual(policy.classifyAiError(new Error(msg), c), { retry: true, reason: 'network' }, msg);
  }
  for (const msg of ['自定义API未配置', '请先配置API地址和密钥', '模型名称不存在']) {
    assert.deepEqual(policy.classifyAiError(new Error(msg), c), { retry: false, reason: 'unknown' }, msg);
  }
});

test('超时：retryOnTimeout=false 不重试，true 才重试（AiRequestTimeoutError 与带 timeout 字样的错误都受它管）', () => {
  const timeouts = [new AiRequestTimeoutError('first_byte', 30000), new AiRequestTimeoutError('total', 120000), new AiRequestTimeoutError('idle', 20000), new Error('timeout of 60000ms exceeded')];
  for (const err of timeouts) {
    assert.deepEqual(policy.classifyAiError(err, cfg({ retryOnTimeout: false })), { retry: false, reason: 'timeout' }, err.message);
    assert.deepEqual(policy.classifyAiError(err, cfg({ retryOnTimeout: true })), { retry: true, reason: 'timeout' }, err.message);
  }
});

test('取消、输出截断、回合预算用尽：任何配置下都不重试', () => {
  const c = cfg({ retryOnTimeout: true });
  assert.equal(policy.classifyAiError(new Error('请求已被取消'), c).reason, 'cancelled');
  assert.equal(policy.classifyAiError(new Error('请求已取消'), c).reason, 'cancelled');
  assert.equal(policy.classifyAiError(new DOMException('x', 'AbortError'), c).reason, 'cancelled');
  assert.equal(policy.classifyAiError(new OutputTruncationError({ finishReason: 'length' }), c).reason, 'truncated');
  assert.equal(policy.classifyAiError(new QingyuTurnLongRequestBudgetError(), c).reason, 'turn_budget');
  assert.equal(policy.classifyAiError(Object.assign(new policy.AiHttpError('x', { status: 429 }), { retriesSpent: true }), c).retry, false, '内层已重试过的错误外层不再重试');
});

// ───────────── 计划：次数、Retry-After、回合剩余时间 ─────────────

test('planAiRetry：次数用完不重试；maxRetries=0 一次都不重试', () => {
  const c = cfg({ baseDelayMs: 100, maxDelayMs: 1000 });
  const err = new policy.AiHttpError('x', { status: 503 });
  assert.equal(policy.planAiRetry({ error: err, attempt: 0, maxRetries: 2, cfg: c }).retry, true);
  assert.equal(policy.planAiRetry({ error: err, attempt: 1, maxRetries: 2, cfg: c }).retry, true);
  const spent = policy.planAiRetry({ error: err, attempt: 2, maxRetries: 2, cfg: c });
  assert.equal(spent.retry, false);
  assert.equal(spent.reason, 'retries_exhausted');
  assert.equal(policy.planAiRetry({ error: err, attempt: 0, maxRetries: 0, cfg: c }).reason, 'retries_exhausted');
});

test('planAiRetry：延迟随重试次数指数增长', () => {
  const c = cfg({ baseDelayMs: 100, factor: 2, maxDelayMs: 10000 });
  const err = new policy.AiHttpError('x', { status: 500 });
  const delays = [0, 1, 2, 3].map(attempt => policy.planAiRetry({ error: err, attempt, maxRetries: 5, cfg: c, random: () => 0.5 }).delayMs);
  assert.deepEqual(delays, [100, 200, 400, 800]);
});

test('planAiRetry：Retry-After 比退避长就听服务端的，比退避短仍按退避；超过上限按上限截断', () => {
  const c = cfg({ baseDelayMs: 1000, maxDelayMs: 8000, retryAfterMaxMs: 20000 });
  const plan = (retryAfter, patch = {}) => policy.planAiRetry({ error: new policy.AiHttpError('x', { status: 429, retryAfter }), attempt: 0, maxRetries: 3, cfg: { ...c, ...patch }, random: () => 0.5 });
  assert.deepEqual([plan('15').delayMs, plan('15').source], [15000, 'retry-after']);
  assert.deepEqual([plan('0').delayMs, plan('0').source], [1000, 'backoff']);
  assert.deepEqual([plan('0.2').delayMs, plan('0.2').source], [1000, 'backoff']);
  assert.deepEqual([plan('600').delayMs, plan('600').source], [20000, 'retry-after'], '600 秒按 retryAfterMaxMs 截断');
  assert.equal(plan('600', { retryAfterMaxMs: 0 }).delayMs, 1000, 'retryAfterMaxMs=0 即不采信');
  assert.equal(plan('abc').delayMs, 1000, '格式不对退回退避');
});

test('planAiRetry：酒馆/axios 形态的错误从 response.headers 读 Retry-After', () => {
  const c = cfg({ baseDelayMs: 100, maxDelayMs: 1000, retryAfterMaxMs: 5000 });
  const err = Object.assign(new Error('x'), { response: { status: 429, headers: { 'Retry-After': '2' } } });
  assert.equal(policy.planAiRetry({ error: err, attempt: 0, maxRetries: 1, cfg: c }).delayMs, 2000);
});

test('planAiRetry：本回合剩余时间不够等就不重试（turn_time_short）；不限时（null）照常', () => {
  const c = cfg({ baseDelayMs: 1000, maxDelayMs: 8000 });
  const err = new policy.AiHttpError('x', { status: 503 });
  const at = remainingMs => policy.planAiRetry({ error: err, attempt: 0, maxRetries: 2, cfg: c, random: () => 0.5, remainingMs });
  assert.equal(at(null).retry, true);
  assert.equal(at(undefined).retry, true);
  assert.equal(at(5000).retry, true);
  const short = at(1000);
  assert.equal(short.retry, false);
  assert.equal(short.reason, 'turn_time_short');
  assert.equal(at(0).reason, 'turn_time_short');
});

test('planAiRetry：不可重试的错误给出原因，不看次数', () => {
  const plan = policy.planAiRetry({ error: new policy.AiHttpError('x', { status: 401 }), attempt: 0, maxRetries: 5, cfg: cfg() });
  assert.deepEqual([plan.retry, plan.reason], [false, 'status_not_retryable']);
});

// ───────────── 可取消的等待 ─────────────

test('abortableDelay：到点 resolve', async () => {
  const t = Date.now();
  await policy.abortableDelay(40);
  assert.ok(Date.now() - t >= 30);
});

test('abortableDelay：等待中被取消立即 reject（不用等满），事先已取消也一样', async () => {
  const controller = new AbortController();
  const t = Date.now();
  const waiting = policy.abortableDelay(10000, controller.signal);
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(waiting, /请求已被取消/);
  assert.ok(Date.now() - t < 1000, '没等满 10 秒');
  await assert.rejects(policy.abortableDelay(10000, controller.signal), /请求已被取消/);
});
