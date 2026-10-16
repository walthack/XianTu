// 引擎推进器（测试夹具）：不经 LLM，只按主线动作逐拍走清羽记 stage_01→stage_05b，战斗场面用固定骰与固定意图收束。
// 每拍开头回调 onTop(save,event,n)；回调里要分叉就自己 structuredClone(save)。夹具只产出存档，不写文件。
import {readFile} from 'node:fs/promises';
import {loadTs} from './loadTs.mjs';
const rt=await loadTs('../src/modules/scenarioMods/runtime.ts'),init=await loadTs('../src/modules/scenarioMods/strictInitializer.ts'),opening=await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts'),wuyuan=await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const reg=await loadTs('../src/modules/sceneModule/contracts/registry.ts');const host=await loadTs('../src/modules/sceneModule/host/controller.ts'),ext=await loadTs('../src/modules/sceneModule/host/ext.ts');
const ids=['lcq.stage_01','lcq.stage_02','lcq.stage_03','lcq.stage_05','lcq.stage_03b_snake_flower_bridge','lcq.stage_04','lcq.stage_04b_lingfei_baiyi_crisis','lcq.stage_05b'];
const cp=await loadTs('../src/modules/contentPacks/index.ts'),ec=await loadTs('../src/modules/scenarioMods/entityCatalog.ts'),cr=await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const rawMods=await Promise.all(ids.map(id=>readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`,import.meta.url),'utf8').then(JSON.parse)));
const mods=rawMods.map(raw=>{const mod=ec.resolveScenarioContent(cp.applyContentPackOverlays(raw));cr.resolveScenarioCharacters(mod.canon?.characters,mod.manifest.id);return mod;});
globalThis.location={search:'?sceneModule=on',hostname:'localhost'};
export async function walkMainline(onTop){
globalThis.__k=0;globalThis.__stuck=0;
let save,trace=[],end;
save=opening.createQingyuOpeningPlaytestSave(mods[0],new Date().toISOString(),2);const bypass=new Set();
for(let n=0;n<2000;n++){
 let r=save.世界.状态.剧本模组,event=rt.getScenarioFocusEvent(r);
 if(onTop)onTop(save,event,n);
 if(host.sceneCandidate(save)&&!bypass.has(event?.id)){
  const deps={persist:async next=>{save=structuredClone(next);},askIntent:async()=>{
   const state=ext.activeScene(save).state;
   {const cid=String(state.contractId||'');if(/^combat\.f0[1245]/.test(cid)){const t={'combat.f02':'snake_man','combat.f04':'crow_man'}[cid.slice(0,10)];return JSON.stringify(t?{goal:'attack',claim:{magnitude:3,scope:'single',targets:[t]},levers:[],inputClass:'action'}:{goal:'defend',claim:{magnitude:1,scope:'single',targets:['pc']},levers:[],inputClass:'action'});}}
   if(!/^combat\.f0[1-5]|^combat\.f1[03]/.test(String(state.contractId||''))){const c=reg.sceneContractById(state.contractId);const goals=(c?.goals||[]).filter(g=>(g.type||'push')==='push'&&!/yield|expose/.test(g.id));const opp=(c?.parties||[]).filter(p=>p.side==='opposed'&&!p.absent).map(p=>p.id);const left=opp.filter(id=>!['final'].includes(String(state.tracks?.[id]?.vit))&&Number(state.tracks?.[id]?.vit||0)<9);const pairs=[];for(const g of (goals.length?goals:(c?.goals||[]).filter(g=>!/yield|expose/.test(g.id))))for(const p of opp)pairs.push([g,p]);globalThis.__k=(globalThis.__k||0)+1;const [g,tgt]=pairs[globalThis.__k%pairs.length]||[];return JSON.stringify({goal:g?.id,claim:{magnitude:3,scope:'single',targets:tgt?[tgt]:[]},levers:[],inputClass:'action'});}
   if(state.contractId==='combat.f03')return JSON.stringify({goal:'capture',claim:{magnitude:3,scope:'all',targets:['foe_a','foe_b','foe_c','foe_d','foe_pack']},levers:[],inputClass:'action'});
   if(state.beat<4)return JSON.stringify({goal:'survive_duel',claim:{magnitude:1,scope:'single',targets:['pc']},levers:[],inputClass:'action'});
   const target=(state.tracks.hu_sha?.vit||0)<2?'hu_sha':'dan_chen';
   return JSON.stringify({goal:target==='hu_sha'?'destroy_tiger':'subdue_alive',claim:{magnitude:3,scope:'single',targets:[target]},levers:target==='hu_sha'&&state.beat>=5?[{element:'true_yang_blood',verb:'use_blood',evidence:'抹血'}]:[],inputClass:'action'});
  }};
  await host.submitSceneInput(save,'我挡住袭击',deps);
  ext.activeScene(save).state.forced={action:Array(200).fill(20),defense:Array(400).fill(20)};
  for(let beat=0;ext.activeScene(save)&&beat<120;beat++){
   if(!ext.activeScene(save).pending)await host.submitSceneInput(save,'我抹血攻击骨虎，制服丹宸',deps);
   const A=ext.activeScene(save);if(!A.pending&&A.phase==='fighting'){globalThis.__stuck=(globalThis.__stuck||0)+1;if(globalThis.__stuck<40)continue;}if(!A.pending||A.phase!=='fighting'){throw Error('scene stuck '+A.state?.contractId);}
   await host.confirmSceneAction(save,deps);
  }
  if(ext.activeScene(save))throw Error('unclosed scene');
  trace.push({battle:event.id,mode:'new-host-controlled-success-fixture'});if(rt.getScenarioFocusEvent(save.世界.状态.剧本模组)?.id===event?.id)bypass.add(event.id);
  continue;
 }
 if(r.gameOver){end={kind:'gameOver',save};break;}
 if(r.nextStageReadyId){const t=init.transitionToNextScenarioStage(save,mods);if(!t.ok){end={kind:'transition',reason:t.reason,save};break;}save=t.saveData;trace.push({stage:save.世界.状态.剧本模组.modId});continue;}
 if(event?.id==='lcq.event.s02_01'){
  rt.trackStoryOpportunity(save,'opportunity.lcq.s02_01.take_full_mandate');
  const a=rt.getTrackedStoryOpportunityActions(save)[0];if(a){rt.recordStoryOpportunityStructuredAction(save,a);r.worldTurn++;save=rt.advanceScenarioRuntime(save).saveData;continue;}
 }
 const actions=rt.getCurrentStoryEventActions(save),a=actions.find(a=>event?.playerCompletionContract?.actions.some(c=>c.id===a.actionId))||actions.find(a=>a.actionId.startsWith('travel:'));
 if(!event){end={kind:'no_focus',save};break;}
 if(!a)throw Error('no action '+event?.id+' '+JSON.stringify(actions.map(a=>a.actionId)));
 r.worldTurn++;
 const receipt=rt.recordStoryEventStructuredAction(save,a);
 if(receipt.reason==='open_world_prerequisites'){
  const local=wuyuan.resolveWuyuanOpenWorldSelectionFromText(save,'我去点心铺')||wuyuan.getWuyuanOpenWorldSelections(save).find(a=>a.kind==='problem_action')||wuyuan.getWuyuanOpenWorldSelections(save).find(a=>a.kind==='travel');
  if(!local)throw Error('no local');const got=wuyuan.settleWuyuanOpenWorldSelection(save,local);if(!got.settled)throw Error(JSON.stringify(got));trace.push({local});
 }else if(!receipt.attempted)throw Error(JSON.stringify({n,event:event?.id,action:a,receipt}));
 else trace.push({event:a.eventId,action:a.actionId,outcome:receipt.outcome});
 save=rt.advanceScenarioRuntime(save).saveData;
 // 真机每回合推进后还会跑 ensureWuyuanOpenWorldSlice（AIBidirectionalSystem / legacyNarratorPacket），它会改写位置；缺了这一步，O2/Y3 的位置错位在夹具里测不出来。
 wuyuan.ensureWuyuanOpenWorldSlice(save);
}

return {save,trace,end};
}
