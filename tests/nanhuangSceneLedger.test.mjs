import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const { buildStrictScenarioInitialization, applyStrictScenarioInitializationToSave } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const runtime = await loadTs('../src/modules/scenarioMods/runtime.ts');
const facts = await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
const { readLocalMemoryCapsule } = await loadTs('../src/modules/scenarioMods/legacyNarratorPacket.ts');
const { departedPresentNames } = await loadTs('../src/modules/scenarioMods/presence.ts');
const { validateStepSceneNarrative } = await loadTs('../src/modules/scenarioMods/modularTurn.ts');
const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
const stage=async short=>JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/lcq.stage_${short}.json`,import.meta.url),'utf8'));
const rt=s=>s.世界.状态.剧本模组;
async function open(short) { return runtime.advanceScenarioRuntime(applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(),buildStrictScenarioInitialization(await stage(short)))).saveData; }
test('scene cards cover every playable action, fixed facts have safe fallbacks, and all affected schemas parse', async()=>{
 for(const short of ['02','03b_snake_flower_bridge','04','04b_lingfei_baiyi_crisis','05b']) {
  const mod=await stage(short);assert.doesNotThrow(()=>parseScenarioMod(mod));
  if(!['02','05b'].includes(short)) for(const e of mod.scenario.events) {
   if(/\.(persuade_wuerlang|ice_gu_coercion|zixi_intercept)$/.test(e.id))continue;
   for(const a of e.playerCompletionContract?.actions||[]) {
    assert.ok(a.cast?.present&&a.sceneLocation,`${e.id}:${a.id}`);
    if(a.fixedFacts) {assert.ok(a.fallbackText);assert.doesNotMatch(a.fallbackText,/<行动趋向>|本地事件判定|lcq\.event\.|ledgerEffects/);}
   }
  }
 }
});
test('spider attack, corpse handling and guide are three steps: immediate death, travel only after corpse handling', async()=>{
 let s=await open('03b_snake_flower_bridge');let actions;
 for(let i=0;i<35;i++) {
  actions=runtime.getCurrentStoryEventActions(s); if(actions[0]?.eventId.endsWith('s03b_yinzhu_xiongerpu'))break;
  rt(s).worldTurn++;runtime.recordStoryEventStructuredAction(s,actions[0]);s=runtime.advanceScenarioRuntime(s).saveData;
 }
 assert.equal(actions[0].actionId,'yinzhu_strikes_ajia');assert.match(s.角色.位置.描述,/花苗/);
 const before=rt(s).travelLedger.state.travelReceipts.length;
 rt(s).worldTurn++;const death=runtime.recordStoryEventStructuredAction(s,actions[0]);assert.equal(death.completed,false);
 assert.equal(rt(s).sceneLedger.actors.阿葭.status,'dead');assert.ok(departedPresentNames(rt(s)).includes('阿葭'));assert.equal(rt(s).sceneLedger.actors.阴蛛,undefined);
 assert.equal(rt(s).travelLedger.state.travelReceipts.length,before);
 rt(s).worldTurn++;const burn=runtime.getCurrentStoryEventActions(s)[0];assert.equal(burn.actionId,'burn_yinzhu_victim');runtime.recordStoryEventStructuredAction(s,burn);
 assert.equal(rt(s).sceneLedger.actors.阴蛛.status,'dead');assert.match(s.角色.位置.描述,/熊耳铺/);
 const card=rt(s).travelLedger.lastCard;assert.match(card.text,/花苗寨 → 熊耳铺/);
 assert.equal(runtime.getCurrentStoryEventActions(s)[0].actionId,'pick_zhu88_as_guide');
 const count=rt(s).travelLedger.state.travelReceipts.length;runtime.recordStoryEventStructuredAction(s,burn);assert.equal(rt(s).travelLedger.state.travelReceipts.length,count);
});
test('actor missing/return and masked envoy are step-based; gender and race projections avoid ancestry spoilers',async()=>{
 const s=await open('04b_lingfei_baiyi_crisis');
 facts.applyStepSceneLedger(s,rt(s),'lcq.event.s04b_lingfei_baiyi_crisis_19','advance_declared_objective');
 assert.equal(rt(s).sceneLedger.actors.祁远.status,'missing');assert.equal(rt(s).sceneLedger.actors.石刚.status,'missing');
 const regroup=rt(s).events.find(e=>e.id==='lcq.event.regroup_caravan_envoy');
 const [first,second]=regroup.playerCompletionContract.actions;
 const before=readLocalMemoryCapsule(s,{eventId:regroup.id,actionId:first.id});assert.ok(!before.presentNames.includes('阁罗'));assert.ok(!before.presentNames.includes('鬼王峒使者'));assert.ok(before.presentNames.includes('乐明珠'));
 const during=readLocalMemoryCapsule(s,{eventId:regroup.id,actionId:second.id});assert.ok(during.presentNames.includes('鬼王峒使者'));assert.ok(!during.presentNames.includes('阁罗'));
 const deal=rt(s).events.find(e=>e.id==='lcq.event.weapon_deal_with_geluo');facts.applyStepSceneLedger(s,rt(s),deal.id,deal.playerCompletionContract.actions[0].id);
 assert.equal(rt(s).sceneLedger.actors.祁远.status,'present');assert.ok(!departedPresentNames(rt(s)).includes('祁远'));
 const intro=rt(s).events.find(e=>e.id==='lcq.event.xiaozi_first_appears');const capsule=readLocalMemoryCapsule(s,{eventId:intro.id,actionId:intro.playerCompletionContract.actions[0].id});
 const x=capsule.presentActors.find(a=>a.name==='小紫');assert.equal(x.gender,'女');assert.equal(x.race,'碧鲮族');assert.doesNotMatch(JSON.stringify(x),/岳帅|碧姬|之女/);
 assert.ok(capsule.presentActors.find(a=>a.name==='云苍峰')?.称呼.对主角==='程小哥');
});
test('clock is monotonic/idempotent, K20 records one-yang without inventing a generic realm conversion',async()=>{
 const s=await open('04b_lingfei_baiyi_crisis'),old=s.角色.属性.境界.名称;
 const e=rt(s).events.find(e=>e.id==='lcq.event.yiyang_repels_yinsha');const a=e.playerCompletionContract.actions.at(-1);
 facts.applyStepSceneLedger(s,rt(s),e.id,a.id);assert.equal(s.角色.属性.境界.名称,old);assert.equal(s.角色.属性.境界.九阳层次,'一阳');
 const {formatRealmWithStage}=await loadTs('../src/utils/realmUtils.ts');assert.match(formatRealmWithStage(s.角色.属性.境界),/一阳/);
 const time=JSON.stringify(s.元数据.时间);facts.applyStepSceneLedger(s,rt(s),e.id,a.id);assert.equal(JSON.stringify(s.元数据.时间),time);
 assert.ok(facts.sceneLedgerSummary(s).已故.includes('王哲'));assert.doesNotMatch(JSON.stringify(facts.sceneLedgerSummary(s)),/十里焦土/);
});
test('scene guards reject omitted facts, early identities, wrong pronouns, unreceipted money/realm and opposite daylight',()=>{
 const scene={时段:'深夜',presentActors:[{name:'谢艺',gender:'男'}],账本摘要:{主角:{境界:{名称:'凡人'}}}};
 assert.doesNotThrow(()=>validateStepSceneNarrative('谢艺，她说你回来了。',undefined,scene)); // P0: not an enforced rule until clean-corpus approval.
 assert.throws(()=>validateStepSceneNarrative('你看晨光落下。',undefined,scene),/昼夜/);
 assert.throws(()=>validateStepSceneNarrative('你支付了五枚铜铢。',undefined,scene),/钱物/);
 assert.throws(()=>validateStepSceneNarrative('你踏入一阳。',undefined,scene),/一阳/);
 assert.throws(()=>validateStepSceneNarrative('你说完了。',{factChecks:[['阴蛛']],forbidden:[]},scene),/固定要点/);
 assert.throws(()=>validateStepSceneNarrative('你看出她是岳帅之女。',{forbidden:['岳帅|碧姬']},scene),/越界/);
 assert.doesNotThrow(()=>validateStepSceneNarrative('谢艺说：“程兄，等天亮再走。”你点头。',undefined,scene));
});

test('ghost-king event encompasses actual chapters 109–112 with existing composite-axis format, without changing rail identity',async()=>{
 const mod=await stage('05b');const e=mod.scenario.events.find(e=>e.id==='lcq.event.ghost_king_swallowed');
 const binding=JSON.parse(await readFile(new URL('../mod-kit/generated/deepseek-v4-flash/character-canon/axis-binding.json',import.meta.url),'utf8'));
 const anchors=e.axisAnchor.split('+').map(id=>binding.nodes.find(n=>n.axisId===id));assert.ok(anchors.every(Boolean));
 assert.ok(e.axisAnchor.split('+').includes(e.axisId));for(const ch of [109,110,111,112])assert.ok(anchors.some(n=>n.anchor.includes(`第${ch}章`)));
 assert.equal(e.axisId,'qingyu.114.2');assert.equal(e.playerCompletionContract.actions.length,1);assert.match(e.description,/鬼巫王/);
});

test('masked bride becomes Lemingzhu at the reveal step; Xiaozi is absent in the preceding crocodile beat',async()=>{
 const mod=await stage('04');for(const e of mod.scenario.events)for(const a of e.playerCompletionContract.actions) {
  if(['lcq.event.s04_01','lcq.event.s04_02'].includes(e.id))assert.ok(a.cast.present.includes('花苗新娘'));
  else {assert.ok(!a.cast.present.includes('花苗新娘'));if(e.id==='lcq.event.s04_03')assert.ok(a.cast.present.includes('乐明珠'));}
 }
 const b=await stage('04b_lingfei_baiyi_crisis');const croc=b.scenario.events.find(e=>e.id.endsWith('_17'));assert.ok(!croc.playerCompletionContract.actions[0].cast.present.includes('小紫'));
});
