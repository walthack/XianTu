import {questLineContext} from './questLineContext';
import {QUEST_LINES,lineConditionMet,lineInsertionsAt,type LineContext,type LineState} from './questLines';
import {affinityOf,runtimeEntityId,runtimeEntityName} from './ledger/affinityIdentity';
import {namingChapter} from './ledger/naming';
import {stepScene} from './fixedEndingNarratives';
import {getScenarioFocusEvent} from './runtime';
/** Reuse the current scene card and player ledger. Prose mentions and NPC private knowledge never count. */
export function questLineView(save:any){
 const r=save?.世界?.状态?.剧本模组;if(!r)return {secondary:[],character:[]};
 const event=getScenarioFocusEvent(r),scene=event?stepScene(r,event.id):undefined;
 const ctx=questLineContext(save,event?.id);
 const state:LineState=r.questLineState||{version:1,receipts:{}};
 return {
  secondary:QUEST_LINES.filter(l=>(l.kind==='secondary'||l.kind==='side')&&lineInsertionsAt([l],event?.id,ctx,state).length>0).map(l=>({id:l.id,name:l.name,kind:'支线',hint:l.entryHint,objective:lineInsertionsAt([l],event?.id,ctx,state)[0]?.beat.objective||''})),
  character:lineInsertionsAt(QUEST_LINES.filter(l=>l.kind==='character'),event?.id,ctx,state).map(({line,beat})=>({name:line.ownerCharacterIds.map(id=>runtimeEntityName(r,id)).join('、'),objective:beat.objective,lineId:line.id,beatId:beat.id})),
 };
}
