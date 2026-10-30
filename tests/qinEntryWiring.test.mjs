import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';
let packs, buildStrictScenarioInitialization, transitionToNextScenarioStage, advanceScenarioRuntime, getCurrentStoryExplorationActions, recordStoryEventStructuredAction, selectMapTravel, settleMapTravel, mapPreparation;
let entry, closers;
before(async () => {
({ CONTENT_PACKS: packs } = await loadTs('../src/modules/contentPacks/index.ts'));
({ buildStrictScenarioInitialization, transitionToNextScenarioStage } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts'));
({ advanceScenarioRuntime, getCurrentStoryExplorationActions, recordStoryEventStructuredAction } = await loadTs('../src/modules/scenarioMods/runtime.ts'));
({ selectMapTravel, settleMapTravel, mapPreparation } = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts'));
entry = packs.mapEntries[0];
closers = ['nanhuang','jin','song'].map(id => packs.lineCompass.lines.find(l=>l.lineId===id).closedWhen[0].path.slice(5));
});
const source = JSON.parse(readFileSync(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json', import.meta.url)));
function saveWith(count) {
 const init=buildStrictScenarioInitialization(source);
 init.runtimeState.completedEventIds=closers.slice(0,count);
 return { 元数据:{时间:{年:220,月:1,日:1,小时:12,分钟:0}},角色:{身份:{},属性:{},位置:init.initialLocation,背包:{金钱:{},物品:{}}},社交:{关系:{}},系统:{扩展:{}},世界:{状态:{剧本模组:init.runtimeState}} };
}
const rt=s=>s.世界.状态.剧本模组;
test('正式主线阈值达标后投递一次，先记下后跨关/读档不重复',()=>{
 let s=saveWith(2);
 let result=advanceScenarioRuntime(s); s=result.saveData;
 assert.ok(!result.transitions.some(t=>t.id===entry.eventId));
 rt(s).completedEventIds.push(closers[2]);
 result=advanceScenarioRuntime(s);s=result.saveData;
 assert.equal(result.transitions.filter(t=>t.id===entry.eventId&&t.type==='event_activated').length,1);
 assert.match(rt(s).events.find(e=>e.id===entry.eventId).description,/商会伙计.*咸阳.*程少主/);
 const choice=getCurrentStoryExplorationActions(s).find(a=>a.eventId===entry.eventId&&a.actionId==='later');
 assert.ok(choice);
 assert.equal(recordStoryEventStructuredAction(s,choice).completed,true);
 s=advanceScenarioRuntime(s).saveData;
 assert.ok(rt(s).completedEventIds.includes(entry.eventId));
 rt(s).nextStageId=source.manifest.id;rt(s).nextStageReadyId=source.manifest.id;
 const switched=transitionToNextScenarioStage(s,[source]);assert.equal(switched.ok,true);
 result=advanceScenarioRuntime(structuredClone(switched.saveData));
 assert.ok(!result.transitions.some(t=>t.id===entry.eventId));
 assert.ok(!getCurrentStoryExplorationActions(result.saveData).some(a=>a.eventId===entry.eventId));
});
test('未达标地图点击咸阳不切关，伪造选择也不通过',()=>{
 const s=saveWith(2),before=structuredClone(s);
 assert.equal(selectMapTravel(s,entry.locationId),undefined);
 assert.equal(settleMapTravel(s,{source:'map',actionId:'test',fromId:'',toId:entry.locationId,routeId:entry.id}),false);
 assert.deepEqual(s,before);
});
test('达标地图点击咸阳切入秦并保留主线续点和跨关账本',()=>{
 let s=advanceScenarioRuntime(saveWith(3)).saveData;
 const choice=getCurrentStoryExplorationActions(s).find(a=>a.eventId===entry.eventId&&a.actionId==='later');
 recordStoryEventStructuredAction(s,choice);s=advanceScenarioRuntime(s).saveData;
 const before=structuredClone(s),selection=selectMapTravel(s,entry.locationId);
 assert.ok(selection);assert.equal(settleMapTravel(s,selection),true);
 assert.equal(rt(s).modId,entry.stageId);
 assert.equal(s.角色.位置.locationId,entry.locationId);
 assert.deepEqual(s.系统.扩展.mapEntryResume.runtime,rt(before));
 assert.ok(rt(s).chronicle.some(e=>e.id.endsWith('.'+entry.eventId)));
 assert.ok(!rt(s).activeEventIds.includes(entry.eventId));
 assert.equal(selectMapTravel(s,entry.locationId),undefined);
});
test('自由输入只提示地图准备，不签发跨国入口',()=>{
 const s=saveWith(3),before=structuredClone(s);
 assert.match(mapPreparation(s,'前往咸阳'),/请打开地图/);
 assert.deepEqual(s,before);
 assert.equal(settleMapTravel(s,{source:'text',actionId:'test',toId:entry.locationId,routeId:entry.id}),false);
});
test('已投递未选择的口信换关只保留动作，不重复投递',()=>{
 let s=advanceScenarioRuntime(saveWith(3)).saveData;
 rt(s).nextStageId=source.manifest.id;rt(s).nextStageReadyId=source.manifest.id;
 const switched=transitionToNextScenarioStage(s,[source]);assert.equal(switched.ok,true);
 const result=advanceScenarioRuntime(switched.saveData);
 assert.ok(!result.transitions.some(t=>t.id===entry.eventId&&t.type==='event_activated'));
 assert.ok(getCurrentStoryExplorationActions(result.saveData).some(a=>a.eventId===entry.eventId));
});

test('旧档已有 Q-1 done、没有新投递状态，地图入秦不再激活伙计',()=>{
 const s=saveWith(3);rt(s).completedEventIds.push(entry.eventId);
 const selection=selectMapTravel(s,entry.locationId);assert.ok(selection);
 assert.equal(settleMapTravel(s,selection),true);
 assert.ok(rt(s).completedEventIds.includes(entry.eventId));
 assert.ok(!rt(s).activeEventIds.includes(entry.eventId));
});
test('预览推进不污染源存档投递标记，未选择也可在达标后地图入秦',()=>{
 const s=saveWith(3), before=structuredClone(s);
 const preview=advanceScenarioRuntime(s);
 assert.deepEqual(s,before);
 assert.ok(preview.transitions.some(t=>t.id===entry.eventId));
 const selection=selectMapTravel(s,entry.locationId);assert.ok(selection);
 assert.equal(settleMapTravel(s,selection),true);
 assert.equal(rt(s).modId,entry.stageId);
});
