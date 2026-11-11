// 秦线 PR C：七条国家线的注册与地区映射在各线包 manifest.nationLines（[{lineId, order, regions}]），numbers 与 TS 里不再有旧源。
// 第一步（旧源还在时）这里断言合并结果与 TS 常量 + numbers.regionLines 逐项相等；删旧源后改成下面写死的期望值。
import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,mkdir,readFile,readdir,writeFile,rm,symlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createJiti} from 'jiti';
import {compileContentPacks} from '../scripts/content-packs.mjs';
import { loadTs } from './loadTs.mjs';

const root=resolve(import.meta.dirname,'..');
const PACKS=join(root,'src/modules/contentPacks/packs');
const registry = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
const nation = await loadTs('../src/modules/contentPacks/nationLines.ts');
const read=async p=>JSON.parse(await readFile(p,'utf8'));

const EXPECTED_IDS=['nanhuang','jin','song','han','tang','qin','taiquan'];
const EXPECTED_REGIONS=[['昭南','nanhuang'],['晋国','jin'],['宋国','song'],['汉国','han'],['唐国','tang'],['秦国','qin'],['太泉','taiquan']];

test('NATION_LINE_IDS is derived from the packs, order unchanged', () => {
  assert.deepEqual([...nation.PACK_NATION_LINE_IDS], EXPECTED_IDS);
  assert.equal(registry.NATION_LINE_IDS, nation.PACK_NATION_LINE_IDS, 'numbersRegistry re-exports the pack value');
});

test('region map: 7 rows, 塞外 not registered', () => {
  assert.deepEqual(Object.entries(nation.NATION_LINE_OF_REGION), EXPECTED_REGIONS);
  assert.equal(nation.NATION_LINE_OF_REGION['塞外'], undefined);
});

test('each nation line is registered in its own line pack; saiwai registers none', async () => {
  const own={zhaonan:'nanhuang',jin:'jin',song:'song',han:'han',tang:'tang',qin:'qin',taiquan:'taiquan'};
  for(const dir of (await readdir(PACKS,{withFileTypes:true})).filter(d=>d.isDirectory()).map(d=>d.name)){
    const m=await read(join(PACKS,dir,'manifest.json'));
    const ids=[];for(const f of m.nationLines||[])ids.push(...(await read(join(PACKS,dir,f))).map(x=>x.lineId));
    assert.deepEqual(ids,own[dir]?[own[dir]]:[],dir);
  }
});

/** packs: {目录名: {manifest 其余字段, files: {文件名: 内容}}}；id 写在 manifest 里。 */
const withPacks=async(packs,fn)=>{
  const dir=await mkdtemp(join(root,'_newbot_tmp/qin-pr-c-nation-'));
  try{
    for(const [name,{files={},...m}] of Object.entries(packs)){
      await mkdir(join(dir,name));
      await writeFile(join(dir,name,'manifest.json'),JSON.stringify({schemaVersion:1,...m}));
      for(const [f,v] of Object.entries(files))await writeFile(join(dir,name,f),JSON.stringify(v));
    }
    return await fn(()=>compileContentPacks({packsDir:dir}));
  }finally{await rm(dir,{recursive:true,force:true});}
};
const linePack=(id,lines,extra={})=>({id,nationLines:['nation-lines.json'],files:{'nation-lines.json':lines},...extra});

test('compile: catalog.nationLines follows order, not pack order', async () => {
  await withPacks({a:linePack('test.a',[{lineId:'test.late',order:9,regions:['test.乙']}]),b:linePack('test.b',[{lineId:'test.early',order:2,regions:['test.甲','test.丙']}])},async compile=>{
    assert.deepEqual((await compile()).nationLines,[{lineId:'test.early',order:2,regions:['test.甲','test.丙']},{lineId:'test.late',order:9,regions:['test.乙']}]);
  });
});

test('compile: invalid nation line entries fail', async () => {
  const bad=[{lineId:'test.x',order:1,regions:['test.r'],name:'多余字段'},{lineId:'test.x',regions:['test.r']},{lineId:'test.x',order:0,regions:['test.r']},{lineId:'test.x',order:1.5,regions:['test.r']},
    {lineId:'',order:1,regions:['test.r']},{lineId:'test.x',order:1,regions:[]},{lineId:'test.x',order:1,regions:['test.r','test.r']},{lineId:'test.x',order:1,regions:['']}];
  for(const x of bad)await withPacks({a:linePack('test.a',[x])},async compile=>assert.rejects(compile,/invalid fields|missing\/duplicate id/,JSON.stringify(x)));
  await withPacks({a:{id:'test.a',nationLines:'nation-lines.json'}},async compile=>assert.rejects(compile,/test\.a\.nationLines: expected file list/));
  await withPacks({a:{id:'test.a',nationLines:['n.json'],files:{'n.json':{lineId:'test.x',order:1,regions:['test.r']}}}},async compile=>assert.rejects(compile,/test\.a\.nationLines: expected array/));
});

test('compile: lineId and order unique across packs, a region maps to one line only', async () => {
  await withPacks({a:linePack('test.a',[{lineId:'test.x',order:1,regions:['test.r1']}]),b:linePack('test.b',[{lineId:'test.x',order:2,regions:['test.r2']}])},async compile=>assert.rejects(compile,/nationLine id test\.x defined by both test\.a and test\.b/));
  await withPacks({a:linePack('test.a',[{lineId:'test.x',order:1,regions:['test.r1']},{lineId:'test.x',order:2,regions:['test.r2']}])},async compile=>assert.rejects(compile,/nation line missing\/duplicate id test\.x/));
  await withPacks({a:linePack('test.a',[{lineId:'test.x',order:1,regions:['test.r1']},{lineId:'test.y',order:1,regions:['test.r2']}])},async compile=>assert.rejects(compile,/nation line test\.y: order 1 also used by test\.x/));
  // 原 lineCompass.test.mjs 的塞外负例之一：同一地区（塞外）不能登记到两条线
  await withPacks({a:linePack('test.a',[{lineId:'test.x',order:1,regions:['塞外']}]),b:linePack('test.b',[{lineId:'test.y',order:2,regions:['塞外']}])},async compile=>assert.rejects(compile,/nation line test\.y: region 塞外 also registered to test\.x/));
});

test('compile: lineCompass lineId is checked against the nation lines of this compile (M2), so 塞外 cannot pose as a nation line', async () => {
  const compass=lineId=>({version:1,lines:[{lineId,nameKey:'test.line.name',steps:[]}]});
  const pack=lineId=>linePack('test.a',[{lineId:'test.nation',order:1,regions:['test.地区']}],{texts:['texts.json'],lineCompass:'compass.json',files:{'nation-lines.json':[{lineId:'test.nation',order:1,regions:['test.地区']}],'texts.json':{'test.line.name':'测试线'},'compass.json':compass(lineId)}});
  // 原 lineCompass.test.mjs 的塞外负例：saiwai 没登记成国家线，下一步表用它就报错（磁盘上的 NATION_LINE_IDS 也没有 saiwai；这里看到的合法集合是本次编译的 test.nation）
  await withPacks({a:pack('saiwai')},async compile=>assert.rejects(compile,/invalid lineCompass: .*lineId must be one of test\.nation\./));
  // 合成线只在这次编译里登记（磁盘上的 catalog 没有它），下一步表照样通过：校验用的是传进去的线 id，不是磁盘上的旧值
  assert.ok(!registry.NATION_LINE_IDS.includes('test.nation'));
  await withPacks({a:pack('test.nation')},async compile=>assert.deepEqual((await compile()).lineCompass.lines.map(l=>l.lineId),['test.nation']));
});

test('one run from a deleted catalog: a synthetic nation line lands in NATION_LINE_IDS and the region map without TS changes', async t => {
  const copy=await mkdtemp(join(tmpdir(),'xiantu-qin-pr-c-'));
  t.after(()=>rm(copy,{recursive:true,force:true}));
  for(const x of ['src','mod-kit','scripts','package.json'])await cp(join(root,x),join(copy,x),{recursive:true});
  await symlink(join(root,'node_modules'),join(copy,'node_modules'),'dir');
  const catalogPath=join(copy,'src/modules/contentPacks/generated/catalog.json');
  await rm(catalogPath);
  const dir=join(copy,'src/modules/contentPacks/packs/zz-test-nation');await mkdir(dir);
  await writeFile(join(dir,'manifest.json'),JSON.stringify({schemaVersion:1,id:'test.nation-pack',dependsOn:['qingyu.core'],texts:['texts.json'],lineCompass:'line-compass.json',nationLines:['nation-lines.json']}));
  await writeFile(join(dir,'nation-lines.json'),JSON.stringify([{lineId:'test.nation',order:8,regions:['test.地区']}]));
  await writeFile(join(dir,'texts.json'),JSON.stringify({'test.nation.name':'测试线'}));
  await writeFile(join(dir,'line-compass.json'),JSON.stringify({version:1,lines:[{lineId:'test.nation',nameKey:'test.nation.name',steps:[]}]}));
  // numbersRegistry.ts 的秦入口规则（阶段 2 才搬）：国家线去掉秦、太泉后须恰为 anyLineClosed.lineIds，且每条在 failureClosureEvents 有键。合成线不是秦／太泉，副本里的 numbers 同步补上（只改副本）
  const progressPath=join(copy,'mod-kit/numbers-progress.json'),progress=await read(progressPath);
  progress.story.lineCompass.anyLineClosed.lineIds.push('test.nation');progress.story.lineOutcome.failureClosureEvents['test.nation']=[];
  await writeFile(progressPath,JSON.stringify(progress,null,2)+'\n');
  const r=spawnSync(process.execPath,['scripts/content-packs.mjs'],{cwd:copy,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  const catalog=await read(catalogPath);
  assert.deepEqual(catalog.nationLines.map(l=>l.lineId),[...EXPECTED_IDS,'test.nation']);
  assert.deepEqual(catalog.lineCompass.lines.map(l=>l.lineId),[...EXPECTED_IDS,'test.nation'],'right-sidebar order follows nationLines');
  const jiti=createJiti(import.meta.url,{interopDefault:true,moduleCache:false,alias:{'@':join(copy,'src')}});
  const reg=await jiti.import(join(copy,'src/modules/sceneModule/numbersRegistry.ts'));
  const nl=await jiti.import(join(copy,'src/modules/contentPacks/nationLines.ts'));
  assert.deepEqual([...reg.NATION_LINE_IDS],[...EXPECTED_IDS,'test.nation']);
  assert.deepEqual(Object.entries(nl.NATION_LINE_OF_REGION),[...EXPECTED_REGIONS,['test.地区','test.nation']]);
  const run=spawnSync(process.execPath,['scripts/content-packs.mjs','--check'],{cwd:copy,encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
});
