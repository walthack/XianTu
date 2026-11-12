// 世界事件 startedExtensionKey 的保留键名单（scripts/content-packs.mjs RESERVED_EXTENSION_KEYS）与 src 实际读写的 系统.扩展 键对账（2026-11-12）：
// 扫描 src 得到的键 ⊆ 保留名单 ∪ 试玩 extensionKey（catalog.playtests）∪ 各世界事件的 startedExtensionKey。以后 src 新加扩展键而没登记，这里会红。
//
// 扫描覆盖的写法（.ts／.vue，跳过 contentPacks/generated）：
//   ① 扩展.x、扩展?.x、扩展['x']、扩展?.['x']、扩展[CONST]（CONST 是 src 里任一 `const CONST = 'x'` 的大写常量）；
//   ② 字符串路径 '系统.扩展.x…'（含模板串开头）与数组路径 ['系统', '扩展', 'x'…]；
//   ③ 别名：`const|let|, v = …系统.扩展`（可带 `||= {}`／`??= {}`／`|| {}`、外层括号，也认 `(… ).扩展`、`sys.扩展`）之后同文件的 v.x、v?.x、v['x']、v[CONST]，
//      以及箭头函数别名 v(save).x。
// 覆盖不到的（需手工登记，或已另有来源）：对象字面量里的键（如 `扩展: { 离线初始化: … }`、`{ ...ext, [key]: … }`）；
//   键来自数据或配置的（试玩 extensionKey 走 catalog.playtests；dual-model 后端 extensionKey 由编译器读 mod-kit/dual-model.json）；
//   常量不是字面量的（如 QINGYU_OPENING_PLAYTEST_EXTENSION_KEY = definition.extensionKey）、函数参数传进来的键（characterStore markerExtensionKey）；
//   经 host.extensions()／state.systemExtensions 之类不含「扩展」字样的访问；别名声明后再赋值、跨文件传递的别名。
// 扫描是有意的超集：「扩展.x」不区分是 系统.扩展 还是 NPC 的 扩展（如 specialNpcId），多登记无害。
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {RESERVED_EXTENSION_KEYS} from '../scripts/content-packs.mjs';

const root=resolve(import.meta.dirname,'..');
const ID='[A-Za-z_$\\u4e00-\\u9fff][A-Za-z0-9_$\\u4e00-\\u9fff]*';

async function scanExtensionKeys(){
 const files=[];const walk=async d=>{for(const e of await readdir(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory()){if(!p.endsWith(join('contentPacks','generated')))await walk(p);}else if(/\.(ts|vue)$/.test(e.name))files.push(p);}};
 await walk(join(root,'src'));
 const src=new Map();for(const f of files)src.set(f,await readFile(f,'utf8'));
 const consts=new Map();for(const s of src.values())for(const m of s.matchAll(/\b(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*['"]([^'"]+)['"]/g))consts.set(m[1],m[2]);
 const found=new Map();
 const access=head=>[[new RegExp(`${head}\\??\\.(${ID})`,'g'),false],[new RegExp(`${head}\\??\\.?\\[\\s*['"]([^'"]+)['"]\\s*\\]`,'g'),false],[new RegExp(`${head}\\??\\.?\\[\\s*([A-Z][A-Z0-9_]*)\\s*\\]`,'g'),true]];
 for(const [f,s] of src){
  const pats=[...access('扩展'),[new RegExp(`['"\`]系统\\.扩展\\.(${ID})`,'g'),false],[new RegExp(`\\[\\s*['"]系统['"]\\s*,\\s*['"]扩展['"]\\s*,\\s*['"]([^'"]+)['"]`,'g'),false]];
  for(const m of s.matchAll(new RegExp(`(?:\\bconst|\\blet|,)\\s*(${ID})\\s*(?::[^=;\\n]+)?=\\s*[^;,\\n]*?\\.扩展(?:\\s*(?:\\|\\||\\?\\?)=?\\s*\\{\\s*\\})?\\)*\\s*(?=[;,\\n])`,'g')))pats.push(...access(`(?<![\\w.$])${m[1]}(?:\\([^()]*\\))?`));
  for(const [re,isConst] of pats)for(const m of s.matchAll(re)){const k=isConst?consts.get(m[1]):m[1];if(k===undefined)continue;const at=`${relative(root,f)}:${s.slice(0,m.index).split('\n').length}`;if(!found.has(k))found.set(k,at);}
 }
 return found;
}

test('系统.扩展 keys used in src are all reserved for world event startedExtensionKey', async () => {
 const found=await scanExtensionKeys();
 // 扫描器自检：几种写法各有一个已知键（直接点、别名＋常量、箭头函数别名、字符串路径）
 for(const k of ['mapEntryResume','beatActionIdle','lcq_shiweimo','行动门控'])assert.ok(found.has(k),`scanner should find ${k}`);
 const catalog=JSON.parse(await readFile(join(root,'src/modules/contentPacks/generated/catalog.json'),'utf8'));
 const allowed=new Set([...RESERVED_EXTENSION_KEYS,...catalog.playtests.map(p=>p.extensionKey),...(catalog.worldEvents||[]).map(x=>x.startedExtensionKey)]);
 const missing=[...found].filter(([k])=>!allowed.has(k)).map(([k,at])=>`${k} (${at})`);
 assert.deepEqual(missing,[],'add these keys to RESERVED_EXTENSION_KEYS in scripts/content-packs.mjs');
});
