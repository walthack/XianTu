// 测试用：从真实存档沿生产剧情动作推进到下一场场面合同（与 scripts/generate-scene-combat-checkpoints.mjs 同一条链路，不写完成旗标）。
import {readFile} from 'node:fs/promises';
import {loadTs} from './loadTs.mjs';
const rt=await loadTs('../src/modules/scenarioMods/runtime.ts'),init=await loadTs('../src/modules/scenarioMods/strictInitializer.ts'),wuyuan=await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const host=await loadTs('../src/modules/sceneModule/host/controller.ts'),packs=await loadTs('../src/modules/contentPacks/index.ts');
const STAGES=['lcq.stage_01','lcq.stage_02','lcq.stage_03','lcq.stage_05','lcq.stage_03b_snake_flower_bridge','lcq.stage_04','lcq.stage_04b_lingfei_baiyi_crisis','lcq.stage_05b'];
let mods;
const loadMods=async()=>mods||=await Promise.all(STAGES.map(id=>readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`,import.meta.url),'utf8').then(JSON.parse).then(packs.applyContentPackOverlays)));
/** 真机导出的存档包 → 存档数据。 */
export function unwrapSave(raw){const find=(o,d=0)=>{if(!o||typeof o!=='object'||d>5)return null;if(o.角色&&o.元数据)return o;for(const v of Object.values(o)){const r=find(v,d+1);if(r)return r}return null};return find(raw.payload||raw);}
export async function readSaveFixture(path){return unwrapSave(JSON.parse(await readFile(new URL(path,import.meta.url),'utf8')));}
/** 推进到 sceneCandidate 出现（或指定事件）为止；返回新存档。 */
export async function advanceToScene(save,{eventId,maxSteps=200}={}){
 const all=await loadMods();
 for(let n=0;n<maxSteps;n++){
  const r=save.世界.状态.剧本模组,event=rt.getScenarioFocusEvent(r);
  if(host.sceneCandidate(save)&&(!eventId||event?.id===eventId))return save;
  if(r.gameOver)throw Error('ended '+JSON.stringify(r.gameOver));
  if(r.nextStageReadyId){const t=init.transitionToNextScenarioStage(save,all);if(!t.ok)throw Error(t.reason);save=t.saveData;continue;}
  if(event?.id==='lcq.event.s02_01'){rt.trackStoryOpportunity(save,'opportunity.lcq.s02_01.take_full_mandate');const a=rt.getTrackedStoryOpportunityActions(save)[0];if(a){rt.recordStoryOpportunityStructuredAction(save,a);r.worldTurn++;save=rt.advanceScenarioRuntime(save).saveData;continue;}}
  const actions=rt.getCurrentStoryEventActions(save),a=actions.find(a=>event?.playerCompletionContract?.actions.some(c=>c.id===a.actionId))||actions.find(a=>a.actionId.startsWith('travel:'))||actions[0];
  if(!a)throw Error('no action '+event?.id);
  r.worldTurn++;const receipt=rt.recordStoryEventStructuredAction(save,a);
  if(receipt.reason==='open_world_prerequisites'){const local=wuyuan.resolveWuyuanOpenWorldSelectionFromText(save,'我去点心铺')||wuyuan.getWuyuanOpenWorldSelections(save).find(a=>a.kind==='problem_action')||wuyuan.getWuyuanOpenWorldSelections(save).find(a=>a.kind==='travel');if(!local)throw Error('no local');wuyuan.settleWuyuanOpenWorldSelection(save,local);}
  else if(!receipt.attempted)throw Error(JSON.stringify({event:event?.id,receipt}));
  save=rt.advanceScenarioRuntime(save).saveData;
 }
 throw Error('未推进到场面合同');
}
