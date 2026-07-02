#!/usr/bin/env node

// 任务1:event 软 axisId 提质。对 axisId=null 的 stage event,DeepSeek 从该关 seq 跨度内候选主轴节点语义选最佳。
// 写回 stage event.axisId(method=deepseek)。Usage: node scripts/event-axis-deepseek.mjs
// 提质后需重跑 sync-builtin-mods + 重启 8091。

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const ccDir = join(gen, 'character-canon');
const model = process.env.XIANTU_VERIFY_MODEL || 'deepseek/deepseek-v4-flash';
const binding = JSON.parse(readFileSync(join(ccDir, 'axis-binding.json'), 'utf8'));
const nodesBySeq = new Map(binding.nodes.map(n => [n.seq, n]));

function parseEnv(t){return Object.fromEntries(t.split(/\r?\n/).flatMap(l=>{const m=l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/);if(!m)return[];let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);return[[m[1],v]];}));}
function parseJson(t){const f=String(t).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];const c=f||String(t).slice(String(t).indexOf('{'),String(t).lastIndexOf('}')+1);return JSON.parse(c);}
let KEY;
async function orJson(messages,label){for(let i=1;i<=5;i++){try{const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,temperature:0,max_tokens:300,response_format:{type:'json_object'},messages})});const b=await r.text();if(!r.ok)throw new Error(r.status);const c=JSON.parse(b).choices?.[0]?.message?.content||'';if(!c.trim())throw new Error('empty');return parseJson(c);}catch(e){console.error(`  [${label}] ${i}/5 ${e.message}`);await new Promise(s=>setTimeout(s,i*2000));}}return null;}

async function run(){
  const env=existsSync(join(root,'.env'))?parseEnv(await readFile(join(root,'.env'),'utf8')):{};
  KEY=env.OPENROUTER_API_KEY;
  let fixed=0,still=0,total=0;
  for(const book of ['qingyu','yunlong','yange']){
    const dir=join(gen,book,'stages');
    for(const f of readdirSync(dir)){
      if(!f.endsWith('.json')||f.includes('uncert'))continue;
      const p=join(dir,f);const mod=JSON.parse(await readFile(p,'utf8'));
      const lo=mod.manifest.axisSeqLo, hi=mod.manifest.axisSeqHi;
      if(lo==null||hi==null)continue;
      const cands=[];for(let s=lo;s<=hi;s++){const n=nodesBySeq.get(s);if(n)cands.push(n);}
      if(!cands.length)continue;
      const candText=cands.map(n=>`${n.axisId}: ${n.beat}`).join('\n');
      let changed=false;
      for(const e of mod.scenario?.events||[]){
        total++;
        if(e.axisId)continue; // 只补 null
        const v=await orJson([
          {role:'system',content:'你做剧情事件对齐。给定一个游戏事件和若干主轴节点(axisId:剧情),选语义最匹配的一个 axisId。若都不匹配返回 none。只输出JSON {axisId}。'},
          {role:'user',content:`游戏事件:${e.name}｜${(e.description||'').slice(0,120)}\n\n主轴候选:\n${candText}`}
        ],`${mod.manifest.id}/${e.name}`);
        const pick=v?.axisId;
        if(pick&&pick!=='none'&&cands.find(n=>n.axisId===pick)){e.axisId=pick;e.axisMethod='deepseek';fixed++;changed=true;}
        else still++;
      }
      if(changed)await writeFile(p,JSON.stringify(mod,null,2)+'\n');
      const mm=(mod.scenario?.events||[]).filter(e=>e.axisId).length, tt=(mod.scenario?.events||[]).length;
      console.error(`${mod.manifest.id}: ${mm}/${tt} 有axisId`);
    }
  }
  console.error(`\n提质完成: 新补 ${fixed} | 仍无 ${still} | 总 event ${total}`);
}
run();
