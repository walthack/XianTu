import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadTs} from './loadTs.mjs';
const names=await loadTs('../src/modules/scenarioMods/namedEntities.ts');
const {refreshSaveEntityReferences}=await loadTs('../src/modules/scenarioMods/entitySaveRefs.ts');
const {partyName}=await loadTs('../src/modules/sceneModule/host/refs.ts');
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
test('canonical location/faction aliases preserve one identity in new saves',()=>{
 const save={角色:{位置:{描述:'南荒·鬼王峒'}},社交:{关系:{'liuchao.character.xiao_zi':{当前位置:{描述:'南荒·鬼王峒'},势力归属:'黑魔海',势力归属列表:['黑魔海','liuchao.faction.heimo_hai']}}},世界:{信息:{地点信息:[{名称:'鬼王峒'}],势力信息:[{id:'liuchao.faction.heimo_hai'}]},状态:{剧本模组:{canon:{locations:[{id:'liuchao.location.guiwang_dong',name:'鬼王峒'}]}}}}};
 refreshSaveEntityReferences(save);
 assert.equal(save.角色.位置.locationId,'liuchao.location.gui_wang_dong');
 const npc=save.社交.关系['liuchao.character.xiao_zi'];
 assert.equal(npc.当前位置.locationId,save.角色.位置.locationId);
 assert.deepEqual(npc.factionIds,['liuchao.faction.hei_mo_hai']);
 assert.deepEqual(npc.势力归属列表,npc.factionIds);
 assert.equal(save.世界.信息.地点信息[0].id,save.角色.位置.locationId);
 assert.equal(names.entityName('faction',npc.factionId),'黑魔海');
 refreshSaveEntityReferences(save);assert.deepEqual(npc.factionIds,['liuchao.faction.hei_mo_hai']);
});
test('shared enemy type keeps individual subjects and named NPC identity',()=>{
 const c=read('src/modules/sceneModule/contracts/f05.json');
 const one=c.parties.find(p=>p.id==='warrior_1'),two=c.parties.find(p=>p.id==='warrior_2'),tiger=c.parties.find(p=>p.id==='blood_tiger');
 assert.equal(one.ref,two.ref);assert.notEqual(one.instanceId,two.instanceId);
 assert.equal(partyName(c,null,one.id),'鬼武士一');assert.equal(partyName(c,null,two.id),'鬼武士二');
 assert.equal(tiger.ref,'liuchao.character.yi_hu');assert.equal(tiger.enemyId,'lcq.enemy.blood_tiger_yi_hu');
 assert.equal(names.canonicalEntityId('enemy','lcq.enemy.guiwang_ghost_warrior'),one.ref);
});
test('requested six stage characters have source-backed registry cards',()=>{
 const r=read('src/modules/scenarioMods/builtins/character-registry.json');
 for(const key of ['dagu','shekui','heishe','shigang','xiaowei','kawa'])assert.ok(r.characters.some(c=>c.id==='lcq.character.nanhuang_'+key));
});
