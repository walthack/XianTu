import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
// 物品的使用效果（effectTags / onUse）与状态目录的对账：onUse 引用的状态 id 必须存在，标签必须是目录里出现过的物品标签或毒性标签。
export function auditItemEffects(errors,items){
 const numbers=read('mod-kit/game-numbers.qingyu.json').status,pack=read('src/modules/contentPacks/generated/catalog.json').statuses||[];
 const statuses=[...read('src/modules/sceneModule/contracts/statuses.json'),...pack],known=new Set(statuses.map(s=>s.id));
 const tags=new Set([...statuses.flatMap(s=>(s.remove||[]).filter(r=>r.kind==='item').map(r=>r.ref)),...Object.values(numbers.itemTags).flat()]);
 for(const entry of items.entries){
  const def=entry.definition,id=entry.id,where=`item effect ${id}`;
  for(const key of Object.keys(def))if((key==='effectTags'||key==='onUse')&&def[key]===undefined)errors.push(`${where}: ${key} 不能是 undefined`);
  if(def.effectTags!==undefined){
   if(!Array.isArray(def.effectTags)||!def.effectTags.length||new Set(def.effectTags).size!==def.effectTags.length)errors.push(`${where}: effectTags 需为非空且不重复的数组（没有效果就整个字段省略）`);
   else for(const tag of def.effectTags)if(typeof tag!=='string'||!tags.has(tag))errors.push(`${where}: 未知效果标签 ${String(tag)}`);
  }
  if(def.onUse!==undefined){
   if(!Array.isArray(def.onUse)||!def.onUse.length)errors.push(`${where}: onUse 需为非空数组（没有就整个字段省略）`);
   else for(const use of def.onUse){
    if(!use||typeof use!=='object'||Object.keys(use).some(k=>!['statusId','doses','minutes'].includes(k)))errors.push(`${where}: onUse 项只允许 statusId/doses/minutes`);
    else{
     if(!known.has(use.statusId))errors.push(`${where}: onUse 引用了不存在的状态 ${String(use.statusId)}`);
     if(use.doses!==undefined&&!(Number.isInteger(use.doses)&&use.doses>=1&&use.doses<=numbers.onUse.maxDoses))errors.push(`${where}: doses 需为 1..${numbers.onUse.maxDoses} 的整数`);
     if(use.minutes!==undefined&&!(Number.isInteger(use.minutes)&&use.minutes>0))errors.push(`${where}: minutes 需为正整数`);
    }
   }
  }
  if((def.effectTags||[]).some(tag=>numbers.itemTags.toxic.includes(tag))&&!(Array.isArray(def.onUse)&&def.onUse.length))errors.push(`${where}: 毒性物品必须有 onUse（挂哪个状态）`);
 }
}
export function auditEntityCatalog(){
 const errors=[],byKind={};
 for(const [kind,plural] of [['item','items'],['skill','skills'],['technique','techniques'],['enemy','enemies'],['location','locations'],['faction','factions'],['ending','endings']]){
  const table=read(`mod-kit/entity-catalog/${plural}.json`),map=new Map();byKind[kind]=map;
  for(const entry of table.entries){if(map.has(entry.id))errors.push(`duplicate ${kind} ${entry.id}`);map.set(entry.id,entry);
   if(entry.definition.id!==entry.id||!entry.definition.name)errors.push(`invalid definition ${entry.id}`);
   if(entry.authoritySource!==`mod-kit/entity-catalog/${plural}.json`)errors.push(`wrong authority ${entry.id}`);
   for(const v of Object.values(entry.stageVariants))if(v.id!==entry.id)errors.push(`variant id drift ${entry.id}`);
  }
 }
 auditItemEffects(errors,read('mod-kit/entity-catalog/items.json'));
 const index=read('mod-kit/entity-catalog/index.json');const indexed=new Set();
 for(const row of index.entries){const key=`${row.kind}:${row.id}`;if(indexed.has(key))errors.push(`duplicate index ${key}`);indexed.add(key);if(byKind[row.kind]&&!byKind[row.kind].has(row.id))errors.push(`dangling index ${key}`);}
 for(const [kind,map] of Object.entries(byKind))for(const entry of map.values()){
  if(!indexed.has(`${kind}:${entry.id}`))errors.push(`missing index ${entry.id}`);
  for(const def of [entry.definition,...Object.values(entry.stageVariants)]){
   for(const id of def.skillIds||[])if(!byKind.skill.has(id))errors.push(`dangling skill ${entry.id}/${id}`);
   if(def.techniqueId&&!byKind.technique.has(def.techniqueId))errors.push(`dangling technique ${entry.id}/${def.techniqueId}`);
  }
 }
 const access=read('mod-kit/entity-catalog/stage-access.json');
 for(const file of readdirSync(new URL('src/modules/scenarioMods/builtins/data/',root)).filter(f=>f.endsWith('.json'))){
  const mod=read(`src/modules/scenarioMods/builtins/data/${file}`),stageId=mod.manifest.id,expected=access.stages[stageId];
  if(!expected||JSON.stringify(mod.content)!==JSON.stringify(expected))errors.push(`stage access drift ${stageId}`);
  for(const [kind,plural] of [['item','items'],['skill','skills'],['technique','techniques']])for(const ref of mod.content?.[plural]||[]){
   if(!byKind[kind].has(ref.id))errors.push(`unknown ${kind} ${stageId}/${ref.id}`);
   if(Object.keys(ref).some(k=>!['id','availableWhen','revealWhen'].includes(k)))errors.push(`inline definition ${stageId}/${ref.id}`);
  }
  const walk=o=>{if(!o||typeof o!=='object')return;for(const [k,v]of Object.entries(o)){
   const kind={itemId:'item',skillId:'skill',techniqueId:'technique'}[k];if(kind&&typeof v==='string'&&!byKind[kind].has(v))errors.push(`unknown structured reference ${stageId}/${kind}/${v}`);walk(v);
  }};walk(mod.scenario);
 }
 return {errors:[...new Set(errors)],counts:Object.fromEntries(Object.entries(byKind).map(([k,m])=>[k,m.size]))};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const result=auditEntityCatalog();console.log(JSON.stringify(result,null,2));if(result.errors.length)process.exitCode=1;}
