import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

test('preflight only proposes cards for explicit risky actions', async () => {
  const { buildLocalJudgementPreflight } = await loadTs('../src/utils/judgementPreflight.ts');
  const save = { 角色: { 属性: { 先天六司: { 气运: 5 }, 后天六司: {} }, 位置: { 灵气浓度: 60 } } };
  assert.equal(buildLocalJudgementPreflight('我先和店家闲聊几句', save, 1), null);
  const proposal = buildLocalJudgementPreflight('我潜入守卫森严的府邸', save, 1);
  assert.equal(proposal.kind, 'stealth');
  assert.equal(proposal.status, 'pending');
});
