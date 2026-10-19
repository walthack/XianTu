// fee4：冰蛊在 05/05b 完全没触发。原因：补挂只在「模型叙事可写状态」时跑，本地叙事走不到。改为进段与读档时补挂。
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {loadTs} from './loadTs.mjs';
const init=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');const opening=await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');const pack=await loadTs('../src/modules/contentPacks/index.ts');
const bing=await loadTs('../src/modules/scenarioMods/freeAction/bingGu.ts');const rep=await loadTs('../src/modules/scenarioMods/loadRepairs.ts');const read2=await loadTs('../src/modules/scenarioMods/actorStatusRead.ts');
const read=async id=>pack.applyContentPackOverlays(JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`,import.meta.url))));
const first=await read('lcq.stage_01'),s04=await read('lcq.stage_04b_lingfei_baiyi_crisis'),s05=await read('lcq.stage_05b');
const has=save=>read2.actorStatusRecords(save,save.世界.状态.剧本模组.opening?.playerCharacterId).some(r=>r.statusId==='poison.ice_gu');
function save04(){const save=init.applyStrictScenarioInitializationToSave(opening.createQingyuOpeningPlaytestSave(first),init.buildStrictScenarioInitialization(s04));const r=save.世界.状态.剧本模组;r.nextStageId=s05.manifest.id;r.nextStageReadyId=s05.manifest.id;return save;}
test('切入 05b：冰蛊自动挂上，真气上限压到配置比例', () => {
  const out=init.transitionToNextScenarioStage(save04(),[s05]);assert.equal(out.ok,true,out.reason);
  assert.equal(has(out.saveData),true);
  const qi=out.saveData.角色.属性.灵气;if(qi?.上限>0)assert.ok(bing.qiCapOf(out.saveData)<qi.上限);
});
test('读档补挂：停在 05b 却没冰蛊的旧档读档后挂上；幂等', () => {
  const out=init.transitionToNextScenarioStage(save04(),[s05]).saveData;
  const pid=out.世界.状态.剧本模组.opening.playerCharacterId;const store=out.世界.状态.剧本模组.sceneLedger?.statusRecords;
  if(store?.actors?.[pid])store.actors[pid]=store.actors[pid].filter(r=>r.statusId!=='poison.ice_gu');
  out.角色.效果=(out.角色.效果||[]).filter(e=>e?.状态名称!=='冰蛊');
  assert.equal(has(out),false);
  assert.deepEqual(rep.applyLoadRepairs(out).storyStatuses,['poison.ice_gu']);assert.equal(has(out),true);
  assert.deepEqual(rep.applyLoadRepairs(out).storyStatuses,[]);
});
