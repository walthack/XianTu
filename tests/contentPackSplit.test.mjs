// 阶段 3b：秦线拆成独立包 packs/qin/ 后，与「并回核心包」编译结果语义相等；核心包原始文件不再含秦专属 id。
// 只在 _newbot_tmp 下的临时副本里操作，不碰仓库里的包和 catalog。
import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {compileContentPacks} from '../scripts/content-packs.mjs';

const root=resolve(import.meta.dirname,'..');
const packsDir=join(root,'src/modules/contentPacks/packs');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
// 比较口径（方案 §4）：texts 只按键查，键序不计；version 是内容哈希，随顺序变
const norm=c=>JSON.stringify({...c,version:'',texts:Object.fromEntries(Object.entries(c.texts).sort(([a],[b])=>a<b?-1:a>b?1:0))});
const QIN_ONLY=/qin_xianyang|liuchao\.event\.qin_|lineCompass\.qin|report8091\.qin|mapEntry\.qin/;

test('qin pack merged back into core compiles to the same catalog as the split packs',async()=>{
 const dir=await mkdtemp(join(root,'_newbot_tmp/stage3b-split-'));
 try{
  await cp(packsDir,dir,{recursive:true});
  const core=join(dir,'qingyu'),qin=join(dir,'qin');
  const cm=await read(join(core,'manifest.json')),qm=await read(join(qin,'manifest.json'));
  assert.equal(qm.id,'qingyu.qin');assert.deepEqual(qm.dependsOn,['qingyu.core']);
  // 秦包文件带前缀拷进核心包目录（两包都有 texts.json / line-compass.json），manifest 各列表拼接
  const rename=f=>`merged-qin-${f}`;
  for(const f of await readdir(qin))if(f!=='manifest.json'&&f!==qm.lineCompass)await writeFile(join(core,rename(f)),await readFile(join(qin,f)));
  for(const [k,v] of Object.entries(qm))if(Array.isArray(v)&&k!=='dependsOn')cm[k]=[...(cm[k]||[]),...v.map(rename)];
  // 秦线故意插在最前（拆包后按包顺序拼接时它在最后）：两边相等靠编译器按 NATION_LINE_IDS 排序，不靠文件里的位置
  const lc=await read(join(core,cm.lineCompass));lc.lines.unshift(...(await read(join(qin,qm.lineCompass))).lines);
  await writeFile(join(core,cm.lineCompass),JSON.stringify(lc));
  await writeFile(join(core,'manifest.json'),JSON.stringify(cm));
  await rm(qin,{recursive:true});
  const merged=await compileContentPacks({packsDir:dir});
  const split=await compileContentPacks();
  assert.ok(split.stages.some(s=>s.manifest.id==='lyg.qin_xianyang'));
  assert.ok(split.lineCompass.lines.some(l=>l.lineId==='qin'));
  assert.equal(norm(split),norm(merged));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('core pack source files contain no qin-only ids',async()=>{
 const core=join(packsDir,'qingyu');
 for(const f of await readdir(core))assert.doesNotMatch(await readFile(join(core,f),'utf8'),QIN_ONLY,f);
});
