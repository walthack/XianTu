import {QUEST_LINES,lineConditionMet,type LineContext,type LineState} from './questLines';
import {affinityOf,runtimeEntityId} from './ledger/affinityIdentity';
import {namingChapter} from './ledger/naming';
import {stepScene} from './fixedEndingNarratives';
import {canonicalLocationId} from './travel/locationIds';
import {currentLocation} from './travel/travelLedger';
/** Scene cards are code-owned declarations. A prose mention never adds presence. */
export function questLineContext(save:any,focusId?:string):LineContext {
 const r=save.世界.状态.剧本模组,locationId=currentLocation(save).canonicalLocationId||canonicalLocationId(save.角色?.位置?.地点ID||'');
 const departed=(id:string)=>['dead','missing','departed'].includes(r.sceneLedger?.actors?.[id]?.status)||['dead','missing','departed'].includes(r.flags?.[`character.${id.split('.').at(-1)}.status`]);
 const candidates=new Set<string>();
 for(const id of [focusId,r.sceneLedger?.lastBeat?.eventId].filter(Boolean))for(const ref of stepScene(r,id)?.cast?.present||[])candidates.add(runtimeEntityId(r,ref));
 for(const [id,a]of Object.entries(r.sceneLedger?.actors||{}))if((a as any).status==='present')candidates.add(id);
 const ctx:LineContext={completedEventIds:[...(r.completedEventIds||[]),...(r.travelLedger?.doneEventIds||[])],activeEventIds:(r.activeEventIds||[]).filter((id:string)=>{const e=r.events.find((e:any)=>e.id===id);return !e?.locationId||canonicalLocationId(e.locationId)===locationId;}),presentActorIds:[],knownFactIds:Object.values(r.playerKnowledge||{}).filter((f:any)=>f.status==='confirmed').map((f:any)=>f.factId),locationId,chapterOrder:{},currentChapterOrder:namingChapter(r),affinity:Object.fromEntries(QUEST_LINES.flatMap(l=>l.ownerCharacterIds).map(id=>[id,affinityOf(save,id)])),flags:r.flags||{}};
 for(const ch of r.chapters||[]){const n=(ch.eventIds||[]).map((id:string)=>r.events.find((e:any)=>e.id===id)?.axisAnchor?.match(/第(\d+)章/)?.[1]).map(Number).filter((n:number)=>n>0);if(n.length)ctx.chapterOrder[ch.id]=Math.min(...n);}
 // Author-declared optional scene cast is valid only within its true location/window.
 for(const l of QUEST_LINES)if(lineConditionMet(l.entry,ctx)&&(!l.closeWhen||!lineConditionMet(l.closeWhen,ctx)))for(const b of l.beats)if(canonicalLocationId(b.locationId||'')===locationId&&(!b.closeWhen||!lineConditionMet(b.closeWhen,ctx)))for(const id of b.presentActorIds||[])if(r.canon.characters.some((c:any)=>c.id===id))candidates.add(id);
 ctx.presentActorIds=[...candidates].filter(id=>!departed(id));return ctx;
}
export function questLineOffer(save:any,eventId:string,focusId?:string){
 const r=save.世界.状态.剧本模组,ctx=questLineContext(save,focusId),state:LineState=r.questLineState||{version:1,receipts:{}};
 for(const line of QUEST_LINES){const beat=line.beats.find(b=>b.eventId===eventId);if(!beat)continue;
  if(state.receipts[beat.id]||state.expired?.[beat.id]||!lineConditionMet(line.entry,ctx)||(line.closeWhen&&lineConditionMet(line.closeWhen,ctx))||(beat.closeWhen&&lineConditionMet(beat.closeWhen,ctx))||(beat.requires&&!lineConditionMet(beat.requires,ctx)))return null;
  if(beat.ifOwnerAbsent==='no_trigger'&&!line.ownerCharacterIds.every(id=>ctx.presentActorIds.includes(id)))return null;
  return {line,beat,ctx};
 }
 return null;
}
export function expireQuestLineWindows(save:any){
 const r=save.世界.状态.剧本模组,ctx=questLineContext(save),state=r.questLineState||={version:1,receipts:{}};
 for(const line of QUEST_LINES)for(const b of line.beats){if(state.receipts[b.id])continue;const close=(line.closeWhen&&lineConditionMet(line.closeWhen,ctx))||(b.closeWhen&&lineConditionMet(b.closeWhen,ctx));if(close){(state.expired||={})[b.id]=r.worldTurn;r.activeEventIds=r.activeEventIds.filter((id:string)=>id!==b.eventId);}}
}
/** Preserve an authored optional stop until completion or an explicit departure; never require doing it. */
export function deferOptionalDeparture(save:any,eventId:string):boolean {
 const contains=(c:any):boolean=>!!c&&('eventDone'in c?c.eventDone===eventId:'all'in c?c.all.some(contains):'any'in c?c.any.some(contains):false);
 return QUEST_LINES.some(l=>contains(l.entry)&&l.beats.some(b=>!!questLineOffer(save,b.eventId)));
}
