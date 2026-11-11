// F0a：核心轨与人物轨的新包格式机制（只建机制，不搬数据）——secondaryLines 首条无 after、lineCriticalEvents、characterBeats、
// storyAxis、locationAliases、characterProfiles、ifBranches。编译夹具在 _newbot_tmp 下的临时 packs 目录（写法同 contentPackLineFormats）。
// 不写死真实剧情 id：关、事件、地点、角色都从内置关、locations.json、实体总表动态挑；合成 id 一律 test.* 前缀。
// 「与 TS 表重复」用合成的临时 TS 条目：本文件与编译器（scripts/*.mjs 的 jiti）共用模块缓存，用例里改 TS_ 表、用完还原，编译期校验看得到。
// 最后一组「搬迁演练」把现有 TS 表整张转写成包 JSON、临时搬空 TS 表后编译，合并值必须与现在逐项 deepStrictEqual（表搬空后：没改口径的段自然变成空演练；人物拍点一段自 B2 起取合并值、姿态与好感上限自 B4 起取人物包 profiles.json、IF 分歧自 B5 起取人物包 if-branches.json、地点三张表自 B3 起取核心包 location-aliases.json，仍是真演练）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createJiti} from 'jiti';
import {compileContentPacks} from '../scripts/content-packs.mjs';
import {emptyCoreFormats} from '../scripts/content-pack-core-formats.mjs';
import {loadTs} from './loadTs.mjs';

const root=resolve(import.meta.dirname,'..');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const qinDir=join(root,'src/modules/contentPacks/packs/qin');

const {CONTENT_PACKS}=await loadTs('../src/modules/contentPacks/index.ts');
const SL=await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
const CQ=await loadTs('../src/modules/scenarioMods/characterQuests.ts');
const AX=await loadTs('../src/modules/scenarioMods/mainQuestAxis.ts');
const LOC=await loadTs('../src/modules/scenarioMods/travel/locationIds.ts');
const ST=await loadTs('../src/modules/scenarioMods/stanceProfiles.ts');
const AC=await loadTs('../src/modules/scenarioMods/affinityCaps.ts');
const DL=await loadTs('../src/modules/scenarioMods/divergenceLedger.ts');
const NE=await loadTs('../src/modules/scenarioMods/namedEntities.ts');
const {AFFINITY_TIERS}=await loadTs('../src/modules/scenarioMods/affinityLadder.ts');
const {DEFAULT_LINE_QUARANTINED_STAGE_IDS}=await loadTs('../src/modules/scenarioMods/canonRail.ts');

const withPacks=async(packs,fn)=>{
 const dir=await mkdtemp(join(root,'_newbot_tmp/f0a-core-formats-'));
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
/** 单包：kind 段放一个文件。 */
const pack=(kind,value,extra={})=>({p:{id:'test.core',[kind]:['f.json'],files:{'f.json':value},...extra}});
const reEsc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

/** 把 TS 模块复制到临时目录加载：CONTENT_PACKS 换成合成 catalog，相对 import 改成原目录的绝对路径（同 contentPackLineFormats，另认 ../../contentPacks）。 */
const loadWithCatalog=async(rel,catalog)=>{
 const file=join(root,rel),source=await readFile(file,'utf8');
 const dir=await mkdtemp(join(root,'_newbot_tmp/f0a-inject-'));
 try{
  await writeFile(join(dir,'catalog-stub.ts'),`export const CONTENT_PACKS: any = ${JSON.stringify(catalog)};\n`);
  const patched=source
   .replace(/from '(?:(?:\.\.\/)+contentPacks|@\/modules\/contentPacks)'/g,`from '${join(dir,'catalog-stub.ts')}'`)
   .replace(/from '(\.{1,2}\/[^']+)'/g,(_,p)=>`from '${resolve(dirname(file),p)}'`);
  const out=join(dir,rel.split('/').pop());await writeFile(out,patched);
  return await createJiti(import.meta.url,{interopDefault:true,moduleCache:false,alias:{'@':join(root,'src')}}).import(out);
 }finally{await rm(dir,{recursive:true,force:true});}
};

/** 临时改 TS 表（数组清空／对象删键，或推入合成条目），fn 结束后原样还原。 */
const withTsArray=async(arr,items,fn)=>{const saved=arr.splice(0,arr.length,...items);try{return await fn();}finally{arr.splice(0,arr.length,...saved);}};
const withTsRecord=async(obj,entries,fn)=>{const saved={...obj};for(const k of Object.keys(obj))delete obj[k];Object.assign(obj,entries);try{return await fn();}finally{for(const k of Object.keys(obj))delete obj[k];Object.assign(obj,saved);}};
const withTsAdded=async(obj,entries,fn)=>withTsRecord(obj,{...obj,...entries},fn);

// —— 动态夹具 ——
const BUILTINS=await Promise.all((await readdir(join(root,'src/modules/scenarioMods/builtins/data'))).filter(f=>f.endsWith('.json')).sort().map(f=>read(join(root,'src/modules/scenarioMods/builtins/data',f))));
const STAGE=BUILTINS.find(m=>m.scenario.events.length>=3);
const [E1,E2,E3]=STAGE.scenario.events.map(e=>e.id);const S=STAGE.manifest.id;
const OTHER_EVENT=BUILTINS.find(m=>m!==STAGE&&m.scenario.events.length).scenario.events[0].id;
const NEW_ID='test.event.not_yet_written';
const QUARANTINED=BUILTINS.find(m=>DEFAULT_LINE_QUARANTINED_STAGE_IDS.has(m.manifest.id)&&m.scenario.events.length);
const LOCS=(await read(join(root,'mod-kit/entity-catalog/locations.json'))).entries;
// B3 起三张手写表在核心包里、TS 表为空：合成地点要避开 TS 表与包里已用的 id（否则正例并入真实 catalog 时撞键）
const PACK_LOC=CONTENT_PACKS.locationAliases||{};
const tsLocIds=new Set([...Object.entries(LOC.TS_LOCATION_ID_ALIASES).flat(),...Object.entries(LOC.TS_LOCATION_PARENTS).flat(),...Object.keys(LOC.TS_LOCATION_NAMES),
 ...Object.entries(PACK_LOC.canonical||{}).flat(),...Object.entries(PACK_LOC.parents||{}).flat(),...Object.keys(PACK_LOC.display||{})]);
const [LA,LB,LC]=LOCS.map(e=>e.id).filter(id=>!tsLocIds.has(id)&&!LOCS.some(e=>(e.aliases||[]).includes(id)));
const LOC_ALIAS=LOCS.flatMap(e=>e.aliases||[]).find(Boolean);
const tsNames=new Set([...ST.TS_STANCE_PROFILES,...AC.TS_AFFINITY_CAPS].flatMap(p=>p.names));
const freeEntity=kind=>NE.namedEntityEntries(kind).map(e=>e.id).filter(id=>{const a=NE.entityAliases(kind,id);return a.length&&a.every(n=>!tsNames.has(n));});
const [C1,C2]=freeEntity('character');const [EN]=freeEntity('enemy');
assert.ok(E3&&OTHER_EVENT&&QUARANTINED&&LC&&LOC_ALIAS&&C2&&EN,'动态夹具挑不出来');
const tierMax=id=>AFFINITY_TIERS.find(t=>t.id===id).max;

// —— 新段为空 ——
// 没有包声明的段在 catalog 里是空段；与真实模块的比较只在该段为空时做（搬迁批次往包里写了数据后，那一段改由各自的快照钉住）
const PACK_DIR=join(root,'src/modules/contentPacks/packs');
const DECLARED=new Set((await Promise.all((await readdir(PACK_DIR)).map(d=>read(join(PACK_DIR,d,'manifest.json')).catch(()=>({}))))).flatMap(m=>Object.keys(m)));
const realEmpty=k=>JSON.stringify(CONTENT_PACKS[k])===JSON.stringify(emptyCoreFormats()[k]);
test('新段为空：没有包声明的段是空段；读取方合并值等于 TS 表（元素同一对象）',async()=>{
 for(const [k,v] of Object.entries(emptyCoreFormats())){assert.ok(k in CONTENT_PACKS,k);if(!DECLARED.has(k))assert.deepStrictEqual(CONTENT_PACKS[k],v,k);}
 const without={...CONTENT_PACKS};for(const k of Object.keys(emptyCoreFormats()))delete without[k];
 for(const catalog of [without,{...CONTENT_PACKS,...emptyCoreFormats()}]){
  const sl=await loadWithCatalog('src/modules/scenarioMods/secondaryLines.ts',catalog);
  assert.deepStrictEqual(sl.LINE_CRITICAL_EVENTS,sl.TS_LINE_CRITICAL_EVENTS);if(realEmpty('lineCriticalEvents'))assert.deepStrictEqual(sl.LINE_CRITICAL_EVENTS,SL.LINE_CRITICAL_EVENTS);
  const cq=await loadWithCatalog('src/modules/scenarioMods/characterQuests.ts',catalog);
  cq.CHARACTER_QUESTS.forEach((q,i)=>assert.equal(q,cq.TS_CHARACTER_QUESTS[i]));assert.equal(cq.CHARACTER_QUESTS.length,cq.TS_CHARACTER_QUESTS.length);
  cq.CHARACTER_HIGHLIGHTS.forEach((h,i)=>assert.equal(h,cq.TS_CHARACTER_HIGHLIGHTS[i]));assert.equal(cq.CHARACTER_HIGHLIGHTS.length,cq.TS_CHARACTER_HIGHLIGHTS.length);
  const ax=await loadWithCatalog('src/modules/scenarioMods/mainQuestAxis.ts',catalog);
  for(const [k,t] of [['STAGE_ORDER','TS_STAGE_ORDER'],['MAIN_QUEST_LAYERS','TS_MAIN_QUEST_LAYERS'],['MAIN_QUEST_STAGES','TS_MAIN_QUEST_STAGES'],['MAIN_QUEST_NODES','TS_MAIN_QUEST_NODES'],['MAIN_QUEST_REQUIREMENTS','TS_MAIN_QUEST_REQUIREMENTS']]){assert.equal(ax[k],ax[t],k);if(realEmpty('storyAxis'))assert.deepStrictEqual(ax[k],AX[k],k);}
  const loc=await loadWithCatalog('src/modules/scenarioMods/travel/locationIds.ts',catalog);
  if(realEmpty('locationAliases'))assert.deepStrictEqual({...loc.LOCATION_ID_ALIASES},{...LOC.LOCATION_ID_ALIASES});assert.ok(Object.isFrozen(loc.LOCATION_ID_ALIASES));
  assert.deepStrictEqual(loc.LOCATION_PARENTS,loc.TS_LOCATION_PARENTS);assert.deepStrictEqual(loc.LOCATION_NAMES,loc.TS_LOCATION_NAMES);
  const st=await loadWithCatalog('src/modules/scenarioMods/stanceProfiles.ts',catalog);
  st.STANCE_PROFILES.forEach((p,i)=>assert.equal(p,st.TS_STANCE_PROFILES[i]));assert.equal(st.STANCE_PROFILES.length,st.TS_STANCE_PROFILES.length);
  const ac=await loadWithCatalog('src/modules/scenarioMods/affinityCaps.ts',catalog);
  ac.AFFINITY_CAPS.forEach((p,i)=>assert.equal(p,ac.TS_AFFINITY_CAPS[i]));assert.equal(ac.AFFINITY_CAPS.length,ac.TS_AFFINITY_CAPS.length);
  const dl=await loadWithCatalog('src/modules/scenarioMods/divergenceLedger.ts',catalog);
  // 分歧提示：TS 规则表里每条带 prompt 的分支／后果、每个按 id 的提示，结果与真实模块逐字相同
  const items=[...dl.TS_AUTO_BRANCH_RULES.map((r,i)=>({id:`d${i}`,eventId:r.eventId,branchId:r.branchId,worldDelta:'变化',characterStates:[],evidence:'',sequence:i+1})),
   ...dl.TS_AUTO_CONSEQUENCE_RULES.map((r,i)=>({id:`c${i}`,eventId:r.eventId,worldDelta:'变化',characterStates:[{characterId:r.requiredCharacterId,status:r.acceptedStatuses.source.replace(/^\^\(?|\)?\$$/g,'').split('|')[0]}],evidence:'',sequence:1})),
   ...Object.keys(dl.TS_DIVERGENCE_PROMPTS).map(id=>({id,eventId:'x',worldDelta:'变化',characterStates:[],evidence:'',sequence:1}))];
  if(realEmpty('ifBranches'))for(const item of items)assert.equal(dl.formatDivergencePrompt([item]),DL.formatDivergencePrompt([item]));
 }
});

// —— secondaryLines 首条无 after ——
const line=(patch={})=>({id:'test_line',name:'测试线',kind:'sect',anchorEventIds:[E1],entryHint:'去找人。',basis:'测试。',nodes:[{reviewSummary:'第一步',status:'ready',stageId:S,eventId:E2}],...patch});
const TS_LINE=(SL.TS_SECONDARY_LINES[0]&&SL.TS_SECONDARY_LINES)||null;
const withTsLines=(lines,fn)=>withTsArray(SL.TS_SECONDARY_LINES,lines,fn);
const synthTsLine=line({id:'test_ts_line'});

test('secondaryLines 首条：不写 after 排最前（TS 表须为空），其余照 after 接；catalog 里没有 after 键',async()=>{
 const out=await withTsLines([],()=>compile(pack('secondaryLines',[line({id:'test_b',after:'test_a'}),line({id:'test_a',note:'作者备注'})])));
 assert.equal('after' in out.secondaryLines[1],false);assert.equal(out.secondaryLines[0].after,'test_a');
 assert.deepEqual(SL.mergeSecondaryLines([],out.secondaryLines).map(l=>l.id),['test_a','test_b']);
 assert.equal(SL.mergeSecondaryLines([],out.secondaryLines).some(l=>'after' in l),false);
 // 合并顺序：首条在最前，链式 after 跟在后面
 assert.deepEqual(SL.mergeSecondaryLines([],[line({id:'x3',after:'x2'}),line({id:'x1'}),line({id:'x2',after:'x1'})]).map(l=>l.id),['x1','x2','x3']);
 assert.throws(()=>SL.mergeSecondaryLines([synthTsLine],[line()]),/test_line: omits after, but TS_SECONDARY_LINES is not empty/);
 assert.throws(()=>SL.mergeSecondaryLines([],[line(),line({id:'test_2'})]),/test_2: only one pack line may omit after \(test_line already does\)/);
});

test('secondaryLines 首条反例：两条不写 after（同包／跨包）；TS 表非空时不写 after',async()=>{
 await withTsLines([],async()=>{
  await rejects(pack('secondaryLines',[line(),line({id:'test_2'})]),/secondary line test_2: only one pack line may omit after \(test_line already does\)/);
  await rejects({a:{id:'test.a',secondaryLines:['l.json'],files:{'l.json':[line()]}},b:{id:'test.b',secondaryLines:['l.json'],files:{'l.json':[line({id:'test_2'})]}}},/only one pack line may omit after/);
 });
 await withTsLines(TS_LINE||[synthTsLine],()=>rejects(pack('secondaryLines',[line()]),/secondary line test_line: omits after, but TS_SECONDARY_LINES is not empty/));
});

test('secondaryLines 动态名字：catalog 留模板，运行时解析；写法与实体在编译期校验',async()=>{
 const tpl=`见{{entity:character:${C1}}}`;
 const after=(TS_LINE||[synthTsLine])[0].id;
 const out=await withTsLines(TS_LINE||[synthTsLine],()=>compile(pack('secondaryLines',[line({after,nodes:[{reviewSummary:tpl,status:'pending'}],pendingExpansion:tpl})])));
 assert.equal(out.secondaryLines[0].nodes[0].reviewSummary,tpl);
 const [resolved]=SL.resolvePackSecondaryLineTemplates(out.secondaryLines);
 assert.equal(resolved.nodes[0].reviewSummary,`见${NE.entityName('character',C1)}`);assert.equal(resolved.pendingExpansion,resolved.nodes[0].reviewSummary);
 const plain=line();assert.equal(SL.resolvePackSecondaryLineTemplates([plain])[0],plain);
 await withTsLines(TS_LINE||[synthTsLine],async()=>{
  await rejects(pack('secondaryLines',[line({after,basis:'{{entity:character:test.character.nobody}}'})]),/secondary line entity \{\{entity:character:test\.character\.nobody\}\}: unknown character/);
  await rejects(pack('secondaryLines',[line({after,basis:'{{name}}'})]),/secondary line entity \{\{name\}\}: expected entity:<kind>:<id>/);
 });
});

// —— lineCriticalEvents ——
const lcLine=()=>(TS_LINE||[synthTsLine])[0].id;
test('lineCriticalEvents 正例：剥 note；TS 在前、包在后；冻结判据照旧（隔离关事件也算）',async()=>{
 const lineId=lcLine();
 const out=await withTsLines(TS_LINE||[synthTsLine],()=>compile(pack('lineCriticalEvents',[{eventId:E1,lineId,note:'作者备注'},{eventId:QUARANTINED.scenario.events[0].id,lineId}])));
 assert.deepStrictEqual(out.lineCriticalEvents,[{eventId:E1,lineId},{eventId:QUARANTINED.scenario.events[0].id,lineId}]);
 const merged=SL.mergeLineCriticalEvents({'test.event.ts':'ts_line'},out.lineCriticalEvents);
 assert.deepEqual(Object.keys(merged),['test.event.ts',E1,QUARANTINED.scenario.events[0].id]);
 assert.throws(()=>SL.mergeLineCriticalEvents({[E1]:'x'},out.lineCriticalEvents),new RegExp(`line critical event ${reEsc(E1)}: duplicate`));
 const sl=await loadWithCatalog('src/modules/scenarioMods/secondaryLines.ts',{...CONTENT_PACKS,lineCriticalEvents:out.lineCriticalEvents});
 assert.equal(sl.LINE_CRITICAL_EVENTS[E1],lineId);assert.deepStrictEqual(sl.TS_LINE_CRITICAL_EVENTS,SL.TS_LINE_CRITICAL_EVENTS);
 assert.equal(sl.lineCriticalFrozen({id:E1},undefined,undefined),true);assert.equal(sl.lineCriticalFrozen({id:E1},S,undefined),false);
 assert.equal(sl.lineCriticalFrozen({id:E1,locationId:'a'},S,'b'),true);assert.equal(sl.lineCriticalFrozen({id:E3},undefined,undefined),SL.lineCriticalFrozen({id:E3},undefined,undefined));
 // lineId 也可以是同一次编译里的包线
 const own=await withTsLines([],()=>compile({p:{id:'test.core',secondaryLines:['l.json'],lineCriticalEvents:['c.json'],files:{'l.json':[line()],'c.json':[{eventId:E1,lineId:'test_line'}]}}}));
 assert.equal(own.lineCriticalEvents[0].lineId,'test_line');
});

test('lineCriticalEvents 反例：字段、事件、重复、未知线、与 TS 表重复',async()=>{
 const lineId=lcLine();
 await withTsLines(TS_LINE||[synthTsLine],async()=>{
  await rejects(pack('lineCriticalEvents',{eventId:E1,lineId}),/test\.core\.lineCriticalEvents: expected array/);
  await rejects(pack('lineCriticalEvents',[{eventId:E1}]),new RegExp(`lineCriticalEvents ${reEsc(E1)}: invalid fields`));
  await rejects(pack('lineCriticalEvents',[{eventId:E1,lineId,extra:1}]),/invalid fields/);
  await rejects(pack('lineCriticalEvents',[{eventId:NEW_ID,lineId}]),/lineCriticalEvents test\.event\.not_yet_written: unknown event/);
  await rejects(pack('lineCriticalEvents',[{eventId:E1,lineId},{eventId:E1,lineId}]),/appears twice/);
  await rejects(pack('lineCriticalEvents',[{eventId:E1,lineId:'test_no_line'}]),/unknown secondary line test_no_line/);
  await withTsAdded(SL.TS_LINE_CRITICAL_EVENTS,{[E1]:lineId},()=>rejects(pack('lineCriticalEvents',[{eventId:E1,lineId}]),/also listed in secondaryLines\.ts LINE_CRITICAL_EVENTS/));
 });
});

// —— characterBeats ——
const quest=(patch={})=>({id:'test_quest',name:'测试人',note:'备注',beats:[{reviewSummary:'一',status:'ready',eventIds:[E1],note:'拍备注'},{reviewSummary:'二',status:'insert',eventIds:[E2,E3]},{reviewSummary:'三',status:'new',eventIds:[NEW_ID]}],...patch});
const highlight=(patch={})=>({name:'测试人',eventIds:[E2],reviewSummary:'高光',...patch});
test('characterBeats 正例：剥 note；TS 在前、包在后；characterBeatsAt／characterQuestProgress 读合并值',async()=>{
 const out=await compile(pack('characterBeats',{quests:[quest()],highlights:[highlight({note:'x'})]}));
 assert.deepStrictEqual(out.characterBeats,{quests:[{id:'test_quest',name:'测试人',beats:[{reviewSummary:'一',status:'ready',eventIds:[E1]},{reviewSummary:'二',status:'insert',eventIds:[E2,E3]},{reviewSummary:'三',status:'new',eventIds:[NEW_ID]}]}],highlights:[highlight()]});
 const ts={quests:[{id:'test_ts',name:'甲',beats:[]}],highlights:[{name:'甲',eventIds:[E1],reviewSummary:'甲光'}]};
 const merged=CQ.mergeCharacterBeats(ts,out.characterBeats);
 assert.deepEqual(merged.quests.map(q=>q.id),['test_ts','test_quest']);assert.deepEqual(merged.highlights.map(h=>h.reviewSummary),['甲光','高光']);
 assert.throws(()=>CQ.mergeCharacterBeats({quests:[{id:'test_quest',name:'x',beats:[]}],highlights:[]},out.characterBeats),/character quest test_quest: duplicate id/);
 const cq=await loadWithCatalog('src/modules/scenarioMods/characterQuests.ts',{...CONTENT_PACKS,characterBeats:out.characterBeats});
 assert.deepEqual(cq.characterBeatsAt(E2).slice(-2),[{name:'测试人',reviewSummary:'二'},{name:'测试人',reviewSummary:'高光'}]);
 assert.deepEqual(cq.characterBeatsAt(NEW_ID),[]);
 assert.deepEqual(cq.characterQuestProgress([E3]).at(-1),{id:'test_quest',name:'测试人',done:1,total:2});
});

test('characterBeats 反例：字段、status、事件存在性（new 必须不存在）、重复、与 TS 表重复',async()=>{
 const R=(v,re)=>rejects(pack('characterBeats',v),re);
 await R([],/test\.core\.characterBeats: expected object with quests\/highlights/);
 await R({quests:[quest()],extra:1},/expected object/);
 await R({quests:[quest({beats:[]})]},/characterBeats quest test_quest: invalid fields/);
 await R({quests:[quest({beats:[{reviewSummary:'x',status:'pending',eventIds:[E1]}]})]},/beat 0: invalid fields/);
 await R({quests:[quest({beats:[{reviewSummary:'x',status:'ready',eventIds:[]}]})]},/beat 0: invalid fields/);
 await R({quests:[quest({beats:[{reviewSummary:'x',status:'ready',eventIds:[NEW_ID]}]})]},/beat 0: unknown event test\.event\.not_yet_written/);
 await R({quests:[quest({beats:[{reviewSummary:'x',status:'insert',eventIds:[NEW_ID]}]})]},/beat 0: unknown event/);
 await R({quests:[quest({beats:[{reviewSummary:'x',status:'new',eventIds:[E1]}]})]},new RegExp(`beat 0: new beat suggests ${reEsc(E1)}, which already exists`));
 await R({quests:[quest(),quest()]},/characterQuest id test_quest defined by both|test_quest: duplicate id/);
 await R({highlights:[highlight({eventIds:[NEW_ID]})]},/characterBeats highlight 测试人: unknown event/);
 await R({highlights:[highlight(),highlight()]},/duplicate highlight/);
 await R({highlights:[highlight({reviewSummary:''})]},/highlight 测试人: invalid fields/);
 await withTsArray(CQ.TS_CHARACTER_QUESTS,[...CQ.TS_CHARACTER_QUESTS,{id:'test_quest',name:'合成',beats:[]}],()=>R({quests:[quest()]},/characterBeats quest test_quest: also in characterQuests\.ts CHARACTER_QUESTS/));
 await withTsArray(CQ.TS_CHARACTER_HIGHLIGHTS,[...CQ.TS_CHARACTER_HIGHLIGHTS,highlight()],()=>R({highlights:[highlight()]},/also in characterQuests\.ts CHARACTER_HIGHLIGHTS/));
 // 只换名字或事件就不算重复
 await withTsArray(CQ.TS_CHARACTER_HIGHLIGHTS,[...CQ.TS_CHARACTER_HIGHLIGHTS,highlight({eventIds:[E1]})],async()=>assert.equal((await compile(pack('characterBeats',{highlights:[highlight()]}))).characterBeats.highlights.length,1));
});

// —— storyAxis ——
const byId=new Map(BUILTINS.map(m=>[m.manifest.id,m]));
const HEAD=BUILTINS.find(m=>!BUILTINS.some(o=>o.manifest.nextStageId===m.manifest.id)).manifest.id;
const CHAIN=[];for(let id=HEAD;id;id=byId.get(id)?.manifest.nextStageId)CHAIN.push(id);
assert.equal(CHAIN.length,BUILTINS.length,'内置关不是一条无分叉单链：storyAxis 的编译期链校验要改');
const axis=(patch={})=>({note:'作者备注',stageOrder:[...CHAIN],
 layers:[{layer:1,text:'开局',unlockStageIds:[]},{layer:2,text:'二层',unlockStageIds:[S],note:'层备注'},{layer:6,text:'暗线',unlockStageIds:[],restricted:true}],
 stages:[{stageId:S,role:'测试关',pillars:['bloodline'],note:'关备注'}],
 nodes:[{stageId:S,reviewSummary:'节点',status:'ready',eventId:E1,bloodlineBranch:'zhao'},{stageId:S,reviewSummary:'待扩',status:'pending',note:'节点备注'},{stageId:S,reviewSummary:'地点',status:'new',eventId:NEW_ID,locationId:LA}],
 requirements:[{id:'taiquan_rite',text:'要求',basis:'依据'}],...patch});
const TS_AXIS=['TS_STAGE_ORDER','TS_MAIN_QUEST_LAYERS','TS_MAIN_QUEST_STAGES','TS_MAIN_QUEST_NODES','TS_MAIN_QUEST_REQUIREMENTS'];
const withEmptyAxis=async fn=>{const saved=TS_AXIS.map(k=>AX[k].splice(0));try{return await fn();}finally{TS_AXIS.forEach((k,i)=>AX[k].push(...saved[i]));}};

test('storyAxis 正例：全局一份，剥 note；有包时 TS 表须为空（二选一），读取方用包',async()=>{
 const out=await withEmptyAxis(()=>compile(pack('storyAxis',axis())));
 const {note,...expected}=axis();
 assert.deepStrictEqual(out.storyAxis,{...expected,layers:expected.layers.map(({note,...l})=>l),stages:expected.stages.map(({note,...s})=>s),nodes:expected.nodes.map(({note,...n})=>n)});
 const empty={stageOrder:[],layers:[],stages:[],nodes:[],requirements:[]};
 assert.equal(AX.resolveStoryAxis(empty,out.storyAxis),out.storyAxis);
 const ts={stageOrder:['x'],layers:[],stages:[],nodes:[],requirements:[]};
 assert.equal(AX.resolveStoryAxis(ts,null),ts);assert.equal(AX.resolveStoryAxis(ts,undefined),ts);
 assert.throws(()=>AX.resolveStoryAxis(ts,out.storyAxis),/storyAxis: declared by a content pack, but mainQuestAxis\.ts TS tables are not empty \(stageOrder\)/);
});

test('storyAxis 反例：多份、链序、关、层、节点、要求、与 TS 表并存',async()=>{
 await withEmptyAxis(async()=>{
  const R=(v,re)=>rejects(pack('storyAxis',v),re);
  await rejects({a:{id:'test.a',storyAxis:['x.json'],files:{'x.json':axis()}},b:{id:'test.b',storyAxis:['x.json'],files:{'x.json':axis()}}},/storyAxis declared 2 times \(test\.a, test\.b\); at most one/);
  await R([axis()],/test\.core\.storyAxis: expected object/);
  await R(axis({stageOrder:undefined}),/storyAxis\.stageOrder: expected array/);
  const swapped=[...CHAIN];[swapped[1],swapped[2]]=[swapped[2],swapped[1]];
  await R(axis({stageOrder:swapped}),/storyAxis\.stageOrder must equal the nextStageId chain from \S+ \(at 1: /);
  await R(axis({stageOrder:CHAIN.slice(0,-1)}),/must equal the nextStageId chain .*chain continues to/);
  await R(axis({stageOrder:CHAIN.slice(1)}),/storyAxis\.stageOrder: built-in stages missing /);
  await R(axis({stageOrder:[...CHAIN,'test.no_stage']}),/storyAxis\.stageOrder: unknown stage test\.no_stage/);
  await R(axis({stageOrder:[...CHAIN,CHAIN[0]]}),/expected distinct stage ids/);
  await R(axis({layers:[{layer:7,text:'x',unlockStageIds:[]}]}),/storyAxis\.layers\.0: invalid fields/);
  await R(axis({layers:[{layer:1,text:'x',unlockStageIds:[]},{layer:1,text:'y',unlockStageIds:[]}]}),/layer 1 appears twice/);
  await R(axis({layers:[{layer:1,text:'x',unlockStageIds:['test.no_stage']}]}),/storyAxis\.layers\.0: unknown stage/);
  await R(axis({layers:[{layer:1,text:'x',unlockStageIds:[],restricted:false}]}),/layers\.0: invalid fields/);
  await R(axis({stages:[{stageId:S,role:'x',pillars:['economy']}]}),/storyAxis\.stages\.0: invalid fields/);
  await R(axis({stages:[{stageId:S,role:'x',pillars:[]},{stageId:S,role:'y',pillars:[]}]}),/appears twice/);
  await R(axis({nodes:[{stageId:S,reviewSummary:'x',status:'ready',eventId:OTHER_EVENT}]}),/storyAxis\.nodes\.0: ready node needs an event of/);
  await R(axis({nodes:[{stageId:S,reviewSummary:'x',status:'pending',eventId:NEW_ID}]}),/pending node must not suggest an event id/);
  await R(axis({nodes:[{stageId:S,reviewSummary:'x',locationId:'test.location.nowhere'}]}),/unknown location test\.location\.nowhere/);
  await R(axis({nodes:[{stageId:S,reviewSummary:'x',bloodlineBranch:'test'}]}),/nodes\.0: invalid fields/);
  await R(axis({requirements:[{id:'test_req',text:'x',basis:'y'}]}),/storyAxis\.requirements\.0: invalid fields/);
  await R(axis({requirements:[{id:'taiquan_rite',text:'x',basis:'y'},{id:'taiquan_rite',text:'x',basis:'y'}]}),/taiquan_rite appears twice/);
  // 与 TS 表并存：任何一张 TS 表非空都报错
  await withTsArray(AX.TS_MAIN_QUEST_NODES,[{stageId:S,reviewSummary:'合成'}],()=>R(axis(),/storyAxis: declared by a pack, but mainQuestAxis\.ts still has TS_MAIN_QUEST_NODES/));
 });
});

// —— locationAliases ——
const locs=(patch={})=>({note:'作者备注',canonical:{'test.location.old':LA},parents:{[LB]:LC},display:{[LB]:{name:'测试地',displayAliases:['测试别称']}},...patch});
test('locationAliases 正例：三张表并在 TS 表之后；canonicalLocationId／locationWithin／locationIdByRegisteredName 读合并值',async()=>{
 const out=await compile(pack('locationAliases',locs()));
 const {note,...expected}=locs();assert.deepStrictEqual(out.locationAliases,expected);
 assert.deepEqual(Object.keys(LOC.mergeLocationTable('x',{'test.a':1},{'test.b':2})),['test.a','test.b']);
 assert.throws(()=>LOC.mergeLocationTable('parents',{[LB]:LA},out.locationAliases.parents),new RegExp(`locationAliases parents ${reEsc(LB)}: duplicate`));
 // 合成三张表接在真实 catalog 的 locationAliases 之后（B3 起真实数据在核心包里，不能整段换掉）
 const merged=Object.fromEntries(['canonical','parents','display'].map(k=>[k,{...(PACK_LOC[k]||{}),...out.locationAliases[k]}]));
 const loc=await loadWithCatalog('src/modules/scenarioMods/travel/locationIds.ts',{...CONTENT_PACKS,locationAliases:merged});
 assert.equal(loc.canonicalLocationId('test.location.old'),NE.canonicalEntityId('location',LA));
 assert.equal(loc.locationWithin(LB,LC),true);assert.equal(loc.locationWithin(LC,LB),false);
 assert.equal(loc.locationIdByRegisteredName('测试别称'),LB);
 assert.deepEqual(Object.keys(loc.LOCATION_NAMES).at(-1),LB);assert.ok(Object.isFrozen(loc.LOCATION_ID_ALIASES));
 for(const [k,v] of Object.entries(LOC.LOCATION_ID_ALIASES))assert.equal(loc.LOCATION_ID_ALIASES[k],v);
});

test('locationAliases 反例：地点存在、别名不成链、父子不成环、重复、与 TS 表重复',async()=>{
 const R=(v,re)=>rejects(pack('locationAliases',v),re);
 await R([locs()],/test\.core\.locationAliases: expected object/);
 await R(locs({canonical:{'test.location.old':'test.location.nowhere'}}),/canonical test\.location\.old: test\.location\.nowhere is not a location id in locations\.json/);
 await R(locs({canonical:{'test.location.old':LOC_ALIAS}}),/is not a location id in locations\.json/);
 await R(locs({canonical:{[LA]:LA}}),/invalid alias/);
 await R(locs({canonical:{[LOC_ALIAS]:LA}}),/already an alias in locations\.json/);
 await R(locs({canonical:{'test.location.old':LA,[LA]:LB}}),/canonical test\.location\.old: \S+ is itself an alias \(chain\)/);
 await R(locs({parents:{[LB]:LC,[LC]:LB}}),/locationAliases parents cycle /);
 await R(locs({parents:{[LB]:'test.location.nowhere'}}),/parents \S+: unknown location or self parent/);
 await R(locs({display:{'test.location.nowhere':{name:'x'}}}),/display test\.location\.nowhere: unknown location/);
 await R(locs({display:{[LB]:{name:''}}}),/invalid fields/);
 await R(locs({display:{[LB]:{name:'x',extra:1}}}),/invalid fields/);
 await rejects({a:{id:'test.a',locationAliases:['x.json'],files:{'x.json':locs()}},b:{id:'test.b',locationAliases:['x.json'],files:{'x.json':locs()}}},/canonical test\.location\.old: appears twice/);
 await withTsAdded(LOC.TS_LOCATION_ID_ALIASES,{'test.location.old':LA},()=>R(locs(),/canonical test\.location\.old: also in travel\/locationIds\.ts TS_LOCATION_ID_ALIASES/));
 await withTsAdded(LOC.TS_LOCATION_PARENTS,{[LB]:LA},()=>R(locs(),/parents \S+: also in travel\/locationIds\.ts LOCATION_PARENTS/));
 await withTsAdded(LOC.TS_LOCATION_NAMES,{[LB]:{name:'合成'}},()=>R(locs(),/display \S+: also in travel\/locationIds\.ts LOCATION_NAMES/));
 // 与 TS 表合起来成链／成环
 await withTsAdded(LOC.TS_LOCATION_ID_ALIASES,{[LA]:LB},()=>R(locs(),/is itself an alias \(chain\)/));
 await withTsAdded(LOC.TS_LOCATION_PARENTS,{[LC]:LB},()=>R(locs(),/parents cycle/));
});

// —— characterProfiles ——
const stance=(patch={})=>({note:'备注',entities:[{kind:'character',id:C1},{kind:'character',id:C1}],extraNames:['测试别名'],constant:['本色'],bands:{high:['高档'],low:['低档']},...patch});
const cap=(patch={})=>({entities:[{kind:'enemy',id:EN}],capTier:'acquainted',reason:'理由',liftedBy:'解除',...patch});
test('characterProfiles 正例：names 由实体别名（保留重复）＋ extraNames 还原；cap 取档位 max；TS 在前、包在后',async()=>{
 const out=await compile(pack('characterProfiles',{stance:[stance()],affinityCaps:[cap({note:'x'})]}));
 const {note,...s}=stance();assert.deepStrictEqual(out.characterProfiles,{stance:[s],affinityCaps:[cap()]});
 const names=[...NE.entityAliases('character',C1),...NE.entityAliases('character',C1),'测试别名'];
 const ts=[{names:['甲'],constant:[],bands:{}}];
 assert.deepStrictEqual(ST.mergeStanceProfiles(ts,out.characterProfiles.stance),[ts[0],{names,constant:['本色'],bands:{high:['高档'],low:['低档']}}]);
 const caps=AC.mergeAffinityCaps([],out.characterProfiles.affinityCaps);
 assert.deepStrictEqual(caps,[{names:NE.entityAliases('enemy',EN),cap:tierMax('acquainted'),reason:'理由',liftedBy:'解除'}]);
 const st=await loadWithCatalog('src/modules/scenarioMods/stanceProfiles.ts',{...CONTENT_PACKS,characterProfiles:out.characterProfiles});
 assert.equal(st.hasStanceProfile('测试别名'),true);assert.match(st.formatStanceProfile('测试别名','high'),/本色（任何档位不变）：本色[\s\S]*本档形态：高档/);
 assert.equal(st.formatStanceProfile('测试别名','mid').includes('本档形态'),false);
 const ac=await loadWithCatalog('src/modules/scenarioMods/affinityCaps.ts',{...CONTENT_PACKS,characterProfiles:out.characterProfiles});
 assert.deepStrictEqual(ac.AFFINITY_CAPS.at(-1),caps[0]);assert.equal(ac.AFFINITY_CAPS.length,AC.TS_AFFINITY_CAPS.length+1);
});

test('characterProfiles 反例：实体、kind、名字为空或跨条重复、档位、字段、与 TS 表重名',async()=>{
 const R=(v,re)=>rejects(pack('characterProfiles',v),re);
 await R({stance:[stance({entities:[{kind:'character',id:'test.character.nobody'}]})]},/characterProfiles\.stance\.0: unknown character test\.character\.nobody/);
 await R({stance:[stance({entities:[{kind:'faction',id:C1}]})]},/characterProfiles\.stance\.0: invalid fields/);
 await R({stance:[stance({entities:[],extraNames:undefined})]},/characterProfiles\.stance\.0: no names/);
 await R({stance:[stance(),stance({entities:[{kind:'character',id:C2}]})]},/characterProfiles\.stance\.1: name 测试别名 already in characterProfiles\.stance\.0/);
 await R({stance:[stance({bands:{peak:['x']}})]},/invalid constant\/bands/);
 await R({stance:[stance({constant:'本色'})]},/invalid constant\/bands/);
 await R({affinityCaps:[cap({reason:''})]},/characterProfiles\.affinityCaps\.0: invalid capTier\/reason\/liftedBy/);
 await R({affinityCaps:[cap({capTier:'test_tier'})]},/characterProfiles\.affinityCaps\.0: unknown capTier test_tier/);
 await R({affinityCaps:[cap({cap:30})]},/affinityCaps\.0: invalid fields/);
 // 姿态与上限是两张表：同一个人可以两边都有
 assert.equal((await compile(pack('characterProfiles',{stance:[stance()],affinityCaps:[cap({entities:[{kind:'character',id:C1}]})]}))).characterProfiles.affinityCaps.length,1);
 await withTsArray(ST.TS_STANCE_PROFILES,[...ST.TS_STANCE_PROFILES,{names:['测试别名'],constant:[],bands:{}}],()=>R({stance:[stance()]},/characterProfiles\.stance\.0: name 测试别名 also in stanceProfiles\.ts STANCE_PROFILES/));
 await withTsArray(AC.TS_AFFINITY_CAPS,[...AC.TS_AFFINITY_CAPS,{names:NE.entityAliases('enemy',EN),cap:1,reason:'x',liftedBy:'y'}],()=>R({affinityCaps:[cap()]},/characterProfiles\.affinityCaps\.0: name .+ also in affinityCaps\.ts AFFINITY_CAPS/));
});

// —— ifBranches ——
const branch=(patch={})=>({note:'来源',eventId:E1,branchId:'test.if_branch',requiredCharacterId:C1,acceptedStatuses:['alive','longrest'],flagCharacterSlug:'test_slug',normalizedStatus:'longrest',prompt:'分支提示',...patch});
const consequence=(patch={})=>({eventId:E2,requiredCharacterId:C1,acceptedStatuses:['missing'],flagKey:'world.test.active',flagValue:true,prompt:'后果提示',...patch});
const ifb=(patch={})=>({branches:[branch()],consequences:[consequence()],prompts:{'offscreen.test.war':'场外提示'},...patch});
test('ifBranches：acceptedStatuses 编译成与原表同形的正则（现有每条都能这样表达）',()=>{
 assert.deepStrictEqual(DL.acceptedStatusPattern(['dead']),/^dead$/i);
 assert.deepStrictEqual(DL.acceptedStatusPattern(['alive','longrest']),/^(alive|longrest)$/i);
 for(const rule of [...DL.TS_AUTO_BRANCH_RULES,...DL.TS_AUTO_CONSEQUENCE_RULES]){
  const m=rule.acceptedStatuses.source.match(/^\^(?:\(([a-z|]+)\)|([a-z]+))\$$/);assert.ok(m&&rule.acceptedStatuses.flags==='i',`不能用字符串数组表达：${rule.acceptedStatuses}`);
  assert.deepStrictEqual(DL.acceptedStatusPattern((m[1]||m[2]).split('|')),rule.acceptedStatuses);
 }
});

test('ifBranches 正例：剥 note；TS 在前、包在后；对账、落旗标与分歧提示读合并值（提示顺序：分支 → 分歧 id → 后果）',async()=>{
 const out=await compile(pack('ifBranches',ifb({consequences:[consequence({note:'x'})]})));
 const {note,...b}=branch();assert.deepStrictEqual(out.ifBranches,{branches:[b],consequences:[consequence()],prompts:{'offscreen.test.war':'场外提示'}});
 const ts={branches:[{eventId:E3,branchId:'test.ts',requiredCharacterId:C1,acceptedStatuses:/^dead$/i,flagCharacterSlug:'t',normalizedStatus:'dead'}],consequences:[],prompts:{'test.ts_prompt':'t'}};
 const merged=DL.mergeIfBranches(ts,out.ifBranches);
 assert.deepEqual(merged.branches.map(r=>r.branchId),['test.ts','test.if_branch']);assert.deepEqual(Object.keys(merged.prompts),['test.ts_prompt','offscreen.test.war']);
 assert.deepStrictEqual(merged.branches[1].acceptedStatuses,/^(alive|longrest)$/i);
 assert.throws(()=>DL.mergeIfBranches({...ts,branches:[{...ts.branches[0],branchId:'test.if_branch'}]},out.ifBranches),/if branch test\.if_branch: duplicate/);
 assert.throws(()=>DL.mergeIfBranches({...ts,prompts:{'offscreen.test.war':'x'}},out.ifBranches),/divergence prompt offscreen\.test\.war: duplicate/);
 const dl=await loadWithCatalog('src/modules/scenarioMods/divergenceLedger.ts',{...CONTENT_PACKS,ifBranches:out.ifBranches});
 assert.equal(dl.resolveReconcileBranchId({id:E1,verdict:'void',evidence:'',characterStates:{[C1]:' ALIVE '}}),'test.if_branch');
 assert.equal(dl.resolveReconcileBranchId({id:E1,verdict:'void',evidence:'',characterStates:{[C1]:'dead'}}),undefined);
 assert.equal(dl.resolveReconcileBranchId({id:E1,verdict:'done',evidence:'',characterStates:{[C1]:'alive'}}),undefined);
 const runtime={flags:{}};
 dl.recordReconcileDivergences(runtime,[{id:E1,verdict:'void',evidence:'证据',worldDelta:'他活下来了',characterStates:{[C1]:'Alive'}},{id:E2,verdict:'void',evidence:'证据',worldDelta:'他不见了',characterStates:{[C1]:'missing'}}]);
 assert.equal(runtime.flags['branch.test.if_branch.active'],true);assert.equal(runtime.flags['character.test_slug.status'],'longrest');assert.equal(runtime.flags['world.test.active'],true);
 dl.recordOffscreenDivergence(runtime,{id:'offscreen.test.war',eventId:E3,worldDelta:'打完了',evidence:'引擎'});
 const prompt=dl.formatDivergencePrompt(runtime.divergences);
 assert.match(prompt,/他活下来了（人物状态：[^）]+）；分支提示/);assert.match(prompt,/他不见了（人物状态：[^）]+）；后果提示/);assert.match(prompt,/打完了；场外提示/);
 // 后果提示的状态匹配不 trim（同原三元式）；落旗标的匹配 trim
 const item={id:'d1',eventId:E2,worldDelta:'空格',characterStates:[{characterId:C1,status:' missing'}],evidence:'',sequence:1};
 assert.doesNotMatch(dl.formatDivergencePrompt([item]),/后果提示/);
 // 分支没有 prompt 时继续按分歧 id 找
 const dl2=await loadWithCatalog('src/modules/scenarioMods/divergenceLedger.ts',{...CONTENT_PACKS,ifBranches:{...out.ifBranches,branches:[{...b,prompt:undefined}]}});
 assert.match(dl2.formatDivergencePrompt([{id:'offscreen.test.war',eventId:E1,branchId:'test.if_branch',worldDelta:'w',characterStates:[],evidence:'',sequence:1}]),/w；场外提示/);
});

test('ifBranches 反例：事件、角色、状态写法、重复（含跨包归属）、字段、与 TS 表重复',async()=>{
 const R=(v,re)=>rejects(pack('ifBranches',v),re);
 await R([ifb()],/test\.core\.ifBranches: expected object/);
 await R(ifb({branches:[branch({eventId:NEW_ID})]}),/ifBranches branch test\.if_branch: unknown event test\.event\.not_yet_written/);
 await R(ifb({branches:[branch({requiredCharacterId:'test.character.nobody'})]}),/unknown character test\.character\.nobody/);
 await R(ifb({branches:[branch({acceptedStatuses:['Alive']})]}),/ifBranches branch test\.if_branch: invalid fields/);
 await R(ifb({branches:[branch({acceptedStatuses:[]})]}),/invalid fields/);
 await R(ifb({branches:[branch({acceptedStatuses:['dead','dead']})]}),/invalid fields/);
 await R(ifb({branches:[branch({normalizedStatus:'Long rest'})]}),/invalid fields/);
 await R(ifb({branches:[branch(),branch()]}),/ifBranch id test\.if_branch defined by both|duplicate branchId/);
 await rejects({a:{id:'test.a',ifBranches:['x.json'],files:{'x.json':ifb({consequences:[],prompts:{}})}},b:{id:'test.b',ifBranches:['x.json'],files:{'x.json':ifb({consequences:[],prompts:{}})}}},/ifBranch id test\.if_branch defined by both test\.a and test\.b/);
 await R(ifb({consequences:[consequence({flagValue:{x:1}})]}),/ifBranches consequence \S+: invalid fields/);
 await R(ifb({consequences:[consequence(),consequence()]}),/duplicate consequence for /);
 await R(ifb({prompts:{'offscreen.test.war':''}}),/ifBranches prompt offscreen\.test\.war: invalid/);
 await rejects({a:{id:'test.a',ifBranches:['x.json'],files:{'x.json':{prompts:{'offscreen.test.war':'a'}}}},b:{id:'test.b',ifBranches:['x.json'],files:{'x.json':{prompts:{'offscreen.test.war':'b'}}}}},/prompt offscreen\.test\.war: appears twice/);
 await withTsArray(DL.TS_AUTO_BRANCH_RULES,[...DL.TS_AUTO_BRANCH_RULES,{...branch(),acceptedStatuses:/^alive$/i}],()=>R(ifb(),/ifBranches branch test\.if_branch: also in divergenceLedger\.ts TS_AUTO_BRANCH_RULES/));
 await withTsArray(DL.TS_AUTO_CONSEQUENCE_RULES,[...DL.TS_AUTO_CONSEQUENCE_RULES,{...consequence(),acceptedStatuses:/^missing$/i}],()=>R(ifb(),/also in divergenceLedger\.ts TS_AUTO_CONSEQUENCE_RULES/));
 await withTsAdded(DL.TS_DIVERGENCE_PROMPTS,{'offscreen.test.war':'x'},()=>R(ifb(),/ifBranches prompt offscreen\.test\.war: also in divergenceLedger\.ts TS_DIVERGENCE_PROMPTS/));
});

// —— 归属 ——
test('归属检查扫得到新段：引用包内关的事件要 dependsOn；人物任务 id 只能一个包定义',async()=>{
 const a={id:'test.a',texts:['texts.json'],files:{'texts.json':await read(join(qinDir,'qin-texts.json'))}};
 const qinStage=await read(join(qinDir,'stage-qin-xianyang.json'));const QS=qinStage.manifest.id,QE=qinStage.scenario.events[0].id;
 const b={id:'test.b',dependsOn:['test.a'],stages:['stage.json'],files:{'stage.json':qinStage}};
 const owned=/test\.c references \S+ owned by test\.b; add dependsOn/;
 const c=(kind,value,deps)=>({id:'test.c',[kind]:['f.json'],files:{'f.json':value},...(deps?{dependsOn:['test.b']}:{})});
 const lineId=lcLine();
 await withTsLines(TS_LINE||[synthTsLine],async()=>{
  await rejects({a,b,c:c('lineCriticalEvents',[{eventId:QE,lineId}])},owned);
  assert.equal((await compile({a,b,c:c('lineCriticalEvents',[{eventId:QE,lineId}],true)})).lineCriticalEvents[0].eventId,QE);
 });
 await rejects({a,b,c:c('characterBeats',{highlights:[highlight({eventIds:[QE]})]})},owned);
 await rejects({a,b,c:c('ifBranches',{branches:[branch({eventId:QE})]})},owned);
 await rejects({a,b,c:c('characterProfiles',{stance:[stance({extraNames:[QS]})]})},owned);
 await rejects({x:{id:'test.x',characterBeats:['f.json'],files:{'f.json':{quests:[quest()]}}},y:{id:'test.y',characterBeats:['f.json'],files:{'f.json':{quests:[quest()]}}}},/characterQuest id test_quest defined by both test\.x and test\.y/);
});

// B2 裁定：人物任务 id 是 characterBeats 段内的单独命名空间，不进通用归属扫描（核心包场面合同里有与人物任务 id 同名的局部 id）
test('归属：人物任务 id 不进通用扫描——别的包里同名的普通字符串不算引用；同一人物任务 id 两个包定义仍报错；人物拍点的事件照常要 dependsOn',async()=>{
 const holder={id:'test.holder',characterBeats:['f.json'],files:{'f.json':{quests:[quest()]}}};
 // 别的包（无依赖）里出现与人物任务 id 同名的字符串（stance 的 extraNames 是进通用扫描的自由字符串）：整串、a:b 拆段、账本前缀尾
 const other={id:'test.other',characterProfiles:['f.json'],files:{'f.json':{stance:[stance({extraNames:['test_quest','party:test_quest','flags.test_quest']})]}}};
 const out=await compile({holder,other});
 assert.deepEqual(out.characterBeats.quests.map(q=>q.id),['test_quest']);
 // 反方向（人物包不依赖别的包）也不触发
 await compile({holder:{...holder,dependsOn:['test.other']},other});
 // 两个包定义同一人物任务 id：不论有没有依赖都报错
 await rejects({holder,y:{id:'test.y',dependsOn:['test.holder'],characterBeats:['f.json'],files:{'f.json':{quests:[quest({name:'另一人'})]}}}},/characterQuest id test_quest defined by both test\.holder and test\.y/);
 // 人物拍点引用包内关的事件：不写 dependsOn 仍报错
 const a={id:'test.a',texts:['texts.json'],files:{'texts.json':await read(join(qinDir,'qin-texts.json'))}};
 const qinStage=await read(join(qinDir,'stage-qin-xianyang.json'));const QE=qinStage.scenario.events[0].id;
 const b={id:'test.b',dependsOn:['test.a'],stages:['stage.json'],files:{'stage.json':qinStage}};
 const beatQuest={quests:[quest({beats:[{reviewSummary:'包内关事件',status:'ready',eventIds:[QE]}]})]};
 await rejects({a,b,c:{id:'test.c',characterBeats:['f.json'],files:{'f.json':beatQuest}}},/test\.c references \S+ owned by test\.b; add dependsOn/);
 assert.equal((await compile({a,b,c:{id:'test.c',dependsOn:['test.b'],characterBeats:['f.json'],files:{'f.json':beatQuest}}})).characterBeats.quests[0].beats[0].eventIds[0],QE);
});

// B3 裁定：主轴 stages[].pillars 是编译期按枚举校验的闭集，不是 id 引用，不进通用归属扫描（核心包主轴的 "taiquan" 与太泉包的线 id 同名，太泉包依赖核心包）；只跳这一个字段
test('归属：storyAxis 的 pillars 不进通用扫描——与别的包的线 id 同名不要求 dependsOn；storyAxis 里真正的跨包 id 引用仍要 dependsOn；枚举外的值仍编译报错',()=>withTsLines([],()=>withEmptyAxis(async()=>{
 const lines={id:'test.lines',secondaryLines:['l.json'],files:{'l.json':[line({id:'taiquan'})]}};
 const axisPack=(patch,extra={})=>({id:'test.axis',storyAxis:['a.json'],files:{'a.json':axis(patch)},...extra});
 // 正例：pillars 取值与 test.lines 定义的线 id 同名，test.axis 不依赖 test.lines，编译通过
 const out=await compile({lines,axis:axisPack({stages:[{stageId:S,role:'测试关',pillars:['bloodline','taiquan']}]})});
 assert.deepEqual(out.storyAxis.stages[0].pillars,['bloodline','taiquan']);assert.deepEqual(out.secondaryLines.map(l=>l.id),['taiquan']);
 // 反例：storyAxis 里 pillars 以外的字段引用别的包定义的关（同一条 stages 的 stageId、节点的 stageId／eventId），不写 dependsOn 仍报错
 const a={id:'test.a',texts:['texts.json'],files:{'texts.json':await read(join(qinDir,'qin-texts.json'))}};
 const qinStage=await read(join(qinDir,'stage-qin-xianyang.json'));const QS=qinStage.manifest.id,QE=qinStage.scenario.events[0].id;
 const b={id:'test.b',dependsOn:['test.a'],stages:['stage.json'],files:{'stage.json':qinStage}};
 const owned=/test\.axis references \S+ owned by test\.b; add dependsOn/;
 await rejects({a,b,axis:axisPack({stages:[{stageId:QS,role:'包内关',pillars:['taiquan']}]})},owned);
 await rejects({a,b,axis:axisPack({nodes:[{stageId:QS,reviewSummary:'包内关事件',status:'ready',eventId:QE}]})},owned);
 // 反例：pillars 写了枚举外的值（哪怕是别的包定义的线 id），仍按枚举编译报错
 await rejects({lines:{...lines,files:{'l.json':[line({id:'test_pillar_line'})]}},axis:axisPack({stages:[{stageId:S,role:'x',pillars:['test_pillar_line']}]})},/storyAxis\.stages\.0: invalid fields/);
})));

// —— 搬迁演练：现有 TS 表整张转写进一个合成包，临时搬空 TS 表后编译，合并值与现在逐项相同 ——
test('搬迁演练：七张 TS 表都能逐项无损写成包 JSON，编译通过，合并值 deepStrictEqual 现值',async()=>{
 const lines=SL.SECONDARY_LINES.map((l,i)=>i?{...structuredClone(l),after:SL.SECONDARY_LINES[i-1].id}:structuredClone(l));
 const lce=Object.entries(SL.LINE_CRITICAL_EVENTS).map(([eventId,lineId])=>({eventId,lineId}));
 // B2 起人物任务与高光在人物包里、TS 表为空：同二级线，取合并值转写（不取 TS 表，否则表搬空后演练合出来是空的）
 const beats={quests:structuredClone(CQ.CHARACTER_QUESTS),highlights:structuredClone(CQ.CHARACTER_HIGHLIGHTS)};
 const story={stageOrder:[...AX.STAGE_ORDER],layers:structuredClone(AX.MAIN_QUEST_LAYERS),stages:structuredClone(AX.MAIN_QUEST_STAGES),nodes:structuredClone(AX.MAIN_QUEST_NODES),requirements:structuredClone(AX.MAIN_QUEST_REQUIREMENTS)};
 // B3 起地点三张手写表在核心包里、TS 表为空：取核心包的 location-aliases.json 原样转写（含 note；同姿态一段的理由）
 const loc=await read(join(PACK_DIR,'qingyu/location-aliases.json'));
 assert.equal(Object.keys(loc.parents).length,Object.keys(LOC.LOCATION_PARENTS).length);assert.equal(Object.keys(loc.display).length,Object.keys(LOC.LOCATION_NAMES).length);
 // B4 起姿态档案与好感上限在人物包里、TS 表为空：取人物包的 profiles.json 原样转写（含 note；不取 TS 表，否则表搬空后演练合出来是空的）
 const {stance,affinityCaps}=await read(join(PACK_DIR,'characters/profiles.json'));const profiles={stance,affinityCaps};
 assert.equal(stance.length,ST.STANCE_PROFILES.length);assert.equal(affinityCaps.length,AC.AFFINITY_CAPS.length);
 // B5 起 IF 分支、后果与按 id 的提示在人物包里、三张 TS 表为空：取人物包的 if-branches.json 原样转写（含 note）；对照值是真实 catalog 段与空 TS 表的合并（即模块内部用的规则表）
 const ifs=await read(join(PACK_DIR,'characters/if-branches.json'));
 assert.equal(ifs.branches.length,CONTENT_PACKS.ifBranches.branches.length);assert.equal(ifs.consequences.length,CONTENT_PACKS.ifBranches.consequences.length);
 const before={lce:{...SL.LINE_CRITICAL_EVENTS},beats:{quests:CQ.CHARACTER_QUESTS,highlights:CQ.CHARACTER_HIGHLIGHTS},story:{stageOrder:AX.STAGE_ORDER,layers:AX.MAIN_QUEST_LAYERS,stages:AX.MAIN_QUEST_STAGES,nodes:AX.MAIN_QUEST_NODES,requirements:AX.MAIN_QUEST_REQUIREMENTS},
  loc:{canonical:LOC.mergeLocationTable('c',LOC.TS_LOCATION_ID_ALIASES,PACK_LOC.canonical),parents:{...LOC.LOCATION_PARENTS},display:{...LOC.LOCATION_NAMES}},stance:ST.STANCE_PROFILES,caps:AC.AFFINITY_CAPS,
  ifs:DL.mergeIfBranches({branches:DL.TS_AUTO_BRANCH_RULES,consequences:DL.TS_AUTO_CONSEQUENCE_RULES,prompts:DL.TS_DIVERGENCE_PROMPTS},CONTENT_PACKS.ifBranches)};
 const files={'lines.json':lines,'lce.json':lce,'beats.json':beats,'axis.json':story,'loc.json':loc,'profiles.json':profiles,'if.json':ifs};
 const manifest={id:'test.rehearsal',secondaryLines:['lines.json'],lineCriticalEvents:['lce.json'],characterBeats:['beats.json'],storyAxis:['axis.json'],locationAliases:['loc.json'],characterProfiles:['profiles.json'],ifBranches:['if.json'],files};
 const out=await withTsLines([],()=>withTsRecord(SL.TS_LINE_CRITICAL_EVENTS,{},()=>withTsArray(CQ.TS_CHARACTER_QUESTS,[],()=>withTsArray(CQ.TS_CHARACTER_HIGHLIGHTS,[],()=>withEmptyAxis(()=>
  withTsRecord(LOC.TS_LOCATION_ID_ALIASES,{},()=>withTsRecord(LOC.TS_LOCATION_PARENTS,{},()=>withTsRecord(LOC.TS_LOCATION_NAMES,{},()=>
  withTsArray(ST.TS_STANCE_PROFILES,[],()=>withTsArray(AC.TS_AFFINITY_CAPS,[],()=>withTsArray(DL.TS_AUTO_BRANCH_RULES,[],()=>withTsArray(DL.TS_AUTO_CONSEQUENCE_RULES,[],()=>withTsRecord(DL.TS_DIVERGENCE_PROMPTS,{},()=>
  compile({r:manifest}))))))))))))));
 assert.deepStrictEqual(SL.mergeSecondaryLines([],SL.resolvePackSecondaryLineTemplates(out.secondaryLines)),SL.SECONDARY_LINES);
 assert.deepStrictEqual(SL.mergeLineCriticalEvents({},out.lineCriticalEvents),before.lce);
 assert.deepStrictEqual(CQ.mergeCharacterBeats({quests:[],highlights:[]},out.characterBeats),before.beats);
 assert.deepStrictEqual(AX.resolveStoryAxis({stageOrder:[],layers:[],stages:[],nodes:[],requirements:[]},out.storyAxis),before.story);
 assert.deepStrictEqual({canonical:LOC.mergeLocationTable('c',{},out.locationAliases.canonical),parents:LOC.mergeLocationTable('p',{},out.locationAliases.parents),display:LOC.mergeLocationTable('d',{},out.locationAliases.display)},before.loc);
 assert.deepStrictEqual(ST.mergeStanceProfiles([],out.characterProfiles.stance),before.stance);
 assert.deepStrictEqual(AC.mergeAffinityCaps([],out.characterProfiles.affinityCaps),[...before.caps]);
 assert.deepStrictEqual(DL.mergeIfBranches({branches:[],consequences:[],prompts:{}},out.ifBranches),before.ifs);
 // 演练完 TS 表原样还原
 assert.equal(SL.TS_SECONDARY_LINES.length,SL.SECONDARY_LINES.length-(CONTENT_PACKS.secondaryLines||[]).length);
});
