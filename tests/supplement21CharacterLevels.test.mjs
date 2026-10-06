import assert from 'node:assert/strict';
import test from 'node:test';
import {loadTs} from './loadTs.mjs';
import {readFile} from 'node:fs/promises';
import {auditCharacterLevels} from '../scripts/validate-character-levels.mjs';
const levels=await loadTs('../src/modules/scenarioMods/characterLevels.ts');
const host=await loadTs('../src/modules/sceneModule/host/factors.ts');
const core=await loadTs('../src/modules/sceneModule/index.ts');
const registry=await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const names=await loadTs('../src/modules/scenarioMods/namedEntities.ts');
const progression=await loadTs('../src/modules/scenarioMods/levelProgression.ts');
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8').then(JSON.parse);
function save(){return {系统:{},角色:{属性:{境界:progression.realmAt(0)}},世界:{状态:{剧本模组:{opening:{playerCharacterId:'liuchao.character.cheng_zongyang'},canon:{characters:[]}}}},社交:{关系:{}}};}
test('all66 source rows resolve existing entities and preserve NA and low-confidence provenance',()=>{const a=auditCharacterLevels();assert.deepEqual(a.errors,[]);assert.equal(a.rows,66);assert.equal(a.notApplicable,12);});
test('known realms and temporary effective levels are separated by id and chapter',()=>{
 let f=levels.levelFact('liuchao.character.cheng_zongyang',97);assert.equal(f.level,2);assert.equal(levels.effectiveLevel(f),3);
 f=levels.levelFact('lcq.enemy.gui_wu_wang',97);assert.equal(f.level,6);assert.equal(levels.effectiveLevel(f),4);
 assert.equal(levels.effectiveLevel(levels.levelFact('lcq.enemy.gui_wu_wang',109)),6);
 assert.equal(levels.effectiveLevel(levels.levelFact('lcq.enemy.blood_tiger_yi_hu',63)),4);
 assert.equal(levels.effectiveLevel(levels.levelFact('liuchao.character.ning_yu',54)),3);
 assert.equal(levels.effectiveLevel(levels.levelFact('liuchao.character.le_mingzhu',99)),4);
});
test('NA ghosts and exhausted/disabled actors never become level zero',()=>{
 const ghost=levels.levelFact('lcq.enemy.husha_bone_tiger',97);assert.equal(ghost.level,null);assert.equal(levels.effectiveLevel(ghost),undefined);
 const wu=levels.levelFact('liuchao.character.wu_er_lang',110);assert.equal(wu.available,false);assert.equal(levels.effectiveLevel(wu),undefined);
 assert.equal(levels.levelFact('liuchao.character.wu_er_lang',118).available,false);
 assert.equal(core.levelModifier?.(2,undefined)??0,0);
});
test('elite is a variant of the existing warrior id; low-confidence facts remain placeholders',()=>{
 assert.equal(levels.effectiveLevel(levels.levelFact('lcq.enemy.guiwang_warrior',86)),3);
 assert.equal(levels.effectiveLevel(levels.levelFact('lcq.enemy.guiwang_warrior',86,'elite')),4);
 assert.equal(levels.levelFact('liuchao.character.xiao_zi',80).settingStatus,'placeholder');
});
test('Loumeng/XiFuren registry ids are aliases of the more referenced stage ids',async()=>{
 const r=await read('src/modules/scenarioMods/builtins/character-registry.json');
 for(const [old,id]of [['canon.character.81be8593ee','lcq.character.nanhuang_loumeng'],['canon.character.15b71fd1c8','lcq.character.nanhuang_xi_furen']]){
  assert.equal(names.canonicalEntityId('character',old),id);assert.ok(r.characters.find(c=>c.id===id).idAliases.includes(old));assert.ok(!r.characters.some(c=>c.id===old));
 }
});
test('F10 snapshots the effective level and freezes it for the same chapter',()=>{
 const c=registry.sceneContractById('combat.f10.ghost_king_clash'),s=core.beginScene(c).state,v=save();host.snapshotLevels(v,c,s);
 assert.equal(s.levels.pc,3);assert.equal(s.levels.gui_wu_wang,4);assert.equal(s.levels.dan_chen,4);assert.equal(s.levels.hu_sha,undefined);
 assert.equal(s.levelFacts.gui_wu_wang.level,6);v.角色.属性.境界=progression.realmAt(9);host.snapshotLevels(v,c,s);assert.equal(s.levels.pc,3);
});
test('F13 chapter110 withdraws Ningyu and Wuerlang without counting retreat as death',()=>{
 const c=registry.sceneContractById('combat.f13.ghost_king_final'),s=core.beginScene(c).state,v=save();host.snapshotLevels(v,c,s);
 assert.equal(s.levels.wu_er_lang,5);assert.equal(s.levels.ning_yu,4);s.beat=2;host.snapshotLevels(v,c,s);
 for(const id of ['wu_er_lang','ning_yu']){assert.equal(s.present[id],false);assert.ok(s.departed.includes(id));assert.equal(s.levels[id],undefined);}
 assert.equal(core.isLost(c,s),false);
});
test('F01 swordsman is not a player-facing combatant; F02 Ningyu only joins the closing story',()=>{
 const c=registry.sceneContractById('combat.f01.iron_bridge'),s=core.beginScene(c).state;host.snapshotLevels(save(),c,s);
 assert.equal(s.levels.pc,2);assert.equal(s.levels.swordsman,4);assert.equal(s.present.swordsman,false);
 assert.ok(!c.enemyActions.some(a=>a.party==='swordsman'));
 const f2=registry.sceneContractById('combat.f02.snake_assault');assert.ok(!f2.parties.some(p=>p.ref==='liuchao.character.ning_yu'));assert.equal(levels.effectiveLevel(levels.levelFact('lcq.enemy.sheyi_raider',37)),3);
});

test('F10 losing husha support changes Danchen to the source-backed effective level2',()=>{
 const c=registry.sceneContractById('combat.f10.ghost_king_clash'),s=core.beginScene(c).state,v=save();host.snapshotLevels(v,c,s);assert.equal(s.levels.dan_chen,4);
 s.beat=4;s.present.hu_sha=false;s.departed.push('hu_sha');host.snapshotLevels(v,c,s);assert.equal(s.levels.dan_chen,2);assert.equal(s.levelFacts.dan_chen.sourceRow,40);
});
