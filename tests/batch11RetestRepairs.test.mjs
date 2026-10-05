import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadTs} from './loadTs.mjs';
const rtm=await loadTs('../src/modules/scenarioMods/runtime.ts');
const {createMinimalSaveDataV3}=await loadTs('../src/utils/dataRepair.ts');
const {buildStrictScenarioInitialization,applyStrictScenarioInitializationToSave}=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const {readLocalMemoryCapsule}=await loadTs('../src/modules/scenarioMods/legacyNarratorPacket.ts');
const sid='lcq.stage_04b_lingfei_baiyi_crisis';
async function open(){const d=JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${sid}.json`,import.meta.url)));return applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(),buildStrictScenarioInitialization(d));}
const rt=s=>s.世界.状态.剧本模组;
function select(r,id){const e=r.events.find(e=>e.id===id);const a=e.playerCompletionContract.actions[0];return {source:'event_engine',eventId:id,actionId:a.id,actionText:a.actionText,playerLine:a.actionText,outcomeText:a.outcomeText.success,timeCost:1};}
test('maternal race uses gated canon in relations and present actors; old knowledge obtains verified turn/name',async()=>{
 const s=await open(),r=rt(s);r.completedEventIds=['lcq.event.xiaozi_first_appears'];
 r.sceneLedger={worldFacts:['小紫母系已演出：碧奴的女儿'],actors:{},receipts:[],names:{},injuries:{}};
 r.eventActionStates={'lcq.event.xiaozi_first_appears':{readyAtTurn:22}};
 r.playerKnowledge={old:{factId:'old',subjectId:'liuchao.character.xiao_zi',predicate:'known',status:'confirmed',disclosureScope:'player',learnedAtTurn:0,sourceEventId:'lcq.event.xiaozi_first_appears'}};
 r.chronicle=[{id:'old-flood',type:'event',stageId:'lcq.stage_04',title:'旱洪与易虎之死',detail:'易虎之死已成共同经历',sequence:1}];
 const n=rtm.advanceScenarioRuntime(s).saveData;
 assert.equal(rt(n).chronicle.find(x=>x.id==='old-flood').title,'旱洪与易虎失踪');
 const race=rt(n).canon.characters.find(c=>c.name==='小紫').profile.race;
 assert.equal(n.社交.关系.小紫.种族,race);assert.match(race,/母系碧奴/);
 assert.equal(rt(n).playerKnowledge.old.learnedAtTurn,22);assert.match(rt(n).playerKnowledge.old.claim,/小紫/);
 const capsule=readLocalMemoryCapsule(n,select(rt(n),'lcq.event.xiaozi_first_appears'));
 assert.equal(capsule.presentActors.find(a=>a.name==='小紫').race,race);
 rt(n).sceneLedger.worldFacts=[];rt(n).completedEventIds=[];rt(n).eventActionStates={};
 assert.equal(readLocalMemoryCapsule(n,select(rt(n),'lcq.event.xiaozi_first_appears')).presentActors.find(a=>a.name==='小紫').race,'碧鲮族');
});
test('Binu cannot act or manage recent village affairs in04b, but is not marked dead',async()=>{
 const {departedPresentNames,stampDepartedCast}=await loadTs('../src/modules/scenarioMods/presence.ts');
 const {validateModuleCastNarrative}=await loadTs('../src/modules/scenarioMods/modularTurn.ts');
 const {validateNanhuangCanonNarrative}=await loadTs('../src/modules/scenarioMods/narrativeBoundaries.ts');
 const r={modId:sid,completedEventIds:[],departedCast:['易虎'],sceneLedger:{actors:{易虎:{status:'missing'}}}};
 assert.ok(departedPresentNames(r).includes('碧奴'));stampDepartedCast(r);assert.ok(!r.departedCast.includes('易虎'));
 assert.throws(()=>validateModuleCastNarrative('碧奴说道：我守着村子。',departedPresentNames(r)),/在场/);
 assert.throws(()=>validateNanhuangCanonNarrative('云苍峰说，碧奴说是村民打翻火把烧了粮仓。',sid,'碧鲮村',[]),/村务/);
 assert.doesNotThrow(()=>validateModuleCastNarrative('阁罗提起碧奴的女儿。',departedPresentNames(r)));
 assert.doesNotThrow(()=>validateNanhuangCanonNarrative('云苍峰回忆当年碧奴在村里生活。',sid,'碧鲮村',[]));
 assert.ok(!departedPresentNames({modId:'lcq.stage_05b',activeEventIds:['lcq.event.geluo_summons_biji']}).includes('碧姬'));
});
test('chapter72 capsule permits general old story but not specific father identity before105 gate',async()=>{
 const s=await open(),r=rt(s),id='lcq.event.s04b_lingfei_baiyi_crisis_18';
 r.completedEventIds=[id];
 assert.match(readLocalMemoryCapsule(s,select(r,id)).facts.join(' '),/遗腹女/);
 assert.doesNotMatch(readLocalMemoryCapsule(s,select(r,id)).facts.join(' '),/小紫是岳帅/);
 r.eventActionStates={'lcq.event.s05b_09_temporary_pact_with_xiaozi':{preparations:['counterstrike_plan_formed']}};
 assert.match(readLocalMemoryCapsule(s,select(r,id)).facts.join(' '),/遗腹女/);
});
test('authorized named answer survives cleaning without making Ximen Qing present',async()=>{
 const {stripNarrativeUnintroducedCharacters}=await loadTs('../src/modules/scenarioMods/characterResolver.ts');
 const text='凝羽闭着眼睛，半晌才道：“西门庆。”\n\n这个名字让她皱起眉头。';
 const out=stripNarrativeUnintroducedCharacters(text,['凝羽'],'阴寒之气来自西门庆');
 assert.equal(out.text,text);assert.deepEqual(out.conflicts,[]);
 assert.ok(stripNarrativeUnintroducedCharacters('西门庆走进屋里，站在你身旁。',['凝羽'],'阴寒之气来自西门庆').conflicts.length);
});
test('double model timestamps collapse to the current game clock; terminal stage has no departure offer',async()=>{
 const {composeShortTermMemoryEntry}=await loadTs('../src/utils/memorySanitizer.ts');
 const prefix='【仙道200年2月1日 08:00】';
 assert.equal(composeShortTermMemoryEntry(prefix,`${prefix}【仙道200年1月1日 08:00】你站在海神殿。`),`${prefix}你站在海神殿。`);
 const s=await open();s.系统.扩展={清羽记开局:{endModId:sid,endEventId:'lcq.event.enter_dong_with_migu'}};
 rt(s).completedEventIds=['lcq.event.enter_dong_with_migu'];rt(s).nextStageId='lcq.stage_05b';rt(s).nextStageReadyId='lcq.stage_05b';
 assert.equal(rtm.getStageDepartureOffer(s),null);
 const vue=await readFile(new URL('../src/components/dashboard/RightSidebar.vue',import.meta.url),'utf8');assert.match(vue,/const next = Boolean\(departure\)/);
});
