import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';
const { fixedEndingNarrative, endingBridge, BATTLE_LOSS_ENDINGS } = await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
test('E07 F13 loss does not require jumping into a well; escape bridge matches revised outcome', () => {
  const e = BATTLE_LOSS_ENDINGS.find(e => e.endingId === 'lcq.ending.death.dragon_well');
  assert.equal(e.tierFlag, 'lcq.encounter.f13.tier');
  assert.equal(e.tier, 'lose');
  assert.equal(e.sourceEventId, 'lcq.event.ghost_king_swallowed');
  assert.doesNotMatch(JSON.stringify(e), /跳井/);
  assert.equal(endingBridge('', e.endingId), '你抓起乐明珠的手，转身往洞窟深处的裂缝跑去。');
  const text = fixedEndingNarrative(e);
  assert.ok(text.startsWith('井口守不住了。'));
  assert.match(text, /一起滚下了碎石坡/);
  assert.match(text, /每年雨季，她都独自走到鬼王峒塌掉的山口/);
  assert.doesNotMatch(text, /托着你们的那股气流|砸进井底|深井裂成两半/);
});
