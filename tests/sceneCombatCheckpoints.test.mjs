import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {loadTs} from './loadTs.mjs';

test('fresh opening replay exports all seven registered combat checkpoints',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xiantu-scene-checkpoints-'));
 execFileSync(process.execPath,['scripts/generate-scene-combat-checkpoints.mjs',dir],{encoding:'utf8',maxBuffer:8*1024*1024});
 const rt=await loadTs('../src/modules/scenarioMods/runtime.ts');
 const bundleUtils=await loadTs('../src/utils/dadBundle.ts');
 const validate=await loadTs('../src/utils/saveValidationV3.ts');
 const host=await loadTs('../src/modules/sceneModule/host/controller.ts');
 globalThis.location={search:'?sceneModule=on',hostname:'localhost'};
 try{
  const expected={F01:'lcq.event.iron_bridge_ambush',F02:'lcq.event.s03b_snake_flower_bridge_01',F04:'lcq.event.s04b_lingfei_baiyi_crisis_03',F05:'lcq.event.s04b_lingfei_baiyi_crisis_10',F03:'lcq.event.s04_02',F10:'lcq.event.s05b_05b_ideology_duel_and_defeat',F13:'lcq.event.ghost_king_swallowed'};
  for(const [label,id]of Object.entries(expected)){
   const bundle=JSON.parse(await readFile(join(dir,label+'-before.json'),'utf8'));
   assert.equal(bundle.type,'saves');assert.equal(bundle.saves.length,1);assert.ok(bundle.saves[0].存档名);
   assert.equal(bundleUtils.unwrapDadBundle(bundle).type,'saves');
   const save=bundle.saves[0].存档数据;assert.equal(validate.validateSaveDataV3(save).isValid,true);
   assert.deepEqual(save,JSON.parse(await readFile(join(dir,label+'-before.raw.json'),'utf8')));
   const runtime=save.世界.状态.剧本模组;
   assert.equal(rt.getScenarioFocusEvent(runtime).id,id);
   assert.equal(runtime.completedEventIds.includes(id),false);
   assert.equal(runtime.gameOver,undefined);
   assert.equal(save.系统.扩展.战斗检查点来源.createdFrom,'createQingyuOpeningPlaytestSave');
   assert.ok(Object.keys(save.社交.关系).every(id=>id.includes('.character.')));
   assert.equal(host.sceneCandidate(save)?.selection.eventId,id);assert.equal(save.系统.扩展.战斗检查点来源.newSceneReady,true);
  }
  const trace=JSON.parse(await readFile(join(dir,'replay.json'),'utf8'));
  assert.equal(trace.filter(row=>row.mode==='new-host-controlled-success-fixture').length,6);
  assert.ok(trace.some(row=>row.stage==='lcq.stage_04b_lingfei_baiyi_crisis'));
 }finally{delete globalThis.location;}
});

test('loading a checkpoint forks isolated working data and never forks its working copy again',async()=>{
 const {checkpointWorkingCopy}=await loadTs('../src/utils/saveCheckpoint.ts');
 const source={系统:{扩展:{战斗检查点来源:{newSceneReady:true}}},角色:{效果:[]}},before=JSON.stringify(source);
 const a=checkpointWorkingCopy(source,'F10-before'),b=checkpointWorkingCopy(source,'F10-before');
 a.角色.效果.push({状态名称:'背伤'});assert.equal(JSON.stringify(source),before);assert.deepEqual(b.角色.效果,[]);
 assert.equal(a.系统.扩展.战斗检查点来源.sourceSlot,'F10-before');assert.equal(checkpointWorkingCopy(a,'工作档'),null);assert.equal(checkpointWorkingCopy({系统:{扩展:{}}},'普通档'),null);
 const store=await readFile(new URL('../src/stores/characterStore.ts',import.meta.url),'utf8');assert.match(store,/checkpointWorkingCopy\(targetSlot.存档数据,slotKey\)/);assert.match(store,/activeSlotKey = key/);
});
