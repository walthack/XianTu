import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
export function auditCharacterLevels(){const t=read('mod-kit/entity-catalog/character-levels.qingyu.json'),index=read('mod-kit/entity-catalog/index.json'),numbers=read('mod-kit/game-numbers.qingyu.json');const known=new Set(index.entries.filter(e=>['character','enemy'].includes(e.kind)).map(e=>e.id)),errors=[],seen=new Set();
 for(const e of t.entries){if(seen.has(e.sourceRow))errors.push(`duplicate source row ${e.sourceRow}`);seen.add(e.sourceRow);if(!known.has(e.entityId))errors.push(`unknown entity ${e.entityId}`);
  for(const key of ['level','canonicalLevel','effectiveLevel'])if(e[key]!=null&&(!Number.isInteger(e[key])||e[key]<numbers.levels.min||e[key]>numbers.levels.max))errors.push(`invalid ${key} at row ${e.sourceRow}`);
  if(e.applicability==='not_applicable'&&e.level!==null)errors.push(`NA must remain null at row ${e.sourceRow}`);
  if(!e.chapterRanges?.length||e.chapterRanges.some(([lo,hi])=>!Number.isInteger(lo)||!Number.isInteger(hi)||lo>hi))errors.push(`invalid chapter range ${e.sourceRow}`);
  if(!e.evidence||!e.sourceKind)errors.push(`missing source ${e.sourceRow}`);
  if(e.confidence==='low_placeholder'&&e.settingStatus!=='placeholder')errors.push(`low confidence asserted as setting ${e.sourceRow}`);
 }
 for(const [old,id] of Object.entries(t.idAliases))if(old===id||!known.has(id)||t.idAliases[id])errors.push(`invalid alias ${old}`);
 return {rows:t.entries.length,notApplicable:t.entries.filter(e=>e.level===null).length,lowConfidence:t.entries.filter(e=>e.confidence==='low_placeholder').length,errors};}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=auditCharacterLevels();console.log(JSON.stringify(r,null,2));if(r.errors.length)process.exitCode=1;}
