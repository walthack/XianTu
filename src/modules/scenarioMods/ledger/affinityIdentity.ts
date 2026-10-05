import registry from '../builtins/character-registry.json';
import overrides from '../../../../mod-kit/entity-ledger/overrides.json';

type Character = { id: string; name: string };
type Profile = { 角色ID?: string; 名字?: string; 好感度?: unknown; 与玩家关系?: unknown };
type Save = { 社交?: { 关系?: Record<string, unknown> } };
const names = new Map<string, Set<string>>();
for (const entity of registry.characters) {
  for (const name of [entity.canonicalName, ...entity.aliases]) {
    const ids = names.get(name) || new Set<string>(); ids.add(entity.id); names.set(name, ids);
  }
}
for (const entity of overrides.entities) for (const alias of entity.aliases.filter(name => !/^(?:鬼王峒使者|二爷|老四)$/.test(name)).map(text => ({text}))) {
  const ids = names.get(alias.text) || new Set<string>(); ids.add(entity.id); names.set(alias.text, ids);
}

export function splitRecordPath(path: string): string[] {
  // Canon ids contain dots: bracket notation preserves them as one property.
  const parts: string[] = [];
  const pattern = /\["((?:\\.|[^"\\])*)"\]|[^.\[\]]+/g;
  for (const hit of path.matchAll(pattern)) parts.push(hit[1] === undefined ? hit[0] : JSON.parse('"' + hit[1] + '"'));
  return parts;
}
export function npcRecordPath(id: string, field = ''): string {
  return '社交.关系.[' + JSON.stringify(id) + ']' + (field ? '.' + field : '');
}
function uniqueId(name: string, characters: Character[]): string | undefined {
  const current = characters.filter(c => c.name === name || c.id === name);
  const candidates = new Set(current.length ? current.map(c=>c.id) : names.get(name) || []);
  return candidates.size === 1 ? [...candidates][0] : undefined;
}
export function resolveRelationshipId(save: Save, reference: string, characters: Character[] = []): string | undefined {
  const records = save?.社交?.关系 || {};
  if (Object.prototype.propertyIsEnumerable.call(records, reference)) {
    const value = records[reference] as Profile | undefined;
    if (value?.角色ID === reference) return reference;
  }
  const matches = Object.entries(records).filter(([key,value]) => value && typeof value === 'object'
    && (key === reference || (value as any).原关系键 === reference || (value as Profile).名字 === reference || names.get(reference)?.has((value as Profile).角色ID || '')));
  if (matches.length === 1) return (matches[0][1] as Profile).角色ID;
  if (matches.length > 1) return undefined;
  return uniqueId(reference, characters);
}
export function newLocalCharacterId(): string {
  return 'npc.local.' + (globalThis.crypto.randomUUID?.() || Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), n=>n.toString(16).padStart(8,'0')).join(''));
}
/** Stored and enumerated records use ids only. Unique old-name accessors are transient compatibility, never serialized. */
export function backfillRelationshipIds(save: Save, characters: Character[] = [], log = console.warn): void {
  const records = save.社交?.关系;
  if (!records) return;
  for (const key of Object.getOwnPropertyNames(records)) if (!Object.getOwnPropertyDescriptor(records,key)?.enumerable) delete records[key];
  const entries = Object.entries(records);
  const claimed = new Map<string, number>();
  for (const [,value] of entries) {
    const id = (value as Profile)?.角色ID;
    if (id) claimed.set(id,(claimed.get(id)||0)+1);
  }
  for (const [key,value] of entries) {
    if (!value || typeof value !== 'object') continue;
    const profile = value as Profile & { 原关系键?: string; 身份待核?: boolean; 原角色ID?: string };
    let id = profile.角色ID;
    if (id && (claimed.get(id)||0)>1) { profile.原角色ID=id; id=undefined; profile.身份待核=true; }
    if (!id && !profile.身份待核) {
      const candidates = new Set<string>();
      for (const name of new Set([key,profile.名字].filter((x): x is string => Boolean(x)))) {
        const found=uniqueId(name,characters); if(found) candidates.add(found);
      }
      if(candidates.size===1) id=[...candidates][0];
    }
    if (!id || (records[id] && id !== key && records[id] !== value)) {
      profile.身份待核=true;
      id=newLocalCharacterId();
      log('[关系ID迁移待核]',{legacyKey:key,localId:id,originalId:profile.原角色ID});
    }
    profile.角色ID=id; profile.名字 ||= key; profile.原关系键 ||= key;
    if(id!==key) { delete records[key]; records[id]=value; }
  }
  const matrix=(save as any).社交?.关系矩阵;
  if(matrix) {
    const local=new Map<string,string>();
    const identify=(ref:string):string=>{
      if(!ref)return ref;
      if(ref==='玩家')return (save as any).世界?.状态?.剧本模组?.opening?.playerCharacterId||'$player';
      if(/^(?:liuchao|lcq|lyl|lyg|npc)\./.test(ref)||ref==='$player')return ref;
      const id=resolveRelationshipId(save,ref,characters);if(id)return id;
      if(!local.has(ref))local.set(ref,newLocalCharacterId());return local.get(ref)!;
    };
    matrix.nodes=(matrix.nodes||[]).map(identify);
    matrix.edges=(matrix.edges||[]).map((edge:any)=>({...edge,from:identify(edge.from),to:identify(edge.to),fromLabel:edge.fromLabel||edge.from,toLabel:edge.toLabel||edge.to}));
  }
  // Compatibility at the boundary only: no duplicate persistent records and no ambiguous name accessor.
  const aliases=new Map<string,Set<string>>();
  for(const [id,value] of Object.entries(records)) {
    const profile=value as Profile & { 原关系键?: string };
    const all=[profile.名字,profile.原关系键,...[...names].filter(([,ids])=>ids.has(id)).map(([name])=>name)];
    for(const name of all.filter((x):x is string=>Boolean(x)&&x!==id)) {
      const ids=aliases.get(name)||new Set<string>();ids.add(id);aliases.set(name,ids);
    }
  }
  for(const [name,ids] of aliases) if(ids.size===1&&!Object.prototype.hasOwnProperty.call(records,name)) {
    const id=[...ids][0]; Object.defineProperty(records,name,{enumerable:false,configurable:true,get:()=>records[id],set:value=>{records[id]=value;}});
  }
}
/** ID-only read API. Duplicate claims in un-migrated legacy data remain unresolved. */
export function relationshipOf(save: Save, id: string): { key: string; profile: Profile } | undefined {
  const matches=Object.entries(save.社交?.关系||{}).filter(([,value])=>value&&typeof value==='object'&&(value as Profile).角色ID===id);
  return matches.length===1 ? {key:matches[0][0],profile:matches[0][1] as Profile}:undefined;
}
export function affinityOf(save: Save, id: string): number {
  return Number(relationshipOf(save,id)?.profile.好感度)||0;
}
export function normalizeNpcRecordPath(path: string, save: Save, value?: unknown): string | null {
  const parts=splitRecordPath(path);
  if(parts[0]!=='社交'||parts[1]!=='关系'||!parts[2])return path;
  const id=resolveRelationshipId(save,parts[2],(save as any).世界?.状态?.剧本模组?.canon?.characters||[])
    || (parts.length===3&&value&&typeof value==='object' ? (value as Profile).角色ID : undefined);
  const explicit=/^(?:npc\.local\.|liuchao\.character\.|lcq\.character\.|lyl\.character\.|lyg\.character\.)/.test(parts[2]) ? parts[2] : undefined;
  return id || explicit ? npcRecordPath(id || explicit!,parts.slice(3).join('.')) : null;
}

export function runtimeEntityId(runtime: any, reference: string): string {
  if (/^(?:liuchao|lcq|lyl|lyg|npc|character)\./.test(reference)) {
    const name=runtime?.canon?.characters?.find((c:Character)=>c.id===reference)?.name;
    if(runtime&&name){runtime.personIdentities ||= {};runtime.personIdentities[reference]={name};}
    return reference;
  }
  const found=uniqueId(reference,runtime?.canon?.characters||[]);
  if(found){if(runtime){runtime.personIdentities ||= {};runtime.personIdentities[found]={name:reference};}return found;}
  const existing=Object.entries(runtime?.personIdentities||{}).find(([,v])=>(v as any)?.name===reference)
    || Object.entries(runtime?.sceneLedger?.actors||{}).find(([,v])=>(v as any)?.name===reference);
  if(existing)return existing[0];
  const id=newLocalCharacterId();
  if(runtime){runtime.personIdentities ||= {};runtime.personIdentities[id]={name:reference};}
  return id;
}
export function runtimeEntityName(runtime: any, id: string): string {
  return runtime?.canon?.characters?.find((c:Character)=>c.id===id)?.name
    || runtime?.personIdentities?.[id]?.name
    || runtime?.sceneLedger?.actors?.[id]?.name
    || registry.characters.find(c=>c.id===id)?.canonicalName || id;
}
export function migrateRuntimePersonRecords(runtime: any): void {
  if(!runtime)return;
  const ledger=runtime.sceneLedger;
  if(ledger)for(const field of ['actors','injuries','names']) {
    const records=ledger[field];if(!records)continue;
    for(const [key,value] of Object.entries(records)) {
      const id=runtimeEntityId(runtime,key);
      if(id!==key){delete records[key];records[id]=value;}
      if(field==='actors'&&value&&typeof value==='object') Object.assign(value,{characterId:id,name:runtimeEntityName(runtime,id)===id?key:runtimeEntityName(runtime,id)});
      const alias=field==='actors' ? (value as any)?.name : runtimeEntityName(runtime,id);
      if(alias&&alias!==id&&!Object.prototype.hasOwnProperty.call(records,alias)) Object.defineProperty(records,alias,{enumerable:false,configurable:true,get:()=>records[id]});
    }
  }
  for(const [key,value] of Object.entries(runtime.stanceStates||{})) {
    const id=runtimeEntityId(runtime,key);
    if(id!==key){delete runtime.stanceStates[key];runtime.stanceStates[id]=value;Object.defineProperty(runtime.stanceStates,key,{enumerable:false,configurable:true,get:()=>runtime.stanceStates[id]});}
  }
  if(Array.isArray(runtime.departedCast)) runtime.departedCast=[...new Set(runtime.departedCast.map((ref:string)=>runtimeEntityId(runtime,ref)))];
}

/** Internal lookup only; canonical names are not a disclosure projection. */
export function canonicalIdentityName(id: string): string | undefined {
  return registry.characters.find(c=>c.id===id)?.canonicalName;
}

/** Change-log identity stays stable; its separate label is only a display snapshot. */
export function annotatePersonChanges(changes: Array<{ key: string; characterId?: string; targetName?: string }>, save: Save, before?: Save): void {
  for (const change of changes) {
    const parts=splitRecordPath(change.key);
    if(parts[0]!=='社交'||parts[1]!=='关系'||!parts[2])continue;
    const id=resolveRelationshipId(save,parts[2]) || (before ? resolveRelationshipId(before,parts[2]) : undefined);
    if(!id)continue;
    change.key=npcRecordPath(id,parts.slice(3).join('.'));
    change.characterId=id;
    change.targetName ||= relationshipOf(save,id)?.profile.名字 || (before ? relationshipOf(before,id)?.profile.名字 : undefined);
  }
}
