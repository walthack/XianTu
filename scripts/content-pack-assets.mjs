// 图片挂位（assets，2026-11-16）：立绘 portraits／场景图 scenes／CG cg 三类，只建机制，不放真图。
// manifest.assets 是文件列表，每个文件是对象 {note?,portraits?,scenes?,cg?}；条目与文件顶层的 note 只给作者看，编译时剥掉。
// 编译期只校验数据形状与引用（人物总表、事件），不检查图片文件是否存在（素材根目录未定，运行时另有回落，见 src/modules/contentPacks/assets.ts）。
import {join} from 'node:path';
import {createJiti} from 'jiti';
const root=join(import.meta.dirname,'..');
const fail=s=>{throw new Error(`Content Pack: ${s}`);};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const onlyKeys=(x,keys)=>object(x)&&Object.keys(x).every(k=>keys.includes(k));
const noteOk=x=>x.note===undefined||typeof x.note==='string';
const ident=v=>typeof v==='string'&&/^[a-z0-9_-]+$/.test(v);

export const PORTRAIT_KINDS=['bust','full','avatar'];
export const PORTRAIT_EXPRESSIONS=['neutral','joy','anger','sorrow','surprise','shy'];
/** catalog 里的空段（没有包声明时）。 */
export const emptyAssets=()=>({portraits:[],scenes:[],cg:[]});
/** 归属扫描只看对外 id 引用：立绘的 characterId、CG 的 eventId；其余字段（sceneType、服装、表情、文件路径）是本段自己的取值，不进通用扫描。 */
export const scannedAssetRefs=v=>object(v)?{portraits:(Array.isArray(v.portraits)?v.portraits:[]).map(x=>x?.characterId),cg:(Array.isArray(v.cg)?v.cg:[]).map(x=>x?.eventId)}:v;

const fileOk=f=>typeof f==='string'&&!f.startsWith('/')&&!f.includes('..')&&!f.includes('\\')&&!f.split('/').includes('')&&/\.(png|webp|jpg|jpeg)$/.test(f);

/** raw: [{packId,value}]（value 是 assets 文件的原始内容）；events: 本次编译的全部事件 id。返回 catalog.assets。 */
export async function compileAssets(raw,{events}){
 const out=emptyAssets();
 let characterIds;const isCharacter=async id=>(characterIds||=new Set((await createJiti(import.meta.url,{interopDefault:true,alias:{'@':join(root,'src')}}).import(join(root,'src/modules/scenarioMods/namedEntities.ts'))).namedEntityEntries('character').map(e=>e.id))).has(id);
 const owners=new Map(),files=new Map();
 const claim=(map,key,label,packId)=>{if(map.has(key))fail(map.get(key)===packId?`${label}: duplicate`:`${label} defined by both ${map.get(key)} and ${packId}`);map.set(key,packId);};
 const checkFile=(at,x,packId)=>{if(!fileOk(x.file))fail(`${at}: file must be a relative path without leading /, .., \\ or empty segments, ending in .png/.webp/.jpg/.jpeg`);claim(files,x.file,`asset file ${x.file}`,packId);};
 const list=(packId,v,k)=>{if(v[k]===undefined)return [];if(!Array.isArray(v[k]))fail(`${packId}.assets.${k}: expected array`);return v[k];};
 for(const {packId,value:v} of raw){
  if(!onlyKeys(v,['note','portraits','scenes','cg'])||!noteOk(v))fail(`${packId}.assets: expected object with note/portraits/scenes/cg`);
  for(const x of list(packId,v,'portraits')){const at=`asset portrait ${x?.characterId}`;
   if(!onlyKeys(x,['characterId','kind','outfitId','expression','file','note'])||!noteOk(x)||typeof x.characterId!=='string'||!x.characterId)fail(`${at}: invalid fields`);
   if(!(await isCharacter(x.characterId)))fail(`${at}: unknown character`);
   if(!PORTRAIT_KINDS.includes(x.kind))fail(`${at}: kind must be ${PORTRAIT_KINDS.join('/')}`);
   if(x.kind!=='bust'&&x.expression!==undefined)fail(`${at}: expression only allowed for bust`);
   if(x.kind==='avatar'&&x.outfitId!==undefined)fail(`${at}: outfitId not allowed for avatar`);
   if(x.outfitId!==undefined&&!ident(x.outfitId))fail(`${at}: outfitId must match [a-z0-9_-]+`);
   if(x.expression!==undefined&&!PORTRAIT_EXPRESSIONS.includes(x.expression))fail(`${at}: expression must be ${PORTRAIT_EXPRESSIONS.join('/')}`);
   const e={characterId:x.characterId,kind:x.kind};if(x.kind!=='avatar')e.outfitId=x.outfitId??'default';if(x.kind==='bust')e.expression=x.expression??'neutral';e.file=x.file;
   claim(owners,`portrait\u0000${e.characterId}\u0000${e.kind}\u0000${e.outfitId??''}\u0000${e.expression??''}`,`asset portrait ${[e.characterId,e.kind,e.outfitId,e.expression].filter(Boolean).join('/')}`,packId);
   checkFile(at,x,packId);out.portraits.push(e);}
  for(const x of list(packId,v,'scenes')){const at=`asset scene ${x?.sceneType}`;
   if(!onlyKeys(x,['sceneType','variant','file','note'])||!noteOk(x))fail(`${at}: invalid fields`);
   if(!ident(x.sceneType))fail(`${at}: sceneType must match [a-z0-9_-]+`);
   if(x.variant!==undefined&&!ident(x.variant))fail(`${at}: variant must match [a-z0-9_-]+`);
   const e={sceneType:x.sceneType,variant:x.variant??null,file:x.file};
   claim(owners,`scene\u0000${e.sceneType}\u0000${e.variant??''}`,`asset scene ${e.sceneType}${e.variant?`/${e.variant}`:''}`,packId);
   checkFile(at,x,packId);out.scenes.push(e);}
  for(const x of list(packId,v,'cg')){const at=`asset cg ${x?.eventId}#${x?.seq}`;
   if(!onlyKeys(x,['eventId','seq','file','note'])||!noteOk(x)||typeof x.eventId!=='string'||!x.eventId)fail(`${at}: invalid fields`);
   if(!events.has(x.eventId))fail(`${at}: unknown event`);
   if(!Number.isSafeInteger(x.seq)||x.seq<1)fail(`${at}: seq must be a positive integer`);
   claim(owners,`cg\u0000${x.eventId}\u0000${x.seq}`,at,packId);
   checkFile(at,x,packId);out.cg.push({eventId:x.eventId,seq:x.seq,file:x.file});}
 }
 return out;
}
