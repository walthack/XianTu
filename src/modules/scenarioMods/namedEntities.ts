/** Canonical non-content entities. Recognition may use aliases; persistent references use ids. */
import characters from './builtins/character-registry.json';
import index from '../../../mod-kit/entity-catalog/index.json';
import addresses from '../../../mod-kit/entity-ledger/overrides.json';
import locations from '../../../mod-kit/entity-catalog/locations.json';
import factions from '../../../mod-kit/entity-catalog/factions.json';
import enemies from '../../../mod-kit/entity-catalog/enemies.json';
import endings from '../../../mod-kit/entity-catalog/endings.json';
export type NamedEntityKind='character'|'location'|'faction'|'enemy'|'ending';
type Entry={id:string;aliases:string[];definition:Record<string,any>;stageVariants?:Record<string,Record<string,any>>};
const tables:Record<NamedEntityKind,Entry[]>={character:[...characters.characters.map(c=>({id:c.id,aliases:[...new Set([...c.aliases,...((c as any).idAliases||[]),...(addresses.entities.find(e=>e.id===c.id)?.aliases||[]),...(index.entries.find(e=>e.kind==='character'&&e.id===c.id)?.aliases||[])])],definition:{id:c.id,name:c.canonicalName,recognitionLabels:(addresses.recognitionLabels as Record<string,Record<string,string>>)[c.id]}})),...index.entries.filter(e=>e.kind==='character'&&!characters.characters.some(c=>c.id===e.id)&&e.aliases.length).map(e=>({id:e.id,aliases:e.aliases,definition:{id:e.id,name:e.aliases[0]}}))],location:locations.entries as unknown as Entry[],faction:factions.entries as unknown as Entry[],enemy:enemies.entries as unknown as Entry[],ending:endings.entries as unknown as Entry[]};
const byId=Object.fromEntries(Object.entries(tables).map(([kind,entries])=>[kind,new Map(entries.map(e=>[e.id,e]))])) as Record<NamedEntityKind,Map<string,Entry>>;
const lookup=Object.fromEntries(Object.entries(tables).map(([kind,entries])=>{const m=new Map<string,Set<string>>();for(const e of entries)for(const label of [e.id,...e.aliases,String(e.definition.name),...Object.values(e.stageVariants||{}).map(v=>String(v.name))]){if(!m.has(label))m.set(label,new Set());m.get(label)!.add(e.id);}return [kind,m];})) as Record<NamedEntityKind,Map<string,Set<string>>>;
const aliasesCache=new Map<string,string[]>(),patternCache=new Map<string,string>();
export function canonicalEntityId(kind:NamedEntityKind,id:string):string {if(byId[kind].has(id))return id;const found=lookup[kind].get(id);return found?.size===1?[...found][0]:id;}
export function namedEntity(kind:NamedEntityKind,id:string,stageId?:string):Record<string,any>|undefined {const e=byId[kind].get(canonicalEntityId(kind,id));return e?structuredClone(stageId&&e.stageVariants?.[stageId]||e.definition):undefined;}
export function entityName(kind:NamedEntityKind,id:string,stageId?:string):string {const e=byId[kind].get(canonicalEntityId(kind,id));return String((stageId&&e?.stageVariants?.[stageId]?.name)||e?.definition.name||id);}
export function entityAliases(kind:NamedEntityKind,id:string):string[]{id=canonicalEntityId(kind,id);const key=kind+':'+id;if(!aliasesCache.has(key)){const e=byId[kind].get(id);aliasesCache.set(key,e?[...new Set([String(e.definition.name),...e.aliases,...Object.values(e.stageVariants||{}).map(v=>String(v.name))])].filter(s=>s&&!/^[a-z]+\./i.test(s)):[]);}return [...aliasesCache.get(key)!];}
export function resolveNamedEntityId(kind:NamedEntityKind,label:string):string|undefined {const found=lookup[kind].get(label);return found?.size===1?[...found][0]:undefined;}
export function entityNamePattern(kind:NamedEntityKind,id:string):string {const key=kind+':'+id;if(!patternCache.has(key))patternCache.set(key,entityAliases(kind,id).sort((a,b)=>b.length-a.length).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'));return patternCache.get(key)!;}
export function namedEntityEntries(kind:NamedEntityKind):Entry[]{return structuredClone(tables[kind]);}
export function isNamedEntityLabel(kind:NamedEntityKind,id:string,label:unknown):boolean {return typeof label==='string'&&(canonicalEntityId(kind,label)===canonicalEntityId(kind,id)||entityAliases(kind,id).includes(label));}
export function containsEntityLabel(value:unknown,kind:NamedEntityKind,id:string):boolean {const aliases=entityAliases(kind,id);return typeof value==='string'?aliases.some(label=>value.includes(label)):Array.isArray(value)?value.some(label=>isNamedEntityLabel(kind,id,label)):value instanceof Set?[...value].some(label=>isNamedEntityLabel(kind,id,label)):false;}

/** Author text resolves display labels from the same master as structural references. */
export function entityText(text:string):string{return text.replace(/\{\{entity:(character|location|faction|enemy|ending):([^}]+)\}\}/g,(_,kind:NamedEntityKind,id:string)=>entityName(kind,id));}

/** A stable label selector for evidence that must retain its authored short form. */
export function entityRecognitionLabel(kind:NamedEntityKind,id:string,labelId:string):string {const value=byId[kind].get(canonicalEntityId(kind,id))?.definition.recognitionLabels?.[labelId];if(typeof value!=='string')throw new Error(`Unknown recognition label: ${kind}/${id}/${labelId}`);return value;}
