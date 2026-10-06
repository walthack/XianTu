/** Data-driven optional / character insertions. No third mandatory rail; progress only uses its own code receipt. */
import source from '../../../mod-kit/quest-lines/lines.json';
import resources from '../../../mod-kit/quest-lines/resources.json';
export const LINE_RESOURCES = resources;
export function lineText(id:string):string { const t=(resources.texts as Record<string,string>)[id]; if(t===undefined)throw Error(`unknown text ${id}`);return t; }
export type LineCondition = {all:LineCondition[]}|{any:LineCondition[]}|{not:LineCondition}|
 {canonChapterAtLeast:number}|{eventActive:string}|{eventDone:string}|{presentActor:string}|{knownFact:string}|{atLocation:string}|
 {chapterAtLeast:string}|{affinityAtLeast:{actorId:string;value:number}}|{flag:{id:string;value:string|number|boolean}};
export type LineEffect = {kind:'affinityGrant';actorId:string;weightId:string}|{kind:'memoryTicket';actorId:string;episodeTemplateId:string}|
 {kind:'reveal';factId:string;source:'told_privately'|'heard'|'seen'}|{kind:'itemGrant';itemId:string;quantity:number}|
 {kind:'status';actorId:string;statusId:string}|{kind:'ending';endingId:string}|{kind:'npcKnowledge';actorIds:string[];factId:string}|{kind:'setReceipt';receiptId:string;mutexGroupId?:string;consumeAtEventIds:string[]}|{kind:'setState';stateId:string;value:string|number|boolean};
export interface LineBeat {id:string;mode:'insert'|'standalone';hostEventId:string|null;eventId:string;requires?:LineCondition;completedBy:{eventActionReceipt?:{eventId:string;actionId:string};anyOf?:Array<{eventActionReceipt:{eventId:string;actionId:string}}>};onComplete:LineEffect[];byAction?:Record<string,LineEffect[]>;closeWhen?:LineCondition;steps?:any[];sharedExperience?:'default'|'suppress';ifOwnerAbsent?:'no_trigger';canonChapter?:number;chapterId?:string;stageId?:string;locationId?:string;presentActorIds?:string[];briefId?:string;endingId?:string;objective:string}
export interface QuestLine {id:string;kind:'secondary'|'side'|'character';name:string;entryHint:string;ownerCharacterIds:string[];entry:LineCondition;closeWhen?:LineCondition;loadBearing?:boolean;resolution?:{endingId:string|null;endingKind:string};beats:LineBeat[]}
export interface QuestLineTable {version:1;lines:QuestLine[]}
export interface LineContext {completedEventIds:readonly string[];activeEventIds?:readonly string[];presentActorIds:readonly string[];knownFactIds:readonly string[];locationId?:string;chapterOrder:Record<string,number>;currentChapterOrder:number;affinity:Record<string,number>;flags:Record<string,string|number|boolean>}
export interface LineReceipt {id:string;eventId:string;actionId:string;outcome:string;turn:number}
export interface LineState {version:1;receipts:Record<string,{receiptId:string;turn:number;outcome:string}>;expired?:Record<string,number>}
export type ReferenceKind='character'|'event'|'action'|'location'|'chapter'|'fact'|'flag'|'item'|'status'|'ending'|'affinityWeight'|'memoryTemplate'|'text'|'receipt'|'state';
export type ReferenceLookup=(kind:ReferenceKind,id:string,eventId?:string)=>boolean;
const object=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const id=(x:unknown):x is string=>typeof x==='string'&&/^[a-zA-Z0-9_.:-]+$/.test(x);
function fields(x:Record<string,any>,allowed:string[],where:string){for(const key of Object.keys(x))if(!allowed.includes(key))throw Error(`${where}: unknown field ${key}`);}
function condition(x:unknown,where:string,depth=0):asserts x is LineCondition {
 if(depth>32||!object(x)||Object.keys(x).length!==1)throw Error(`${where}: invalid condition`);
 const [key,value]=Object.entries(x)[0];
 if(key==='all'||key==='any'){if(!Array.isArray(value)||!value.length)throw Error(`${where}: empty ${key}`);value.forEach((v,i)=>condition(v,`${where}.${i}`,depth+1));return;}
 if(key==='not'){condition(value,where,depth+1);return;}
 if(['eventDone','eventActive','presentActor','knownFact','atLocation','chapterAtLeast'].includes(key)&&id(value))return;
 if(key==='canonChapterAtLeast'&&Number.isSafeInteger(value)&&Number(value)>=1)return;
 if(key==='affinityAtLeast'&&object(value)){fields(value,['actorId','value'],where);if(id(value.actorId)&&Number.isFinite(value.value))return;}
 if(key==='flag'&&object(value)){fields(value,['id','value'],where);if(id(value.id)&&['string','number','boolean'].includes(typeof value.value)&&(!(typeof value.value==='number')||Number.isFinite(value.value)))return;}
 throw Error(`${where}: unsupported condition ${key}`);
}
function effect(x:unknown,where:string):asserts x is LineEffect {
 if(!object(x))throw Error(`${where}: invalid effect`);
 const allowed:Record<string,string[]>={affinityGrant:['actorId','weightId'],memoryTicket:['actorId','episodeTemplateId'],reveal:['factId','source'],itemGrant:['itemId','quantity'],status:['actorId','statusId'],ending:['endingId'],npcKnowledge:['actorIds','factId'],setReceipt:['receiptId','mutexGroupId','consumeAtEventIds'],setState:['stateId','value']};
 const keys=allowed[x.kind];if(!keys)throw Error(`${where}: effect not whitelisted`);fields(x,['kind',...keys],where);
 for(const k of keys)if(k.endsWith('Id')&&x[k]!==undefined&&!id(x[k]))throw Error(`${where}: invalid ${k}`);
 if(x.kind==='npcKnowledge'&&(!Array.isArray(x.actorIds)||!x.actorIds.every(id)))throw Error('invalid knowledge actors');
 if(x.kind==='setReceipt'&&(!Array.isArray(x.consumeAtEventIds)||!x.consumeAtEventIds.every(id)))throw Error('invalid receipt consumption');
 if(x.kind==='setState'&&!['number','string','boolean'].includes(typeof x.value))throw Error('invalid state');
 if(x.kind==='itemGrant'&&(!Number.isSafeInteger(x.quantity)||x.quantity<1))throw Error(`${where}: invalid quantity`);
 if(x.kind==='reveal'&&!['told_privately','heard','seen'].includes(x.source))throw Error(`${where}: invalid disclosure source`);
}
export function parseQuestLines(raw:unknown):QuestLineTable {
 raw=JSON.parse(JSON.stringify(raw));if(object(raw)&&Array.isArray(raw.lines))for(const l of raw.lines){if(l.nameId){l.name=lineText(l.nameId);delete l.nameId;}if(l.entryHintId){l.entryHint=lineText(l.entryHintId);delete l.entryHintId;}for(const b of l.beats||[])if(b.objectiveId){b.objective=lineText(b.objectiveId);delete b.objectiveId;}}
 if(!object(raw)||raw.version!==1||!Array.isArray(raw.lines))throw Error('invalid quest line table');fields(raw,['version','lines'],'table');
 const lineIds=new Set<string>(),beatIds=new Set<string>();
 for(const line of raw.lines){
  if(!object(line))throw Error('invalid line');fields(line,['id','kind','name','entryHint','ownerCharacterIds','entry','closeWhen','loadBearing','resolution','beats'],'line');
  if(!id(line.id)||lineIds.has(line.id)||!['secondary','side','character'].includes(line.kind)||typeof line.name!=='string'||!line.name.trim()||typeof line.entryHint!=='string'||!Array.isArray(line.ownerCharacterIds)||!line.ownerCharacterIds.every(id)||!Array.isArray(line.beats))throw Error(`invalid line ${line.id}`);
  if(line.kind==='character'&&!line.ownerCharacterIds.length)throw Error('character line needs owner ids');lineIds.add(line.id);condition(line.entry,line.id);if(line.closeWhen)condition(line.closeWhen,line.id);if(line.resolution?.endingId) {if(!id(line.resolution.endingId))throw Error('invalid resolution');}
  for(const beat of line.beats){
   if(!object(beat))throw Error('invalid beat');fields(beat,['id','mode','hostEventId','eventId','requires','completedBy','onComplete','endingId','objective','byAction','closeWhen','steps','sharedExperience','ifOwnerAbsent','canonChapter','chapterId','stageId','locationId','presentActorIds','briefId'],'beat');
   if(!id(beat.id)||beatIds.has(beat.id)||!['insert','standalone'].includes(beat.mode)||(beat.mode==='insert'&&!id(beat.hostEventId))||!id(beat.eventId)||beat.eventId===beat.hostEventId||typeof beat.objective!=='string'||!beat.objective.trim()||!Array.isArray(beat.onComplete))throw Error(`invalid insertion ${beat.id}`);
   beatIds.add(beat.id);if(beat.requires)condition(beat.requires,beat.id);if(beat.closeWhen)condition(beat.closeWhen,beat.id);
   if(beat.sharedExperience && !['default','suppress'].includes(beat.sharedExperience))throw Error('invalid sharedExperience');
   if(beat.ifOwnerAbsent && beat.ifOwnerAbsent!=='no_trigger')throw Error('unsupported absent variant; supply a separate authored beat');
   if(beat.steps){if(!Array.isArray(beat.steps)||!beat.steps.length)throw Error('empty steps');const actions=new Set();for(const a of beat.steps){fields(a,['actionId','kind','optional','grantsPreparation','requiresPreparation','requiresPresentActors','labelId','intentId','outcomeId','intentMatchId'],'step');if(!id(a.actionId)||actions.has(a.actionId)||!['prepare','attempt'].includes(a.kind))throw Error('invalid step');actions.add(a.actionId);lineText(a.labelId);lineText(a.intentId);if(a.intentMatchId){const m=(resources.intentMatches as any)[a.intentMatchId];if(!m||!Array.isArray(m.matchAny)||!m.matchAny.length||Object.keys(m).some(k=>!['matchAny','matchAll','rejectIf'].includes(k))||Object.values(m).some(v=>!Array.isArray(v)||v.some(t=>typeof t!=='string'||!t.trim())))throw Error('invalid intentMatch reference');}}}
   if(!object(beat.completedBy))throw Error('missing completion receipt');if(beat.completedBy.anyOf && (!Array.isArray(beat.completedBy.anyOf)||!beat.completedBy.anyOf.length))throw Error('empty completion choices');fields(beat.completedBy,['eventActionReceipt','anyOf'],'completedBy');
   for(const rc of completionReceipts(beat)){const r=rc.eventActionReceipt;if(!object(r)||r.eventId!==beat.eventId||!id(r.actionId))throw Error('insertion must use its own action receipt');}
   for(const es of Object.values(beat.byAction||{})) (es as unknown[]).forEach(e=>effect(e,beat.id));
   beat.onComplete.forEach((e:unknown)=>effect(e,beat.id));if(beat.endingId!==undefined&&!id(beat.endingId))throw Error('invalid ending id');
  }
 }
 return JSON.parse(JSON.stringify(raw));
}
export function completionReceipts(beat:any):any[]{return beat.completedBy.anyOf||[beat.completedBy];}
export const QUEST_LINES=parseQuestLines(source).lines;
export function lineConditionMet(c:LineCondition,ctx:LineContext):boolean {
 if('all'in c)return c.all.every(v=>lineConditionMet(v,ctx));if('any'in c)return c.any.some(v=>lineConditionMet(v,ctx));if('not'in c)return !lineConditionMet(c.not,ctx);
 if('canonChapterAtLeast'in c)return ctx.currentChapterOrder>=c.canonChapterAtLeast;if('eventActive'in c)return !!ctx.activeEventIds?.includes(c.eventActive);
 if('eventDone'in c)return ctx.completedEventIds.includes(c.eventDone);if('presentActor'in c)return ctx.presentActorIds.includes(c.presentActor);
 if('knownFact'in c)return ctx.knownFactIds.includes(c.knownFact);if('atLocation'in c)return ctx.locationId===c.atLocation;
 if('chapterAtLeast'in c)return Number.isFinite(ctx.chapterOrder[c.chapterAtLeast])&&ctx.currentChapterOrder>=ctx.chapterOrder[c.chapterAtLeast];
 if('affinityAtLeast'in c)return (ctx.affinity[c.affinityAtLeast.actorId]??0)>=c.affinityAtLeast.value;
 return ctx.flags[c.flag.id]===c.flag.value;
}
export function lineInsertionsAt(lines:QuestLine[],eventId:string|undefined,ctx:LineContext,state?:LineState){
 return lines.filter(l=>lineConditionMet(l.entry,ctx)&&(!l.closeWhen||!lineConditionMet(l.closeWhen,ctx))).flatMap(line=>line.beats.filter(b=>(b.mode==='standalone'||b.hostEventId===eventId||ctx.completedEventIds.includes(b.hostEventId!))&&!state?.receipts[b.id]&&state?.expired?.[b.id]===undefined&&(!b.closeWhen||!lineConditionMet(b.closeWhen,ctx))&&(!b.requires||lineConditionMet(b.requires,ctx))).map(beat=>({line,beat})));
}
/** Returns a whitelisted effect plan once; the host owns atomic effect application and persistence. */
export function settleLineInsertion(line:QuestLine,beatId:string,receipt:LineReceipt,ctx:LineContext,state:LineState){
 const beat=line.beats.find(b=>b.id===beatId);if(!beat||state.receipts[beatId]||state.expired?.[beatId]!==undefined||(line.closeWhen&&lineConditionMet(line.closeWhen,ctx))||(beat.closeWhen&&lineConditionMet(beat.closeWhen,ctx))||!lineConditionMet(line.entry,ctx)|| (beat.requires&&!lineConditionMet(beat.requires,ctx)))return null;
 const r=completionReceipts(beat).map(x=>x.eventActionReceipt).find(x=>x.actionId===receipt.actionId);if(!r)return null;
 if(!id(receipt.id)||receipt.eventId!==r.eventId||receipt.actionId!==r.actionId||receipt.outcome!=='success'||!Number.isSafeInteger(receipt.turn)||receipt.turn<0)return null;
 const next=JSON.parse(JSON.stringify(state)) as LineState;next.receipts[beatId]={receiptId:receipt.id,turn:receipt.turn,outcome:receipt.outcome};
 const resolutionEnding=line.resolution?.endingId && line.beats.every(b=>!!next.receipts[b.id])?line.resolution.endingId:undefined;
 return {state:next,effects:[...(resolutionEnding?[{kind:'ending' as const,endingId:resolutionEnding}]:[]),...beat.onComplete,...(beat.byAction?.[receipt.actionId]||[]),...(beat.endingId?[{kind:'ending' as const,endingId:beat.endingId}]:[])]};
}
export function validateQuestLineReferences(table:QuestLineTable,has:ReferenceLookup):string[]{
 const errors:string[]=[];const ref=(k:ReferenceKind,v:string,event?:string)=>{if(!has(k,v,event))errors.push(`${k}: ${v}`);};
 const cond=(c:LineCondition):void=>{if('all'in c){c.all.forEach(cond);return;}if('any'in c){c.any.forEach(cond);return;}if('not'in c){cond(c.not);return;}
  if('canonChapterAtLeast'in c)return;else if('eventActive'in c)ref('event',c.eventActive);else if('eventDone'in c)ref('event',c.eventDone);else if('presentActor'in c)ref('character',c.presentActor);else if('knownFact'in c)ref('fact',c.knownFact);else if('atLocation'in c)ref('location',c.atLocation);else if('chapterAtLeast'in c)ref('chapter',c.chapterAtLeast);else if('affinityAtLeast'in c)ref('character',c.affinityAtLeast.actorId);else ref('flag',c.flag.id);};
 for(const l of table.lines){l.ownerCharacterIds.forEach(i=>ref('character',i));cond(l.entry);if(l.closeWhen)cond(l.closeWhen);if(l.resolution?.endingId)ref('ending',l.resolution.endingId);for(const b of l.beats){if(b.hostEventId)ref('event',b.hostEventId);ref('event',b.eventId);for(const r of completionReceipts(b))ref('action',r.eventActionReceipt.actionId,b.eventId);for(const a of b.steps||[]){ref('text',a.labelId);ref('text',a.intentId);(a.requiresPresentActors||[]).forEach((id:string)=>ref('character',id));}if(b.closeWhen)cond(b.closeWhen);if(b.requires)cond(b.requires);if(b.endingId)ref('ending',b.endingId);
 for(const e of [...b.onComplete,...Object.values(b.byAction||{}).flat()]){if('actorId'in e)ref('character',e.actorId);if(e.kind==='affinityGrant')ref('affinityWeight',e.weightId);if(e.kind==='memoryTicket')ref('memoryTemplate',e.episodeTemplateId);if(e.kind==='reveal')ref('fact',e.factId);if(e.kind==='itemGrant')ref('item',e.itemId);if(e.kind==='status')ref('status',e.statusId);if(e.kind==='ending')ref('ending',e.endingId);if(e.kind==='npcKnowledge'){e.actorIds.forEach(id=>ref('character',id));ref('fact',e.factId);}if(e.kind==='setState')ref('state',e.stateId);if(e.kind==='setReceipt'){ref('receipt',e.receiptId);e.consumeAtEventIds.forEach(id=>ref('event',id));}}}}
 return [...new Set(errors)];
}
