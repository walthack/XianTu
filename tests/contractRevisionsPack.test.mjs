// BZ1（2026-11-12）：合同哈希迁移表 BATCH6_TEXT_CONTRACT_REVISIONS 从冻结的 runtime.ts 搬进核心包 contract-revisions.json（manifest.contractRevisions）。
// 正例：catalog.contractRevisions 与原表 12 条逐项、按顺序相等（原表写死在下面；tests/ 不进棘轮扫描）。
// 反例：在 _newbot_tmp 下的临时 packs 目录编译（照 contentPackLineFormats 的做法），不碰仓库里的包和 catalog。
// 失效守卫：哈希函数 stableContractHash 在冻结文件里且未导出，只经导出入口 migrateBatch6TextContracts 间接判定「to 是否等于当前合同哈希」，
// 断言不等的条目恰好是 s02_04、ningyu_regicide_offer、silent_sheyi_village（原样保留）。以后有人加了 to 写错的条目，这里会变红。
// 方案（BZ1 方案 3.2）只列了 s02_04、silent_sheyi_village；ningyu_regicide_offer 的 to（19003cbb）是 V03 加 intentMatch 之前的哈希，
// 实测也已不等于当前哈希，只是它在 sameDeliveryContract 名单里、旧档迁移由那条路径与 migrateV03NaturalIntentMetadata 承接，residualTablesSnapshot 看不出来。
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {compileContentPacks} from '../scripts/content-packs.mjs';
import {loadTs} from './loadTs.mjs';

const root=resolve(import.meta.dirname,'..');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const quiet=fn=>{const k=['log','info','warn','error','debug'],o=k.map(x=>console[x]);k.forEach(x=>{console[x]=()=>{};});try{return fn();}finally{k.forEach((x,i)=>{console[x]=o[i];});}};
const P=await loadTs('../src/modules/contentPacks/index.ts');
const RT=await loadTs('../src/modules/scenarioMods/runtime.ts');

/** 搬迁前 runtime.ts:1015–1049 的原表（b4a98ee1／706115a2），顺序即原对象字面量的键序。 */
const ORIGINAL=[
 ['lcq.event.geluo_summons_biji','e0119be2','f0f6dac7'],
 ['lcq.event.s02_04','f6f916da','68462843'],
 ['lcq.event.huamiao_coop_boundary','dc6ab360','b0a94a70'],
 ['lcq.event.s04_01','fbe74510','2c96d09c'],
 ['lcq.event.wuerlang_joins','e6c7f972','59e75a25'],
 ['lcq.event.ningyu_regicide_offer','88b5c491','19003cbb'],
 ['lcq.event.rainforest_black_shoal','112b54d3','5bf7c0f8'],
 ['lcq.event.silent_sheyi_village','fa40aeb2','d33e6b9d'],
 ['lcq.event.s03b_wanwu_night','d3222695','02ee3be2'],
 ['lcq.event.s03b_yinzhu_xiongerpu','c3d65b9d','c2ebe3c0'],
 ['lcq.event.ningyu_regicide_offer_ins_ningyu_reply','f27676f0','37ca6495'],
 ['lcq.event.guiwangdong_coop_pact_ins_ningyu_enter','aff4748f','569a4d8b'],
].map(([eventId,from,to])=>({eventId,from,to}));
const STALE=['lcq.event.s02_04','lcq.event.ningyu_regicide_offer','lcq.event.silent_sheyi_village'];

test('正例：catalog.contractRevisions 与原表 12 条逐项、按顺序相同，note 已剥掉',()=>{
 assert.deepStrictEqual(P.CONTENT_PACKS.contractRevisions,ORIGINAL);
 for(const r of P.CONTENT_PACKS.contractRevisions)assert.deepStrictEqual(Object.keys(r),['eventId','from','to']);
});

test('包文件：核心包 contract-revisions.json 与原表同序，两条已失效条目的 note 写明原样保留',async()=>{
 const file=await read(join(root,'src/modules/contentPacks/packs/qingyu/contract-revisions.json'));
 assert.deepStrictEqual(file.map(({note:_n,...r})=>r),ORIGINAL);
 for(const id of STALE)assert.match(file.find(r=>r.eventId===id).note,/已非当前合同哈希.*原样保留/);
});

// ── 反例：临时 packs 目录 ──
const EV='lcq.event.s02_04',EV2='lcq.event.s04_01';
const withPacks=async(packs,fn)=>{
 const dir=await mkdtemp(join(root,'_newbot_tmp/bz1-contract-revisions-'));
 try{
  for(const [name,{files={},...m}] of Object.entries(packs)){
   await mkdir(join(dir,name));
   await writeFile(join(dir,name,'manifest.json'),JSON.stringify({schemaVersion:1,...m}));
   for(const [f,v] of Object.entries(files))await writeFile(join(dir,name,f),JSON.stringify(v));
  }
  return await fn(()=>compileContentPacks({packsDir:dir}));
 }finally{await rm(dir,{recursive:true,force:true});}
};
const pack=(id,rows,extra={})=>({id,contractRevisions:['contract-revisions.json'],files:{'contract-revisions.json':rows},...extra});
const compile=packs=>withPacks(packs,c=>c());
const rejects=(packs,re)=>withPacks(packs,c=>assert.rejects(c,re));

test('合成包：编译通过，按包内顺序进 catalog 末段，note 剥掉',async()=>{
 const c=await compile({a:pack('test.a',[{eventId:EV2,note:'作者注',from:'00000001',to:'00000002'},{eventId:EV,from:'0000000a',to:'0000000b'}])});
 assert.deepStrictEqual(c.contractRevisions,[{eventId:EV2,from:'00000001',to:'00000002'},{eventId:EV,from:'0000000a',to:'0000000b'}]);
 // 末段：排在 compassConditions 之后（阶段 2b 的 worldEvents 也在末段，两者先后不作约束）
 assert.ok(Object.keys(c).indexOf('contractRevisions')>Object.keys(c).indexOf('compassConditions'));
});
test('合成包：不声明时 contractRevisions 是空数组',async()=>{
 const c=await compile({a:{id:'test.a'}});
 assert.deepStrictEqual(c.contractRevisions,[]);
});
test('反例：事件不存在',()=>rejects({a:pack('test.a',[{eventId:'lcq.event.__bz1_missing__',from:'00000001',to:'00000002'}])},/contractRevision lcq\.event\.__bz1_missing__: unknown event/));
test('反例：_ins_ 事件来自核心包人物线投影，没有核心包时不存在',()=>rejects({a:pack('test.a',[{eventId:'lcq.event.ningyu_regicide_offer_ins_ningyu_reply',from:'00000001',to:'00000002'}])},/unknown event/));
for(const [label,row] of [
 ['不是 8 位',{from:'0000001',to:'00000002'}],
 ['大写十六进制',{from:'E0119BE2',to:'00000002'}],
 ['非十六进制',{from:'00000001',to:'0000000g'}],
 ['不是字符串',{from:1,to:'00000002'}],
])test(`反例：哈希${label}`,()=>rejects({a:pack('test.a',[{eventId:EV,...row}])},/from\/to must be 8-digit lowercase hex/));
test('反例：from 等于 to',()=>rejects({a:pack('test.a',[{eventId:EV,from:'00000001',to:'00000001'}])},/from equals to/));
test('反例：多余字段、缺字段',async()=>{
 await rejects({a:pack('test.a',[{eventId:EV,from:'00000001',to:'00000002',id:'x'}])},/invalid fields/);
 await rejects({a:pack('test.a',[{eventId:EV,from:'00000001'}])},/8-digit/);
 await rejects({a:pack('test.a',[{from:'00000001',to:'00000002'}])},/invalid fields/);
 await rejects({a:pack('test.a',[{eventId:EV,from:'00000001',to:'00000002',note:1}])},/invalid fields/);
});
test('反例：文件不是数组、manifest 段不是文件列表',async()=>{
 await rejects({a:pack('test.a',{eventId:EV,from:'00000001',to:'00000002'})},/test\.a\.contractRevisions: expected array/);
 await rejects({a:{id:'test.a',contractRevisions:'contract-revisions.json'}},/test\.a\.contractRevisions: expected file list/);
});
test('反例：同包重复（同文件、跨文件）',async()=>{
 const row={eventId:EV,from:'00000001',to:'00000002'};
 await rejects({a:pack('test.a',[row,{...row,from:'00000003'}])},/contractRevision lcq\.event\.s02_04: duplicate eventId/);
 await rejects({a:{id:'test.a',contractRevisions:['x.json','y.json'],files:{'x.json':[row],'y.json':[row]}}},/duplicate eventId/);
});
test('反例：跨包重复',()=>rejects({a:pack('test.a',[{eventId:EV,from:'00000001',to:'00000002'}]),b:pack('test.b',[{eventId:EV,from:'00000003',to:'00000004'}])},/contractRevision lcq\.event\.s02_04 defined by both test\.a and test\.b/));

// ── 失效守卫：只经 migrateBatch6TextContracts（导出入口）判定 to 是否等于当前合同哈希 ──
// 当前合同 = 内置关套内容包 overlay（含人物线投影）＋包内关，同运行时、同 residualTablesSnapshot.export.mjs。
const dataDir=join(root,'src/modules/scenarioMods/builtins/data');
const BUILTINS=await Promise.all((await readdir(dataDir)).filter(f=>f.endsWith('.json')).sort().map(f=>read(join(dataDir,f))));
const EVENTS=[...BUILTINS.map(s=>P.applyContentPackOverlays(s)),...P.CONTENT_PACKS.stages].flatMap(s=>s.scenario.events);
const current=id=>EVENTS.find(e=>e.id===id);
const NINGYU='lcq.event.ningyu_regicide_offer';
/**
 * true = 该条目的 to 等于当前合同哈希。
 * 一般条目：旧档事件 = 当前事件（存档合同哈希 = 当前哈希），canonical = 当前事件。migrateBatch6TextContracts 迁移的条件
 * 「to === hash(latest) 且 hash(saved) ∈ {from,to}」此时恰好化为 to === 当前哈希（状态哈希不参与判定）。
 * ningyu_regicide_offer 在 sameDeliveryContract 名单里，saved 与 latest 同哈希时无论 to 对不对都会迁移，上法测不出；
 * 改走同一入口里先跑的 migrateV03NaturalIntentMetadata：saved = 当前事件、latest = 去掉一个动作 intentMatch 的当前事件、状态哈希 = to，
 * 它只在「状态哈希 === hash(saved)」时返回 1，于是返回值即 to === 当前哈希。
 */
const toMatchesCurrent=r=>{
 const ev=current(r.eventId);assert.ok(ev?.playerCompletionContract,`${r.eventId}: 当前事件没有合同`);
 if(r.eventId===NINGYU){
  const latest=structuredClone(ev);const a=latest.playerCompletionContract.actions.find(x=>x.intentMatch);assert.ok(a,'ningyu 合同须带 intentMatch 才能用这条判定');delete a.intentMatch;
  const run=hash=>quiet(()=>RT.migrateBatch6TextContracts({events:[structuredClone(ev)],eventActionStates:{[r.eventId]:{contractHash:hash,attemptCount:0,preparations:[],attempts:[]}}},[latest]));
  assert.equal(run('00000000'),0,'判定须能区分：无关状态哈希必须不迁移');
  return run(r.to)===1;
 }
 const runtime={events:[structuredClone(ev)],eventActionStates:{[r.eventId]:{contractHash:r.from,attemptCount:0,preparations:[],attempts:[]}}};
 const n=quiet(()=>RT.migrateBatch6TextContracts(runtime,[ev]));
 if(n)assert.equal(runtime.eventActionStates[r.eventId].contractHash,r.to,'迁移后状态哈希应重映射为 to');
 return n===1;
};

test('失效守卫：to 不等于当前合同哈希的条目恰好是 s02_04、ningyu_regicide_offer、silent_sheyi_village',()=>{
 const stale=P.CONTENT_PACKS.contractRevisions.filter(r=>!toMatchesCurrent(r)).map(r=>r.eventId);
 assert.deepStrictEqual(stale,STALE);
});
test('失效守卫的灵敏度：canonical 合同一变（哈希不再等于 to），一般条目不再迁移',()=>{
 const r=P.CONTENT_PACKS.contractRevisions.find(x=>x.eventId==='lcq.event.huamiao_coop_boundary');
 const ev=current(r.eventId),changed=structuredClone(ev);changed.playerCompletionContract.actions[0].kind=changed.playerCompletionContract.actions[0].kind==='prepare'?'complete':'prepare';
 assert.equal(quiet(()=>RT.migrateBatch6TextContracts({events:[structuredClone(ev)],eventActionStates:{}},[ev])),1);
 assert.equal(quiet(()=>RT.migrateBatch6TextContracts({events:[structuredClone(ev)],eventActionStates:{}},[changed])),0);
});
