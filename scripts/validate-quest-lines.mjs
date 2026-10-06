import Ajv from 'ajv';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createJiti} from 'jiti';
const root=new URL('../',import.meta.url),jiti=createJiti(import.meta.url,{alias:{'@':fileURLToPath(new URL('src',root))}});
const {parseQuestLines,validateQuestLineReferences}=await jiti.import(fileURLToPath(new URL('src/modules/scenarioMods/questLines.ts',root)));
export function auditQuestLines(raw=JSON.parse(readFileSync(new URL('mod-kit/quest-lines/lines.json',root),'utf8'))){
 const index=JSON.parse(readFileSync(new URL('mod-kit/entity-catalog/index.json',root),'utf8'));
 const ids=new Set(index.entries.map(row=>`${row.kind}:${row.id}`));
 const validate=new Ajv({allErrors:true}).compile(JSON.parse(readFileSync(new URL('mod-kit/schema/xiantu.quest-lines.v1.schema.json',root),'utf8')));
 if(!validate(raw))return {lines:0,errors:validate.errors.map(e=>`${e.dataPath}: ${e.message}`)};
 try{const table=parseQuestLines(raw);return {lines:table.lines.length,errors:validateQuestLineReferences(table,(kind,id,eventId)=>ids.has(`${kind}:${kind==='action'?`${eventId}:${id}`:id}`))};}
 catch(error){return {lines:0,errors:[String(error.message)]};}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const result=auditQuestLines();console.log(JSON.stringify(result,null,2));if(result.errors.length)process.exitCode=1;}
