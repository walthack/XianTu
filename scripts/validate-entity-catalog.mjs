import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
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
