import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {loadTs} from './loadTs.mjs';
const init=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');const opening=await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');const pack=await loadTs('../src/modules/contentPacks/index.ts');const ledger=await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');const named=await loadTs('../src/modules/scenarioMods/namedEntities.ts');
const read=async id=>pack.applyContentPackOverlays(JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`,import.meta.url))));
const first=await read('lcq.stage_01'),s04=await read('lcq.stage_04b_lingfei_baiyi_crisis'),s05=await read('lcq.stage_05b');
function save04(){const save=init.applyStrictScenarioInitializationToSave(opening.createQingyuOpeningPlaytestSave(first),init.buildStrictScenarioInitialization(s04));save.世界.状态.剧本模组.nextStageId=s05.manifest.id;save.世界.状态.剧本模组.nextStageReadyId=s05.manifest.id;return save;}
test('contract escape/consumption facts true and false survive JSON save and production stage transition; local progress resets',()=>{
 for(const value of [true,false]){const save=save04(),r=save.世界.状态.剧本模组;r.flags['lcq.f07.escaped']=value;r.flags['lcq.f07.geluo_checked']=value;r.flags['local.unrelated']=true;
 const out=init.transitionToNextScenarioStage(JSON.parse(JSON.stringify(save)),[s05]);assert.equal(out.ok,true);const flags=out.saveData.世界.状态.剧本模组.flags;assert.equal(flags['lcq.f07.escaped'],value);assert.equal(flags['lcq.f07.geluo_checked'],value);assert.equal(flags['local.unrelated'],undefined);
 }});
test('F09 win and lose write technique-id receipt exactly once and keep one-yang across JSON reload and stage transition',()=>{
 const c=pack.CONTENT_PACKS.contracts.find(c=>c.meta.id.startsWith('combat.f09.'));assert.ok(c);
 for(const outcome of ['win','lose']){const save=save04(),r=save.世界.状态.剧本模组,eventId=c.meta.hook.eventId,actionId=c.meta.hook.actionId;
 ledger.applyStepSceneLedger(save,r,eventId,actionId,c.meta.hook.completionSceneByOutcome[outcome]);ledger.applyStepSceneLedger(save,r,eventId,actionId,c.meta.hook.completionSceneByOutcome[outcome]);
 const id='lcq.technique.jiuyang';assert.deepEqual(r.sceneLedger.cultivation[id],{stage:'一阳',eventId,actionId});assert.equal(r.sceneLedger.receipts.filter(x=>x===`${eventId}::${actionId}`).length,1);
 const out=init.transitionToNextScenarioStage(JSON.parse(JSON.stringify(save)),[s05]);assert.equal(out.ok,true);assert.equal(out.saveData.角色.属性.境界.九阳层次,'一阳');assert.equal(out.saveData.世界.状态.剧本模组.sceneLedger.cultivation[id].stage,'一阳');
 }});
