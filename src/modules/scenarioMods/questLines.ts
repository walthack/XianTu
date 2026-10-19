import {CONTENT_PACKS} from '../contentPacks';
/** Data-driven optional / character insertions. No third mandatory rail; progress only uses its own code receipt. */
import source from '../../../mod-kit/quest-lines/lines.json';
import resources from '../../../mod-kit/quest-lines/resources.json';
const PACK_RESOURCES = (CONTENT_PACKS.questLineResources||{}) as Partial<Record<'memories'|'facts'|'affinityWeights'|'salience'|'intentMatches',Record<string,any>>>;
/** Pack resources extend (never shadow) the base tables; ids are unique across both. */
export const LINE_RESOURCES = {...resources,texts:{...resources.texts,...CONTENT_PACKS.texts},memories:{...resources.memories,...PACK_RESOURCES.memories},facts:{...resources.facts,...PACK_RESOURCES.facts},affinityWeights:{...resources.affinityWeights,...PACK_RESOURCES.affinityWeights},salience:{...resources.salience,...PACK_RESOURCES.salience},intentMatches:{...resources.intentMatches,...PACK_RESOURCES.intentMatches}};
export function lineText(id:string):string { const t=(LINE_RESOURCES.texts as Record<string,string>)[id]; if(t===undefined)throw Error(`unknown text ${id}`);return t; }
export type LineCondition = {all:LineCondition[]}|{any:LineCondition[]}|{not:LineCondition}|
 {canonChapterAtLeast:number}|{eventActive:string}|{eventDone:string}|{presentActor:string}|{knownFact:string}|{atLocation:string}|
 {chapterAtLeast:string}|{affinityAtLeast:{actorId:string;value:number}}|{flag:{id:string;value:string|number|boolean}}|
 /** Sum of the score of each recorded choice (state value → points; unset or unlisted counts 0) plus `plus` (the choice being settled) reaches `value`. */
 {stateScoreAtLeast:{terms:Array<{stateId:string;scores:Record<string,number>}>;plus?:number;value:number}};
/** `when` (optional) is checked against the context at the moment of the own receipt; an effect whose condition fails is not applied. */
export type LineEffect = LineEffectBody & {when?:LineCondition};
type LineEffectBody = {kind:'affinityGrant';actorId:string;weightId:string}|{kind:'memoryTicket';actorId:string;episodeTemplateId:string}|
 {kind:'reveal';factId:string;source:'told_privately'|'heard'|'seen'}|{kind:'itemGrant';itemId:string;quantity:number}|
 {kind:'status';actorId:string;statusId:string}|{kind:'ending';endingId:string;actorId?:string;textId?:string}|{kind:'npcKnowledge';actorIds:string[];factId:string}|{kind:'setReceipt';receiptId:string;mutexGroupId?:string;consumeAtEventIds:string[]}|{kind:'setState';stateId:string;value:string|number|boolean};
export type LineRole='load_bearing'|'choice'|'color'|'transition';
/** Optional authoring cards. Unset fields keep the old behaviour. */
export interface LineCard {previous:string;tension:string;options:string[]}
export interface LineEcho {reads:string;variants:Record<string,{previousId?:string;outcomeIds?:Record<string,string>}>}
export interface LineBeat {role?:LineRole[];card?:LineCard;echo?:LineEcho;onExpire?:LineEffect[];id:string;mode:'insert'|'standalone';hostEventId:string|null;eventId:string;requires?:LineCondition;completedBy:{eventActionReceipt?:{eventId:string;actionId:string};anyOf?:Array<{eventActionReceipt:{eventId:string;actionId:string}}>};onComplete:LineEffect[];byAction?:Record<string,LineEffect[]>;closeWhen?:LineCondition;steps?:any[];sharedExperience?:'default'|'suppress';ifOwnerAbsent?:'no_trigger';canonChapter?:number;chapterId?:string;stageId?:string;locationId?:string;sceneLocationId?:string;presentActorIds?:string[];briefId?:string;endingId?:string;objective:string}
export interface QuestLine {id:string;kind:'secondary'|'side'|'character';name:string;entryHint:string;ownerCharacterIds:string[];entry:LineCondition;closeWhen?:LineCondition;loadBearing?:boolean;resolution?:{endingId:string|null;endingKind:string};beats:LineBeat[]}
export interface QuestLineTable {version:1;lines:QuestLine[]}
export interface LineContext {completedEventIds:readonly string[];activeEventIds?:readonly string[];presentActorIds:readonly string[];knownFactIds:readonly string[];locationId?:string;/** The current place and every place that contains it (a zone counts as being in its settlement). */locationIds?:readonly string[];chapterOrder:Record<string,number>;currentChapterOrder:number;affinity:Record<string,number>;flags:Record<string,string|number|boolean>}
export interface LineReceipt {id:string;eventId:string;actionId:string;outcome:string;turn:number}
/** 主动得分明细（只读快照，供存档导出核对）：每个按得分过线才写入的状态，各项当时得几分、合计与过线分。判定仍由 lineConditionMet 现算，这里不参与判定。 */
export interface LineScoreSnapshot {line:string;beat:string;action:string;terms:Array<{stateId:string;value:string|null;score:number}>;plus:number;total:number;needed:number;passed:boolean}
/** 角色归宿（人物线结局只归角色，与整局结局无关）：resolutionId = 结局 id，textId 可选的归宿文字，label 为面板显示。 */
export interface ActorResolution {lineId:string;actorIds:string[];resolutionId:string;textId?:string;label:string;atTurn:number;sourceEventId:string}
export interface LineState {version:1;receipts:Record<string,{receiptId:string;turn:number;outcome:string}>;expired?:Record<string,number>;activeScores?:Record<string,LineScoreSnapshot>;/** lineId → 归宿 */actorResolutions?:Record<string,ActorResolution>;/** lineId → 关线回合（走到角色归宿后这条线不再提供任何拍） */closedLines?:Record<string,number>}
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
 if(key==='stateScoreAtLeast'&&object(value)){fields(value,['terms','plus','value'],where);const num=(n:unknown)=>Number.isFinite(n);if(Array.isArray(value.terms)&&value.terms.length&&value.terms.every((t:unknown)=>{if(!object(t))return false;fields(t,['stateId','scores'],where);return id(t.stateId)&&object(t.scores)&&!!Object.keys(t.scores).length&&Object.values(t.scores).every(num);})&&num(value.value)&&(value.plus===undefined||num(value.plus)))return;}
 if(key==='flag'&&object(value)){fields(value,['id','value'],where);if(id(value.id)&&['string','number','boolean'].includes(typeof value.value)&&(!(typeof value.value==='number')||Number.isFinite(value.value)))return;}
 throw Error(`${where}: unsupported condition ${key}`);
}
function effect(x:unknown,where:string):asserts x is LineEffect {
 if(!object(x))throw Error(`${where}: invalid effect`);
 const allowed:Record<string,string[]>={affinityGrant:['actorId','weightId'],memoryTicket:['actorId','episodeTemplateId'],reveal:['factId','source'],itemGrant:['itemId','quantity'],status:['actorId','statusId'],ending:['endingId','actorId','textId'],npcKnowledge:['actorIds','factId'],setReceipt:['receiptId','mutexGroupId','consumeAtEventIds'],setState:['stateId','value']};
 const keys=allowed[x.kind];if(!keys)throw Error(`${where}: effect not whitelisted`);fields(x,['kind','when',...keys],where);if(x.when!==undefined)condition(x.when,`${where}.when`);
 for(const k of keys)if(k.endsWith('Id')&&x[k]!==undefined&&!id(x[k]))throw Error(`${where}: invalid ${k}`);
 if(x.kind==='npcKnowledge'&&(!Array.isArray(x.actorIds)||!x.actorIds.every(id)))throw Error('invalid knowledge actors');
 if(x.kind==='setReceipt'&&(!Array.isArray(x.consumeAtEventIds)||!x.consumeAtEventIds.every(id)))throw Error('invalid receipt consumption');
 if(x.kind==='setState'&&!['number','string','boolean'].includes(typeof x.value))throw Error('invalid state');
 if(x.kind==='itemGrant'&&(!Number.isSafeInteger(x.quantity)||x.quantity<1))throw Error(`${where}: invalid quantity`);
 if(x.kind==='reveal'&&!['told_privately','heard','seen'].includes(x.source))throw Error(`${where}: invalid disclosure source`);
}
export function parseQuestLines(raw:unknown,textLookup:(id:string)=>string=lineText,intentMatches:Record<string,any>=LINE_RESOURCES.intentMatches):QuestLineTable {
 raw=JSON.parse(JSON.stringify(raw));if(object(raw)&&Array.isArray(raw.lines))for(const l of raw.lines){if(l.nameId){l.name=textLookup(l.nameId);delete l.nameId;}if(l.entryHintId){l.entryHint=textLookup(l.entryHintId);delete l.entryHintId;}for(const b of l.beats||[]){if(b.objectiveId){b.objective=textLookup(b.objectiveId);delete b.objectiveId;}if(object(b.card)&&('previousId'in b.card||'tensionId'in b.card||'optionIds'in b.card)){const c=b.card;b.card={previous:textLookup(c.previousId),tension:textLookup(c.tensionId),options:(c.optionIds||[]).map((x:string)=>textLookup(x))};}}}
 if(!object(raw)||raw.version!==1||!Array.isArray(raw.lines))throw Error('invalid quest line table');fields(raw,['version','lines'],'table');
 const lineIds=new Set<string>(),beatIds=new Set<string>();
 for(const line of raw.lines){
  if(!object(line))throw Error('invalid line');fields(line,['id','kind','name','entryHint','ownerCharacterIds','entry','closeWhen','loadBearing','resolution','beats'],'line');
  if(!id(line.id)||lineIds.has(line.id)||!['secondary','side','character'].includes(line.kind)||typeof line.name!=='string'||!line.name.trim()||typeof line.entryHint!=='string'||!Array.isArray(line.ownerCharacterIds)||!line.ownerCharacterIds.every(id)||!Array.isArray(line.beats))throw Error(`invalid line ${line.id}`);
  if(line.kind==='character'&&!line.ownerCharacterIds.length)throw Error('character line needs owner ids');lineIds.add(line.id);condition(line.entry,line.id);if(line.closeWhen)condition(line.closeWhen,line.id);if(line.resolution?.endingId) {if(!id(line.resolution.endingId))throw Error('invalid resolution');}
  for(const beat of line.beats){
   if(!object(beat))throw Error('invalid beat');fields(beat,['id','mode','hostEventId','eventId','requires','completedBy','onComplete','endingId','objective','byAction','closeWhen','steps','sharedExperience','ifOwnerAbsent','canonChapter','chapterId','stageId','locationId','sceneLocationId','presentActorIds','briefId','role','card','echo','onExpire'],'beat');
   if(!id(beat.id)||beatIds.has(beat.id)||!['insert','standalone'].includes(beat.mode)||(beat.mode==='insert'&&!id(beat.hostEventId))||!id(beat.eventId)||beat.eventId===beat.hostEventId||typeof beat.objective!=='string'||!beat.objective.trim()||!Array.isArray(beat.onComplete))throw Error(`invalid insertion ${beat.id}`);
   beatIds.add(beat.id);if(beat.requires)condition(beat.requires,beat.id);if(beat.closeWhen)condition(beat.closeWhen,beat.id);
   if(beat.sharedExperience && !['default','suppress'].includes(beat.sharedExperience))throw Error('invalid sharedExperience');
   if(beat.ifOwnerAbsent && beat.ifOwnerAbsent!=='no_trigger')throw Error('unsupported absent variant; supply a separate authored beat');
   if(beat.steps){if(!Array.isArray(beat.steps)||!beat.steps.length)throw Error('empty steps');const actions=new Set();for(const a of beat.steps){fields(a,['actionId','kind','optional','grantsPreparation','requiresPreparation','requiresPresentActors','labelId','intentId','outcomeId','intentMatchId','visibleWhen','previousId','variantOf','replyMode','forbidden'],'step');if(!id(a.actionId)||actions.has(a.actionId)||!['prepare','attempt'].includes(a.kind))throw Error('invalid step');actions.add(a.actionId);textLookup(a.labelId);textLookup(a.intentId);if(a.previousId)textLookup(a.previousId);if(a.visibleWhen!==undefined&&(!Array.isArray(a.visibleWhen)||!a.visibleWhen.length||!a.visibleWhen.every((c:any)=>object(c)&&typeof c.path==='string'&&/^flags\.[a-zA-Z0-9_.:-]+$/.test(c.path)&&['eq','neq'].includes(c.operator)&&['string','number','boolean'].includes(typeof c.value))))throw Error('invalid step visibleWhen');if(a.forbidden!==undefined&&(!Array.isArray(a.forbidden)||!a.forbidden.every((t:unknown)=>typeof t==='string'&&!!t.trim())))throw Error('invalid step forbidden');if(a.replyMode!==undefined&&!['fixed','model'].includes(a.replyMode))throw Error('invalid step replyMode');if(a.intentMatchId){const m=intentMatches[a.intentMatchId];if(!m||!Array.isArray(m.matchAny)||!m.matchAny.length||Object.keys(m).some(k=>!['matchAny','matchAll','rejectIf'].includes(k))||Object.values(m).some(v=>!Array.isArray(v)||v.some(t=>typeof t!=='string'||!t.trim())))throw Error('invalid intentMatch reference');}}}
   if(beat.role!==undefined&&(!Array.isArray(beat.role)||!beat.role.length||new Set(beat.role).size!==beat.role.length||!beat.role.every((r:string)=>['load_bearing','choice','color','transition'].includes(r))))throw Error(`invalid role ${beat.id}`);
   if(beat.card!==undefined){if(!object(beat.card))throw Error(`invalid card ${beat.id}`);fields(beat.card,['previous','tension','options'],'card');if(typeof beat.card.previous!=='string'||!beat.card.previous.trim()||typeof beat.card.tension!=='string'||!beat.card.tension.trim()||!Array.isArray(beat.card.options)||beat.card.options.some((o:unknown)=>typeof o!=='string'||!(o as string).trim()))throw Error(`invalid card ${beat.id}`);}
   if(beat.echo!==undefined){const e=beat.echo;if(!object(e))throw Error(`invalid echo ${beat.id}`);fields(e,['reads','variants'],'echo');if(!id(e.reads)||!object(e.variants)||!Object.keys(e.variants).length)throw Error(`invalid echo ${beat.id}`);
    for(const [value,v] of Object.entries<any>(e.variants)){if(!value.trim()||!object(v))throw Error(`invalid echo variant ${beat.id}`);fields(v,['previousId','outcomeIds'],'echo variant');if(v.previousId!==undefined)textLookup(v.previousId);if(v.outcomeIds!==undefined){if(!object(v.outcomeIds))throw Error('invalid echo outcomes');for(const [stepId,tid] of Object.entries<any>(v.outcomeIds)){if(!beat.steps?.some((st:any)=>st.actionId===stepId))throw Error(`echo names unknown step ${stepId}`);textLookup(tid);}}}}
   if(beat.onExpire!==undefined){if(!Array.isArray(beat.onExpire)||!beat.onExpire.length)throw Error(`invalid onExpire ${beat.id}`);beat.onExpire.forEach((e:unknown)=>{effect(e,beat.id);if((e as any).kind!=='setState'||(e as any).when!==undefined)throw Error(`onExpire only allows unconditional setState (${beat.id})`);});}
   if(!object(beat.completedBy))throw Error('missing completion receipt');if(beat.completedBy.anyOf && (!Array.isArray(beat.completedBy.anyOf)||!beat.completedBy.anyOf.length))throw Error('empty completion choices');fields(beat.completedBy,['eventActionReceipt','anyOf'],'completedBy');
   for(const rc of completionReceipts(beat)){const r=rc.eventActionReceipt;if(!object(r)||r.eventId!==beat.eventId||!id(r.actionId))throw Error('insertion must use its own action receipt');}
   for(const es of Object.values(beat.byAction||{})) (es as unknown[]).forEach(e=>effect(e,beat.id));
   beat.onComplete.forEach((e:unknown)=>effect(e,beat.id));if(beat.endingId!==undefined&&!id(beat.endingId))throw Error('invalid ending id');
  }
 }
 return JSON.parse(JSON.stringify(raw));
}
export function completionReceipts(beat:any):any[]{return beat.completedBy.anyOf||[beat.completedBy];}
export const QUEST_LINES=parseQuestLines({...source,lines:[...source.lines,...CONTENT_PACKS.questLines]}).lines;
export function lineConditionMet(c:LineCondition,ctx:LineContext):boolean {
 if('all'in c)return c.all.every(v=>lineConditionMet(v,ctx));if('any'in c)return c.any.some(v=>lineConditionMet(v,ctx));if('not'in c)return !lineConditionMet(c.not,ctx);
 if('canonChapterAtLeast'in c)return ctx.currentChapterOrder>=c.canonChapterAtLeast;if('eventActive'in c)return !!ctx.activeEventIds?.includes(c.eventActive);
 if('eventDone'in c)return ctx.completedEventIds.includes(c.eventDone);if('presentActor'in c)return ctx.presentActorIds.includes(c.presentActor);
 if('knownFact'in c)return ctx.knownFactIds.includes(c.knownFact);if('atLocation'in c)return (ctx.locationIds||[ctx.locationId]).includes(c.atLocation);
 if('chapterAtLeast'in c)return Number.isFinite(ctx.chapterOrder[c.chapterAtLeast])&&ctx.currentChapterOrder>=ctx.chapterOrder[c.chapterAtLeast];
 if('affinityAtLeast'in c)return (ctx.affinity[c.affinityAtLeast.actorId]??0)>=c.affinityAtLeast.value;
 if('stateScoreAtLeast'in c){const s=c.stateScoreAtLeast;return s.terms.reduce((sum,t)=>{const v=ctx.flags[t.stateId];return sum+(v!==undefined&&Object.hasOwn(t.scores,String(v))?t.scores[String(v)]:0);},s.plus??0)>=s.value;}
 return ctx.flags[c.flag.id]===c.flag.value;
}
export function lineInsertionsAt(lines:QuestLine[],eventId:string|undefined,ctx:LineContext,state?:LineState){
 return lines.filter(l=>state?.closedLines?.[l.id]===undefined&&lineConditionMet(l.entry,ctx)&&(!l.closeWhen||!lineConditionMet(l.closeWhen,ctx))).flatMap(line=>line.beats.filter(b=>(b.mode==='standalone'||b.hostEventId===eventId||ctx.completedEventIds.includes(b.hostEventId!))&&!state?.receipts[b.id]&&state?.expired?.[b.id]===undefined&&(!b.closeWhen||!lineConditionMet(b.closeWhen,ctx))&&(!b.requires||lineConditionMet(b.requires,ctx))).map(beat=>({line,beat})));
}
/** Returns a whitelisted effect plan once; the host owns atomic effect application and persistence. */
export function settleLineInsertion(line:QuestLine,beatId:string,receipt:LineReceipt,ctx:LineContext,state:LineState){
 const beat=line.beats.find(b=>b.id===beatId);if(!beat||state.closedLines?.[line.id]!==undefined||state.receipts[beatId]||state.expired?.[beatId]!==undefined||(line.closeWhen&&lineConditionMet(line.closeWhen,ctx))||(beat.closeWhen&&lineConditionMet(beat.closeWhen,ctx))||!lineConditionMet(line.entry,ctx)|| (beat.requires&&!lineConditionMet(beat.requires,ctx)))return null;
 const r=completionReceipts(beat).map(x=>x.eventActionReceipt).find(x=>x.actionId===receipt.actionId);if(!r)return null;
 if(!id(receipt.id)||receipt.eventId!==r.eventId||receipt.actionId!==r.actionId||receipt.outcome!=='success'||!Number.isSafeInteger(receipt.turn)||receipt.turn<0)return null;
 const next=JSON.parse(JSON.stringify(state)) as LineState;next.receipts[beatId]={receiptId:receipt.id,turn:receipt.turn,outcome:receipt.outcome};
 const resolutionEnding=line.resolution?.endingId && line.beats.every(b=>!!next.receipts[b.id])?line.resolution.endingId:undefined;
 // 得分过线才写入的状态：每次结算都记下各项得分明细（含本次选择写入的状态），存档里可核对；不参与判定。
 const scoreOf=(e:any)=>e.kind==='setState'&&e.when&&'stateScoreAtLeast'in e.when?e.when.stateScoreAtLeast as {terms:Array<{stateId:string;scores:Record<string,number>}>;plus?:number;value:number}:undefined;
 const ownEffects=[...beat.onComplete,...(beat.byAction?.[receipt.actionId]||[])];
 const gatedBy=new Map<string,{beatId:string;own:boolean;sc:NonNullable<ReturnType<typeof scoreOf>>}>();
 for(const b of line.beats)for(const e of [...b.onComplete,...Object.values(b.byAction||{}).flat()]){const sc=scoreOf(e);if(!sc||e.kind!=='setState')continue;const mine=b.id===beatId&&ownEffects.includes(e);if(mine||!gatedBy.has(e.stateId))gatedBy.set(e.stateId,{beatId:b.id,own:mine,sc});}
 if(gatedBy.size){
  const written:Record<string,unknown>={...ctx.flags};for(const e of ownEffects)if(e.kind==='setState'&&(!e.when||lineConditionMet(e.when,ctx)))written[e.stateId]=e.value;
  for(const [stateId,{beatId:scoreBeat,own,sc}] of gatedBy){
   const terms=sc.terms.map(t=>{const v=written[t.stateId];return {stateId:t.stateId,value:v===undefined?null:String(v),score:v!==undefined&&Object.hasOwn(t.scores,String(v))?t.scores[String(v)]:0};});
   const plus=own?(sc.plus??0):0,total=terms.reduce((n,t)=>n+t.score,0)+plus;
   (next.activeScores||={})[stateId]={line:line.id,beat:scoreBeat,action:receipt.actionId,terms,plus,total,needed:sc.value,passed:total>=sc.value};
  }
 }
 return {state:next,effects:[...(resolutionEnding?[{kind:'ending' as const,endingId:resolutionEnding}]:[]),...[...beat.onComplete,...(beat.byAction?.[receipt.actionId]||[])].filter(e=>!e.when||lineConditionMet(e.when,ctx)),...(beat.endingId?[{kind:'ending' as const,endingId:beat.endingId}]:[])]};
}
export function validateQuestLineReferences(table:QuestLineTable,has:ReferenceLookup):string[]{
 const errors:string[]=[];const ref=(k:ReferenceKind,v:string,event?:string)=>{if(!has(k,v,event))errors.push(`${k}: ${v}`);};
 const cond=(c:LineCondition):void=>{if('all'in c){c.all.forEach(cond);return;}if('any'in c){c.any.forEach(cond);return;}if('not'in c){cond(c.not);return;}
  if('canonChapterAtLeast'in c)return;else if('eventActive'in c)ref('event',c.eventActive);else if('eventDone'in c)ref('event',c.eventDone);else if('presentActor'in c)ref('character',c.presentActor);else if('knownFact'in c)ref('fact',c.knownFact);else if('atLocation'in c)ref('location',c.atLocation);else if('chapterAtLeast'in c)ref('chapter',c.chapterAtLeast);else if('affinityAtLeast'in c)ref('character',c.affinityAtLeast.actorId);else if('stateScoreAtLeast'in c)c.stateScoreAtLeast.terms.forEach(t=>ref('state',t.stateId));else ref('flag',c.flag.id);};
 for(const l of table.lines){l.ownerCharacterIds.forEach(i=>ref('character',i));cond(l.entry);if(l.closeWhen)cond(l.closeWhen);if(l.resolution?.endingId)ref('ending',l.resolution.endingId);for(const b of l.beats){if(b.hostEventId)ref('event',b.hostEventId);if(b.sceneLocationId)ref('location',b.sceneLocationId);ref('event',b.eventId);for(const r of completionReceipts(b))ref('action',r.eventActionReceipt.actionId,b.eventId);for(const a of b.steps||[]){ref('text',a.labelId);ref('text',a.intentId);if(a.previousId)ref('text',a.previousId);(a.requiresPresentActors||[]).forEach((id:string)=>ref('character',id));}for(const v of Object.values(b.echo?.variants||{})){if(v.previousId)ref('text',v.previousId);for(const t of Object.values(v.outcomeIds||{}))ref('text',t);}if(b.closeWhen)cond(b.closeWhen);if(b.requires)cond(b.requires);if(b.endingId)ref('ending',b.endingId);
 for(const e of [...b.onComplete,...Object.values(b.byAction||{}).flat(),...(b.onExpire||[])]){if(e.when)cond(e.when);if('actorId'in e&&e.actorId)ref('character',e.actorId);if(e.kind==='affinityGrant')ref('affinityWeight',e.weightId);if(e.kind==='memoryTicket')ref('memoryTemplate',e.episodeTemplateId);if(e.kind==='ending'&&e.textId)ref('text',e.textId as string);if(e.kind==='reveal')ref('fact',e.factId);if(e.kind==='itemGrant')ref('item',e.itemId);if(e.kind==='status')ref('status',e.statusId);if(e.kind==='ending')ref('ending',e.endingId);if(e.kind==='npcKnowledge'){e.actorIds.forEach(id=>ref('character',id));ref('fact',e.factId);}if(e.kind==='setState')ref('state',e.stateId);if(e.kind==='setReceipt'){ref('receipt',e.receiptId);e.consumeAtEventIds.forEach(id=>ref('event',id));}}}}
 return [...new Set(errors)];
}
