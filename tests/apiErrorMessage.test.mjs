import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/services/apiErrorMessage.ts');

test('classifies invalid keys with an actionable API-management message', async () => {
  const { toUserFacingAIError } = await modPromise;
  const error = toUserFacingAIError({ response: { status: 401, data: { error: { message: 'invalid api key' } } } });
  assert.match(error.message, /密钥无效或已过期/);
  assert.match(error.message, /测试连接/);
});

test('distinguishes exhausted quota from ordinary rate limiting', async () => {
  const { toUserFacingAIError } = await modPromise;
  assert.match(toUserFacingAIError({ response: { status: 429, data: { error: { message: 'insufficient_quota' } } } }).message, /额度或账户余额不足/);
  assert.match(toUserFacingAIError({ response: { status: 429, data: { error: { message: 'rate limit exceeded' } } } }).message, /请求过于频繁/);
});

test('preserves useful unknown provider errors', async () => {
  const { toUserFacingAIError } = await modPromise;
  assert.equal(toUserFacingAIError(new Error('模型名称不存在')).message, '模型名称不存在');
});
