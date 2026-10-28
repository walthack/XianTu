// fix5939-2 B：事件已开打（合同已有准备拍落账），「去X」跟着下一个可做动作的场景走。
// s03b_yinzhu_xiongerpu 挂花苗寨，第 3 个动作 pick_zhu88_as_guide 在「熊耳铺村口」。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const { questCompassPhrases } = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
const stage = JSON.parse(fs.readFileSync('src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json', 'utf8'));
const EVENT_ID = 'lcq.event.s03b_yinzhu_xiongerpu';
const event = stage.scenario.events.find(e => e.id === EVENT_ID);
const XIONGERPU = 'liuchao.location.xiongerpu', HUAMIAO = 'lcq.location.huamiao_village';
const rtWith = preparations => ({ canon: stage.canon, ...(preparations ? { eventActionStates: { [EVENT_ID]: { preparations } } } : {}) });
const says = (preparations, at) => questCompassPhrases(event, rtWith(preparations), at);

test('数据前提：事件挂花苗寨，正典里有熊耳铺', () => {
  assert.equal(event.locationId, HUAMIAO);
  assert.ok(stage.canon.locations.some(l => l.id === XIONGERPU && l.name === '熊耳铺'));
});

test('还没开打（无 eventActionStates）：仍指花苗寨（旧行为）', () => {
  assert.ok(says(undefined, XIONGERPU).includes('去花苗寨'));
  assert.ok(says([], XIONGERPU).includes('去花苗寨'));
});

test('前两拍已落账：人在熊耳铺不出「去」；人在花苗寨出「去熊耳铺」', () => {
  const both = ['yinzhu_struck', 'ajia_mourned'];
  assert.ok(!says(both, XIONGERPU).some(p => p.startsWith('去')), says(both, XIONGERPU).join(' · '));
  assert.ok(says(both, HUAMIAO).includes('去熊耳铺'));
});

test('只落第一拍：下一动作场景「花苗林中营地」认不出 → 仍用事件地点花苗寨', () => {
  assert.ok(says(['yinzhu_struck'], XIONGERPU).includes('去花苗寨'));
  assert.ok(!says(['yinzhu_struck'], HUAMIAO).some(p => p.startsWith('去')));
});
