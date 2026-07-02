#!/usr/bin/env node

// 任务2:把 unmappedLocalEntities 里的小势力补全进 atlas.factions。
// DeepSeek 从41个地点给每个势力选 HQ(框定:小说参考设定);position=HQ坐标,territory=HQ周边小框,placementBasis=layout_only。
// 加进 atlas.factions + 从 unmapped 移除。备份 .pre-minorfac。Usage: node scripts/atlas-add-minor-factions.mjs

import { readFileSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const atlasPath = join(gen, 'shared-atlas', 'liuchao.shared-atlas.v1.json');
const model = process.env.XIANTU_VERIFY_MODEL || 'deepseek/deepseek-v4-flash';

function parseEnv(t){return Object.fromEntries(t.split(/\r?\n/).flatMap(l=>{const m=l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/);if(!m)return[];let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);return[[m[1],v]];}));}
function parseJson(t){const f=String(t).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];const c=f||String(t).slice(String(t).indexOf('{'),String(t).lastIndexOf('}')+1);return JSON.parse(c);}
let KEY;
async function orJson(messages,label){for(let i=1;i<=5;i++){try{const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,temperature:0,max_tokens:400,response_format:{type:'json_object'},messages})});const b=await r.text();if(!r.ok)throw new Error(r.status);const c=JSON.parse(b).choices?.[0]?.message?.content||'';if(!c.trim())throw new Error('empty');return parseJson(c);}catch(e){console.error(`  [${label}] ${i}/5 ${e.message}`);await new Promise(s=>setTimeout(s,i*2000));}}return null;}

async function run(){
  const env=existsSync(join(root,'.env'))?parseEnv(await readFile(join(root,'.env'),'utf8')):{};
  KEY=env.OPENROUTER_API_KEY;
  if(!existsSync(atlasPath+'.pre-minorfac')) copyFileSync(atlasPath,atlasPath+'.pre-minorfac');
  const doc=JSON.parse(await readFile(atlasPath,'utf8'));const atlas=doc.atlas;
  const locById=new Map(atlas.locations.map(l=>[l.id,l]));
  const locList=atlas.locations.map(l=>`${l.id}(${l.name})`).join(', ');
  const factionIds=new Set(atlas.factions.map(f=>f.id));

  // 收集 unmapped 小势力(去重),取 name/desc/出处
  const stageFac={};
  for(const book of ['qingyu','yunlong','yange']){const d=join(gen,book,'stages');for(const f of readdirSync(d)){if(!f.endsWith('.json')||f.includes('uncert'))continue;const m=JSON.parse(readFileSync(join(d,f)));for(const x of m.canon?.factions||[])stageFac[x.id]=stageFac[x.id]||{id:x.id,name:x.name,desc:x.description||'',book,modId:m.manifest.id};}}
  const targets={};
  for(const b of doc.stageBindings||[])for(const u of b.unmappedLocalEntities||[])if(u.kind==='faction'&&stageFac[u.localId]&&!factionIds.has(u.localId))targets[u.localId]=stageFac[u.localId];
  const list=Object.values(targets);
  console.error(`待补全小势力(去重) ${list.length} 个`);

  const added=[];
  for(const t of list){
    const v=await orJson([
      {role:'system',content:'你是游戏地图设定助手。以下是小说《六朝清羽记/云龙吟/燕歌行》(成人向武侠)参考设定,仅用于地图定位。给定一个势力,从地点列表里选它最可能的总部所在地。只输出JSON {locationId, confidence(0-1), reason(一句)}。locationId 必须是列表中的 id;若都不合适选最接近的城池。'},
      {role:'user',content:`势力:${t.name}\n描述:${t.desc}\n出处:${t.book}\n可选地点:${locList}`}
    ],t.name);
    const loc=v&&locById.get(v.locationId);
    const hq=loc||atlas.locations[0];
    const px=hq.coordinates?.x??5000, py=hq.coordinates?.y??5000;
    const d=80;
    atlas.factions.push({
      id:t.id,name:t.name,aliases:[],description:t.desc||`${t.name}（次要势力）`,type:'organization',
      headquartersLocationId:hq.id,position:{x:px,y:py},
      territory:[{x:px-d,y:py-d},{x:px+d,y:py-d},{x:px+d,y:py+d},{x:px-d,y:py+d},{x:px-d,y:py-d}],
      placementBasis:'layout_only',confidence:Math.min(0.5,v?.confidence??0.3),
      sourceRefs:[{kind:'scenario_mod',book:t.book,modId:t.modId,summary:`${t.name} 在 ${t.modId} 出现`}]
    });
    factionIds.add(t.id);
    added.push(`${t.name} → HQ ${hq.name}(${(v?.confidence??0).toFixed?.(1)||'?'})`);
    console.error(`  + ${t.name} → ${hq.name}`);
  }
  // 从 unmapped 移除已补的
  for(const b of doc.stageBindings||[]) if(b.unmappedLocalEntities) b.unmappedLocalEntities=b.unmappedLocalEntities.filter(u=>!(u.kind==='faction'&&factionIds.has(u.localId)));
  await writeFile(atlasPath,JSON.stringify(doc,null,2)+'\n');
  console.error(`\n补全 ${added.length} 势力,atlas.factions 现 ${atlas.factions.length} 个`);
}
run();
