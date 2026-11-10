import {questLineContext} from './questLineContext';
import {QUEST_LINES,lineConditionMet,lineInsertionsAt,type LineContext,type LineState} from './questLines';
import {affinityOf,runtimeEntityId,runtimeEntityName} from './ledger/affinityIdentity';
import {namingChapter} from './ledger/naming';
import {stepScene} from './fixedEndingNarratives';
import {getCurrentStoryExplorationActions,getScenarioFocusEvent} from './runtime';
import {CONTENT_PACKS} from '../contentPacks';
/** 系统.扩展 里记「哪些人物拍已提示过等回应」的键（linePrompts 写）。 */
export const LINE_PROMPTED_KEY='linePrompted';
const SKIP_ACTION=/\.defer$/;
/** 明确略过＝本拍以 .defer 动作收场（其 setReceipt 已落 pathReceipts）。 */
function skippedBy(r:any,beat:{byAction?:Record<string,Array<{kind:string;receiptId?:string}>>}):boolean{
 return Object.entries(beat.byAction||{}).some(([actionId,effects])=>SKIP_ACTION.test(actionId)&&effects.some(e=>e.kind==='setReceipt'&&!!e.receiptId&&!!r.pathReceipts?.[e.receiptId]));
}
/** Reuse the current scene card and player ledger. Prose mentions and NPC private knowledge never count. */
export function questLineView(save:any){
 const r=save?.世界?.状态?.剧本模组;if(!r)return {secondary:[],character:[],closed:[],resolved:[]};
 const event=getScenarioFocusEvent(r),scene=event?stepScene(r,event.id):undefined;
 const ctx=questLineContext(save,event?.id);
 const state:LineState=r.questLineState||{version:1,receipts:{}};
 const offered=getCurrentStoryExplorationActions(save);
 return {
  secondary:QUEST_LINES.filter(l=>(l.kind==='secondary'||l.kind==='side')&&lineInsertionsAt([l],event?.id,ctx,state).length>0).map(l=>({id:l.id,name:l.name,kind:'支线',hint:l.entryHint,objective:lineInsertionsAt([l],event?.id,ctx,state)[0]?.beat.objective||''})),
  // 声明了 stageId 的拍只在该关显示（判定仍在 questLines，不动）。
  character:lineInsertionsAt(QUEST_LINES.filter(l=>l.kind==='character'),event?.id,ctx,state).filter(({beat})=>!beat.stageId||beat.stageId===r.modId).map(({line,beat})=>({name:line.ownerCharacterIds.map(id=>runtimeEntityName(r,id)).join('、'),objective:beat.objective,lineId:line.id,beatId:beat.id,eventId:beat.eventId,
   // 人物日志里可展开的「回应／明确略过」：只列引擎此刻真能执行的动作。
   actions:offered.filter(a=>a.eventId===beat.eventId).map(a=>({actionId:a.actionId,label:a.label,skip:SKIP_ACTION.test(a.actionId)}))})),
  // 提示过的人物回应拍怎么收场：已回应／明确略过／主线继续后到期分开记；未提示过的拍（requires 没满足、从未开场）不进这里。
  closed:Object.keys(save?.系统?.扩展?.[LINE_PROMPTED_KEY]||{}).flatMap(beatId=>{
   const line=QUEST_LINES.find(l=>l.beats.some(b=>b.id===beatId)),beat=line?.beats.find(b=>b.id===beatId);if(!line||!beat)return [];
   const outcome=state.receipts[beatId]?(skippedBy(r,beat)?'skipped':'responded'):state.expired?.[beatId]!==undefined?'expired':undefined;
   return outcome?[{name:line.ownerCharacterIds.map(id=>runtimeEntityName(r,id)).join('、'),objective:`${beat.objective}（${CONTENT_PACKS.texts[`text.line_log.outcome.${outcome}`]||outcome}）`,lineId:line.id,beatId,outcome}]:[];
  }),
  // 角色归宿：人物线走到结局后关线，面板只显示归宿，不影响整局。
  resolved:Object.values(state.actorResolutions||{}).map(x=>({name:x.actorIds.map(id=>runtimeEntityName(r,id)).join('、'),objective:`归宿：${x.label}`,lineId:x.lineId,resolutionId:x.resolutionId,atTurn:x.atTurn})),
 };
}
