import {createJiti} from 'jiti';
import {fileURLToPath} from 'node:url';
import {createPinia,setActivePinia} from 'pinia';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';
const host=await loadTs('../src/modules/sceneModule/host/controller.ts');
const ext=await loadTs('../src/modules/sceneModule/host/ext.ts');
const mod=await loadTs('../src/modules/sceneModule/index.ts');
const registry=await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const rt=await loadTs('../src/modules/scenarioMods/runtime.ts');
const trial=await loadTs('../src/dev/combatTrial/overlay.ts');
const init=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const repair=await loadTs('../src/utils/dataRepair.ts');
const data=id=>readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`,import.meta.url),'utf8').then(JSON.parse);
const runtime=save=>save.世界.状态.剧本模组;
const F03='lcq.event.s04_02',F10='lcq.event.s05b_05b_ideology_duel_and_defeat';
function enable(){globalThis.location={search:'?sceneModule=on',hostname:'localhost',href:'http://localhost/?sceneModule=on'};}
async function f03(){return trial.createSceneCombatTrialSave(await data('lcq.stage_04'),{mode:'B'});}
async function f10(){
 const save=init.applyStrictScenarioInitializationToSave(repair.createMinimalSaveDataV3(),init.buildStrictScenarioInitialization(await data('lcq.stage_05b')));
 const r=runtime(save),index=r.events.findIndex(e=>e.id===F10);
 for(const event of r.events.slice(0,index)){r.completedEventIds.push(event.id);for(const cond of event.completion||[])if(cond.path.startsWith('flags.'))r.flags[cond.path.slice(6)]=cond.value;}
 r.activeEventIds=[F10];const e=r.events[index],loc=r.canon.locations.find(l=>l.id===e.locationId);
 save.角色.位置={描述:loc.name,x:loc.coordinates.x,y:loc.coordinates.y,地点ID:loc.id};
 return save;
}
function harness(save,extra={}){let current=save;return {get save(){return current;},deps:{persist:async s=>{current=structuredClone(s);},...extra}};}
function force(save,action=20,defense=20){const a=ext.activeScene(save);a.state.forced={action:Array(20).fill(action),defense:Array(100).fill(defense)};}

test('both real contracts pass strict lint without warning',()=>{for(const c of registry.SCENE_CONTRACTS){const lint=mod.lintContract(c);assert.deepEqual(lint.errors,[]);assert.deepEqual(lint.warnings,[]);}});
test('F03 cannot bypass preview; preview does not roll, confirmed battle resumes the story once',async()=>{
 enable();const h=harness(await f03());const selection=host.sceneCandidate(h.save).selection;
 assert.equal(rt.recordStoryEventStructuredAction(h.save,selection).reason,'scene_module_required');
 await host.submitSceneInput(h.save,'我挥刀攻击独角武士',h.deps);force(h.save);
 assert.equal(ext.activeScene(h.save).state.cursors.action,0);
 const copy=JSON.parse(JSON.stringify(h.save));assert.equal(JSON.stringify(ext.activeScene(copy)),JSON.stringify(ext.activeScene(h.save)));
 for(let n=0;n<registry.sceneContractById('combat.f03.mountain_stream_fog').clock.beats&&ext.activeScene(h.save);n++){
  if(!ext.activeScene(h.save).pending)await host.submitSceneInput(h.save,'我挥刀攻击独角武士',h.deps);
  await host.confirmSceneAction(h.save,h.deps);
 }
 assert.equal(ext.activeScene(h.save),null);assert.ok(runtime(h.save).completedEventIds.includes(F03));
 assert.equal(ext.readExt(h.save).history.length,1);
 assert.ok(runtime(h.save).sceneLedger.worldFacts.length);
 assert.equal(runtime(h.save).eventActionStates[F03].attempts.at(-1).factReceipts,undefined,'new closure must not mint the old nine-kill receipt');
 assert.ok(Object.keys(runtime(h.save).sceneLedger.injuries).length>0);
 const ended=structuredClone(h.save);await assert.rejects(host.confirmSceneAction(h.save,h.deps),/没有待确认/);assert.deepEqual(h.save,ended);
});
test('narration interruption retains roll checkpoint and reload closes without reroll',async()=>{
 enable();let aborted=false;const h=harness(await f03(),{aborted:()=>aborted,askNarrative:async()=>{aborted=true;return '描写';}});
 await host.submitSceneInput(h.save,'我挥刀攻击独角武士',h.deps);force(h.save);
 // Force a valid decided checkpoint on the final contract beat.
 ext.activeScene(h.save).state.beat=registry.sceneContractById('combat.f03.mountain_stream_fog').clock.beats;
 await assert.rejects(host.confirmSceneAction(h.save,h.deps),/scene_host_aborted/);
 const checkpoint=JSON.parse(JSON.stringify(h.save)),a=ext.activeScene(checkpoint),cursor=a.state.cursors.action;
 assert.equal(a.state.status,'decided');aborted=false;
 await host.finishScene(checkpoint,{persist:h.deps.persist});
 assert.equal(ext.activeScene(h.save),null);assert.equal(ext.readExt(h.save).history[0].state.cursors.action,cursor);
 assert.ok(runtime(h.save).completedEventIds.includes(F03));
});
test('F10 uses new contract; terminal player choice needs explicit confirmation and writes E06',async()=>{
 enable();const h=harness(await f10());assert.equal(host.sceneCandidate(h.save)?.selection.eventId,F10);
 await host.submitSceneInput(h.save,'我投降',h.deps);
 assert.equal(ext.activeScene(h.save).choice.choiceId,'join_or_yield');assert.equal(runtime(h.save).gameOver,undefined);
 await host.confirmSceneChoice(h.save,h.deps);
 assert.equal(runtime(h.save).gameOver.endingId,'lcq.ending.death.ghost_king_skull');
 assert.match(h.save.系统.历史.叙事.at(-1).content,/天命|头颅|鬼巫王/);
 assert.equal(ext.activeScene(h.save),null);
});
test('F13 loss consumes E07 without a jump-well prerequisite; repeated advance does not append again',async()=>{
 const save=await f10(),r=runtime(save);r.flags['lcq.encounter.f13.tier']='lose';
 const first=rt.advanceScenarioRuntime(save).saveData;
 assert.equal(runtime(first).gameOver.endingId,'lcq.ending.death.dragon_well');
 assert.match(first.系统.历史.叙事.at(-1).content,/你抓起|裂缝/);
 assert.ok(first.系统.历史.叙事.at(-1).image);
 assert.equal(rt.advanceScenarioRuntime(first).saveData.系统.历史.叙事.length,first.系统.历史.叙事.length);
});
test('off switch retains old completion; an already-started scene still cannot bypass its host',async()=>{
 globalThis.location={search:'?sceneModule=off'};const save=await f03();assert.equal(host.sceneCandidate(save),undefined);
 const action=rt.getCurrentStoryEventActions(save)[0];assert.equal(rt.recordStoryEventStructuredAction(save,action).attempted,true);
 delete globalThis.location;
});

test('F10 multi-phase fight closes into the next plot and retains canonical injuries',async()=>{
 enable();const h=harness(await f10());
 h.deps.askIntent=async()=>{
  const s=ext.activeScene(h.save).state;
  if(s.beat<4)return JSON.stringify({goal:'survive_duel',claim:{magnitude:1,scope:'single',targets:['pc']},levers:[],inputClass:'action'});
  const target=(s.tracks.hu_sha?.vit||0)<2?'hu_sha':'dan_chen';
  return JSON.stringify({goal:target==='hu_sha'?'destroy_tiger':'subdue_alive',claim:{magnitude:3,scope:'single',targets:[target]},levers:target==='hu_sha' && s.beat>=5?[{element:'true_yang_blood',verb:'use_blood',evidence:'抹血'}]:[],inputClass:'action'});
 };
 await host.submitSceneInput(h.save,'我挡住袭击',h.deps);force(h.save);
 for(let n=0;n<14&&ext.activeScene(h.save);n++){
  if(!ext.activeScene(h.save).pending)await host.submitSceneInput(h.save,ext.activeScene(h.save).state.beat>=5?'我抹血攻击骨虎，制服丹宸':'我挡住袭击',h.deps);
  assert.ok(ext.activeScene(h.save).pending,'recognized a legal plan');
  await host.confirmSceneAction(h.save,h.deps);
 }
 assert.equal(ext.activeScene(h.save),null);assert.ok(runtime(h.save).completedEventIds.includes(F10));
 assert.equal(ext.readExt(h.save).history[0].outcome,'win');
 assert.ok(ext.readExt(h.save).history[0].state.departed.includes('gui_wu_wang'));
});

test('positive chat evidence freezes scene; an action cannot escape through chat or the off switch',async()=>{
 enable();const h=harness(await f03(),{askIntent:async()=>JSON.stringify({inputClass:'chat'}),askNarrative:async()=> '对方只是听着你的话。'});
 await host.submitSceneInput(h.save,'我挥刀攻击独角武士',h.deps);
 const state=structuredClone(ext.activeScene(h.save).state),turn=runtime(h.save).worldTurn;
 await host.submitSceneInput(h.save,'你好',h.deps);
 assert.deepEqual(ext.activeScene(h.save).state,state);assert.equal(runtime(h.save).worldTurn,turn);
 await host.submitSceneInput(h.save,'我挥刀攻击独角武士',h.deps);assert.ok(ext.activeScene(h.save).pending);
 globalThis.location={search:'?sceneModule=off'};
 assert.equal(rt.recordStoryEventStructuredAction(h.save,rt.getCurrentStoryEventActions(h.save)[0]).reason,'scene_module_required');
 delete globalThis.location;
});

test('public AI entry blocks direct scene actions before availability checks or model calls',async t=>{
 const oldStorage=globalThis.localStorage, oldWindow=globalThis.window; const values=new Map();
 globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 globalThis.window=globalThis;
 t.after(()=>{globalThis.localStorage=oldStorage;globalThis.window=oldWindow;delete globalThis.location;});
 enable();setActivePinia(createPinia());
 const jiti=createJiti(import.meta.url,{interopDefault:true,alias:{'@':fileURLToPath(new URL('../src',import.meta.url)),'@/stores/characterStore':fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts',import.meta.url))}});
 const {useGameStateStore}=await jiti.import(fileURLToPath(new URL('../src/stores/gameStateStore.ts',import.meta.url)));
 const {AIBidirectionalSystem}=await jiti.import(fileURLToPath(new URL('../src/utils/AIBidirectionalSystem.ts',import.meta.url)));
 useGameStateStore().loadFromSaveData(await f03());
 await assert.rejects(AIBidirectionalSystem.processPlayerAction('我挥刀攻击独角武士',{},{}),/须经场面预览与确认/);
 delete globalThis.location;
});

test('F03 capture persists as capture, zero escapes, and creates no extra penalty',async()=>{
 enable();const h=harness(await f03());
 for(let n=0;n<3;n++) {
  await host.submitSceneInput(h.save,'我擒住所有武士留下活口',h.deps);force(h.save);
  assert.equal(ext.activeScene(h.save).pending.plan.goal,'capture');
  await host.confirmSceneAction(h.save,h.deps);
 }
 assert.equal(ext.activeScene(h.save),null);
 const record=ext.readExt(h.save).history[0];assert.equal(record.outcome,'win');
 assert.equal(runtime(h.save).flags['scene.f03.escaped'],false);
 const c=registry.sceneContractById(record.contractId);
 for(const party of c.parties.filter(p=>p.side==='opposed'))assert.equal(party.tracks[0].scale[record.state.tracks[party.id].vit],'被俘');
 assert.equal(registry.sceneContractForEvent('lcq.event.enter_dong_with_migu',runtime(h.save).flags),undefined);
});
test('F03 escaped flag survives stage transition; entry battle settles once without affinity penalty',async()=>{
 enable();const h=harness(await f03());
 for(let n=0;n<registry.sceneContractById('combat.f03.mountain_stream_fog').clock.beats;n++) {await host.submitSceneInput(h.save,'我守住队伍保护凝羽',h.deps);force(h.save);await host.confirmSceneAction(h.save,h.deps);}
 assert.equal(runtime(h.save).flags['scene.f03.escaped'],true);
 delete h.save.系统.扩展.清羽记开局; // isolated F03 fixture stop is not the product campaign stop
 runtime(h.save).stageStatus='completed';runtime(h.save).nextStageId='lcq.stage_04b_lingfei_baiyi_crisis';runtime(h.save).nextStageReadyId=runtime(h.save).nextStageId;
 const transitioned=init.transitionToNextScenarioStage(h.save,[await data('lcq.stage_04b_lingfei_baiyi_crisis')]);assert.equal(transitioned.ok,true,transitioned.reason);
 const moved=transitioned.saveData;
 const r=runtime(moved),eventId='lcq.event.enter_dong_with_migu',index=r.events.findIndex(e=>e.id===eventId);
 assert.equal(r.flags['scene.f03.escaped'],true);
 for(const event of r.events.filter(item=>item.id!==eventId)){r.completedEventIds.push(event.id);for(const cond of event.completion||[])if(cond.path.startsWith('flags.'))r.flags[cond.path.slice(6)]=cond.value;}
 r.activeEventIds=[eventId];const e=r.events[index],loc=r.canon.locations.find(l=>l.id==='lcq.location.guiwang_outer_post');
 moved.角色.位置={描述:loc.name,x:loc.coordinates.x,y:loc.coordinates.y,地点ID:loc.id};
 const entry=harness(moved);assert.equal(host.sceneCandidate(entry.save)?.contract.meta.id,'combat.f03.escape_followup');
 await host.submitSceneInput(entry.save,'我击退拦路武士',entry.deps);force(entry.save);
 for(let n=0;n<3&&ext.activeScene(entry.save);n++){if(!ext.activeScene(entry.save).pending)await host.submitSceneInput(entry.save,'我击退拦路武士',entry.deps);await host.confirmSceneAction(entry.save,entry.deps);}
 assert.equal(ext.activeScene(entry.save),null);assert.equal(runtime(entry.save).flags['scene.f03.entry_battle.done'],true);
 assert.equal(runtime(entry.save).completedEventIds.includes(eventId),false,'extra battle does not auto-complete the route-mapping step');
 runtime(entry.save).worldTurn++;
 const nextTravel=rt.getCurrentStoryEventActions(entry.save).find(action=>action.actionId.startsWith('travel:'));
 if(nextTravel){assert.equal(rt.recordStoryEventStructuredAction(entry.save,nextTravel).attempted,true);runtime(entry.save).worldTurn++;await entry.deps.persist(rt.advanceScenarioRuntime(entry.save).saveData);}
 const receptionAction=rt.getCurrentStoryEventActions(entry.save).find(action=>action.actionId==='stop_migu_reception_clash');assert.ok(receptionAction);
 assert.equal(rt.recordStoryEventStructuredAction(entry.save,receptionAction).completed,false);runtime(entry.save).worldTurn++; // isolate the remaining contract step from synthetic rail location projection
 const next=rt.getCurrentStoryEventActions(entry.save).find(action=>action.actionId==='follow_migu_and_map_slave_routes');assert.ok(next);
 assert.equal(rt.recordStoryEventStructuredAction(entry.save,next).completed,true);
 await entry.deps.persist(rt.advanceScenarioRuntime(entry.save).saveData);
 assert.ok(runtime(entry.save).completedEventIds.includes(eventId));
 assert.equal(registry.sceneContractForEvent(eventId,runtime(entry.save).flags),undefined);
 assert.equal(ext.readExt(entry.save).history.filter(row=>row.contractId==='combat.f03.escape_followup').length,1);
});
test('F10 generic/model-invented attack cannot destroy bone tiger; valid blood contact destroys it completely',()=>{
 const c=registry.sceneContractById('combat.f10.ghost_king_clash'),ctx={factors:0};
 const opened=mod.beginScene(c,{seed:7,forced:{action:Array(10).fill(20),defense:Array(20).fill(20)}}).state;
 opened.beat=4;opened.present.hu_sha=true;opened.present.dan_chen=true;
 opened.tags.push({id:'blood_known',label:'已知血克制',on:'pc',expiresBeat:null,effect:{},sourceId:'fixture'});
 const raw={goal:'destroy_tiger',claim:{magnitude:3,scope:'single',targets:['hu_sha']},levers:[]};
 const generic=mod.validateProposal(c,opened,raw,'我挥刀攻击骨虎').plan;
 assert.equal(mod.previewAction(c,opened,generic,ctx).targets[0].realizable,0);
 const failed=mod.confirmAction(c,opened,generic,ctx);assert.equal(failed.state.tracks.hu_sha.vit,0);
 const invented=mod.validateProposal(c,opened,{...raw,levers:[{element:'true_yang_blood',verb:'use_blood',evidence:'抹血'}]},'我挥刀攻击骨虎');
 assert.equal(invented.plan.levers.length,0);
 const valid=mod.validateProposal(c,opened,{...raw,claim:{...raw.claim,magnitude:1},levers:[{element:'true_yang_blood',verb:'use_blood',evidence:'抹血'}]},'我抹血让骨虎沾上').plan;
 const result=mod.confirmAction(c,opened,valid,ctx);assert.equal(result.state.tracks.hu_sha.vit,2);
});

test('W08 factual instructions reach narration; F14 W52 draft preserves evidence and stays unregistered',async()=>{
 const narrate=await loadTs('../src/modules/sceneModule/host/narrate.ts');
 const c=registry.sceneContractById('combat.f03.mountain_stream_fog'),state=mod.beginScene(c,{seed:2}).state;
 const plan=mod.validateProposal(c,state,{goal:'protect',claim:{magnitude:1,scope:'single',targets:['pc']},levers:[]},'我保护队伍').plan;
 const beat=mod.confirmAction(c,state,plan,{factors:0});
 assert.match(narrate.buildNarrationPrompt(c,beat.state,beat.result,'我保护队伍',{}).user,/花苗人杀敌人数不限/);
 for(const draft of registry.SCENE_CONTRACT_DRAFTS){assert.deepEqual(mod.lintContract(draft).errors,[]);assert.equal(registry.sceneContractForEvent(draft.meta.hook.eventId),undefined);}
 const raw=JSON.parse(await readFile(new URL('../src/modules/sceneModule/contracts/f14.draft.json',import.meta.url),'utf8'));
 assert.match(raw.meta.canonicalConsequences[0].cause,/第114章段16.*背硬接/);
 assert.equal(raw.meta.canonicalConsequences[0].revealedAtChapter,118);
 assert.equal(raw.clock?.beats,undefined);
});

test('version 2 checkpoint upgrades without reroll; old preview must be confirmed again',async()=>{
 enable();const h=harness(await f10());await host.submitSceneInput(h.save,'我挡住袭击',h.deps);
 const a=ext.activeScene(h.save),seed=a.state.seed,cursor=a.state.cursors.action;a.state.contractVersion=2;
 await host.confirmSceneAction(h.save,h.deps);
 const upgraded=ext.activeScene(h.save);assert.equal(upgraded.state.contractVersion,registry.sceneContractById(a.contractId).meta.version);assert.equal(upgraded.state.seed,seed);assert.equal(upgraded.state.cursors.action,cursor);assert.equal(upgraded.pending,null);
 assert.match(upgraded.notice,/重新输入/);
});

test('escape result follows terminal states and writeback never mutates authored flags',async()=>{
 const writeback=await loadTs('../src/modules/sceneModule/host/writeback.ts');
 const c=structuredClone(registry.sceneContractById('combat.f03.mountain_stream_fog')),before=JSON.stringify(c),state=mod.beginScene(c,{seed:3}).state;
 for(const p of c.parties.filter(p=>p.side==='opposed'))state.tracks[p.id].vit=3;
 state.status='decided';state.outcome={kind:'lose',reason:'fixture simultaneous defeat'};
 const closed=mod.closeScene(c,state,{factors:0}),save=await f03();
 writeback.applyWriteBack(save,c,closed.state,closed.writeBack);
 assert.equal(runtime(save).flags['scene.f03.escaped'],false,'already subdued enemies are not escaped just because player lost');
 assert.equal(JSON.stringify(c),before,'writeback must not alter the next playthrough contract');
});

test('F13 new checkpoint enters host, guards through phases, and closes to dragon swallowing without jumping',async()=>{
 enable();const dir=await import('node:os').then(o=>o.tmpdir());const fs=await import('node:fs/promises');const cp=await import('node:child_process');
 const path=await fs.mkdtemp(dir+'/f13-host-');cp.execFileSync(process.execPath,['scripts/generate-scene-combat-checkpoints.mjs',path],{maxBuffer:8*1024*1024});
 const h=harness(JSON.parse(await fs.readFile(path+'/F13-before.json','utf8')).saves[0].存档数据);
 assert.equal(host.sceneCandidate(h.save)?.contract.meta.id,'combat.f13.ghost_king_final');
 for(let i=0;i<5&&!runtime(h.save).completedEventIds.includes('lcq.event.ghost_king_swallowed');i++){
  await host.submitSceneInput(h.save,'我守住井口，用血驱走阴煞',h.deps);force(h.save);await host.confirmSceneAction(h.save,h.deps);
 }
 assert.ok(runtime(h.save).completedEventIds.includes('lcq.event.ghost_king_swallowed'));
 assert.equal(runtime(h.save).gameOver,undefined);
 assert.match(h.save.系统.历史.叙事.at(-1).content,/星阵.*龙神|龙神吞下/);
 assert.ok(ext.readExt(h.save).history.at(-1).beats>=3);
});

test('F13 repeated failed holds reach the authored loss and E07 without jump-well input',async()=>{
 enable();const h=harness(await f10()),r=runtime(h.save); // New-stage fixture only for loss gate, not a walkthrough claim.
 const index=r.events.findIndex(e=>e.id==='lcq.event.ghost_king_swallowed');
 for(const event of r.events.slice(0,index)){r.completedEventIds.push(event.id);for(const cond of event.completion||[])if(cond.path.startsWith('flags.'))r.flags[cond.path.slice(6)]=cond.value;}
 r.activeEventIds=['lcq.event.ghost_king_swallowed'];const e=r.events[index],loc=r.canon.locations.find(l=>l.id===e.locationId);h.save.角色.位置={描述:loc.name,x:loc.coordinates.x,y:loc.coordinates.y,地点ID:loc.id};
 await host.submitSceneInput(h.save,'我守住井口',h.deps);force(h.save,1,1);
 for(let i=0;i<12&&ext.activeScene(h.save);i++){
  if(!ext.activeScene(h.save).pending)await host.submitSceneInput(h.save,'我守住井口',h.deps);
  await host.confirmSceneAction(h.save,h.deps);
 }
 assert.equal(ext.activeScene(h.save),null);
 assert.equal(runtime(h.save).gameOver?.endingId,'lcq.ending.death.dragon_well');
 assert.equal(runtime(h.save).completedEventIds.includes('lcq.event.ghost_king_swallowed'),false);
 assert.match(h.save.系统.历史.叙事.at(-1).content,/裂缝/);
});

test('F03 natural twenty completes exactly one tactical group, never an instant victory; wounded allies pay finite costs',async()=>{
 const c=registry.sceneContractById('combat.f03.mountain_stream_fog');
 let s=mod.beginScene(c,{seed:1,forced:{action:[20],defense:Array(10).fill(20)}}).state;
 const raw={goal:'capture',claim:{magnitude:3,scope:'all',targets:c.parties.filter(p=>p.side==='opposed').map(p=>p.id)},levers:[]};
 const plan=mod.validateProposal(c,s,raw,'我擒住所有武士').plan;
 const result=mod.confirmAction(c,s,plan,{factors:100,playerDefense:100});
 assert.equal(result.state.status,'engaged');
 const terminal=c.parties.filter(p=>p.side==='opposed' && result.state.tracks[p.id].vit>=3);
 assert.equal(new Set(terminal.map(p=>p.actionGroup || p.id)).size,1);
 assert.ok(terminal.length<9);assert.equal(result.state.present.wu_er_lang,false);
 assert.doesNotMatch(JSON.stringify(c),/以一敌六|撑到雾散/);
 s=result.state;s.status='decided';s.outcome={kind:'lose',reason:'fixture protective ally defeated'};
 s.statuses.bride=[{id:'incapacitated',appliedBeat:1,expiresBeat:null,cause:'combat',sourceId:'fixture'}];
 const closed=mod.closeScene(c,s,{factors:0});
 const wb=await loadTs('../src/modules/sceneModule/host/writeback.ts');wb.recoverDownedAfterScene(c,closed.state,closed.writeBack);
 assert.ok(!closed.writeBack.persistent.some(x=>x.status==='incapacitated'));
 assert.ok(closed.writeBack.persistent.some(x=>x.party==='bride' && x.minutes>0));
 assert.match(closed.writeBack.costs.map(x=>x.effect).join(' '),/护卫/);
 assert.equal(c.enemyActions.some(a=>a.target?.party==='bride'),true);
 assert.equal(c.enemyActions.some(a=>a.target?.party==='a_xi'),true);
});

test('F10 refuses negated/hypothetical surrender and uses only the capture E06 branch on explicit consent',async()=>{
 const c=registry.sceneContractById('combat.f10.ghost_king_clash');
 assert.ok(c);
 for(const text of ['我绝不答应他','我不投降','如果我加入他会怎样','我投降？'])assert.equal(mod.matchPlayerChoice(c,text),null,text);
 const choice=mod.matchPlayerChoice(c,'我投降');assert.ok(choice);
 const state=mod.applyPlayerChoice(c,mod.beginScene(c).state,choice.id),closed=mod.closeScene(c,state,{factors:0});
 assert.equal(closed.writeBack.outcome.endingId,'lcq.ending.death.ghost_king_skull');
 assert.doesNotMatch(JSON.stringify(closed.writeBack),/鬼巫王已经离开|骨虎探头|药瓶撞破/);
 assert.equal(closed.writeBack.rewards.length,0);
});

test('F13 every loss ends in E07 without resuming the main line',()=>{
 const c=registry.sceneContractById('combat.f13.ghost_king_final');
 let s=mod.beginScene(c).state;s.tracks.well_front.hold=3;
 s.statuses.pc=[{id:'wound.external.heavy',appliedBeat:1,expiresBeat:null,cause:'combat',sourceId:'fixture'}];
 assert.equal(mod.isLost(c,s),true);
 s.status='decided';s.outcome={kind:'lose',reason:'fixture ordinary defeat'};
 let closed=mod.closeScene(c,s,{factors:0});assert.equal(closed.writeBack.outcome.endingId,'lcq.ending.death.dragon_well');
 assert.equal(closed.state.tracks.well_front.breach,0);assert.doesNotMatch(closed.writeBack.closingText,/龙神吞下/);assert.equal(closed.writeBack.flags['scene.f13.result'],'lose');assert.equal(closed.writeBack.next,null);
 s=mod.beginScene(c,{forced:{action:[1,1,1],defense:Array(30).fill(20)}}).state;
 for(let i=0;i<3;i++){const plan=mod.validateProposal(c,s,{goal:'hold_well',claim:{magnitude:1,scope:'single',targets:['well_front']},levers:[]},'我守井口').plan;s=mod.confirmAction(c,s,plan,{factors:-100,playerDefense:100}).state;}
 assert.equal(s.outcome.endingId,'lcq.ending.death.dragon_well');closed=mod.closeScene(c,s,{factors:0});
 assert.doesNotMatch(closed.writeBack.closingText,/吞下|断交/);
});


test('F13 abandoning the well confirms E07; negation never selects abandonment',async()=>{
 const c=registry.sceneContractById('combat.f13.ghost_king_final');
 for(const text of ['我拉着乐明珠往洞窟深处跑，不再守井口','我放弃井口','我弃守','我逃跑'])assert.equal(mod.matchPlayerChoice(c,text)?.endingId,'lcq.ending.death.dragon_well');
 for(const text of ['我不放弃井口','我不往洞窟深处跑','如果弃守呢？'])assert.equal(mod.matchPlayerChoice(c,text),null);
 const state=mod.applyPlayerChoice(c,mod.beginScene(c,{seed:1}).state,'abandon_well');
 assert.equal(mod.closeScene(c,state,{factors:0}).writeBack.outcome.endingId,'lcq.ending.death.dragon_well');
});
test('F13 ordinary failed defense and enemy hits each accumulate breach',()=>{
 const c=registry.sceneContractById('combat.f13.ghost_king_final');
 const state=mod.beginScene(c,{seed:1,forced:{action:[5],defense:[1]}}).state;
 const plan=mod.validateProposal(c,state,{goal:'hold_well',claim:{magnitude:1,scope:'single',targets:['well_front']}},'我守住井口').plan;
 const after=mod.confirmAction(c,state,plan,{factors:0,playerDefense:0});
 assert.equal(after.result.tier,'failure');assert.equal(after.result.enemy[0].outcome,'hit');assert.equal(after.state.tracks.well_front.breach,2);
});
test('F10 passive biting and cutting the haft cannot invent blood; repeated hits close ordinary defeat',async()=>{
 enable();const h=harness(await f10());const rec=await loadTs('../src/modules/sceneModule/host/recognize.ts');
 await host.submitSceneInput(h.save,'我任骨虎咬',h.deps);
 let a=ext.activeScene(h.save);a.state.beat=4;a.state.present.hu_sha=true;a.state.present.dan_chen=true;a.state.departed.push('gui_wu_wang');a.pending=null;
 const bogus=async()=>JSON.stringify({goal:'destroy_tiger',claim:{magnitude:3,scope:'single',targets:['hu_sha']},levers:[{element:'true_yang_blood',verb:'use_blood',evidence:'骨虎'}]});
 for(const text of ['我任骨虎咬','我切斧柄']){
  const result=await rec.recognizeAction(registry.sceneContractById(a.contractId),a.state,text,runtime(h.save),bogus);
  assert.notEqual(result.plan?.goal,'destroy_tiger');assert.ok(!result.plan?.levers.some(l=>l.element==='true_yang_blood'));
 }
 force(h.save,10,20);
 for(let n=0;n<5&&ext.activeScene(h.save);n++){
  await host.submitSceneInput(h.save,'我任骨虎咬',h.deps);assert.equal(ext.activeScene(h.save).pending.plan.goal,'expose_self');await host.confirmSceneAction(h.save,h.deps);
 }
 assert.equal(ext.activeScene(h.save),null);assert.equal(ext.readExt(h.save).history.at(-1).outcome,'lose');assert.equal(runtime(h.save).gameOver,undefined);
 assert.ok(h.save.角色.效果.some(e=>e.状态名称==='外伤（重）'));assert.ok(runtime(h.save).completedEventIds.includes(F10));
});
test('combat narration checks receipt facts and closed bone tiger stays closed in ordinary turns',async()=>{
 const narrate=await loadTs('../src/modules/sceneModule/host/narrate.ts');
 const c=registry.sceneContractById('combat.f10.ghost_king_clash'),state=mod.beginScene(c,{seed:1}).state;
 state.beat=4;state.departed.push('gui_wu_wang');state.present.hu_sha=true;state.present.dan_chen=true;
 const plan=mod.validateProposal(c,state,{goal:'subdue_alive',claim:{magnitude:1,scope:'single',targets:['dan_chen']}},'我制住丹宸').plan;
 state.forced={action:[2],defense:Array(20).fill(20)};
 const done=mod.confirmAction(c,state,plan,{factors:0});
 for(const text of ['你捆住了丹宸。','鬼巫王再次出手。','你的背上挨了一斧。'])assert.equal(mod.checkNarration(c,done.state,done.result,text).ok,false,text);
 const save=await f10();done.state.tracks.hu_sha.vit=2;ext.writeExt(save,{version:1,active:null,stall:{},history:[{contractId:c.meta.id,state:done.state}]});
 assert.ok(narrate.closedSceneNarrativeProblems(save,'骨虎又扑了过来，咬住你。').length);assert.deepEqual(narrate.closedSceneNarrativeProblems(save,'白骨散落在地，骨虎已经解体。'),[]);
});
test('same input at unchanged scene state reuses recognition, including after save reload',async()=>{
 enable();let calls=0;const h=harness(await f10(),{askIntent:async()=>{calls++;return JSON.stringify({goal:calls===1?'survive_duel':'reach_altar',inputClass:'action',claim:{magnitude:1,scope:'single',targets:[]},levers:[]});}});
 await host.submitSceneInput(h.save,'我稳住阵脚',h.deps);const first=ext.activeScene(h.save).pending.plan;
 await host.editSceneAction(h.save,h.deps);await host.submitSceneInput(h.save,'我稳住阵脚',h.deps);
 assert.equal(calls,1);assert.deepEqual(ext.activeScene(h.save).pending.plan,first);
});

test('E06 closure history contains the fixed body once and never repeats its opening bridge',async()=>{
 enable();const h=harness(await f10());await host.submitSceneInput(h.save,'我投降',h.deps);await host.confirmSceneChoice(h.save,h.deps);
 const ending=await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');const full=ending.fixedEndingNarrative(runtime(h.save).gameOver);
 assert.equal(h.save.系统.历史.叙事.at(-1).content,full);assert.equal((full.match(/你听见自己说「好」/g)||[]).length,1);
 const panel=await readFile(new URL('../src/components/dashboard/MainGamePanel.vue',import.meta.url),'utf8');assert.match(panel,/v-for="\(fact, index\) in scenarioEndingParagraphs"/);assert.match(panel,/fixedEndingNarrative\(over\)/);
});
test('already settled back injury is published during battle, before closure or rewards',async()=>{
 enable();const h=harness(await f10());await host.submitSceneInput(h.save,'我观察四周',h.deps);
 const a=ext.activeScene(h.save),c=registry.sceneContractById(a.contractId);a.state.beat=5;a.state.present.dan_chen=true;a.state.present.hu_sha=true;a.state.departed.push('gui_wu_wang');a.pending=null;
 force(h.save,10,1);await host.submitSceneInput(h.save,'我观察四周',h.deps);await host.confirmSceneAction(h.save,h.deps);
 assert.ok(h.save.角色.效果.some(effect=>effect.状态名称==='背伤'||effect.状态名称==='外伤（重）'));assert.equal(runtime(h.save).flags['scene.'+c.meta.id+'.done'],undefined);
});


test('F14 draft has one loss outcome E08; runtime consumes loss once without killing the player',async()=>{
 const c=registry.SCENE_CONTRACT_DRAFTS.find(c=>c.meta.id==='combat.f14.dragon_god');
 assert.equal(c.defeat.rout,undefined);assert.equal(c.closing.rout,undefined);
 let state=mod.beginScene(c).state;state.status='decided';state.outcome={kind:'lose',reason:'saved loss'};
 const closed=mod.closeScene(c,state,{factors:0});assert.equal(closed.writeBack.outcome.endingId,'lcq.ending.fail.dragon_essence');
 const save=await f10(),r=runtime(save);r.flags['lcq.encounter.f14.tier']='lose';
 const hp=structuredClone(save.角色.属性);const next=rt.advanceScenarioRuntime(save).saveData;
 assert.equal(runtime(next).gameOver.endingId,'lcq.ending.fail.dragon_essence');assert.deepEqual(next.角色.属性,hp);
 const count=next.系统.历史.叙事.length;assert.equal(rt.advanceScenarioRuntime(next).saveData.系统.历史.叙事.length,count);
});

test('old F13 rout flag is only a save alias for loss',async()=>{
 const save=await f10();runtime(save).flags['lcq.encounter.f13.tier']='rout';
 assert.equal(runtime(rt.advanceScenarioRuntime(save).saveData).gameOver.endingId,'lcq.ending.death.dragon_well');
});
