import registry from './builtins/character-registry.json';
/** Project item/skill/technique authority. Stages carry only ids and access conditions. */
import items from '../../../mod-kit/entity-catalog/items.json';
import skills from '../../../mod-kit/entity-catalog/skills.json';
import techniques from '../../../mod-kit/entity-catalog/techniques.json';
import index from '../../../mod-kit/entity-catalog/index.json';
import type {ScenarioMod,ScenarioModItem,ScenarioModSkill,ScenarioModTechnique} from './schema';
export type ContentKind='item'|'skill'|'technique';
export interface CatalogEntry {id:string;aliases:string[];definition:Record<string,unknown>;stageVariants:Record<string,Record<string,unknown>>;authoritySource:string}
const sources:Record<ContentKind,{entries:CatalogEntry[]}>= {item:items as unknown as {entries:CatalogEntry[]},skill:skills as unknown as {entries:CatalogEntry[]},technique:techniques as unknown as {entries:CatalogEntry[]}};
const tables=Object.fromEntries(Object.entries(sources).map(([kind,source])=>[kind,new Map(source.entries.map(e=>[e.id,e]))])) as Record<ContentKind,Map<string,CatalogEntry>>;
export const ENTITY_INDEX=index;
export function contentDefinition(kind:ContentKind,id:string,stageId?:string):Record<string,unknown>|undefined {
 const entry=tables[kind].get(id);if(!entry)return undefined;
 return JSON.parse(JSON.stringify((stageId&&entry.stageVariants[stageId])||entry.definition));
}
export function contentName(kind:ContentKind,id:string,stageId?:string):string {return String(contentDefinition(kind,id,stageId)?.name||id);}
export function contentEntries(kind:ContentKind):CatalogEntry[] {return JSON.parse(JSON.stringify(sources[kind].entries));}
/** Hydrate a copy at the boundary; caller-provided full definitions remain valid for independent mods. */
export function resolveScenarioContent<T>(input:T):T {
 if(!input||typeof input!=='object')return input;
 const mod=JSON.parse(JSON.stringify(input)) as any;
 for(const id of mod.scenario?.optionalActorIds||[]){if(mod.canon.characters.some((c:any)=>c.id===id))continue;const c=registry.characters.find(c=>c.id===id);if(!c)throw Error(`未知角色引用：${id}`);const phase=c.phaseIdentities.find((p:any)=>p.stageId===mod.manifest.id);mod.canon.characters.push({id,name:c.canonicalName,gender:c.gender,role:phase?.identity||c.staticProfile.identitySummary,race:(c.staticProfile as any).race,profile:{appearance:c.staticProfile.appearance},questLineActor:true});}
 for(const [kind,plural] of [['item','items'],['skill','skills'],['technique','techniques']] as const){
  if(!Array.isArray(mod.content?.[plural]))continue;
  mod.content[plural]=mod.content[plural].map((ref:any)=>{
   if(ref?.name!==undefined)return ref;
   const def=contentDefinition(kind,ref?.id,mod.manifest?.id);
   if(!def)throw new Error(`未知${kind}引用：${String(ref?.id)}`);
   const extra=Object.keys(ref).filter(k=>!['id','availableWhen','revealWhen'].includes(k));
   if(extra.length)throw new Error(`关卡${kind}引用含定义字段：${extra.join(',')}`);
   return {...def,...ref};
  });
 }
 return mod as T;
}
export const catalogItem=(id:string,stageId?:string)=>contentDefinition('item',id,stageId) as unknown as ScenarioModItem|undefined;
export const catalogSkill=(id:string,stageId?:string)=>contentDefinition('skill',id,stageId) as unknown as ScenarioModSkill|undefined;
export const catalogTechnique=(id:string,stageId?:string)=>contentDefinition('technique',id,stageId) as unknown as ScenarioModTechnique|undefined;

/** Import/recognition boundary only: resolve an exact catalog label when it has one id, never guess between homonyms. */
export function resolveContentId(kind:ContentKind,label:string):string|undefined {
 const ids=sources[kind].entries.filter(e=>e.id===label||e.aliases.includes(label)||[e.definition,...Object.values(e.stageVariants)].some(d=>d.name===label)).map(e=>e.id);
 return ids.length===1?ids[0]:undefined;
}
