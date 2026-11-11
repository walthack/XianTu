// 阶段 3a M2：删掉 catalog.json 后单次重建成功；TS 校验失败时回滚。
// 全在临时副本里做（src、mod-kit、scripts、package.json 复制，node_modules 软链）：仓库里真正的 catalog.json 只读不写，全量测试会并行读它。
import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,writeFile,readdir,rm,symlink,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const CATALOG='src/modules/contentPacks/generated/catalog.json';
const LINE_COMPASS='src/modules/contentPacks/packs/qingyu/line-compass.json';

test('rebuild from a deleted catalog in one run, and roll back when TS validation fails',async t=>{
 const copy=await mkdtemp(join(tmpdir(),'xiantu-stage3a-rebuild-'));
 t.after(()=>rm(copy,{recursive:true,force:true}));
 for(const x of ['src','mod-kit','scripts','package.json'])await cp(join(root,x),join(copy,x),{recursive:true});
 await symlink(join(root,'node_modules'),join(copy,'node_modules'),'dir');
 const repoCatalog=await readFile(join(root,CATALOG),'utf8');
 const run=(...args)=>spawnSync(process.execPath,['scripts/content-packs.mjs',...args],{cwd:copy,encoding:'utf8'});
 const catalogIn=()=>readFile(join(copy,CATALOG),'utf8');
 const exists=p=>access(p).then(()=>true,()=>false);
 const leftovers=async()=>(await readdir(join(copy,'src/modules/contentPacks/generated'))).filter(f=>f!=='catalog.json');

 // 1. 删掉 catalog 后单次重建：退出码 0，产物与仓库里的逐字节相同，--check 通过
 await rm(join(copy,CATALOG));
 let r=run();
 assert.equal(r.status,0,r.stderr);
 assert.equal(await catalogIn(),repoCatalog);
 r=run('--check');
 assert.equal(r.status,0,r.stderr);
 assert.deepEqual(await leftovers(),[]);

 // 2. 只有 TS 校验（validateLineCompassTable）才拦得住的坏包：新 catalog 先写到位，校验失败后恢复旧文件
 const compass=JSON.parse(await readFile(join(copy,LINE_COMPASS),'utf8'));
 compass.lines[0].nameKey='lineCompass.stage3a.missing';
 await writeFile(join(copy,LINE_COMPASS),JSON.stringify(compass));
 r=run();
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/validation failed, restored previous catalog: .*invalid lineCompass/);
 assert.equal(await catalogIn(),repoCatalog,'old catalog restored byte for byte');
 assert.deepEqual(await leftovers(),[],'no temp or backup file left behind');

 // 3. 原来没有 catalog 时校验失败：新文件删掉，不留半成品
 await rm(join(copy,CATALOG));
 r=run();
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/validation failed, removed new catalog: .*invalid lineCompass/);
 assert.equal(await exists(join(copy,CATALOG)),false);
 assert.deepEqual(await leftovers(),[]);

 // 仓库里的 catalog 没被动过
 assert.equal(await readFile(join(root,CATALOG),'utf8'),repoCatalog);
});
