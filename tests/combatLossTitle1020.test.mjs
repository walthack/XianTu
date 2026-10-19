import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './loadTs.mjs';
const ctl=await loadTs('../src/modules/sceneModule/host/controller.ts');
test('fee4 F04：通用战败结局有可辨认的标题', () => {
  assert.equal(ctl.combatLossTitle({objective:{text:'击倒鸦人'}}),'战败 · 未能击倒鸦人');
  assert.equal(ctl.combatLossTitle({}),'游戏结束');
});
