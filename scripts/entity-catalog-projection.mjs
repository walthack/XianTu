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
 for(const loc of list){
  if(!loc||typeof loc!=='object'||Object.prototype.hasOwnProperty.call(loc,'country'))continue;
  const country=byId.get(loc.id);
  if(country)loc.country=country;
 }
 return mod;
}
