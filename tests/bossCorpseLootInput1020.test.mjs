// 2026-10-20 用户定：boss 不做死亡掉落；打倒 boss 后自由输入搜尸身或搜周围，都走场景搜刮池。
import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './loadTs.mjs';
const loot=await loadTs('../src/modules/scenarioMods/locationLoot.ts');
test('「搜 boss 尸身／搜周围」识别成搜刮；原有说法不变；闲聊不误判', () => {
  for (const t of ['搜刮','我要搜刮这里','搜鬼王的尸身','搜一搜铜龙王的尸体','我去搜周围','翻找四周','搜查一下战场','上前搜尸首。','搜他身上'])
    assert.equal(loot.isLocationLootInput(t), true, t);
  for (const t of ['搜魂术是什么','我想去鬼王峒','看看周围','问凝羽周围有没有人','搜'])
    assert.equal(loot.isLocationLootInput(t), false, t);
});
