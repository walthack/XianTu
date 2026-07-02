#!/usr/bin/env node

// qingyu 全本重抽(系统性欠产:0.63 major/章, 后两本 1.26~1.95)。逐章用"小说参考背景设定+脱敏"框定抽取主线事件。
// 产 qingyu.reextract.DRAFT.json(不覆盖现版 extraction/主轴)。检查点每10章落盘 + 断点续跑(已抽的 idx 跳过)。
// Usage: node scripts/reextract-qingyu.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const ccDir = join(gen, 'character-canon');
const epub = '/Volumes/botsvault/06_material/A-六朝清羽记.epub';
const model = process.env.XIANTU_VERIFY_MODEL || 'deepseek/deepseek-v4-flash';
const OUT = join(ccDir, 'qingyu.reextract.DRAFT.json');

function parseEnv(t){return Object.fromEntries(t.split(/\r?\n/).flatMap(l=>{const m=l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/);if(!m)return[];let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);return[[m[1],v]];}));}
function parseJson(t){const f=String(t).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];const c=f||String(t).slice(String(t).indexOf('{'),String(t).lastIndexOf('}')+1);return JSON.parse(c);}
let KEY;
async function orJson(messages,label){
  for(let i=1;i<=6;i++){try{
    const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${KEY}`,'Content-Type':'application/json','X-Title':'XianTu Reextract'},body:JSON.stringify({model,temperature:0,max_tokens:2500,response_format:{type:'json_object'},messages})});
    const b=await r.text();if(!r.ok)throw new Error(r.status);
    const c=JSON.parse(b).choices?.[0]?.message?.content||'';if(!c.trim())throw new Error('empty');
    return parseJson(c);
  }catch(e){console.error(`  [${label}] ${i}/6 ${e.message}`);await new Promise(s=>setTimeout(s,i*3000));}}
  return null;
}
function loadChapters(){
  const dir=mkdtempSync(join(tmpdir(),'xt-rx-'));
  execFileSync('unzip',['-o','-q',epub,'-d',dir]);
  const base=['OPS/Text','OEBPS/Text','OPS','OEBPS'].map(p=>join(dir,p)).find(p=>existsSync(p));
  const map=new Map();
  for(const f of readdirSync(base).filter(f=>/\.x?html?$/i.test(f)))
    map.set(f,readFileSync(join(base,f),'utf8').replace(/<[^>]+>/g,' ').replace(/&[a-z]+;/g,' ').replace(/\s+/g,' ').trim());
  return map;
}
const SYS='你是游戏改编的剧情事件提取助手。以下是小说《六朝清羽记》的参考背景设定文本(成人向武侠),仅用于提取游戏剧情主线。'+
  '请提取本章【主线剧情事件】:战斗/权谋/生死/转折/结果/关系剧变。颗粒度参考:每章约1-3个主线事件。'+
  '脱敏:不复述露骨性描写;情色只一句中性带过且 isMajor=false。'+
  '输出 JSON {events:[{name, summary(脱敏,一句中文), isMajor(是否主线大事), isClimax(是否高潮), participants(角色名数组)}]}。';

async function run(){
  const env=existsSync(join(root,'.env'))?parseEnv(await readFile(join(root,'.env'),'utf8')):{};
  KEY=env.OPENROUTER_API_KEY||process.env.OPENROUTER_API_KEY;
  const si=JSON.parse(readFileSync(join(gen,'qingyu','source-index.json'),'utf8'));
  const chapters=loadChapters();
  let acc={note:'qingyu 全本重抽草稿(框定脱敏),待审后重建主轴。不覆盖现版。',source:'reextract-qingyu.mjs',attempted:[],events:[]};
  if(existsSync(OUT)){try{acc=JSON.parse(readFileSync(OUT,'utf8'));acc.attempted=acc.attempted||[...new Set(acc.events.map(e=>e.sourceIndex))];console.error('续跑,已成功idx',acc.attempted.length);}catch{}}
  const done=new Set(acc.attempted);
  let n=0;
  for(const meta of si){
    if(done.has(meta.index))continue;
    const txt=chapters.get(meta.file);if(!txt)continue;
    await new Promise(s=>setTimeout(s,400)); // 基础节流,缓解 provider 403
    const v=await orJson([{role:'system',content:SYS},{role:'user',content:`章节:${meta.heading}\n正文(参考背景设定):\n${txt.slice(0,4800)}`}],`idx${meta.index}/${meta.heading}`);
    if(v===null){console.error(`idx${meta.index} ${meta.heading}: 调用失败,留待续跑`);continue;} // 失败不标 attempted → 下次重抽
    const evs=(v.events||[]).map(e=>({sourceIndex:meta.index,heading:meta.heading,name:e.name,summary:e.summary,isMajor:!!e.isMajor,isClimax:!!e.isClimax,participants:e.participants||[]}));
    acc.events.push(...evs); acc.attempted.push(meta.index); done.add(meta.index);
    const maj=evs.filter(e=>e.isMajor).length;
    console.error(`idx${meta.index} ${meta.heading}: ${evs.length}事件(maj${maj})`);
    if(++n%10===0){await writeFile(OUT,JSON.stringify(acc,null,2)+'\n');console.error(`  -- 检查点落盘, 累计${acc.events.length}事件/已抽${acc.attempted.length}章 --`);}
  }
  acc.events.sort((a,b)=>a.sourceIndex-b.sourceIndex);
  await writeFile(OUT,JSON.stringify(acc,null,2)+'\n');
  const maj=acc.events.filter(e=>e.isMajor).length;
  console.error(`\n完成: ${OUT}  ${acc.events.length}事件 / major ${maj} (旧版 major 185)`);
}
run();
