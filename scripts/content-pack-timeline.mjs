// 时间线插入事件（C01，用户 2026-11-10 定）：作者在 timeline.json 里插原创事件并标年数，插入点之后的原著事件整体顺延。
// 这里只做技术校验和首次登场索引，不是合规门；年龄由运行时按 catalog.timeline 现算，派生值不写回卡片和总表。
import {resolveNumbers} from './content-pack-quest-lines.mjs';

const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fail=s=>{throw new Error(`Content Pack timeline: ${s}`);};
const INSERT_KEYS=['id','anchor','trigger','passedWhen','years','order','interludeTextKey','supersedes','note'];
const PLACEHOLDER=/\{([A-Za-z0-9_.]+)\}/g;

/** 每个角色首次铺入或出现的全局轴序：关卡开场关系（playerRelationships、canon.relationships 端点）取该关 axisSeqLo，事件 relatedCharacterIds 取事件 axisSeq。只在名册里列名不算登场。 */
export function characterDebutIndex(stages){
 const debut={};
 const see=(id,seq)=>{if(typeof id!=='string'||!id||!Number.isFinite(seq))return;if(!(id in debut)||seq<debut[id])debut[id]=seq;};
 for(const stage of stages){
  const lo=stage.manifest?.axisSeqLo;
  for(const r of stage.canon?.playerRelationships||[])see(r.characterId,lo);
  for(const r of stage.canon?.relationships||[]){see(r.fromCharacterId,lo);see(r.toCharacterId,lo);}
  for(const e of stage.scenario?.events||[]){const seq=Number.isFinite(e.axisSeq)?e.axisSeq:lo;for(const id of e.relatedCharacterIds||[])see(id,seq);}
 }
 return Object.fromEntries(Object.entries(debut).sort(([a],[b])=>a.localeCompare(b)));
}

export function compileTimeline({rawInserts,numbers,stages,texts}){
 const canonPresentYear=numbers?.story?.timeline?.canonPresentYear;
 if(!Number.isSafeInteger(canonPresentYear))fail('story.timeline.canonPresentYear missing');
 const events=[...stages].flatMap(s=>s.scenario?.events||[]);
 const seen=new Set();
 const inserts=rawInserts.map((raw,i)=>{
  if(!object(raw))fail(`#${i} not an object`);
  for(const k of Object.keys(raw))if(!INSERT_KEYS.includes(k))fail(`${raw.id}: unsupported field ${k}`);
  const yearsPath=object(raw.years)&&typeof raw.years.$num==='string'?raw.years.$num:undefined;
  const x=resolveNumbers(raw,numbers,`timeline.${i}`);
  if(typeof x.id!=='string'||!x.id||seen.has(x.id))fail(`missing/duplicate id ${x.id}`);seen.add(x.id);
  if(!Number.isSafeInteger(x.years)||x.years<0)fail(`${x.id}: years must be a non-negative integer`);
  const a=x.anchor;
  if(!object(a)||!Number.isSafeInteger(a.beforeAxisSeq)||(a.afterAxisSeq!==undefined&&(!Number.isSafeInteger(a.afterAxisSeq)||a.afterAxisSeq>=a.beforeAxisSeq)))fail(`${x.id}: invalid anchor`);
  if(a.afterAxisSeq!==undefined){const between=events.filter(e=>Number.isFinite(e.axisSeq)&&e.axisSeq>a.afterAxisSeq&&e.axisSeq<a.beforeAxisSeq).map(e=>e.id);if(between.length)fail(`${x.id}: anchor ${a.afterAxisSeq}/${a.beforeAxisSeq} straddles ${between.join(',')}`);}
  if(x.trigger!==undefined&&(!object(x.trigger)||x.trigger.kind!=='openWorldRoute'||typeof x.trigger.routeId!=='string'||!x.trigger.routeId||Object.keys(x.trigger).some(k=>!['kind','routeId'].includes(k))))fail(`${x.id}: invalid trigger`);
  const p=x.passedWhen;
  if(p!==undefined){
   if(!object(p)||Object.keys(p).some(k=>!['anyEventDone','minAxisSeq','sliceEntered'].includes(k)))fail(`${x.id}: invalid passedWhen`);
   if(p.anyEventDone!==undefined&&(!Array.isArray(p.anyEventDone)||p.anyEventDone.some(id=>!events.some(e=>e.id===id))))fail(`${x.id}: passedWhen.anyEventDone has unknown event`);
   if(p.minAxisSeq!==undefined&&!Number.isSafeInteger(p.minAxisSeq))fail(`${x.id}: invalid passedWhen.minAxisSeq`);
   if(p.sliceEntered!==undefined&&(typeof p.sliceEntered!=='string'||!p.sliceEntered))fail(`${x.id}: invalid passedWhen.sliceEntered`);
  }
  if(x.order!==undefined&&!Number.isSafeInteger(x.order))fail(`${x.id}: invalid order`);
  if(x.supersedes!==undefined&&(!Array.isArray(x.supersedes)||x.supersedes.some(r=>typeof r!=='string'||!/^[^:]+::[^:]+$/.test(r))))fail(`${x.id}: invalid supersedes`);
  if(x.interludeTextKey!==undefined){
   const text=texts[x.interludeTextKey];
   if(typeof text!=='string'||!text.trim())fail(`${x.id}: missing interlude text ${x.interludeTextKey}`);
   for(const [,path] of text.matchAll(PLACEHOLDER))if(path!==yearsPath)fail(`${x.id}: interlude placeholder {${path}} is not the years number path`);
  }
  const out={id:x.id,anchor:{...(a.afterAxisSeq!==undefined?{afterAxisSeq:a.afterAxisSeq}:{}),beforeAxisSeq:a.beforeAxisSeq},years:x.years,order:x.order??0};
  if(yearsPath)out.yearsPath=yearsPath;
  for(const k of ['trigger','passedWhen','interludeTextKey','supersedes'])if(x[k]!==undefined)out[k]=x[k];
  return out;
 }).sort((l,r)=>l.anchor.beforeAxisSeq-r.anchor.beforeAxisSeq||l.order-r.order||l.id.localeCompare(r.id));
 return {canonPresentYear,inserts,characterDebuts:characterDebutIndex(stages)};
}
