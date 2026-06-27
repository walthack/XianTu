// A3 关系弧抽取(draft)：对主轴上的"关系变化事件"候选，DeepSeek 判定关系如何变(谁对谁/前后关系+score)，
// 出处索引确定性附加(主轴锚点 + extraction 关系证据 #index；DeepSeek 不出索引)。产 relationship-arcs-draft.{json,md}，不改 mod。
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const model = process.env.XIANTU_ARC_MODEL || 'deepseek/deepseek-v4-flash';
const BATCH = Number(process.env.XIANTU_ARC_BATCH || 4);
const books = ['qingyu', 'yunlong', 'yange'];
const KW = /弑|杀死|被杀|身亡|战死|自尽|自爆|身死|遇刺|兵败身死|沦为|收为|纳为|降伏|相认|成亲|拜堂|结为|投靠|背叛|反目|叛变|倒戈|决裂|揭穿|揭露|真身|反水|卧底/;

function parseEnv(t){return Object.fromEntries(t.split(/\r?\n/).flatMap(l=>{const m=l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);if(!m)return[];let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);return[[m[1],v]];}));}
function parseJson(t){const f=String(t).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];const c=f||String(t).slice(String(t).indexOf('{'),String(t).lastIndexOf('}')+1);return JSON.parse(c);}
async function orJson(messages,label){const env=existsSync(join(root,'.env'))?parseEnv(await readFile(join(root,'.env'),'utf8')):{};const key=env.OPENROUTER_API_KEY||process.env.OPENROUTER_API_KEY;for(let i=1;i<=4;i++){try{const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','X-Title':'XianTu Arc'},body:JSON.stringify({model,temperature:0,max_tokens:6000,response_format:{type:'json_object'},messages})});const b=await r.text();if(!r.ok)throw new Error(r.status);return parseJson(JSON.parse(b).choices?.[0]?.message?.content||'');}catch(e){console.error(`[${label}] ${i}/4 ${e.message}`);await new Promise(s=>setTimeout(s,i*1500));}}return null;}
async function readJson(p){return JSON.parse(await readFile(p,'utf8'));}
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};

async function run(){
  const timeline=await readJson(join(canonDir,'story-timeline.json'));
  // 在册角色名
  const rosterNames=new Set();
  for(const b of books){const d=join(gen,b,'stages');for(const f of (await readdir(d)).filter(n=>n.endsWith('.json')&&!n.endsWith('.uncertainties.json'))){const m=await readJson(join(d,f));for(const c of m.canon?.characters||[])rosterNames.add(c.name.replace(/[（(].*/,''));}}
  // extraction 关系证据(带 sourceIndex):book -> name -> [{other,relation,evidence,idx}]
  const relIdx={};
  for(const b of books){relIdx[b]={};const ex=join(gen,b,'extraction');for(const f of (await readdir(ex)).filter(n=>/^batch-\d+\.json$/.test(n))){const d=await readJson(join(ex,f));for(const c of d.characterStates||[]){if(!c.name)continue;for(const r of c.relationships||[]){if(!r.evidence&&!r.relation)continue;(relIdx[b][c.name]=relIdx[b][c.name]||[]).push({other:r.other,relation:r.relation,evidence:r.evidence||'',idx:c.firstSeenSourceIndex});}}}}
  // 候选
  const cands=[];
  for(const n of timeline.nodes){if(!KW.test(n.beat))continue;const who=[...rosterNames].filter(name=>name.length>=2&&n.beat.includes(name));if(who.length)cands.push({seq:n.seq,book:n.book,idx:n.idx,anchor:n.anchor,beat:n.beat,who});}
  console.error(`关系变化候选 ${cands.length}，分 ${Math.ceil(cands.length/BATCH)} 批…`);

  const arcs=[];let bi=0;
  for(const grp of chunk(cands,BATCH)){
    bi++;
    const payload=grp.map(c=>{
      const ev={};for(const name of [...c.who,'程宗扬'])for(const r of (relIdx[c.book][name]||[]))if(c.who.includes(r.other)||r.other==='程宗扬'||c.who.includes(name)){(ev[name]=ev[name]||[]).push(`${r.other}[${r.relation}]${r.evidence?('·'+r.evidence.slice(0,30)):''}(#${r.idx})`);}
      return {seq:c.seq,事件:c.beat,涉及角色:c.who,关系证据:Object.fromEntries(Object.entries(ev).map(([k,v])=>[k,[...new Set(v)].slice(0,6)]))};
    });
    const out=await orJson([
      {role:'system',content:'你判断小说事件如何改变角色间关系。对每个事件，指出哪一对(或几对)角色的关系在此事件前后发生变化，给出变化前/后的关系措辞与好感分(-100~100)。只依据给定事件与关系证据，不臆造；不要输出任何索引数字(出处由系统另附)。'},
      {role:'user',content:`为每个事件输出严格 JSON：\n{"arcs":[{"seq":<事件seq>,"pairs":[{"a":"角色","b":"角色","before":{"relation":"","score":0},"after":{"relation":"","score":0},"change":"一句话变化说明"}]}]}\n\n事件：\n${JSON.stringify(payload)}`}],
      `b${bi}`);
    for(const a of out?.arcs||[]){const c=cands.find(x=>x.seq===a.seq);if(!c)continue;
      arcs.push({seq:c.seq,book:c.book,出处:c.anchor,事件:c.beat,pairs:a.pairs||[]});}
    console.error(`  批 ${bi}: +${(out?.arcs||[]).length}`);
  }

  await writeFile(join(canonDir,'relationship-arcs-draft.json'),`${JSON.stringify({generatedAt:new Date().toISOString(),total:arcs.length,arcs},null,2)}\n`);
  const lines=['# 仙途 · 关系弧草稿(待审)','',`> ${arcs.length} 条。每条:触发事件(出处=主轴锚点)+ 关系变化前后。审过后按"关卡快照"落地。`,''];
  for(const a of arcs.sort((x,y)=>x.seq-y.seq)){lines.push(`### #${a.seq}〔${a.出处}〕`);lines.push(`- 事件：${a.事件.slice(0,60)}`);for(const p of a.pairs||[])lines.push(`- **${p.a} ↔ ${p.b}**：${p.before?.relation||'?'}(${p.before?.score??'?'}) → ${p.after?.relation||'?'}(${p.after?.score??'?'})　—— ${p.change||''}`);lines.push('');}
  await writeFile(join(canonDir,'relationship-arcs-draft.md'),`${lines.join('\n')}\n`);
  console.error(`写入 relationship-arcs-draft.{json,md}：${arcs.length} 条`);
}
run().catch(e=>{console.error(e);process.exit(1);});
