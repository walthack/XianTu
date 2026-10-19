// 级数以存档里的角色状态为准（2026-10-19 用户裁定）：等级表只当初始值/剧情节点，无名敌人按种类预设（combat.enemyPresets，可热调）。
// 存档用真机导出的「08e0-F06中-第18拍」。
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './loadTs.mjs';
import {readSaveFixture} from './advanceToScene.mjs';
globalThis.location={search:'?sceneModule=on',hostname:'localhost'};
const ext=await loadTs('../src/modules/sceneModule/host/ext.ts'),registry=await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const {snapshotLevels}=await loadTs('../src/modules/sceneModule/host/factors.ts');
const numbers=await loadTs('../src/modules/sceneModule/numbers.ts');
const actorLevels=await loadTs('../src/modules/scenarioMods/actorLevels.ts');
const progression=await loadTs('../src/modules/scenarioMods/levelProgression.ts');
const F06='./fixtures/playtest-08e0/f06-mid-beat18.json',MERFOLK='lcq.enemy.merfolk',LE='liuchao.character.le_mingzhu';
const fresh=async()=>{const save=await readSaveFixture(F06),a=ext.activeScene(save),c=registry.sceneContractById(a.contractId);return {save,c,state:a.state};};

test('玩家：修炼/夺元落账后存档里的境界就是战斗级数（不被等级表拉回）', async()=>{
 const {save,c,state}=await fresh();
 save.角色.属性.境界=progression.realmAt(3);snapshotLevels(save,c,state);
 assert.equal(state.levels.pc,3);assert.equal(state.levels.merfolk,3,'鲛人按当章主角（等级表第 74 章 2 级）+1，不随玩家浮动');
});

test('有名同伴：存档关系档里的境界（传功等写这里）高于等级表时以存档为准；低于时等级表当剧情节点抬到表级', async()=>{
 const {save,c,state}=await fresh();
 save.社交.关系[LE].境界=progression.realmAt(6);snapshotLevels(save,c,state);
 assert.equal(state.levels.le,6);assert.equal(state.levelFacts.le.source,'save');
 const b=await fresh();b.save.社交.关系[LE].境界=progression.realmAt(1);snapshotLevels(b.save,b.c,b.state);
 assert.equal(b.state.levels.le,4);assert.equal(b.state.levelFacts.le.source,'table');
});

test('无名敌人：不在角色等级表；预设可热调（applyGameNumbers），新快照即生效；缓存键随预设变', async()=>{
 const {save,c,state}=await fresh();snapshotLevels(save,c,state);assert.equal(state.levels.merfolk,3);
 const before=structuredClone(numbers.GAME_NUMBERS.combat.enemyPresets);
 try{
  numbers.applyGameNumbers({combat:{enemyPresets:{types:{[MERFOLK]:{protagonistOffset:0}}}}});
  snapshotLevels(save,c,state);assert.equal(state.levels.merfolk,2);
 }finally{numbers.applyGameNumbers({combat:{enemyPresets:before}});}
 snapshotLevels(save,c,state);assert.equal(state.levels.merfolk,3);
});

test('预设校验：偏移须为整数，非法值不让进配置', ()=>{
 assert.deepEqual(actorLevels.validateEnemyPresets(),[]);
 const bad=structuredClone(numbers.GAME_NUMBERS.combat.enemyPresets);bad.types[MERFOLK].protagonistOffset=1.5;
 assert.ok(actorLevels.validateEnemyPresets(bad).some(e=>/protagonistOffset/.test(e)));
});

test('所有合同的无名敌人都按预设定级，且级数不超过当章主角 +1', ()=>{
 for(const c of registry.SCENE_CONTRACTS)for(const p of c.parties){const id=p.enemyId||p.ref;if(p.player||!actorLevels.isEnemyKind(id))continue;
  const chapter=c.levelContext?.chapter??0,got=actorLevels.currentActorLevel(id,{chapter,ref:p.ref});
  assert.equal(got.source,'preset',`${c.meta.id}/${p.id}`);
  const base=actorLevels.protagonistLevel(chapter);
  if(got.level!==undefined&&got.preset.protagonistOffset!==0||got.preset.baseLevel!==undefined)assert.ok(got.level<=base+1,`${c.meta.id}/${p.id} ${got.level} vs ${base}`);
 }
});
