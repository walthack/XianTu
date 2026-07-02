#!/usr/bin/env node

// 补抽 qingyu batch-010 欠产的水战弧(源idx 176-185, 第174-182章)。
// 用"小说参考背景设定+脱敏只取主线事件"框定(已验证可绕过露骨返空)。
// 仅产草稿 qingyu.warc-recovery.DRAFT.json + .md，不动正式主轴。
// Usage: node scripts/recover-qingyu-warc.mjs

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
const RANGE = [176, 185]; // 源 idx

function parseEnv(t){return Object.fromEntries(t.split(/\r?\n/).flatMap(l=>{const m=l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/);if(!m)return[];let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);return[[m[1],v]];}));}
function parseJson(t){const f=String(t).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];const c=f||String(t).slice(String(t).indexOf('{'),String(t).lastIndexOf('}')+1);return JSON.parse(c);}
async function orJson(messages,label){
  const env=existsSync(join(root,'.env'))?parseEnv(await readFile(join(root,'.env'),'utf8')):{};
  const key=env.OPENROUTER_API_KEY||process.env.OPENROUTER_API_KEY;
  for(let i=1;i<=5;i++){try{
    const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','X-Title':'XianTu Recover'},body:JSON.stringify({model,temperature:0,max_tokens:900,response_format:{type:'json_object'},messages})});
    const b=await r.text();if(!r.ok)throw new Error(r.status);
    const c=JSON.parse(b).choices?.[0]?.message?.content||'';if(!c.trim())throw new Error('empty');
    return parseJson(c);
  }catch(e){console.error(`  [${label}] ${i}/5 ${e.message}`);await new Promise(s=>setTimeout(s,i*1500));}}
  return null;
}
function loadChapters(){
  const dir=mkdtempSync(join(tmpdir(),'xt-r-'));
  execFileSync('unzip',['-o','-q',epub,'-d',dir]);
  const base=['OPS/Text','OEBPS/Text','OPS','OEBPS'].map(p=>join(dir,p)).find(p=>existsSync(p));
  const map=new Map();
  for(const f of readdirSync(base).filter(f=>/\.x?html?$/i.test(f)))
    map.set(f,readFileSync(join(base,f),'utf8').replace(/<[^>]+>/g,' ').replace(/&[a-z]+;/g,' ').replace(/\s+/g,' ').trim());
  return map;
}

const SYS='你是游戏改编的剧情事件提取助手。以下是小说《六朝清羽记》的参考背景设定文本(成人向武侠),仅用于提取游戏剧情主线。'+
  '请提取本章的【主线剧情事件】:战斗/水战/权谋/生死/转折/结果。'+
  '脱敏:不复述露骨性描写;情色只一句中性带过且 isMajor=false。'+
  '输出 JSON {events:[{name, summary(脱敏,一句中文), isMajor(是否主线大事), isClimax(是否高潮), participants(角色名数组)}]}。';

async function run(){
  const si=JSON.parse(readFileSync(join(gen,'qingyu','source-index.json'),'utf8'));
  const chapters=loadChapters();
  const out=[];
  for(let idx=RANGE[0];idx<=RANGE[1];idx++){
    const meta=si.find(x=>x.index===idx);if(!meta){console.error('skip idx'+idx);continue;}
    const txt=chapters.get(meta.file);if(!txt){console.error('no text '+meta.file);continue;}
    const v=await orJson([{role:'system',content:SYS},{role:'user',content:`章节:${meta.heading}\n正文(参考背景设定):\n${txt.slice(0,4500)}`}],`idx${idx}/${meta.heading}`);
    const evs=(v?.events||[]).map(e=>({sourceIndex:idx,heading:meta.heading,name:e.name,summary:e.summary,isMajor:!!e.isMajor,isClimax:!!e.isClimax,participants:e.participants||[]}));
    out.push(...evs);
    console.error(`idx${idx} ${meta.heading}: ${evs.length}事件 (major ${evs.filter(e=>e.isMajor).length})`);
  }
  await writeFile(join(ccDir,'qingyu.warc-recovery.DRAFT.json'),JSON.stringify({note:'batch-010 欠产水战弧补抽草稿(idx176-185),待审后插入主轴',source:'recover-qingyu-warc.mjs',events:out},null,2)+'\n');
  const md=['# qingyu 水战弧补抽草稿 (idx176-185)','','> 待审。审过后插入 story-timeline (seq#105 idx174 与 #106 idx186 之间)。★=isMajor','',
    ...out.map(e=>`- ${e.isMajor?'★':'·'} 〔${e.heading}·#${e.sourceIndex}〕${e.name} — ${e.summary}${e.participants.length?'  ['+e.participants.join('/')+']':''}`),''].join('\n');
  await writeFile(join(ccDir,'qingyu.warc-recovery.DRAFT.md'),md);
  console.error(`\n草稿: qingyu.warc-recovery.DRAFT.{json,md}  共${out.length}事件 / major ${out.filter(e=>e.isMajor).length}`);
}
run();
