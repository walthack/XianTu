/** Content overlays are explicit whole-event replacements/additions. No character/canon field writes. */
export function applyPackOverlays(stages,overlays){
 const seen=new Set();for(const o of overlays){if(!o||Object.keys(o).some(k=>!['stageId','events'].includes(k))||!Array.isArray(o.events)||!stages.has(o.stageId))throw Error('Content Pack: invalid event overlay');const s=stages.get(o.stageId);for(const e of o.events){if(!e?.id||seen.has(e.id))throw Error('Content Pack: duplicate/invalid overlay event');seen.add(e.id);const at=s.scenario.events.findIndex(x=>x.id===e.id);if(at<0)s.scenario.events.push(structuredClone(e));else s.scenario.events[at]=structuredClone(e);}}
 return stages;
}
