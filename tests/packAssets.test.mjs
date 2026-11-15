// 图片挂位（catalog.assets，2026-11-16）：只建机制，不放真图。
// 现状：仓库里没有包声明 assets，catalog.assets 是三个空数组，五个解析函数全部返回 null／[]。
// 编译期正反例：在 _newbot_tmp 下的临时 packs 目录编译（照 contractRevisionsPack 的做法），不碰仓库里的包和 catalog。
// 回落链：对合成 assets 段逐级删条目，断言 fallback 依次降级。
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {compileContentPacks} from '../scripts/content-packs.mjs';
import {loadTs} from './loadTs.mjs';

const root=resolve(import.meta.dirname,'..');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const P=await loadTs('../src/modules/contentPacks/index.ts');
const A=await loadTs('../src/modules/contentPacks/assets.ts');
const XZ='liuchao.character.xiao_zi',EV='lcq.event.s02_04',EV2='lcq.event.s04_01';

// ── 现状 ──
test('现状：真实 catalog 的 assets 是三个空数组，解析函数全部返回 null／[]',()=>{
 assert.deepStrictEqual(P.CONTENT_PACKS.assets,{portraits:[],scenes:[],cg:[]});
 assert.equal(A.resolvePortrait({characterId:XZ}),null);
 assert.equal(A.resolvePortrait({characterId:XZ,outfitId:'travel',expression:'joy'}),null);
 assert.equal(A.resolveFullBody({characterId:XZ}),null);
 assert.equal(A.resolveAvatar(XZ),null);
 assert.equal(A.resolveScene({sceneType:'city',variant:'night'}),null);
 assert.deepStrictEqual(A.resolveCg(EV),[]);
 assert.equal(A.nextPortraitFallback({characterId:XZ},'x.webp'),null);
 assert.equal(A.nextSceneFallback({sceneType:'city'},'x.webp'),null);
});

// ── 编译：临时 packs 目录 ──
const withPacks=async(packs,fn)=>{
 const dir=await mkdtemp(join(root,'_newbot_tmp/pack-assets-'));
 try{
  for(const [name,{files={},...m}] of Object.entries(packs)){
   await mkdir(join(dir,name));
   await writeFile(join(dir,name,'manifest.json'),JSON.stringify({schemaVersion:1,...m}));
   for(const [f,v] of Object.entries(files))await writeFile(join(dir,name,f),JSON.stringify(v));
  }
  return await fn(()=>compileContentPacks({packsDir:dir}));
 }finally{await rm(dir,{recursive:true,force:true});}
};
const pack=(id,value,extra={})=>({id,assets:['assets.json'],files:{'assets.json':value},...extra});
const compile=packs=>withPacks(packs,c=>c());
const rejects=(packs,re)=>withPacks(packs,c=>assert.rejects(c,re));
const R=(value,re)=>rejects({a:pack('test.a',value)},re);
const bust=(x={})=>({characterId:XZ,kind:'bust',file:'characters/liuchao.character.xiao_zi/bust__default__neutral.webp',...x});

test('合成包：三类编译通过，默认值补齐成显式值，note 剥掉，排在 contractRevisions 之后',async()=>{
 const c=await compile({a:pack('test.a',{note:'作者注',
  portraits:[bust({note:'默认半身'}),
   {characterId:XZ,kind:'bust',outfitId:'travel',expression:'joy',file:'characters/liuchao.character.xiao_zi/bust__travel__joy.png'},
   {characterId:XZ,kind:'full',file:'characters/liuchao.character.xiao_zi/full__default.jpg'},
   {characterId:XZ,kind:'avatar',file:'characters/liuchao.character.xiao_zi/avatar.jpeg'}],
  scenes:[{sceneType:'city',file:'scenes/city.webp',note:'默认'},{sceneType:'city',variant:'night',file:'scenes/city__night.webp'}],
  cg:[{eventId:EV,seq:2,file:'cg/test.a/lcq.event.s02_04__2.webp'},{eventId:EV,seq:1,file:'cg/test.a/lcq.event.s02_04__1.webp',note:'首张'}]})});
 assert.deepStrictEqual(c.assets,{
  portraits:[
   {characterId:XZ,kind:'bust',outfitId:'default',expression:'neutral',file:'characters/liuchao.character.xiao_zi/bust__default__neutral.webp'},
   {characterId:XZ,kind:'bust',outfitId:'travel',expression:'joy',file:'characters/liuchao.character.xiao_zi/bust__travel__joy.png'},
   {characterId:XZ,kind:'full',outfitId:'default',file:'characters/liuchao.character.xiao_zi/full__default.jpg'},
   {characterId:XZ,kind:'avatar',file:'characters/liuchao.character.xiao_zi/avatar.jpeg'}],
  scenes:[{sceneType:'city',variant:null,file:'scenes/city.webp'},{sceneType:'city',variant:'night',file:'scenes/city__night.webp'}],
  cg:[{eventId:EV,seq:2,file:'cg/test.a/lcq.event.s02_04__2.webp'},{eventId:EV,seq:1,file:'cg/test.a/lcq.event.s02_04__1.webp'}]});
 assert.ok(Object.keys(c).indexOf('assets')>Object.keys(c).indexOf('contractRevisions'));
 // 编译产物直接喂给解析函数
 assert.deepStrictEqual(A.resolveCg(EV,c.assets).map(x=>x.seq),[1,2]);
 assert.equal(A.resolvePortrait({characterId:XZ,outfitId:'travel',expression:'joy'},c.assets).fallback,'exact');
});
test('合成包：不声明时 assets 是三个空数组；文件里三段都可省略',async()=>{
 assert.deepStrictEqual((await compile({a:{id:'test.a'}})).assets,{portraits:[],scenes:[],cg:[]});
 assert.deepStrictEqual((await compile({a:pack('test.a',{note:'空'})})).assets,{portraits:[],scenes:[],cg:[]});
});

// ── 编译期反例 ──
test('反例：立绘',async()=>{
 await R({portraits:[bust({characterId:'liuchao.character.__assets_missing__'})]},/asset portrait liuchao\.character\.__assets_missing__: unknown character/);
 // 原样比对：别名／名字不算角色 id
 await R({portraits:[bust({characterId:'小紫'})]},/unknown character/);
 await R({portraits:[{characterId:XZ,file:'a.webp'}]},/kind must be bust\/full\/avatar/);
 await R({portraits:[bust({kind:'half'})]},/kind must be bust\/full\/avatar/);
 await R({portraits:[bust({expression:'smile'})]},/expression must be neutral\/joy\/anger\/sorrow\/surprise\/shy/);
 await R({portraits:[bust({kind:'full',expression:'neutral'})]},/expression only allowed for bust/);
 await R({portraits:[bust({kind:'avatar',expression:'joy'})]},/expression only allowed for bust/);
 await R({portraits:[bust({kind:'avatar',outfitId:'default'})]},/outfitId not allowed for avatar/);
 await R({portraits:[bust({outfitId:'Travel'})]},/outfitId must match/);
 await R({portraits:[bust({pose:'x'})]},/asset portrait liuchao\.character\.xiao_zi: invalid fields/);
 await R({portraits:[bust({note:1})]},/invalid fields/);
 await R({portraits:[{kind:'bust',file:'a.webp'}]},/invalid fields/);
});
test('反例：立绘重复键（省略默认值与显式默认值视为同一个，跨包也报）',async()=>{
 await R({portraits:[bust(),bust({outfitId:'default',expression:'neutral',file:'b.webp'})]},/asset portrait liuchao\.character\.xiao_zi\/bust\/default\/neutral: duplicate/);
 await R({portraits:[bust({kind:'avatar',file:'a.webp'}),bust({kind:'avatar',file:'b.webp'})]},/asset portrait liuchao\.character\.xiao_zi\/avatar: duplicate/);
 await rejects({a:pack('test.a',{portraits:[bust({file:'a.webp'})]}),b:pack('test.b',{portraits:[bust({file:'b.webp'})]})},/asset portrait \S+ defined by both test\.a and test\.b/);
 // 不同 kind／服装／表情不算重复
 assert.equal((await compile({a:pack('test.a',{portraits:[bust({file:'a.webp'}),bust({kind:'full',file:'b.webp'}),bust({expression:'joy',file:'c.webp'}),bust({outfitId:'x',file:'d.webp'})]})})).assets.portraits.length,4);
});
test('反例：场景图',async()=>{
 await R({scenes:[{file:'a.webp'}]},/sceneType must match/);
 await R({scenes:[{sceneType:'',file:'a.webp'}]},/sceneType must match/);
 await R({scenes:[{sceneType:'City',file:'a.webp'}]},/sceneType must match/);
 await R({scenes:[{sceneType:'city night',file:'a.webp'}]},/sceneType must match/);
 await R({scenes:[{sceneType:'city',variant:null,file:'a.webp'}]},/variant must match/);
 await R({scenes:[{sceneType:'city',mood:'x',file:'a.webp'}]},/asset scene city: invalid fields/);
 await R({scenes:[{sceneType:'city',file:'a.webp'},{sceneType:'city',file:'b.webp'}]},/asset scene city: duplicate/);
 await R({scenes:[{sceneType:'city',variant:'night',file:'a.webp'},{sceneType:'city',variant:'night',file:'b.webp'}]},/asset scene city\/night: duplicate/);
 await rejects({a:pack('test.a',{scenes:[{sceneType:'city',file:'a.webp'}]}),b:pack('test.b',{scenes:[{sceneType:'city',file:'b.webp'}]})},/asset scene city defined by both test\.a and test\.b/);
});
test('反例：CG',async()=>{
 await R({cg:[{eventId:'lcq.event.__assets_missing__',seq:1,file:'a.webp'}]},/asset cg lcq\.event\.__assets_missing__#1: unknown event/);
 for(const seq of [0,-1,1.5,'1',undefined])await R({cg:[{eventId:EV,seq,file:'a.webp'}]},/seq must be a positive integer/);
 await R({cg:[{eventId:EV,seq:1,file:'a.webp'},{eventId:EV,seq:1,file:'b.webp'}]},/asset cg lcq\.event\.s02_04#1: duplicate/);
 await rejects({a:pack('test.a',{cg:[{eventId:EV,seq:1,file:'a.webp'}]}),b:pack('test.b',{cg:[{eventId:EV,seq:1,file:'b.webp'}]})},/asset cg lcq\.event\.s02_04#1 defined by both test\.a and test\.b/);
 await R({cg:[{eventId:EV,seq:1,file:'a.webp',caption:'x'}]},/invalid fields/);
 // 同事件不同 seq、不同事件同 seq 都不算重复
 assert.equal((await compile({a:pack('test.a',{cg:[{eventId:EV,seq:1,file:'a.webp'},{eventId:EV,seq:2,file:'b.webp'},{eventId:EV2,seq:1,file:'c.webp'}]})})).assets.cg.length,3);
});
test('反例：file 路径与扩展名；同一 file 只许声明一次（跨类、跨包）',async()=>{
 const bad=/file must be a relative path/;
 for(const file of ['/scenes/a.webp','scenes/../a.webp','..\\a.webp','scenes\\a.webp','scenes//a.webp','scenes/a.webp/','scenes/a.gif','scenes/a.WEBP','scenes/a',1,undefined])
  await R({scenes:[{sceneType:'city',file}]},bad);
 await R({cg:[{eventId:EV,seq:1,file:'../a.png'}]},bad);
 await R({portraits:[bust({file:'/a.png'})]},bad);
 await R({scenes:[{sceneType:'city',file:'x.webp'}],cg:[{eventId:EV,seq:1,file:'x.webp'}]},/asset file x\.webp: duplicate/);
 await rejects({a:pack('test.a',{scenes:[{sceneType:'city',file:'x.webp'}]}),b:pack('test.b',{scenes:[{sceneType:'town',file:'x.webp'}]})},/asset file x\.webp defined by both test\.a and test\.b/);
});
test('反例：文件与 manifest 段的形状、未知顶层键',async()=>{
 await R([],/test\.a\.assets: expected object/);
 await R({portraits:[],bgm:[]},/test\.a\.assets: expected object/);
 await R({note:1},/test\.a\.assets: expected object/);
 await R({portraits:{}},/test\.a\.assets\.portraits: expected array/);
 await rejects({a:{id:'test.a',assets:'assets.json'}},/test\.a\.assets: expected file list/);
});
test('归属：CG 引用别包关内事件要 dependsOn，写了就通过',async()=>{
 const qinDir=join(root,'src/modules/contentPacks/packs/qin');
 const a={id:'test.a',texts:['texts.json'],files:{'texts.json':await read(join(qinDir,'qin-texts.json'))}};
 const qinStage=await read(join(qinDir,'stage-qin-xianyang.json'));const QE=qinStage.scenario.events[0].id;
 const b={id:'test.b',dependsOn:['test.a'],stages:['stage.json'],files:{'stage.json':qinStage}};
 const cg={cg:[{eventId:QE,seq:1,file:'cg/test.c/x__1.webp'}]};
 await rejects({a,b,c:pack('test.c',cg)},/test\.c references \S+ owned by test\.b; add dependsOn/);
 assert.equal((await compile({a,b,c:pack('test.c',cg,{dependsOn:['test.b']})})).assets.cg[0].eventId,QE);
});

// ── 回落链（合成数据） ──
const FULL={
 portraits:[
  {characterId:XZ,kind:'bust',outfitId:'travel',expression:'joy',file:'b_travel_joy.webp'},
  {characterId:XZ,kind:'bust',outfitId:'travel',expression:'neutral',file:'b_travel_neutral.webp'},
  {characterId:XZ,kind:'bust',outfitId:'default',expression:'neutral',file:'b_default_neutral.webp'},
  {characterId:XZ,kind:'avatar',file:'avatar.webp'},
  {characterId:XZ,kind:'full',outfitId:'travel',file:'full_travel.webp'},
  {characterId:XZ,kind:'full',outfitId:'default',file:'full_default.webp'},
  {characterId:'liuchao.character.other',kind:'bust',outfitId:'travel',expression:'joy',file:'other.webp'}],
 scenes:[{sceneType:'city',variant:'night',file:'city_night.webp'},{sceneType:'city',variant:null,file:'city.webp'},{sceneType:'town',variant:'night',file:'town_night.webp'}],
 cg:[{eventId:EV,seq:3,file:'c3.webp'},{eventId:EV2,seq:1,file:'other_cg.webp'},{eventId:EV,seq:1,file:'c1.webp'},{eventId:EV,seq:2,file:'c2.webp'}]};
const REQ={characterId:XZ,outfitId:'travel',expression:'joy'};
const without=(...files)=>({...FULL,portraits:FULL.portraits.filter(p=>!files.includes(p.file)),scenes:FULL.scenes.filter(p=>!files.includes(p.file))});

test('立绘回落：逐级删掉一条，fallback 依次 exact → outfitNeutral → defaultNeutral → avatar → null',()=>{
 const order=['b_travel_joy.webp','b_travel_neutral.webp','b_default_neutral.webp','avatar.webp'];
 const expected=[['exact','b_travel_joy.webp'],['outfitNeutral','b_travel_neutral.webp'],['defaultNeutral','b_default_neutral.webp'],['avatar','avatar.webp']];
 for(let i=0;i<=order.length;i++){
  const r=A.resolvePortrait(REQ,without(...order.slice(0,i)));
  if(i===order.length)assert.equal(r,null);
  else assert.deepStrictEqual([r.fallback,r.file],expected[i],`删掉前 ${i} 级`);
 }
 assert.deepStrictEqual(A.resolvePortrait(REQ,FULL),{file:'b_travel_joy.webp',kind:'bust',outfitId:'travel',expression:'joy',fallback:'exact'});
 assert.deepStrictEqual(A.resolvePortrait(REQ,without(...order.slice(0,3))),{file:'avatar.webp',kind:'avatar',fallback:'avatar'});
});
test('立绘回落：省略服装／表情按 default＋neutral；同一条目只在链上出现一次',()=>{
 assert.deepStrictEqual(A.portraitCandidates({characterId:XZ},FULL).map(c=>[c.fallback,c.file]),[['exact','b_default_neutral.webp'],['avatar','avatar.webp']]);
 assert.deepStrictEqual(A.portraitCandidates({characterId:XZ,outfitId:'travel'},FULL).map(c=>c.fallback),['exact','defaultNeutral','avatar']);
 assert.equal(A.resolvePortrait({characterId:'liuchao.character.nobody'},FULL),null);
});
test('nextPortraitFallback：加载失败后逐级往下，最后一级之后、不在链上的文件返回 null',()=>{
 const steps=[];let file='b_travel_joy.webp';
 for(let r;(r=A.nextPortraitFallback(REQ,file,FULL));file=r.file)steps.push(r.fallback);
 assert.deepStrictEqual(steps,['outfitNeutral','defaultNeutral','avatar']);
 assert.equal(A.nextPortraitFallback(REQ,'avatar.webp',FULL),null);
 assert.equal(A.nextPortraitFallback(REQ,'not-in-chain.webp',FULL),null);
 // 缺级时跳过
 assert.equal(A.nextPortraitFallback(REQ,'b_travel_joy.webp',without('b_travel_neutral.webp')).fallback,'defaultNeutral');
});
test('全身：指定服装 → default → null；头像：只取头像，不拿半身图顶',()=>{
 assert.equal(A.resolveFullBody({characterId:XZ,outfitId:'travel'},FULL).file,'full_travel.webp');
 assert.equal(A.resolveFullBody({characterId:XZ,outfitId:'winter'},FULL).file,'full_default.webp');
 assert.equal(A.resolveFullBody({characterId:XZ},FULL).file,'full_default.webp');
 assert.equal(A.resolveFullBody({characterId:XZ,outfitId:'winter'},without('full_default.webp')),null);
 assert.equal(A.resolveAvatar(XZ,FULL).file,'avatar.webp');
 assert.equal(A.resolveAvatar(XZ,{...FULL,portraits:FULL.portraits.filter(p=>p.kind!=='avatar')}),null);
 assert.equal(A.resolveAvatar('liuchao.character.other',FULL),null,'other 只有半身图');
});
test('场景回落：指定变体 → 该类型默认 → null；nextSceneFallback 两级',()=>{
 assert.equal(A.resolveScene({sceneType:'city',variant:'night'},FULL).file,'city_night.webp');
 assert.equal(A.resolveScene({sceneType:'city',variant:'rain'},FULL).file,'city.webp');
 assert.equal(A.resolveScene({sceneType:'city'},FULL).file,'city.webp');
 assert.equal(A.resolveScene({sceneType:'city',variant:'night'},without('city_night.webp')).file,'city.webp');
 assert.equal(A.resolveScene({sceneType:'city',variant:'night'},without('city_night.webp','city.webp')),null);
 assert.equal(A.resolveScene({sceneType:'town'},FULL),null,'town 没有默认图');
 assert.equal(A.nextSceneFallback({sceneType:'city',variant:'night'},'city_night.webp',FULL).file,'city.webp');
 assert.equal(A.nextSceneFallback({sceneType:'city',variant:'night'},'city.webp',FULL),null);
 assert.equal(A.nextSceneFallback({sceneType:'town',variant:'night'},'town_night.webp',FULL),null);
});
test('CG：该事件全部条目按 seq 升序，不改原数组；没有返回 []',()=>{
 const before=JSON.stringify(FULL.cg);
 assert.deepStrictEqual(A.resolveCg(EV,FULL).map(c=>c.file),['c1.webp','c2.webp','c3.webp']);
 assert.equal(JSON.stringify(FULL.cg),before);
 assert.deepStrictEqual(A.resolveCg('lcq.event.none',FULL),[]);
});
