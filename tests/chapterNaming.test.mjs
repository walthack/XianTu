import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './loadTs.mjs';
const n=await loadTs('../src/modules/scenarioMods/ledger/naming.ts');
const {syncNanhuangIdentityDisplay,resolveScenarioCharacters,findRegistryIdentitiesByContext}=await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const {ensureEncounteredScenarioCharacter}=await loadTs('../src/modules/scenarioMods/relationships.ts');
const rt=(chapter,characters=[])=>({modId:'lcq.stage_04b_lingfei_baiyi_crisis',events:[{id:'now',axisAnchor:`第${chapter}章`}],activeEventIds:['now'],canon:{characters}});
test('three Shang naming channels do not merge at revelation',()=>{
 const id='liuchao.character.shang_zhen_yu';
 for(const chapter of [44,119,120,121,124])assert.equal(n.namingFor(id,chapter).text,'朱老头');
 assert.equal(n.namingFor(id,120,'narration').text,'朱老头');assert.equal(n.namingFor(id,121,'narration').text,'殇侯');
 assert.match(n.namingFor(id,120,'protagonistAddress').text,/侯爷/);assert.equal(n.namingFor(id,124,'protagonistThought').text,'朱老头');
});
test('bride and envoys are description labels before their own name gates',()=>{
 assert.equal(n.namingFor('liuchao.character.le_mingzhu',46).kind,'description');assert.equal(n.namingFor('liuchao.character.le_mingzhu',47).text,'乐明珠');
 assert.equal(n.namingFor('lcq.character.np006',77).text,'骑白象的鬼王峒使者');assert.equal(n.namingFor('lcq.character.np006',78).text,'阁罗');
 assert.equal(n.namingFor('unknown_whiteyi_envoy',65),undefined);
});
test('Yi Hu presentation follows monster encounter then recognition, never resurrects him',()=>{
 const id='liuchao.character.yi_hu';assert.equal(n.namingFor(id,60).text,'易虎');assert.equal(n.namingFor(id,61).text,'血虎');assert.equal(n.namingFor(id,62).text,'血虎');assert.equal(n.namingFor(id,63).text,'易虎');assert.equal(n.namingFor(id,63,'narration').text,'血虎');
});
test('Binu switches narrator at115 but keeps protagonist address separately',()=>{
 const id='liuchao.character.bi_ji';assert.equal(n.namingFor(id,114,'narration').text,'碧奴');assert.equal(n.namingFor(id,115,'narration').text,'碧姬');assert.equal(n.namingFor(id,115,'protagonistAddress').text,'碧奴');
 const chars=[{id,name:'碧姬'}];assert.equal(n.projectNamingText('看碧姬献舞',rt(95,chars)),'看碧奴献舞');
});
test('chapter progression projects current names and maternal memory without changing identity',()=>{
 const c={id:'liuchao.character.le_mingzhu',name:'花苗新娘',profile:{}};const s={id:'liuchao.character.shang_zhen_yu',name:'殇侯',profile:{}};
 const r=rt(47,[c,s]);syncNanhuangIdentityDisplay(r);assert.equal(c.name,'乐明珠');assert.equal(s.name,'朱老头');assert.equal(c.id,'liuchao.character.le_mingzhu');
});
test('existing id-keyed relation refreshes display name and retains affinity and memories',()=>{
 const id='liuchao.character.le_mingzhu',save={社交:{关系:{[id]:{角色ID:id,名字:'花苗新娘',好感度:73,记忆:['曾同行']}}}};
 ensureEncounteredScenarioCharacter(save,{characters:[{id,name:'乐明珠'}]},id);
 assert.equal(save.社交.关系[id].名字,'乐明珠');assert.equal(save.社交.关系[id].好感度,73);assert.deepEqual(save.社交.关系[id].记忆,['曾同行']);
});
test('current stage has explicit profile fields and cannot inherit future forms or Yijue',()=>{
 const chars=[{id:'liuchao.character.le_mingzhu',name:'乐明珠'}];resolveScenarioCharacters(chars,'lcq.stage_03b_snake_flower_bridge');
 assert.doesNotMatch(JSON.stringify(chars),/义姁|老公/);
});

test('Latin chapter anchors and stage floor do not freeze names at zero',()=>{const r=rt(0);r.events[0].axisAnchor='qingyu.115.1';assert.equal(n.namingChapter(r),115);assert.equal(n.namingChapter({modId:'lcq.stage_05b'}),87);});
test('historical Shang name before recognition does not identify the old guide',()=>{assert.equal(n.projectNamingText('云苍峰说向导由殇振羽安排',rt(44,[{id:'liuchao.character.shang_zhen_yu'}]),'narration'),'云苍峰说向导由殇振羽安排');});

test('southern RAG cannot expose lineage aliases or Yijue via a full-book identity',()=>{const text=JSON.stringify(findRegistryIdentitiesByContext('朱老头 殇侯 刘病已 刘次卿 刘谋 刘询 义姁 乐明珠',30,'lcq.stage_04b_lingfei_baiyi_crisis',rt(80)));assert.doesNotMatch(text,/刘病已|刘次卿|刘谋|刘询|义姁/);});

test('the dungeon envoy has a distinct id and label inside his own window',()=>{const envoy=n.sceneBoundEntity('鬼王峒使者',65);assert.equal(envoy.id,'lcq.character.nanhuang_baiyi_envoy');assert.equal(n.namingFor(envoy.id,65).text,'白夷地宫使者');assert.equal(n.sceneBoundEntity('鬼王峒使者',77),undefined);assert.notEqual(envoy.id,'lcq.character.np006');});

test('name projection preserves self-introduction, organization name and earlier Yi Hu history',()=>{const r=rt(121,[{id:'liuchao.character.shang_zhen_yu'},{id:'liuchao.character.yi_hu'}]);assert.equal(n.projectNamingText('殇侯门；他自称朱八八；易虎被山洪卷走。',r,'narration'),'殇侯门；他自称朱八八；易虎被山洪卷走。');assert.equal(n.namingFor('liuchao.character.shang_zhen_yu',44,'selfReportedName').text,'朱八八');});
