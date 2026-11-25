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
test('现状：真实 catalog 登记了立绘（全是全身 full，31 人 67 张，每人都有 default）和场景图 46 张（第一批 37、南荒第二批 9），CG 还是空的',()=>{
 const {portraits,scenes,cg}=P.CONTENT_PACKS.assets;
 assert.deepStrictEqual(cg,[]);
 assert.equal(scenes.length,46);
 assert.ok(scenes.every(s=>s.file===`scenes/${s.sceneType}${s.variant?`__${s.variant}`:''}.webp`));
 assert.deepStrictEqual(scenes.filter(s=>s.variant).map(s=>`${s.sceneType}/${s.variant}`),['street/night','inn/night','palace/night','barracks/night','forest/night','chamber/night','loc_caravan_camp/night','loc_sheyi/night']);
 assert.equal(portraits.length,67);
 assert.ok(portraits.every(p=>p.kind==='full'&&p.file===`characters/${p.characterId}/full__${p.outfitId}.webp`));
 const ids=[...new Set(portraits.map(p=>p.characterId))];
 assert.equal(ids.length,31);
 for(const id of ids)assert.equal(A.resolveFullBody({characterId:id})?.outfitId,'default',id);
 assert.equal(A.resolveFullBody({characterId:XZ})?.file,`characters/${XZ}/full__default.webp`);
 assert.equal(A.resolveFullBody({characterId:XZ,outfitId:'travel'})?.outfitId,'default');
 assert.equal(A.resolvePortrait({characterId:XZ}),null);
 assert.equal(A.resolveAvatar(XZ),null);
 assert.equal(A.resolveFullBody({characterId:'lcq.character.duan_qiang'}),null);
 assert.equal(A.resolveScene({sceneType:'city',variant:'night'}),null);
 assert.deepStrictEqual(A.resolveCg(EV),[]);
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
  cg:[{eventId:EV,seq:2,file:'cg/test.a/lcq.event.s02_04__2.webp'},{eventId:EV,seq:1,file:'cg/test.a/lcq.event.s02_04__1.webp'}],
  locationScenes:[]});
 assert.ok(Object.keys(c).indexOf('assets')>Object.keys(c).indexOf('contractRevisions'));
 // 编译产物直接喂给解析函数
 assert.deepStrictEqual(A.resolveCg(EV,c.assets).map(x=>x.seq),[1,2]);
 assert.equal(A.resolvePortrait({characterId:XZ,outfitId:'travel',expression:'joy'},c.assets).fallback,'exact');
});
test('合成包：不声明时 assets 是三个空数组；文件里三段都可省略',async()=>{
 assert.deepStrictEqual((await compile({a:{id:'test.a'}})).assets,{portraits:[],scenes:[],cg:[],locationScenes:[]});
 assert.deepStrictEqual((await compile({a:pack('test.a',{note:'空'})})).assets,{portraits:[],scenes:[],cg:[],locationScenes:[]});
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
// ── 地点 → 场景类型（locationScenes，2026-11-25）──
const WY='liuchao.location.wuyuan',BH='liuchao.location.baihu_shang_guan',PRISON='lcq.zone.wuyuan.water_prison';
const LS={portraits:[],cg:[],
 scenes:[{sceneType:'loc_wuyuan',variant:null,file:'loc_wuyuan.webp'},{sceneType:'street',variant:null,file:'street.webp'},{sceneType:'street',variant:'night',file:'street__night.webp'},{sceneType:'prison',variant:null,file:'prison.webp'}],
 locationScenes:[{locationId:WY,sceneTypes:['loc_wuyuan','street']},{locationId:PRISON,sceneTypes:['prison']}]};
const files=(req,a=LS)=>A.locationSceneCandidates(req,a).map(s=>s.file);
test('地点场景图：白天按 sceneTypes 先后；夜里先夜图再白天的；先写的 id 先查；没登记返回 []',()=>{
 assert.deepStrictEqual(files({locationIds:[WY]}),['loc_wuyuan.webp','street.webp']);
 assert.deepStrictEqual(files({locationIds:[WY],night:true}),['street__night.webp','loc_wuyuan.webp','street.webp']);
 assert.deepStrictEqual(files({locationIds:[PRISON,WY],night:true}),['prison.webp'],'区内节点登记了就用节点的，没有夜图用白天的');
 assert.deepStrictEqual(files({locationIds:[undefined,'lcq.zone.wuyuan.market',WY]}),['loc_wuyuan.webp','street.webp'],'节点没登记退到地点');
 assert.deepStrictEqual(files({locationIds:[BH]}),[]);
 assert.deepStrictEqual(files({locationIds:[WY]},{portraits:[],scenes:[],cg:[]}),[],'旧 catalog 没有 locationScenes 段');
});
test('合成包：locationScenes 编译通过，note 剥掉；不认识的地点、没有默认图的类型、重复、空列表都报错',async()=>{
 const scenes=[{sceneType:'street',file:'scenes/street.webp'},{sceneType:'inn',variant:'night',file:'scenes/inn__night.webp'}];
 const c=await compile({a:pack('test.a',{scenes,locationScenes:[{locationId:WY,sceneTypes:['street'],note:'先垫底'}]})});
 assert.deepStrictEqual(c.assets.locationScenes,[{locationId:WY,sceneTypes:['street']}]);
 await R({scenes,locationScenes:[{locationId:'liuchao.location.__missing__',sceneTypes:['street']}]},/asset locationScene liuchao\.location\.__missing__: unknown location/);
 await R({scenes,locationScenes:[{locationId:'五原城',sceneTypes:['street']}]},/unknown location/);
 await R({scenes,locationScenes:[{locationId:WY,sceneTypes:['inn']}]},/sceneType inn has no default scene/);
 await R({scenes,locationScenes:[{locationId:WY,sceneTypes:['town']}]},/sceneType town has no default scene/);
 await R({scenes,locationScenes:[{locationId:WY,sceneTypes:[]}]},/sceneTypes must be a non-empty list/);
 await R({scenes,locationScenes:[{locationId:WY,sceneTypes:['street','street']}]},/sceneTypes must be a non-empty list/);
 await R({scenes,locationScenes:[{locationId:WY,sceneTypes:['street']},{locationId:WY,sceneTypes:['street']}]},/asset locationScene liuchao\.location\.wuyuan: duplicate/);
 await R({scenes,locationScenes:[{locationId:WY,sceneTypes:['street'],file:'x.webp'}]},/invalid fields/);
});
test('现状：真实登记里每个地点都在总表、每个类型都有默认图；按存档位置和钟点取图',async()=>{
 const U=await loadTs('../src/composables/uiNewScene.ts');
 const {locationScenes,scenes}=P.CONTENT_PACKS.assets;
 assert.equal(locationScenes.length,110);
 for(const x of locationScenes)for(const t of x.sceneTypes)assert.ok(scenes.some(s=>s.sceneType===t&&s.variant===null),`${x.locationId}/${t}`);
 const save=(描述,小时,extra={})=>({角色:{位置:{描述,...extra}},元数据:{时间:{年:220,月:1,日:1,小时,分钟:0}}});
 const wy={locationId:WY};
 assert.deepStrictEqual(U.locationSceneFiles(save('中州·五原',10,wy)),['scenes/loc_wuyuan.webp','scenes/street.webp']);
 assert.deepStrictEqual(U.locationSceneFiles(save('中州·五原',19,wy)),['scenes/loc_wuyuan.webp','scenes/street.webp'],'黄昏算白天');
 assert.deepStrictEqual(U.locationSceneFiles(save('中州·五原',21,wy)),['scenes/street__night.webp','scenes/loc_wuyuan.webp','scenes/street.webp']);
 // 南荒第二批：蛇彝村有自己的夜图，排在山林夜图前面；铁索桥没有，夜里退回山林夜图
 const sy={locationId:'lcq.location.sheyi_village'},br={locationId:'nh.iron_bridge'};
 assert.deepStrictEqual(U.locationSceneFiles(save('南荒·蛇彝村',10,sy)),['scenes/loc_sheyi.webp','scenes/forest.webp']);
 assert.deepStrictEqual(U.locationSceneFiles(save('南荒·蛇彝村',23,sy)),['scenes/loc_sheyi__night.webp','scenes/forest__night.webp','scenes/loc_sheyi.webp','scenes/forest.webp']);
 assert.deepStrictEqual(U.locationSceneFiles(save('南荒·铁索桥',23,br)),['scenes/forest__night.webp','scenes/loc_iron_bridge.webp','scenes/forest.webp']);
 assert.deepStrictEqual(U.locationSceneFiles(save('中州·五原',3,wy)),['scenes/street__night.webp','scenes/loc_wuyuan.webp','scenes/street.webp']);
 assert.deepStrictEqual(U.locationSceneFiles(save('中州·五原·白湖商馆水牢',10,wy)),['scenes/prison.webp'],'区内节点先于地点');
 assert.deepStrictEqual(U.locationSceneFiles(save('南荒·白夷族',10,{locationId:'nh.baiyi'})),['scenes/loc_baiyi.webp','scenes/forest.webp'],'别名 id 也认');
 assert.deepStrictEqual(U.locationSceneFiles(save('南荒·花苗寨',22,{locationId:'lcq.location.huamiao_village'})),['scenes/forest__night.webp','scenes/loc_huamiao.webp','scenes/forest.webp']);
 assert.deepStrictEqual(U.locationSceneFiles(save('苍澜镇',10,{locationId:'liuchao.location.canglan'})),[],'没对上的地点不给图');
 assert.deepStrictEqual(U.locationSceneFiles(save('不知道在哪',10)),[]);
 assert.deepStrictEqual(U.locationSceneFiles(null),[]);
});
test('CG：该事件全部条目按 seq 升序，不改原数组；没有返回 []',()=>{
 const before=JSON.stringify(FULL.cg);
 assert.deepStrictEqual(A.resolveCg(EV,FULL).map(c=>c.file),['c1.webp','c2.webp','c3.webp']);
 assert.equal(JSON.stringify(FULL.cg),before);
 assert.deepStrictEqual(A.resolveCg('lcq.event.none',FULL),[]);
});
test('素材目录：src/assets 下 characters／scenes／cg 三个子目录都在，文档里的文件名约定以它们开头',async()=>{
 const {stat}=await import('node:fs/promises');
 assert.equal(A.ASSET_ROOT,'src/assets');
 assert.deepStrictEqual(A.ASSET_DIRS,{portraits:'characters',scenes:'scenes',cg:'cg'});
 const doc=await readFile(join(root,'docs/handoffs/2026-10-11/CONTENT-PACK-CONTRACT.md'),'utf8');
 for(const dir of Object.values(A.ASSET_DIRS)){
  assert.ok((await stat(join(root,A.ASSET_ROOT,dir))).isDirectory(),`${dir} 目录应存在`);
  assert.ok(doc.includes(`\`${dir}/<`),`文档的文件名约定应以 ${dir}/ 开头`);
 }
});
