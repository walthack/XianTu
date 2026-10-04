import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';
const { resolveScenarioCharacters, syncNanhuangIdentityDisplay, xiaoziDisclosure }=await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const { fixedEndingNarrative, endingBridge, BATTLE_ROUT_ENDINGS }=await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
const { validateNanhuangCanonNarrative }=await loadTs('../src/modules/scenarioMods/narrativeBoundaries.ts');
const { departedPresentNames }=await loadTs('../src/modules/scenarioMods/presence.ts');
const stage=async id=>JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`,import.meta.url),'utf8'));
const xiao=chars=>chars.find(c=>c.id==='liuchao.character.xiao_zi');
test('registry public identity, appearance and embedding contain no unrevealed lineage, teacher or hidden personality',async()=>{
 const r=JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/character-registry.json',import.meta.url),'utf8'));
 const c=r.characters.find(c=>c.canonicalName==='小紫');
 assert.doesNotMatch([c.staticProfile.identitySummary,c.staticProfile.appearance,c.embedText].join(' '),/岳帅|岳鹏举|碧姬|毒宗|黑魔海|殇侯|血脉|白切黑|病娇|后宫|正宫/);
 assert.equal(c.privateProfile,undefined);
 for(const id of ['lcq.stage_04b_lingfei_baiyi_crisis','lcq.stage_05b']) {
  const d=await stage(id);const chars=structuredClone(d.canon.characters);resolveScenarioCharacters(chars,id);
  const c=xiao(chars);assert.equal(c.profile.race,'碧鲮族');assert.deepEqual(c.profile.personality,['天真俏皮','偶露古怪狠劲','对程宗扬好奇']);
  assert.doesNotMatch(JSON.stringify(c.profile),/岳帅|岳鹏举|毒宗|黑魔海|殇侯|白切黑|病娇|血脉|正宫|后宫/);
 }
});
test('mother needs chapter78 performance receipt; father needs verified chapter105 pact first step',()=>{
 const c={id:'liuchao.character.xiao_zi',name:'小紫',profile:{attributes:{fortune:8},appearance:'岳帅与碧姬之女，毒宗唯一嫡传',notes:['白切黑病娇'],memories:['岳帅的女儿']}};
 const rt={modId:'lcq.stage_04b_lingfei_baiyi_crisis',canon:{characters:[c]},completedEventIds:[]};
 syncNanhuangIdentityDisplay(rt);assert.deepEqual(c.profile.attributes,{fortune:8});assert.equal(c.profile.race,'碧鲮族');assert.doesNotMatch(JSON.stringify(c.profile),/岳帅|岳鹏举|碧姬|碧奴|毒宗|血脉/);
 rt.completedEventIds.push('lcq.event.weapon_deal_with_geluo');syncNanhuangIdentityDisplay(rt);
 assert.doesNotMatch(c.profile.notes.join(' '),/碧奴|碧姬|岳鹏举/);assert.match(c.profile.notes.join(' '),/怀疑.*未证实/);assert.equal(c.profile.race,'碧鲮族');
 rt.sceneLedger={worldFacts:['小紫母系已演出：碧奴的女儿']};syncNanhuangIdentityDisplay(rt);
 assert.match(c.profile.notes.join(' '),/碧奴/);assert.doesNotMatch(c.profile.notes.join(' '),/岳鹏举/);assert.equal(c.profile.race,'碧鲮族（母系碧姬）');
 rt.modId='lcq.stage_05b';rt.activeEventIds=['lcq.event.s05b_09_temporary_pact_with_xiaozi'];rt.completedEventIds=[];syncNanhuangIdentityDisplay(rt);assert.equal(c.profile.race,'碧鲮族（母系碧姬）');assert.equal(xiaoziDisclosure(rt).father,false);
 rt.eventActionStates={'lcq.event.s05b_09_temporary_pact_with_xiaozi':{preparations:['counterstrike_plan_formed']}};syncNanhuangIdentityDisplay(rt);
 assert.equal(c.profile.race,'碧鲮族（母系碧姬）');assert.match(c.profile.notes.join(' '),/岳鹏举/);assert.equal(xiaoziDisclosure(rt).father,true);
 assert.throws(()=>validateNanhuangCanonNarrative('小紫是岳鹏举的女儿。',rt.modId,'鬼王宫',[]),/身世/);
 assert.doesNotThrow(()=>validateNanhuangCanonNarrative('小紫是岳鹏举的女儿。',rt.modId,'鬼王宫',[],rt));
 assert.throws(()=>validateNanhuangCanonNarrative('小紫是碧姬的女儿。','lcq.stage_04b_lingfei_baiyi_crisis','碧鲮村',['lcq.event.weapon_deal_with_geluo']),/身世/);
 assert.doesNotThrow(()=>validateNanhuangCanonNarrative('小紫是碧姬的女儿。','lcq.stage_04b_lingfei_baiyi_crisis','碧鲮村',[],{sceneLedger:{worldFacts:['小紫母系已演出：碧奴的女儿']}}));
});
test('small-purple cannot become present in03b/04, or in04b before chapter70 first-appearance event',()=>{
 for(const modId of ['lcq.stage_03b_snake_flower_bridge','lcq.stage_04','lcq.stage_04b_lingfei_baiyi_crisis']) assert.ok(departedPresentNames({modId}).includes('小紫'));
 assert.ok(!departedPresentNames({modId:'lcq.stage_04b_lingfei_baiyi_crisis',activeEventIds:['lcq.event.xiaozi_first_appears']}).includes('小紫'));
});
test('E06/E07/E08 map to full fixed endings; failure survives but never offers continuation or death label',()=>{
 assert.equal(BATTLE_ROUT_ENDINGS.length,3);
 for(const e of BATTLE_ROUT_ENDINGS){const text=fixedEndingNarrative(e);assert.ok(text.length>550);assert.doesNotMatch(text,/殇侯/);assert.ok(endingBridge('<内部指令>',e.endingId));assert.equal(e.tier,'rout');}
 assert.equal(BATTLE_ROUT_ENDINGS[2].endingId,'lcq.ending.fail.dragon_essence');assert.equal(BATTLE_ROUT_ENDINGS[2].kind,'failure');
 assert.match(fixedEndingNarrative(BATTLE_ROUT_ENDINGS[2]),/你还活着/);
 assert.equal(fixedEndingNarrative({endingId:'lcq.ending.death.dragon_essence',sourceEventId:'lcq.event.slay_dragon'}),undefined);
});

test('E08 uses existing terminal freeze without killing the protagonist', async()=>{
 const {createMinimalSaveDataV3}=await loadTs('../src/utils/dataRepair.ts');
 const {buildStrictScenarioInitialization,applyStrictScenarioInitializationToSave}=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
 const {advanceScenarioRuntime,getCurrentStoryEventActions}=await loadTs('../src/modules/scenarioMods/runtime.ts');
 const s=applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(),buildStrictScenarioInitialization(await stage('lcq.stage_05b')));
 const rt=s.世界.状态.剧本模组;const hp=structuredClone(s.角色.属性);const ending=BATTLE_ROUT_ENDINGS[2];
 rt.gameOver={endingId:ending.endingId,title:ending.title,facts:[...ending.facts],sourceEventId:ending.sourceEventId,atTurn:rt.worldTurn};
 const before={completed:[...rt.completedEventIds],chapter:rt.currentChapterId,turn:rt.worldTurn};
 assert.deepEqual(getCurrentStoryEventActions(s),[]);
 const after=advanceScenarioRuntime(s).saveData;const next=after.世界.状态.剧本模组;
 assert.deepEqual({completed:next.completedEventIds,chapter:next.currentChapterId,turn:next.worldTurn},before);
 assert.deepEqual(after.角色.属性,hp);assert.equal(next.gameOver.endingId,ending.endingId);
});
test('legacy RAG gives only safe phase facts and cannot recall small-purple before her stage or without stage context',async()=>{
 const {characterRagService:rag}=await loadTs('../src/services/characterRagService.ts');
 const r=JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/character-registry.json',import.meta.url),'utf8'));
 const c=r.characters.find(c=>c.canonicalName==='小紫');const original={isEnabled:rag.isEnabled,db:rag.db,search:rag.search};
 try {
  rag.isEnabled=()=>true;rag.db={};rag.search=async()=>[{id:c.id,canonicalName:c.canonicalName,score:.9}];
  for(const stageId of ['lcq.stage_02','lcq.stage_03b_snake_flower_bridge','lcq.stage_04',undefined]) assert.doesNotMatch(await rag.buildSectionForPrompt('小紫',{stageId}),/\*\*小紫\*\*/);
  for(const stageId of ['lcq.stage_04b_lingfei_baiyi_crisis','lcq.stage_05b']) assert.doesNotMatch(await rag.buildSectionForPrompt('小紫',{stageId}),/岳鹏举|岳帅|碧姬|毒宗|黑魔海|殇侯|血脉|白切黑|病娇/);
 } finally {Object.assign(rag,original);}
});
