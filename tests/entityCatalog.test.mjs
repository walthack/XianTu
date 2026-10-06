import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadTs} from './loadTs.mjs';
const cat=await loadTs('../src/modules/scenarioMods/entityCatalog.ts');
const {buildStrictScenarioInitialization}=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const {validateScenarioMod}=await loadTs('../src/modules/scenarioMods/validator.ts');
test('three master tables have unique ids and all published stages carry only access references',async()=>{
 for(const [kind,total] of [['item',310],['skill',143],['technique',67]]){
  const entries=cat.contentEntries(kind);assert.equal(entries.length,total);assert.equal(new Set(entries.map(e=>e.id)).size,total);
 }
 const access=JSON.parse(await readFile(new URL('../mod-kit/entity-catalog/stage-access.json',import.meta.url),'utf8'));
 for(const [stageId,content] of Object.entries(access.stages)){
  const mod=JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${stageId}.json`,import.meta.url),'utf8'));
  assert.deepEqual(mod.content,content);
  for(const rows of Object.values(content))for(const r of rows)assert.deepEqual(Object.keys(r),['id']);
  assert.equal(validateScenarioMod(mod).valid,true,stageId);
 }
});
test('catalog hydration preserves stage-specific definitions without mutation or future-phase fallback',async()=>{
 const entry=cat.contentEntries('item').find(e=>Object.keys(e.stageVariants).length);
 const stageId=Object.keys(entry.stageVariants)[0],ref={manifest:{id:stageId},content:{items:[{id:entry.id}]}};
 const hydrated=cat.resolveScenarioContent(ref);
 assert.deepEqual(hydrated.content.items[0],entry.stageVariants[stageId]);assert.deepEqual(ref.content.items,[{id:entry.id}]);
 hydrated.content.items[0].name='changed';assert.notEqual(cat.contentName('item',entry.id,stageId),'changed');
 assert.throws(()=>cat.resolveScenarioContent({content:{items:[{id:'unknown'}]}}),/未知/);
 assert.throws(()=>cat.resolveScenarioContent({content:{items:[{id:entry.id,type:'weapon'}]}}),/定义字段/);
});
test('new strict initialization resolves story-item type and id into the save catalog',async()=>{
 const mod=JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json',import.meta.url),'utf8'));
 const init=buildStrictScenarioInitialization(mod);
 const item=init.runtimeState.canon.items.find(e=>e.id==='lcq.item.crow_bamboo_tube');
 assert.equal(item.storyItem,true);assert.equal(item.name,cat.contentName('item',item.id,mod.manifest.id));
});

test('old project saves are explicitly rejected; new checkpoints carry the format marker',async()=>{
 const {assertEntitySaveFormat}=await loadTs('../src/modules/scenarioMods/entitySaveFormat.ts');
 assert.throws(()=>assertEntitySaveFormat({世界:{状态:{剧本模组:{modId:'lcq.stage_02'}}}}),/新开档/);
 assert.doesNotThrow(()=>assertEntitySaveFormat({世界:{状态:{剧本模组:{modId:'lcq.stage_02',entitySaveFormat:2}}}}));
 assert.doesNotThrow(()=>assertEntitySaveFormat({世界:{状态:{剧本模组:{modId:'custom.test'}}}}));
});
