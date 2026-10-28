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

test('422 审核提示不泄露原文，cause 保留诊断信息且可穿透分类', async () => {
  const { toUserFacingAIError, isContentModerationError, contentModerationDetail } = await modPromise;
  for (const marker of ['sensitive', '1026', '1027', 'moderation', 'content filter', '敏感']) {
    const original = Object.assign(new Error(`API错误 422: {"message":"${marker}","request_id":"req-fixture"}`), { status: 422 });
    const error = toUserFacingAIError(original);
    assert.match(error.message, /LCQ-NET-012/);
    assert.doesNotMatch(error.message, /request_id|req-fixture|API错误 422|[{}]/);
    assert.equal(error.cause, original);
    assert.equal(isContentModerationError(error), true);
    assert.equal(contentModerationDetail(error).requestId, 'req-fixture');
  }
  assert.equal(isContentModerationError({status:400, message:'sensitive'}),false);
  assert.equal(isContentModerationError(Object.assign(new Error('invalid input'),{status:422})),false);
  const cycle=new Error('unrelated'); cycle.cause=cycle;
  assert.equal(isContentModerationError(cycle),false);
  assert.match(toUserFacingAIError({response:{status:422,data:{error:{message:'new_sensitive(1026)'}}}}).message,/内容审核/);
});
