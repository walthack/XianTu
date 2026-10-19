// 2026-10-20 boss 场景专属搜刮（定稿 narrative-drafts/2026-10-20-南荒boss场景专属搜刮道具.md）：
// 只在 boss 倒下后、各只一次；龙身材料按份数；几率进配置（rules.bossChance / 条目 chance）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { load } from './freeActionFixture.mjs';
import { loadLootInputs, auditLocationLoot } from '../scripts/validate-location-loot.mjs';

const loot = await load('../src/modules/scenarioMods/locationLoot.ts');
const { canonicalLocationId } = await load('../src/modules/scenarioMods/travel/locationIds.ts');
const J = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const table = J('../mod-kit/location-loot.qingyu.json');
const items = new Map(J('../mod-kit/entity-catalog/items.json').entries.map(e => [e.id, e.definition]));
const inputs = loadLootInputs();
const DRAGON = ['lcq.item.nh_dragon_scale', 'lcq.item.nh_dragon_bone', 'lcq.item.nh_dragon_horn', 'lcq.item.nh_dragon_fang', 'lcq.item.nh_dragon_sinew', 'lcq.item.nh_dragon_blood'];

function mk(locId, stageId, done, who = 'a') {
  const stage = inputs.stages.find(s => s.manifest.id === stageId);
  const location = stage.canon.locations.find(l => canonicalLocationId(l.id) === locId);
  return { 元数据: { 创建时间: who }, 角色: { 身份: { 名字: who }, 位置: { 描述: `南荒·${location.name}` }, 背包: { 物品: {}, 货币: {} } },
    世界: { 状态: { 剧本模组: { modId: stageId, worldTurn: 1, completedEventIds: done, canon: { locations: stage.canon.locations, items: stage.content.items } } } } };
}
const searchAll = save => { const out = []; for (let i = 0; i < table.rules.maxSearches; i++) { save.世界.状态.剧本模组.worldTurn = i + 1; const r = loot.settleLocationLoot(save); if (r.receipt) out.push(...r.receipt.drops); } return out; };

test('配置与校验：boss 条目都是 once 且挂 boss 倒下事件；校验器零错误', () => {
  assert.deepEqual(auditLocationLoot(inputs).errors, []);
  assert.ok(table.rules.bossChance > table.rules.rareChance, 'boss 场景几率高于普通稀有槽');
  const boss = Object.values(table.locations).flatMap(l => l.entries.filter(e => e.category === 'boss'));
  assert.ok(boss.length >= 17);
  for (const e of boss) assert.ok(e.once && e.afterEventIds.length, e.id);
});

test('定稿品级：龙身材料/龙血/龙涎/龙睛玉碎料/毒蝇伞/红珊瑚/珊瑚铁＝珍品；巫师杂物/海藻丝/白珊瑚＝凡品；霓龙丝（真）珍品剧情道具', () => {
  for (const id of [...DRAGON, 'lcq.item.nh_dragon_saliva', 'lcq.item.nh_dragon_eye_jade_shard', 'lcq.item.nh_fly_agaric', 'lcq.item.nh_red_coral', 'lcq.item.nh_coral_iron_ore']) assert.equal(items.get(id).grade, '珍品', id);
  for (const id of ['lcq.item.nh_witch_trinkets', 'lcq.item.nilong_fake', 'lcq.item.nh_white_coral']) assert.equal(items.get(id).grade, '凡品', id);
  assert.equal(items.get('lcq.item.nilong_fake').name, '海藻丝', '第80章前叫海藻丝');
  const np012 = items.get('lcq.item.np012');
  assert.deepEqual([np012.grade, np012.storyItem], ['珍品', true]);
  const pooled = new Set(Object.values(table.locations).flatMap(l => l.entries.map(e => e.itemId)));
  for (const id of ['lcq.item.np012', 'lcq.item.np011', 'lcq.item.biling_algae_sample']) assert.ok(!pooled.has(id), `${id} 不进搜刮池`);
});

test('龙神未死：鬼王峒搜不到龙身材料', () => {
  const drops = searchAll(mk('liuchao.location.gui_wang_dong', 'lcq.stage_05b', []));
  assert.ok(!drops.some(d => DRAGON.includes(d.itemId)));
});

test('龙神倒下后：龙身材料按份数入账，各只一次', () => {
  let any = false;
  for (const who of ['a', 'b', 'c', 'd', 'e']) {
    const save = mk('liuchao.location.gui_wang_dong', 'lcq.stage_05b', ['lcq.event.slay_dragon'], who);
    const drops = searchAll(save).filter(d => DRAGON.includes(d.itemId));
    const ids = drops.map(d => d.itemId);
    assert.equal(new Set(ids).size, ids.length, '只一次');
    for (const d of drops) {
      const e = table.locations['liuchao.location.gui_wang_dong'].entries.find(x => x.itemId === d.itemId);
      assert.ok(d.quantity >= e.quantity[0] && d.quantity <= e.quantity[1], d.itemId);
    }
    any ||= drops.length > 0;
  }
  assert.ok(any, '高几率下五个存档至少有一次掉落');
});
