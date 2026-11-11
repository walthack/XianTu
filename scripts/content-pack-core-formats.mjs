// 核心轨与人物轨的新包格式（F0a，2026-11-11）：lineCriticalEvents／characterBeats／storyAxis／locationAliases／characterProfiles／ifBranches。
// 只建机制，不搬数据：编译期（compileCoreFormats，纯数据 + 只读实体总表）与 TS 表交叉校验（validateCoreFormatsWithTs，同宋 S2 的 validateWithTs 做法）。
// 各段都是 manifest 的文件列表；lineCriticalEvents 的文件是数组，其余五种的文件是对象。条目与文件顶层的 note 只给作者看，编译时剥掉。
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

export const coreFormatKinds=['lineCriticalEvents','characterBeats','storyAxis','locationAliases','characterProfiles','ifBranches'];
/** catalog 里的空段（没有包声明时）。 */
export const emptyCoreFormats=()=>({lineCriticalEvents:[],characterBeats:{quests:[],highlights:[]},storyAxis:null,locationAliases:{canonical:{},parents:{},display:{}},characterProfiles:{stance:[],affinityCaps:[]},ifBranches:{branches:[],consequences:[],prompts:{}}});
/** 归属：IF 分支 id（种类 ifBranch）登记为包定义；其余几段只引用别处的 id。
 * 人物任务 id（characterBeats.quests[].id，如短词人名）是单独的命名空间，只在 characterBeats 段内使用，不登记进通用归属：
 * 别的包里恰好同名的普通字符串（例如核心包场面合同的局部参与者 id）不算对人物包的引用（B2，2026-11-11 主驱动裁定）。
 * 唯一性另由 compileCoreFormats（全部包之间，报 defined by both）与 validateCoreFormatsWithTs（与 TS 表之间）保证；人物拍点里的事件 id 照常进通用扫描。 */
export function coreDefinedIds(kind,x){
 if(kind==='ifBranches'&&object(x))return (Array.isArray(x.branches)?x.branches:[]).map(b=>['ifBranch',b?.branchId]);
 return [];
}

const STATUSES=['ready','new','insert'],PILLARS=['bloodline','taiquan'],BLOODLINE=['yueshuang','xiaozi','zhao','xiaolinger'],NODE_STATUS=['ready','new','pending'],REQUIREMENT_IDS=['taiquan_rite','bloodline_survivor'];
const distinct=a=>new Set(a).size===a.length;

/**
 * raw：{种类: [{packId, value}]}（按包顺序、文件顺序）。stages：编译后的全部关（内置＋包内，overlay 已并入）；events：事件 id → 事件；
 * builtinStageIds：内置关 id；location：{ids（locations.json 的 id＋别名）, mainIds（只含 id）, aliasIds（只含别名）}。
 */
export async function compileCoreFormats(raw,{stages,events,builtinStageIds,location}){
 const out=emptyCoreFormats();
 let entities;const entity=async()=>entities||=await tsLoader().import(join(root,'src/modules/scenarioMods/namedEntities.ts'));
 const fileObject=(k,{packId,value},keys)=>{if(!onlyKeys(value,[...keys,'note'])||!noteOk(value))fail(`${packId}.${k}: expected object with ${keys.join('/')}`);return value;};
 const list=(k,packId,v)=>{if(v===undefined)return [];if(!Array.isArray(v))fail(`${packId}.${k}: expected array`);return v;};

 // 线承重事件：与 secondaryLines.ts LINE_CRITICAL_EVENTS 合并。事件存在（含隔离关、overlay 事件）；eventId 全部包里不重复；lineId 是已有二级线、与 TS 表不重复在 validateCoreFormatsWithTs 查
 {const seen=new Set();for(const {packId,value} of raw.lineCriticalEvents){if(!Array.isArray(value))fail(`${packId}.lineCriticalEvents: expected array`);
  for(const x of value){const at=`lineCriticalEvents ${x?.eventId}`;
   if(!onlyKeys(x,['eventId','lineId','note'])||!noteOk(x)||!text(x.eventId)||!text(x.lineId))fail(`${at}: invalid fields`);
   if(!events.has(x.eventId))fail(`${at}: unknown event`);if(seen.has(x.eventId))fail(`${at}: appears twice`);seen.add(x.eventId);
   out.lineCriticalEvents.push(strip(x));}}}

 // 人物任务与高光：status ∈ ready/new/insert；ready/insert 的 eventIds 都存在，new 的（建议 id）都不存在；quest id 全部包里不重复（不进通用归属，见 coreDefinedIds）；同名同事件的高光不重复
 {const ids=new Map(),highlights=new Set();for(const file of raw.characterBeats){const v=fileObject('characterBeats',file,['quests','highlights']);
  for(const q of list('characterBeats.quests',file.packId,v.quests)){const at=`characterBeats quest ${q?.id}`;
   if(!onlyKeys(q,['id','name','beats','note'])||!noteOk(q)||!text(q.id)||!text(q.name)||!Array.isArray(q.beats)||!q.beats.length)fail(`${at}: invalid fields`);
   if(ids.has(q.id))fail(ids.get(q.id)===file.packId?`${at}: duplicate id`:`characterQuest id ${q.id} defined by both ${ids.get(q.id)} and ${file.packId}`);ids.set(q.id,file.packId);
   const beats=q.beats.map((b,j)=>{
    if(!onlyKeys(b,['reviewSummary','status','eventIds','note'])||!noteOk(b)||!text(b.reviewSummary)||!STATUSES.includes(b.status)||!texts(b.eventIds)||!b.eventIds.length||!distinct(b.eventIds))fail(`${at}: beat ${j}: invalid fields`);
    for(const id of b.eventIds){if(b.status==='new'&&events.has(id))fail(`${at}: beat ${j}: new beat suggests ${id}, which already exists (use ready/insert)`);if(b.status!=='new'&&!events.has(id))fail(`${at}: beat ${j}: unknown event ${id}`);}
    return strip(b);});
   out.characterBeats.quests.push({...strip(q),beats});}
  for(const h of list('characterBeats.highlights',file.packId,v.highlights)){const at=`characterBeats highlight ${h?.name}`;
   if(!onlyKeys(h,['name','eventIds','reviewSummary','note'])||!noteOk(h)||!text(h.name)||!texts(h.eventIds)||!h.eventIds.length||!distinct(h.eventIds)||!text(h.reviewSummary))fail(`${at}: invalid fields`);
   for(const id of h.eventIds)if(!events.has(id))fail(`${at}: unknown event ${id}`);
   const key=JSON.stringify([h.name,h.eventIds]);if(highlights.has(key))fail(`${at}: duplicate highlight ${h.eventIds.join(',')}`);highlights.add(key);
   out.characterBeats.highlights.push(strip(h));}}}

 // 主轴：全局至多一份。stageOrder 等于从首关沿 manifest.nextStageId 走出的链（不分叉、无环、走到没有 nextStageId 为止），且覆盖全部内置关；
 // layers 的 unlockStageIds、stages 的 stageId、nodes 的 stageId 都是已有关；ready 节点的 eventId 属于该关；pending 节点不给 eventId
 if(raw.storyAxis.length>1)fail(`storyAxis declared ${raw.storyAxis.length} times (${raw.storyAxis.map(x=>x.packId).join(', ')}); at most one`);
 for(const file of raw.storyAxis){const v=fileObject('storyAxis',file,['stageOrder','layers','stages','nodes','requirements']);
  for(const k of ['stageOrder','layers','stages','nodes','requirements'])if(!Array.isArray(v[k]))fail(`storyAxis.${k}: expected array`);
  const order=v.stageOrder;if(!order.length||!texts(order)||!distinct(order))fail('storyAxis.stageOrder: expected distinct stage ids');
  for(const id of order)if(!stages.has(id))fail(`storyAxis.stageOrder: unknown stage ${id}`);
  const chain=[];for(let id=order[0];id&&!chain.includes(id);id=stages.get(id)?.manifest?.nextStageId||undefined)chain.push(id);
  const at=chain.findIndex((id,i)=>i<order.length&&id!==order[i]),last=stages.get(chain[chain.length-1])?.manifest?.nextStageId;
  if(at>=0||chain.length!==order.length||last)fail(`storyAxis.stageOrder must equal the nextStageId chain from ${order[0]} (${at>=0?`at ${at}: chain has ${chain[at]}, stageOrder has ${order[at]}`:chain.length<order.length?`chain ends after ${chain.length} stages`:`chain continues to ${chain.length>order.length?chain[order.length]:last}`})`);
  const missing=builtinStageIds.filter(id=>!order.includes(id));if(missing.length)fail(`storyAxis.stageOrder: built-in stages missing ${missing.join(', ')}`);
  const layerNos=new Set();const layers=v.layers.map((l,i)=>{
   if(!onlyKeys(l,['layer','text','unlockStageIds','restricted','note'])||!noteOk(l)||!Number.isInteger(l.layer)||l.layer<1||l.layer>6||!text(l.text)||!Array.isArray(l.unlockStageIds)||!texts(l.unlockStageIds)||!distinct(l.unlockStageIds)||(l.restricted!==undefined&&l.restricted!==true))fail(`storyAxis.layers.${i}: invalid fields`);
   if(layerNos.has(l.layer))fail(`storyAxis.layers: layer ${l.layer} appears twice`);layerNos.add(l.layer);
   for(const id of l.unlockStageIds)if(!stages.has(id))fail(`storyAxis.layers.${i}: unknown stage ${id}`);return strip(l);});
  const roleIds=new Set();const roles=v.stages.map((s,i)=>{
   if(!onlyKeys(s,['stageId','role','pillars','note'])||!noteOk(s)||!text(s.stageId)||!text(s.role)||!Array.isArray(s.pillars)||!distinct(s.pillars)||s.pillars.some(p=>!PILLARS.includes(p)))fail(`storyAxis.stages.${i}: invalid fields`);
   if(!stages.has(s.stageId))fail(`storyAxis.stages.${i}: unknown stage ${s.stageId}`);if(roleIds.has(s.stageId))fail(`storyAxis.stages: ${s.stageId} appears twice`);roleIds.add(s.stageId);return strip(s);});
  const nodes=v.nodes.map((n,i)=>{const at=`storyAxis.nodes.${i}`;
   if(!onlyKeys(n,['stageId','reviewSummary','eventId','status','locationId','bloodlineBranch','note'])||!noteOk(n)||!text(n.stageId)||!text(n.reviewSummary)||(n.eventId!==undefined&&!text(n.eventId))||(n.status!==undefined&&!NODE_STATUS.includes(n.status))||(n.locationId!==undefined&&!text(n.locationId))||(n.bloodlineBranch!==undefined&&!BLOODLINE.includes(n.bloodlineBranch)))fail(`${at}: invalid fields`);
   const stage=stages.get(n.stageId);if(!stage)fail(`${at}: unknown stage ${n.stageId}`);
   if(n.status==='ready'&&!(stage.scenario?.events||[]).some(e=>e.id===n.eventId))fail(`${at}: ready node needs an event of ${n.stageId} (got ${n.eventId})`);
   if(n.status==='pending'&&n.eventId!==undefined)fail(`${at}: pending node must not suggest an event id`);
   if(n.locationId!==undefined&&!location.ids.has(n.locationId))fail(`${at}: unknown location ${n.locationId}`);return strip(n);});
  const reqIds=new Set();const requirements=v.requirements.map((r,i)=>{
   if(!onlyKeys(r,['id','text','basis','note'])||!noteOk(r)||!REQUIREMENT_IDS.includes(r.id)||!text(r.text)||!text(r.basis))fail(`storyAxis.requirements.${i}: invalid fields`);
   if(reqIds.has(r.id))fail(`storyAxis.requirements: ${r.id} appears twice`);reqIds.add(r.id);return strip(r);});
  out.storyAxis={stageOrder:[...order],layers,stages:roles,nodes,requirements};}

 // 地点：canonical 的值是 locations.json 的规范 id、不是另一条别名的键（不成链）、键不是 locations.json 已有的别名（否则覆盖实体总表派生的那条）；
 // parents 的键与值都在 locations.json（含别名），不成环；display 的键在 locations.json（含别名）。三张表的键全部包里不重复；与 TS 表重复在 validateCoreFormatsWithTs 查
 for(const file of raw.locationAliases){const v=fileObject('locationAliases',file,['canonical','parents','display']);
  for(const k of ['canonical','parents','display'])if(v[k]!==undefined&&!object(v[k]))fail(`${file.packId}.locationAliases.${k}: expected object`);
  for(const [from,to] of Object.entries(v.canonical||{})){const at=`locationAliases canonical ${from}`;
   if(!text(from)||!text(to)||from===to)fail(`${at}: invalid alias`);if(!location.mainIds.has(to))fail(`${at}: ${to} is not a location id in locations.json`);
   if(location.aliasIds.has(from))fail(`${at}: already an alias in locations.json`);if(from in out.locationAliases.canonical)fail(`${at}: appears twice`);out.locationAliases.canonical[from]=to;}
  for(const [child,parent] of Object.entries(v.parents||{})){const at=`locationAliases parents ${child}`;
   if(!text(parent)||child===parent||!location.ids.has(child)||!location.ids.has(parent))fail(`${at}: unknown location or self parent`);if(child in out.locationAliases.parents)fail(`${at}: appears twice`);out.locationAliases.parents[child]=parent;}
  for(const [id,d] of Object.entries(v.display||{})){const at=`locationAliases display ${id}`;
   if(!location.ids.has(id))fail(`${at}: unknown location`);if(!onlyKeys(d,['name','displayAliases'])||!text(d.name)||(d.displayAliases!==undefined&&!texts(d.displayAliases)))fail(`${at}: invalid fields`);
   if(id in out.locationAliases.display)fail(`${at}: appears twice`);out.locationAliases.display[id]=d;}}
 checkLocationGraph(out.locationAliases.canonical,out.locationAliases.parents);

 // 人物档案：entities 是 character／enemy 实体（运行时 entityAliases 展开，可重复），extraNames 接在后面；展开后的名字在同一张表的两条档案里不能重复（find 取第一条，重复即后一条失效）
 {const names={stance:new Map(),affinityCaps:new Map()};
 const entry=async(k,x,i,keys)=>{const at=`characterProfiles.${k}.${i}`;
  if(!onlyKeys(x,[...keys,'entities','extraNames','note'])||!noteOk(x)||!Array.isArray(x.entities)||x.entities.some(e=>!onlyKeys(e,['kind','id'])||!['character','enemy'].includes(e.kind)||!text(e.id))||(x.extraNames!==undefined&&!texts(x.extraNames)))fail(`${at}: invalid fields`);
  const {namedEntity,entityAliases}=await entity();for(const e of x.entities)if(!namedEntity(e.kind,e.id))fail(`${at}: unknown ${e.kind} ${e.id}`);
  const all=[...x.entities.flatMap(e=>entityAliases(e.kind,e.id)),...(x.extraNames||[])];if(!all.length)fail(`${at}: no names`);
  for(const n of new Set(all)){if(names[k].has(n))fail(`${at}: name ${n} already in characterProfiles.${k}.${names[k].get(n)}`);names[k].set(n,i);}
  return at;};
 for(const file of raw.characterProfiles){const v=fileObject('characterProfiles',file,['stance','affinityCaps']);
  for(const x of list('characterProfiles.stance',file.packId,v.stance)){const at=await entry('stance',x,out.characterProfiles.stance.length,['constant','bands']);
   if(!Array.isArray(x.constant)||!x.constant.every(text)||!object(x.bands)||Object.entries(x.bands).some(([b,l])=>!['low','mid','high'].includes(b)||!texts(l)))fail(`${at}: invalid constant/bands`);
   out.characterProfiles.stance.push(strip(x));}
  for(const x of list('characterProfiles.affinityCaps',file.packId,v.affinityCaps)){const at=await entry('affinityCaps',x,out.characterProfiles.affinityCaps.length,['capTier','reason','liftedBy']);
   if(!text(x.capTier)||!text(x.reason)||!text(x.liftedBy))fail(`${at}: invalid capTier/reason/liftedBy`);
   out.characterProfiles.affinityCaps.push(strip(x));}}}

 // IF 分歧：事件存在、requiredCharacterId 是角色；acceptedStatuses 是不重复的小写字母串（运行时编译成不分大小写的整串匹配）；branchId、同事件同人物的后果、提示 id 全部包里不重复
 {const branchIds=new Set(),consequenceKeys=new Set(),status=v=>Array.isArray(v)&&v.length>0&&distinct(v)&&v.every(s=>typeof s==='string'&&/^[a-z]+$/.test(s));
 const rule=async(at,x)=>{if(!events.has(x.eventId))fail(`${at}: unknown event ${x.eventId}`);if(!(await entity()).namedEntity('character',x.requiredCharacterId))fail(`${at}: unknown character ${x.requiredCharacterId}`);};
 for(const file of raw.ifBranches){const v=fileObject('ifBranches',file,['branches','consequences','prompts']);
  for(const x of list('ifBranches.branches',file.packId,v.branches)){const at=`ifBranches branch ${x?.branchId}`;
   if(!onlyKeys(x,['eventId','branchId','requiredCharacterId','acceptedStatuses','flagCharacterSlug','normalizedStatus','prompt','note'])||!noteOk(x)||!text(x.eventId)||!text(x.branchId)||!text(x.requiredCharacterId)||!status(x.acceptedStatuses)||typeof x.flagCharacterSlug!=='string'||!/^[a-z0-9_]+$/.test(x.flagCharacterSlug)||typeof x.normalizedStatus!=='string'||!/^[a-z]+$/.test(x.normalizedStatus)||(x.prompt!==undefined&&!text(x.prompt)))fail(`${at}: invalid fields`);
   await rule(at,x);if(branchIds.has(x.branchId))fail(`${at}: duplicate branchId`);branchIds.add(x.branchId);out.ifBranches.branches.push(strip(x));}
  for(const x of list('ifBranches.consequences',file.packId,v.consequences)){const at=`ifBranches consequence ${x?.eventId}`;
   if(!onlyKeys(x,['eventId','requiredCharacterId','acceptedStatuses','flagKey','flagValue','prompt','note'])||!noteOk(x)||!text(x.eventId)||!text(x.requiredCharacterId)||!status(x.acceptedStatuses)||!text(x.flagKey)||!['string','number','boolean'].includes(typeof x.flagValue)||(x.prompt!==undefined&&!text(x.prompt)))fail(`${at}: invalid fields`);
   await rule(at,x);const key=`${x.eventId}\u0000${x.requiredCharacterId}`;if(consequenceKeys.has(key))fail(`${at}: duplicate consequence for ${x.requiredCharacterId}`);consequenceKeys.add(key);out.ifBranches.consequences.push(strip(x));}
  if(v.prompts!==undefined&&!object(v.prompts))fail(`${file.packId}.ifBranches.prompts: expected object`);
  for(const [id,p] of Object.entries(v.prompts||{})){if(!text(id)||!text(p))fail(`ifBranches prompt ${id}: invalid`);if(id in out.ifBranches.prompts)fail(`ifBranches prompt ${id}: appears twice`);out.ifBranches.prompts[id]=p;}}}
 return out;
}

/** 别名不成链（值不能又是别名的键）、父子不成环。编译期查包内，validateCoreFormatsWithTs 再查包＋TS。 */
function checkLocationGraph(canonical,parents){
 for(const [from,to] of Object.entries(canonical))if(to in canonical)fail(`locationAliases canonical ${from}: ${to} is itself an alias (chain)`);
 for(const start of Object.keys(parents)){const seen=[start];for(let at=parents[start];at!==undefined;at=parents[at]){if(seen.includes(at))fail(`locationAliases parents cycle ${[...seen,at].join(' → ')}`);seen.push(at);}}
}

const isEmpty=c=>!c.lineCriticalEvents?.length&&!c.characterBeats?.quests?.length&&!c.characterBeats?.highlights?.length&&!c.storyAxis&&!Object.values(c.locationAliases||{}).some(t=>Object.keys(t).length)&&!c.characterProfiles?.stance?.length&&!c.characterProfiles?.affinityCaps?.length&&!c.ifBranches?.branches?.length&&!c.ifBranches?.consequences?.length&&!Object.keys(c.ifBranches?.prompts||{}).length;

/**
 * 与 TS 表交叉校验（新段为空时不加载任何模块）：同一条目在 TS 表和包里都有即报错；只读 TS_ 表与纯函数，不靠模块自己读磁盘 catalog。
 */
export async function validateCoreFormatsWithTs(catalog){
 if(isEmpty(catalog))return;
 const jiti=tsLoader(),mod=p=>jiti.import(join(root,'src/modules/scenarioMods',p));
 if(catalog.lineCriticalEvents?.length){const {TS_LINE_CRITICAL_EVENTS,TS_SECONDARY_LINES,mergeSecondaryLines}=await mod('secondaryLines.ts');
  let lines;try{lines=new Set(mergeSecondaryLines(TS_SECONDARY_LINES,catalog.secondaryLines||[]).map(l=>l.id));}catch(e){fail(e.message);}
  for(const x of catalog.lineCriticalEvents){if(x.eventId in TS_LINE_CRITICAL_EVENTS)fail(`lineCriticalEvents ${x.eventId}: also listed in secondaryLines.ts LINE_CRITICAL_EVENTS`);if(!lines.has(x.lineId))fail(`lineCriticalEvents ${x.eventId}: unknown secondary line ${x.lineId}`);}}
 const beats=catalog.characterBeats||{};if(beats.quests?.length||beats.highlights?.length){const {TS_CHARACTER_QUESTS,TS_CHARACTER_HIGHLIGHTS}=await mod('characterQuests.ts');
  for(const q of beats.quests||[])if(TS_CHARACTER_QUESTS.some(t=>t.id===q.id))fail(`characterBeats quest ${q.id}: also in characterQuests.ts CHARACTER_QUESTS`);
  for(const h of beats.highlights||[])if(TS_CHARACTER_HIGHLIGHTS.some(t=>t.name===h.name&&JSON.stringify(t.eventIds)===JSON.stringify(h.eventIds)))fail(`characterBeats highlight ${h.name}: also in characterQuests.ts CHARACTER_HIGHLIGHTS (${h.eventIds.join(',')})`);}
 if(catalog.storyAxis){const ax=await mod('mainQuestAxis.ts');const left=['TS_STAGE_ORDER','TS_MAIN_QUEST_LAYERS','TS_MAIN_QUEST_STAGES','TS_MAIN_QUEST_NODES','TS_MAIN_QUEST_REQUIREMENTS'].filter(k=>ax[k].length);
  if(left.length)fail(`storyAxis: declared by a pack, but mainQuestAxis.ts still has ${left.join(', ')}; move the whole axis (no per-entry merge)`);}
 const loc=catalog.locationAliases||{};if(Object.values(loc).some(t=>Object.keys(t||{}).length)){const {TS_LOCATION_ID_ALIASES,TS_LOCATION_PARENTS,TS_LOCATION_NAMES}=await mod('travel/locationIds.ts');
  for(const [k,ts,name] of [['canonical',TS_LOCATION_ID_ALIASES,'TS_LOCATION_ID_ALIASES'],['parents',TS_LOCATION_PARENTS,'LOCATION_PARENTS'],['display',TS_LOCATION_NAMES,'LOCATION_NAMES']])
   for(const id of Object.keys(loc[k]||{}))if(id in ts)fail(`locationAliases ${k} ${id}: also in travel/locationIds.ts ${name}`);
  checkLocationGraph({...TS_LOCATION_ID_ALIASES,...loc.canonical},{...TS_LOCATION_PARENTS,...loc.parents});}
 const prof=catalog.characterProfiles||{};if(prof.stance?.length||prof.affinityCaps?.length){
  const {TS_STANCE_PROFILES,packEntityNames}=await mod('stanceProfiles.ts');const {TS_AFFINITY_CAPS}=await mod('affinityCaps.ts');const {AFFINITY_TIERS}=await mod('affinityLadder.ts');
  for(const [k,ts,file] of [['stance',TS_STANCE_PROFILES,'stanceProfiles.ts STANCE_PROFILES'],['affinityCaps',TS_AFFINITY_CAPS,'affinityCaps.ts AFFINITY_CAPS']]){const tsNames=new Set(ts.flatMap(p=>p.names));
   (prof[k]||[]).forEach((x,i)=>{const hit=packEntityNames(x).find(n=>tsNames.has(n));if(hit!==undefined)fail(`characterProfiles.${k}.${i}: name ${hit} also in ${file}`);});}
  (prof.affinityCaps||[]).forEach((x,i)=>{if(!AFFINITY_TIERS.some(t=>t.id===x.capTier))fail(`characterProfiles.affinityCaps.${i}: unknown capTier ${x.capTier}`);});}
 const ifb=catalog.ifBranches||{};if(ifb.branches?.length||ifb.consequences?.length||Object.keys(ifb.prompts||{}).length){const {TS_AUTO_BRANCH_RULES,TS_AUTO_CONSEQUENCE_RULES,TS_DIVERGENCE_PROMPTS}=await mod('divergenceLedger.ts');
  for(const x of ifb.branches||[])if(TS_AUTO_BRANCH_RULES.some(t=>t.branchId===x.branchId))fail(`ifBranches branch ${x.branchId}: also in divergenceLedger.ts TS_AUTO_BRANCH_RULES`);
  for(const x of ifb.consequences||[])if(TS_AUTO_CONSEQUENCE_RULES.some(t=>t.eventId===x.eventId&&t.requiredCharacterId===x.requiredCharacterId))fail(`ifBranches consequence ${x.eventId}: also in divergenceLedger.ts TS_AUTO_CONSEQUENCE_RULES`);
  for(const id of Object.keys(ifb.prompts||{}))if(id in TS_DIVERGENCE_PROMPTS)fail(`ifBranches prompt ${id}: also in divergenceLedger.ts TS_DIVERGENCE_PROMPTS`);}
}

/**
 * 合同哈希迁移表（BZ1，2026-11-12）：manifest.contractRevisions 是文件列表，每个文件是 [{eventId,from,to,note?}]，编译成 catalog.contractRevisions
 * （顺序 = 包顺序 × 文件顺序 × 条目顺序；note 剥掉），供冻结的 runtime.ts BATCH6_TEXT_CONTRACT_REVISIONS 按 eventId 查。
 * 纯数据校验：只认四个字段；事件存在（events = 套过 overlay 与人物线投影的全部事件）；from／to 是 8 位小写十六进制且不相等；eventId 全部包里只出现一次。
 * 不校验 to 等于当前合同哈希：哈希函数 stableContractHash 在冻结的 runtime.ts 里且未导出；两条已失效条目原样保留（纯搬迁）；另抄一份算法会走样。由 tests/contractRevisionsPack.test.mjs 守失效集合。
 */
export function compileContractRevisions(raw,{events}){
 const out=[],owner=new Map(),hash=v=>typeof v==='string'&&/^[0-9a-f]{8}$/.test(v);
 for(const {packId,value} of raw){if(!Array.isArray(value))fail(`${packId}.contractRevisions: expected array`);
  for(const x of value){const at=`contractRevision ${x?.eventId}`;
   if(!onlyKeys(x,['eventId','from','to','note'])||!noteOk(x)||!text(x.eventId))fail(`${at}: invalid fields`);
   if(!events.has(x.eventId))fail(`${at}: unknown event`);
   if(!hash(x.from)||!hash(x.to))fail(`${at}: from/to must be 8-digit lowercase hex`);
   if(x.from===x.to)fail(`${at}: from equals to`);
   if(owner.has(x.eventId))fail(owner.get(x.eventId)===packId?`${at}: duplicate eventId`:`contractRevision ${x.eventId} defined by both ${owner.get(x.eventId)} and ${packId}`);
   owner.set(x.eventId,packId);out.push(strip(x));}}
 return out;
}
