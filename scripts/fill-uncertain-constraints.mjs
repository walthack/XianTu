#!/usr/bin/env node

// 填 audit 标的 6 条"后果未知"约束(需原文)。DeepSeek 框定(小说参考设定+只输出脱敏机制)读 sources 章节填 consequence。
// 备份 .pre-fillunc。Usage: node scripts/fill-uncertain-constraints.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const ccDir = join(gen, 'character-canon');
const material = '/Volumes/botsvault/06_material';
const model = process.env.XIANTU_VERIFY_MODEL || 'deepseek/deepseek-v4-flash';
const EPUB = { qingyu: 'A-六朝清羽记.epub', yunlong: 'B- 六朝云龙吟.epub', yange: 'C-六朝燕歌行.epub' };
// 目标: {book, name}
const TARGETS = [
  { book: 'qingyu', name: '碧奴' },
  { book: 'yunlong', name: '林娘子' }, { book: 'yunlong', name: '虞紫薇' },
  { book: 'yunlong', name: '白仙儿' }, { book: 'yunlong', name: '襄城君' }, { book: 'yunlong', name: '孙寿' },
];

function parseEnv(t){return Object.fromEntries(t.split(/\r?\n/).flatMap(l=>{const m=l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/);if(!m)return[];let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);return[[m[1],v]];}));}
function parseJson(t){const f=String(t).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];const c=f||String(t).slice(String(t).indexOf('{'),String(t).lastIndexOf('}')+1);return JSON.parse(c);}
let KEY;
async function orJson(messages,label){for(let i=1;i<=5;i++){try{const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,temperature:0,max_tokens:500,response_format:{type:'json_object'},messages})});const b=await r.text();if(!r.ok)throw new Error(r.status);const c=JSON.parse(b).choices?.[0]?.message?.content||'';if(!c.trim())throw new Error('empty');return parseJson(c);}catch(e){console.error(`  [${label}] ${i}/5 ${e.message}`);await new Promise(s=>setTimeout(s,i*2000));}}return null;}
function loadChapters(epub){const dir=mkdtempSync(join(tmpdir(),'xt-u-'));execFileSync('unzip',['-o','-q',join(material,epub),'-d',dir]);const base=['OPS/Text','OEBPS/Text','OPS','OEBPS'].map(p=>join(dir,p)).find(p=>existsSync(p));const map=new Map();for(const f of readdirSync(base).filter(f=>/\.x?html?$/i.test(f)))map.set(f,readFileSync(join(base,f),'utf8').replace(/<[^>]+>/g,' ').replace(/&[a-z]+;/g,' ').replace(/\s+/g,' ').trim());return map;}
function win(t,name,span=350,max=3){const o=[];let from=0,n=0;while(n<max){const i=t.indexOf(name,from);if(i<0)break;o.push(t.slice(Math.max(0,i-span),i+span));from=i+span;n++;}if(!o.length)o.push(t.slice(0,1400));return o;}

const SYS='你是游戏设定提取助手。以下是小说(成人向武侠)参考背景设定,仅用于提取游戏机制。给定一条角色"约束规则",从原文片段提取其【后果/机制】:违反或触发该规则会怎样(功法/体质/控制/关系层面)。勿复述露骨细节,中性临床。输出JSON {consequence(一句中文,脱敏)}。';

async function run(){
  const env=existsSync(join(root,'.env'))?parseEnv(await readFile(join(root,'.env'),'utf8')):{};KEY=env.OPENROUTER_API_KEY;
  const chaptersCache={};
  const byBook={};for(const t of TARGETS)(byBook[t.book]=byBook[t.book]||[]).push(t.name);
  for(const [book,names] of Object.entries(byBook)){
    const f=join(ccDir,`${book}.character-constraints-draft.json`);
    if(!existsSync(f+'.pre-fillunc'))copyFileSync(f,f+'.pre-fillunc');
    const data=JSON.parse(await readFile(f,'utf8'));
    chaptersCache[book]=chaptersCache[book]||loadChapters(EPUB[book]);
    for(const ch of data.characters){if(!names.includes(ch.name))continue;
      for(const c of ch.constraints){if(c.consequence&&c.consequence!=='未知')continue;
        const frags=[];for(const s of c.sources||[]){const txt=s.file&&chaptersCache[book].get(s.file);if(txt)frags.push(`〔${s.heading}〕`+win(txt,ch.name).join(' … '));}
        const v=frags.length?await orJson([{role:'system',content:SYS},{role:'user',content:`角色:${ch.name}\n规则:${c.rule}\n原文片段:\n${frags.join('\n')}`}],`${book}/${ch.name}`):null;
        if(v?.consequence){c.consequence=v.consequence;c.consequenceProvenance='deepseek-from-epub';console.error(`✅ ${book}/${ch.name}: ${v.consequence.slice(0,50)}`);}
        else console.error(`⚠ ${book}/${ch.name}: 未得`);
      }
    }
    await writeFile(f,JSON.stringify(data,null,2)+'\n');
  }
}
run();
