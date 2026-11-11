import {readFile,readdir,mkdir,writeFile,realpath,rename,copyFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {createJiti} from 'jiti';
import {loadNumbers,resolveNumbers,expandEchoes,projectQuestLineEvents} from './content-pack-quest-lines.mjs';
import {compileTimeline} from './content-pack-timeline.mjs';
import {coreFormatKinds,emptyCoreFormats,coreDefinedIds,compileCoreFormats,validateCoreFormatsWithTs} from './content-pack-core-formats.mjs';
// 展示类（F0b）：endings、openWorldSlices、persistentEntries 三段，stageMeta 事件新字段与 texts 通配键，见 content-pack-presentation-formats.mjs
import {presentationFormatKinds,emptyPresentationFormats,presentationDefinedIds,stageMetaEventExtraKeys,stageMetaPresentationExtraKeys,checkStageMetaPresentationExtras,presentationTextKeyReferences,checkPresentationTextKeys,compilePresentationFormats,rawStepScenePrefixes,validatePresentationFormatsWithTs} from './content-pack-presentation-formats.mjs';
const root=resolve(import.meta.dirname,'..');
const kinds=['contracts','drafts','statuses','stages','overlays','questLines','entities','mapRoutes','mapEntries','heldActions','rails'];
// 线路格式（宋线 S2）：stageMeta、railExtraBeats、secondaryLines 都是文件列表，每个文件是数组；编译后 railExtraBeats 并进包 rail，不单独进 catalog
const lineFormatKinds=['stageMeta','railExtraBeats','secondaryLines'];
// 核心轨与人物轨（F0a）：lineCriticalEvents、characterBeats、storyAxis、locationAliases、characterProfiles、ifBranches，见 content-pack-core-formats.mjs
const fields=['schemaVersion','id','dependsOn',...kinds,'texts','questLineResources','playtests','entries','lineCompass','timeline',...lineFormatKinds,...coreFormatKinds,...presentationFormatKinds];
// 国家线注册与地区映射（秦线 PR C）：manifest.nationLines 是文件列表，每个文件是 [{lineId,order,regions}]；编译后按 order 排成 catalog.nationLines
fields.push('nationLines');
const resourceKinds=['memories','facts','affinityWeights','salience','intentMatches'];
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fail=s=>{throw new Error(`Content Pack: ${s}`);};
const unique=(items,key,label)=>{const seen=new Set();for(const x of items){const id=key(x);if(typeof id!=='string'||!id.trim()||seen.has(id))fail(`${label} missing/duplicate id ${id}`);seen.add(id);}};
const tsLoader=()=>createJiti(import.meta.url,{interopDefault:true,alias:{'@':join(root,'src')}});
const generatedDir=join(root,'src/modules/contentPacks/generated'),catalogPath=join(generatedDir,'catalog.json');
const serialize=c=>JSON.stringify(c,null,2)+'\n';
/** 包顺序：dependsOn 先校验（字符串数组、包存在、不依赖自己、不重复、无环），再拓扑排序；同时就绪的按目录名取。单包时与按目录名排序相同。 */
function orderPacks(packs){
 const byId=new Map(packs.map(p=>[p.m.id,p]));const deps=m=>m.dependsOn??[];
 for(const {m} of packs){const d=deps(m);if(!Array.isArray(d)||d.some(x=>typeof x!=='string'))fail(`${m.id}.dependsOn: expected string array`);for(const x of d){if(x===m.id)fail(`${m.id}.dependsOn: depends on itself`);if(!byId.has(x))fail(`${m.id}.dependsOn: unknown pack ${x}`);}if(new Set(d).size!==d.length)fail(`${m.id}.dependsOn: duplicate entry`);}
 const state=new Map(),path=[];const visit=id=>{if(state.get(id)==='done')return;if(state.get(id)==='open')fail(`dependsOn cycle ${[...path.slice(path.indexOf(id)),id].join(' → ')}`);state.set(id,'open');path.push(id);for(const d of deps(byId.get(id).m))visit(d);path.pop();state.set(id,'done');};
 for(const {m} of packs)visit(m.id);
 const placed=new Set(),out=[];while(out.length<packs.length){const next=packs.find(p=>!placed.has(p.m.id)&&deps(p.m).every(d=>placed.has(d)));placed.add(next.m.id);out.push(next);}
 const closure=new Map();const visible=id=>{if(!closure.has(id)){const s=new Set([id]);for(const d of deps(byId.get(id).m))for(const x of visible(d))s.add(x);closure.set(id,s);}return closure.get(id);};
 return {ordered:out,visible};
}
// 归属检查的引用候选：整串；账本路径去前缀（再去 .outcome/.from/.status/.state 后缀）；按 :: 和 : 拆开的各段。只做整串相等，不做子串匹配
const LEDGER_PREFIX=/^(done|flags|line|acq|identity|knows\.player|item|party|deadline|unlock|compass)\./,LEDGER_SUFFIX=/\.(outcome|from|status|state)$/;
const referenceCandidates=s=>{const out=new Set([s,...s.split('::'),...s.split(':')]);const tail=s.replace(LEDGER_PREFIX,'');if(tail!==s){out.add(tail);out.add(tail.replace(LEDGER_SUFFIX,''));}return out;};
/** 包定义的 id，按种类分命名空间：[种类, id]（只登记包资产里的，不含内置关与 mod-kit）。overlay 事件另算：见 buildCatalog。 */
const definedIds=(kind,x)=>{
 if(!object(x))return [];
 if(kind==='stages')return [['stage',x.manifest?.id],...(x.scenario?.events||[]).map(e=>['event',e?.id]),...(x.scenario?.chapters||[]).map(c=>['chapter',c?.id])];
 if(kind==='questLines')return [['questLine',x.id],...(x.beats||[]).map(b=>['beat',b?.id])];
 if(kind==='contracts'||kind==='drafts')return [['contract',x.meta?.id]];
 if(kind==='entities')return [[`entity.${x.kind}`,x.entry?.id]];
 if(kind==='lineCompass')return [['lineId',x.lineId]];
 if(kind==='nationLines')return [['nationLine',x?.lineId]];
 if(kind==='overlays'||kind==='stageMeta'||kind==='railExtraBeats')return [];
 if(kind==='secondaryLines')return [['secondaryLine',x.id]];
 if(coreFormatKinds.includes(kind))return coreDefinedIds(kind,x);
 if(presentationFormatKinds.includes(kind))return presentationDefinedIds(kind,x);
 return [[kind,x.id]];
};
/** 只建 catalog（纯数据）：不经 jiti 加载任何会读 generated/catalog.json 的模块。资产路径限定在源码树内（含符号链接）。 */
async function buildCatalog({packsDir=join(root,'src/modules/contentPacks/packs'),sourceRoot=root}={}) {
 const catalog={version:'',contracts:[],drafts:[],statuses:[],stages:[],mapRoutes:[],mapEntries:[],heldActions:[],rails:[],stageMeta:[],secondaryLines:[],...emptyCoreFormats(),...emptyPresentationFormats(),overlays:[],questLines:[],questLineResources:{},entities:[],texts:{},playtests:[],entries:[],lineCompass:{version:1,lines:[]},lineCompassPlaces:{},lineCompassPlaceIds:{},timeline:null};
 const timelineInserts=[],lineFormats=Object.fromEntries(lineFormatKinds.map(k=>[k,[]])),coreRaw=Object.fromEntries(coreFormatKinds.map(k=>[k,[]])),presentationRaw=Object.fromEntries(presentationFormatKinds.map(k=>[k,[]]));
 const numbers=await loadNumbers(sourceRoot);
 const packIds=new Set(),packs=[];
 const nationLines=[];
 for(const dir of (await readdir(packsDir,{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name).sort()){
  const m=JSON.parse(await readFile(join(packsDir,dir,'manifest.json'),'utf8'));
  if(!object(m)||m.schemaVersion!==1||typeof m.id!=='string'||!m.id||packIds.has(m.id))fail(`${dir}: invalid version/id`);packIds.add(m.id);
  for(const k of Object.keys(m))if(!fields.includes(k))fail(`${m.id}: unsupported field ${k}`);
  packs.push({dir,m});
 }
 const {ordered,visible}=orderPacks(packs);
 // 归属：同一种类的同一 id 只能由一个包定义（defs）；引用不分种类，owners 记某个字符串由哪些包定义。rawByPack 存各包原始资产（$text、数值解析之前），供加载完后扫引用。都只在编译过程中存在，不写进 catalog
 const defs=new Map(),owners=new Map(),rawByPack=new Map();
 const define=(ns,id,packId)=>{if(typeof id!=='string'||!id)return;const key=`${ns}\u0000${id}`,prev=defs.get(key);if(prev!==undefined&&prev!==packId)fail(`${ns} id ${id} defined by both ${prev} and ${packId}`);defs.set(key,packId);if(!owners.has(id))owners.set(id,new Set());owners.get(id).add(packId);};
 for(const {dir,m} of ordered){
  const base=join(packsDir,dir);const raw=[];rawByPack.set(m.id,raw);
  const load=async path=>{if(typeof path!=='string'||isAbsolute(path)||path.split(/[\\/]/).includes('..'))fail(`${m.id}: unsafe asset path`);const p=await realpath(path.startsWith('src/')||path.startsWith('mod-kit/')?resolve(sourceRoot,path):resolve(base,path));const rel=relative(await realpath(sourceRoot),p);if(rel.startsWith('..')||isAbsolute(rel)||!p.endsWith('.json'))fail(`${m.id}: asset outside source tree`);return JSON.parse(await readFile(p,'utf8'));};
  const own=(kind,items)=>{for(const x of items){raw.push({kind,value:x});for(const [ns,id] of definedIds(kind,x))define(ns,id,m.id);}};
  for(const k of kinds){if(!Array.isArray(m[k]||[]))fail(`${m.id}.${k}: expected file list`);for(const path of m[k]||[]){const value=await load(path);const items=Array.isArray(value)?value:[value];own(k,items);catalog[k].push(...items);}}
  for(const k of lineFormatKinds){if(!Array.isArray(m[k]||[]))fail(`${m.id}.${k}: expected file list`);for(const path of m[k]||[]){const value=await load(path);if(!Array.isArray(value))fail(`${m.id}.${k}: expected array`);own(k,value);lineFormats[k].push(...value);}}
  // F0a：lineCriticalEvents 的文件是数组，其余是对象；形状在 compileCoreFormats 里校验。原始值进归属扫描
  for(const k of coreFormatKinds){if(!Array.isArray(m[k]||[]))fail(`${m.id}.${k}: expected file list`);for(const path of m[k]||[]){const value=await load(path);own(k,Array.isArray(value)?value:[value]);coreRaw[k].push({packId:m.id,value});}}
  for(const k of presentationFormatKinds){if(!Array.isArray(m[k]||[]))fail(`${m.id}.${k}: expected file list`);for(const path of m[k]||[]){const value=await load(path);if(!Array.isArray(value))fail(`${m.id}.${k}: expected array`);own(k,value);presentationRaw[k].push({packId:m.id,value});}}
  for(const file of [m.texts].flat().filter(Boolean)){const texts=await load(file);if(!object(texts))fail(`${m.id}: invalid texts`);for(const[id,text]of Object.entries(texts)){define('text',id,m.id);raw.push({kind:'texts',value:presentationTextKeyReferences(id)});if(typeof text!=='string'||!text||id in catalog.texts)fail(`${m.id}: invalid/duplicate text ${id}`);catalog.texts[id]=text;}}
  if(m.questLineResources){const value=await load(m.questLineResources);raw.push({kind:'questLineResources',value});const res=resolveNumbers(value,numbers,`${m.id}.questLineResources`);if(!object(res)||Object.keys(res).some(k=>!resourceKinds.includes(k)))fail(`${m.id}: invalid quest line resources`);for(const[kind,table]of Object.entries(res)){if(!object(table))fail(`${m.id}: invalid ${kind}`);const into=catalog.questLineResources[kind]||={};for(const[id,v]of Object.entries(table)){define(kind,id,m.id);if(id in into)fail(`${m.id}: duplicate ${kind} ${id}`);into[id]=v;}}}
  // 线的下一步表（右栏线入口复用分析 2026-10-27 §5.2）：各包的 lines 合并，lineId 不得重复；内容校验在 validateWithTs 的 validateLineCompassTable
  if(m.lineCompass){const t=await load(m.lineCompass);if(!object(t)||t.version!==1||!Array.isArray(t.lines))fail(`${m.id}.lineCompass: expected {version:1,lines:[]}`);if(t.note!==undefined&&typeof t.note!=='string')fail(`${m.id}.lineCompass: invalid note`);own('lineCompass',t.lines);catalog.lineCompass.lines.push(...t.lines);}
  if(!Array.isArray(m.nationLines||[]))fail(`${m.id}.nationLines: expected file list`);for(const path of m.nationLines||[]){const v=await load(path);if(!Array.isArray(v))fail(`${m.id}.nationLines: expected array`);own('nationLines',v);nationLines.push(...v.map(value=>({packId:m.id,value})));}
  if(m.timeline){const v=await load(m.timeline);if(!Array.isArray(v))fail(`${m.id}.timeline: expected array`);own('timeline',v);timelineInserts.push(...v);}
  for(const k of ['playtests','entries'])if(m[k]){const v=await load(m[k]);if(!Array.isArray(v))fail(`${m.id}.${k}: expected array`);own(k,v);catalog[k].push(...v);}
 }
 const builtinDir=join(sourceRoot,'src/modules/scenarioMods/builtins/data');const builtins=await Promise.all((await readdir(builtinDir)).filter(x=>x.endsWith('.json')).map(async x=>JSON.parse(await readFile(join(builtinDir,x),'utf8'))));
 const baseEvents=new Map(builtins.flatMap(s=>(s.scenario?.events||[]).map(e=>[e.id,structuredClone(e)])));
 // overlay 新增的事件（既不是内置事件、也不是某包关内事件）归该包；改写已有事件算引用
 const stageEvents=new Set([...defs.keys()].filter(k=>k.startsWith('event\u0000')));
 for(const [packId,raw] of rawByPack)for(const {kind,value} of raw)if(kind==='overlays'&&object(value))for(const e of value.events||[])if(typeof e?.id==='string'&&!baseEvents.has(e.id)&&!stageEvents.has(`event\u0000${e.id}`))define('event',e.id,packId);
 // B1：二级线的 after 只是全局排序提示（mergeSecondaryLines 在全部包线上解析），不算跨包引用，不要求 dependsOn；找不到、成环、同 after、重复 id 照旧报错
 // B3：主轴 stages[].pillars 是编译期按枚举（bloodline｜taiquan）校验的闭集，不是 id 引用（"taiquan" 与太泉包的线 id 同名），不进归属扫描；storyAxis 其余字段照扫
 const unscanned=(kind,value)=>{if(!object(value))return value;if(kind==='storyAxis'&&Array.isArray(value.stages))return {...value,stages:value.stages.map(s=>{if(!object(s))return s;const {pillars:_pillars,...rest}=s;return rest;})};if(kind!=='secondaryLines')return value;const {after:_after,...rest}=value;return rest;};
 for(const [packId,raw] of rawByPack){const seen=visible(packId);const scan=v=>{if(typeof v==='string'){for(const c of referenceCandidates(v)){const q=owners.get(c);if(q&&![...q].some(x=>seen.has(x)))fail(`${packId} references ${c} owned by ${[...q].join('/')}; add dependsOn`);}}else if(Array.isArray(v))v.forEach(scan);else if(object(v))for(const[k,x]of Object.entries(v)){scan(k);scan(x);}};for(const {kind,value} of raw)scan(unscanned(kind,value));}
 // Stage assets use the same numeric authority as quest lines; prose is held in pack texts.
 const resolveText=(value,where)=>{
  if(Array.isArray(value))return value.map((v,i)=>resolveText(v,`${where}.${i}`));
  if(!object(value))return value;
  if('$text' in value){if(Object.keys(value).length!==1||typeof value.$text!=='string'||!(value.$text in catalog.texts))fail(`${where}: invalid $text reference`);return catalog.texts[value.$text];}
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolveText(v,`${where}.${k}`)]));
 };
 catalog.stages=catalog.stages.map((s,i)=>resolveText(resolveNumbers(s,numbers,`stages.${i}`),`stages.${i}`));
 catalog.questLines=catalog.questLines.map((l,i)=>expandEchoes(resolveNumbers(l,numbers,`questLines.${i}`)));
 unique([...catalog.contracts,...catalog.drafts],x=>x.meta?.id,'contract');unique(catalog.statuses,x=>x.id,'status');unique(catalog.stages,x=>x.manifest?.id,'stage');unique(catalog.playtests,x=>x.id,'playtest');unique(catalog.entries,x=>x.id,'entry');unique(catalog.questLines,x=>x.id,'quest line');unique(catalog.entities,x=>`${x.kind}:${x.entry?.id}`,'entity');
 const stages=new Map(builtins.map(x=>[x.manifest.id,x]));for(const s of catalog.stages){if(stages.has(s.manifest.id))fail(`stage shadows builtin ${s.manifest.id}`);stages.set(s.manifest.id,s);}
 catalog.overlays=resolveNumbers(catalog.overlays,numbers,'overlays');
 catalog.mapRoutes=resolveNumbers(catalog.mapRoutes,numbers,'mapRoutes');
 const applyOverlay=await import('./content-pack-overlays.mjs');applyOverlay.applyPackOverlays(stages,catalog.overlays);
 if(catalog.questLines.length){
  // 只取逐拍演出关判定；不经 stepScene.ts／fixedEndingNarratives（它们 import contentPacks，会读 generated/catalog.json，M2）：TS 侧前缀取纯数据，再并上本次编译里各包 openWorldSlices 的前缀（F0b）
  const {TS_STEP_SCENE_STAGE_PREFIXES,isStepSceneStageIn}=await tsLoader().import(join(root,'src/modules/scenarioMods/travel/openWorldSlices.ts'));const stepScenePrefixes=[...TS_STEP_SCENE_STAGE_PREFIXES,...rawStepScenePrefixes(presentationRaw)],isNanhuangSceneStage=id=>isStepSceneStageIn(stepScenePrefixes,id);
  const base=JSON.parse(await readFile(join(sourceRoot,'mod-kit/quest-lines/resources.json'),'utf8'));
  const routeLocationNames=Object.fromEntries(JSON.parse(await readFile(join(sourceRoot,'mod-kit/entity-catalog/locations.json'),'utf8')).entries.map(e=>[e.id,e.definition?.name]).filter(([,n])=>n));
  for(const [stageId,projected] of projectQuestLineEvents({lines:catalog.questLines,stages,texts:{...base.texts,...catalog.texts},intentMatches:{...base.intentMatches,...catalog.questLineResources.intentMatches},guardCovers:isNanhuangSceneStage,routeLocationNames})){const overlay={stageId,events:projected};catalog.overlays.push(overlay);applyOverlay.applyPackOverlays(stages,[overlay]);}
 }
 for (const stage of stages.values()) for (const event of stage.scenario?.events || []) for (const action of event.playerCompletionContract?.actions || []) {
  if(action.timeAdvance!==undefined){const t=action.timeAdvance;if(!object(t)||Object.keys(t).some(k=>!['kind','years','supersedes','interludeTextKey'].includes(k))||t.kind!=='calendarYears'||!Number.isSafeInteger(t.years)||t.years<=0||(t.supersedes!==undefined&&(!Array.isArray(t.supersedes)||t.supersedes.some(r=>typeof r!=='string'||!/^[^:]+::[^:]+$/.test(r))))||(t.interludeTextKey!==undefined&&typeof catalog.texts[t.interludeTextKey]!=='string'))fail(`invalid timeAdvance ${event.id}`);}
  if(action.action_time!==undefined){const t=action.action_time;if(!object(t)||Object.keys(t).some(k=>!['tier','days'].includes(k))||!['一瞬','片刻','一时辰','半日','一日','数日'].includes(t.tier)||(t.tier==='数日'? !Number.isSafeInteger(t.days)||t.days<=0:t.days!==undefined))fail(`invalid action_time ${event.id}`);}
 }
 const locationIds=new Set(JSON.parse(await readFile(join(sourceRoot,'mod-kit/entity-catalog/locations.json'),'utf8')).entries.flatMap(e=>[e.id,...(e.aliases||[])]));
 unique(catalog.mapRoutes,r=>r.id,'map route');
 for(const r of catalog.mapRoutes)if(!object(r)||Object.keys(r).some(k=>!['id','fromId','toId','dayCost','unlockWhen'].includes(k))||!locationIds.has(r.fromId)||!locationIds.has(r.toId)||r.fromId===r.toId||!(r.dayCost==='several'||typeof r.dayCost==='number'&&Number.isFinite(r.dayCost)&&r.dayCost>=0)||(r.unlockWhen!==undefined&&(!Array.isArray(r.unlockWhen)||r.unlockWhen.some(id=>typeof id!=='string'))))fail(`invalid map route ${r?.id}`);
 const events=new Map([...stages.values()].flatMap(s=>(s.scenario?.events||[]).map(e=>[e.id,e])));
 for(const r of catalog.mapRoutes)for(const id of r.unlockWhen||[])if(!events.has(id))fail(`map route ${r.id}: unknown unlock event ${id}`);
 const playtests=new Map(catalog.playtests.map(x=>[x.id,x]));
 const expand=(p,chain=[])=>{if(chain.includes(p.id))fail(`playtest inheritance cycle ${p.id}`);if(!p.extends)return p;const parent=playtests.get(p.extends);if(!parent)fail(`missing parent ${p.extends}`);const v={...expand(parent,[...chain,p.id]),...p};delete v.extends;return v;};catalog.playtests=catalog.playtests.map(p=>expand(p));
 for(const p of catalog.playtests){if(p.nextId!==undefined&&!playtests.has(p.nextId))fail(`playtest ${p.id}: missing next ${p.nextId}`);if(!stages.has(p.startModId)||!stages.has(p.endModId)||!events.has(p.endEventId))fail(`playtest ${p.id}: dangling stage/end event`);const end=stages.get(p.endModId);if(!end.scenario.events.some(e=>e.id===p.endEventId))fail(`playtest ${p.id}: end event in wrong stage`);if(typeof p.kind!=='string'||typeof p.extensionKey!=='string'||!Array.isArray(p.eventIds)||p.eventIds.some(id=>!events.has(id))||new Set(p.eventIds).size!==p.eventIds.length)fail(`playtest ${p.id}: invalid scope`);for(const stageId of Object.keys(p.stageOpeningTextIds||{}))if(!stages.has(stageId))fail(`playtest ${p.id}: unknown opening stage`);for(const id of [p.openingTextId,...Object.values(p.stageOpeningTextIds||{})].filter(Boolean))if(!(id in catalog.texts))fail(`playtest ${p.id}: missing text ${id}`);}
 const openingAssignments=new Map();for(const p of catalog.playtests)for(const [stage,id]of Object.entries(p.stageOpeningTextIds||{})){if(openingAssignments.has(stage)&&openingAssignments.get(stage)!==id)fail(`conflicting stage opening ${stage}`);openingAssignments.set(stage,id);}
 const routerSource=await readFile(join(sourceRoot,'src/router/index.ts'),'utf8');const routes=new Set([...routerSource.matchAll(/path:\s*['"]([^'"]+)['"]/g)].map(x=>x[1]));
 const entryKeys=new Set();for(const e of catalog.entries){if(typeof e.label!=='string'||!e.label||!['primary','legacy'].includes(e.group)||typeof e.route!=='string'||!e.route.startsWith('/')||e.route.startsWith('//')||!['Moon','Orbit','Feather'].includes(e.icon)||typeof e.testId!=='string'||entryKeys.has(e.testId))fail(`entry ${e.id}: invalid route/presentation`);entryKeys.add(e.testId);if(!routes.has(e.route))fail(`entry ${e.id}: route is not registered; use the generic playtest route`);if(e.playtestId&&(!playtests.has(e.playtestId)||e.route!=='/qingyu-opening-playtest'||!catalog.playtests.find(p=>p.id===e.playtestId)?.characterId||!catalog.playtests.find(p=>p.id===e.playtestId)?.slot))fail(`entry ${e.id}: missing playtest`);}
 const hooks=new Set();for(const c of catalog.contracts){if(c.meta?.readiness==='draft'||c.meta?.pendingDecisions?.length)fail(`unresolved contract ${c.meta?.id}`);const h=c.meta?.hook;if(!events.has(h?.eventId))fail(`contract ${c.meta.id}: missing event ${h?.eventId}`);if(!events.get(h.eventId)?.playerCompletionContract?.actions?.some(a=>a.id===h.actionId))fail(`contract ${c.meta.id}: missing action ${h.actionId}`);if(h.compatibleActionIds!==undefined&&(!Array.isArray(h.compatibleActionIds)||new Set(h.compatibleActionIds).size!==h.compatibleActionIds.length||h.compatibleActionIds.some(id=>!baseEvents.get(h.eventId)?.playerCompletionContract?.actions?.some(a=>a.id===id&&a.kind!=='prepare'))))fail(`contract ${c.meta.id}: invalid compatible action`);
 if(h.completionSceneByOutcome){if(!object(h.completionSceneByOutcome))fail('invalid outcome completion scene');for(const[k,v]of Object.entries(h.completionSceneByOutcome)){if(!['win','lose'].includes(k)||!object(v)||Object.keys(v).some(key=>!['fixedFacts','fallbackText','factChecks','cast','dayPart','sceneLocation','ledgerEffects'].includes(key)))fail(`contract ${c.meta.id}: unsafe completion override`);}}
 const key=JSON.stringify([h.eventId,h.actionId,h.requiredFlag||'']);if(hooks.has(key))fail(`ambiguous contract hook ${key}`);hooks.add(key);}
 const baseEntities=await Promise.all(['items','skills','techniques'].map(async k=>JSON.parse(await readFile(join(sourceRoot,`mod-kit/entity-catalog/${k}.json`),'utf8'))));
 for(const x of catalog.entities)if(!['item','skill','technique'].includes(x.kind)||!object(x.entry)||typeof x.entry.id!=='string'||!Array.isArray(x.entry.aliases)||!object(x.entry.definition)||!object(x.entry.stageVariants))fail('invalid entity increment');else if(baseEntities[['item','skill','technique'].indexOf(x.kind)].entries.some(e=>e.id===x.entry.id))fail(`entity shadows authority ${x.entry.id}`);
 // 只有 eventId 的步的通用句「回到{地点}看看」（R-4／P-12）：地点取该事件 locationId 在所在关 canon.locations 的名字，退回实体目录名；没有 locationId 记空串（运行时只显示线名）；地点 id 另记 lineCompassPlaceIds（travelHint 判已在该地，fix5939-2）
 // 国家线注册（秦线 PR C）：只认 lineId／order／regions；lineId、order 全部包里不重复，同一地区只登记到一条线。按 order 排成 catalog.nationLines，
 // 运行时 NATION_LINE_IDS（numbersRegistry.ts）与地区→线映射都从它派生；编译期一律用这次编译出的值，不读磁盘上的旧 catalog（M2）
 {const byOrder=new Map(),byRegion=new Map(),str=v=>typeof v==='string'&&v.trim().length>0;
  for(const {packId,value:x} of nationLines){const at=`nation line ${x?.lineId}`;
   if(!object(x)||Object.keys(x).some(k=>!['lineId','order','regions'].includes(k))||!str(x.lineId)||!Number.isSafeInteger(x.order)||x.order<1||!Array.isArray(x.regions)||!x.regions.length||!x.regions.every(str)||new Set(x.regions).size!==x.regions.length)fail(`${at}: invalid fields`);
   if(byOrder.has(x.order))fail(`${at}: order ${x.order} also used by ${byOrder.get(x.order)}`);byOrder.set(x.order,x.lineId);
   for(const r of x.regions){if(byRegion.has(r))fail(`${at}: region ${r} also registered to ${byRegion.get(r)} (${packId})`);byRegion.set(r,x.lineId);}}
  catalog.nationLines=nationLines.map(x=>x.value).sort((a,b)=>a.order-b.order);unique(catalog.nationLines,x=>x.lineId,'nation line');}
 // 线顺序（右栏「别处」的显示顺序）与包顺序无关：按这次编译出的 nationLines 顺序稳定排序
 {const ids=catalog.nationLines.map(x=>x.lineId);const rank=id=>{const i=ids.indexOf(id);return i<0?Infinity:i;};catalog.lineCompass.lines.sort((x,y)=>rank(x?.lineId)-rank(y?.lineId));}
 {const catalogLocationNames=Object.fromEntries(JSON.parse(await readFile(join(sourceRoot,'mod-kit/entity-catalog/locations.json'),'utf8')).entries.map(e=>[e.id,e.definition?.name]).filter(([,n])=>n));const stageOfEvent=new Map([...stages.values()].flatMap(s=>(s.scenario?.events||[]).map(e=>[e.id,s])));for(const line of catalog.lineCompass.lines)for(const step of line.steps||[]){if(typeof step.eventId!=='string'||step.pending||!events.has(step.eventId)||step.eventId in catalog.lineCompassPlaces)continue;const locationId=events.get(step.eventId).locationId;const name=locationId?String((stageOfEvent.get(step.eventId)?.canon?.locations||[]).find(l=>l?.id===locationId)?.name||catalogLocationNames[locationId]||''):'';catalog.lineCompassPlaces[step.eventId]=name;catalog.lineCompassPlaceIds[step.eventId]=locationId||'';}}
 catalog.timeline=compileTimeline({rawInserts:timelineInserts,numbers,stages:[...stages.values()],texts:catalog.texts});
 // 暂扣动作（while 全部成立时该合同动作不可做，先做 prerequisiteBeatId 那一拍）：条件只读 flags，与步骤 visibleWhen 同形
 const beatIds=new Set(catalog.questLines.flatMap(l=>(l.beats||[]).map(b=>b.id)));
 const itemIds=new Set([...JSON.parse(await readFile(join(sourceRoot,'mod-kit/entity-catalog/items.json'),'utf8')).entries.map(e=>e.id),...catalog.entities.filter(e=>e.kind==='item').map(e=>e.entry.id)]);
 for(const h of catalog.heldActions){
  const actions=h?.eventId?events.get(h.eventId)?.playerCompletionContract?.actions:[...events.values()].flatMap(e=>e.playerCompletionContract?.actions||[]);
  const action=actions?.find(a=>a.id===h?.actionId);
  if(!object(h)||Object.keys(h).some(k=>!['id','subject','intentLabelId','eventId','actionId','while','prerequisiteBeatId'].includes(k))||(!h.eventId&&!h.actionId)||(h.eventId!==undefined&&!events.has(h.eventId))||(h.actionId!==undefined&&!action)||(h.id!==undefined&&(typeof h.id!=='string'||!h.id))||(h.subject!==undefined&&(!object(h.subject)||Object.keys(h.subject).some(k=>k!=='itemId')||!itemIds.has(h.subject.itemId)))||(h.intentLabelId!==undefined&&!catalog.texts[h.intentLabelId])||!beatIds.has(h.prerequisiteBeatId)||!Array.isArray(h.while)||!h.while.length||h.while.some(c=>!object(c)||Object.keys(c).some(k=>!['path','operator','value'].includes(k))||typeof c.path!=='string'||!/^flags\.[a-zA-Z0-9_.:-]+$/.test(c.path)||!['eq','neq'].includes(c.operator)||!['string','number','boolean'].includes(typeof c.value)))fail(`invalid held action ${h?.eventId}:${h?.actionId}`);
  h.label=h.intentLabelId?catalog.texts[h.intentLabelId]:action?.label;
  if(action?.grantsPreparation)h.grantsPreparation=action.grantsPreparation;
  if(typeof h.label!=='string'||!h.label)fail(`held action missing label ${h.eventId}:${h.actionId}`);
 }
 unique(catalog.heldActions,h=>h.id||`${h.eventId||''}:${h.actionId||''}`,'held action');
 // 正典 rail（秦线 PR B）：每条挂到一个已有关，同一关只登记一条；拍序只取该关的事件，合同与拍序逐位对齐；文案用 $text 引用包内正文。note 只给作者看，不进 catalog
 unique(catalog.rails,r=>r?.modId,'rail modId');unique(catalog.rails,r=>r?.id,'rail');
 // 加拍（宋线 S2，manifest.railExtraBeats）：形状同 canonRail.ts 的 DEFAULT_LINE_EXTRA_RAIL_BEATS，afterEventId／beforeEventId 二选一；按 canonRailMerge.ts 同一算法并进同一次编译里的包 rail，再过下面的 rail 校验
 const extraBeats=lineFormats.railExtraBeats.map((raw,i)=>{
  const at=`railExtraBeats ${raw?.modId}`;
  if(!object(raw)||Object.keys(raw).some(k=>!['modId','afterEventId','beforeEventId','eventIds','contracts','note'].includes(k))||(raw.note!==undefined&&typeof raw.note!=='string')||typeof raw.modId!=='string'||(raw.afterEventId===undefined)===(raw.beforeEventId===undefined)||[raw.afterEventId,raw.beforeEventId].some(v=>v!==undefined&&(typeof v!=='string'||!v))||!Array.isArray(raw.eventIds)||!raw.eventIds.length||raw.eventIds.some(id=>typeof id!=='string'||!id)||!Array.isArray(raw.contracts))fail(`${at}: invalid fields`);
  if(!catalog.rails.some(r=>r?.modId===raw.modId))fail(`${at}: no pack rail for this stage`);
  const {note,...x}=resolveText(raw,`railExtraBeats.${i}`);return x;
 });
 const {mergeExtraRailBeats}=extraBeats.length?await tsLoader().import(join(root,'src/modules/scenarioMods/canonRailMerge.ts')):{};
 catalog.rails=catalog.rails.map((raw,i)=>{
  const at=`rail ${raw?.modId}`;
  if(!object(raw)||Object.keys(raw).some(k=>!['id','modId','handReviewed','chapterId','orderedEventIds','contracts','note'].includes(k))||(raw.note!==undefined&&typeof raw.note!=='string')||(raw.handReviewed!==undefined&&raw.handReviewed!==true))fail(`${at}: invalid fields`);
  let {note,...r}=resolveText(raw,`rails.${i}`);const stage=stages.get(r.modId);if(!stage)fail(`${at}: unknown stage`);
  // 塞外线 S4：handReviewed: true 标记搬进包的手审档，运行时排在包内关 rail 与生成档之前（canonRail.ts）；只给挂内置关的档用
  if(r.handReviewed&&catalog.stages.some(s=>s.manifest.id===r.modId))fail(`${at}: handReviewed is only for built-in stages`);
  if(extraBeats.some(x=>x.modId===r.modId)){try{[r]=mergeExtraRailBeats([r],extraBeats);}catch(e){fail(`${at}: ${e.message}`);}}
  if(!(stage.scenario?.chapters||[]).some(c=>c.id===r.chapterId))fail(`${at}: chapter ${r.chapterId} not in stage`);
  const own=new Set((stage.scenario?.events||[]).map(e=>e.id));const str=v=>typeof v==='string'&&v.length>0;
  if(!Array.isArray(r.orderedEventIds)||!r.orderedEventIds.length||new Set(r.orderedEventIds).size!==r.orderedEventIds.length||r.orderedEventIds.some(id=>!own.has(id)))fail(`${at}: orderedEventIds must be distinct events of the stage`);
  if(!Array.isArray(r.contracts)||r.contracts.length!==r.orderedEventIds.length||r.contracts.some((c,j)=>!object(c)||Object.keys(c).some(k=>!['eventId','mustReach','completionEvidence','forbiddenInCanon','allowedElaboration'].includes(k))||c.eventId!==r.orderedEventIds[j]||!str(c.mustReach)||!str(c.allowedElaboration)||!Array.isArray(c.completionEvidence)||!c.completionEvidence.every(str)||!Array.isArray(c.forbiddenInCanon)||!c.forbiddenInCanon.every(str)))fail(`${at}: invalid contracts`);
  return r;
 });
 // 包 rail 文案里的动态名字：{{entity:<kind>:<id>}}、{{entityLabel:<kind>:<id>:<labelId>}}，运行时由 canonRail.ts 解析；这里只校验写法、实体与标签存在（二级线同样，见下）
 await checkEntityTemplates('rail',catalog.rails);
 // 界面章名与配乐（秦线 PR B）：包内关的事件 presentation.uiChapterId 指向同一关已有章；章 presentation 只收 mood，取值为 musicLibrary.ts 的 MusicMood
 {const music=await readFile(join(sourceRoot,'src/utils/musicLibrary.ts'),'utf8');const moods=new Set([...(music.match(/export type MusicMood =([^;]+);/)?.[1]||'').matchAll(/'([^']+)'/g)].map(x=>x[1]));if(!moods.size)fail('MusicMood not found in musicLibrary.ts');
 for(const s of catalog.stages){const chapterIds=new Set((s.scenario?.chapters||[]).map(c=>c.id));
  for(const e of s.scenario?.events||[])if(e.presentation?.uiChapterId!==undefined&&!chapterIds.has(e.presentation.uiChapterId))fail(`event ${e.id}: uiChapterId ${e.presentation.uiChapterId} is not a chapter of ${s.manifest.id}`);
  for(const c of s.scenario?.chapters||[])if(c.presentation!==undefined&&(!object(c.presentation)||Object.keys(c.presentation).some(k=>k!=='mood')||!moods.has(c.presentation.mood)))fail(`chapter ${c.id}: invalid presentation`);}
 // stageMeta（宋线 S2）：每条挂一个关（包内关或内置关），stageId 不重复；章、事件属于这一关；uiChapterId／defaultUiChapterId 是这一关的章；mood 属于 MusicMood；objective 非空。
 // 事件配乐与目标按事件 id 全局查，所以同一事件 id 在全部 stageMeta 里只能出现一次（章配乐同理）；包内关已有 presentation 的事件／章不得再写。编译后补 chapterTitles，note 剥掉。与 TS 表是否重复在 validateWithTs 查
 unique(lineFormats.stageMeta,x=>x?.stageId,'stageMeta stageId');
 const metaEvents=new Set(),metaChapters=new Set(),metaTemplates=[],text=v=>typeof v==='string'&&v.trim().length>0;
 catalog.stageMeta=lineFormats.stageMeta.map((raw,i)=>{
  const at=`stageMeta ${raw?.stageId}`;
  if(!object(raw)||Object.keys(raw).some(k=>!['stageId','defaultLineQuarantined','milestoneReward','presentation','note'].includes(k))||(raw.note!==undefined&&typeof raw.note!=='string'))fail(`${at}: invalid fields`);
  const {note,...x}=resolveText(raw,`stageMeta.${i}`);const stage=stages.get(x.stageId);if(!stage)fail(`${at}: unknown stage`);
  if(x.defaultLineQuarantined!==undefined&&typeof x.defaultLineQuarantined!=='boolean')fail(`${at}: defaultLineQuarantined must be boolean`);
  const r=x.milestoneReward;if(r!==undefined&&(!object(r)||Object.keys(r).some(k=>!['titles','revokeTitles','note'].includes(k))||!Array.isArray(r.titles)||!r.titles.length||!r.titles.every(text)||(r.revokeTitles!==undefined&&(!Array.isArray(r.revokeTitles)||!r.revokeTitles.every(text)))||!text(r.note)))fail(`${at}: invalid milestoneReward`);
  const p=x.presentation;if(p===undefined)return x;
  if(!object(p)||Object.keys(p).some(k=>!['defaultUiChapterId','chapters','events',...stageMetaPresentationExtraKeys].includes(k))||(p.chapters!==undefined&&!object(p.chapters))||(p.events!==undefined&&!object(p.events)))fail(`${at}: invalid presentation`);
  const chapters=new Map((stage.scenario?.chapters||[]).map(c=>[c.id,c])),events=new Map((stage.scenario?.events||[]).map(e=>[e.id,e])),chapterTitles={};
  const chapter=id=>{if(!chapters.has(id))fail(`${at}: ${id} is not a chapter of ${x.stageId}`);return chapters.get(id);};
  const titled=id=>{const t=chapter(id).title;if(!text(t))fail(`${at}: chapter ${id} has no title`);chapterTitles[id]=t;};
  if(p.defaultUiChapterId!==undefined)titled(p.defaultUiChapterId);
  for(const [id,c] of Object.entries(p.chapters||{})){const own=chapter(id);if(!object(c)||Object.keys(c).some(k=>k!=='mood')||!moods.has(c.mood))fail(`${at}: chapter ${id}: invalid mood`);if(own.presentation?.mood!==undefined)fail(`${at}: chapter ${id} already has presentation.mood`);if(metaChapters.has(id))fail(`stageMeta chapter ${id} appears twice`);metaChapters.add(id);}
  for(const [id,e] of Object.entries(p.events||{})){
   if(!events.has(id))fail(`${at}: ${id} is not an event of ${x.stageId}`);
   if(!object(e)||!Object.keys(e).length||Object.keys(e).some(k=>!['uiChapterId','mood','objective',...stageMetaEventExtraKeys].includes(k)))fail(`${at}: event ${id}: invalid fields`);
   if(metaEvents.has(id))fail(`stageMeta event ${id} appears twice`);metaEvents.add(id);
   if(e.uiChapterId!==undefined){titled(e.uiChapterId);if(events.get(id).presentation?.uiChapterId!==undefined)fail(`${at}: event ${id} already has presentation.uiChapterId`);}
   if(e.mood!==undefined&&!moods.has(e.mood))fail(`${at}: event ${id}: invalid mood ${e.mood}`);
   if(e.objective!==undefined&&!text(e.objective))fail(`${at}: event ${id}: empty objective`);
  }
  metaTemplates.push(...checkStageMetaPresentationExtras({at,stageId:x.stageId,presentation:p,stageEvents:events,locationIds}));
  return Object.keys(chapterTitles).length?{...x,chapterTitles}:x;
 });
 // F0b：stageMeta 目标里的 {{entity:…}}／{{entityLabel:…}}，运行时由 fixedQuestObjectives.ts 解析
 await checkEntityTemplates('stageMeta objective',metaTemplates);}
 // 二级线（宋线 S2）：SecondaryLine 加 after（插在哪条线后面）。kind／status 合法；ready 节点的关存在、事件属于该关；锚事件存在（anchorEventPending 除外）；锚地点在 locations.json（含别名）；
 // 包线之间 id、after 不重复。after 指向的线是否存在、id 是否与 TS 线重复在 validateWithTs 查。note（线上、节点上）只给作者看，剥掉
 unique(lineFormats.secondaryLines,x=>x?.id,'secondary line');
 {let headless;const afters=new Set(),text=v=>typeof v==='string'&&v.trim().length>0,texts=v=>v===undefined||(Array.isArray(v)&&v.every(text));
 catalog.secondaryLines=lineFormats.secondaryLines.map(raw=>{
  const at=`secondary line ${raw?.id}`;
  if(!object(raw)||Object.keys(raw).some(k=>!['id','name','kind','anchorCharacterIds','anchorLocationIds','anchorEventIds','anchorEventPending','entryHint','unlock','entryHintKeys','basis','nodes','pendingExpansion','after','note'].includes(k)))fail(`${at}: invalid fields`);
  const {note,...line}=raw;
  if((note!==undefined&&typeof note!=='string')||!text(line.name)||!['sect','nation','commerce','expedition'].includes(line.kind)||!text(line.entryHint)||!text(line.basis)||!texts(line.anchorCharacterIds)||!texts(line.anchorLocationIds)||!texts(line.anchorEventIds)||(line.anchorEventPending!==undefined&&line.anchorEventPending!==true)||(line.unlock!==undefined&&!text(line.unlock))||(line.entryHintKeys!==undefined&&!object(line.entryHintKeys))||(line.pendingExpansion!==undefined&&typeof line.pendingExpansion!=='string'))fail(`${at}: invalid fields`);
  // F0a：全部包线里至多一条不写 after（排最前）；TS 表非空时不允许，在 validateWithTs 查（mergeSecondaryLines）
  if(line.after===undefined){if(headless)fail(`${at}: only one pack line may omit after (${headless} already does)`);headless=line.id;}
  else{if(!text(line.after))fail(`${at}: after must name a line`);if(afters.has(line.after))fail(`${at}: another pack line is already after ${line.after}`);afters.add(line.after);}
  if(!line.anchorEventPending)for(const id of line.anchorEventIds||[])if(!events.has(id))fail(`${at}: unknown anchor event ${id}`);
  for(const id of line.anchorLocationIds||[])if(!locationIds.has(id))fail(`${at}: unknown anchor location ${id}`);
  if(!Array.isArray(line.nodes)||!line.nodes.length)fail(`${at}: nodes must be a non-empty array`);
  line.nodes=line.nodes.map((rawNode,j)=>{
   if(!object(rawNode)||Object.keys(rawNode).some(k=>!['reviewSummary','status','stageId','eventId','beforeUnlock','note'].includes(k)))fail(`${at}: node ${j}: invalid fields`);
   const {note:nodeNote,...node}=rawNode;
   if((nodeNote!==undefined&&typeof nodeNote!=='string')||!text(node.reviewSummary)||!['ready','new','pending'].includes(node.status)||(node.stageId!==undefined&&!text(node.stageId))||(node.eventId!==undefined&&!text(node.eventId))||(node.beforeUnlock!==undefined&&node.beforeUnlock!==true))fail(`${at}: node ${j}: invalid fields`);
   if(node.status==='ready'){const stage=stages.get(node.stageId);if(!stage)fail(`${at}: node ${j}: unknown stage ${node.stageId}`);if(!(stage.scenario?.events||[]).some(e=>e.id===node.eventId))fail(`${at}: node ${j}: ${node.eventId} is not an event of ${node.stageId}`);}
   return node;
  });
  return line;
 });}
 // 二级线文案里的动态名字（F0a 搬迁预检：TS 线有 entityText 模板），运行时由 secondaryLines.ts 解析
 await checkEntityTemplates('secondary line',catalog.secondaryLines);
 // 核心轨与人物轨（F0a）
 {const loc=JSON.parse(await readFile(join(sourceRoot,'mod-kit/entity-catalog/locations.json'),'utf8')).entries;
  Object.assign(catalog,await compileCoreFormats(coreRaw,{stages,events,builtinStageIds:builtins.map(s=>s.manifest.id),location:{ids:locationIds,mainIds:new Set(loc.map(e=>e.id)),aliasIds:new Set(loc.flatMap(e=>e.aliases||[]))}}));}
 // 展示类（F0b）
 checkPresentationTextKeys(catalog.texts,events);
 Object.assign(catalog,await compilePresentationFormats(presentationRaw,{stages,events,baseEvents,locationIds,itemIds,beatIds,texts:catalog.texts,packContracts:[...catalog.contracts,...catalog.drafts],sourceRoot}));
 unique(catalog.mapEntries,e=>e.id,'mapEntries');
 for(const e of catalog.mapEntries){
  const stage=catalog.stages.find(s=>s.manifest.id===e.stageId);
  if(!stage?.scenario.events.some(event=>event.id===e.eventId)||typeof e.locationId!=='string'||e.readyPath!=='compass.qinEntryReady'||[e.previewTextId,e.returnLabelTextId,e.returnTextId,e.returnChronicleTextId].some(id=>id!==undefined&&!(id in catalog.texts)))fail(`invalid map entry ${e.id}`);
 }
 const serialized=JSON.stringify({...catalog,version:''});catalog.version=createHash('sha256').update(serialized).digest('hex').slice(0,16);return {catalog,ctx:{stages,events,baseEvents,sourceRoot}};
}
/** 文案里 {{…}} 动态名字的写法、实体与标签存在（只有出现 {{ 时才加载 namedEntities）。label 进报错文案。 */
async function checkEntityTemplates(label,value){
 const found=[];const scan=v=>{if(typeof v==='string')for(const x of v.matchAll(/\{\{([^{}]*)\}\}/g))found.push(x[1]);else if(Array.isArray(v))v.forEach(scan);else if(object(v))Object.values(v).forEach(scan);};scan(value);
 if(!found.length)return;
 const {namedEntity,entityRecognitionLabel}=await tsLoader().import(join(root,'src/modules/scenarioMods/namedEntities.ts'));const kindRe='(character|location|faction|enemy|ending)';
 for(const t of found){const e=t.match(new RegExp(`^entity:${kindRe}:([^}]+)$`)),l=t.match(new RegExp(`^entityLabel:${kindRe}:([^}:]+):([^}:]+)$`));
  if(e){if(!namedEntity(e[1],e[2]))fail(`${label} entity {{${t}}}: unknown ${e[1]} ${e[2]}`);}
  else if(l){if(!namedEntity(l[1],l[2]))fail(`${label} entity {{${t}}}: unknown ${l[1]} ${l[2]}`);try{entityRecognitionLabel(l[1],l[2],l[3]);}catch{fail(`${label} entity {{${t}}}: unknown label ${l[3]}`);}}
  else fail(`${label} entity {{${t}}}: expected entity:<kind>:<id> or entityLabel:<kind>:<id>:<labelId>`);}
}
/**
 * 经 jiti 加载 TS 校验器做的校验：validator.ts、lint.ts、questLines.ts 加载时会读磁盘上的 generated/catalog.json，
 * 所以这里看到的「当前目录」是磁盘上的那份。writeContentPacks 先写新 catalog 再在子进程里跑本函数（jiti 的 moduleCache:false
 * 不会重读被 TS 模块 import 的 json，实测 2.6.1），校验失败回滚。
 */
async function validateWithTs(catalog,{stages,events,baseEvents,sourceRoot},{validateContracts=true}={}){
 if(validateContracts){const jiti=tsLoader();const {lintContract}=await jiti.import(join(root,'src/modules/sceneModule/lint.ts'));const {validateScenarioMod}=await jiti.import(join(root,'src/modules/scenarioMods/validator.ts'));for(const stage of [...catalog.stages,...catalog.overlays.map(o=>stages.get(o.stageId))]){const v=validateScenarioMod(stage);if(!v.valid)fail(`invalid stage/overlay ${stage.manifest?.id}: ${JSON.stringify(v.issues)}`);}
 for(const c of catalog.contracts)for(const patch of Object.values(c.meta.hook.completionSceneByOutcome||{}))for(const actionId of [c.meta.hook.actionId,...(c.meta.hook.compatibleActionIds||[])]){const stage=structuredClone([...stages.values()].find(s=>s.scenario.events.some(e=>e.id===c.meta.hook.eventId)));let event=stage.scenario.events.find(e=>e.id===c.meta.hook.eventId);if(actionId!==c.meta.hook.actionId){const base=structuredClone(baseEvents.get(event.id));stage.scenario.events[stage.scenario.events.findIndex(e=>e.id===event.id)]=base;event=base;}const action=event.playerCompletionContract.actions.find(a=>a.id===actionId);Object.assign(action,patch);const v=validateScenarioMod(stage);if(!v.valid)fail(`invalid completion override ${c.meta.id}/${actionId}: ${JSON.stringify(v.issues)}`);}
 const book=JSON.parse(await readFile(join(sourceRoot,'src/modules/sceneModule/contracts/statuses.json'),'utf8'));unique([...book,...catalog.statuses],x=>x.id,'catalog status');for(const c of [...catalog.contracts,...catalog.drafts]){const report=lintContract({...c,statuses:[...(c.statuses||[]),...book,...catalog.statuses]});if(report.errors.length)fail(`${c.meta.id}: ${report.errors.join('; ')}`);}}
 if(catalog.questLines.length){const jiti=tsLoader();const {parseQuestLines,validateQuestLineReferences}=await jiti.import(join(root,'src/modules/scenarioMods/questLines.ts'));const resources=JSON.parse(await readFile(join(sourceRoot,'mod-kit/quest-lines/resources.json'),'utf8'));const texts={...resources.texts,...catalog.texts};const table=parseQuestLines({version:1,lines:catalog.questLines},id=>{if(!(id in texts))fail(`missing quest text ${id}`);return texts[id];},{...resources.intentMatches,...catalog.questLineResources.intentMatches});const index=JSON.parse(await readFile(join(sourceRoot,'mod-kit/entity-catalog/index.json'),'utf8'));const refs=new Set(index.entries.map(e=>`${e.kind}:${e.id}`));for(const [id,event]of events){refs.add(`event:${id}`);for(const a of event.playerCompletionContract?.actions||[])refs.add(`action:${id}:${a.id}`);}for(const x of catalog.entities)refs.add(`${x.kind}:${x.entry.id}`);for(const id of Object.keys(texts))refs.add(`text:${id}`);for(const[plural,kind]of [['memories','memoryTemplate'],['facts','fact'],['affinityWeights','affinityWeight'],['salience','salience']])for(const id of Object.keys(catalog.questLineResources[plural]||{}))refs.add(`${kind}:${id}`);for(const l of table.lines)for(const b of l.beats)for(const e of [...b.onComplete,...Object.values(b.byAction||{}).flat(),...(b.onExpire||[])]){if(e.kind==='setState'){refs.add(`state:${e.stateId}`);refs.add(`flag:${e.stateId}`);}if(e.kind==='setReceipt')refs.add(`receipt:${e.receiptId}`);}for(const l of table.lines)for(const b of l.beats)for(const a of b.steps||[])for(const c of a.visibleWhen||[])if(!refs.has(`state:${c.path.replace(/^flags\./,'')}`))fail(`${b.id}/${a.actionId}: visibleWhen reads undefined state ${c.path}`);const errors=validateQuestLineReferences(table,(kind,id,eventId)=>refs.has(`${kind}:${kind==='action'?`${eventId}:${id}`:id}`));if(errors.length)fail(errors.join('; '));}
 {const jiti=tsLoader();const {validateLineCompassTable}=await jiti.import(join(root,'src/modules/scenarioMods/validator.ts'));const issues=validateLineCompassTable(catalog.lineCompass,catalog.texts,catalog.lineCompassPlaces,catalog.nationLines.map(x=>x.lineId));if(issues.length)fail(`invalid lineCompass: ${JSON.stringify(issues)}`);}
 await validateLineFormatsWithTs(catalog,stages,sourceRoot);
 await validateCoreFormatsWithTs(catalog);
 await validatePresentationFormatsWithTs(catalog,stages);
}
/**
 * 线路格式与 TS 表的交叉校验（宋线 S2）：新段为空时不加载任何模块。TS 读取方一律用传入的新 catalog 调纯函数（不靠模块自己读磁盘 catalog），
 * 所以临时包目录的编译与子进程里的重建看到的是同一份数据。
 */
async function validateLineFormatsWithTs(catalog,stages,sourceRoot){
 const meta=catalog.stageMeta||[],lines=catalog.secondaryLines||[],rails=catalog.rails||[];
 if(!meta.length&&!lines.length&&!rails.length)return;
 const jiti=tsLoader();
 if(meta.length||rails.length){
  const {TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS,DEFAULT_LINE_EXTRA_RAIL_BEATS}=await jiti.import(join(root,'src/modules/scenarioMods/canonRail.ts'));
  // 同一关的加拍不能既在 TS 加拍表又在包 rail 里：运行时 canonRail 会把 TS 加拍再插一次（already present 直接抛错，或拍子重复）
  for(const r of rails)if(DEFAULT_LINE_EXTRA_RAIL_BEATS.some(x=>x.modId===r.modId))fail(`rail ${r.modId}: also listed in canonRail.ts DEFAULT_LINE_EXTRA_RAIL_BEATS; move those beats into the pack railExtraBeats`);
  for(const m of meta)if(m.defaultLineQuarantined!==undefined&&TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS.has(m.stageId))fail(`stageMeta ${m.stageId}: defaultLineQuarantined also set in canonRail.ts TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS`);
 }
 if(!meta.length&&!lines.length)return;
 if(meta.some(m=>m.milestoneReward)){const {TS_MILESTONE_REWARDS}=await jiti.import(join(root,'src/modules/scenarioMods/milestoneRewards.ts'));for(const m of meta)if(m.milestoneReward&&TS_MILESTONE_REWARDS.some(r=>r.stageId===m.stageId))fail(`stageMeta ${m.stageId}: milestoneReward also set in milestoneRewards.ts TS_MILESTONE_REWARDS`);}
 const events=meta.flatMap(m=>Object.entries(m.presentation?.events||{}).map(([id,e])=>({stageId:m.stageId,id,...e})));
 if(events.some(e=>e.objective)){const {resolveFixedQuestObjectiveIn}=await jiti.import(join(root,'src/modules/scenarioMods/fixedQuestObjectives.ts'));for(const e of events)if(e.objective&&resolveFixedQuestObjectiveIn([],{id:e.id}))fail(`stageMeta ${e.stageId}: objective for ${e.id} already set in fixedQuestObjectives.ts`);}
 // 章名：去掉 stageMeta 后用新 catalog 跑 storyChapterTitleIn，若已有结果（特判、包内关 presentation、地图入口口信拍），stageMeta 写了也不生效 → 报错。
 // defaultUiChapterId 用一个不存在的探针事件查整关特判；内置关另逐个查该关没有逐事件 uiChapterId 的事件
 if(meta.some(m=>m.presentation?.defaultUiChapterId)||events.some(e=>e.uiChapterId)){
  const {storyChapterTitleIn}=await jiti.import(join(root,'src/modules/scenarioMods/eventNarrativeView.ts'));const packs={...catalog,stageMeta:[]},probe='\u0000stageMeta-probe';const packStages=new Set(catalog.stages.map(s=>s.manifest.id));
  for(const e of events)if(e.uiChapterId&&storyChapterTitleIn(packs,e.stageId,e.id,probe)!==probe)fail(`stageMeta ${e.stageId}: chapter title for ${e.id} is already decided in eventNarrativeView.ts`);
  for(const m of meta){if(!m.presentation?.defaultUiChapterId)continue;const own=m.presentation.events||{};const ids=[`${m.stageId}\u0000probe`,...(packStages.has(m.stageId)?[]:(stages.get(m.stageId)?.scenario?.events||[]).map(e=>e.id).filter(id=>!own[id]?.uiChapterId))];
   for(const id of ids)if(storyChapterTitleIn(packs,m.stageId,id,probe)!==probe)fail(`stageMeta ${m.stageId}: defaultUiChapterId is shadowed by eventNarrativeView.ts${id.includes('\u0000')?'':` (event ${id})`}`);}
 }
 // 配乐：musicLibrary.ts 直接 import mp3，node 下加载不了，按源码读两张表的键（同编译期读 MusicMood 的做法）
 if(meta.some(m=>Object.keys(m.presentation?.chapters||{}).length)||events.some(e=>e.mood)){
  const music=await readFile(join(sourceRoot,'src/utils/musicLibrary.ts'),'utf8');
  const keys=name=>{const body=music.match(new RegExp(`const ${name}: Record<string, MusicMood> = \\{([\\s\\S]*?)\\n\\};`))?.[1];if(body===undefined)fail(`${name} not found in musicLibrary.ts`);return new Set([...body.matchAll(/^\s*'([^']+)':/gm)].map(x=>x[1]));};
  const chapterMoods=keys('CHAPTER_MOOD_MAP'),eventMoods=keys('EVENT_MOOD_MAP');
  for(const m of meta)for(const id of Object.keys(m.presentation?.chapters||{}))if(chapterMoods.has(id))fail(`stageMeta ${m.stageId}: chapter mood for ${id} also set in musicLibrary.ts CHAPTER_MOOD_MAP`);
  for(const e of events)if(e.mood&&eventMoods.has(e.id))fail(`stageMeta ${e.stageId}: event mood for ${e.id} also set in musicLibrary.ts EVENT_MOOD_MAP`);
 }
 if(lines.length){const {TS_SECONDARY_LINES,mergeSecondaryLines}=await jiti.import(join(root,'src/modules/scenarioMods/secondaryLines.ts'));try{mergeSecondaryLines(TS_SECONDARY_LINES,lines);}catch(e){fail(e.message);}}
}
/** 编译 + TS 校验，不写文件。注意：TS 校验看到的是磁盘上的 catalog（见 validateWithTs）；要校验刚编出的新 catalog 用 writeContentPacks。 */
export async function compileContentPacks(options={}){const {catalog,ctx}=await buildCatalog(options);await validateWithTs(catalog,ctx,options);return catalog;}
/** 重建 catalog：先写（临时文件 rename 到位，旧文件先备份），再起子进程做 TS 校验；校验失败恢复旧文件（原来没有就删掉新文件）后报错。删掉 catalog.json 后单次重建可用（M2）。 */
export async function writeContentPacks(options={}){
 const {catalog}=await buildCatalog(options);await mkdir(generatedDir,{recursive:true});
 const temp=join(generatedDir,`.catalog.${process.pid}.tmp`),backup=join(generatedDir,`.catalog.${process.pid}.bak`);
 await writeFile(temp,serialize(catalog));
 const hadOld=await copyFile(catalogPath,backup).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
 await rename(temp,catalogPath);
 try{await promisify(execFile)(process.execPath,[import.meta.filename,'--validate-only',JSON.stringify(options)],{cwd:root,maxBuffer:64<<20});}
 catch(e){if(hadOld)await rename(backup,catalogPath);else await rm(catalogPath,{force:true});fail(`validation failed, ${hadOld?'restored previous catalog':'removed new catalog'}: ${String(e.stderr||e.message).trim()}`);}
 if(hadOld)await rm(backup,{force:true});
 return catalog;
}
/** 子进程入口：重新编译，确认与磁盘逐字节相同，再做 TS 校验（此时磁盘上就是新 catalog）。 */
async function validateOnDisk(options){const {catalog,ctx}=await buildCatalog(options);if(await readFile(catalogPath,'utf8')!==serialize(catalog))fail('catalog on disk differs from this build');await validateWithTs(catalog,ctx,options);}
export async function checkContentPacks(){const {catalog,ctx}=await buildCatalog();const generated=JSON.parse(await readFile(catalogPath,'utf8'));if(JSON.stringify(catalog)!==JSON.stringify(generated))fail('generated catalog is stale; run node scripts/content-packs.mjs');await validateWithTs(catalog,ctx);return catalog;}
if(process.argv[1]===import.meta.filename){
 const i=process.argv.indexOf('--validate-only');
 if(i>=0){try{await validateOnDisk(JSON.parse(process.argv[i+1]||'{}'));}catch(e){console.error(e.message);process.exitCode=1;}}
 else{const c=process.argv.includes('--check')?await checkContentPacks():await writeContentPacks();console.log(`Content Pack ${c.version}: ${c.contracts.length} contracts, ${c.playtests.length} playtests, ${c.entries.length} entries`);}
}
