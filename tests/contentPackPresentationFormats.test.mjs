// F0b：展示类数据的新包格式机制（只建机制，不搬数据）——stageMeta 事件新字段（uiChapterTitle／routeLocation／compassObjectiveOnly／
// lockedDecision／actionPresentation／compatNarrativeVariants、objective 的 $text 与 {{entity}} 模板）、关级 uiChapterByRouteLocation、
// texts 通配键（actionDisplay.<e>.*、scopedPlayerLine.<e>::<a>）、三个新段 endings／openWorldSlices／persistentEntries。
// 编译夹具在 _newbot_tmp 下的临时 packs 目录（写法同 contentPackCoreCharacterFormats）。不写死真实剧情 id：关、事件、地点、角色、结局
// 都从内置关、locations.json、实体总表、TS_ 表动态挑；合成 id 一律 test.* 前缀。
// 「与 TS 表重复」用合成的临时 TS 条目（本文件与编译器经 jiti 共用模块缓存，用例里改 TS_ 表、用完还原）。
// 最后一组「搬迁演练」：把现有 TS 表整张（连同章名、目标两处代码特判，按源码解析）写进真实包目录的副本，临时搬空 TS 后编译，
// 读取结果与现在逐项相等；表搬空、特判删掉后自然退化成空演练。
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rm,cp} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createJiti} from 'jiti';
import {compileContentPacks} from '../scripts/content-packs.mjs';
import {emptyPresentationFormats} from '../scripts/content-pack-presentation-formats.mjs';
import {loadTs} from './loadTs.mjs';

const root=resolve(import.meta.dirname,'..');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const PACK_DIR=join(root,'src/modules/contentPacks/packs');
const qinDir=join(PACK_DIR,'qin');

const {CONTENT_PACKS}=await loadTs('../src/modules/contentPacks/index.ts');
const SM=await loadTs('../src/modules/contentPacks/stageMeta.ts');
const NV=await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
const BD=await loadTs('../src/modules/scenarioMods/branchDecision.ts');
const FQ=await loadTs('../src/modules/scenarioMods/fixedQuestObjectives.ts');
const PA=await loadTs('../src/modules/scenarioMods/playerActionPresentation.ts');
const EP=await loadTs('../src/modules/scenarioMods/endingPresentation.ts');
const FE=await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
const OW=await loadTs('../src/modules/scenarioMods/travel/openWorldSlices.ts');
const NH=await loadTs('../src/modules/scenarioMods/travel/defs/qingyuNanhuang.ts');
const WZ=await loadTs('../src/modules/scenarioMods/travel/defs/qingyuWuyuanZones.ts');
const WO=await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const SS=await loadTs('../src/modules/scenarioMods/travel/stepScene.ts');
const PE=await loadTs('../src/modules/scenarioMods/persistentLineEntries.ts');
const NE=await loadTs('../src/modules/scenarioMods/namedEntities.ts');

const withPacks=async(packs,fn)=>{
 const dir=await mkdtemp(join(root,'_newbot_tmp/f0b-presentation-'));
 try{
  for(const [name,{files={},...m}] of Object.entries(packs)){
   await mkdir(join(dir,name));
   await writeFile(join(dir,name,'manifest.json'),JSON.stringify({schemaVersion:1,...m}));
   for(const [f,v] of Object.entries(files))await writeFile(join(dir,name,f),JSON.stringify(v));
  }
  return await fn(()=>compileContentPacks({packsDir:dir}));
 }finally{await rm(dir,{recursive:true,force:true});}
};
const compile=packs=>withPacks(packs,c=>c());
const rejects=(packs,re)=>withPacks(packs,c=>assert.rejects(c,re));
const reEsc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

/** 把 TS 模块复制到临时目录加载：CONTENT_PACKS 换成合成 catalog，相对 import 改成原目录的绝对路径；patch 可再改源码（演练用来删特判）。 */
const loadWithCatalog=async(rel,catalog,patch=s=>s)=>{
 const file=join(root,rel),source=await readFile(file,'utf8');
 const dir=await mkdtemp(join(root,'_newbot_tmp/f0b-inject-'));
 try{
  await writeFile(join(dir,'catalog-stub.ts'),`export const CONTENT_PACKS: any = ${JSON.stringify(catalog)};\nexport function packText(id: string): string { const t = CONTENT_PACKS.texts[id]; if (t === undefined) throw Error(id); return t; }\n`);
  const patched=patch(source)
   .replace(/from '(?:(?:\.\.\/)+contentPacks|@\/modules\/contentPacks)'/g,`from '${join(dir,'catalog-stub.ts')}'`)
   .replace(/from '(\.{1,2}\/[^']+)'/g,(_,p)=>`from '${resolve(dirname(file),p)}'`);
  const out=join(dir,rel.split('/').pop());await writeFile(out,patched);
  return await createJiti(import.meta.url,{interopDefault:true,moduleCache:false,alias:{'@':join(root,'src')}}).import(out);
 }finally{await rm(dir,{recursive:true,force:true});}
};
/** 临时改 TS 表 / catalog 段 / 模块导出，fn 结束后原样还原。 */
const withRecord=async(obj,entries,fn)=>{const saved={...obj};for(const k of Object.keys(obj))delete obj[k];Object.assign(obj,entries);try{return await fn();}finally{for(const k of Object.keys(obj))delete obj[k];Object.assign(obj,saved);}};
const withAdded=(obj,entries,fn)=>withRecord(obj,{...obj,...entries},fn);
const withArray=async(arr,items,fn)=>{const saved=arr.splice(0,arr.length,...items);try{return await fn();}finally{arr.splice(0,arr.length,...saved);}};
const withSet=async(set,items,fn)=>{const saved=[...set];set.clear();for(const x of items)set.add(x);try{return await fn();}finally{set.clear();for(const x of saved)set.add(x);}};
const withProps=async(obj,props,fn)=>{const saved=Object.fromEntries(Object.keys(props).map(k=>[k,obj[k]]));Object.assign(obj,props);try{return await fn();}finally{Object.assign(obj,saved);}};

// —— 动态夹具 ——
const BUILTINS=await Promise.all((await readdir(join(root,'src/modules/scenarioMods/builtins/data'))).filter(f=>f.endsWith('.json')).sort().map(f=>read(join(root,'src/modules/scenarioMods/builtins/data',f))));
const PROBE='\u0000probe',bare={...CONTENT_PACKS,stageMeta:[]};
const actionsOf=e=>(e.playerCompletionContract?.actions||[]).map(a=>a.id);
const tsEventIds=new Set([...Object.keys(BD.TS_LOCKED_DECISIONS),...Object.keys(NV.TS_STORY_ROUTE_LOCATIONS),...NV.TS_COMPASS_OBJECTIVE_ONLY_EVENT_IDS,...NV.TS_STORY_ACTION_PRESENTATIONS.map(x=>x.eventId),...Object.keys(NV.TS_COMPAT_NARRATIVE_VARIANTS),...Object.keys(FQ.FIXED_QUEST_OBJECTIVE_OVERRIDES)]);
const metaEventIds=new Set((CONTENT_PACKS.stageMeta||[]).flatMap(m=>Object.keys(m.presentation?.events||{})));
const freeEvent=e=>actionsOf(e).length>=2&&!tsEventIds.has(e.id)&&!metaEventIds.has(e.id)&&!e.narrativeVariants?.length&&!FQ.resolveFixedQuestObjectiveIn([],{id:e.id})&&!e.id.includes('_ins_');
const STAGE=BUILTINS.find(m=>[`${m.manifest.id}\u0000x`,...m.scenario.events.map(e=>e.id)].every(id=>NV.storyChapterTitleIn(bare,m.manifest.id,id,PROBE)===PROBE)&&m.scenario.events.filter(freeEvent).length>=3);
const S=STAGE.manifest.id,[EV1,EV2,EV3]=STAGE.scenario.events.filter(freeEvent),[E1,E2,E3]=[EV1,EV2,EV3].map(e=>e.id);
const [A1,A2]=actionsOf(EV1);
const LOCS=(await read(join(root,'mod-kit/entity-catalog/locations.json'))).entries;const [LA,LB]=LOCS.map(e=>e.id);
const C1=NE.namedEntityEntries('character').map(e=>e.id).find(id=>NE.entityAliases('character',id).length);
const SCENE_HOOKS=new Set();for(const f of (await readdir(join(root,'src/modules/sceneModule/contracts'))).filter(f=>f.endsWith('.json')&&!f.startsWith('statuses')))SCENE_HOOKS.add((await read(join(root,'src/modules/sceneModule/contracts',f)))?.meta?.hook?.eventId);
const ALL_EVENTS=new Map([...BUILTINS,...CONTENT_PACKS.stages].flatMap(m=>m.scenario.events.map(e=>[e.id,{e,stage:m.manifest.id}])));
for(const o of CONTENT_PACKS.overlays)for(const e of o.events||[])if(!ALL_EVENTS.has(e.id))ALL_EVENTS.set(e.id,{e,stage:o.stageId});
const HOOK_EVENT=[...SCENE_HOOKS].find(id=>ALL_EVENTS.has(id));
const tsEndingIds=new Set([...Object.keys(EP.TS_ENDING_KEYS),...FE.TS_BATTLE_LOSS_ENDINGS.map(e=>e.endingId),...Object.keys(FE.TS_ENDING_PATH_TEXTS)]);
const ENDING=NE.namedEntityEntries('ending').map(e=>e.id).find(id=>!tsEndingIds.has(id)&&!(CONTENT_PACKS.endings||[]).some(x=>x.endingId===id));
assert.ok(E3&&A2&&LB&&C1&&HOOK_EVENT&&ENDING,'动态夹具挑不出来');
const TEXTS={'test.label':'到此改说','test.line':'我到了这里。','test.title':'合成章名','test.objective':'合成目标','test.path':'来路首句\n来路尾句'};
const withTexts=(m,texts=TEXTS)=>({...m,texts:['texts.json'],files:{...m.files,'texts.json':texts}});
const metaPack=(meta,extra={})=>({p:withTexts({id:'test.presentation',stageMeta:['meta.json'],files:{'meta.json':meta},...extra})});
const ev=(events,presentation={})=>[{stageId:S,presentation:{...presentation,events}}];

// —— 新段为空 ——
const DECLARED=new Set((await Promise.all((await readdir(PACK_DIR)).map(d=>read(join(PACK_DIR,d,'manifest.json')).catch(()=>({}))))).flatMap(m=>Object.keys(m)));
test('新段为空：catalog 有三个空段；读取方合并值等于 TS 表（同一对象或逐项相等）',async()=>{
 for(const [k,v] of Object.entries(emptyPresentationFormats())){assert.ok(k in CONTENT_PACKS,k);if(!DECLARED.has(k))assert.deepStrictEqual(CONTENT_PACKS[k],v,k);}
 const without={...CONTENT_PACKS};for(const k of Object.keys(emptyPresentationFormats()))delete without[k];
 for(const catalog of [without,{...CONTENT_PACKS,...emptyPresentationFormats()}]){
  const bd=await loadWithCatalog('src/modules/scenarioMods/branchDecision.ts',{...catalog,stageMeta:[]});assert.equal(bd.LOCKED_DECISIONS,bd.TS_LOCKED_DECISIONS);
  const ep=await loadWithCatalog('src/modules/scenarioMods/endingPresentation.ts',catalog);for(const id of [...tsEndingIds,ENDING])assert.equal(ep.endingKey({endingId:id,sourceEventId:''}),EP.TS_ENDING_KEYS[id]||'');
  const pe=await loadWithCatalog('src/modules/scenarioMods/persistentLineEntries.ts',catalog);
  for(const kind of ['algae','rejoin'])assert.equal(pe.TS_PERSISTENT_ENTRIES.find(x=>x.kind===kind).eventId,(kind==='algae'?pe.ALGAE_ENTRY:pe.REJOIN_ENTRY).eventId);
  if(!DECLARED.has('openWorldSlices')){const nh=await loadWithCatalog('src/modules/scenarioMods/travel/defs/qingyuNanhuang.ts',catalog);assert.equal(nh.QINGYU_NANHUANG_DEFINITION,nh.TS_NANHUANG_OPEN_WORLD_SLICE.definition);assert.deepStrictEqual(nh.NANHUANG_STAGE_IDS,NH.NANHUANG_STAGE_IDS);}
 }
 assert.deepStrictEqual(FE.mergeBattleLossEndings(FE.TS_BATTLE_LOSS_ENDINGS,[]),[...FE.TS_BATTLE_LOSS_ENDINGS]);assert.equal(FE.mergeEndingPathTexts(FE.TS_ENDING_PATH_TEXTS,[]),FE.TS_ENDING_PATH_TEXTS);
 assert.equal(EP.mergeEndingKeys(EP.TS_ENDING_KEYS,[]),EP.TS_ENDING_KEYS);assert.equal(BD.mergeLockedDecisions(BD.TS_LOCKED_DECISIONS,[]),BD.TS_LOCKED_DECISIONS);
 assert.deepStrictEqual(OW.stepSceneStagePrefixesIn([],OW.TS_STEP_SCENE_STAGE_PREFIXES),[...OW.TS_STEP_SCENE_STAGE_PREFIXES]);
});

// —— stageMeta 事件新字段 ——
const VARIANTS=[{when:[{path:'flags.test.f0b.first',operator:'eq',value:true}],priority:'before-event-variants',relatedFactionIds:[],name:'先改',note:'来源：合成'},
 {when:[{path:'flags.test.f0b.second',operator:'eq',value:'yes'}],replacesCanonRail:true,name:'补旧档',objective:'旧档目标',note:'来源：合成'}];
test('stageMeta 事件新字段正例：$text 解析、note 剥掉、模板留在 catalog；各读取方读得到（TS 在前／包在后、特判与优先级同原函数）',async()=>{
 const out=await compile(metaPack(ev({
  [E1]:{uiChapterTitle:{$text:'test.title'},lockedDecision:[[A1,'定'],[A2,'不定']],actionPresentation:[{actionId:A1,whenLocationId:LA,label:{$text:'test.label'},playerLine:{$text:'test.line'}}]},
  [E2]:{routeLocation:'合成途中·某处',compassObjectiveOnly:true,objective:`见{{entity:character:${C1}}}`},
  [E3]:{compatNarrativeVariants:VARIANTS,objective:{$text:'test.objective'}},
 })));
 const meta=out.stageMeta,e=meta[0].presentation.events;
 assert.equal(e[E1].uiChapterTitle,TEXTS['test.title']);assert.equal(e[E1].actionPresentation[0].label,TEXTS['test.label']);assert.equal(e[E3].objective,TEXTS['test.objective']);
 assert.equal(e[E2].objective,`见{{entity:character:${C1}}}`);assert.equal(e[E3].compatNarrativeVariants.some(v=>'note' in v),false);assert.equal(e[E3].compatNarrativeVariants[0].priority,'before-event-variants');
 // 章名：uiChapterTitle 直接给串；同关别的事件照旧回退
 assert.equal(NV.storyChapterTitleIn({...bare,stageMeta:meta},S,E1,'fb'),TEXTS['test.title']);assert.equal(NV.storyChapterTitleIn({...bare,stageMeta:meta},S,E2,'fb'),'fb');
 assert.equal(SM.stageMetaChapterTitle(meta,S,E1),TEXTS['test.title']);
 // 分支锁：TS 表在前、包在后
 const locks=BD.mergeLockedDecisions(BD.TS_LOCKED_DECISIONS,meta);assert.deepEqual(Object.keys(locks),[...Object.keys(BD.TS_LOCKED_DECISIONS),E1]);
 assert.throws(()=>BD.mergeLockedDecisions({[E1]:[[A1,'x']]},meta),/同时在 TS 表与内容包里/);
 const bd=await loadWithCatalog('src/modules/scenarioMods/branchDecision.ts',{...CONTENT_PACKS,stageMeta:meta});
 const opt=id=>({source:'event_engine',eventId:E1,actionId:id,label:id});
 assert.deepEqual(bd.detectBranchDecision([opt(A2),opt(A1)]).labels,['定','不定']);assert.equal(bd.detectBranchDecision([opt(A2)]),null);assert.equal(bd.isDormantLockedOption(opt(A2)),true);
 // 目标：模板运行时解析；{$text} 编译时已换正文
 assert.equal(FQ.resolveFixedQuestObjectiveIn(meta,{id:E2}),`见${NE.entityName('character',C1)}`);assert.equal(FQ.resolveFixedQuestObjectiveIn(meta,{id:E3}),TEXTS['test.objective']);
 await withProps(CONTENT_PACKS,{stageMeta:[...meta,...CONTENT_PACKS.stageMeta]},async()=>{
  // 地点：_ins_ 姿态拍取主线事件的；TS 表优先
  assert.equal(NV.storyRouteLocation(E2),'合成途中·某处');assert.equal(NV.storyRouteLocation(`${E2}_ins_test`),'合成途中·某处');assert.equal(NV.storyRouteLocation(E1),undefined);
  // 罗盘只显示目标
  const rt={canon:{locations:[{id:EV2.locationId,name:'某地'}],characters:[]}};
  assert.equal(NV.formatQuestCompass(EV2,rt,undefined),FQ.resolveFixedQuestObjective(EV2));
  // 按地点换动作展示
  const action={eventId:E1,actionId:A1,label:'原',playerLine:'原句'},at=id=>({角色:{位置:{locationId:id}}});
  assert.deepEqual(NV.storyActionPresentation(action,at(LA)),{...action,label:TEXTS['test.label'],playerLine:TEXTS['test.line']});
  assert.equal(NV.storyActionPresentation(action,at(LB)),action);assert.equal(NV.storyActionPresentation({...action,actionId:A2},at(LA)).label,'原');
  // 兼容变体：before-event-variants 先于事件自带变体、只改文案；其余只在事件没有 narrativeVariants 时补
  const own={...EV3,narrativeVariants:[{when:[{path:'flags.test.f0b.second',operator:'eq',value:'yes'}],name:'事件自带'}]};
  const f=(a,b)=>({test:{f0b:{first:a,second:b}}});
  assert.deepEqual(NV.resolveScenarioEventNarrative(own,f(true,'yes')),{...own,relatedFactionIds:[],name:'先改'});
  assert.equal(NV.resolveScenarioEventNarrative(own,f(false,'yes')).name,'事件自带');
  const old=NV.resolveScenarioEventNarrative(EV3,f(false,'yes'));assert.equal(old.name,'补旧档');assert.equal(old.objective,'旧档目标');assert.deepEqual(old.when,VARIANTS[1].when);
  assert.equal(NV.narrativeVariantReplacesCanonRail(EV3,f(false,'yes')),true);assert.equal(NV.narrativeVariantReplacesCanonRail(EV3,f(true,'no')),false,'before-event-variants 不参与');
  assert.equal(NV.narrativeVariantReplacesCanonRail(own,f(false,'yes')),false,'事件自带变体时不看兼容层');
  // TS 表有就不看包（同一事件）
  await withAdded(NV.TS_STORY_ROUTE_LOCATIONS,{[E2]:'TS 地点'},()=>assert.equal(NV.storyRouteLocation(E2),'TS 地点'));
 });
});

test('stageMeta 关级 uiChapterByRouteLocation：保留回退的事件 → 规则（第一条命中，读 routeLocation，_ins_ 同主线）→ defaultTitle → fallback',async()=>{
 const rule={keepFallbackEventIds:[E3],rules:[{routeLocationIncludes:'甲',title:{$text:'test.title'}},{routeLocationIncludes:'乙',title:'乙段'}],defaultTitle:'默认段'};
 const out=await compile(metaPack(ev({[E1]:{routeLocation:'甲乙之间'},[E2]:{routeLocation:'只有乙'}},{uiChapterByRouteLocation:rule})));
 const packs={...bare,stageMeta:out.stageMeta},t=id=>NV.storyChapterTitleIn(packs,S,id,'fb');
 assert.deepEqual([t(E1),t(`${E1}_ins_x`),t(E2),t(E3),t('test.event.elsewhere')],[TEXTS['test.title'],TEXTS['test.title'],'乙段','fb','默认段']);
 assert.equal(SM.stageMetaRouteChapterTitle(out.stageMeta,'test.stage.none',E1,'甲','fb'),undefined);
 const noDefault=await compile(metaPack(ev({[E1]:{routeLocation:'甲'}},{uiChapterByRouteLocation:{rules:[{routeLocationIncludes:'甲',title:'甲段'}]}})));
 assert.equal(NV.storyChapterTitleIn({...bare,stageMeta:noDefault.stageMeta},S,E2,'fb'),'fb');
});

test('stageMeta 新字段反例：写法、互斥、动作与地点存在、note 必填、优先级取值、与 TS 表重复、被 TS 章名特判遮住',async()=>{
 const bad=(events,re,presentation)=>rejects(metaPack(ev(events,presentation)),re);
 await bad({[E1]:{uiChapterTitle:''}},/empty uiChapterTitle/);
 const chapterId=STAGE.scenario.chapters?.[0]?.id;if(chapterId)await bad({[E1]:{uiChapterTitle:'x',uiChapterId:chapterId}},/uiChapterTitle and uiChapterId are exclusive/);
 await bad({[E1]:{routeLocation:'   '}},/empty routeLocation/);
 await bad({[E1]:{compassObjectiveOnly:false}},/compassObjectiveOnly only accepts true/);
 await bad({[E1]:{lockedDecision:[[A1,'定'],[A1,'又']]}},/lockedDecision must be/);
 await bad({[E1]:{lockedDecision:[[A1]]}},/lockedDecision must be/);
 await bad({[E1]:{lockedDecision:[[A1,'定'],['test_no_action','x']]}},/lockedDecision action test_no_action is not an action or fatal choice/);
 const fatal=[...ALL_EVENTS.values()].find(({e})=>e.fatalOutcomes?.choices?.length&&ALL_EVENTS.get(e.id).stage===S);
 if(fatal)await bad({[fatal.e.id]:{lockedDecision:[[fatal.e.fatalOutcomes.choices[0].id,'x']]}},/first \(deciding\) action/);
 await bad({[E1]:{actionPresentation:[{actionId:A1,whenLocationId:LA,label:'a'}]}},/invalid actionPresentation/);
 await bad({[E1]:{actionPresentation:[{actionId:'test_no_action',whenLocationId:LA,label:'a',playerLine:'b'}]}},/actionPresentation action test_no_action is not a contract action/);
 await bad({[E1]:{actionPresentation:[{actionId:A1,whenLocationId:'test.location.none',label:'a',playerLine:'b'}]}},/not in locations\.json/);
 await bad({[E1]:{compatNarrativeVariants:[{...VARIANTS[1],note:undefined}]}},/note is required/);
 await bad({[E1]:{compatNarrativeVariants:[{...VARIANTS[1],priority:'first'}]}},/priority only accepts "before-event-variants"/);
 await bad({[E1]:{compatNarrativeVariants:[{...VARIANTS[0],replacesCanonRail:true}]}},/never replace the canon rail/);
 await bad({[E1]:{compatNarrativeVariants:[{when:VARIANTS[0].when,note:'x'}]}},/rewrites nothing/);
 await bad({[E1]:{compatNarrativeVariants:[{...VARIANTS[1],when:[{path:'flags.x',operator:'gt',value:1}]}]}},/invalid fields/);
 await bad({[E1]:{objective:'见{{entity:character:test.character.nobody}}'}},/stageMeta objective entity .*unknown character/);
 await bad({[E1]:{routeLocation:'x'}},/uiChapterByRouteLocation never applies when defaultUiChapterId is set/,{defaultUiChapterId:STAGE.scenario.chapters?.[0]?.id??'x',uiChapterByRouteLocation:{rules:[{routeLocationIncludes:'x',title:'y'}]}});
 await bad({},/invalid uiChapterByRouteLocation/,{uiChapterByRouteLocation:{rules:[]}});
 await bad({},/uiChapterByRouteLocation: test\.event\.none is not an event/,{uiChapterByRouteLocation:{keepFallbackEventIds:['test.event.none'],rules:[{routeLocationIncludes:'x',title:'y'}]}});
 // 与 TS 表重复（合成的临时 TS 条目）
 await withAdded(BD.TS_LOCKED_DECISIONS,{[E1]:[[A1,'x']]},()=>bad({[E1]:{lockedDecision:[[A1,'定']]}},/also in branchDecision\.ts TS_LOCKED_DECISIONS/));
 await withAdded(NV.TS_STORY_ROUTE_LOCATIONS,{[E1]:'x'},()=>bad({[E1]:{routeLocation:'y'}},/also in eventNarrativeView\.ts TS_STORY_ROUTE_LOCATIONS/));
 await withSet(NV.TS_COMPASS_OBJECTIVE_ONLY_EVENT_IDS,[...NV.TS_COMPASS_OBJECTIVE_ONLY_EVENT_IDS,E1],()=>bad({[E1]:{compassObjectiveOnly:true}},/also in eventNarrativeView\.ts TS_COMPASS_OBJECTIVE_ONLY_EVENT_IDS/));
 await withArray(NV.TS_STORY_ACTION_PRESENTATIONS,[...NV.TS_STORY_ACTION_PRESENTATIONS,{eventId:E1,actionId:A2,whenLocationId:LB,labelTextId:'x',playerLineTextId:'x'}],()=>bad({[E1]:{actionPresentation:[{actionId:A1,whenLocationId:LA,label:'a',playerLine:'b'}]}},/also in eventNarrativeView\.ts TS_STORY_ACTION_PRESENTATIONS/));
 await withAdded(NV.TS_COMPAT_NARRATIVE_VARIANTS,{[E1]:[VARIANTS[1]]},()=>bad({[E1]:{compatNarrativeVariants:[VARIANTS[1]]}},/also in eventNarrativeView\.ts TS_COMPAT_NARRATIVE_VARIANTS/));
 // 被 TS 章名特判遮住（临时替换模块导出的 storyChapterTitleIn，编译器与本文件共用同一模块对象）
 const orig=NV.storyChapterTitleIn;
 await withProps(NV,{storyChapterTitleIn:(p,m,e,fb)=>m===S&&e===E1?'TS 特判':orig(p,m,e,fb)},()=>bad({[E1]:{uiChapterTitle:'x'}},new RegExp(`chapter title for ${reEsc(E1)} is already decided in eventNarrativeView\\.ts`)));
 await withProps(NV,{storyChapterTitleIn:(p,m,e,fb)=>m===S&&e?'TS 整关算法':orig(p,m,e,fb)},()=>bad({},/uiChapterByRouteLocation is shadowed by eventNarrativeView\.ts/,{uiChapterByRouteLocation:{rules:[{routeLocationIncludes:'x',title:'y'}]}}));
 await withProps(FQ,{resolveFixedQuestObjectiveIn:(m,e)=>e?.id===E1?'TS 目标':''},()=>bad({[E1]:{objective:'x'}},/objective for .* already set in fixedQuestObjectives\.ts/));
});

// —— texts 通配键 ——
test('texts 通配键：actionDisplay.<e>.*.line/label 对任何动作生效、逐动作键优先；scopedPlayerLine.<e>::<a> 补 TS 表；反例与 TS 重叠',async()=>{
 const keys={[`actionDisplay.${E1}.*.line`]:'通配句',[`actionDisplay.${E1}.*.label`]:'通配名',[`actionDisplay.${E1}.${A1}.line`]:'逐动作句',[`actionDisplay.${E1}.${A1}.label`]:'逐动作名',[`scopedPlayerLine.${E2}::${actionsOf(EV2)[0]}`]:'我先这样做。'};
 const out=await compile({p:withTexts({id:'test.texts'},keys)});
 await withProps(CONTENT_PACKS,{texts:{...CONTENT_PACKS.texts,...out.texts}},()=>{
  assert.deepEqual(PA.playerActionDisplayOverride(E1,A1),{line:'逐动作句',label:'逐动作名'});
  assert.deepEqual(PA.playerActionDisplayOverride(E1,A2),{line:'通配句',label:'通配名'});assert.deepEqual(PA.playerActionDisplayOverride(E1,'test_any'),{line:'通配句',label:'通配名'});
  assert.equal(PA.playerActionDisplayOverride(E2,A1),undefined);
  assert.equal(PA.lookupScopedPlayerLine(E2,actionsOf(EV2)[0]),'我先这样做。');assert.equal(PA.lookupScopedPlayerLine(E2,'test_any'),undefined);
 });
 // TS 表：逐动作在前、事件级在后，返回新对象
 await withAdded(PA.TS_ACTION_DISPLAY_OVERRIDES,{[`${E3}::*`]:{line:'TS 通配',label:'TS 名'}},()=>{const a=PA.playerActionDisplayOverride(E3,'x');assert.deepEqual(a,{line:'TS 通配',label:'TS 名'});assert.notEqual(a,PA.TS_ACTION_DISPLAY_OVERRIDES[`${E3}::*`]);});
 const bad=(t,re)=>rejects({p:withTexts({id:'test.texts'},t)},re);
 await bad({[`actionDisplay.${E1}.*.line`]:'x'},/missing its pair/);
 await bad({'actionDisplay.test.event.none.*.line':'x','actionDisplay.test.event.none.*.label':'y'},/unknown event test\.event\.none/);
 await bad({[`actionDisplay.${E1}.test_no_action.line`]:'x',[`actionDisplay.${E1}.test_no_action.label`]:'y'},/test_no_action is not an action of/);
 await bad({'actionDisplay.x':'y'},/expected actionDisplay\.<eventId>/);
 await bad({[`scopedPlayerLine.${E1}::test_no_action`]:'x'},/test_no_action is not an action of/);
 await bad({[`scopedPlayerLine.${E1}`]:'x'},/expected scopedPlayerLine\.<eventId>::<actionId>/);
 const pair=(e,a)=>({[`actionDisplay.${e}.${a}.line`]:'x',[`actionDisplay.${e}.${a}.label`]:'y'});
 await withAdded(PA.TS_PLAYER_LINES,{[`${E1}::${A1}`]:'TS'},()=>bad({[`scopedPlayerLine.${E1}::${A1}`]:'x'},/also in playerActionPresentation\.ts TS_PLAYER_LINES/));
 await withAdded(PA.TS_ACTION_DISPLAY_OVERRIDES,{[`${E1}::${A1}`]:{line:'a',label:'b'}},async()=>{await bad(pair(E1,A1),/overlaps playerActionPresentation\.ts TS_ACTION_DISPLAY_OVERRIDES/);await bad(pair(E1,'*'),/overlaps/);assert.ok(await compile({p:withTexts({id:'test.texts'},pair(E1,A2))}));});
 await withAdded(PA.TS_ACTION_DISPLAY_OVERRIDES,{[`${E1}::*`]:{line:'a',label:'b'}},()=>bad(pair(E1,A2),/overlaps/));
});

// —— endings ——
test('endings：key／battleLoss／pathText 三种可分可合；TS 在前、包在后；读取方（endingKey、BATTLE_LOSS_ENDINGS、fixedEndingNarrative）读合并值；反例',async()=>{
 const battle={title:'合成败局',kind:'death',sourceEventId:HOOK_EVENT,tierFlag:'test.encounter.f0b.tier',tier:'lose',facts:['一','二']};
 const ending={endingId:ENDING,key:'E99',battleLoss:battle,pathText:{sourceEventId:E1,textKey:'test.path'},note:'作者备注'};
 const out=await compile({p:withTexts({id:'test.endings',endings:['e.json'],files:{'e.json':[ending]}},{...TEXTS,[ENDING]:'通用结局正文'})});
 assert.deepStrictEqual(out.endings,[{endingId:ENDING,key:'E99',battleLoss:battle,pathText:{sourceEventId:E1,textKey:'test.path'}}]);
 assert.deepEqual(Object.keys(EP.mergeEndingKeys(EP.TS_ENDING_KEYS,out.endings)).at(-1),ENDING);
 assert.deepEqual(FE.mergeBattleLossEndings(FE.TS_BATTLE_LOSS_ENDINGS,out.endings).at(-1),{endingId:ENDING,...battle});
 assert.throws(()=>EP.mergeEndingKeys({[ENDING]:'E1'},out.endings),/同时在 TS 表与内容包里/);assert.throws(()=>FE.mergeBattleLossEndings([{endingId:ENDING}],out.endings),/同时在 TS 表与内容包里/);
 const cat={...CONTENT_PACKS,endings:out.endings,texts:{...CONTENT_PACKS.texts,...out.texts}};
 const ep=await loadWithCatalog('src/modules/scenarioMods/endingPresentation.ts',cat);assert.equal(ep.endingKey({endingId:ENDING,sourceEventId:'x'}),'E99');
 const fe=await loadWithCatalog('src/modules/scenarioMods/fixedEndingNarratives.ts',cat);
 assert.deepEqual(fe.BATTLE_LOSS_ENDINGS.map(e=>e.endingId),[...FE.TS_BATTLE_LOSS_ENDINGS.map(e=>e.endingId),ENDING]);assert.ok('presentation' in fe.BATTLE_LOSS_ENDINGS.at(-1));
 assert.equal(fe.fixedEndingNarrative({endingId:ENDING,sourceEventId:E1}),'来路首句\n通用结局正文\n来路尾句');assert.equal(fe.fixedEndingNarrative({endingId:ENDING,sourceEventId:E2}),'通用结局正文');
 const bad=(x,re,texts=TEXTS)=>rejects({p:withTexts({id:'test.endings',endings:['e.json'],files:{'e.json':x}},texts)},re);
 await bad({endingId:ENDING,key:'E9'},/test\.endings\.endings: expected array/);
 await bad([{endingId:ENDING}],/declares nothing/);
 await bad([{endingId:'test.ending.none',key:'E9'}],/unknown ending entity/);
 await bad([{endingId:ENDING,key:'E9'},{endingId:ENDING,key:'E8'}],/appears twice/);
 const other=NE.namedEntityEntries('ending').map(e=>e.id).find(id=>id!==ENDING);
 await bad([{endingId:ENDING,key:'E9'},{endingId:other,key:'E9'}],/key E9 already used/);
 await bad([{endingId:ENDING,battleLoss:{...battle,kind:'win'}}],/invalid battleLoss/);
 await bad([{endingId:ENDING,battleLoss:{...battle,tierFlag:'x.flag'}}],/invalid battleLoss/);
 await bad([{endingId:ENDING,battleLoss:{...battle,sourceEventId:E1}}],/no scene contract hooks/);
 await bad([{endingId:ENDING,pathText:{sourceEventId:E1,textKey:'test.missing'}}],/pathText text test\.missing unknown/);
 await bad([{endingId:ENDING,pathText:{sourceEventId:'test.event.none',textKey:'test.path'}}],/pathText source event test\.event\.none unknown/);
 await withAdded(EP.TS_ENDING_KEYS,{[ENDING]:'E77'},()=>bad([{endingId:ENDING,key:'E99'}],/key also in endingPresentation\.ts TS_ENDING_KEYS/));
 await bad([{endingId:ENDING,key:Object.values(EP.TS_ENDING_KEYS)[0]??'E01'}],Object.keys(EP.TS_ENDING_KEYS).length?/key also in endingPresentation\.ts TS_ENDING_KEYS/:/./);
 await withArray(FE.TS_BATTLE_LOSS_ENDINGS,[...FE.TS_BATTLE_LOSS_ENDINGS,{endingId:ENDING}],()=>bad([{endingId:ENDING,battleLoss:battle}],/battleLoss also in fixedEndingNarratives\.ts TS_BATTLE_LOSS_ENDINGS/));
 await withAdded(FE.TS_ENDING_PATH_TEXTS,{[ENDING]:{sourceEventId:E1,textKey:'x'}},()=>bad([{endingId:ENDING,pathText:{sourceEventId:E1,textKey:'test.path'}}],/pathText also in fixedEndingNarratives\.ts TS_ENDING_PATH_TEXTS/));
});

// —— openWorldSlices ——
const freeStageEvent=STAGE.scenario.events[0].id;
const slice=(patch={},def={})=>({key:'test_slice',note:'备注',definition:{id:'test.travel.slice',initialZoneId:'test.z.a',zones:[{id:'test.z.a',name:'甲地',worldLocationId:LA,areaId:'test.area'},{id:'test.z.b',name:'乙地',parentZoneId:'test.z.a',heardWhen:[E1]}],
 routes:[{id:'test.r.ab',fromZoneId:'test.z.a',toZoneId:'test.z.b',label:'去乙',turnCost:1,kind:'journey',dayCost:'several',forcedBy:{afterEventDone:`${E1}::${A1}`}},{id:'test.r.ba',fromZoneId:'test.z.b',toZoneId:'test.z.a',label:'回甲',turnCost:1,requirementKey:'test.key',forcedBy:{stageTransition:`${S}→${S}`}}],
 notices:[{id:'test.n',source:'木牌',reliability:'rumor',text:'有路',atZoneId:'test.z.a',unlockRouteIds:['test.r.ba'],unlockRequirementKeys:['test.key']}],actors:[{id:'test.actor',name:'某人',initialZoneId:'test.z.b',desire:'想',initialStatus:'在'}],
 problems:[{id:'test.p',atZoneId:'test.z.a',title:'难题',objective:'解',initialState:'s0',actionIds:['test.act']}],
 actions:[{id:'test.act',problemId:'test.p',label:'做',actionText:'我做。',aliases:['做'],availableInStates:['s0'],outcome:'partial',nextProblemState:'s1',settledFacts:['做了'],consequences:[{id:'c',delayTurns:2,cause:'因',effect:'果',actorId:'test.actor',apply:{problemId:'test.p',problemState:'s2'}}]}],
 areas:[{id:'test.area',name:'甲区',freeRoamWhen:{after:[E1],until:[E2]}}],...def},
 stageIds:[S],stepSceneStagePrefixes:[S],positionNodes:{segment:'甲地',placeLocationId:LA,nodes:[{zoneId:'test.z.b',names:['乙地']}]},constants:{TEST_ZONE_ID:'test.z.a'},zoneRanks:{'test.z.b':1},actionJudgement:{'test.act':{kind:'social'}},actionDescribe:{'test.act':'描述'},...patch});
const slicePack=(x,extra={})=>({p:{id:'test.slices',openWorldSlices:['s.json'],files:{'s.json':x},...extra}});
test('openWorldSlices：原样存定义与附带表；resolveOpenWorldSlice 二选一；逐拍演出前缀 TS 在前、包在后（编译器 guardCovers 同口径）',async()=>{
 const out=await compile(slicePack([slice()]));
 const {note,...expected}=slice();assert.deepStrictEqual(out.openWorldSlices,[expected]);
 assert.equal(OW.resolveOpenWorldSlice(out.openWorldSlices,{key:'test_slice'}),out.openWorldSlices[0]);
 assert.throws(()=>OW.resolveOpenWorldSlice(out.openWorldSlices,{key:'test_slice',stageIds:[S]}),/同时在内容包与 TS 里定义/);
 assert.throws(()=>OW.resolveOpenWorldSlice([],{key:'test_slice'}),/缺少行旅切片 test_slice/);
 const ts={key:'test_slice',stageIds:[S]};assert.equal(OW.resolveOpenWorldSlice([],ts),ts);
 assert.deepEqual(OW.stepSceneStagePrefixesIn(out.openWorldSlices,['test.ts.prefix']),['test.ts.prefix',S]);
 assert.equal(OW.isStepSceneStageIn([S],`${S}_x`),true);assert.equal(OW.isStepSceneStageIn([S],undefined),false);
 // 运行时：TS 导出按 key 取包（TS 那份只留 key 时）；逐拍演出关并上包前缀
 const ss=await loadWithCatalog('src/modules/scenarioMods/travel/stepScene.ts',{...CONTENT_PACKS,openWorldSlices:out.openWorldSlices});
 assert.equal(ss.isStepSceneStage(S),true);assert.equal(ss.isStepSceneStage(OW.TS_STEP_SCENE_STAGE_PREFIXES[0]??S),true);assert.equal(SS.isStepSceneStage(S),OW.isStepSceneStageIn(OW.TS_STEP_SCENE_STAGE_PREFIXES,S));
});

test('openWorldSlices 反例：形状、唯一性、区／路线／告示／问题引用、事件与地点存在、requirementKey 有人解锁、附带表、与 TS 重复',async()=>{
 const bad=(x,re)=>rejects(slicePack(x),re);
 await bad(slice(),/test\.slices\.openWorldSlices: expected array/);
 await bad([slice({extra:1})],/openWorldSlices test_slice: invalid fields/);
 await bad([slice(),slice({definition:{...slice().definition,id:'test.other'}})],/key appears twice/);
 await bad([slice(),slice({key:'test_b'})],/definition id test\.travel\.slice appears twice/);
 await bad([slice({},{notices:undefined})],/definition must have/);
 await bad([slice({},{zones:[...slice().definition.zones,{id:'test.z.a',name:'重'}]})],/zone ids missing or duplicate/);
 await bad([slice({},{initialZoneId:'test.z.none'})],/initialZoneId: unknown zone test\.z\.none/);
 await bad([slice({},{zones:[{id:'test.z.a',name:'甲',parentZoneId:'test.z.b'},{id:'test.z.b',name:'乙',parentZoneId:'test.z.a'}]})],/zone parent cycle/);
 await bad([slice({},{zones:[{id:'test.z.a',name:'甲',worldLocationId:'test.location.none'},{id:'test.z.b',name:'乙'}]})],/worldLocationId test\.location\.none not in locations\.json/);
 await bad([slice({},{zones:[{id:'test.z.a',name:'甲',heardWhen:['test.event.none']},{id:'test.z.b',name:'乙'}]})],/unknown event test\.event\.none/);
 await bad([slice({},{routes:[{...slice().definition.routes[0],forcedBy:{afterEventDone:`${E1}::test_no_action`}}]})],/unknown event action/);
 await bad([slice({},{routes:[{...slice().definition.routes[0],forcedBy:{stageTransition:`${S}→test.stage.none`}}]})],/stageTransition must be/);
 await bad([slice({},{routes:[{...slice().definition.routes[0],toZoneId:'test.z.none'}]})],/toZoneId: unknown zone/);
 await bad([slice({},{notices:[]})],/requirementKey test\.key is never unlocked/);
 await bad([slice({},{problems:[{...slice().definition.problems[0],actionIds:['test.none']}]})],/unknown action test\.none/);
 await bad([slice({},{actions:[{...slice().definition.actions[0],outcome:'win'}]})],/action test\.act: invalid fields/);
 await bad([slice({},{areas:[{id:'test.area',name:'区',freeRoamWhen:{after:['test.event.none']}}]})],/unknown event test\.event\.none/);
 await bad([slice({stageIds:['test.stage.none']})],/unknown stage test\.stage\.none/);
 await bad([slice({stepSceneStagePrefixes:['test.none.']})],/matches no stage/);
 await bad([slice({positionNodes:{segment:'x',placeLocationId:'test.location.none'}})],/positionNodes\.placeLocationId/);
 await bad([slice({constants:{lower:'x'}})],/constants must map UPPER_CASE names/);
 await bad([slice({zoneRanks:{'test.z.none':1}})],/zoneRanks: unknown zone/);
 await bad([slice({actionJudgement:{'test.act':{kind:'dance'}}})],/actionJudgement must map/);
 await bad([slice({actionDescribe:{'test.none':'x'}})],/actionDescribe: unknown action/);
 // 与 TS 重复：同 key、同 definition.id、同逐拍演出前缀
 const tsKey=NH.TS_NANHUANG_OPEN_WORLD_SLICE.key,tsDefId=NH.TS_NANHUANG_OPEN_WORLD_SLICE.definition?.id;
 if(OW.tsOpenWorldSliceHasData(NH.TS_NANHUANG_OPEN_WORLD_SLICE)){await bad([slice({key:tsKey})],/also defined in TS/);await bad([slice({},{id:tsDefId})],/also defined in TS/);}
 const tsPrefix=OW.TS_STEP_SCENE_STAGE_PREFIXES[0];if(tsPrefix)await bad([slice({stepSceneStagePrefixes:[tsPrefix]})],/also in TS_STEP_SCENE_STAGE_PREFIXES/);
 await withArray(OW.TS_STEP_SCENE_STAGE_PREFIXES,[S],()=>bad([slice()],/also in TS_STEP_SCENE_STAGE_PREFIXES/));
});

// —— persistentEntries（编译期的引用检查；有效条目的正例与与 TS 重复在搬迁演练里走真实包目录，因为要用到已有的线拍 id）——
test('persistentEntries：合并取用（TS 在前、每种一条）与编译反例',async()=>{
 const a={kind:'algae',beatId:'b',eventId:'e',stageId:'s'};
 assert.equal(PE.persistentEntryIn([a],'algae'),a);assert.throws(()=>PE.persistentEntryIn([a,a],'algae'),/同时在内容包与 TS 里定义/);assert.throws(()=>PE.persistentEntryIn([a],'rejoin'),/缺少常驻入口 rejoin/);
 const bad=(x,re)=>rejects({p:{id:'test.entries',persistentEntries:['p.json'],files:{'p.json':x}}},re);
 await bad({kind:'rejoin'},/expected array/);
 await bad([{kind:'teleport'}],/kind must be algae or rejoin/);
 await bad([{kind:'rejoin',beatId:'x',eventId:E1}],/persistentEntries rejoin: invalid fields/);
 await bad([{kind:'rejoin',beatId:'x',eventId:E1,stageId:'test.stage.none'}],/unknown stage test\.stage\.none/);
 await bad([{kind:'rejoin',beatId:'x',eventId:'test.event.none',stageId:S}],/is not an event of/);
 await bad([{kind:'rejoin',beatId:'test.beat.none',eventId:E1,stageId:S}],/unknown quest-line beat test\.beat\.none/);
 await bad([{kind:'rejoin',beatId:'x',eventId:E1,stageId:S},{kind:'rejoin',beatId:'x',eventId:E1,stageId:S}],/declared twice/);
 await bad([{kind:'algae',beatId:'x',eventId:E1,stageId:S,locationId:LA,characterId:C1,itemId:'x',receiptId:'x'}],/invalid fields/);
});

// —— 归属 ——
test('归属检查扫得到新段与两种 texts 键：引用包内关的事件要 dependsOn；切片 key 只能一个包定义',async()=>{
 const a={id:'test.a',texts:['texts.json'],files:{'texts.json':await read(join(qinDir,'qin-texts.json'))}};
 const qinStage=await read(join(qinDir,'stage-qin-xianyang.json'));const QE=qinStage.scenario.events.find(e=>actionsOf(e).length)||qinStage.scenario.events[0];
 const b={id:'test.b',dependsOn:['test.a'],stages:['stage.json'],files:{'stage.json':qinStage}};
 const owned=/test\.c references \S+ owned by test\.b; add dependsOn/;
 const c=(kind,value,deps)=>({id:'test.c',[kind]:['f.json'],files:{'f.json':value},...(deps?{dependsOn:['test.b']}:{})});
 await rejects({a,b,c:c('openWorldSlices',[slice({},{zones:[{id:'test.z.a',name:'甲',heardWhen:[QE.id]},{id:'test.z.b',name:'乙'}]})])},owned);
 await rejects({a,b,c:c('endings',[{endingId:ENDING,pathText:{sourceEventId:QE.id,textKey:Object.keys(await read(join(qinDir,'qin-texts.json')))[0]}}])},owned);
 const qa=actionsOf(QE)[0];
 if(qa){await rejects({a,b,c:{id:'test.c',texts:['t.json'],files:{'t.json':{[`scopedPlayerLine.${QE.id}::${qa}`]:'x'}}}},owned);
  assert.ok(await compile({a,b,c:{id:'test.c',dependsOn:['test.b'],texts:['t.json'],files:{'t.json':{[`actionDisplay.${QE.id}.*.line`]:'x',[`actionDisplay.${QE.id}.*.label`]:'y'}}}}));}
 await rejects({x:{id:'test.x',openWorldSlices:['s.json'],files:{'s.json':[slice()]}},y:{id:'test.y',openWorldSlices:['s.json'],files:{'s.json':[slice({definition:{...slice().definition,id:'test.other'}})]}}},/openWorldSlice id test_slice defined by both test\.x and test\.y/);
});

// —— 搬迁演练 ——
const NV_SRC=await readFile(join(root,'src/modules/scenarioMods/eventNarrativeView.ts'),'utf8'),FQ_SRC=await readFile(join(root,'src/modules/scenarioMods/fixedQuestObjectives.ts'),'utf8');
const quoted=s=>[...s.matchAll(/'([^']+)'/g)].map(m=>m[1]);
/** 章名的两处代码特判（逐事件章名串、整关按地点分段）按源码解析成 stageMeta 片段；特判删掉后解析出 0 条。 */
function chapterSpecials(){
 const events=[],stages=[];
 for(const m of NV_SRC.matchAll(/if \(modId === '([^']+)' && eventId\) return \(\{([\s\S]*?)\} as Record<string, string>\)\[eventId\] \|\| fallback;/g))
  for(const x of m[2].matchAll(/'([^']+)': '([^']+)'/g))events.push({stageId:m[1],eventId:x[1],uiChapterTitle:x[2]});
 for(const m of NV_SRC.matchAll(/if \(modId === '([^']+)' && eventId\) \{\n([\s\S]*?)\n  \}/g))
  for(const line of m[2].split('\n')){const one=line.match(/if \(eventId === '([^']+)'\) return '([^']+)';/),many=line.match(/if \(\[([^\]]*)\]\.includes\(eventId\)\) return '([^']+)';/);
   if(one)events.push({stageId:m[1],eventId:one[1],uiChapterTitle:one[2]});else if(many)for(const id of quoted(many[1]))events.push({stageId:m[1],eventId:id,uiChapterTitle:many[2]});else assert.fail(`章名特判写法超出解析：${line}`);}
 const r=NV_SRC.match(/if \(modId !== '([^']+)' \|\| !eventId\) return fallback;\n  if \(\[([^\]]*)\]\.includes\(eventId\)\) return fallback;\n  return storyRouteLocation\(eventId\)\?\.includes\('([^']+)'\) \? '([^']+)' : '([^']+)';/);
 if(r)stages.push({stageId:r[1],uiChapterByRouteLocation:{keepFallbackEventIds:quoted(r[2]),rules:[{routeLocationIncludes:r[3],title:r[4]}],defaultTitle:r[5]}});
 return {events,stages};
}
/** 目标：三处代码特判与 FIXED_QUEST_OBJECTIVE_OVERRIDES（entityText 模板按源码取原文）。 */
function objectiveSpecials(){
 const out=[];
 for(const m of FQ_SRC.matchAll(/if \(eventId === '([^']+)'\) return packText\('([^']+)'\);/g))out.push({eventId:m[1],objective:{$text:m[2]}});
 for(const m of FQ_SRC.matchAll(/if \(eventId === '([^']+)'\) return '([^']+)';/g))out.push({eventId:m[1],objective:m[2]});
 const table=FQ_SRC.match(/FIXED_QUEST_OBJECTIVE_OVERRIDES[^=]*= Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1]||'';
 for(const m of table.matchAll(/'([^']+)': (?:entityText\("([^"]+)"\)|'([^']+)'),/g))out.push({eventId:m[1],objective:m[2]??m[3]});
 assert.equal(out.length-[...FQ_SRC.matchAll(/if \(eventId === '/g)].length,Object.keys(FQ.FIXED_QUEST_OBJECTIVE_OVERRIDES).length,'目标特判／覆盖表写法超出解析');
 return out;
}
/** 删掉章名特判后的 eventNarrativeView（演练里当「TS 已搬空」的版本）：按结构锚点删，不写剧情 id。 */
const stripChapterSpecials=s=>s.replace(/(  if \(hookTitle\) return hookTitle;\n)[\s\S]*?(  \/\/ 内容包关：事件写了 presentation\.uiChapterId)/,'$1$2')
 .replace(/  if \(modId !== '[^']+' \|\| !eventId\) return fallback;\n[\s\S]*?\n  return storyRouteLocation\(eventId\)[^\n]*\n/,'  return fallback;\n');

test('搬迁演练：展示类 TS 表与两处代码特判都能逐项无损写进包（真实包目录副本），临时搬空 TS 后编译通过，读取结果与现在逐项相同',async()=>{
 const before={locks:{...BD.LOCKED_DECISIONS},endingKeys:{...EP.TS_ENDING_KEYS},battle:structuredClone(FE.TS_BATTLE_LOSS_ENDINGS),paths:{...FE.TS_ENDING_PATH_TEXTS},prefixes:[...OW.TS_STEP_SCENE_STAGE_PREFIXES],entries:structuredClone(PE.TS_PERSISTENT_ENTRIES),
  nanhuang:structuredClone(NH.TS_NANHUANG_OPEN_WORLD_SLICE),wuyuanZones:structuredClone(WZ.TS_WUYUAN_ZONE_PART),wuyuan:structuredClone(WO.TS_WUYUAN_OPEN_WORLD_SLICE)};
 // 1. 转写：事件级字段按事件所在关归到 stageMeta；关级字段同理
 const add=new Map();const at=(stageId,eventId)=>{if(!add.has(stageId))add.set(stageId,{events:{},presentation:{}});const s=add.get(stageId);return eventId?(s.events[eventId]||={}):s.presentation;};
 const stageOf=id=>{const x=ALL_EVENTS.get(id);assert.ok(x,`找不到事件 ${id} 所在的关`);return x.stage;};
 for(const [id,d] of Object.entries(BD.TS_LOCKED_DECISIONS))at(stageOf(id),id).lockedDecision=structuredClone(d);
 for(const [id,loc] of Object.entries(NV.TS_STORY_ROUTE_LOCATIONS))at(stageOf(id),id).routeLocation=loc;
 for(const id of NV.TS_COMPASS_OBJECTIVE_ONLY_EVENT_IDS)at(stageOf(id),id).compassObjectiveOnly=true;
 for(const p of NV.TS_STORY_ACTION_PRESENTATIONS)(at(stageOf(p.eventId),p.eventId).actionPresentation||=[]).push({actionId:p.actionId,whenLocationId:p.whenLocationId,label:{$text:p.labelTextId},playerLine:{$text:p.playerLineTextId}});
 for(const [id,v] of Object.entries(NV.TS_COMPAT_NARRATIVE_VARIANTS))at(stageOf(id),id).compatNarrativeVariants=v.map(x=>({...structuredClone(x),note:'搬迁演练'}));
 const chapters=chapterSpecials();for(const x of chapters.events)at(x.stageId,x.eventId).uiChapterTitle=x.uiChapterTitle;for(const x of chapters.stages)at(x.stageId).uiChapterByRouteLocation=x.uiChapterByRouteLocation;
 const objectives=objectiveSpecials();for(const x of objectives)at(stageOf(x.eventId),x.eventId).objective=x.objective;
 const texts={...Object.fromEntries(Object.entries(PA.TS_PLAYER_LINES).map(([k,v])=>[`scopedPlayerLine.${k}`,v])),
  ...Object.fromEntries(Object.entries(PA.TS_ACTION_DISPLAY_OVERRIDES).flatMap(([k,v])=>{const [e,a]=k.split('::');return [[`actionDisplay.${e}.${a}.line`,v.line],[`actionDisplay.${e}.${a}.label`,v.label]];}))};
 const endings=new Map();const ending=id=>endings.get(id)||endings.set(id,{endingId:id}).get(id);
 for(const [id,key] of Object.entries(EP.TS_ENDING_KEYS))ending(id).key=key;
 for(const {endingId,...b} of FE.TS_BATTLE_LOSS_ENDINGS)ending(endingId).battleLoss=structuredClone(b);
 for(const [id,p] of Object.entries(FE.TS_ENDING_PATH_TEXTS))ending(id).pathText={...p};
 const slices=[];if(OW.tsOpenWorldSliceHasData(before.nanhuang))slices.push(before.nanhuang);
 if(OW.tsOpenWorldSliceHasData(before.wuyuan)){const w=before.wuyuan,z=before.wuyuanZones;slices.push({...w,definition:{...w.definition,zones:z.definition.zones},positionNodes:z.positionNodes,constants:{...z.constants,...w.constants}});}
 const entries=before.entries.map(({templateEvent,...x})=>x);
 // 2. 写进真实包目录的副本：已有 stageMeta 的关并进那一条，没有的放进演练包；演练包依赖全部真实包（引用线拍、关都可见）
 const dir=await mkdtemp(join(root,'_newbot_tmp/f0b-rehearsal-'));
 try{
  await cp(PACK_DIR,dir,{recursive:true});
  const realIds=[];
  for(const d of await readdir(dir)){const mf=join(dir,d,'manifest.json'),m=await read(mf).catch(()=>null);if(!m)continue;realIds.push(m.id);
   for(const f of m.stageMeta||[]){const file=join(dir,d,f),list=await read(file);let touched=false;
    for(const s of list)if(add.has(s.stageId)){const x=add.get(s.stageId);s.presentation||={};Object.assign(s.presentation,x.presentation);s.presentation.events||={};
     for(const [id,e] of Object.entries(x.events))s.presentation.events[id]={...s.presentation.events[id],...e};add.delete(s.stageId);touched=true;}
    if(touched)await writeFile(file,JSON.stringify(list));}}
  const rest=[...add].map(([stageId,x])=>({stageId,presentation:{...x.presentation,...(Object.keys(x.events).length?{events:x.events}:{})}}));
  await mkdir(join(dir,'zz_rehearsal'));
  const files={'meta.json':rest,'texts.json':texts,'endings.json':[...endings.values()],'slices.json':slices,'entries.json':entries};
  for(const [f,v] of Object.entries(files))await writeFile(join(dir,'zz_rehearsal',f),JSON.stringify(v));
  await writeFile(join(dir,'zz_rehearsal','manifest.json'),JSON.stringify({schemaVersion:1,id:'test.rehearsal',dependsOn:realIds,stageMeta:['meta.json'],...(Object.keys(texts).length?{texts:['texts.json']}:{}),endings:['endings.json'],openWorldSlices:['slices.json'],persistentEntries:['entries.json']}));
  // 3. 临时搬空 TS（含两处代码特判：编译器的章名与目标重复检查改看「特判已删」的版本），编译
  const orig=NV.storyChapterTitleIn,stripped=await loadWithCatalog('src/modules/scenarioMods/eventNarrativeView.ts',CONTENT_PACKS,stripChapterSpecials);
  const strippedObjective=(meta,e)=>{const id=String(e?.id||'');const m=SM.stageMetaEvent(meta,id)?.objective;return m||'';};
  const emptied=({keepEntries=false}={})=>[
   f=>withRecord(BD.TS_LOCKED_DECISIONS,{},f),f=>withRecord(NV.TS_STORY_ROUTE_LOCATIONS,{},f),f=>withSet(NV.TS_COMPASS_OBJECTIVE_ONLY_EVENT_IDS,[],f),
   f=>withArray(NV.TS_STORY_ACTION_PRESENTATIONS,[],f),f=>withRecord(NV.TS_COMPAT_NARRATIVE_VARIANTS,{},f),f=>withRecord(PA.TS_PLAYER_LINES,{},f),
   f=>withRecord(PA.TS_ACTION_DISPLAY_OVERRIDES,{},f),f=>withRecord(EP.TS_ENDING_KEYS,{},f),f=>withArray(FE.TS_BATTLE_LOSS_ENDINGS,[],f),
   f=>withRecord(FE.TS_ENDING_PATH_TEXTS,{},f),f=>withArray(OW.TS_STEP_SCENE_STAGE_PREFIXES,[],f),
   f=>withRecord(NH.TS_NANHUANG_OPEN_WORLD_SLICE,{key:before.nanhuang.key},f),f=>withRecord(WZ.TS_WUYUAN_ZONE_PART,{key:before.wuyuanZones.key},f),
   f=>withRecord(WO.TS_WUYUAN_OPEN_WORLD_SLICE,{key:before.wuyuan.key},f),
   ...(keepEntries?[]:[f=>withArray(PE.TS_PERSISTENT_ENTRIES,[],f)]),
   f=>withProps(NV,{storyChapterTitleIn:stripped.storyChapterTitleIn},f),f=>withProps(FQ,{resolveFixedQuestObjectiveIn:strippedObjective},f)];
  const nest=(wrappers,fn)=>wrappers.reduceRight((inner,w)=>()=>w(inner),fn)();
  const out=await nest(emptied(),()=>compileContentPacks({packsDir:dir}));
  // 编译时 TS 是空的，常驻入口与 TS 重复检查要单独看一次：只还原 TS 常驻入口表时必须报错
  if(entries.length)await assert.rejects(nest(emptied({keepEntries:true}),()=>compileContentPacks({packsDir:dir})),/also in persistentLineEntries\.ts TS_PERSISTENT_ENTRIES/);
  assert.equal(NV.storyChapterTitleIn,orig);
  // 4. 逐项对照
  // 4a 编译器的逐拍演出口径（guardCovers）不变：线拍投影出来的 overlay 与现在相同
  assert.deepStrictEqual(out.overlays,CONTENT_PACKS.overlays);
  // 4b 构造期合并的表
  assert.deepStrictEqual(BD.mergeLockedDecisions({},out.stageMeta),before.locks);
  assert.deepStrictEqual(EP.mergeEndingKeys({},out.endings),before.endingKeys);
  assert.deepStrictEqual(FE.mergeBattleLossEndings([],out.endings),before.battle);
  assert.deepStrictEqual(FE.mergeEndingPathTexts({},out.endings),before.paths);
  assert.deepStrictEqual(OW.stepSceneStagePrefixesIn(out.openWorldSlices,[]),before.prefixes);
  if(OW.tsOpenWorldSliceHasData(before.nanhuang)){const nh=OW.resolveOpenWorldSlice(out.openWorldSlices,{key:before.nanhuang.key});const {key,...rest}=before.nanhuang;assert.deepStrictEqual({...nh,key:undefined},{...rest,key:undefined});}
  if(OW.tsOpenWorldSliceHasData(before.wuyuan)){const w=OW.resolveOpenWorldSlice(out.openWorldSlices,{key:before.wuyuan.key});
   assert.deepStrictEqual(w.definition,WO.WUYUAN_OPEN_WORLD_DEFINITION);assert.deepStrictEqual(w.definition.zones,WZ.WUYUAN_ZONES);assert.deepStrictEqual(w.zoneRanks,before.wuyuan.zoneRanks);
   assert.deepStrictEqual(w.actionJudgement,{...WO.WUYUAN_PROBLEM_ACTION_JUDGEMENT});assert.deepStrictEqual(w.actionDescribe,{...WO.WUYUAN_PROBLEM_ACTION_DESCRIBE});
   for(const [k,v] of Object.entries({...before.wuyuanZones.constants,...before.wuyuan.constants}))assert.equal(w.constants[k],v,k);
   assert.equal(w.positionNodes.segment,WZ.WUYUAN_POSITION_SEGMENT);assert.equal(w.positionNodes.placeLocationId,WZ.WUYUAN_WORLD_LOCATION_ID);}
  for(const kind of ['algae','rejoin']){const x=before.entries.find(e=>e.kind===kind);if(!x)continue;const {templateEvent,...got}=PE.persistentEntryIn(out.persistentEntries,kind);assert.deepStrictEqual(got,x);
   if(kind==='algae'){const raw=BUILTINS.find(m=>m.manifest.id===x.stageId)?.scenario.events.find(e=>e.id===x.eventId);assert.deepStrictEqual(templateEvent,raw);}}
  // 4c 调用时读 catalog 的函数：catalog 换成编译结果、TS 表搬空后，全书事件（＋_ins_ 变体、表外探针）逐个对照
  const probes=[...ALL_EVENTS.keys(),...[...ALL_EVENTS.keys()].map(id=>`${id}_ins_f0b`),'test.event.none'];
  const view=new Map(probes.map(id=>[id,NV.storyRouteLocation(id)]));
  const evs=[...ALL_EVENTS.values()].map(x=>x.e);
  const flagSets=[{}];for(const v of Object.values(NV.TS_COMPAT_NARRATIVE_VARIANTS))for(const x of v){const one={},none={};for(const c of x.when){const k=c.path.replace(/^flags\./,'');one[k]=c.operator==='eq'?c.value:'__f0b__';none[k]=c.operator==='eq'?'__f0b__':c.value;}flagSets.push(one,none);}
  const narr=new Map(evs.filter(e=>e.id in NV.TS_COMPAT_NARRATIVE_VARIANTS).flatMap(e=>flagSets.flatMap((f,i)=>[[`${e.id}|${i}|own`,[NV.resolveScenarioEventNarrative(e,f),NV.narrativeVariantReplacesCanonRail(e,f)]],[`${e.id}|${i}|old`,[NV.resolveScenarioEventNarrative({...e,narrativeVariants:undefined},f),NV.narrativeVariantReplacesCanonRail({...e,narrativeVariants:undefined},f)]]])));
  const compassRt={canon:{locations:[],characters:[]}};const compass=new Map(evs.map(e=>[e.id,NV.formatQuestCompass(e,compassRt,undefined)]));
  const acts=evs.flatMap(e=>actionsOf(e).map(a=>({eventId:e.id,actionId:a,label:'l',playerLine:'p'})));
  const locs=[...new Set([...NV.TS_STORY_ACTION_PRESENTATIONS.map(p=>p.whenLocationId),LA])];
  const presented=new Map(acts.flatMap(a=>locs.map(l=>[`${a.eventId}|${a.actionId}|${l}`,NV.storyActionPresentation(a,{角色:{位置:{locationId:l}}})])));
  const lines=new Map([...acts,{eventId:E1,actionId:'test_any'}].map(a=>[`${a.eventId}::${a.actionId}`,[PA.lookupScopedPlayerLine(a.eventId,a.actionId),PA.playerActionDisplayOverride(a.eventId,a.actionId)]]));
  const objective=new Map(evs.map(e=>[e.id,FQ.resolveFixedQuestObjective(e)]));
  const titles=new Map([...BUILTINS,...CONTENT_PACKS.stages].flatMap(m=>[...m.scenario.events.map(e=>e.id),...[...ALL_EVENTS].filter(([,x])=>x.stage===m.manifest.id).map(([id])=>id),`${m.manifest.id}\u0000probe`].flatMap(id=>[[`${m.manifest.id}|${id}`,NV.storyChapterTitle(m.manifest.id,id,'fb')],[`${m.manifest.id}|${id}_ins_f0b`,NV.storyChapterTitle(m.manifest.id,`${id}_ins_f0b`,'fb')]])));
  const strippedWithPacks=await loadWithCatalog('src/modules/scenarioMods/eventNarrativeView.ts',out,stripChapterSpecials);
  for(const [k,t] of titles){const [m,...rest]=k.split('|');assert.equal(strippedWithPacks.storyChapterTitleIn(out,m,rest.join('|'),'fb'),t,k);}
  await withRecord(NV.TS_STORY_ROUTE_LOCATIONS,{},()=>withSet(NV.TS_COMPASS_OBJECTIVE_ONLY_EVENT_IDS,[],()=>withArray(NV.TS_STORY_ACTION_PRESENTATIONS,[],()=>withRecord(NV.TS_COMPAT_NARRATIVE_VARIANTS,{},()=>
   withRecord(PA.TS_PLAYER_LINES,{},()=>withRecord(PA.TS_ACTION_DISPLAY_OVERRIDES,{},()=>withProps(CONTENT_PACKS,{stageMeta:out.stageMeta,texts:out.texts},()=>{
    for(const [id,v] of view)assert.equal(NV.storyRouteLocation(id),v,id);
    for(const [k,[n,r]] of narr){const [id,i,kind]=k.split('|');const e=ALL_EVENTS.get(id).e,ev=kind==='old'?{...e,narrativeVariants:undefined}:e;assert.deepStrictEqual(NV.resolveScenarioEventNarrative(ev,flagSets[i]),n,k);assert.equal(NV.narrativeVariantReplacesCanonRail(ev,flagSets[i]),r,k);}
    for(const [id,c] of compass)assert.equal(NV.formatQuestCompass(ALL_EVENTS.get(id).e,compassRt,undefined),c,id);
    for(const a of acts)for(const l of locs)assert.deepStrictEqual(NV.storyActionPresentation(a,{角色:{位置:{locationId:l}}}),presented.get(`${a.eventId}|${a.actionId}|${l}`));
    for(const [k,[s,o]] of lines){const [e,a]=k.split('::');assert.equal(PA.lookupScopedPlayerLine(e,a),s,k);assert.deepStrictEqual(PA.playerActionDisplayOverride(e,a),o,k);}
    // 目标：三处特判与覆盖表的条目改由 stageMeta 供数（模板运行时解析），结果与现在相同
    for(const x of objectives)assert.equal(strippedObjective(out.stageMeta,{id:x.eventId}).includes('{{')?NE.entityTemplateText(strippedObjective(out.stageMeta,{id:x.eventId})):strippedObjective(out.stageMeta,{id:x.eventId}),objective.get(x.eventId),x.eventId);
   })))))));
 }finally{await rm(dir,{recursive:true,force:true});}
 // 演练完 TS 表原样还原
 assert.deepStrictEqual({...BD.LOCKED_DECISIONS},before.locks);assert.equal(NV.storyChapterTitleIn(bare,S,E1,'fb'),'fb');
});
