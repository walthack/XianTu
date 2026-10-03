import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';
const ids = ['lcq.stage_03b_snake_flower_bridge','lcq.stage_04','lcq.stage_04b_lingfei_baiyi_crisis','lcq.stage_05b','lcq.stage_07_qingyuan_jiankang'];
const stage = async id => JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`,import.meta.url),'utf8'));
const rt = s => s.世界.状态.剧本模组;
async function opened(id) {
  const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
  const { buildStrictScenarioInitialization, applyStrictScenarioInitializationToSave } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const mod=await stage(id);
  return advanceScenarioRuntime(applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(),buildStrictScenarioInitialization(mod))).saveData;
}
async function focus(save,id) {
  const { getCanonRailProfile }=await loadTs('../src/modules/scenarioMods/canonRail.ts');
  const { advanceScenarioRuntime }=await loadTs('../src/modules/scenarioMods/runtime.ts');
  for(const eventId of getCanonRailProfile(rt(save)).orderedEventIds) {
    if(eventId===id)break;
    const e=rt(save).events.find(e=>e.id===eventId);
    rt(save).flags[e.completion[0].path.slice(6)]=true;
    save=advanceScenarioRuntime(save).saveData;
  }
  assert.ok(rt(save).activeEventIds.includes(id));
  return save;
}
async function action(save,id) {
  const { recordStoryEventStructuredAction,getCurrentStoryEventActions,advanceScenarioRuntime }=await loadTs('../src/modules/scenarioMods/runtime.ts');
  const selection=getCurrentStoryEventActions(save).find(a=>a.actionId===id);
  assert.ok(selection,`missing action ${id}`);
  rt(save).worldTurn++;
  const result=recordStoryEventStructuredAction(save,selection);
  assert.equal(result.attempted,true,result.reason);
  return advanceScenarioRuntime(save).saveData;
}
test('R boundaries, migrated events are unique, bound, and reachable',async()=>{
 const {getCanonRailProfile}=await loadTs('../src/modules/scenarioMods/canonRail.ts');
 const docs=await Promise.all(ids.map(stage));
 const map=new Map();for(const d of docs)for(const e of d.scenario.events){assert.ok(!map.has(e.id),`duplicate ${e.id}`);map.set(e.id,d.manifest.id);}
 const r4=getCanonRailProfile({modId:ids[2]}).orderedEventIds;
 const r5=getCanonRailProfile({modId:ids[3]}).orderedEventIds;
 assert.equal(r4.at(-1),'lcq.event.enter_dong_with_migu');
 assert.equal(r5[0],'lcq.event.blank_letter_and_dagu');
 assert.equal(r5.at(-1),'lcq.event.shanghou_cures_ice_gu');
 const first=r5.indexOf('lcq.event.s05b_09_temporary_pact_with_xiaozi'),last=r5.indexOf('lcq.event.shanghou_revealed');assert.equal(last-first-1,8);
 assert.ok(r4.indexOf('lcq.event.xiaozi_first_appears')<r4.indexOf('lcq.event.s04b_lingfei_baiyi_crisis_18'));
 for(const d of docs){const bound=new Set(d.scenario.chapters.flatMap(c=>c.eventIds));for(const id of getCanonRailProfile({modId:d.manifest.id}).orderedEventIds){assert.ok(d.scenario.events.some(e=>e.id===id),id);assert.ok(bound.has(id),id);}}
});
test('E05 only opens after warning step, refusal closes fatal choice, touch ends with fixed text',async()=>{
 const {getCurrentStoryEventActions,recordStoryEventStructuredAction}=await loadTs('../src/modules/scenarioMods/runtime.ts');
 const {detectBranchDecision}=await loadTs('../src/modules/scenarioMods/branchDecision.ts');
 const {fixedEndingNarrative,endingBridge,fixedBeatNarrative}=await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
 let save=await focus(await opened(ids[3]),'lcq.event.shanghou_revealed');
 assert.equal(detectBranchDecision(getCurrentStoryEventActions(save)),null);
 assert.ok(!getCurrentStoryEventActions(save).some(a=>a.actionId==='touch_shanghou_relic'));
 save=await action(save,'follow_yeao_to_shanghou');
 assert.match(fixedBeatNarrative('lcq.event.shanghou_revealed','follow_yeao_to_shanghou'),/一百六十七/);
 const choices=getCurrentStoryEventActions(save);assert.equal(detectBranchDecision(choices).options.length,2);
 const fatal=choices.find(a=>a.actionId==='touch_shanghou_relic');const touched=structuredClone(save);
 assert.equal(recordStoryEventStructuredAction(touched,fatal).attempted,true);
 assert.equal(rt(touched).gameOver.endingId,'lcq.ending.death.shanghou_relic');
 assert.match(fixedEndingNarrative(rt(touched).gameOver),/空洞的眼窝/);assert.doesNotMatch(endingBridge('你已经烧成了灰。','lcq.ending.death.shanghou_relic'),/烧成/);
 save=await action(save,'refuse_shanghou_relic_test');assert.ok(!getCurrentStoryEventActions(save).some(a=>a.actionId==='touch_shanghou_relic'));
 assert.equal(recordStoryEventStructuredAction(save,fatal).reason,'action_unavailable');
 save=await action(save,'confirm_zhu_is_shanghou');assert.equal(rt(save).canon.characters.find(c=>c.id==='liuchao.character.shang_zhen_yu').name,'殇侯');
});
test('chapter121 cures once; chapter124 confirms without repeating treatment',async()=>{
 let save=await focus(await opened(ids[3]),'lcq.event.s05b_shanghou_reads_letter');
 save=await action(save,'hand_blank_letter_to_shanghou');
 assert.equal(rt(save).flags['event.s05b_shanghou_reads_letter.ice_gu_cured'],true);
 assert.notEqual(rt(save).flags['event.shanghou_cures_ice_gu.done'],true);
 const end=(await stage(ids[3])).scenario.events.find(e=>e.id==='lcq.event.shanghou_cures_ice_gu');assert.match(end.description,/不再重复施治/);
});
test('masked identity and death/longrest facts remain distinct',async()=>{
 const {syncNanhuangIdentityDisplay}=await loadTs('../src/modules/scenarioMods/characterResolver.ts');
 const runtime={modId:ids[1],canon:{characters:[{id:'liuchao.character.le_mingzhu',name:'乐明珠'},{id:'liuchao.character.shang_zhen_yu',name:'殇侯'}]},flags:{},completedEventIds:[]};
 syncNanhuangIdentityDisplay(runtime);assert.deepEqual(runtime.canon.characters.map(c=>c.name),['花苗新娘','朱八八']);assert.doesNotMatch(JSON.stringify(runtime.canon.characters),/鸩羽|毒宗/);
 runtime.completedEventIds=['lcq.event.s04_03'];syncNanhuangIdentityDisplay(runtime);assert.equal(runtime.canon.characters[0].name,'乐明珠');
 const {resolveScenarioEventNarrative}=await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
 const e=(await stage(ids[3])).scenario.events.find(e=>e.id==='lcq.event.s05b_ice_gu_detour');
 assert.doesNotMatch(resolveScenarioEventNarrative(e,{'event.s06_03.void':true}).description,/谢艺长休/);
 const alive=resolveScenarioEventNarrative(e,{'event.s06_03.void':true,'branch.lcq.if_xieyi_longrest.active':true});assert.match(alive.description,/整个二期不醒/);assert.doesNotMatch(alive.description,/祁远携骨灰/);
 const dead=resolveScenarioEventNarrative(e,{'event.s06_03.done':true});assert.match(dead.description,/祁远携骨灰/);
});
test('explicit phase terminal prevents crossing to next stage',async()=>{
 const {transitionToNextScenarioStage}=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
 const {isNanhuangDemoFinished}=await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
 const save=await opened(ids[2]);save.系统.扩展.清羽记开局={kind:'qingyu-demo-v1',endModId:ids[2],endEventId:'lcq.event.enter_dong_with_migu'};
 rt(save).completedEventIds.push('lcq.event.enter_dong_with_migu');
 assert.equal(isNanhuangDemoFinished(save),true);assert.equal(transitionToNextScenarioStage(save,[]).reason,'本期南荒试玩已结束');
});
test('04b and05b advance through actual action receipts without skipping new beats',async()=>{
 const {getCanonRailProfile}=await loadTs('../src/modules/scenarioMods/canonRail.ts');
 const {getCurrentStoryEventActions,advanceScenarioRuntime}=await loadTs('../src/modules/scenarioMods/runtime.ts');
 for(const id of [ids[2],ids[3]]){
  let save=await opened(id);const seen=new Set();
  for(let n=0;n<160&&!rt(save).nextStageReadyId;n++){
   const actions=getCurrentStoryEventActions(save);
   const candidate=actions.find(a=>!a.judgement&&rt(save).events.find(e=>e.id===a.eventId)?.playerCompletionContract?.actions.some(x=>x.id===a.actionId));
   assert.ok(candidate,`stalled in ${id}: ${JSON.stringify(actions.map(x=>x.actionId))}`);
   seen.add(candidate.eventId);save=await action(save,candidate.actionId);
  }
  assert.ok(rt(save).nextStageReadyId,`${id} must finish`);
  assert.deepEqual([...seen],getCanonRailProfile({modId:id}).orderedEventIds);
 }
});
