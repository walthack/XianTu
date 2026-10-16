/** Pack quest lines: numbers substitution, echo expansion and event projection. Pure functions; the compiler owns IO. */
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
const fail=s=>{throw new Error(`Content Pack: ${s}`);};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export const NUMBERS_FILE='mod-kit/game-numbers.qingyu.json';
export async function loadNumbers(sourceRoot){return JSON.parse(await readFile(join(sourceRoot,NUMBERS_FILE),'utf8'));}
/** {"$num":"lineBonds.ningyu.careWarm"} is replaced by the configured value; every number lives in the numbers file. */
export function resolveNumbers(value,numbers,where='pack'){
 if(Array.isArray(value))return value.map((v,i)=>resolveNumbers(v,numbers,`${where}.${i}`));
 if(!object(value))return value;
 if('$num' in value){
  if(Object.keys(value).length!==1||typeof value.$num!=='string')fail(`${where}: $num must stand alone`);
  const v=value.$num.split('.').reduce((o,k)=>o?.[k],numbers);
  if(!['number','string','boolean'].includes(typeof v)||(typeof v==='number'&&!Number.isFinite(v)))fail(`${where}: unknown number ${value.$num}`);
  return v;
 }
 return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolveNumbers(v,numbers,`${where}.${k}`)]));
}
const variantId=(stepId,value)=>`${stepId}.v_${value}`;
/**
 * A beat with `echo` reads one earlier state. Every step gets one sibling per variant value, visible only while the state equals it;
 * the original step stays visible while the state is unset / any other value. Completion receipts and per-action effects follow.
 */
export function expandEchoes(line){
 const out=structuredClone(line);
 for(const beat of out.beats){
  if(!beat.echo)continue;
  const {reads,variants}=beat.echo,values=Object.keys(variants);
  for(const v of values)if(!/^[a-z0-9_]+$/.test(v))fail(`${beat.id}: echo value ${v} must be [a-z0-9_]+`);
  if(!beat.steps?.length)fail(`${beat.id}: echo needs steps`);
  const flag=`flags.${reads}`,steps=[],added=new Map();
  for(const step of beat.steps){
   steps.push({...step,visibleWhen:[...(step.visibleWhen||[]),...values.map(value=>({path:flag,operator:'neq',value}))]});
   for(const value of values){
    const v=variants[value],id=variantId(step.actionId,value),outcomeId=v.outcomeIds?.[step.actionId];
    steps.push({...step,actionId:id,variantOf:step.actionId,visibleWhen:[...(step.visibleWhen||[]),{path:flag,operator:'eq',value}],...(v.previousId?{previousId:v.previousId}:{}),...(outcomeId?{outcomeId}:{})});
    (added.get(step.actionId)||added.set(step.actionId,[]).get(step.actionId)).push(id);
   }
  }
  beat.steps=steps;
  const receipts=r=>[r,...(added.get(r.eventActionReceipt.actionId)||[]).map(actionId=>({eventActionReceipt:{...r.eventActionReceipt,actionId}}))];
  const list=beat.completedBy.anyOf||[beat.completedBy];
  beat.completedBy={anyOf:list.flatMap(receipts)};
  for(const [base,ids] of added)if(beat.byAction?.[base])for(const id of ids)beat.byAction[id]=structuredClone(beat.byAction[base]);
 }
 return out;
}
/** Returns Map<stageId, event[]>. The events are plain additions (never replacements) so the rail's own events are untouched. */
const atLocations=c=>!c?[]:c.atLocation?[c.atLocation]:[...(c.all||[]),...(c.any||[])].flatMap(atLocations);
export function projectQuestLineEvents({lines,stages,texts,intentMatches,guardCovers,routeLocationNames={}}){
 const text=id=>{const t=texts[id];if(typeof t!=='string'||!t)fail(`missing text ${id}`);return t;};
 const out=new Map(),seen=new Set();
 for(const line of lines)for(const b of line.beats){
  if(seen.has(b.eventId))fail(`duplicate projected event ${b.eventId}`);seen.add(b.eventId);
  const stage=stages.get(b.stageId);if(!stage)fail(`${b.id}: unknown stage ${b.stageId}`);
  if(stage.scenario.events.some(e=>e.id===b.eventId))fail(`${b.id}: event ${b.eventId} already exists in ${b.stageId}`);
  for(const actor of b.presentActorIds||[])if(!stage.canon.characters.some(c=>c.id===actor))fail(`${b.id}: ${actor} is not in ${b.stageId} canon`);
  if(!stage.canon.locations.some(x=>x.id===b.locationId))fail(`${b.id}: location ${b.locationId} is not in ${b.stageId} canon`);
  const placeId=b.sceneLocationId||b.locationId,location=stage.canon.locations.find(x=>x.id===placeId)?.name||routeLocationNames[placeId];if(!location)fail(`${b.id}: location ${placeId} has no name`);
  for(const at of atLocations(b.requires))if(at!==placeId)fail(`${b.id}: requires atLocation ${at} but the beat plays at ${placeId}; declare sceneLocationId for the place the player is actually in`);
  const card=b.card?{previous:text(b.card.previousId),tension:text(b.card.tensionId)}:undefined;
  const brief=text(b.briefId),guarded=guardCovers(b.stageId);
  const actions=b.steps.map(a=>{
   const previous=a.previousId?text(a.previousId):card?.previous,outcome=text(a.outcomeId),match=a.intentMatchId?intentMatches[a.intentMatchId]:undefined;
   if(a.intentMatchId&&!match)fail(`${b.id}: unknown intent match ${a.intentMatchId}`);
   if(a.replyMode==='model'&&!guarded)fail(`${b.id}: replyMode=model needs the step narrative guard, which ${b.stageId} does not have; keep replyMode=fixed`);
   const sceneObjective=card?(guarded||!previous?card.tension:`承上：${previous} 当下：${card.tension}`):brief;
   return {id:a.actionId,label:text(a.labelId),actionText:text(a.intentId),timeCost:1,kind:a.kind,requiresPreparation:a.requiresPreparation||[],...(a.grantsPreparation?{grantsPreparation:a.grantsPreparation}:{}),requiresPresentCharacterIds:a.requiresPresentActors||[],
    ...(a.visibleWhen?{visibleWhen:a.visibleWhen}:{}),cast:{present:b.presentActorIds||[]},sceneLocation:location,sceneObjective,...(previous?{previousBeat:previous}:{}),fallbackText:outcome,
    ...(a.replyMode==='fixed'?{forceFixed:true}:{}),...(a.replyMode==='model'&&a.forbidden?{forbidden:a.forbidden}:{}),
    outcomeText:{success:outcome,partial:outcome,failure:outcome},intentMatch:match||{matchAny:[text(a.intentId),text(a.labelId)]}};
  });
  const event={id:b.eventId,name:text(line.nameId),description:brief,objective:text(b.objectiveId),axisAnchor:`第${b.canonChapter}章`,critical:false,conditions:[],
   completion:[{path:`flags.event.${b.eventId.replace(/^lcq\.event\./,'')}.done`,operator:'eq',value:true}],relatedCharacterIds:b.presentActorIds||[],locationId:b.locationId,exploration:{role:'seed'},questLineBeatId:b.id,sharedExperience:b.sharedExperience||'default',
   playerCompletionContract:{kind:'objective_action',settleOn:['success'],actions}};
  (out.get(b.stageId)||out.set(b.stageId,[]).get(b.stageId)).push(event);
 }
 return out;
}
