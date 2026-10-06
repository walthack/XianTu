import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
const table=read('mod-kit/quest-lines/lines.json'),res=read('mod-kit/quest-lines/resources.json');
export function stripQuestLineProjection(mod){
 const ids=new Set(table.lines.flatMap(l=>l.beats.map(b=>b.eventId)));
 if(Array.isArray(mod.scenario?.events))mod.scenario.events=mod.scenario.events.filter(e=>!ids.has(e.id));
 if(mod.scenario)delete mod.scenario.optionalActorIds;
 for(const ch of mod.scenario.chapters||[])ch.eventIds=ch.eventIds.filter(id=>!ids.has(id));
 if(Array.isArray(mod.canon?.characters))mod.canon.characters=mod.canon.characters.filter(c=>!c.questLineActor);
 return mod;
}
/** Sole source is line data; published event/chapter copies are disposable projections. */
export function projectQuestLines(mod){
 stripQuestLineProjection(mod);
 const selected=table.lines.flatMap(l=>l.beats.filter(b=>b.stageId===mod.manifest.id).map(b=>({l,b})));
 for(const {l,b}of selected){
  const title=res.texts[l.nameId]||l.name,objective=res.texts[b.objectiveId]||b.objective;
  const event={id:b.eventId,name:title,description:res.texts[b.briefId],objective,axisAnchor:`第${b.canonChapter}章`,critical:false,conditions:[],completion:[{path:`flags.event.${b.eventId.replace(/^lcq.event./,'')}.done`,operator:'eq',value:true}],relatedCharacterIds:b.presentActorIds,locationId:b.locationId,exploration:{role:'seed'},questLineBeatId:b.id,sharedExperience:b.sharedExperience,
   playerCompletionContract:{kind:'objective_action',settleOn:['success'],actions:b.steps.map(a=>({id:a.actionId,label:res.texts[a.labelId],actionText:res.texts[a.intentId],timeCost:1,kind:a.kind,requiresPreparation:a.requiresPreparation||[],...(a.grantsPreparation?{grantsPreparation:a.grantsPreparation}:{}),requiresPresentCharacterIds:a.requiresPresentActors||[],cast:{present:b.presentActorIds},sceneLocation:mod.canon.locations.find(x=>x.id===b.locationId)?.name||'',sceneObjective:res.texts[b.briefId],fallbackText:res.texts[a.outcomeId],outcomeText:{success:res.texts[a.outcomeId],partial:res.texts[a.outcomeId],failure:res.texts[a.outcomeId]},intentMatch:a.intentMatchId?res.intentMatches[a.intentMatchId]:{matchAny:[res.texts[a.intentId],res.texts[a.labelId]]}}))}};
  mod.scenario.events.push(event);
  const ch=mod.scenario.chapters.find(x=>x.id===b.chapterId);if(!ch)throw Error(`unknown line chapter ${b.chapterId}`);ch.eventIds.push(event.id);
  for(const id of b.presentActorIds||[])if(!mod.canon.characters.some(c=>c.id===id)){
   const entry=read('src/modules/scenarioMods/builtins/character-registry.json').characters.find(c=>c.id===id);if(!entry)throw Error(`unknown line actor ${id}`);
   (mod.scenario.optionalActorIds ||= []).push(id);
  }
 }
 return mod;
}
