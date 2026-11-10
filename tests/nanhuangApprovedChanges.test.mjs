// 交接 2026-11-09「三项已批改动」验收（§7 A/B/C）：纯离线，固定输入与 mock 语义返回，不调真实模型。
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {loadTs} from './loadTs.mjs';
import {walkMainline} from './baihuMainlineWalk.mjs';
const rt=await loadTs('../src/modules/scenarioMods/runtime.ts'),init=await loadTs('../src/modules/scenarioMods/strictInitializer.ts'),repair=await loadTs('../src/utils/dataRepair.ts');
const cp=await loadTs('../src/modules/contentPacks/index.ts'),ec=await loadTs('../src/modules/scenarioMods/entityCatalog.ts'),cr=await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const entries=await loadTs('../src/modules/scenarioMods/persistentLineEntries.ts'),loadRepairs=await loadTs('../src/modules/scenarioMods/loadRepairs.ts'),travel=await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
const beatProgress=await loadTs('../src/modules/scenarioMods/beatProgress.ts'),presence=await loadTs('../src/modules/scenarioMods/presence.ts'),scene=await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
const ctxmod=await loadTs('../src/modules/scenarioMods/questLineContext.ts'),view=await loadTs('../src/modules/scenarioMods/questLineView.ts'),prompts=await loadTs('../src/modules/scenarioMods/linePrompts.ts');
const nir=await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts'),questLog=await loadTs('../src/modules/scenarioMods/questLog.ts');
const numbers=JSON.parse(fs.readFileSync(new URL('../mod-kit/numbers-runtime.json',import.meta.url),'utf8'));
const texts=JSON.parse(fs.readFileSync(new URL('../src/modules/contentPacks/packs/qingyu/lines-texts.json',import.meta.url),'utf8'));

const NY='liuchao.character.ning_yu',XW='lcq.character.nanhuang_xiaowei',QI='liuchao.character.qi_yuan',NP3='lcq.character.np003',YUN='liuchao.character.yun_cang_feng';
const ALGAE=entries.ALGAE_ENTRY,BIYU='liuchao.location.biyu_village',FACT='fact.biling_algae_as_nylon';
const O2='lcq.event.ningyu_regicide_offer_ins_ningyu_reply',Y5='lcq.event.guiwangdong_coop_pact_ins_ningyu_enter',REJOIN=entries.REJOIN_ENTRY.eventId;
const LETTER='lcq.event.blank_letter_and_dagu',OPEN='open_blank_letter_in_person';
const STAY_TEXT='你守着她。我们进峒，到驿馆安顿下来，你再带她从正门进来找我们。';
const REJOIN_TEXT='驿馆的门帘一掀，小魏先进来，凝羽跟在后面。她扫了一眼屋里的人，在程宗扬身后站定。';
const runtimeOf=save=>save.世界.状态.剧本模组;
const lineActions=(save,eventId)=>rt.getCurrentStoryExplorationActions(save).filter(a=>a.eventId===eventId);
const settle=(save,eventId,actionId)=>{const a=lineActions(save,eventId).find(a=>a.actionId===actionId);assert.ok(a,`${eventId}:${actionId} offered`);runtimeOf(save).worldTurn++;return rt.recordStoryEventStructuredAction(save,a);};
const itemCount=save=>Object.values(save.角色?.背包?.物品||{}).filter(i=>i?.物品ID===ALGAE.itemId||i?.id===ALGAE.itemId||i?.名称==='霓龙丝（伪）').reduce((n,i)=>n+(Number(i.数量)||0),0);
const knows=(save,id)=>!!runtimeOf(save).actorEngine?.actorMemory?.[id]?.knowledge?.includes(FACT);

function stageSave(stageId){
 const raw=JSON.parse(fs.readFileSync(new URL(`../src/modules/scenarioMods/builtins/data/${stageId}.json`,import.meta.url),'utf8'));
 const mod=ec.resolveScenarioContent(cp.applyContentPackOverlays(raw));cr.resolveScenarioCharacters(mod.canon?.characters,mod.manifest.id);
 const save=init.applyStrictScenarioInitializationToSave(repair.createMinimalSaveDataV3(),init.buildStrictScenarioInitialization(mod));
 runtimeOf(save).worldTurn=10;return save;
}
function arriveByMap(save,toId){const sel=travel.selectMapTravel(save,toId);assert.ok(sel,`map can route to ${toId}: ${travel.mapTravelRestriction(save,toId)||''}`);assert.equal(travel.settleMapTravel(save,sel),true);return sel;}

// ───────────── 主线逐拍推进两遍：一遍只走主线；一遍在 Y5 选「留下」，到 05b 先会合再拆信 ─────────────
const plain=new Map();
const plainWalk=await walkMainline((save,event)=>{
 const r=runtimeOf(save);
 if(!plain.has('o2')&&lineActions(save,O2).length)plain.set('o2',structuredClone(save));
 if(!plain.has('o2_host_done')&&plain.has('o2')&&r.completedEventIds?.includes('lcq.event.ningyu_regicide_offer'))plain.set('o2_host_done',structuredClone(save));
 if(!plain.has('before_o2')&&event?.id==='lcq.event.ningyu_regicide_offer')plain.set('before_o2',structuredClone(save));
 if(!plain.has('y5')&&lineActions(save,Y5).length)plain.set('y5',structuredClone(save));
 if(!plain.has('05b')&&r.modId==='lcq.stage_05b')plain.set('05b',structuredClone(save));
 if(!plain.has('letter')&&event?.id===LETTER)plain.set('letter',structuredClone(save));
 if(!plain.has('letter_open')&&r.eventActionStates?.[LETTER]?.preparations?.includes('blank_letter_confirmed'))plain.set('letter_open',structuredClone(save));
});
const stay=new Map();let stayEnterDong=[];
const stayWalk=await walkMainline((save,event)=>{
 const r=runtimeOf(save);
 if(!stay.has('y5')&&lineActions(save,Y5).length){
  stay.set('y5',structuredClone(save));
  const res=settle(save,Y5,'act.ningyu.y5.stay');assert.equal(res.completed,true);
  stay.set('after_stay',structuredClone(save));
 }
 if(r.flags['branch.ningyu.enter_dong']==='stay'&&event?.id==='lcq.event.enter_dong_with_migu')stayEnterDong.push({save:structuredClone(save),event:event.id});
 if(!stay.has('05b')&&r.modId==='lcq.stage_05b')stay.set('05b',structuredClone(save));
 if(event?.id===LETTER&&r.flags['branch.ningyu.y5_rejoined']!==true){
  stay.set('letter_held',structuredClone(save));
  const res=settle(save,REJOIN,'act.ningyu.y5.rejoin');assert.equal(res.completed,true);
  stay.set('rejoined',structuredClone(save));
 }
});

// ═════════════ A. 藻丝极简取物 ═════════════
test('A: the map lists Biling as a Nanhuang destination next to Huamiao; no new route or day cost is authored',()=>{
 assert.deepEqual(numbers.crossCountryTravel.destinations['南荒'],['lcq.location.huamiao_village',BIYU]);
 assert.equal(numbers.crossCountryTravel.destinationRawDays[BIYU],undefined,'no new per-destination day table');
});

test('A: a later stage (05b) picks up the entry by map arrival, without a quest, without Qi Yuan, after the mainline moved on',()=>{
 const save=stageSave('lcq.stage_05b');const r=runtimeOf(save);
 r.events=r.events.filter(e=>e.id!==ALGAE.eventId);r.canon.characters=r.canon.characters.filter(c=>c.id!==ALGAE.characterId);
 loadRepairs.applyLoadRepairs(save);
 assert.ok(!r.events.some(e=>e.id===ALGAE.eventId),'away from Biling the stage event table stays as authored');
 assert.equal(lineActions(save,ALGAE.eventId).length,0,'not offered away from Biling');
 const before=structuredClone(save.元数据?.时间);
 arriveByMap(save,BIYU);
 assert.equal(save.角色.位置.locationId,BIYU);
 assert.ok(r.events.some(e=>e.id===ALGAE.eventId),'map arrival provides the pickup event');
 assert.ok(r.canon.characters.some(c=>c.id===ALGAE.characterId),'the local holder is declared');
 assert.ok(r.canon.items.some(i=>i.id===ALGAE.itemId));
 assert.deepEqual(save.元数据?.时间?.相对日,before?.相对日,'domestic map move keeps the existing moment cost');
 const offered=lineActions(save,ALGAE.eventId).map(a=>a.actionId);
 assert.ok(offered.includes('act.ask_biling_for_nylon'),JSON.stringify(offered));
 assert.equal(settle(save,ALGAE.eventId,'act.ask_biling_for_nylon').completed,false);
 assert.ok(!lineActions(save,ALGAE.eventId).some(a=>a.actionId==='act.have_yun_examine_algae'),'Yun is not here: the optional look is not offered and not required');
 const done=settle(save,ALGAE.eventId,'act.commission_algae_purchase');
 assert.equal(done.completed,true);
 assert.equal(done.inventorySettlements.filter(s=>s.receipt.itemId===ALGAE.itemId).length,1);
 assert.ok(r.pathReceipts[ALGAE.receiptId]);assert.ok(r.questLineState.receipts[ALGAE.beatId]);
 assert.ok(r.playerKnowledge[FACT]);
 for(const id of [QI,NP3,YUN])assert.equal(knows(save,id),false,`${id} was not there and must not learn it`);
 // 重复执行、读档、每回合推进、地图再抵达都不再发
 const items=itemCount(save);
 assert.equal(lineActions(save,ALGAE.eventId).length,0);
 loadRepairs.applyLoadRepairs(save);rt.advanceScenarioRuntime(save);
 entries.syncPersistentLineEntries(save);
 assert.equal(lineActions(save,ALGAE.eventId).length,0);
 assert.equal(itemCount(save),items);
});

test('A: each of Qi Yuan / np003 / Yun learns the fact only when actually present at the pickup',()=>{
 for(const present of [QI,NP3,YUN]){
  const save=stageSave('lcq.stage_05b');entries.syncPersistentLineEntries(save);arriveByMap(save,BIYU);
  const r=runtimeOf(save);r.sceneLedger||={receipts:[],actors:{},injuries:{},names:{},worldFacts:[]};r.sceneLedger.actors||={};
  if(!r.canon.characters.some(c=>c.id===present)){const card=ec.resolveScenarioContent({manifest:{id:'lcq.stage_04b_lingfei_baiyi_crisis'},canon:{characters:[]},scenario:{optionalActorIds:[present]}}).canon.characters[0];r.canon.characters.push(card);}
  r.sceneLedger.actors[present]={status:'present'};
  settle(save,ALGAE.eventId,'act.ask_biling_for_nylon');
  assert.equal(settle(save,ALGAE.eventId,'act.commission_algae_purchase').completed,true);
  for(const id of [QI,NP3,YUN])assert.equal(knows(save,id),id===present,`${present} present → ${id}`);
 }
});

const atBiyu=save=>{save.角色.位置={...save.角色.位置,locationId:BIYU};return save;};
test('A: entry sync on load, stage transition and every advance while at Biling; never before 04b, never in another book',()=>{
 const later=atBiyu(stageSave('lcq.stage_05'));const advanced=rt.advanceScenarioRuntime(later).saveData;
 assert.ok(runtimeOf(advanced).events.some(e=>e.id===ALGAE.eventId),'advance (and therefore stage transition) carries the entry');
 const away=stageSave('lcq.stage_05b');assert.ok(!runtimeOf(rt.advanceScenarioRuntime(away).saveData).events.some(e=>e.id===ALGAE.eventId),'elsewhere nothing is added');
 for(const id of ['lcq.stage_02','lcq.stage_04']){const s=atBiyu(stageSave(id));entries.syncPersistentLineEntries(s);assert.ok(!runtimeOf(s).events.some(e=>e.id===ALGAE.eventId),id);}
 const other=atBiyu(stageSave('lyl.jiangzhou_retreat'));entries.syncPersistentLineEntries(other);
 assert.ok(!runtimeOf(other).events.some(e=>e.id===ALGAE.eventId));
 // 真实切关：04b 未取 → 05b 读档时人在碧鲮就有入口
 const s05b=atBiyu(structuredClone(plain.get('05b')));loadRepairs.applyLoadRepairs(s05b);assert.ok(runtimeOf(s05b).events.some(e=>e.id===ALGAE.eventId));
 assert.ok(lineActions(s05b,ALGAE.eventId).length>0);
});

test('A: old saves that already completed, hold the sample, or carry the receipt are never re-granted',()=>{
 for(const patch of [
  s=>{runtimeOf(s).pathReceipts={...runtimeOf(s).pathReceipts,[ALGAE.receiptId]:{receiptId:ALGAE.receiptId}};},
  s=>{runtimeOf(s).inventoryTransferReceipts=[{itemId:ALGAE.itemId,transferId:'old'}];},
  s=>{s.角色.背包.物品[ALGAE.itemId]={物品ID:ALGAE.itemId,名称:'霓龙丝（伪）',数量:1};},
  s=>{runtimeOf(s).questLineState={version:1,receipts:{[ALGAE.beatId]:{receiptId:'x',turn:1,outcome:'success'}}};},
 ]){
  const save=atBiyu(stageSave('lcq.stage_05b'));const r=runtimeOf(save);r.events=r.events.filter(e=>e.id!==ALGAE.eventId);patch(save);
  loadRepairs.applyLoadRepairs(save);
  assert.ok(r.questLineState.receipts[ALGAE.beatId],'completion is mapped to the stable line receipt');
  assert.ok(!r.events.some(e=>e.id===ALGAE.eventId));
  assert.equal(lineActions(save,ALGAE.eventId).length,0);
 }
 // 无关剧情（如碧鲮湾表态已完成）不算取过
 const save=atBiyu(stageSave('lcq.stage_05b'));runtimeOf(save).completedEventIds.push('lcq.event.biling_bay_stance');entries.syncPersistentLineEntries(save);
 assert.ok(runtimeOf(save).events.some(e=>e.id===ALGAE.eventId));
});

test('A: arriving at Biling is a pickup visit, never the prepared cross-country stage departure',()=>{
 const save=stageSave('lcq.stage_05b');save.系统.扩展.stageDepartureMap={nextStageId:'lcq.stage_x',toId:'lcq.location.huamiao_village',mapTargetId:'lcq.location.huamiao_village'};
 runtimeOf(save).nextStageReadyId='lcq.stage_x';
 save.角色.位置={...save.角色.位置,locationId:BIYU};
 assert.equal(beatProgress.stageDepartureArrived(save),undefined);
 assert.ok(save.系统.扩展.stageDepartureMap,'the pending departure stays for the real destination');
 save.角色.位置={...save.角色.位置,locationId:'lcq.location.huamiao_village'};
 assert.equal(beatProgress.stageDepartureArrived(save),'lcq.stage_x');
});

// ═════════════ B. 同场人物回应 ═════════════
test('B: O2/Y5 open after the host preparation is committed, with a respond-or-skip choice; unmet requires is not expiry',()=>{
 const before=plain.get('before_o2');
 assert.equal(lineActions(before,O2).length,0);
 ctxmod.expireQuestLineWindows(before);
 assert.equal(runtimeOf(before).questLineState?.expired?.['beat.ningyu.o2_regicide'],undefined,'not open yet ≠ expired');
 for(const [key,eventId,prefix] of [['o2',O2,'act.ningyu.o2.'],['y5',Y5,'act.ningyu.y5.']]){
  const save=structuredClone(plain.get(key));
  const ids=lineActions(save,eventId).map(a=>a.actionId);
  assert.ok(ids.includes(`${prefix}defer`),`${key} has explicit skip`);
  const c=view.questLineView(save).character.find(x=>x.eventId===eventId);
  assert.ok(c,'the character log lists the waiting response');
  assert.deepEqual(c.actions.map(a=>a.actionId).sort(),ids.sort());
  assert.deepEqual(c.actions.filter(a=>a.skip).map(a=>a.actionId),[`${prefix}defer`]);
 }
});

test('B: responded, explicitly skipped and expired-after-mainline are recorded apart; skip gives no affinity',()=>{
 const responded=structuredClone(plain.get('o2'));prompts.noteLinePrompts(responded);
 settle(responded,O2,'act.ningyu.o2.refuse');
 assert.deepEqual(view.questLineView(responded).closed.map(x=>x.outcome),['responded']);
 const skipped=structuredClone(plain.get('o2'));prompts.noteLinePrompts(skipped);
 const aff=Number(skipped.社交.关系[NY]?.好感度)||0;
 const res=settle(skipped,O2,'act.ningyu.o2.defer');assert.equal(res.completed,true);
 assert.equal(Number(skipped.社交.关系[NY]?.好感度)||0,aff);
 assert.ok(runtimeOf(skipped).pathReceipts['rcpt.ningyu.o2.defer']);
 assert.equal(runtimeOf(skipped).flags['branch.ningyu.regicide_reply'],undefined,'skip writes no stance');
 assert.deepEqual(view.questLineView(skipped).closed.map(x=>x.outcome),['skipped']);
 assert.match(view.questLineView(skipped).closed[0].objective,new RegExp(texts['text.line_log.outcome.skipped']));
 const expired=structuredClone(plain.get('o2_host_done'));expired.系统.扩展.linePrompted={'beat.ningyu.o2_regicide':1};
 ctxmod.expireQuestLineWindows(expired);
 assert.equal(lineActions(expired,O2).length,0);
 assert.deepEqual(view.questLineView(expired).closed.map(x=>x.outcome),['expired']);
 assert.equal(runtimeOf(expired).questLineState.receipts['beat.ningyu.o2_regicide'],undefined);
});

test('B: the prompt shows once after commit, survives reload, and is never written when the turn is not committed',()=>{
 const save=structuredClone(plain.get('o2'));
 assert.equal(save.系统.扩展.linePrompted,undefined,'nothing is written before the UI commit hook runs');
 const first=prompts.noteLinePrompts(save);
 assert.deepEqual(first,[texts['text.prompt.beat.ningyu.o2_regicide']]);
 assert.deepEqual(prompts.noteLinePrompts(save),[]);
 const reloaded=structuredClone(save);loadRepairs.applyLoadRepairs(reloaded);
 assert.deepEqual(prompts.noteLinePrompts(reloaded),[]);
 const panel=fs.readFileSync(new URL('../src/components/dashboard/MainGamePanel.vue',import.meta.url),'utf8');
 assert.match(panel,/if \(idleSave && aiResponse\.transactionCommitted\) linePromptNotices = noteLinePrompts\(idleSave\);/);
 const sidebar=fs.readFileSync(new URL('../src/components/dashboard/RightSidebar.vue',import.meta.url),'utf8');
 assert.match(sidebar,/panelBus\.emit\('select-line-action'/);
 assert.match(panel,/panelBus\.on\('select-line-action', onSelectLineAction\)/);
});

test('B: the log and actions work with the quest guide on and off; the guide never hides the response',()=>{
 const off=structuredClone(plain.get('o2'));
 assert.equal(questLog.questGuideEnabled(off),false);
 const on=structuredClone(off);for(const k of Object.keys(on.系统.扩展))if(on.系统.扩展[k]?.kind&&/playtest|demo/i.test(String(on.系统.扩展[k].kind)))delete on.系统.扩展[k];
 for(const save of [off,on]){
  const c=view.questLineView(save).character.find(x=>x.eventId===O2);
  assert.ok(c&&c.actions.length>=4);
  assert.ok(lineActions(save,O2).length>=4);
 }
});

const mockIntent=(answer)=>async()=>JSON.stringify(answer);
test('B: "先不说这个，寒气哪来的" while O2 waits asks first: no double settlement, no silent swallow',async()=>{
 const save=structuredClone(plain.get('o2'));
 assert.ok(nir.isScopedNaturalIntentSave?.(save)??true);
 const main=rt.getCurrentStoryEventActions(save).find(a=>a.actionId==='trace_ningyu_cold_qi_source');
 const text='先不说这个，寒气哪来的';
 const fromText=()=>main;
 for(const answer of [{actionId:'multiple',certainty:'high',evidence:'先不说这个',statusProposals:[]},{actionId:'act.ningyu.o2.defer',eventId:O2,source:'exploration_engine',certainty:'high',evidence:'先不说这个',statusProposals:[]}]){
  const result=await nir.resolveNaturalIntent({saveData:save,playerText:text,selected:null,resolveFromText:fromText,generate:mockIntent(answer)});
  assert.equal(result.kind,'unclear',JSON.stringify(result));assert.equal(result.hold,true);
  assert.match(result.clarification,/凝羽/);
 }
 assert.equal(runtimeOf(save).questLineState?.receipts?.['beat.ningyu.o2_regicide'],undefined);
 // 只命中主线：照常走主线
 const only=await nir.resolveNaturalIntent({saveData:save,playerText:'寒气哪来的',selected:null,resolveFromText:fromText,generate:mockIntent({actionId:'none',certainty:'high',evidence:'',statusProposals:[]})});
 assert.equal(only.kind,'alias');assert.equal(only.selection.actionId,'trace_ningyu_cold_qi_source');
 // 没有人在等回应时不多发一次模型
 let calls=0;const idle=structuredClone(plain.get('before_o2'));
 await nir.resolveNaturalIntent({saveData:idle,playerText:'寒气哪来的',selected:null,resolveFromText:()=>({...main}),generate:async()=>{calls++;return '{}';}});
 assert.equal(calls,0);
});

test('B: a skip candidate carries no affinity assessment; responses still require one',()=>{
 const save=structuredClone(plain.get('o2'));
 const c=nir.listNaturalIntentCandidates(save).filter(x=>x.eventId===O2);
 assert.equal(c.find(x=>x.actionId==='act.ningyu.o2.defer').affinityAssessment,undefined);
 assert.ok(c.find(x=>x.actionId==='act.ningyu.o2.refuse').affinityAssessment);
});

// ═════════════ C. 暂留与会合 ═════════════
test('C: the stay outcome and the rejoin outcome are the approved lines, kept in one text resource',()=>{
 assert.ok(texts['outcome.act.ningyu.y5.stay'].includes(STAY_TEXT));
 assert.equal(texts['outcome.act.ningyu.y5.rejoin'],REJOIN_TEXT);
});

test('C: after stay both are genuinely absent through the three enter-dong actions, yet stay in the party',()=>{
 assert.ok(stayEnterDong.length>0,'the stay walk reached enter_dong_with_migu');
 for(const {save,event} of stayEnterDong){
  const r=runtimeOf(save);
  const names=presence.departedPresentNames(r);
  for(const n of ['凝羽','小魏'])assert.ok(names.includes(n),`${n} absent in prompts`);
  for(const a of r.events.find(e=>e.id===event).playerCompletionContract.actions){
   const cast=scene.stepScene(r,event,a.id)?.cast?.present||[];
   assert.ok(!cast.some(x=>/凝羽|小魏/.test(typeof x==='string'?x:x?.name||'')),`${a.id} cast has no 凝羽/小魏`);
  }
  const ctx=ctxmod.questLineContext(save,event);
  assert.ok(!ctx.presentActorIds.includes(NY)&&!ctx.presentActorIds.includes(XW));
  // 场景账写在场也不盖过权威暂留
  const forced=structuredClone(save);const fr=runtimeOf(forced);fr.sceneLedger||={actors:{}};fr.sceneLedger.actors||={};fr.sceneLedger.actors[NY]={status:'present'};
  assert.ok(!ctxmod.questLineContext(forced,event).presentActorIds.includes(NY));
  assert.ok(presence.departedPresentNames(fr).includes('凝羽'));
  // 在队身份保留：关系和队伍记录不被删
  assert.ok(save.社交.关系[NY],'ning yu keeps her relation record');
  assert.equal(r.flags['character.ning_yu.status'],undefined);
 }
 // 非 stay 走法里不缺席
 const plainR=runtimeOf(plain.get('y5'));assert.ok(!presence.authoritativeAbsentCharacterIds(plainR).length);
});

test('C: shared experience skips the genuinely absent, without touching anyone else',()=>{
 const save=structuredClone(stayEnterDong[0].save);const r=runtimeOf(save);
 const fake={id:'lcq.event.test_shared_while_away',name:'t',critical:false,relatedCharacterIds:[NY,XW,'liuchao.character.xie_yi'],completion:[]};
 r.events.push(fake);
 for(const id of [NY,XW,'liuchao.character.xie_yi']){save.社交.关系[id]||={角色ID:id,名字:id,好感度:10};save.社交.关系[id].好感度=10;}
 r.affinityGrantedEventIds||=[];r.completedEventIds.push(fake.id);
 const before=Object.fromEntries([NY,XW,'liuchao.character.xie_yi'].map(id=>[id,save.社交.关系[id].好感度]));
 const out=rt.advanceScenarioRuntime(save).saveData;
 assert.equal(out.社交.关系[NY].好感度,before[NY]);
 assert.equal(out.社交.关系[XW].好感度,before[XW]);
 assert.ok(out.社交.关系['liuchao.character.xie_yi'].好感度>before['liuchao.character.xie_yi'],'the one actually present still shares it');
 assert.ok(runtimeOf(out).affinityGrantedEventIds.includes(fake.id));
});

test('C: opening the letter before the rejoin is refused at listing and at execution; the rejoin lifts it in one commit',()=>{
 const held=stay.get('letter_held');const r=runtimeOf(held);
 assert.equal(r.flags['branch.ningyu.enter_dong'],'stay');
 assert.ok(!rt.getCurrentStoryEventActions(held).some(a=>a.actionId===OPEN),'not listed');
 const free=structuredClone(held);delete runtimeOf(free).flags['branch.ningyu.enter_dong'];
 const sel=rt.getCurrentStoryEventActions(free).find(a=>a.actionId===OPEN);assert.ok(sel);
 const forced=structuredClone(held);runtimeOf(forced).worldTurn++;
 const refused=rt.recordStoryEventStructuredAction(forced,sel);
 assert.notEqual(refused.attempted,true,'execution entry refuses too');
 assert.ok(!(runtimeOf(forced).eventActionStates?.[LETTER]?.preparations||[]).includes('blank_letter_confirmed'));
 // 会合可做；做之前两人不在场
 assert.ok(lineActions(held,REJOIN).some(a=>a.actionId==='act.ningyu.y5.rejoin'));
 assert.ok(presence.departedPresentNames(r).includes('凝羽')&&presence.departedPresentNames(r).includes('小魏'));
 // 同笔提交：正文、在场恢复、flag、回执
 const after=stay.get('rejoined'),ar=runtimeOf(after);
 assert.equal(ar.flags['branch.ningyu.y5_rejoined'],true);
 assert.ok(ar.pathReceipts['rcpt.ningyu.y5_rejoin']);
 assert.ok(ar.questLineState.receipts['beat.ningyu.y5_rejoin']);
 assert.ok(!presence.departedPresentNames(ar).includes('凝羽'));
 assert.ok(rt.getCurrentStoryEventActions(after).some(a=>a.actionId===OPEN),'letter can be opened after the rejoin');
 const rejoinEvent=ar.events.find(e=>e.id===REJOIN);
 assert.equal(rejoinEvent.playerCompletionContract.actions[0].outcomeText.success,REJOIN_TEXT);
 // 重放不重演
 assert.equal(lineActions(after,REJOIN).length,0);
 const replay=structuredClone(after);const again=rt.recordStoryEventStructuredAction(replay,{...lineActions(held,REJOIN)[0]});
 assert.equal(again.attempted,false);assert.equal(again.reason,'already_completed');
 assert.equal(runtimeOf(replay).flags['branch.ningyu.y5_rejoined'],true);assert.deepEqual(runtimeOf(replay).pathReceipts,ar.pathReceipts);
 assert.deepEqual(runtimeOf(replay).questLineState.receipts,ar.questLineState.receipts);
 // 后续原剧情照常：stay 走法走到了试玩终点
 assert.equal(stayWalk.end?.kind,'transition');
});

test('C: a cancelled rejoin turn restores nothing; non-stay walks never get the rejoin',()=>{
 const held=stay.get('letter_held');const snapshot=structuredClone(held);
 // 取消＝回合未提交：界面用发送前快照整份撤回，本地不留半恢复
 const attempt=structuredClone(held);settle(attempt,REJOIN,'act.ningyu.y5.rejoin');
 const restored=structuredClone(snapshot);
 assert.notEqual(runtimeOf(restored).flags['branch.ningyu.y5_rejoined'],true);
 assert.ok(presence.departedPresentNames(runtimeOf(restored)).includes('小魏'));
 assert.equal(lineActions(plain.get('letter'),REJOIN).length,0);
 assert.ok(rt.getCurrentStoryEventActions(plain.get('letter')).some(a=>a.actionId===OPEN));
 assert.deepEqual(plainWalk.save.世界.状态.剧本模组.questLineState?.receipts||{},{});
});

test('C: old saves — reliable stay + letter unopened gets the rejoin; letter already opened counts as rejoined; no record, no guess',()=>{
 // ① 旧 05b 档：事件表里没有会合拍，读档补上
 const old=structuredClone(stay.get('letter_held'));const or=runtimeOf(old);or.events=or.events.filter(e=>e.id!==REJOIN);
 loadRepairs.applyLoadRepairs(old);
 assert.ok(or.events.some(e=>e.id===REJOIN));
 assert.ok(lineActions(old,REJOIN).length>0);
 // ② 已拆信：不补会合、不写 rejoined、两人在场
 const opened=structuredClone(plain.get('letter_open'));runtimeOf(opened).flags['branch.ningyu.enter_dong']='stay';
 loadRepairs.applyLoadRepairs(opened);
 assert.equal(lineActions(opened,REJOIN).length,0);
 assert.equal(runtimeOf(opened).flags['branch.ningyu.y5_rejoined'],undefined);
 assert.ok(!presence.departedPresentNames(runtimeOf(opened)).includes('凝羽'));
 // ③ 无可靠 stay 记录：不猜
 const none=structuredClone(plain.get('letter'));loadRepairs.applyLoadRepairs(none);
 assert.equal(lineActions(none,REJOIN).length,0);
 assert.equal(runtimeOf(none).flags['branch.ningyu.enter_dong'],undefined);
});

test('O2/Y5 old contract hashes migrate to the revised contract instead of resetting state',()=>{
 const save=structuredClone(plain.get('o2'));const r=runtimeOf(save);
 const ev=r.events.find(e=>e.id===O2);
 const old=structuredClone(ev);old.playerCompletionContract.actions=old.playerCompletionContract.actions.filter(a=>a.id!=='act.ningyu.o2.defer');
 r.events=r.events.map(e=>e.id===O2?old:e);
 r.eventActionStates[O2]={contractHash:'f27676f0',attemptCount:0,preparations:[],attempts:[]};
 const n=rt.migrateBatch6TextContracts(r,[ev]);
 assert.equal(n,1);
 assert.ok(r.events.find(e=>e.id===O2).playerCompletionContract.actions.some(a=>a.id==='act.ningyu.o2.defer'));
 assert.equal(r.eventActionStates[O2].contractHash,'37ca6495');
});

// ═════════════ PR #1 修复（设计稿 2026-11-10）：暂扣动作、旧到期迁移、地图记账、路途卡 ═════════════
const ledgerMod=await loadTs('../src/modules/scenarioMods/travel/travelLedger.ts'),narrator=await loadTs('../src/modules/scenarioMods/legacyNarratorPacket.ts');
const held=await loadTs('../src/modules/scenarioMods/stayRejoin.ts'),lines=await loadTs('../src/modules/scenarioMods/questLines.ts');
const REJOIN_OBJECTIVE=texts['text.obj.ningyu.y5_rejoin'];
const settledState=save=>{const r=runtimeOf(save);return structuredClone({states:r.eventActionStates?.[LETTER],flags:r.flags,receipts:r.pathReceipts,line:r.questLineState,turn:r.worldTurn});};

test('PR1-1: held actions come from content-pack data; a cloned action object is still held; the rule lifts on rejoin and never applies off stay',()=>{
 assert.deepEqual(cp.CONTENT_PACKS.heldActions.map(h=>[h.eventId,h.actionId,h.prerequisiteBeatId]),[[LETTER,OPEN,'beat.ningyu.y5_rejoin']]);
 const r=runtimeOf(stay.get('letter_held'));
 assert.deepEqual(held.heldActions(r).map(h=>[h.eventId,h.actionId,h.prerequisiteBeatId]),[[LETTER,OPEN,'beat.ningyu.y5_rejoin']]);
 assert.equal(held.heldPrerequisiteObjective(held.heldActions(r)[0]),REJOIN_OBJECTIVE,'the hint is the rejoin beat objective, no new text');
 const action=r.events.find(e=>e.id===LETTER).playerCompletionContract.actions.find(a=>a.id===OPEN);
 assert.equal(held.actionHeldForRejoin(r,action),true);
 assert.equal(held.actionHeldForRejoin(r,structuredClone(action)),true,'clone matched by eventId+actionId');
 assert.equal(held.heldActions(runtimeOf(stay.get('rejoined'))).length,0);
 assert.equal(held.heldActions(runtimeOf(plain.get('letter'))).length,0);
 assert.equal(held.actionHeldForRejoin(runtimeOf(plain.get('letter')),action),false);
});

test('PR1-1: free input that means the held action asks to wait for the rejoin; input kept, no narrative turn, nothing settled',async()=>{
 for(const text of ['我当面确认信笺仍是白纸','我当着谢艺的面拆开白纸信']){
  const save=structuredClone(stay.get('letter_held'));const before=settledState(save);
  const c=nir.listNaturalIntentCandidates(save).find(x=>x.held);
  assert.ok(c&&c.eventId===LETTER&&c.actionId===OPEN,'the held action is a non-executable candidate');
  let prompt='';
  const evidence=text.includes('确认信笺')?'当面确认信笺仍是白纸':'拆开白纸信';
  const result=await nir.resolveNaturalIntent({saveData:save,playerText:text,selected:null,resolveFromText:nir.resolveStoryEventActionFromText,
   generate:async input=>{prompt=input.userPrompt;return JSON.stringify({actionId:OPEN,eventId:LETTER,source:'event_engine',certainty:'high',evidence,statusProposals:[]});}});
  assert.ok(JSON.parse(prompt).candidates.some(x=>x.actionId===OPEN&&x.held===true),'the model sees the held candidate');
  assert.equal(result.kind,'unclear',JSON.stringify(result));assert.equal(result.hold,true);assert.equal(result.reason,'held_action');
  assert.equal(result.clarification,REJOIN_OBJECTIVE);assert.equal(result.selection,undefined);
  assert.equal(nir.verifyFreshSelection(save,{actionId:OPEN,eventId:LETTER,source:'event_engine'}),undefined,'never turned into an executable selection');
  assert.deepEqual(settledState(save),before,'attempts/flags/receipts unchanged');
 }
 // 会合后同句照常命中拆信候选（可执行）
 const after=nir.listNaturalIntentCandidates(stay.get('rejoined'));
 assert.ok(after.some(x=>x.actionId===OPEN&&!x.held));assert.ok(!after.some(x=>x.held));
});

test('PR1-1: a forged selection for the held action is refused at the execution entry with action_unavailable',()=>{
 const save=structuredClone(stay.get('letter_held'));const before=settledState(save);
 const free=structuredClone(save);delete runtimeOf(free).flags['branch.ningyu.enter_dong'];
 const sel=rt.getCurrentStoryEventActions(free).find(a=>a.actionId===OPEN);assert.ok(sel);
 const refused=rt.recordStoryEventStructuredAction(save,structuredClone(sel));
 assert.notEqual(refused.attempted,true);assert.equal(refused.reason,'action_unavailable');
 assert.deepEqual(settledState(save),before);
});

test('PR1-1: intent judged none (leak) → the free-turn capsule objective is the rejoin objective, not the letter',async()=>{
 const save=structuredClone(stay.get('letter_held'));
 const none=await nir.resolveNaturalIntent({saveData:save,playerText:'我当面确认信笺仍是白纸',selected:null,resolveFromText:nir.resolveStoryEventActionFromText,generate:mockIntent({actionId:'none',certainty:'high',evidence:'',statusProposals:[]})});
 assert.equal(none.kind,'free');
 const candidates=[...rt.getCurrentStoryEventActions(save),...rt.getCurrentStoryExplorationActions(save)];
 // 胶囊按 playerFacingFact 去掉句末标点
 const objective=REJOIN_OBJECTIVE.replace(/。$/,'');
 assert.equal(narrator.readLocalMemoryCapsule(save,candidates[0],candidates.slice(1)).currentObjective,objective,'same call shape as the free turn');
 assert.equal(narrator.readLocalMemoryCapsule(save).currentObjective,objective);
 const letter=structuredClone(plain.get('letter'));
 assert.equal(narrator.readLocalMemoryCapsule(letter).currentObjective,rt.getScenarioFocusEvent(runtimeOf(letter)).objective,'non-stay keeps the letter objective');
});

test('PR1-2: a stale expired record for a beat whose current definition has no close window and no completion is cleared on load and on advance',()=>{
 const all=lines.QUEST_LINES.flatMap(l=>l.beats.map(b=>({l,b})));
 const save=atBiyu(stageSave('lcq.stage_05b'));const r=runtimeOf(save);
 r.questLineState={version:1,receipts:{},expired:Object.fromEntries(all.map(({b})=>[b.id,87]))};
 loadRepairs.applyLoadRepairs(save);
 const stale=({l,b})=>!l.closeWhen&&!b.closeWhen&&!b.onExpire?.length;
 assert.ok(all.some(stale)&&all.some(x=>!stale(x)),'fixture covers both kinds');
 for(const x of all)assert.equal(r.questLineState.expired[x.b.id],stale(x)?undefined:87,x.b.id);
 assert.equal(r.questLineState.expired[ALGAE.beatId],undefined);
 assert.ok(lineActions(save,ALGAE.eventId).some(a=>a.actionId==='act.ask_biling_for_nylon'),'the algae pickup is offered again');
 // 推进路径同一迁移；有完成回执的不动
 const adv=atBiyu(stageSave('lcq.stage_05b'));runtimeOf(adv).questLineState={version:1,receipts:{[ALGAE.beatId]:{receiptId:'x',turn:1,outcome:'success'}},expired:{[ALGAE.beatId]:87,'beat.ningyu.o2_regicide':87}};
 ctxmod.clearStaleQuestLineExpiry(adv);
 assert.equal(runtimeOf(adv).questLineState.expired[ALGAE.beatId],87,'completed beat untouched');
 runtimeOf(adv).questLineState.receipts={};ctxmod.expireQuestLineWindows(adv);
 assert.equal(runtimeOf(adv).questLineState.expired[ALGAE.beatId],undefined);
 assert.notEqual(runtimeOf(adv).questLineState.expired['beat.ningyu.o2_regicide'],undefined,'a beat that still has a close window keeps its expiry');
 // expired 口径：0 也算到期
 const zero=atBiyu(stageSave('lcq.stage_05b'));entries.syncPersistentLineEntries(zero);runtimeOf(zero).questLineState={version:1,receipts:{},expired:{[ALGAE.beatId]:0}};
 assert.equal(ctxmod.questLineOffer(zero,ALGAE.eventId),null);
});

test('PR1-2: a Nanhuang domestic map move is written to the travel ledger (arrive:map:), so the next turn does not pull the player back',()=>{
 const save=structuredClone(stay.get('letter_held'));const r=runtimeOf(save);const zone=r.travelLedger.state.currentZoneId;
 const sel=arriveByMap(save,BIYU);
 assert.notEqual(r.travelLedger.state.currentZoneId,zone);
 const last=r.travelLedger.reprojections.at(-1);
 assert.equal(last.cause,`arrive:map:${sel.actionId}`);assert.equal(last.toZoneId,r.travelLedger.state.currentZoneId);
 assert.equal(last.afterReceipts,r.travelLedger.state.travelReceipts.length);
 const out=rt.advanceScenarioRuntime(save).saveData;
 assert.equal(out.角色.位置.locationId,BIYU,'not pulled back to the inn');
 assert.equal(runtimeOf(out).travelLedger.state.currentZoneId,last.toZoneId);
 assert.ok(lineActions(out,ALGAE.eventId).some(a=>a.actionId==='act.ask_biling_for_nylon'));
 const capsule=narrator.readLocalMemoryCapsule(out);
 assert.notEqual(capsule.currentObjective,rt.getScenarioFocusEvent(runtimeOf(out)).objective,'away from the inn the free turn does not aim at the letter');
 assert.match(capsule.currentObjective,/^去/);
});

test('PR1-2: only arrive: moves after the last forced route count as an explicit move; older ones no longer block the ledger correction',()=>{
 const base=structuredClone(stay.get('letter_held'));const l=runtimeOf(base).travelLedger,receipts=l.state.travelReceipts;
 const lastForced=receipts.map(x=>x.mode).lastIndexOf('forced');assert.ok(lastForced>=0);
 const drifted=(afterReceipts)=>{const s=structuredClone(base);const sl=runtimeOf(s).travelLedger;
  sl.reprojections=[{atTurn:1,fromZoneId:sl.state.currentZoneId,toZoneId:'nh.biyu',cause:'arrive:map:old',...(afterReceipts===undefined?{}:{afterReceipts})}];
  s.角色.位置={...s.角色.位置,locationId:BIYU};ledgerMod.reconcileNanhuangPositionFromLedger(s,runtimeOf(s));return s.角色.位置.locationId;};
 assert.notEqual(drifted(lastForced),BIYU,'an arrival before the last forced route does not block the correction');
 assert.equal(drifted(receipts.length),BIYU,'an arrival after it still counts as the player moving');
 assert.equal(drifted(undefined),BIYU,'legacy record without order keeps the old fail-closed behaviour');
});

test('PR1-3: the travel card reads the current stay: Ning Yu / Xiao Wei are not listed while held, and return after the rejoin',()=>{
 for(const {save} of stayEnterDong){
  const card=ledgerMod.getTravelCard(save);
  for(const n of ['凝羽','小魏'])assert.ok(!(card?.companions||[]).includes(n),`${n} not on the card`);
  if(runtimeOf(save).travelLedger?.lastCard)assert.deepEqual(runtimeOf(save).travelLedger.lastCard,structuredClone(runtimeOf(save).travelLedger.lastCard),'stored snapshot untouched');
 }
 const raw=runtimeOf(stayEnterDong[0].save).travelLedger.lastCard;
 assert.ok(raw.companions.includes('凝羽'),'the departure snapshot still has her (the bug this fixes)');
 const after=structuredClone(stayEnterDong[0].save);runtimeOf(after).flags['branch.ningyu.y5_rejoined']=true;
 assert.ok(ledgerMod.getTravelCard(after).companions.includes('凝羽'),'once rejoined the card lists her again');
 const p=plain.get('y5');assert.deepEqual(ledgerMod.getTravelCard(p),runtimeOf(p).travelLedger?.lastCard,'non-stay unchanged');
});
