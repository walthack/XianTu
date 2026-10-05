import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';
const sid='lcq.stage_04b_lingfei_baiyi_crisis',chat='lcq.event.zhu88_heimohai_chat';
const rtm=await loadTs('../src/modules/scenarioMods/runtime.ts');
const guards=await loadTs('../src/modules/scenarioMods/narrativeBoundaries.ts');
const intents=await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
const stage=async id=>JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`,import.meta.url)));
async function open(id){const {createMinimalSaveDataV3}=await loadTs('../src/utils/dataRepair.ts');const {buildStrictScenarioInitialization,applyStrictScenarioInitializationToSave}=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');return applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(),buildStrictScenarioInitialization(await stage(id)));}
const rt=s=>s.世界.状态.剧本模组;
test('chapter65 window survives normal rail chapter, can skip chat, travels once on departure',async()=>{
 let s=await open(sid),r=rt(s);s.系统.扩展.清羽记开局={kind:'qingyu-demo-v1'};const {getCanonRailProfile}=await loadTs('../src/modules/scenarioMods/canonRail.ts');
 const rail=getCanonRailProfile(r),after='lcq.event.s04b_lingfei_baiyi_crisis_14';
 r.completedEventIds=rail.orderedEventIds.slice(0,rail.orderedEventIds.indexOf(after));for(const id of r.completedEventIds)r.flags[`event.${id.replace('lcq.event.','')}.done`]=true;
 r.currentChapterId='lcq.chapter.s04b_lingfei_baiyi_crisis_mirror';r.activeEventIds=[after];
 s.角色.位置.描述='南荒·白夷族';
 const {ensureNanhuangLedger}=await loadTs('../src/modules/scenarioMods/travel/travelLedger.ts');ensureNanhuangLedger(s,r);
 // 真实路径已有前面行旅回执，只剩13离城路程尚未结算。
 r.travelLedger.doneEventIds=r.completedEventIds.filter(id=>!id.endsWith('_13'));r.travelLedger.state.currentZoneId='nh.baiyi';r.travelLedger.state.travelReceipts=r.travelLedger.state.travelReceipts.filter(x=>x.routeId!=='nh.r.after.s04b_13');
 s=rtm.advanceScenarioRuntime(s).saveData;r=rt(s);
 assert.match(s.角色.位置.描述,/白夷/);const choices=rtm.getCurrentStoryExplorationActions(s);assert.equal(choices.length,1);assert.equal(choices[0].eventId,chat);assert.match(choices[0].label,/听朱老头聊聊黑魔海旧闻/);
 const free=await intents.resolveNaturalIntent({saveData:s,playerText:choices[0].actionText,generate:async()=>JSON.stringify({actionId:choices[0].actionId,source:choices[0].source,eventId:chat,evidence:choices[0].actionText,certainty:'high'})});assert.equal(free.kind,'matched');
 const chatted=structuredClone(s);assert.equal(rtm.recordStoryEventStructuredAction(chatted,choices[0]).completed,true);assert.equal(rtm.recordStoryEventStructuredAction(chatted,choices[0]).attempted,false);
 const next=rtm.getCurrentStoryEventActions(s).find(a=>a.actionId.startsWith('travel:'));assert.ok(next);assert.equal(rtm.recordStoryEventStructuredAction(s,next).attempted,true);
 assert.match(s.角色.位置.描述,/山谷/);assert.equal(r.travelLedger.lastCard.duration,'半日');
 const count=r.travelLedger.state.travelReceipts.length;rtm.advanceScenarioRuntime(s);assert.equal(r.travelLedger.state.travelReceipts.length,count);
 r.flags['event.s04b_lingfei_baiyi_crisis_14.done']=true; r.completedEventIds.push(after);
 s=rtm.advanceScenarioRuntime(s).saveData; assert.equal(rt(s).activeEventIds.includes(chat),false);
 assert.equal(rtm.getCurrentStoryExplorationActions(s).some(a=>a.eventId===chat),false);
});
test('fenced classifier JSON has same meaning as plain JSON and resolves fresh selection',async()=>{
 const plain='{"actionId":"advance_declared_objective","source":"event_engine","eventId":"lcq.event.s02_04","evidence":"我先应付眼前的盘问与拉扯","certainty":"high"}';
 assert.deepEqual(intents.parseIntentJson('```json\n'+plain+'\n```'),intents.parseIntentJson(plain));assert.equal(intents.parseIntentJson('```json\n坏稿\n```'),null);
});
test('P0 retires the broad batch12 gender rejection; candidates never reject',async()=>{
 const {genderShadowFindings}=await loadTs('../src/modules/scenarioMods/ledger/guardFramework.ts');
 assert.equal(guards.validateKnownGenderNarrative,undefined);
 const hits=genderShadowFindings('谢艺，她说话。',[{name:'谢艺',gender:'男'}]);
 assert.equal(hits.length,1);assert.equal(hits[0].rejected,false);
});
test('father secret is not public without naming Xiaozi; other facts follow canon',()=>{
 assert.throws(()=>guards.validateNanhuangCanonNarrative('岳帅有位遗腹女。',sid,'碧鲮村',[]),/父系/);
 assert.doesNotThrow(()=>guards.validateNanhuangCanonNarrative('岳帅有位遗腹女。',sid,'碧鲮村',['lcq.event.s05b_09_temporary_pact_with_xiaozi']));
 for(const s of ['碧鲮族长苏荔端来茶。','小紫叫苏荔娘。','黑魔海海底有座封印。','血虎额角虎斑与武二郎如出一辙。','你摸到死老头留下的遗物。'])assert.throws(()=>guards.validateQingyuNarrativeFacts(s));
 assert.throws(()=>guards.validateQingyuNarrativeFacts('你先问：“西门庆？”','lcq.event.ningyu_regicide_offer'),/顺序/);
 assert.doesNotThrow(()=>guards.validateQingyuNarrativeFacts('凝羽开口：“西门庆。”你听清了这个名字。','lcq.event.ningyu_regicide_offer'));
 assert.throws(()=>guards.validateQingyuNarrativeFacts('凝羽说道：“那天在天竺。”','lcq.event.ningyu_regicide_offer'),/天竺/);
});
test('bare model date and bracket dates display and persist only the engine clock',async()=>{
 const {composeShortTermMemoryEntry}=await loadTs('../src/utils/memorySanitizer.ts');const {readModuleNarrative}=await loadTs('../src/modules/scenarioMods/modularTurn.ts');
 const raw='仙道200年1月20日 04:00\n\n烛火跳了一下。';assert.equal(readModuleNarrative(raw),'烛火跳了一下。');assert.equal(composeShortTermMemoryEntry('【仙道200年1月20日 04:00】',raw),'【仙道200年1月20日 04:00】烛火跳了一下。');
});
test('epistemic ordering uses global chronicle while keeping labelled local turns',async()=>{
 const {ledgerRecordOrder,ledgerRecordTurnLabel}=await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
 const r={modId:sid,chronicle:[{id:'chronicle.lcq.stage_02.a',stageId:'lcq.stage_02',sequence:5},{id:'chronicle.lcq.stage_04b.b',stageId:sid,sequence:30}],events:[]};
 const a={sourceEventId:'a',learnedAtTurn:60},b={sourceEventId:'b',learnedAtTurn:3};assert.ok(ledgerRecordOrder(r,b)>ledgerRecordOrder(r,a));assert.equal(ledgerRecordTurnLabel(r,b,3),'第04b关 · 第 3 回合');assert.equal(ledgerRecordTurnLabel(r,a,60),'第02关 · 第 60 回合');
});


test('r12 seventeen-person bay scene compacts metadata, preserves identities and sends beyond soft budget',async()=>{
 const m=await stage(sid),event=m.scenario.events.find(e=>e.id==='lcq.event.biling_bay_stance');
 const names=event.playerCompletionContract.actions[0].cast.present;
 assert.equal(names.length,17);
 const {buildCompactModuleNarrativePrompt}=await loadTs('../src/modules/scenarioMods/legacyNarratorPacket.ts');
 const actors=names.map((name,i)=>({characterId:`fixture.${i}`,name,gender:'男',pronoun:'他',race:'汉族',role:'现场同行者',appearance:'长描写'.repeat(160),traits:['沉稳','警惕','重复描写'.repeat(100)]}));
 const facts=['焚村仍在发生，本步站出来打断','小紫父系未确证，不揭秘密'];
 const scene={present:names,presentActors:actors,recentNarrative:'旧正文'.repeat(200),settledOutcome:'玩家站出来打断焚村',固定要点:facts,禁止事项:['不得提前写下一拍'],本轮结算:{本步骤完成:true,整件事件完成:true},账本摘要:{世界事实:facts},世界事实:facts};
 const before=structuredClone(scene);
 const result=buildCompactModuleNarrativePrompt('叙事指令'.repeat(300),scene,['上一拍'.repeat(200),'前文'.repeat(300)]);
 assert.ok(result.originalChars>10000);assert.equal(result.compacted,true);assert.ok(result.system.length<10000);
 const output=JSON.parse(result.system.split('\n场景材料：')[1].split('\n历史摘录')[0]);
 assert.equal(output.presentActors.length,17);assert.deepEqual(output.固定要点,facts);assert.deepEqual(output.本轮结算,scene.本轮结算);
 for(let i=0;i<actors.length;i++)for(const key of ['characterId','name','gender','pronoun','race','role'])assert.equal(output.presentActors[i][key],actors[i][key]);
 assert.deepEqual(scene,before);
 const irreducible=buildCompactModuleNarrativePrompt('指令'.repeat(6000),{settledOutcome:'确定结果',禁止事项:facts},[]);
 assert.ok(irreducible.system.length>10000);assert.ok(irreducible.system.includes('确定结果'));
 const source=await readFile(new URL('../src/utils/AIBidirectionalSystem.ts',import.meta.url),'utf8');
 assert.match(source,/buildCompactModuleNarrativePrompt\(systemInstruction/);assert.doesNotMatch(source,/throw new Error\("模块场景材料超过10000字/);
});
