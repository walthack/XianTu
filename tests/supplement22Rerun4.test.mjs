import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {loadTs} from './loadTs.mjs';
const core=await loadTs('../src/modules/sceneModule/index.ts');
const registry=await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const rec=await loadTs('../src/modules/sceneModule/host/recognize.ts');
const intent=await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
const init=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const repair=await loadTs('../src/utils/dataRepair.ts');
const rt=await loadTs('../src/modules/scenarioMods/runtime.ts');
const q=await loadTs('../src/modules/scenarioMods/questLines.ts');
const levels=await loadTs('../src/modules/scenarioMods/levelProgression.ts');
const numbers=await loadTs('../src/modules/sceneModule/numbers.ts');
const contract=n=>registry.SCENE_CONTRACTS.find(c=>c.meta.id.startsWith(`combat.f${n}.`));
function save(id){const mod=JSON.parse(fs.readFileSync(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`,import.meta.url)));return init.applyStrictScenarioInitializationToSave(repair.createMinimalSaveDataV3(),init.buildStrictScenarioInitialization(mod));}
test('F01/F05 defensive prose cannot yield, including a wrong model proposal and negated surrender',async()=>{
 for(const n of ['01','05'])for(const text of ['我背靠石壁举刀格挡，护住乐明珠，先撑住他们这一轮','我挥刀招架，守住乐明珠','我绝不放下刀投降，举刀格挡']){
 const c=contract(n),s=core.beginScene(c).state;
 const out=await rec.recognizeAction(c,s,text,{},async()=>JSON.stringify({goal:'yield_guard',claim:{magnitude:1,scope:'single',targets:[]}}));
 assert.ok(out.plan,text);assert.equal(out.plan.goal,'defend',text);
 }
});
test('explicit stopping resistance still routes to the authored loss action',()=>{
 const c=contract('05'),s=core.beginScene(c).state;assert.equal(rec.recognizeByRules(c,s,'我张开双手不躲也不挡',{}).goal,'yield_guard');
});
test('F03 ordinary attack prose progresses unresolved opponents rather than hitting the first final one forever',async()=>{
 const c=contract('03');let s=core.beginScene(c,{forced:{action:Array(30).fill(20),defense:Array(200).fill(20)}}).state;
 for(let i=0;i<13&&s.status==='engaged';i++){
 const out=await rec.recognizeAction(c,s,'我挥刀斩杀眼前的武士',{});
 assert.equal(out.plan.goal,'attack');
 const res=core.confirmAction(c,s,out.plan,{factors:0,playerDefense:0});s=res.state;
 }
 assert.equal(s.outcome.kind,'win');
});
test('south optional emotional input invokes host classifier after Baihu escape and settles bounded affection once',async()=>{
 const s=save('lcq.stage_04'),r=s.世界.状态.剧本模组,b=q.QUEST_LINES.find(l=>l.kind==='character').beats[0];
 s.系统.扩展.清羽记开局={kind:'qingyu-demo-v1'};r.completedEventIds=['lcq.event.baihu_shangguan_escape','lcq.event.s04_03'];r.activeEventIds=['lcq.event.s04_01'];r.worldTurn=10;
 const loc=r.canon.locations.find(l=>l.id===b.locationId);s.角色.位置={描述:loc.name,地点ID:loc.id,x:loc.coordinates.x,y:loc.coordinates.y};
 s.社交.关系['liuchao.character.le_mingzhu']={角色ID:'liuchao.character.le_mingzhu',名字:'乐明珠',好感度:40};
 let calls=0;const out=await intent.resolveNaturalIntent({saveData:s,playerText:'我保证替她保密',generate:async()=>{calls++;return JSON.stringify({actionId:'act.lmz.promise_silence',eventId:b.eventId,source:'exploration_engine',evidence:'替她保密',certainty:'high',affinityDelta:25});}});
 assert.equal(calls,1);assert.equal(out.kind,'matched');r.worldTurn++;
 assert.equal(rt.recordStoryEventStructuredAction(s,out.selection).completed,true);
 assert.equal(s.社交.关系['liuchao.character.le_mingzhu'].好感度,55);
 const again=rt.recordStoryEventStructuredAction(s,out.selection);assert.equal(again.attempted,false);
});
test('training input goes through code judgement and uses configured progress requirement',async()=>{
 const s=save('lcq.stage_04');s.系统.扩展.清羽记开局={kind:'qingyu-demo-v1'};
 const out=await intent.resolveNaturalIntent({saveData:s,playerText:'我打坐练功',generate:async()=>{throw Error('must not classify training as a story action');}});assert.equal(out.skipKeywordPreflight,false);
 assert.equal(levels.realmAt(2).下一级所需,numbers.GAME_NUMBERS.training.progressPerLevel);
 s.角色.属性.境界={...levels.realmAt(2),下一级所需:300};const next=levels.trainingRealm(s,'我修炼','success');assert.equal(next.下一级所需,numbers.GAME_NUMBERS.training.progressPerLevel);assert.equal(next.当前进度,numbers.GAME_NUMBERS.training.successProgress);
});
test('fresh Qingyu opening includes catalog-backed true nylon without duplicate grant',()=>{
 const s=save('lcq.stage_01');assert.equal(s.角色.背包.物品['lcq.item.np012'].数量,1);assert.match(s.角色.背包.物品['lcq.item.np012'].名称,/真/);
});
test('F05 defensive level modifier is independent of empty/self targets across beats',()=>{
 const c=contract('05');let s=core.beginScene(c).state;s.levels={pc:2,ghost_warriors:3,shaman:3,blood_tiger:4};
 const p={goal:'defend',magnitude:1,scope:'single',levers:[],cash:[],text:'我举刀格挡'};
 const empty=core.previewAction(c,s,{...p,targets:[]},{factors:0,playerDefense:0});
 const self=core.previewAction(c,s,{...p,targets:['pc']},{factors:0,playerDefense:0});assert.equal(empty.modifier,self.modifier);assert.equal(empty.modifier,-numbers.GAME_NUMBERS.levels.gapOne);
});
test('training confirmation writes a once-only code receipt and real saved progress',async()=>{
 const pre=await loadTs('../src/utils/judgementPreflight.ts'),judge=await loadTs('../src/utils/judgementEngine.ts');const s=save('lcq.stage_04');
 const proposal=pre.buildLocalJudgementPreflight('我打坐练功',s,1);assert.equal(proposal.kind,'cultivate');judge.persistPendingJudgement(s,proposal);
 const out=judge.resolvePendingJudgement(s,proposal.id,{currentTurn:1,roll:()=>20,testOutcome:'success'});
 assert.equal(s.角色.属性.境界.当前进度,numbers.GAME_NUMBERS.training.successProgress);assert.ok(out.appliedEffects.some(e=>e.key==='角色.属性.境界'));
 judge.resolvePendingJudgement(s,proposal.id,{currentTurn:1,roll:()=>20});assert.equal(s.角色.属性.境界.当前进度,numbers.GAME_NUMBERS.training.successProgress);
});
test('placing weapon aside then raising a guard is not an explicit surrender',()=>{
 const c=contract('05'),s=core.beginScene(c).state;assert.equal(rec.recognizeByRules(c,s,'我放下刀，拔剑防守',{}).goal,'defend');
});
test('F03 model cannot assign a direct strike to an ally takeover goal',async()=>{
 const c=contract('03'),s=core.beginScene(c).state;
 const out=await rec.recognizeAction(c,s,'我挥刀斩杀眼前武士',{},async()=>JSON.stringify({goal:'turn_tide',claim:{magnitude:3,scope:'single',targets:['foe_engaged']}}));assert.equal(out.plan.goal,'attack');
});
test('party labels resolve placeholders and missing phase card names without showing enemy ids',async()=>{
 const refs=await loadTs('../src/modules/sceneModule/host/refs.ts');
 assert.equal(refs.partyName(contract('01'),{},'archers'),'刺客弓手');
 assert.doesNotMatch(refs.partyName(contract('05'),{},'blood_tiger'),/liuchao\.|lcq\.|\{\{/);
 assert.doesNotMatch(refs.partyName(contract('03'),{},'yi_hu'),/血虎|liuchao\.|\{\{/);
});
test('public Xieyi realm projects timepoint6 while pre-revelation stays hidden',()=>{
 const s=save('lcq.stage_04b_lingfei_baiyi_crisis'),r=s.世界.状态.剧本模组;
 s.社交.关系['liuchao.character.xie_yi']={角色ID:'liuchao.character.xie_yi',名字:'谢艺',境界:{名称:'未知',阶段:''}};r.completedEventIds=['lcq.event.s04b_lingfei_baiyi_crisis_13'];r.flags['event.s04b_lingfei_baiyi_crisis_13.done']=true;r.activeEventIds=['lcq.event.s04b_lingfei_baiyi_crisis_18'];
 const next=rt.advanceScenarioRuntime(s).saveData;assert.equal(next.社交.关系['liuchao.character.xie_yi'].境界.名称,'通幽');
});

test('brief enemy-instance placeholders render a name rather than a character id',async()=>{const refs=await loadTs('../src/modules/sceneModule/host/refs.ts');const c=contract('05');for(const p of c.parties){if(!p.instanceId)continue;const shown=refs.renderRefs(`{{enemyInstance:${p.enemyId||p.ref}:${p.instanceId}}}`,{});assert.doesNotMatch(shown,/liuchao\.character\.|\{\{ref:/);}});

test('plain negative laying-down wording cannot choose yielding',()=>{for(const n of ['01','05']){const c=contract(n),s=core.beginScene(c).state;assert.notEqual(rec.recognizeByRules(c,s,'我不放下刀',{})?.goal,'yield_guard');}});
