import {readFileSync} from 'node:fs';
const access=JSON.parse(readFileSync(new URL('../mod-kit/entity-catalog/stage-access.json',import.meta.url),'utf8'));
/** Generated prose copies are not content authority; published stages only reference the master catalog. */
export function projectContentReferences(mod){
 const refs=access.stages[mod.manifest?.id];
 if(refs)mod.content=structuredClone(refs);
 return mod;
}
const locationCatalog=JSON.parse(readFileSync(new URL('../mod-kit/entity-catalog/locations.json',import.meta.url),'utf8'));
/** Location country authority lives in the master catalog (generated source trees predate it). */
export function projectLocationCountries(mod){
 const list=mod?.canon?.locations;
 if(!Array.isArray(list))return mod;
 const stageId=mod.manifest?.id;
 const byId=new Map();
 for(const e of locationCatalog.entries||[]){
  const country=e.stageVariants?.[stageId]?.country??e.definition?.country;
  if(typeof country!=='string'||!country)continue;
  for(const id of [e.id,...(e.aliases||[])])if(!byId.has(id))byId.set(id,country);
 }
 const fieldAuth=new Map();
 for(const e of locationCatalog.entries||[]){
  const fields=e.authoritativeFields;
  if(!Array.isArray(fields)||!fields.length)continue;
  const src={...(e.definition||{}),...(e.stageVariants?.[stageId]||{})};
  for(const id of [e.id,...(e.aliases||[])])if(!fieldAuth.has(id))fieldAuth.set(id,{fields,src});
 }
 for(const loc of list){
  if(!loc||typeof loc!=='object')continue;
  // Catalog-authoritative prose fields (e.g. 江州归晋后的 region/description) override stale generated copies.
  const auth=fieldAuth.get(loc.id);
  if(auth)for(const f of auth.fields){
   if(typeof auth.src[f]==='string'&&auth.src[f])loc[f]=auth.src[f];
   else if(f==='coordinates'&&Number.isFinite(auth.src[f]?.x)&&Number.isFinite(auth.src[f]?.y))loc[f]=structuredClone(auth.src[f]);
  }
  if(Object.prototype.hasOwnProperty.call(loc,'country'))continue;
  const country=byId.get(loc.id);
  if(country)loc.country=country;
 }
 return mod;
}
