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
const EXPECTED_TALLY=['nanhuang','jin','song','han','tang'];
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
  await withPacks({a:linePack('test.a',[{lineId:'test.late',order:9,regions:['test.乙'],countsTowardClosedLines:false}]),b:linePack('test.b',[{lineId:'test.early',order:2,regions:['test.甲','test.丙'],countsTowardClosedLines:false}])},async compile=>{
    assert.deepEqual((await compile()).nationLines,[{lineId:'test.early',order:2,regions:['test.甲','test.丙'],countsTowardClosedLines:false},{lineId:'test.late',order:9,regions:['test.乙'],countsTowardClosedLines:false}]);
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
  const pack=lineId=>linePack('test.a',[],{texts:['texts.json'],lineCompass:'compass.json',files:{'nation-lines.json':[{lineId:'test.nation',order:1,regions:['test.地区'],countsTowardClosedLines:false}],'texts.json':{'test.line.name':'测试线'},'compass.json':compass(lineId)}});
  // 原 lineCompass.test.mjs 的塞外负例：saiwai 没登记成国家线，下一步表用它就报错（磁盘上的 NATION_LINE_IDS 也没有 saiwai；这里看到的合法集合是本次编译的 test.nation）
  await withPacks({a:pack('saiwai')},async compile=>assert.rejects(compile,/invalid lineCompass: .*lineId must be one of test\.nation\./));
  // 合成线只在这次编译里登记（磁盘上的 catalog 没有它），下一步表照样通过：校验用的是传进去的线 id，不是磁盘上的旧值
  assert.ok(!registry.NATION_LINE_IDS.includes('test.nation'));
  await withPacks({a:pack('test.nation')},async compile=>assert.deepEqual((await compile()).lineCompass.lines.map(l=>l.lineId),['test.nation']));
});

// 阶段 2a：加一条国家线只改包——计入收束计数与失败收束事件在 nation-lines.json，numbers 不用补任何键（原先这里要给副本的 numbers 补 anyLineClosed.lineIds 与 failureClosureEvents）。
// countsTowardClosedLines 为 true、false 各跑一次：true 时进 CLOSURE_TALLY_LINE_IDS，nationClosedLineCount 把它算进去
for (const counts of [true, false]) test(`one run from a deleted catalog: a synthetic nation line (countsTowardClosedLines: ${counts}) lands in NATION_LINE_IDS and the region map without TS or numbers changes`, async t => {
  const copy=await mkdtemp(join(tmpdir(),'xiantu-qin-pr-c-'));
  t.after(()=>rm(copy,{recursive:true,force:true}));
  for(const x of ['src','mod-kit','scripts','package.json'])await cp(join(root,x),join(copy,x),{recursive:true});
  await symlink(join(root,'node_modules'),join(copy,'node_modules'),'dir');
  const catalogPath=join(copy,'src/modules/contentPacks/generated/catalog.json');
  await rm(catalogPath);
  const dir=join(copy,'src/modules/contentPacks/packs/zz-test-nation');await mkdir(dir);
  await writeFile(join(dir,'manifest.json'),JSON.stringify({schemaVersion:1,id:'test.nation-pack',dependsOn:['qingyu.core'],texts:['texts.json'],lineCompass:'line-compass.json',nationLines:['nation-lines.json']}));
  await writeFile(join(dir,'nation-lines.json'),JSON.stringify([{lineId:'test.nation',order:8,regions:['test.地区'],countsTowardClosedLines:counts,...(counts?{failureClosureEvents:[]}:{})}]));
  await writeFile(join(dir,'texts.json'),JSON.stringify({'test.nation.name':'测试线'}));
  await writeFile(join(dir,'line-compass.json'),JSON.stringify({version:1,lines:[{lineId:'test.nation',nameKey:'test.nation.name',steps:[]}]}));
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
  assert.deepEqual([...nl.CLOSURE_TALLY_LINE_IDS],[...EXPECTED_TALLY,...(counts?['test.nation']:[])]);
  const outcomes=await jiti.import(join(copy,'src/modules/scenarioMods/lineOutcomes.ts'));
  assert.equal(outcomes.nationClosedLineCount({flags:{'line.test.nation.outcome':'resolved'},completedEventIds:[],chronicle:[]}),counts?1:0);
  const numbers=await jiti.import(join(copy,'src/modules/sceneModule/numbers.ts'));
  assert.deepEqual(reg.validateAgainstRegistry(numbers.GAME_NUMBERS),[]);
  const run=spawnSync(process.execPath,['scripts/content-packs.mjs','--check'],{cwd:copy,encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
});

// 阶段 2a 新字段的编译期校验（替代原 numbersRegistry.ts 的 anyLineClosed.lineIds／failureClosureEvents／阈值交叉校验，不再要求「恰好是哪五条」）
const counted=(n,extra={})=>Array.from({length:n},(_,i)=>({lineId:`test.l${i}`,order:i+1,regions:[`test.r${i}`],countsTowardClosedLines:true,...extra}));

test('compile: countsTowardClosedLines is required boolean; failureClosureEvents only on counted lines, distinct, existing events (new check)', async () => {
  for(const v of [undefined,'true',1])await withPacks({a:linePack('test.a',[{lineId:'test.x',order:1,regions:['test.r'],...(v===undefined?{}:{countsTowardClosedLines:v})}])},async compile=>assert.rejects(compile,/nation line test\.x: countsTowardClosedLines must be true or false/,String(v)));
  await withPacks({a:linePack('test.a',[{lineId:'test.x',order:1,regions:['test.r'],countsTowardClosedLines:false,failureClosureEvents:[]}])},async compile=>assert.rejects(compile,/failureClosureEvents is only for lines with countsTowardClosedLines: true/));
  for(const f of ['x',[''],['lcq.event.s05b_wuer_suli_depart','lcq.event.s05b_wuer_suli_depart'],[1]])await withPacks({a:linePack('test.a',counted(1,{failureClosureEvents:f}))},async compile=>assert.rejects(compile,/failureClosureEvents must be distinct non-empty event ids/,JSON.stringify(f)));
  // 新增检查：失败收束事件必须是已有事件（内置关或包内关）；现有五条计入线都是空表
  await withPacks({a:linePack('test.a',counted(1,{failureClosureEvents:['test.no_such_event']}))},async compile=>assert.rejects(compile,/failureClosureEvents: unknown event test\.no_such_event/));
  await withPacks({a:linePack('test.a',counted(1,{failureClosureEvents:['lcq.event.s05b_wuer_suli_depart']}))},async compile=>assert.deepEqual((await compile()).nationLines[0].failureClosureEvents,['lcq.event.s05b_wuer_suli_depart']));
});

test('compile: compassConditions shape, reserved id, kind, min (integer or numbers path, 1..counted lines), unlessLineClosedByWorldEvent, readyPath', async () => {
  const cond=(x,lines=counted(3))=>({a:linePack('test.a',lines,{compassConditions:['c.json'],files:{'nation-lines.json':lines,'c.json':x}})});
  const ok={id:'test.ready',kind:'closedLinesAtLeast',min:'story.lineCompass.qinEntry.minClosedLines',unlessLineClosedByWorldEvent:'test.l0'};
  await withPacks(cond([ok]),async compile=>assert.deepEqual((await compile()).compassConditions,[ok]));
  await withPacks(cond([{id:'test.ready',kind:'closedLinesAtLeast',min:2}]),async compile=>assert.deepEqual((await compile()).compassConditions,[{id:'test.ready',kind:'closedLinesAtLeast',min:2}]));
  await withPacks(cond({...ok}),async compile=>assert.rejects(compile,/test\.a\.compassConditions: expected array/));
  await withPacks(cond([ok,ok]),async compile=>assert.rejects(compile,/compass condition missing\/duplicate id test\.ready/));
  await withPacks(cond([{...ok,note:'x'}]),async compile=>assert.rejects(compile,/compass condition test\.ready: invalid fields/));
  await withPacks(cond([{...ok,id:'anyLineClosed'}]),async compile=>assert.rejects(compile,/anyLineClosed is reserved/));
  await withPacks(cond([{...ok,kind:'closedLinesAtMost'}]),async compile=>assert.rejects(compile,/kind must be closedLinesAtLeast/));
  for(const min of [0,1.5,4,'3','story.no.such.path'])await withPacks(cond([{...ok,min}]),async compile=>assert.rejects(compile,/compass condition test\.ready: min .* must be an integer from 1 to 3/,String(min)));
  // 阈值路径 story.lineCompass.qinEntry.minClosedLines＝3：计入线只有两条时编不过（原 numbersRegistry「不得超过计入线数」）
  await withPacks(cond([ok],[...counted(2),{lineId:'test.off',order:9,regions:['test.off'],countsTowardClosedLines:false}]),async compile=>assert.rejects(compile,/min story\.lineCompass\.qinEntry\.minClosedLines=3 must be an integer from 1 to 2/));
  await withPacks(cond([{...ok,unlessLineClosedByWorldEvent:'saiwai'}]),async compile=>assert.rejects(compile,/unlessLineClosedByWorldEvent: unknown nation line saiwai/));
});

test('repo: qin pack declares compass.qinEntryReady (baked into old saves) and the qin map entry still reads it', async () => {
  const packs=await loadTs('../src/modules/contentPacks/index.ts');
  const ledger=await loadTs('../src/modules/scenarioMods/ledgerConditions.ts');
  assert.deepEqual(packs.COMPASS_CONDITIONS.map(c=>c.id),['qinEntryReady']);
  assert.deepEqual(packs.COMPASS_CONDITIONS[0],{id:'qinEntryReady',kind:'closedLinesAtLeast',min:'story.lineCompass.qinEntry.minClosedLines',unlessLineClosedByWorldEvent:'qin'});
  assert.deepEqual([...ledger.COMPASS_DERIVED_IDS],['anyLineClosed','qinEntryReady']);
  assert.equal(packs.CONTENT_PACKS.mapEntries.find(e=>e.id==='qin').readyPath,'compass.qinEntryReady');
  assert.deepEqual([...nation.CLOSURE_TALLY_LINE_IDS],EXPECTED_TALLY);
  assert.deepEqual(nation.FAILURE_CLOSURE_EVENTS,Object.fromEntries(EXPECTED_TALLY.map(id=>[id,[]])));
});

test('compile: map entry readyPath must be a compass condition declared in this compile, or compass.anyLineClosed', async () => {
  const dir=await mkdtemp(join(root,'_newbot_tmp/stage2a-ready-'));
  try{
    await cp(PACKS,dir,{recursive:true});
    const entriesPath=join(dir,'qin/map-entries.json'),entries=await read(entriesPath);
    for(const [readyPath,ok] of [['compass.qinEntryReady',true],['compass.anyLineClosed',true],['compass.notDeclared',false],['done.liuchao.event.qin_hook_fangshi_rumor',false]]){
      await writeFile(entriesPath,JSON.stringify([{...entries[0],readyPath}]));
      if(ok)assert.equal((await compileContentPacks({packsDir:dir})).mapEntries[0].readyPath,readyPath);
      else await assert.rejects(compileContentPacks({packsDir:dir}),/invalid map entry qin/,readyPath);
    }
  }finally{await rm(dir,{recursive:true,force:true});}
});
