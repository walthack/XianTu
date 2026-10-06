import test from 'node:test';
import assert from 'node:assert/strict';
import { auditLocationLoot, loadLootInputs, LOOT_STAGE_COVERAGE } from '../scripts/validate-location-loot.mjs';
import { loadTs } from './loadTs.mjs';
const { settleLocationLoot } = await loadTs('../src/modules/scenarioMods/locationLoot.ts');
const { canonicalLocationId } = await loadTs('../src/modules/scenarioMods/travel/locationIds.ts');
const inputs = loadLootInputs();
test('approved 15 locations / 115 entries / 60 item identities validate in all covered stage catalogs', () => {
 const result = auditLocationLoot(inputs);assert.deepEqual(result.errors,[]);assert.equal(result.ready,15);assert.equal(result.entries,115);
 const items = new Map(inputs.stages.flatMap(s=>s.content.items.filter(i=>i.id.startsWith('lcq.item.nh_')).map(i=>[i.id,i])));
 assert.equal(items.size,60);
 for(const item of items.values()) assert.deepEqual(Object.keys(item).sort(),['description','grade','id','name','type']);
 assert.equal(inputs.stages.find(s=>s.manifest.id==='lcq.stage_04').content.items.filter(i=>i.id.startsWith('lcq.item.nh_')).length,23);
 assert.equal(JSON.stringify(inputs.table).includes('"_'),false);
});
test('validator rejects unregistered items, unknown events, metadata, aliases, invalid probabilities and duplicate entries', () => {
 for(const mutate of [
  i=>i.stages.find(s=>s.manifest.id==='lcq.stage_04').content.items.splice(6),
  i=>i.table.locations['lcq.location.sheyi_village'].entries[0].afterEventIds=['unknown'],
  i=>i.table.locations['lcq.location.sheyi_village'].entries[0]._find='private',
  i=>i.table.locations['lcq.location.sheyi_village'].entries.push(structuredClone(i.table.locations['lcq.location.sheyi_village'].entries[0])),
  i=>i.table.rules.rareChance=3,
  i=>i.table.locations['lcq.location.sheyi_village'].entries[0].quantity=[0,1],
  i=>i.table.locations['liuchao.location.gui_wang_dong'].status='empty',
  i=>i.table.locations['liuchao.location.guiwang_dong']=i.table.locations['liuchao.location.gui_wang_dong'],
 ]) {const i=structuredClone(inputs);mutate(i);assert.ok(auditLocationLoot(i).errors.length);}
});
test('every configured drop really settles using each target stage catalog and canonical location', () => {
 for(const [id, stages] of Object.entries(LOOT_STAGE_COVERAGE)) {
  const loc=inputs.table.locations[id];
  for(const stageId of stages) {
   const stage=inputs.stages.find(s=>s.manifest.id===stageId);
   const location=stage.canon.locations.find(l=>canonicalLocationId(l.id)===id);
   assert.ok(location,`${stageId}/${id}`);
   for(const entry of loc.entries) {
    const save={元数据:{创建时间:'batch7'},角色:{身份:{名字:'程宗扬'},位置:{描述:`南荒·${location.name}`},背包:{物品:{},货币:{}}},世界:{状态:{剧本模组:{modId:stageId,worldTurn:1,completedEventIds:[],travelLedger:{doneEventIds:entry.afterEventIds||[]},canon:{locations:stage.canon.locations,items:stage.content.items}}}}};
    const table=structuredClone(inputs.table);table.locations[id].entries=[entry];table.rules={...table.rules,commonSlots:[1,0],rareChance:1,largeCurrencyChance:1};
    const result=settleLocationLoot(save,table);
    assert.equal(result.receipt?.locationId,id,`${stageId}/${entry.id}: position`);
    assert.equal(result.receipt.drops.length,1,`${stageId}/${entry.id}: missing drop`);
    const drop=result.receipt.drops[0];assert.equal(drop.entryId,entry.id);
    if(entry.itemId)assert.equal(save.角色.背包.物品[entry.itemId].数量,drop.quantity);
    else assert.equal(save.角色.背包.货币[entry.currency].数量,drop.quantity);
   }
  }
 }
});

test('chapter-74 battle remnants do not drop before the sea temple battle is complete', () => {
 const pool=inputs.table.locations['liuchao.location.sea_temple'].entries;
 for(const id of ['temple.bronze','temple.snake_horn','temple.scale_pouch']) assert.deepEqual(pool.find(e=>e.id===id).afterEventIds,['lcq.event.haishen_hall_merfolk']);
});
