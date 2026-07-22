import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

test('P0 judgement rules preserve legacy luck and environment calculation', async () => {
  const { calculateTurnJudgementData } = await loadTs('../src/utils/judgementRules.ts');
  const rolls = [0, 0];
  const data = calculateTurnJudgementData(
    { 气运: 5 },
    { 气运: 2 },
    { 灵气浓度: 80 },
    () => rolls.shift() ?? 0,
  );

  assert.deepEqual(data, {
    幸运点: -6,
    气运值: 7,
    环境: { 灵气浓度: 80, 修炼修正: 3, 炼制修正: 2, 战斗修正: 2 },
  });
});

test('P0 retains the legacy zero-value fallback until the visible engine replaces it', async () => {
  const { calculateTurnJudgementData } = await loadTs('../src/utils/judgementRules.ts');
  const data = calculateTurnJudgementData({ 气运: 0 }, {}, { 灵气浓度: 0 }, () => 0);

  assert.equal(data.气运值, 5);
  assert.equal(data.环境.灵气浓度, 50);
});

test('model-authored legacy rolls are removed before UI, memory, or damage reconciliation', async () => {
  const { extractLegacyJudgementMarkers, stripLegacyJudgementMarkers } = await loadTs('../src/utils/judgementRules.ts');
  const text = '刀光逼近。〔战斗:失败,判定值:8,难度:20〕你肩头见血。\n\n局势仍未结束。';
  assert.deepEqual(extractLegacyJudgementMarkers(text), ['战斗:失败,判定值:8,难度:20']);
  assert.equal(stripLegacyJudgementMarkers(text), '刀光逼近。你肩头见血。\n\n局势仍未结束。');
  assert.equal(stripLegacyJudgementMarkers('〖潜行:失败,骰点:3,总值:11〗门仍紧闭。'), '门仍紧闭。');
});
