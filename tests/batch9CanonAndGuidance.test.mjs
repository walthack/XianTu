import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadTs} from './loadTs.mjs';
const runtime=await loadTs('../src/modules/scenarioMods/runtime.ts');
const {syncNanhuangIdentityDisplay,xiaoziDisclosure}=await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const {sceneLedgerSummary}=await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
const {validateStepSceneNarrative}=await loadTs('../src/modules/scenarioMods/modularTurn.ts');
const {validateNanhuangCanonNarrative}=await loadTs('../src/modules/scenarioMods/narrativeBoundaries.ts');
const {validateLootNarrative}=await loadTs('../src/modules/scenarioMods/locationLoot.ts');
const {createMinimalSaveDataV3}=await loadTs('../src/utils/dataRepair.ts');
const {buildStrictScenarioInitialization,applyStrictScenarioInitializationToSave}=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const stage=async short=>JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/lcq.stage_${short}.json`,import.meta.url)));
const open=async short=>runtime.advanceScenarioRuntime(applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(),buildStrictScenarioInitialization(await stage(short)))).saveData;
const rt=s=>s.世界.状态.剧本模组;
test('s0204 missing open-world prerequisite gives explicit pastry guidance without changing contract state',async()=>{
 const s=await open('02');rt(s).activeEventIds=['lcq.event.s02_04'];rt(s).currentChapterId=rt(s).chapters.find(c=>c.eventIds.includes('lcq.event.s02_04')).id;
 const before=structuredClone(rt(s));const guide=runtime.wuyuanS0204Guidance(s);assert.match(guide,/点心铺/);assert.match(guide,/拖延|脱身/);assert.deepEqual(rt(s),before);
 const {resolveFixedQuestObjective}=await loadTs('../src/modules/scenarioMods/fixedQuestObjectives.ts');assert.match(resolveFixedQuestObjective({id:'lcq.event.s02_04'}),/点心铺.*观察/);
});
test('YiHu lost then transformed state survives an old checkpoint with no ledger; historical mention permitted',async()=>{
 const s=await open('04');rt(s).completedEventIds.push('lcq.event.s04_05');delete rt(s).sceneLedger;
 let facts=sceneLedgerSummary(s);assert.equal(facts.人物状态.易虎.status,'missing');
 assert.throws(()=>validateStepSceneNarrative('你听说易虎熟悉南荒的路，留下来帮夫人。',undefined,{账本摘要:facts}),/易虎/);
 assert.doesNotThrow(()=>validateStepSceneNarrative('易虎失踪前熟悉南荒的路。你想起那场洪水。',undefined,{账本摘要:facts}));
 rt(s).modId='lcq.stage_04b_lingfei_baiyi_crisis';rt(s).completedEventIds.push('lcq.event.s04b_lingfei_baiyi_crisis_11');facts=sceneLedgerSummary(s);assert.equal(facts.人物状态.易虎.status,'transformed');
 assert.doesNotThrow(()=>validateStepSceneNarrative('你看清易虎被炼成血虎的怪物。',undefined,{账本摘要:facts}));
});
test('Xiaozi race starts Biling; maternal fixed performance precedes verified receipt; suspicion stays unconfirmed until105',async()=>{
 const c={id:'liuchao.character.xiao_zi',profile:{appearance:'穿紫衣的成年少女'}};
 const r={modId:'lcq.stage_04b_lingfei_baiyi_crisis',canon:{characters:[c]},completedEventIds:[]};syncNanhuangIdentityDisplay(r);
 assert.equal(c.profile.race,'碧鲮族');assert.doesNotMatch(c.description,/朱老头/);assert.match(c.profile.appearance,/成年少女/);assert.doesNotMatch(c.profile.notes.join(''),/碧姬|岳/);
 const d=await stage('04b_lingfei_baiyi_crisis');const last=d.scenario.events.find(e=>e.id==='lcq.event.weapon_deal_with_geluo').playerCompletionContract.actions.at(-1);
 assert.throws(()=>validateStepSceneNarrative('你与阁罗谈兵器，定了一成利润。',last,{}),/固定要点/);
 assert.doesNotThrow(()=>validateStepSceneNarrative(last.fallbackText,last,{}));assert.match(last.fallbackText,/碧奴.*女儿/);
 r.completedEventIds.push('lcq.event.weapon_deal_with_geluo');syncNanhuangIdentityDisplay(r);assert.equal(xiaoziDisclosure(r).mother,false,'old completion without maternal performance is not proof');r.sceneLedger={worldFacts:['小紫母系已演出：碧奴的女儿']};syncNanhuangIdentityDisplay(r);assert.equal(c.profile.race,'碧鲮族（母系碧奴）');assert.match(c.profile.notes.join(''),/怀疑.*未证实/);
 assert.doesNotThrow(()=>validateNanhuangCanonNarrative('你怀疑小紫是岳帅的遗腹女，尚未证实。',r.modId,'碧鲮村',r.completedEventIds,r));
 assert.throws(()=>validateNanhuangCanonNarrative('小紫就是岳帅的女儿。',r.modId,'碧鲮村',r.completedEventIds,r),/身世/);
 r.eventActionStates={'lcq.event.s05b_09_temporary_pact_with_xiaozi':{preparations:['counterstrike_plan_formed']}};syncNanhuangIdentityDisplay(r);assert.equal(xiaoziDisclosure(r).father,true);assert.doesNotMatch(c.profile.notes.join(''),/怀疑/);
});
test('old Xieyi notes and social memories lose premature or false family details',async()=>{
 let s=await open('04b_lingfei_baiyi_crisis');const c=rt(s).canon.characters.find(c=>c.name==='谢艺');c.profile.notes=['奉岳帅之命护佑其遗孀碧姬与遗孤小紫','忠于岳帅'];
 s.社交.关系.谢艺 ||= {记忆:[]};s.社交.关系.谢艺.记忆=['奉岳帅之命护佑其遗孀碧姬与遗孤小紫','当前关卡 lcq.stage_04：同行','记得程小哥'];
 s=runtime.advanceScenarioRuntime(s).saveData;assert.doesNotMatch(JSON.stringify(rt(s).canon.characters.find(c=>c.name==='谢艺').profile),/碧姬|遗孀|遗孤/);assert.doesNotMatch(s.社交.关系.谢艺.记忆.join(''),/遗孀|遗孤|当前关卡/);assert.ok(s.社交.关系.谢艺.记忆.includes('记得程小哥'));
});
test('Xiaozi verified meeting populates relationship panel while untouched checkpoint does not',async()=>{
 let s=await open('04b_lingfei_baiyi_crisis');assert.equal(s.社交.关系.小紫,undefined);
 rt(s).completedEventIds.push('lcq.event.xiaozi_first_appears');s=runtime.advanceScenarioRuntime(s).saveData;assert.ok(s.社交.关系.小紫);assert.equal(s.社交.关系.小紫.种族,'碧鲮族');
});
test('Ningyu first demand is fixed32 canon without unseen Suli; A3 adult wording retained',async()=>{
 const d=await stage('02');const a=d.scenario.events.find(e=>e.id==='lcq.event.ningyu_regicide_offer').playerCompletionContract.actions[0];assert.equal(a.forceFixed,true);assert.match(a.fallbackText,/苏妲己/);assert.match(a.fallbackText,/连我一起杀/);assert.doesNotMatch(a.fallbackText,/苏荔|姓周/);
 const b=await stage('04b_lingfei_baiyi_crisis');assert.match(b.scenario.events.find(e=>e.id==='lcq.event.xiaozi_first_appears').playerCompletionContract.actions[0].fallbackText,/成年女子/);
});
test('male YuePengju and empty Sheyi village guard reject actual observed canon errors',()=>{
 const check=t=>validateNanhuangCanonNarrative(t,'lcq.stage_04b_lingfei_baiyi_crisis','南荒·蛇彝村',[]);
 assert.throws(()=>check('岳帅晕血，她不喜见血。'),/性别/);assert.doesNotThrow(()=>check('岳鹏举晕血，他为何还要上战场？你想不通。'));
 assert.throws(()=>check('老彝婆躲在长屋里看着你。'),/空村/);assert.doesNotThrow(()=>check('你看见老彝婆留下的旧物。'));
});
test('loot performance describes every awarded drop, rejects extra award, permits observing outside objects',()=>{
 const receipt={drops:[{name:'蛇蜕',quantity:1}]};assert.throws(()=>validateLootNarrative('你找到铜铢。',receipt),/遗漏/);assert.throws(()=>validateLootNarrative('你收好蛇蜕，又得到铜铢。',receipt),/回执外/);assert.doesNotThrow(()=>validateLootNarrative('你收好蛇蜕，端详旁边的铜铢，没有带走。',receipt));
});
