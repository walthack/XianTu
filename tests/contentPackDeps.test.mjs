// 阶段 3a：多包、dependsOn、拓扑顺序、归属检查。夹具都在 _newbot_tmp 下的临时 packs 目录，不碰仓库里的包和 catalog。
import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {compileContentPacks} from '../scripts/content-packs.mjs';

const root=resolve(import.meta.dirname,'..');
const qinDir=join(root,'src/modules/contentPacks/packs/qin');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const QIN_STAGE='lyg.qin_xianyang',QIN_EVENT='liuchao.event.qin_hook_fangshi_rumor';

/** packs: {目录名: {manifest 其余字段, files: {文件名: 内容}}}；id 写在 manifest 里。 */
const withPacks=async(packs,fn)=>{
 const dir=await mkdtemp(join(root,'_newbot_tmp/stage3a-deps-'));
 try{
  for(const [name,{files={},...m}] of Object.entries(packs)){
   await mkdir(join(dir,name));
   await writeFile(join(dir,name,'manifest.json'),JSON.stringify({schemaVersion:1,...m}));
   for(const [f,v] of Object.entries(files))await writeFile(join(dir,name,f),JSON.stringify(v));
  }
  return await fn(()=>compileContentPacks({packsDir:dir}));
 }finally{await rm(dir,{recursive:true,force:true});}
};
const texts=(id,t)=>({id,texts:['texts.json'],files:{'texts.json':t}});
// 包 a 只有秦关正文，包 b 只有秦关（194 处 $text 全指向 a 的键）
const qinTextsPack=async(extra={})=>({id:'test.a',texts:['texts.json'],files:{'texts.json':{...await read(join(qinDir,'qin-texts.json')),...extra}}});
const qinStagePack=async(m={})=>({id:'test.b',stages:['stage.json'],files:{'stage.json':await read(join(qinDir,'stage-qin-xianyang.json'))},...m});

test('dependsOn must name existing other packs, without duplicates or cycles',async()=>{
 await withPacks({a:{...texts('test.a',{'k.a':'甲'}),dependsOn:['test.nope']}},async compile=>assert.rejects(compile,/test\.a\.dependsOn: unknown pack test\.nope/));
 await withPacks({a:{...texts('test.a',{'k.a':'甲'}),dependsOn:['test.a']}},async compile=>assert.rejects(compile,/test\.a\.dependsOn: depends on itself/));
 await withPacks({a:{...texts('test.a',{'k.a':'甲'}),dependsOn:'test.b'},b:texts('test.b',{'k.b':'乙'})},async compile=>assert.rejects(compile,/test\.a\.dependsOn: expected string array/));
 await withPacks({a:{...texts('test.a',{'k.a':'甲'}),dependsOn:['test.b','test.b']},b:texts('test.b',{'k.b':'乙'})},async compile=>assert.rejects(compile,/test\.a\.dependsOn: duplicate entry/));
 await withPacks({a:{...texts('test.a',{'k.a':'甲'}),dependsOn:['test.b']},b:{...texts('test.b',{'k.b':'乙'}),dependsOn:['test.a']}},async compile=>assert.rejects(compile,/dependsOn cycle test\.a → test\.b → test\.a/));
});

test('compile order follows dependsOn, then directory name',async()=>{
 const packs={a1:texts('test.late',{'k.late':'后'}),z9:texts('test.early',{'k.early':'先'})};
 await withPacks(packs,async compile=>assert.deepEqual(Object.keys((await compile()).texts),['k.late','k.early'],'without dependsOn: directory order'));
 packs.a1.dependsOn=['test.early'];
 await withPacks(packs,async compile=>assert.deepEqual(Object.keys((await compile()).texts),['k.early','k.late'],'a1 depends on z9, so z9 compiles first'));
});

test('the same id defined by two packs fails with both owners named',async()=>{
 await withPacks({a:texts('test.a',{'test.same':'甲'}),b:texts('test.b',{'test.same':'乙'})},async compile=>assert.rejects(compile,/text id test\.same defined by both test\.a and test\.b/));
});

test('$text into another pack needs dependsOn',async()=>{
 const a=await qinTextsPack();
 await withPacks({a,b:await qinStagePack()},async compile=>assert.rejects(compile,/test\.b references qin\.\S+ owned by test\.a; add dependsOn/));
 await withPacks({a,b:await qinStagePack({dependsOn:['test.a']})},async compile=>{
  const out=await compile();const original=(await read(join(qinDir,'stage-qin-xianyang.json'))).scenario.opening.text.$text;
  assert.equal(out.stages[0].scenario.opening.text,a.files['texts.json'][original]);
 });
});

test('event ids and done.<event> paths into another pack need dependsOn',async()=>{
 const a=await qinTextsPack(),b=await qinStagePack({dependsOn:['test.a']});
 // 地图路线的 unlockWhen 只放事件 id（起止地点来自 mod-kit，不归任何包）
 const route={id:'test.route',fromId:'liuchao.location.xianyang',toId:'liuchao.location.xianyang_villa',dayCost:1,unlockWhen:[QIN_EVENT]};
 await withPacks({a,b,c:{id:'test.c',mapRoutes:['routes.json'],files:{'routes.json':[route]}}},async compile=>assert.rejects(compile,new RegExp(`test\\.c references ${QIN_EVENT.replaceAll('.','\\.')} owned by test\\.b`)));
 const compass={version:1,lines:[{lineId:'qin',knownWhen:[{path:`done.${QIN_EVENT}`,operator:'eq',value:true}]}]};
 await withPacks({a,b,c:{id:'test.c',lineCompass:'compass.json',files:{'compass.json':compass}}},async compile=>assert.rejects(compile,new RegExp(`test\\.c references ${QIN_EVENT.replaceAll('.','\\.')} owned by test\\.b`)));
 const overlay={stageId:QIN_STAGE,events:[]};
 await withPacks({a,b,c:{id:'test.c',overlays:['overlays.json'],files:{'overlays.json':[overlay]}}},async compile=>assert.rejects(compile,/test\.c references lyg\.qin_xianyang owned by test\.b/));
});

test('dependsOn is transitive and map entry text ids must exist',async()=>{
 const a=await qinTextsPack({'test.a.preview':'预告'}),b=await qinStagePack({dependsOn:['test.a']});
 const entry={id:'test.entry',stageId:QIN_STAGE,eventId:QIN_EVENT,locationId:'liuchao.location.xianyang',readyPath:'compass.qinEntryReady',previewTextId:'test.a.preview'};
 const c=dependsOn=>({id:'test.c',mapEntries:['entries.json'],files:{'entries.json':[entry]},...(dependsOn?{dependsOn}:{})});
 await withPacks({a,b,c:c()},async compile=>assert.rejects(compile,/test\.c references \S+ owned by test\.b/));
 await withPacks({a,b,c:c(['test.b'])},async compile=>assert.equal((await compile()).mapEntries[0].previewTextId,'test.a.preview','c depends on b, b on a: a is visible to c'));
 for(const field of ['previewTextId','returnLabelTextId','returnTextId','returnChronicleTextId']){
  const bad={...entry,[field]:'test.missing'};
  await withPacks({a,b,c:{...c(['test.b']),files:{'entries.json':[bad]}}},async compile=>assert.rejects(compile,/invalid map entry test\.entry/,field));
 }
});

test('line compass order does not follow pack order',async()=>{
 const dir=await mkdtemp(join(root,'_newbot_tmp/stage3a-lineorder-'));
 try{
  await cp(join(root,'src/modules/contentPacks/packs'),dir,{recursive:true});
  // 把秦线的下一步表单拆到一个依赖核心包的包里：它在核心包之后编译，lines 拼接后排在最后
  const lc=await read(join(dir,'qingyu/line-compass.json'));
  await mkdir(join(dir,'zz-qin-compass'));
  await writeFile(join(dir,'zz-qin-compass/line-compass.json'),JSON.stringify({version:1,lines:lc.lines.filter(l=>l.lineId==='qin')}));
  await writeFile(join(dir,'zz-qin-compass/manifest.json'),JSON.stringify({schemaVersion:1,id:'test.qin-compass',dependsOn:['qingyu.core'],lineCompass:'line-compass.json'}));
  await writeFile(join(dir,'qingyu/line-compass.json'),JSON.stringify({...lc,lines:lc.lines.filter(l=>l.lineId!=='qin')}));
  const out=await compileContentPacks({packsDir:dir});
  const generated=await read(join(root,'src/modules/contentPacks/generated/catalog.json'));
  assert.deepEqual(out.lineCompass.lines.map(l=>l.lineId),generated.lineCompass.lines.map(l=>l.lineId));
  assert.deepEqual(out.lineCompass,generated.lineCompass);
  assert.deepEqual(Object.keys(out.lineCompassPlaces),Object.keys(generated.lineCompassPlaces));
 }finally{await rm(dir,{recursive:true,force:true});}
});
