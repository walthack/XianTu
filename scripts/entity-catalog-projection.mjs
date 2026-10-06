import {readFileSync} from 'node:fs';
const access=JSON.parse(readFileSync(new URL('../mod-kit/entity-catalog/stage-access.json',import.meta.url),'utf8'));
/** Generated prose copies are not content authority; published stages only reference the master catalog. */
export function projectContentReferences(mod){
 const refs=access.stages[mod.manifest?.id];
 if(refs)mod.content=structuredClone(refs);
 return mod;
}
