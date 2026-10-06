// Fresh opening save + production contract replay; no imported checkpoint or direct done-flag writes.
// Previous encounters use deterministic success fixtures, not real-LLM acceptance evidence.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {loadTs} from '../tests/loadTs.mjs';
const outputDir=process.argv[2]||'_newbot_tmp/combat-checkpoints';
await mkdir(outputDir,{recursive:true});
const rt=await loadTs('../src/modules/scenarioMods/runtime.ts'),init=await loadTs('../src/modules/scenarioMods/strictInitializer.ts'),opening=await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts'),wuyuan=await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const registry=await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const host=await loadTs('../src/modules/sceneModule/host/controller.ts'),ext=await loadTs('../src/modules/sceneModule/host/ext.ts');
const ids=['lcq.stage_01','lcq.stage_02','lcq.stage_03','lcq.stage_05','lcq.stage_03b_snake_flower_bridge','lcq.stage_04','lcq.stage_04b_lingfei_baiyi_crisis','lcq.stage_05b'];
const mods=await Promise.all(ids.map(id=>readFile(`src/modules/scenarioMods/builtins/data/${id}.json`,'utf8').then(JSON.parse)));
const targets=new Map([['lcq.event.iron_bridge_ambush','F01'],['lcq.event.s03b_snake_flower_bridge_01','F02'],['lcq.event.s04b_lingfei_baiyi_crisis_03','F04'],['lcq.event.s04b_lingfei_baiyi_crisis_10','F05'],['lcq.event.s04_02','F03'],['lcq.event.s05b_05b_ideology_duel_and_defeat','F10'],['lcq.event.ghost_king_swallowed','F13']]);
globalThis.location={search:'?sceneModule=on',hostname:'localhost'};
let save=opening.createQingyuOpeningPlaytestSave(mods[0],new Date().toISOString(),2),trace=[];const done=new Set();
for(let n=0;n<600;n++){
 let r=save.世界.状态.剧本模组,event=rt.getScenarioFocusEvent(r);
 if(targets.has(event?.id)&&!done.has(event.id)&&host.sceneCandidate(save)){
  const label=targets.get(event.id);save.元数据.存档名=`新档连续合同回放 · ${label}前`;
  save.系统.扩展.战斗检查点来源={version:1,createdFrom:'createQingyuOpeningPlaytestSave',route:'new-save-production-action-replay',target:event.id,controlledBattleReplay:true,newSceneReady:true};
  await writeFile(`${outputDir}/${label}-before.raw.json`,JSON.stringify(save,null,2)+'\n');
  const bundle={type:'saves',saves:[{存档名:save.元数据.存档名,存档数据:save}]};
  await writeFile(`${outputDir}/${label}-before.json`,JSON.stringify(bundle,null,2)+'\n');
  done.add(event.id);console.log('CHECKPOINT',label,n,r.modId);
  if(done.size===targets.size)break;
 }
 if(host.sceneCandidate(save)){
  const deps={persist:async next=>{save=structuredClone(next);},askIntent:async()=>{
   const state=ext.activeScene(save).state;
   const contract=registry.sceneContractById(state.contractId);
   if(/^combat\.f0[1245]\./.test(state.contractId)){
    const target=contract.parties.find(p=>p.side==='opposed'&&p.id!=='blood_tiger'&&(state.tracks[p.id]?.vit||0)<p.tracks[0].scale.indexOf(p.tracks[0].ending.finalState))?.id;
    return JSON.stringify({goal:'attack',claim:{magnitude:3,scope:'single',targets:target?[target]:[]},levers:[],inputClass:'action'});
   }
   if(state.contractId==='combat.f03.mountain_stream_fog')return JSON.stringify({goal:'capture',claim:{magnitude:3,scope:'all',targets:registry.sceneContractById(state.contractId).parties.filter(p=>p.side==='opposed').map(p=>p.id)},levers:[],inputClass:'action'});
   if(state.beat<4)return JSON.stringify({goal:'survive_duel',claim:{magnitude:1,scope:'single',targets:['pc']},levers:[],inputClass:'action'});
   const target=(state.tracks.hu_sha?.vit||0)<2?'hu_sha':'dan_chen';
   return JSON.stringify({goal:target==='hu_sha'?'destroy_tiger':'subdue_alive',claim:{magnitude:3,scope:'single',targets:[target]},levers:target==='hu_sha'&&state.beat>=4?[{element:'true_yang_blood',verb:'use_blood',evidence:'抹血'}]:[],inputClass:'action'});
  }};
  await host.submitSceneInput(save,event.id==='lcq.event.s04_02'?'我擒住所有武士留下活口':'我挡住袭击',deps);
  ext.activeScene(save).state.forced={action:Array(30).fill(20),defense:Array(100).fill(20)};
  for(let beat=0;ext.activeScene(save)&&beat<30;beat++){
   if(!ext.activeScene(save).pending)await host.submitSceneInput(save,event.id==='lcq.event.s04_02'?'我擒住所有武士留下活口':'我抹血攻击骨虎，制服丹宸',deps);
   await host.confirmSceneAction(save,deps);
  }
  if(ext.activeScene(save))throw Error('unclosed scene');
  trace.push({battle:event.id,mode:'new-host-controlled-success-fixture'});
  continue;
 }
 if(r.gameOver)throw Error('ended '+JSON.stringify(r.gameOver));
 if(r.nextStageReadyId){const t=init.transitionToNextScenarioStage(save,mods);if(!t.ok)throw Error(t.reason);save=t.saveData;trace.push({stage:save.世界.状态.剧本模组.modId});continue;}
 if(event?.id==='lcq.event.s02_01'){
  rt.trackStoryOpportunity(save,'opportunity.lcq.s02_01.take_full_mandate');
  const a=rt.getTrackedStoryOpportunityActions(save)[0];if(a){rt.recordStoryOpportunityStructuredAction(save,a);r.worldTurn++;save=rt.advanceScenarioRuntime(save).saveData;continue;}
 }
 const actions=rt.getCurrentStoryEventActions(save),a=actions.find(a=>event?.playerCompletionContract?.actions.some(c=>c.id===a.actionId))||actions.find(a=>a.actionId.startsWith('travel:'));
 if(!a)throw Error('no action '+event?.id+' '+JSON.stringify(actions));
 r.worldTurn++;
 const receipt=rt.recordStoryEventStructuredAction(save,a);
 if(receipt.reason==='open_world_prerequisites'){
  const local=wuyuan.resolveWuyuanOpenWorldSelectionFromText(save,'我去点心铺')||wuyuan.getWuyuanOpenWorldSelections(save).find(a=>a.kind==='problem_action')||wuyuan.getWuyuanOpenWorldSelections(save).find(a=>a.kind==='travel');
  if(!local)throw Error('no local');const got=wuyuan.settleWuyuanOpenWorldSelection(save,local);if(!got.settled)throw Error(JSON.stringify(got));trace.push({local});
 }else if(!receipt.attempted)throw Error(JSON.stringify({n,event:event?.id,action:a,receipt}));
 else trace.push({event:a.eventId,action:a.actionId,outcome:receipt.outcome});
 save=rt.advanceScenarioRuntime(save).saveData;
}
await writeFile(`${outputDir}/replay.json`,JSON.stringify(trace,null,2)+'\n');
if(done.size!==targets.size)throw Error('检查点未全部生成：'+[...targets.values()].join(','));
console.log('DONE',done.size);
