import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadTs} from './loadTs.mjs';
const {estimateNpcAge,enforceScenarioNpcAdulthood,applyScenarioRelationshipsToSave}=await loadTs('../src/modules/scenarioMods/relationships.ts');
const {createJudgementProposal,persistPendingJudgement,resolvePendingJudgement}=await loadTs('../src/utils/judgementEngine.ts');
const {CHARACTER_QUESTS}=await loadTs('../src/modules/scenarioMods/characterQuests.ts');
const {formatIntimacyProfile,INTIMACY_PROFILES}=await loadTs('../src/modules/scenarioMods/intimacyProfiles.ts');
const read=async p=>JSON.parse(await readFile(new URL('../'+p,import.meta.url),'utf8'));
test('C01 card storyAge/birthYear take precedence and no role produces age below18',()=>{
 for(const role of ['幼帝','幼子','碧鲮村少女','花苗少女','学徒','侍女','凡人'])for(const id of ['a','b','c','d']){
  assert.ok(estimateNpcAge({id,name:id,role,realm:'凡人'},200)>=18);
 }
 assert.equal(estimateNpcAge({id:'a',name:'测试',profile:{storyAge:{value:'24'},birthYear:190}},220),24);
 assert.equal(estimateNpcAge({id:'a',name:'测试',profile:{birthYear:190}},220),30);
 assert.equal(estimateNpcAge({id:'a',name:'测试',profile:{birthYear:202}},200),18);
 assert.equal(estimateNpcAge({id:'a',name:'测试',profile:{storyAge:{value:12}}},200),18);
 assert.equal(estimateNpcAge({id:'liuchao.character.xiao_zi',name:'小紫',role:'碧鲮村少女'},200),18);
 assert.equal(estimateNpcAge({name:'安乐公主'},200),18);
});
test('C01 NPC birth dates persist adult ages in a fresh save',()=>{
 const s={元数据:{时间:{年:200}},社交:{关系:{}}};
 const cs=[{id:'liuchao.character.xiao_zi',name:'小紫',role:'碧鲮村少女'},{id:'liuchao.character.a_xi',name:'阿夕',role:'花苗少女'}];
 applyScenarioRelationshipsToSave(s,{characters:cs,playerRelationships:cs.map(c=>({characterId:c.id,relation:'相识',favorability:0})),opening:{}},'test');
 for(const name of ['小紫','阿夕'])assert.ok(200-s.社交.关系[name].出生日期.年>=18);
});
function resolve(text,overrides={}){
 const s={角色:{属性:{气血:{当前:100,上限:1000},神识:{当前:100,上限:1000}},效果:[]},系统:{扩展:{}}};
 const p=createJudgementProposal({actionText:text,kind:'cultivate',whyNow:'测试',difficulty:{band:'normal',value:5},factors:[],stakes:{success:'恢复',partial:'稍有恢复',failure:'停止'},canonPolicy:'free',createdAtTurn:1});
 persistPendingJudgement(s,p);
 const r=resolvePendingJudgement(s,p.id,{currentTurn:1,roll:()=>20,...overrides});return {s,r,p};
}
test('C02 unconfirmed or coerced cultivation cannot gain even with high roll/external effects/test override',()=>{
 for(const word of ['强迫','胁迫','迷药','制住','制服','下药','昏迷','不愿','拒绝','麻古']){
  const {s,r,p}=resolve(`双方同意，但我用${word}后双修疗伤`,{testOutcome:'perfect',appliedEffects:[{key:'角色.效果',action:'upsert',value:{状态名称:'阴阳调和',类型:'buff'}}]});
  assert.equal(r.outcome,'failure');assert.deepEqual(r.appliedEffects,[]);assert.deepEqual(s.角色.效果,[]);assert.equal(s.角色.属性.气血.当前,100);
  assert.deepEqual(resolvePendingJudgement(s,p.id,{currentTurn:2,roll:()=>20}),r);
 }
 assert.equal(resolve('与同伴双修调息疗伤').r.outcome,'failure');
 const yes=resolve('双方自愿双修调息疗伤');assert.equal(yes.r.outcome,'great_success');assert.equal(yes.s.角色.效果[0].状态名称,'阴阳调和');
 assert.ok(resolve('独自运功调息疗伤').s.角色.属性.气血.当前>100,'普通调息不变');
});
test('C02 Zhuo forced cultivation absent from tasks; other audit beats retained',()=>{
 const q=CHARACTER_QUESTS.find(q=>q.id==='zhuoyunjun');
 assert.ok(!q.beats.some(b=>b.eventIds.includes('lcq.event.s12_zhuo_forced')));
 for(const id of ['lcq.event.s07_09_hengtang_ambush','lcq.event.s07_zhuo_price','lcq.event.s12_03_xiaozi_controls_zhuo'])assert.ok(q.beats.some(b=>b.eventIds.includes(id)));
});
test('C02 YueShuang tiers retain hostility without replaying involuntary encounters',()=>{
 const p=INTIMACY_PROFILES.find(p=>p.names.includes('月霜'));
 assert.doesNotMatch(JSON.stringify([p.preferences,p.tiers]),/半强迫|反复交合|取血.*结合|每次结束/);
 const output=formatIntimacyProfile('月霜',{sceneText:'双修',favor:100});
 assert.match(output,/仅记录既成事实|仅.*事实/);assert.match(output,/不重复/);assert.match(output,/敌意|双标/);
});
test('C01 source cards and generated registry preserve adulthood and approved exceptions',async()=>{
 const cards=await read('mod-kit/generated/deepseek-v4-flash/character-canon/character-cards-v3.json');
 const c=n=>cards.characters.find(c=>c.canonicalName===n);
 assert.doesNotMatch(c('阿夕').staticProfile.weaknesses.join(''),/年龄小/);assert.match(c('阿夕').staticProfile.identitySummary,/成年/);
 assert.doesNotMatch(JSON.stringify(c('小玲儿')),/童颜|外表远稚|稚嫩/);
 assert.doesNotMatch(c('安乐公主').staticProfile.appearance,/洋娃娃/);assert.ok(Number(c('安乐公主').staticProfile.storyAge.value)>=18);
 const stage=await read('src/modules/scenarioMods/builtins/data/lcq.stage_05b.json');
 assert.ok(stage.canon.characters.find(c=>c.name==='阿夕').profile.personality.includes('天真跳脱'));
 const n=(await read('src/modules/scenarioMods/builtins/data/lcq.stage_02.json')).canon.characters.find(c=>c.name==='凝羽');
 assert.ok(n.profile.memories.some(m=>/药物侵害.*原著事实记忆/.test(m)));assert.ok(!n.profile.memories.some(m=>m.includes('迷奸')));
 const x=(await read('src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json')).canon.characters.find(c=>c.name==='小紫');
 assert.match(x.profile.appearance,/成年少女/);
});

test('C01 existing underage birthdays repair once; adult birthdays stay unchanged',()=>{
 const s={元数据:{时间:{年:200,月:1,日:1}},社交:{关系:{小紫:{出生日期:{年:185,月:3,日:1}},阿夕:{出生日期:{年:182,月:12,日:1}},谢艺:{出生日期:{年:150,月:5,日:1}}}}};
 const adult=structuredClone(s.社交.关系.谢艺.出生日期);enforceScenarioNpcAdulthood(s);
 assert.deepEqual(s.社交.关系.小紫.出生日期,{年:182,月:1,日:1});assert.deepEqual(s.社交.关系.阿夕.出生日期,{年:182,月:1,日:1});assert.deepEqual(s.社交.关系.谢艺.出生日期,adult);
 const before=structuredClone(s);enforceScenarioNpcAdulthood(s);assert.deepEqual(s,before);
});
test('display label repair has exact hash migration and retains old action state',async()=>{
 const {migrateBatch6TextContracts}=await loadTs('../src/modules/scenarioMods/runtime.ts');
 for(const [stage,id,label,hash,to] of [['lcq.stage_02','lcq.event.s02_04','五原城里有人把你当成逃奴，先应付眼前的盘问与拉扯','f6f916da','68462843'],['lcq.stage_04b_lingfei_baiyi_crisis','lcq.event.huamiao_coop_boundary','跟花苗谈清进鬼王峒的合作边界','dc6ab360','b0a94a70']]){
  const latest=(await read('src/modules/scenarioMods/builtins/data/'+stage+'.json')).scenario.events.find(e=>e.id===id);
  const old=structuredClone(latest);old.playerCompletionContract.actions[0].label=label;
  const rt={events:[old],eventActionStates:{[id]:{contractHash:hash,attemptCount:1,attempts:[{outcome:'success'}],preparations:['preserved']}}};
  assert.equal(migrateBatch6TextContracts(rt,[latest]),1);assert.equal(rt.eventActionStates[id].contractHash,to);assert.deepEqual(rt.eventActionStates[id].preparations,['preserved']);
  const changed=structuredClone(latest);changed.playerCompletionContract.actions[0].timeCost+=1;assert.equal(migrateBatch6TextContracts(rt,[changed]),0);
 }
});
test('old checkpoint repairs NingYu factual memory and underage birthday without repeating invasion',async()=>{
 const {createMinimalSaveDataV3}=await loadTs('../src/utils/dataRepair.ts');
 const {buildStrictScenarioInitialization,applyStrictScenarioInitializationToSave}=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
 const {ensureEncounteredScenarioCharacter}=await loadTs('../src/modules/scenarioMods/relationships.ts');
 const {advanceScenarioRuntime}=await loadTs('../src/modules/scenarioMods/runtime.ts');
 const d=await read('src/modules/scenarioMods/builtins/data/lcq.stage_02.json');
 const s=applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(),buildStrictScenarioInitialization(d));
 ensureEncounteredScenarioCharacter(s,{...d.canon,opening:d.scenario.opening},'liuchao.character.ning_yu');
 const npc=s.社交.关系.凝羽;const now=s.元数据.时间.年;
 npc.出生日期={年:now-15,月:1,日:1};npc.记忆=['被程宗扬用麻古迷奸'];
 const next=advanceScenarioRuntime(s).saveData;
 assert.equal(next.社交.关系.凝羽.出生日期.年,now-18);
 assert.match(next.社交.关系.凝羽.记忆.join(''),/药物侵害.*不作为可演出/);
 assert.doesNotMatch(next.社交.关系.凝羽.记忆.join(''),/迷奸/);
});
