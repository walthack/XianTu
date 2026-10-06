// Derived kind/id/source/alias index. Definitions stay in the existing authorities.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createJiti} from 'jiti';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
const jiti=createJiti(import.meta.url,{alias:{'@':fileURLToPath(new URL('src',root))}});
const loc=await jiti.import(fileURLToPath(new URL('src/modules/scenarioMods/travel/locationIds.ts',root)));
const {SCENE_CONTRACTS,SCENE_CONTRACT_DRAFTS}=await jiti.import(fileURLToPath(new URL('src/modules/sceneModule/contracts/registry.ts',root)));
const {SECONDARY_LINES}=await jiti.import(fileURLToPath(new URL('src/modules/scenarioMods/secondaryLines.ts',root)));
const {CHARACTER_QUESTS}=await jiti.import(fileURLToPath(new URL('src/modules/scenarioMods/characterQuests.ts',root)));
export function buildEntityIndex(){
 const masters={location:read('mod-kit/entity-catalog/locations.json').entries,faction:read('mod-kit/entity-catalog/factions.json').entries};
 masters.character=read('src/modules/scenarioMods/builtins/character-registry.json').characters.map(e=>({id:e.id,aliases:e.idAliases||[]}));
 const canon=(kind,id)=>masters[kind]?.find(e=>e.id===id||e.aliases.includes(id))?.id||id;
 const rows=new Map(),add=(kind,id,authoritySource,aliases=[])=>{if(!id)return;id=canon(kind,id);const key=`${kind}:${id}`,prior=rows.get(key);if(prior){prior.aliases=[...new Set([...prior.aliases,...aliases])];return;}rows.set(key,{kind,id,authoritySource,aliases});};
 for(const [kind,plural]of [['item','items'],['skill','skills'],['technique','techniques'],['enemy','enemies'],['location','locations'],['faction','factions'],['ending','endings'],['level','levels'],['currency','currencies']])for(const e of read(`mod-kit/entity-catalog/${plural}.json`).entries)add(kind,e.id,e.authoritySource,e.aliases);
 for(const e of read('src/modules/scenarioMods/builtins/character-registry.json').characters)add('character',e.id,'src/modules/scenarioMods/builtins/character-registry.json',[...e.aliases,...(e.idAliases||[])]);
 for(const e of read('mod-kit/entity-ledger/overrides.json').entities)add('address',e.id,'mod-kit/entity-ledger/overrides.json',e.aliases);
 for(const e of read('src/modules/sceneModule/contracts/statuses.json'))add('status',e.id,'src/modules/sceneModule/contracts/statuses.json');
 for(const e of [...SCENE_CONTRACTS,...SCENE_CONTRACT_DRAFTS])add('scene',e.meta.id,'src/modules/sceneModule/contracts/registry.ts');
 for(const e of SECONDARY_LINES)add('line',e.id,'src/modules/scenarioMods/secondaryLines.ts');
 for(const e of CHARACTER_QUESTS)add('line',e.id,'src/modules/scenarioMods/characterQuests.ts');
 for(const file of readdirSync(new URL('src/modules/scenarioMods/builtins/data/',root)).filter(f=>f.endsWith('.json')).sort()){
  const path=`src/modules/scenarioMods/builtins/data/${file}`,m=read(path);
  for(const e of m.canon?.characters||[])add('character',e.id,path,[e.name]);
  for(const e of m.canon?.locations||[]){const id=loc.canonicalLocationId(e.id);add('location',id,'src/modules/scenarioMods/travel/locationIds.ts',Object.entries(loc.LOCATION_ID_ALIASES).filter(([,to])=>to===id).map(([from])=>from));}
  for(const e of m.canon?.factions||[])add('faction',e.id,path);
  for(const e of m.scenario?.chapters||[])add('chapter',e.id,path);
  for(const e of m.scenario?.events||[]){add('event',e.id,path);for(const a of e.playerCompletionContract?.actions||[])add('action',`${e.id}:${a.id}`,path);}
  const walk=o=>{if(!o||typeof o!=='object')return;for(const[k,v]of Object.entries(o)){
   if(k==='endingId'&&typeof v==='string')add('ending',v,path);
   if(k==='ending'&&v?.id)add('ending',v.id,path);
   if(k==='factId'&&typeof v==='string')add('fact',v,path);
   if(k==='path'&&typeof v==='string'&&v.startsWith('flags.'))add('flag',v.slice(6),path);
   walk(v);
  }};walk(m.scenario);
 }
 const resources=read('mod-kit/quest-lines/resources.json');
 for(const [plural,kind] of [['texts','text'],['memories','memoryTemplate'],['facts','fact'],['affinityWeights','affinityWeight'],['salience','salience']])for(const id of Object.keys(resources[plural]))add(kind,id,'mod-kit/quest-lines/resources.json');
 for(const line of read('mod-kit/quest-lines/lines.json').lines){add('line',line.id,'mod-kit/quest-lines/lines.json');for(const b of line.beats){for(const e of [...b.onComplete,...Object.values(b.byAction||{}).flat()]){if(e.kind==='setReceipt')add('receipt',e.receiptId,'mod-kit/quest-lines/lines.json');if(e.kind==='setState')add('state',e.stateId,'mod-kit/quest-lines/lines.json');}}}
 for(const c of [...SCENE_CONTRACTS,...SCENE_CONTRACT_DRAFTS])if(c.defeat?.outcome?.endingId)add('ending',c.defeat.outcome.endingId,'src/modules/sceneModule/contracts/registry.ts');
 return {version:1,entries:[...rows.values()].sort((a,b)=>`${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),reusedSources:{character:'src/modules/scenarioMods/builtins/character-registry.json',location:'src/modules/scenarioMods/travel/locationIds.ts',address:'mod-kit/entity-ledger/overrides.json',status:'src/modules/sceneModule/contracts/statuses.json',scene:'src/modules/sceneModule/contracts/registry.ts'}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const index=buildEntityIndex();writeFileSync(new URL('mod-kit/entity-catalog/index.json',root),JSON.stringify(index,null,2)+'\n');console.log('indexed',index.entries.length);}
