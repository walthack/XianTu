// B5: 把灵根/天赋的生硬占位描述换成小说风格(按能力名生成一次、复用到所有持有者)。
// 只替换已知占位串与空值，不动真实描述。DeepSeek 生成；备份 stages-pre-abilitydesc-backup。
import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const books = ['qingyu', 'yunlong', 'yange'];
const model = process.env.XIANTU_DESC_MODEL || 'deepseek/deepseek-v4-flash';
// 占位识别(放宽):覆盖各种"剧本正典/角色定位/推定/认定"生成套话 + 空值。
const isPlaceholder = s => !s || /由剧本正典|剧本正典认定|正典赋予|由角色定位|推定的天赋|原作未载|^未知$/.test(s);

function parseEnv(t){return Object.fromEntries(t.split(/\r?\n/).flatMap(l=>{const m=l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);if(!m)return[];let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);return[[m[1],v]];}));}
function parseJson(t){const f=String(t).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];const c=f||String(t).slice(String(t).indexOf('{'),String(t).lastIndexOf('}')+1);return JSON.parse(c);}
async function orJson(messages,label){const env=existsSync(join(root,'.env'))?parseEnv(await readFile(join(root,'.env'),'utf8')):{};const key=env.OPENROUTER_API_KEY||process.env.OPENROUTER_API_KEY;for(let i=1;i<=4;i++){try{const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','X-Title':'XianTu Desc'},body:JSON.stringify({model,temperature:0.4,max_tokens:4000,response_format:{type:'json_object'},messages})});const b=await r.text();if(!r.ok)throw new Error(r.status);return parseJson(JSON.parse(b).choices?.[0]?.message?.content||'');}catch(e){console.error(`[${label}] ${i}/4 ${e.message}`);await new Promise(s=>setTimeout(s,i*1500));}}return null;}
async function readJson(p){return JSON.parse(await readFile(p,'utf8'));}

async function run(){
  const roots=new Set(),talents=new Set();
  for(const b of books){const d=join(gen,b,'stages');for(const f of (await readdir(d)).filter(n=>n.endsWith('.json')&&!n.endsWith('.uncertainties.json'))){const m=await readJson(join(d,f));for(const c of m.canon?.characters||[]){const p=c.profile||{};if(p.spiritRoot?.name)roots.add(p.spiritRoot.name);for(const t of p.talents||[])if(t.name)talents.add(t.name);}}}
  // 复用已有 ability-descriptions.json(保持一致,避免重复调用);缺失或新增能力名才补生成。
  const descPath=join(canonDir,'ability-descriptions.json');
  let rMap={},tMap={};
  if(existsSync(descPath)){const prev=await readJson(descPath);rMap=prev.roots||{};tMap=prev.talents||{};}
  const missR=[...roots].filter(n=>!rMap[n]),missT=[...talents].filter(n=>!tMap[n]);
  console.error(`灵根 ${roots.size}(缺${missR.length}) / 天赋 ${talents.size}(缺${missT.length})`);
  if(missR.length){const o=await orJson([{role:'system',content:'你是修仙小说设定撰写者。为每个灵根名写一句凝练、有画面感的小说风格描述(20-40字)，点出其属性特质与修炼倾向，不要生硬套话。'},{role:'user',content:`严格 JSON {"map":{"火灵根":"…"}}：\n${missR.join('、')}`}],'roots');Object.assign(rMap,o?.map||{});}
  if(missT.length){const o=await orJson([{role:'system',content:'你是修仙小说设定撰写者。为每个天赋名写一句凝练、有画面感的小说风格描述(20-40字)，点出其天赋效果，不要生硬套话。'},{role:'user',content:`严格 JSON {"map":{"体修奇才":"…"}}：\n${missT.join('、')}`}],'talents');Object.assign(tMap,o?.map||{});}
  await writeFile(descPath,`${JSON.stringify({roots:rMap,talents:tMap},null,2)}\n`);

  let rN=0,tN=0;
  for(const b of books){const d=join(gen,b,'stages');const bk=join(gen,b,'stages-pre-abilitydesc-backup');if(existsSync(bk))await rm(bk,{recursive:true});await cp(d,bk,{recursive:true});
    for(const f of (await readdir(d)).filter(n=>n.endsWith('.json')&&!n.endsWith('.uncertainties.json'))){const m=await readJson(join(d,f));let ch=false;
      for(const c of m.canon?.characters||[]){const p=c.profile;if(!p)continue;
        if(p.spiritRoot?.name&&rMap[p.spiritRoot.name]&&isPlaceholder(p.spiritRoot.description)){p.spiritRoot.description=rMap[p.spiritRoot.name];rN++;ch=true;}
        for(const t of p.talents||[])if(t.name&&tMap[t.name]&&isPlaceholder(t.description)){t.description=tMap[t.name];tN++;ch=true;}}
      if(ch)await writeFile(join(d,f),`${JSON.stringify(m,null,2)}\n`);}}
  console.error(`替换占位：灵根描述 ${rN} 处 / 天赋描述 ${tN} 处。备份 stages-pre-abilitydesc-backup。`);
}
run().catch(e=>{console.error(e);process.exit(1);});
