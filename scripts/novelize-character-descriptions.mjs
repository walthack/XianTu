// B5尾: character.description 小说化(按唯一角色 id 改写,复用到所有 stage 条目)。
// 依据 name/role/现描述/外貌/势力,DeepSeek 重写成 1-2 句小说风格(保留身份事实+画面感)。备份 stages-pre-chardesc-backup。
import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const books = ['qingyu', 'yunlong', 'yange'];
const model = process.env.XIANTU_CDESC_MODEL || 'deepseek/deepseek-v4-flash';
const BATCH = Number(process.env.XIANTU_CDESC_BATCH || 12);

function parseEnv(t){return Object.fromEntries(t.split(/\r?\n/).flatMap(l=>{const m=l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);if(!m)return[];let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);return[[m[1],v]];}));}
function parseJson(t){const f=String(t).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];const c=f||String(t).slice(String(t).indexOf('{'),String(t).lastIndexOf('}')+1);return JSON.parse(c);}
async function orJson(messages,label){const env=existsSync(join(root,'.env'))?parseEnv(await readFile(join(root,'.env'),'utf8')):{};const key=env.OPENROUTER_API_KEY||process.env.OPENROUTER_API_KEY;for(let i=1;i<=4;i++){try{const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','X-Title':'XianTu CDesc'},body:JSON.stringify({model,temperature:0.4,max_tokens:6000,response_format:{type:'json_object'},messages})});const b=await r.text();if(!r.ok)throw new Error(r.status);return parseJson(JSON.parse(b).choices?.[0]?.message?.content||'');}catch(e){console.error(`[${label}] ${i}/4 ${e.message}`);await new Promise(s=>setTimeout(s,i*1500));}}return null;}
async function readJson(p){return JSON.parse(await readFile(p,'utf8'));}
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};

async function run() {
  // 聚合唯一角色(by id)
  const byId = new Map();
  for (const b of books) { const d = join(gen, b, 'stages'); for (const f of (await readdir(d)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) { const m = await readJson(join(d, f)); const facName = new Map((m.canon?.factions || []).map(x => [x.id, x.name])); for (const c of m.canon?.characters || []) { if (!c.id) continue; const e = byId.get(c.id) || { id: c.id, name: c.name, role: c.role || '', desc: '', appearance: '', faction: '' }; if (c.role && !e.role) e.role = c.role; if (c.description && c.description.length > e.desc.length) e.desc = c.description; const ap = c.profile?.appearance; if (ap && ap.length > e.appearance.length) e.appearance = ap; const fid = c.affiliations?.[0]?.factionId; if (fid && !e.faction) e.faction = facName.get(fid) || ''; byId.set(c.id, e); } } }
  const all = [...byId.values()];
  console.error(`唯一角色 ${all.length}，分 ${Math.ceil(all.length / BATCH)} 批改写…`);
  const out = {};
  let bi = 0;
  for (const grp of chunk(all, BATCH)) {
    bi++;
    const payload = grp.map(c => ({ id: c.id, name: c.name, role: c.role, 现描述: c.desc, 外貌: c.appearance.slice(0, 50), 势力: c.faction }));
    const res = await orJson([
      { role: 'system', content: '你是修仙小说人物撰写者。把每个角色的简介改写成 1-2 句小说风格描述：保留身份/势力/关键事实，融入画面感与气质，避免生硬罗列与套话。中文。' },
      { role: 'user', content: `改写下列角色简介，严格 JSON {"map":{"<id>":"新简介"}}：\n${JSON.stringify(payload)}` }],
      `c${bi}`);
    for (const [id, v] of Object.entries(res?.map || {})) if (v) out[id] = v;
    console.error(`  批 ${bi}: +${Object.keys(res?.map || {}).length}`);
  }
  await writeFile(join(canonDir, 'character-descriptions.json'), `${JSON.stringify(out, null, 2)}\n`);

  let n = 0;
  for (const b of books) { const d = join(gen, b, 'stages'); const bk = join(gen, b, 'stages-pre-chardesc-backup'); if (existsSync(bk)) await rm(bk, { recursive: true }); await cp(d, bk, { recursive: true });
    for (const f of (await readdir(d)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) { const m = await readJson(join(d, f)); let ch = false; for (const c of m.canon?.characters || []) if (c.id && out[c.id]) { c.description = out[c.id]; n++; ch = true; } if (ch) await writeFile(join(d, f), `${JSON.stringify(m, null, 2)}\n`); } }
  console.error(`改写 ${Object.keys(out).length} 个角色，应用 ${n} 处。备份 stages-pre-chardesc-backup。`);
}
run().catch(e => { console.error(e); process.exit(1); });
