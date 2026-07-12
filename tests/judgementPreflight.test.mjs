import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

test('preflight only proposes cards for explicit risky actions', async () => {
  const { buildLocalJudgementPreflight, composeJudgementAction } = await loadTs('../src/utils/judgementPreflight.ts');
  const save = { 角色: { 身份: { 先天六司: { 气运: 9, 灵性: 7, 心性: 4 }, 后天六司: {} }, 位置: { 灵气浓度: 60 } } };
  assert.equal(buildLocalJudgementPreflight('我先和店家闲聊几句', save, 1), null);
  const proposal = buildLocalJudgementPreflight('我潜入守卫森严的府邸', save, 1);
  assert.equal(proposal.kind, 'stealth');
  assert.equal(proposal.status, 'pending');
  assert.ok(proposal.factors.some(factor => factor.label === '六司' && factor.value === 7));
  const queuedAction = composeJudgementAction('继续当前安排', '【操作】双修调息疗伤');
  assert.equal(buildLocalJudgementPreflight(queuedAction, save, 1).kind, 'cultivate');
});

test('active Canon Rail events use process-only policy while explicit rewrites require IF', async () => {
  const { buildLocalJudgementPreflight } = await loadTs('../src/utils/judgementPreflight.ts');
  const save = { 世界: { 状态: { 剧本模组: { modId: 'lcq.stage_01', activeEventIds: ['lcq.event.s01_04'] } } } };
  assert.equal(buildLocalJudgementPreflight('我潜入守卫森严的府邸', save, 1).canonPolicy, 'route_process_only');
  assert.equal(buildLocalJudgementPreflight('我收服卓云君并纳入后宫', save, 1).canonPolicy, 'if_only');
  assert.equal(buildLocalJudgementPreflight('我打算与卓云君结盟', save, 1).canonPolicy, 'if_only');
});
