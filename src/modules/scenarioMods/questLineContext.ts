import {QUEST_LINES,lineConditionMet,type LineContext,type LineState} from './questLines';
import {affinityOf,runtimeEntityId} from './ledger/affinityIdentity';
import {namingChapter} from './ledger/naming';
import {stepScene} from './fixedEndingNarratives';
import {canonicalLocationId,locationAncestors} from './travel/locationIds';
import {namedEntity} from './namedEntities';
import {currentLocation} from './travel/travelLedger';
import {orderedDoneEventIds} from './playerLedgerRules';
import {storyRouteLocation} from './eventNarrativeView';
import {authoritativeAbsentCharacterIds} from './presence';
/** 作者写死的商路/押送主线拍（storyRouteLocation）已开始行动（动作落账或本拍已演）：被推迟的强制路线不再等支线，先把人送到这拍的地点。 */
export function mainRouteBeatUnderway(save:any):boolean {
 const r=save?.世界?.状态?.剧本模组;if(!r)return false;
 const questBeatIds=new Set(QUEST_LINES.flatMap(l=>l.beats.map(b=>b.eventId)));
 return (r.activeEventIds||[]).some((id:string)=>{
  if(questBeatIds.has(id)||id.includes('_ins_')||!storyRouteLocation(id)||(r.completedEventIds||[]).includes(id))return false;
  const st=r.eventActionStates?.[id];
  if((st&&((st.preparations||[]).length||(st.attempts||[]).length||st.attemptCount>0))||r.sceneLedger?.lastBeat?.eventId===id)return true;
  // 兜底：上一站的离开被推迟之后玩家又过了一回合（手打行动、叙事已往前写），本地位置不再停在上一站。
  const l=r.travelLedger,turn=Number(r.worldTurn)||0;
  const held=(l?.deferredDepartureEventIds||[]).filter((e:string)=>!(l.doneEventIds||[]).includes(e)).map((e:string)=>l.deferredAtTurn?.[e]).filter((t:unknown)=>Number.isFinite(t));
  return held.length>0&&turn>Math.max(...held);
 });
}
/** Scene cards are code-owned declarations. A prose mention never adds presence.
 * 已完成事件读编年史（跨关，orderedDoneEventIds＝done.* 同一口径），不读切关即重置的 rt.completedEventIds（右栏线入口复用分析 2026-10-27 §3-1／§7-1）。 */
export function questLineContext(save:any,focusId?:string):LineContext {
 const r=save.世界.状态.剧本模组,locationId=currentLocation(save).canonicalLocationId||canonicalLocationId(save.角色?.位置?.地点ID||'');
 const containing=(id:string)=>id?[id,...locationAncestors(id)]:[],zoneWorld=locationId?String(namedEntity('location',locationId)?.worldLocationId||''):'',locationIds=[...new Set([...containing(locationId),...containing(canonicalLocationId(zoneWorld))])];
 const held=new Set(authoritativeAbsentCharacterIds(r));
 const departed=(id:string)=>held.has(id)||['dead','missing','departed'].includes(r.sceneLedger?.actors?.[id]?.status)||['dead','missing','departed'].includes(r.flags?.[`character.${id.split('.').at(-1)}.status`]);
 const candidates=new Set<string>();
 for(const id of [focusId,r.sceneLedger?.lastBeat?.eventId].filter(Boolean))for(const ref of stepScene(r,id)?.cast?.present||[])candidates.add(runtimeEntityId(r,ref));
 for(const [id,a]of Object.entries(r.sceneLedger?.actors||{}))if((a as any).status==='present')candidates.add(id);
 const ctx:LineContext={completedEventIds:[...new Set([...orderedDoneEventIds(r),...(r.travelLedger?.doneEventIds||[])])],activeEventIds:(r.activeEventIds||[]).filter((id:string)=>{const e=r.events.find((e:any)=>e.id===id);return !e?.locationId||locationIds.includes(canonicalLocationId(e.locationId));}),preparations:Object.fromEntries(Object.entries(r.eventActionStates||{}).map(([id,s]:[string,any])=>[id,Array.isArray(s?.preparations)?s.preparations:[]])),presentActorIds:[],knownFactIds:Object.values(r.playerKnowledge||{}).filter((f:any)=>f.status==='confirmed').map((f:any)=>f.factId),locationId,locationIds,chapterOrder:{},currentChapterOrder:namingChapter(r),affinity:Object.fromEntries(QUEST_LINES.flatMap(l=>l.ownerCharacterIds).map(id=>[id,affinityOf(save,id)])),flags:r.flags||{}};
 for(const ch of r.chapters||[]){const n=(ch.eventIds||[]).map((id:string)=>r.events.find((e:any)=>e.id===id)?.axisAnchor?.match(/第(\d+)章/)?.[1]).map(Number).filter((n:number)=>n>0);if(n.length)ctx.chapterOrder[ch.id]=Math.min(...n);}
 // Author-declared optional scene cast is valid only within its true location/window.
 for(const l of QUEST_LINES)if(lineConditionMet(l.entry,ctx)&&(!l.closeWhen||!lineConditionMet(l.closeWhen,ctx)))for(const b of l.beats)if(locationIds.includes(canonicalLocationId(b.sceneLocationId||b.locationId||''))&&(!b.closeWhen||!lineConditionMet(b.closeWhen,ctx)))for(const id of b.presentActorIds||[])if(r.canon.characters.some((c:any)=>c.id===id))candidates.add(id);
 ctx.presentActorIds=[...candidates].filter(id=>!departed(id));return ctx;
}
export function questLineOffer(save:any,eventId:string,focusId?:string){
 const r=save.世界.状态.剧本模组,ctx=questLineContext(save,focusId),state:LineState=r.questLineState||{version:1,receipts:{}};
 for(const line of QUEST_LINES){const beat=line.beats.find(b=>b.eventId===eventId);if(!beat)continue;
  if(state.closedLines?.[line.id]!==undefined||state.receipts[beat.id]||state.expired?.[beat.id]!==undefined||!lineConditionMet(line.entry,ctx)||(line.closeWhen&&lineConditionMet(line.closeWhen,ctx))||(beat.closeWhen&&lineConditionMet(beat.closeWhen,ctx))||(beat.requires&&!lineConditionMet(beat.requires,ctx)))return null;
  if(beat.ifOwnerAbsent==='no_trigger'&&!line.ownerCharacterIds.every(id=>ctx.presentActorIds.includes(id)))return null;
  return {line,beat,ctx};
 }
 return null;
}
/** 关窗规则改过的旧档迁移：拍的当前定义里线与拍都已无 closeWhen、又没有完成回执，旧 expired 记录作废；带 onExpire 的拍效果可能已落，不动（是否回滚待定）。 */
export function clearStaleQuestLineExpiry(save:any){
 const state=save?.世界?.状态?.剧本模组?.questLineState;if(!state?.expired)return;
 for(const line of QUEST_LINES)for(const b of line.beats)if(state.expired[b.id]!==undefined&&!line.closeWhen&&!b.closeWhen&&!state.receipts?.[b.id]&&state.closedLines?.[line.id]===undefined&&!b.onExpire?.length)delete state.expired[b.id];
}
export function expireQuestLineWindows(save:any){
 clearStaleQuestLineExpiry(save);
 const r=save.世界.状态.剧本模组,ctx=questLineContext(save),state=r.questLineState||={version:1,receipts:{}};
 for(const line of QUEST_LINES)for(const b of line.beats){if(state.receipts[b.id]||state.closedLines?.[line.id]!==undefined)continue;const close=(line.closeWhen&&lineConditionMet(line.closeWhen,ctx))||(b.closeWhen&&lineConditionMet(b.closeWhen,ctx));if(close){const first=state.expired?.[b.id]===undefined;(state.expired||={})[b.id]=r.worldTurn;r.activeEventIds=r.activeEventIds.filter((id:string)=>id!==b.eventId);if(first)for(const e of b.onExpire||[])if(e.kind==='setState')r.flags[e.stateId]=e.value;}}
}
/** Preserve an authored optional stop until completion or an explicit departure; never require doing it. The stop is declared by the line entry or by the beat's own requirement naming the finished event. */
export function deferOptionalDeparture(save:any,eventId:string):boolean {
 if(mainRouteBeatUnderway(save))return false;
 const contains=(c:any):boolean=>!!c&&('eventDone'in c?c.eventDone===eventId:'all'in c?c.all.some(contains):'any'in c?c.any.some(contains):false);
 const events=save.世界.状态.剧本模组.events||[];
 return QUEST_LINES.some(l=>l.beats.some(b=>(contains(l.entry)||(contains(b.requires)&&events.some((e:any)=>e.id===b.eventId)))&&!!questLineOffer(save,b.eventId)));
}
