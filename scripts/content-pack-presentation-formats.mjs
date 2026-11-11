// 展示类数据的新包格式（F0b，2026-11-11）：stageMeta 事件新字段、stageMeta 关级 uiChapterByRouteLocation、texts 通配键，
// 以及三个 manifest 新段 endings／openWorldSlices／persistentEntries。只建机制，不搬数据。
// 编译期（纯数据 + 只读实体总表）与 TS 表交叉校验（validatePresentationFormatsWithTs，同宋 S2 的 validateWithTs 做法）分开。
// 三个新段都是 manifest 的文件列表，每个文件是数组；条目里的 note 只给作者看，编译时剥掉（compatNarrativeVariants 的 note 必填）。
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createJiti} from 'jiti';
const root=join(import.meta.dirname,'..');
const tsLoader=()=>createJiti(import.meta.url,{interopDefault:true,alias:{'@':join(root,'src')}});
const fail=s=>{throw new Error(`Content Pack: ${s}`);};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=v=>typeof v==='string'&&v.trim().length>0;
const texts=v=>Array.isArray(v)&&v.every(text);
const onlyKeys=(x,keys)=>object(x)&&Object.keys(x).every(k=>keys.includes(k));
const noteOk=x=>x.note===undefined||typeof x.note==='string';
const strip=({note,...rest})=>rest;
const distinct=a=>new Set(a).size===a.length;

export const presentationFormatKinds=['endings','openWorldSlices','persistentEntries'];
/** catalog 里的空段（没有包声明时）。 */
export const emptyPresentationFormats=()=>({endings:[],openWorldSlices:[],persistentEntries:[]});
/**
 * 归属：只有行旅切片的 key（种类 openWorldSlice）登记为包定义；结局、常驻入口只引用别处的 id。
 * definition.id 不登记：核心包 timeline.json 的 sliceEntered 已引用五原切片 id，登记了就要核心包 dependsOn 塞外包（塞外包本就依赖核心包，成环）。
 * definition.id 的全局唯一在 compilePresentationFormats 里查。
 */
export function presentationDefinedIds(kind,x){
 if(kind==='openWorldSlices'&&object(x))return [['openWorldSlice',x.key]];
 return [];
}

/** 事件能选的动作：完成合同动作 ∪ 致命选项（fatalOutcomes.choices，分支锁与玩家句都会用到不在合同里的致命选项）。 */
export const eventActionIds=e=>new Set([...(e?.playerCompletionContract?.actions||[]).map(a=>a?.id),...(e?.fatalOutcomes?.choices||[]).map(c=>c?.id)].filter(text));
const contractActionIds=e=>new Set((e?.playerCompletionContract?.actions||[]).map(a=>a?.id).filter(text));

// ── stageMeta 事件新字段与关级字段 ─────────────────────────────────────────────
export const stageMetaEventExtraKeys=['uiChapterTitle','routeLocation','compassObjectiveOnly','lockedDecision','actionPresentation','compatNarrativeVariants'];
export const stageMetaPresentationExtraKeys=['uiChapterByRouteLocation'];
const VARIANT_FIELDS=['name','description','axisBeat','objective','relatedFactionIds'];
const conditionOk=c=>onlyKeys(c,['path','operator','value'])&&text(c.path)&&['eq','neq'].includes(c.operator)&&['string','number','boolean'].includes(typeof c.value);

/**
 * stageMeta 一关的新字段校验（scripts/content-packs.mjs 的 stageMeta 编译里调用，$text 已解析）：
 * 返回该关 objective 里带 {{…}} 模板的文案（由调用方统一做实体模板校验）。会就地剥掉 compatNarrativeVariants 条目的 note。
 */
export function checkStageMetaPresentationExtras({at,stageId,presentation:p,stageEvents,locationIds}){
 const templated=[];
 const r=p.uiChapterByRouteLocation;
 if(r!==undefined){
  if(!onlyKeys(r,['keepFallbackEventIds','rules','defaultTitle'])||!Array.isArray(r.rules)||(r.defaultTitle!==undefined&&!text(r.defaultTitle))||(r.keepFallbackEventIds!==undefined&&(!texts(r.keepFallbackEventIds)||!distinct(r.keepFallbackEventIds)))||r.rules.some(x=>!onlyKeys(x,['routeLocationIncludes','title'])||!text(x.routeLocationIncludes)||!text(x.title))||(!r.rules.length&&r.defaultTitle===undefined))fail(`${at}: invalid uiChapterByRouteLocation`);
  for(const id of r.keepFallbackEventIds||[])if(!stageEvents.has(id))fail(`${at}: uiChapterByRouteLocation: ${id} is not an event of ${stageId}`);
  if(p.defaultUiChapterId!==undefined)fail(`${at}: uiChapterByRouteLocation never applies when defaultUiChapterId is set`);
 }
 for(const [id,e] of Object.entries(p.events||{})){
  const where=`${at}: event ${id}`,ev=stageEvents.get(id);
  if(e.uiChapterTitle!==undefined){if(!text(e.uiChapterTitle))fail(`${where}: empty uiChapterTitle`);if(e.uiChapterId!==undefined)fail(`${where}: uiChapterTitle and uiChapterId are exclusive`);if(ev?.presentation?.uiChapterId!==undefined)fail(`${where}: event already has presentation.uiChapterId`);}
  if(e.routeLocation!==undefined){if(!text(e.routeLocation))fail(`${where}: empty routeLocation`);if(id.includes('_ins_'))fail(`${where}: routeLocation on an _ins_ event is never read (storyRouteLocation strips _ins_)`);}
  if(e.compassObjectiveOnly!==undefined&&e.compassObjectiveOnly!==true)fail(`${where}: compassObjectiveOnly only accepts true`);
  if(e.lockedDecision!==undefined){
   const d=e.lockedDecision,actions=eventActionIds(ev);
   if(!Array.isArray(d)||!d.length||d.some(o=>!Array.isArray(o)||o.length!==2||!o.every(text))||!distinct(d.map(o=>o[0])))fail(`${where}: lockedDecision must be [[actionId, label], …] with distinct actions`);
   for(const [a] of d)if(!actions.has(a))fail(`${where}: lockedDecision action ${a} is not an action or fatal choice of the event`);
   if(!contractActionIds(ev).has(d[0][0]))fail(`${where}: lockedDecision's first (deciding) action ${d[0][0]} must be a contract action`);
  }
  if(e.actionPresentation!==undefined){
   const a=e.actionPresentation,actions=contractActionIds(ev);
   if(!Array.isArray(a)||!a.length||a.some(x=>!onlyKeys(x,['actionId','whenLocationId','label','playerLine'])||!text(x.actionId)||!text(x.whenLocationId)||!text(x.label)||!text(x.playerLine))||!distinct(a.map(x=>`${x.actionId}\u0000${x.whenLocationId}`)))fail(`${where}: invalid actionPresentation`);
   for(const x of a){if(!actions.has(x.actionId))fail(`${where}: actionPresentation action ${x.actionId} is not a contract action`);if(!locationIds.has(x.whenLocationId))fail(`${where}: actionPresentation location ${x.whenLocationId} not in locations.json`);}
  }
  if(e.compatNarrativeVariants!==undefined){
   const v=e.compatNarrativeVariants;
   if(!Array.isArray(v)||!v.length)fail(`${where}: compatNarrativeVariants must be a non-empty array`);
   e.compatNarrativeVariants=v.map((x,i)=>{const w=`${where}: compatNarrativeVariants.${i}`;
    if(!onlyKeys(x,['when','priority','replacesCanonRail',...VARIANT_FIELDS,'note'])||!Array.isArray(x.when)||!x.when.length||!x.when.every(conditionOk))fail(`${w}: invalid fields`);
    if(!text(x.note))fail(`${w}: note is required (where this legacy-save patch comes from)`);
    if(x.priority!==undefined&&x.priority!=='before-event-variants')fail(`${w}: priority only accepts "before-event-variants"`);
    if(x.replacesCanonRail!==undefined&&x.replacesCanonRail!==true)fail(`${w}: replacesCanonRail only accepts true`);
    if(x.priority&&x.replacesCanonRail)fail(`${w}: before-event-variants entries never replace the canon rail (narrativeVariantReplacesCanonRail does not read them)`);
    if(!VARIANT_FIELDS.some(k=>x[k]!==undefined))fail(`${w}: rewrites nothing`);
    for(const k of ['name','description','axisBeat','objective'])if(x[k]!==undefined&&!text(x[k]))fail(`${w}: empty ${k}`);
    if(x.relatedFactionIds!==undefined&&!texts(x.relatedFactionIds))fail(`${w}: relatedFactionIds must be a string array`);
    return strip(x);});
  }
  if(typeof e.objective==='string'&&e.objective.includes('{{'))templated.push(e.objective);
 }
 return templated;
}

// ── texts 键名约定 ─────────────────────────────────────────────────────────────
// actionDisplay.<eventId>.<actionId|*>.line/label（* = 事件级通配，任何动作都返回）；scopedPlayerLine.<eventId>::<actionId>
const parseActionDisplay=id=>{const m=id.match(/^actionDisplay\.(.+)\.([^.]+)\.(line|label)$/);return m?{eventId:m[1],actionId:m[2],part:m[3]}:undefined;};
const parseScopedLine=id=>{const m=id.match(/^scopedPlayerLine\.(.+)::([^:]+)$/);return m?{eventId:m[1],actionId:m[2]}:undefined;};
/** 归属扫描：这两种键里的事件 id 算对该事件的引用（scripts/content-packs.mjs 把它们并进包的原始资产一起扫）。 */
export function presentationTextKeyReferences(id){const x=parseActionDisplay(id)||parseScopedLine(id);return x?[x.eventId]:[];}
/** 两种键：事件存在；非通配的动作是该事件的动作或致命选项；actionDisplay 的 line 与 label 必须成对（读取方两者都有才生效）。 */
export function checkPresentationTextKeys(allTexts,events){
 for(const id of Object.keys(allTexts)){
  if(id.startsWith('actionDisplay.')){const x=parseActionDisplay(id);if(!x)fail(`text ${id}: expected actionDisplay.<eventId>.<actionId|*>.line/label`);
   if(!events.has(x.eventId))fail(`text ${id}: unknown event ${x.eventId}`);if(x.actionId!=='*'&&!eventActionIds(events.get(x.eventId)).has(x.actionId))fail(`text ${id}: ${x.actionId} is not an action of ${x.eventId}`);
   const pair=id.replace(/\.(line|label)$/,x.part==='line'?'.label':'.line');if(!(pair in allTexts))fail(`text ${id}: missing its pair ${pair}`);}
  else if(id.startsWith('scopedPlayerLine.')){const x=parseScopedLine(id);if(!x)fail(`text ${id}: expected scopedPlayerLine.<eventId>::<actionId>`);
   if(!events.has(x.eventId))fail(`text ${id}: unknown event ${x.eventId}`);if(!eventActionIds(events.get(x.eventId)).has(x.actionId))fail(`text ${id}: ${x.actionId} is not an action of ${x.eventId}`);}
 }
}

// ── 三个新段 ───────────────────────────────────────────────────────────────────
const ZONE_KINDS=['settlement','street','interior','compound'],RELIABILITY=['confirmed','credible','rumor'],OUTCOMES=['success','partial','failure-forward'];
const SLICE_KEYS=['key','definition','stageIds','stepSceneStagePrefixes','positionNodes','constants','zoneRanks','actionJudgement','actionDescribe','note'];
const DEF_KEYS=['id','initialZoneId','zones','routes','notices','actors','problems','actions','areas'];

/**
 * raw：{种类: [{packId, value}]}（按包顺序、文件顺序，value 是文件内容）。ctx：stages／events／baseEvents（内置关原始事件）／
 * locationIds／itemIds／beatIds／texts（catalog.texts）／packContracts（catalog.contracts＋drafts）／sourceRoot。
 */
export async function compilePresentationFormats(raw,ctx){
 const out=emptyPresentationFormats();
 let entities;const entity=async()=>entities||=await tsLoader().import(join(root,'src/modules/scenarioMods/namedEntities.ts'));
 const files=k=>raw[k].flatMap(({packId,value})=>{if(!Array.isArray(value))fail(`${packId}.${k}: expected array`);return value;});
 const eventRef=(at,ref)=>{const [eventId,actionId,...rest]=String(ref).split('::');if(!ctx.events.has(eventId)||rest.length||(actionId!==undefined&&!eventActionIds(ctx.events.get(eventId)).has(actionId)))fail(`${at}: unknown event${actionId!==undefined?' action':''} ${ref}`);};

 // 结局：结局实体存在；key（结局编号）全部包里唯一；battleLoss 同 BATTLE_LOSS_ENDINGS 条目（endingId 取外层），来源事件存在、有挂在它上面的场面合同；pathText 的来源事件存在、textKey 是已有正文键
 {const ids=new Set(),keys=new Set();
  const sceneHooks=new Set(ctx.packContracts.map(c=>c?.meta?.hook?.eventId));
  const dir=join(ctx.sourceRoot,'src/modules/sceneModule/contracts');for(const f of (await readdir(dir)).filter(f=>f.endsWith('.json')&&!f.startsWith('statuses')))sceneHooks.add(JSON.parse(await readFile(join(dir,f),'utf8'))?.meta?.hook?.eventId);
  for(const x of files('endings')){const at=`endings ${x?.endingId}`;
   if(!onlyKeys(x,['endingId','key','battleLoss','pathText','note'])||!noteOk(x)||!text(x.endingId)||(x.key!==undefined&&!text(x.key)))fail(`${at}: invalid fields`);
   if(x.key===undefined&&x.battleLoss===undefined&&x.pathText===undefined)fail(`${at}: declares nothing`);
   if(!(await entity()).namedEntity('ending',x.endingId))fail(`${at}: unknown ending entity`);
   if(ids.has(x.endingId))fail(`${at}: appears twice`);ids.add(x.endingId);
   if(x.key!==undefined){if(keys.has(x.key))fail(`${at}: key ${x.key} already used`);keys.add(x.key);}
   const b=x.battleLoss;if(b!==undefined){
    if(!onlyKeys(b,['title','kind','sourceEventId','tierFlag','tier','facts'])||!text(b.title)||!['death','failure'].includes(b.kind)||!text(b.sourceEventId)||!text(b.tierFlag)||!b.tierFlag.endsWith('.tier')||!text(b.tier)||!texts(b.facts)||!b.facts.length)fail(`${at}: invalid battleLoss`);
    if(!ctx.events.has(b.sourceEventId))fail(`${at}: battleLoss source event ${b.sourceEventId} unknown`);
    if(!sceneHooks.has(b.sourceEventId))fail(`${at}: no scene contract hooks ${b.sourceEventId} (tierFlag ${b.tierFlag} would never be written)`);}
   const t=x.pathText;if(t!==undefined){
    if(!onlyKeys(t,['sourceEventId','textKey'])||!text(t.sourceEventId)||!text(t.textKey))fail(`${at}: invalid pathText`);
    if(!ctx.events.has(t.sourceEventId))fail(`${at}: pathText source event ${t.sourceEventId} unknown`);if(!(t.textKey in ctx.texts))fail(`${at}: pathText text ${t.textKey} unknown`);}
   out.endings.push(strip(x));}}

 // 行旅切片：形状同 OpenWorldSliceDefinition（原样转 JSON），外加 key（TS 导出按它取）、stageIds、stepSceneStagePrefixes、positionNodes、constants、zoneRanks、actionJudgement、actionDescribe
 {const keys=new Set(),defIds=new Set(),prefixes=new Set();
  const {JUDGEMENT_KINDS}=raw.openWorldSlices.length?await tsLoader().import(join(root,'src/utils/judgementEngine.ts')):{};
  for(const s of files('openWorldSlices')){const at=`openWorldSlices ${s?.key}`;
   if(!onlyKeys(s,SLICE_KEYS)||!noteOk(s)||!text(s.key)||!object(s.definition))fail(`${at}: invalid fields`);
   if(keys.has(s.key))fail(`${at}: key appears twice`);keys.add(s.key);
   const d=s.definition;if(!onlyKeys(d,DEF_KEYS)||!text(d.id)||!text(d.initialZoneId)||['zones','routes','notices','actors','problems','actions'].some(k=>!Array.isArray(d[k]))||(d.areas!==undefined&&!Array.isArray(d.areas)))fail(`${at}: definition must have id/initialZoneId/zones/routes/notices/actors/problems/actions (areas optional)`);
   if(defIds.has(d.id))fail(`${at}: definition id ${d.id} appears twice`);defIds.add(d.id);
   const idsOf=(k,label)=>{const ids=(d[k]||[]).map(x=>x?.id);if(!texts(ids)||!distinct(ids))fail(`${at}: ${label} ids missing or duplicate`);return new Set(ids);};
   const zones=idsOf('zones','zone'),routes=idsOf('routes','route'),areas=idsOf('areas','area'),notices=idsOf('notices','notice'),actors=idsOf('actors','actor'),problems=idsOf('problems','problem'),actions=idsOf('actions','action');
   const zone=(w,id)=>{if(!zones.has(id))fail(`${at}: ${w}: unknown zone ${id}`);};const evs=(w,v)=>{if(v===undefined)return;if(!texts(v))fail(`${at}: ${w}: expected event id array`);for(const id of v)eventRef(`${at}: ${w}`,id);};
   zone('initialZoneId',d.initialZoneId);
   for(const a of d.areas||[]){const w=`area ${a.id}`;if(!onlyKeys(a,['id','name','continent','freeRoamWhen','background'])||!text(a.name)||(a.continent!==undefined&&!text(a.continent)))fail(`${at}: ${w}: invalid fields`);
    if(a.freeRoamWhen!==undefined){if(!onlyKeys(a.freeRoamWhen,['after','until']))fail(`${at}: ${w}: invalid freeRoamWhen`);evs(`${w}.freeRoamWhen.after`,a.freeRoamWhen.after);evs(`${w}.freeRoamWhen.until`,a.freeRoamWhen.until);}
    if(a.background!==undefined){if(!Array.isArray(a.background)||a.background.some(b=>!onlyKeys(b,['when','text'])||!text(b.text)))fail(`${at}: ${w}: invalid background`);for(const b of a.background)evs(`${w}.background`,b.when);}}
   for(const z of d.zones){const w=`zone ${z.id}`;if(!onlyKeys(z,['id','name','country','aliases','kind','parentZoneId','worldLocationId','standable','areaId','heardWhen'])||!text(z.name)||(z.country!==undefined&&!text(z.country))||(z.aliases!==undefined&&!texts(z.aliases))||(z.kind!==undefined&&!ZONE_KINDS.includes(z.kind))||(z.standable!==undefined&&typeof z.standable!=='boolean'))fail(`${at}: ${w}: invalid fields`);
    if(z.parentZoneId!==undefined){zone(`${w}.parentZoneId`,z.parentZoneId);if(z.parentZoneId===z.id)fail(`${at}: ${w}: parent is itself`);}
    if(z.areaId!==undefined&&!areas.has(z.areaId))fail(`${at}: ${w}: unknown area ${z.areaId}`);
    if(z.worldLocationId!==undefined&&!ctx.locationIds.has(z.worldLocationId))fail(`${at}: ${w}: worldLocationId ${z.worldLocationId} not in locations.json`);evs(`${w}.heardWhen`,z.heardWhen);}
   for(const z of d.zones){const seen=[z.id];for(let p=z.parentZoneId;p!==undefined;p=d.zones.find(x=>x.id===p)?.parentZoneId){if(seen.includes(p))fail(`${at}: zone parent cycle ${[...seen,p].join(' → ')}`);seen.push(p);}}
   const unlockedKeys=new Set([...d.notices.flatMap(n=>n?.unlockRequirementKeys||[]),...d.actions.flatMap(a=>(a?.consequences||[]).flatMap(c=>c?.apply?.unlockRequirementKeys||[]))]);
   for(const r of d.routes){const w=`route ${r.id}`;if(!onlyKeys(r,['id','fromZoneId','toZoneId','label','aliases','turnCost','requirementKey','kind','dayCost','durationLabel','forcedBy','unlockWhen','companions','summary'])||!text(r.label)||(r.aliases!==undefined&&!texts(r.aliases))||!Number.isInteger(r.turnCost)||r.turnCost<0||(r.kind!==undefined&&!['local','journey'].includes(r.kind))||(r.dayCost!==undefined&&!(r.dayCost==='several'||typeof r.dayCost==='number'&&Number.isFinite(r.dayCost)&&r.dayCost>=0))||(r.durationLabel!==undefined&&!text(r.durationLabel))||(r.summary!==undefined&&!text(r.summary))||(r.companions!==undefined&&!texts(r.companions)))fail(`${at}: ${w}: invalid fields`);
    zone(`${w}.fromZoneId`,r.fromZoneId);zone(`${w}.toZoneId`,r.toZoneId);evs(`${w}.unlockWhen`,r.unlockWhen);
    if(r.requirementKey!==undefined&&(!text(r.requirementKey)||!unlockedKeys.has(r.requirementKey)))fail(`${at}: ${w}: requirementKey ${r.requirementKey} is never unlocked by a notice or consequence`);
    const f=r.forcedBy;if(f!==undefined){if(onlyKeys(f,['afterEventDone'])&&text(f.afterEventDone))eventRef(`${at}: ${w}.forcedBy`,f.afterEventDone);
     else if(onlyKeys(f,['stageTransition'])&&text(f.stageTransition)){const parts=f.stageTransition.split('→');if(parts.length!==2||parts.some(id=>!ctx.stages.has(id)))fail(`${at}: ${w}: stageTransition must be <stage>→<stage> of known stages`);}
     else fail(`${at}: ${w}: forcedBy must be {afterEventDone} or {stageTransition}`);}}
   const unlocks=(w,x)=>{for(const id of x.unlockZoneIds||[])zone(`${w}.unlockZoneIds`,id);for(const id of x.unlockRouteIds||[])if(!routes.has(id))fail(`${at}: ${w}: unknown route ${id}`);for(const k of ['unlockZoneIds','unlockRouteIds','unlockRequirementKeys'])if(x[k]!==undefined&&!texts(x[k]))fail(`${at}: ${w}: invalid ${k}`);};
   for(const n of d.notices){const w=`notice ${n.id}`;if(!onlyKeys(n,['id','source','reliability','text','atZoneId','unlockZoneIds','unlockRouteIds','unlockRequirementKeys'])||!text(n.source)||!RELIABILITY.includes(n.reliability)||!text(n.text))fail(`${at}: ${w}: invalid fields`);zone(`${w}.atZoneId`,n.atZoneId);unlocks(w,n);}
   for(const a of d.actors){const w=`actor ${a.id}`;if(!onlyKeys(a,['id','name','initialZoneId','desire','initialStatus'])||!text(a.name)||!text(a.desire)||!text(a.initialStatus))fail(`${at}: ${w}: invalid fields`);zone(`${w}.initialZoneId`,a.initialZoneId);}
   for(const p of d.problems){const w=`problem ${p.id}`;if(!onlyKeys(p,['id','atZoneId','title','objective','initialState','terminalStates','actionIds'])||!text(p.title)||!text(p.objective)||!text(p.initialState)||(p.terminalStates!==undefined&&!texts(p.terminalStates))||!texts(p.actionIds))fail(`${at}: ${w}: invalid fields`);zone(`${w}.atZoneId`,p.atZoneId);for(const id of p.actionIds)if(!actions.has(id))fail(`${at}: ${w}: unknown action ${id}`);}
   for(const a of d.actions){const w=`action ${a.id}`;if(!onlyKeys(a,['id','problemId','label','actionText','aliases','rejectIf','availableInStates','outcome','nextProblemState','settledFacts','costs','consequences'])||!text(a.label)||!text(a.actionText)||!texts(a.aliases)||(a.rejectIf!==undefined&&!texts(a.rejectIf))||!texts(a.availableInStates)||!OUTCOMES.includes(a.outcome)||!text(a.nextProblemState)||!texts(a.settledFacts)||(a.costs!==undefined&&!texts(a.costs))||(a.consequences!==undefined&&!Array.isArray(a.consequences)))fail(`${at}: ${w}: invalid fields`);
    if(!problems.has(a.problemId))fail(`${at}: ${w}: unknown problem ${a.problemId}`);
    for(const c of a.consequences||[]){const cw=`${w} consequence ${c?.id}`;if(!onlyKeys(c,['id','delayTurns','cause','effect','actorId','apply'])||!text(c.id)||!Number.isInteger(c.delayTurns)||c.delayTurns<0||!text(c.cause)||!text(c.effect)||(c.apply!==undefined&&!onlyKeys(c.apply,['actorStatus','actorZoneId','problemId','problemState','unlockZoneIds','unlockRouteIds','unlockRequirementKeys'])))fail(`${at}: ${cw}: invalid fields`);
     if(c.actorId!==undefined&&!actors.has(c.actorId))fail(`${at}: ${cw}: unknown actor ${c.actorId}`);const ap=c.apply||{};if(ap.actorZoneId!==undefined)zone(`${cw}.actorZoneId`,ap.actorZoneId);if(ap.problemId!==undefined&&!problems.has(ap.problemId))fail(`${at}: ${cw}: unknown problem ${ap.problemId}`);unlocks(cw,ap);}}
   if(s.stageIds!==undefined){if(!texts(s.stageIds)||!distinct(s.stageIds))fail(`${at}: invalid stageIds`);for(const id of s.stageIds)if(!ctx.stages.has(id))fail(`${at}: unknown stage ${id}`);}
   if(s.stepSceneStagePrefixes!==undefined){if(!texts(s.stepSceneStagePrefixes)||!distinct(s.stepSceneStagePrefixes))fail(`${at}: invalid stepSceneStagePrefixes`);
    for(const x of s.stepSceneStagePrefixes){if(![...ctx.stages.keys()].some(id=>id.startsWith(x)))fail(`${at}: stepSceneStagePrefixes ${x} matches no stage`);if(prefixes.has(x))fail(`${at}: stepSceneStagePrefixes ${x} declared twice`);prefixes.add(x);}}
   const pn=s.positionNodes;if(pn!==undefined){if(!onlyKeys(pn,['segment','placeLocationId','nodes'])||!text(pn.segment)||!text(pn.placeLocationId)||(pn.nodes!==undefined&&(!Array.isArray(pn.nodes)||pn.nodes.some(n=>!onlyKeys(n,['zoneId','names'])||!texts(n.names)||!n.names.length))))fail(`${at}: invalid positionNodes`);
    if(!ctx.locationIds.has(pn.placeLocationId))fail(`${at}: positionNodes.placeLocationId ${pn.placeLocationId} not in locations.json`);for(const n of pn.nodes||[])zone('positionNodes',n.zoneId);}
   if(s.constants!==undefined&&(!object(s.constants)||Object.entries(s.constants).some(([k,v])=>!/^[A-Z][A-Z0-9_]*$/.test(k)||!text(v))))fail(`${at}: constants must map UPPER_CASE names to non-empty strings`);
   if(s.zoneRanks!==undefined){if(!object(s.zoneRanks)||Object.values(s.zoneRanks).some(v=>!Number.isInteger(v)))fail(`${at}: zoneRanks must map zone ids to integers`);for(const id of Object.keys(s.zoneRanks))zone('zoneRanks',id);}
   if(s.actionJudgement!==undefined){if(!object(s.actionJudgement)||Object.values(s.actionJudgement).some(v=>!onlyKeys(v,['kind'])||!JUDGEMENT_KINDS.includes(v.kind)))fail(`${at}: actionJudgement must map action ids to {kind: JudgementKind}`);for(const id of Object.keys(s.actionJudgement))if(!actions.has(id))fail(`${at}: actionJudgement: unknown action ${id}`);}
   if(s.actionDescribe!==undefined){if(!object(s.actionDescribe)||!Object.values(s.actionDescribe).every(text))fail(`${at}: actionDescribe must map action ids to text`);for(const id of Object.keys(s.actionDescribe))if(!actions.has(id))fail(`${at}: actionDescribe: unknown action ${id}`);}
   out.openWorldSlices.push(strip(s));}}

 // 常驻入口：kind 只能是 algae（跨关取物）或 rejoin（旧档会合补拍），每种全局至多一条；引用都存在。algae 的模板事件由编译器从它的关（内置关取原始事件，同 TS 的静态 import）抄进 catalog 的 templateEvent
 {const {namedEntity}=raw.persistentEntries.length?await entity():{};
  // 拍子可以是包线的，也可以是 mod-kit 基础线的（藻丝入口那拍就在基础线里）
  const beats=raw.persistentEntries.length?new Set([...ctx.beatIds,...(JSON.parse(await readFile(join(ctx.sourceRoot,'mod-kit/quest-lines/lines.json'),'utf8')).lines||[]).flatMap(l=>(l.beats||[]).map(b=>b.id))]):ctx.beatIds;
  // 每种至多一条：先于逐条引用检查（报错指向重复本身）
  {const seen=new Set();for(const x of files('persistentEntries'))if(['algae','rejoin'].includes(x?.kind)){if(seen.has(x.kind))fail(`persistentEntries ${x.kind}: declared twice`);seen.add(x.kind);}}
  for(const x of files('persistentEntries')){const at=`persistentEntries ${x?.kind}`;
   if(x?.kind==='algae'){if(!onlyKeys(x,['kind','beatId','eventId','stageId','locationId','characterId','itemId','receiptId','notBeforeStageIds','note'])||!noteOk(x)||['beatId','eventId','stageId','locationId','characterId','itemId','receiptId'].some(k=>!text(x[k]))||!texts(x.notBeforeStageIds)||!distinct(x.notBeforeStageIds))fail(`${at}: invalid fields`);}
   else if(x?.kind==='rejoin'){if(!onlyKeys(x,['kind','beatId','eventId','stageId','note'])||!noteOk(x)||['beatId','eventId','stageId'].some(k=>!text(x[k])))fail(`${at}: invalid fields`);}
   else fail(`persistentEntries: kind must be algae or rejoin (got ${x?.kind})`);
   const stage=ctx.stages.get(x.stageId);if(!stage)fail(`${at}: unknown stage ${x.stageId}`);
   if(!(stage.scenario?.events||[]).some(e=>e.id===x.eventId))fail(`${at}: ${x.eventId} is not an event of ${x.stageId}`);
   if(!beats.has(x.beatId))fail(`${at}: unknown quest-line beat ${x.beatId}`);
   const entry=strip(x);
   if(x.kind==='algae'){
    if(!ctx.locationIds.has(x.locationId))fail(`${at}: location ${x.locationId} not in locations.json`);
    if(!namedEntity('character',x.characterId))fail(`${at}: unknown character ${x.characterId}`);
    if(!ctx.itemIds.has(x.itemId))fail(`${at}: unknown item ${x.itemId}`);
    for(const id of x.notBeforeStageIds)if(!ctx.stages.has(id))fail(`${at}: unknown stage ${id}`);
    entry.templateEvent=structuredClone(ctx.baseEvents.get(x.eventId)??stage.scenario.events.find(e=>e.id===x.eventId));}
   out.persistentEntries.push(entry);}}
 return out;
}

/** 逐拍演出关前缀的原始声明（questLines 投影在三个新段编译之前就要用：guardCovers）。 */
export const rawStepScenePrefixes=raw=>raw.openWorldSlices.flatMap(({value})=>Array.isArray(value)?value:[]).flatMap(s=>Array.isArray(s?.stepSceneStagePrefixes)?s.stepSceneStagePrefixes.filter(x=>typeof x==='string'):[]);

const metaEvents=meta=>meta.flatMap(m=>Object.entries(m.presentation?.events||{}).map(([id,e])=>({stageId:m.stageId,id,...e})));
const isEmpty=(c,ev)=>!c.endings?.length&&!c.openWorldSlices?.length&&!c.persistentEntries?.length&&!ev.some(e=>stageMetaEventExtraKeys.some(k=>e[k]!==undefined))&&!(c.stageMeta||[]).some(m=>m.presentation?.uiChapterByRouteLocation)&&!Object.keys(c.texts||{}).some(k=>k.startsWith('actionDisplay.')||k.startsWith('scopedPlayerLine.'));

/**
 * 与 TS 表交叉校验（新段、新字段、两种键都为空时不加载任何模块）：同一条目在 TS 表和包里都有即报错。
 * 只读 TS_ 表与纯函数；章名用新 catalog（去掉 stageMeta）跑 storyChapterTitleIn 探针，同宋 S2 的章名检查。
 */
export async function validatePresentationFormatsWithTs(catalog,stages){
 const ev=metaEvents(catalog.stageMeta||[]);if(isEmpty(catalog,ev))return;
 const jiti=tsLoader(),mod=p=>jiti.import(join(root,'src/modules/scenarioMods',p));
 const has=k=>ev.filter(e=>e[k]!==undefined);
 if(has('lockedDecision').length){const {TS_LOCKED_DECISIONS}=await mod('branchDecision.ts');for(const e of has('lockedDecision'))if(e.id in TS_LOCKED_DECISIONS)fail(`stageMeta ${e.stageId}: lockedDecision for ${e.id} also in branchDecision.ts TS_LOCKED_DECISIONS`);}
 const nv=['routeLocation','compassObjectiveOnly','actionPresentation','compatNarrativeVariants','uiChapterTitle'].some(k=>has(k).length)||(catalog.stageMeta||[]).some(m=>m.presentation?.uiChapterByRouteLocation);
 if(nv){const V=await mod('eventNarrativeView.ts');
  for(const e of has('routeLocation'))if(Object.prototype.hasOwnProperty.call(V.TS_STORY_ROUTE_LOCATIONS,e.id))fail(`stageMeta ${e.stageId}: routeLocation for ${e.id} also in eventNarrativeView.ts TS_STORY_ROUTE_LOCATIONS`);
  for(const e of has('compassObjectiveOnly'))if(V.TS_COMPASS_OBJECTIVE_ONLY_EVENT_IDS.has(e.id))fail(`stageMeta ${e.stageId}: compassObjectiveOnly for ${e.id} also in eventNarrativeView.ts TS_COMPASS_OBJECTIVE_ONLY_EVENT_IDS`);
  for(const e of has('actionPresentation'))if(V.TS_STORY_ACTION_PRESENTATIONS.some(t=>t.eventId===e.id))fail(`stageMeta ${e.stageId}: actionPresentation for ${e.id} also in eventNarrativeView.ts TS_STORY_ACTION_PRESENTATIONS`);
  for(const e of has('compatNarrativeVariants'))if(Object.prototype.hasOwnProperty.call(V.TS_COMPAT_NARRATIVE_VARIANTS,e.id))fail(`stageMeta ${e.stageId}: compatNarrativeVariants for ${e.id} also in eventNarrativeView.ts TS_COMPAT_NARRATIVE_VARIANTS`);
  const packs={...catalog,stageMeta:[]},probe='\u0000stageMeta-probe';
  for(const e of has('uiChapterTitle'))if(V.storyChapterTitleIn(packs,e.stageId,e.id,probe)!==probe)fail(`stageMeta ${e.stageId}: chapter title for ${e.id} is already decided in eventNarrativeView.ts`);
  for(const m of catalog.stageMeta||[]){if(!m.presentation?.uiChapterByRouteLocation)continue;const own=m.presentation.events||{};
   const ids=[`${m.stageId}\u0000probe`,...(stages.get(m.stageId)?.scenario?.events||[]).map(e=>e.id).filter(id=>!own[id]?.uiChapterId&&!own[id]?.uiChapterTitle)];
   for(const id of ids)if(V.storyChapterTitleIn(packs,m.stageId,id,probe)!==probe)fail(`stageMeta ${m.stageId}: uiChapterByRouteLocation is shadowed by eventNarrativeView.ts${id.includes('\u0000')?'':` (event ${id})`}`);}}
 const keys=Object.keys(catalog.texts||{});
 if(keys.some(k=>k.startsWith('actionDisplay.')||k.startsWith('scopedPlayerLine.'))){const P=await mod('playerActionPresentation.ts');
  for(const k of keys){const s=parseScopedLine(k);if(s&&`${s.eventId}::${s.actionId}` in P.TS_PLAYER_LINES)fail(`text ${k}: also in playerActionPresentation.ts TS_PLAYER_LINES`);
   const a=k.endsWith('.line')&&parseActionDisplay(k);if(!a)continue;const ts=Object.keys(P.TS_ACTION_DISPLAY_OVERRIDES).filter(t=>t.startsWith(`${a.eventId}::`));
   const clash=ts.find(t=>a.actionId==='*'||t===`${a.eventId}::*`||t===`${a.eventId}::${a.actionId}`);if(clash)fail(`text ${k}: overlaps playerActionPresentation.ts TS_ACTION_DISPLAY_OVERRIDES ${clash}`);}}
 if(catalog.endings?.length){const {TS_ENDING_KEYS}=await mod('endingPresentation.ts');const {TS_BATTLE_LOSS_ENDINGS,TS_ENDING_PATH_TEXTS}=await mod('fixedEndingNarratives.ts');const tsKeys=new Set(Object.values(TS_ENDING_KEYS));
  for(const x of catalog.endings){if(x.key!==undefined&&(x.endingId in TS_ENDING_KEYS||tsKeys.has(x.key)))fail(`endings ${x.endingId}: key also in endingPresentation.ts TS_ENDING_KEYS`);
   if(x.battleLoss&&TS_BATTLE_LOSS_ENDINGS.some(t=>t.endingId===x.endingId))fail(`endings ${x.endingId}: battleLoss also in fixedEndingNarratives.ts TS_BATTLE_LOSS_ENDINGS`);
   if(x.pathText&&x.endingId in TS_ENDING_PATH_TEXTS)fail(`endings ${x.endingId}: pathText also in fixedEndingNarratives.ts TS_ENDING_PATH_TEXTS`);}}
 if(catalog.openWorldSlices?.length){
  // TS 侧切片散在三个文件里（南荒一份、五原分两份）；包里同 key 或同 definition.id 即报错。TS 文件在两边都有时加载就会抛错（resolveOpenWorldSlice 二选一），一并转成编译报错
  const load=async p=>{try{return await mod(p);}catch(e){fail(`openWorldSlices: ${p}: ${e.message}`);}};
  const {TS_STEP_SCENE_STAGE_PREFIXES,tsOpenWorldSliceHasData}=await load('travel/openWorldSlices.ts');
  const parts=[(await load('travel/defs/qingyuNanhuang.ts')).TS_NANHUANG_OPEN_WORLD_SLICE,(await load('travel/defs/qingyuWuyuanZones.ts')).TS_WUYUAN_ZONE_PART,(await load('wuyuanOpenWorldSlice.ts')).TS_WUYUAN_OPEN_WORLD_SLICE].filter(tsOpenWorldSliceHasData);
  for(const s of catalog.openWorldSlices){const hit=parts.find(t=>t.key===s.key||(t.definition?.id!==undefined&&t.definition.id===s.definition.id));if(hit)fail(`openWorldSlices ${s.key}: also defined in TS (key ${hit.key}); move the whole slice`);
   for(const x of s.stepSceneStagePrefixes||[])if(TS_STEP_SCENE_STAGE_PREFIXES.includes(x))fail(`openWorldSlices ${s.key}: stepSceneStagePrefixes ${x} also in TS_STEP_SCENE_STAGE_PREFIXES`);}}
 if(catalog.persistentEntries?.length){const {TS_PERSISTENT_ENTRIES}=await mod('persistentLineEntries.ts');for(const x of catalog.persistentEntries)if(TS_PERSISTENT_ENTRIES.some(t=>t.kind===x.kind))fail(`persistentEntries ${x.kind}: also in persistentLineEntries.ts TS_PERSISTENT_ENTRIES`);}
}
