import {readFileSync,readdirSync} from 'node:fs';
import {applyPackOverlays} from './content-pack-overlays.mjs';
const root=new URL('../',import.meta.url);
export function effectivePackStages(){
 const catalog=JSON.parse(readFileSync(new URL('src/modules/contentPacks/generated/catalog.json',root),'utf8'));
 const stages=new Map(readdirSync(new URL('src/modules/scenarioMods/builtins/data/',root)).filter(f=>f.endsWith('.json')).map(f=>{const s=JSON.parse(readFileSync(new URL(`src/modules/scenarioMods/builtins/data/${f}`,root),'utf8'));return [s.manifest.id,s];}));
 for(const s of catalog.stages)stages.set(s.manifest.id,structuredClone(s));
 applyPackOverlays(stages,catalog.overlays);
 return [...stages.values()];
}
