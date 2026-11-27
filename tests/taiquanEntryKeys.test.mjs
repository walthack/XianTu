// 支线钥匙样板 H8（用户 2026-11-28 02:44 定先做太泉入阵；总策划 06:44 代定熊谷钥匙先挂救萧后宋线最近一拍）：
// 钥匙在「入钱塘门，风波亭」停车一步发放；抵达苍澜镇按「钥匙在包里／萧遥逸在队」出三条变体，都没有走原文。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const view = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
const builtin = id => JSON.parse(fs.readFileSync(`src/modules/scenarioMods/builtins/data/${id}.json`, 'utf8'));
const KEY = 'lyl.item.np025';
const S12 = 'lcq.stage_12_jiangzhou_counterwar', RESCUE = 'lcq.event.s12_10_rescue_xiao';

test('熊谷钥匙：风波亭停车一步成功时发一把，物品在本关物品表里', () => {
  const mod = builtin('lyl.lin_an_bridge');
  const action = mod.scenario.events.find(e => e.id === 'lyl.event.linan_arrive_fengbo').playerCompletionContract.actions.find(a => a.id === 'stop_at_fengbo_pavilion');
  assert.deepEqual(action.outcomeEffects, { success: { inventoryTransfers: [{ transferId: 'lyl.event.linan_arrive_fengbo.inventory.yue_key', itemId: KEY, quantity: 1 }] } });
  assert.ok(mod.content.items.some(item => item.id === KEY));
});

test('抵达苍澜镇：四种组合各走各的由头', () => {
  const event = builtin('lyl.taiquan_sacred_fruit').scenario.events.find(e => e.id === 'lyl.event.taiquan_sacred_fruit_07');
  const describe = ({ xiao, key }) => {
    const runtime = { modId: 'lyl.taiquan_sacred_fruit', events: [], completedEventIds: [], flags: {}, chronicle: xiao ? [{ id: `chronicle.${S12}.${RESCUE}`, type: 'event', stageId: S12, title: '', sequence: 1 }] : [] };
    const save = { 角色: { 背包: { 物品: key ? { [KEY]: { 数量: 1 } } : {} } }, 世界: { 状态: { 剧本模组: runtime } } };
    return view.resolveScenarioEventNarrative(event, runtime.flags, undefined, runtime, save).description;
  };
  assert.equal(describe({ xiao: false, key: false }), event.description);
  assert.match(describe({ xiao: true, key: true }), /为他取赤阳圣果治伤；身上带着岳鹏举留下的钥匙/);
  assert.match(describe({ xiao: false, key: true }), /循着它去找太泉熊谷/);
  assert.doesNotMatch(describe({ xiao: false, key: true }), /萧遥逸/);
  assert.match(describe({ xiao: true, key: false }), /没有进古阵的路径/);
  assert.doesNotMatch(describe({ xiao: true, key: false }), /钥匙/);
});
