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

let festivalApi, railApi, compassApi;
before(async () => {
 festivalApi = await loadTs('../src/modules/scenarioMods/heimohaiFestival.ts');
 railApi = await loadTs('../src/modules/scenarioMods/canonRail.ts');
 compassApi = await loadTs('../src/modules/scenarioMods/lineCompass.ts');
});
const finalSource = JSON.parse(readFileSync(new URL('../src/modules/scenarioMods/builtins/data/lyg.shituolin_endgame.json', import.meta.url)));
function finalSave(complete = true) {
 const s = saveWith(3);
 s.世界.状态.剧本模组 = buildStrictScenarioInitialization(finalSource).runtimeState;
 rt(s).completedEventIds = [...closers, ...(complete ? railApi.getCanonRailProfile(rt(s)).orderedEventIds : [])];
 return s;
}
const start = s => festivalApi.startHeimohaiFestival(s, {source:'player', actionId:festivalApi.FESTIVAL.actionId});
test('大祭：终关显示警示，末拍/诛魔不能代替整条rail完成', () => {
 const s = finalSave(false);
 assert.match(festivalApi.festivalView(s).warning, /^【扩写】大祭将近/);
 rt(s).completedEventIds.push('lyg.event.shituolin_endgame_15_beat','lyg.event.claim_slew_demon');
 assert.equal(start(s).ok, false);
 assert.equal(festivalApi.festivalView(saveWith(3)).warning, '');
});
test('大祭：时间/回合推进不启动，必须明确玩家选择；重复点击幂等', () => {
 let s = finalSave();
 s.元数据.时间.日 += 10;
 s = advanceScenarioRuntime(s).saveData;
 assert.equal(s.系统.扩展.festivalStarted, undefined);
 assert.equal(festivalApi.festivalView(s).available, true);
 assert.equal(festivalApi.startHeimohaiFestival(s,{source:'tick',actionId:festivalApi.FESTIVAL.actionId}).ok,false);
 assert.equal(start(s).ok,true);
 assert.match(festivalApi.festivalView(s).transition,/^【扩写·待剧情策划】/);
 const before = structuredClone(s);
 assert.equal(start(s).ok,false);
 assert.deepEqual(s,before);
});
test('大祭：未入秦隐藏提示、停止口信、禁用咸阳且无秦收束记录', () => {
 let s = advanceScenarioRuntime(finalSave()).saveData;
 assert.ok(rt(s).activeEventIds.includes(entry.eventId));
 const beforeChronicle = structuredClone(rt(s).chronicle);
 assert.equal(start(s).ok,true);
 assert.equal(selectMapTravel(s,entry.locationId),undefined);
 assert.ok(!getCurrentStoryExplorationActions(s).some(a=>a.eventId===entry.eventId));
 s = advanceScenarioRuntime(s).saveData;
 assert.ok(!rt(s).activeEventIds.includes(entry.eventId));
 assert.ok(!rt(s).completedEventIds.includes(entry.eventId));
 assert.equal(rt(s).chronicle.filter(e=>!beforeChronicle.some(b=>b.id===e.id)).length,1);
 assert.ok(!compassApi.lineCompassView(s,{}).entryHints.some(h=>h.lineId==='qin'));
});
test('大祭：秦内阻止，叙事提示先完成秦，存档不变', () => {
 const s = finalSave();
 const selection = selectMapTravel(s,entry.locationId);
 assert.equal(settleMapTravel(s,selection),true);
 const before = structuredClone(s);
 assert.match(start(s).note,/【扩写】.*先完成秦线/);
 assert.equal(start(s).ok,false);
 assert.deepEqual(s,before);
});
test('大祭：已入秦并返回者不按未入秦关闭；场外结算与void遵循rail机制', () => {
 const s = finalSave();
 (rt(s).chronicle ||= []).push({id:'visited-qin',stageId:entry.stageId});
 const rail = railApi.getCanonRailProfile(rt(s));
 const id = rail.orderedEventIds[0];
 rt(s).completedEventIds = rt(s).completedEventIds.filter(e=>e!==id);
 rt(s).offscreenResolvedEventIds = [id];
 assert.equal(festivalApi.festivalView(s).available,true);
 rt(s).offscreenResolvedEventIds = [];
 const condition = rt(s).events.find(e=>e.id===id).completion[0];
 rt(s).flags[condition.path.slice(6).replace(/\.done$/, '.void')] = true;
 assert.equal(festivalApi.festivalView(s).available,true);
 assert.equal(start(s).ok,true);
 assert.equal(festivalApi.qinClosedByFestival(s),false);
});
test('大祭：未投递口信直接开祭不再投递；已知秦提示在开祭后隐藏', () => {
 let fresh = finalSave();
 assert.equal(start(fresh).ok,true);
 const result = advanceScenarioRuntime(fresh);
 assert.ok(!result.transitions.some(t=>t.id===entry.eventId));
 assert.equal(result.saveData.系统.扩展.mapEntryMessages?.qin,undefined);
 const s = finalSave();
 rt(s).completedEventIds.push(entry.eventId);
 rt(s).chronicle = [{id:`chronicle.${rt(s).modId}.${entry.eventId}`,stageId:rt(s).modId,type:'event'}];
 assert.ok(compassApi.lineCompassView(s,{}).entryHints.some(h=>h.lineId==='qin'));
 assert.equal(start(s).ok,true);
 assert.ok(!compassApi.lineCompassView(s,{}).entryHints.some(h=>h.lineId==='qin'));
});
test('大祭：插入的大都护拍未结算时不可启动', () => {
 const s = finalSave();
 rt(s).completedEventIds = rt(s).completedEventIds.filter(id=>id!=='lyg.event.shituolin_endgame_title_daduhu');
 assert.equal(start(s).ok,false);
});
