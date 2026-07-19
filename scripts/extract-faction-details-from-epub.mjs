#!/usr/bin/env node
// 势力深设定抽取:对主要组织通读原文,抽 性质/总部/头目核心/架构层级/手段机制/与主角关系/关键事件/旗下重要人物。
// 情色小说·资料整理用途,客观忠实,无据留空。产 character-canon/faction-details-v2'+suffix+'.json + .md。不改 mod。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const material = '/Volumes/botsvault/06_material';
const model = process.env.XIANTU_FAC_MODEL || 'deepseek/deepseek-v4-flash';
const maxTokens = Number(process.env.XIANTU_FAC_MAX_TOKENS || 5000);
const budget = Number(process.env.XIANTU_FAC_PASSAGE_BUDGET || 8000);
const books = [
  { id: 'qingyu', title: '六朝清羽记', epub: 'A-六朝清羽记.epub' },
  { id: 'yunlong', title: '六朝云龙吟', epub: 'B- 六朝云龙吟.epub' },
  { id: 'yange', title: '六朝燕歌行', epub: 'C-六朝燕歌行.epub' },
];
// 主要组织 + 别名(检索用)
const FACTIONS = [
  { name: '黑魔海', alias: ['黑魔海', '巫宗'] },
  { name: '十方丛林', alias: ['十方丛林'] },
  { name: '太乙真宗', alias: ['太乙真宗'] },
  { name: '星月湖', alias: ['星月湖', '八骏'] },
  { name: '光明观堂', alias: ['光明观堂'] },
  { name: '瑶池宗', alias: ['瑶池宗'] },
  { name: '大慈恩寺', alias: ['大慈恩寺', '慈恩寺'] },
  { name: '拜火教', alias: ['拜火教', '祆教', '摩尼教'] },
  { name: '鬼王峒', alias: ['鬼王峒', '鬼巫王'] },
  { name: '殇侯门', alias: ['殇侯', '盘江'] },
];
const KW = /教|宗|门|寺|帮|堂|盟|会|派|阁|峒|岛|岭|长老|掌教|教主|宗主|帮主|首领|头目|大师|高僧|圣女|圣子|长|护法|供奉|弟子|信徒|秘术|邪功|功法|献祭|鼎炉|采补|脑控|洗脑|布局|渗透|结盟|敌对|总部|老巢|巢穴|势力|架构|血脉|传承|至宝/;
function parseEnv(t){return Object.fromEntries(t.split(/\r?\n/).flatMap(l=>{const m=l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);if(!m)return[];let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);return[[m[1],v]];}));}
function parseJson(t){const f=String(t).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];const c=f||String(t).slice(String(t).indexOf('{'),String(t).lastIndexOf('}')+1);return JSON.parse(c);}
async function ask(messages,label){const env=existsSync(join(root,'.env'))?parseEnv(await readFile(join(root,'.env'),'utf8')):{};const apiKey=env.OPENROUTER_API_KEY||process.env.OPENROUTER_API_KEY;if(!apiKey)throw new Error('no key');
 for(let i=1;i<=4;i++){try{const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','X-Title':'XianTu Faction'},body:JSON.stringify({model,temperature:0,max_tokens:maxTokens,response_format:{type:'json_object'},messages})});const b=await r.text();if(!r.ok)throw new Error(r.status+':'+b.slice(0,150));return parseJson(JSON.parse(b).choices?.[0]?.message?.content||'');}catch(e){console.error('['+label+'] '+i+'/4 '+e.message);await new Promise(s=>setTimeout(s,i*2000));}}throw new Error('failed');}
function loadAll(){let txt=[];for(const bk of books){const d=mkdtempSync(join(tmpdir(),'xt-fac-'));execFileSync('unzip',['-o','-q',join(material,bk.epub),'-d',d]);const base=['OPS/Text','OEBPS/Text','OPS','OEBPS'].map(p=>join(d,p)).find(p=>existsSync(p));for(const f of readdirSync(base).filter(f=>/\d+\.x?html?$/i.test(f))){const raw=readFileSync(join(base,f),'utf8').replace(/<[^>]+>/g,' ').replace(/&[a-z]+;/g,' ');txt.push(raw.replace(/\s+/g,' '));}}return txt.join('\n').split(/(?<=[。！？])|\n/).map(s=>s.trim()).filter(s=>s.length>=6);}
function retrieve(alias,sents){const inText=s=>alias.some(a=>s.includes(a));const hits=[];for(const s of sents){if(!inText(s))continue;const kc=(s.match(KW,'g')||[]).length;hits.push({s,score:1+kc});}hits.sort((a,b)=>b.score-a.score);const picked=[];const seen=new Set();let bud=budget;for(const h of hits){if(seen.has(h.s)||bud-h.s.length<0)continue;seen.add(h.s);picked.push(h.s);bud-=h.s.length;if(picked.length>=50)break;}return {total:hits.length,picked};}
function prompt(name,picked){return [
 {role:'system',content:'你是小说势力/组织设定整理助手。原著为情色小说，仅作资料整理，客观忠实、无据留空。'},
 {role:'user',content:`组织：${name}。仅据以下原文整理，输出严格 JSON：
{"name":"${name}","性质":"门派/教派/朝廷/军队/商会/魔道等","总部":"","宗旨目标":"","头目核心":["首领/高层及其身份"],"架构层级":"组织层级/职衔体系","手段机制":["招牌手段/功法/秘术/特殊机制，如鼎炉献祭、洗脑脑控、玉姬容器等"],"旗下重要人物":["该组织成员"],"与主角关系":"与程宗扬阵营的关系与博弈","关键事件":["原文关键情节"],"evidence":["原文短句最多4"]}
原文：
${picked.map(p=>'- '+p).join('\n')}`}];}
const ONLY=(process.argv.find(a=>a.startsWith('--only='))||'').replace('--only=','');
const EXTRA={龙宸:['龙宸'],圣教:['圣教'],广源行:['广源行'],铁马堂:['铁马堂'],剑霄门:['剑霄门'],丹霞宗:['丹霞宗'],青龙寺:['青龙寺'],娑梵寺:['娑梵寺'],罗马军团:['罗马军团','罗马'],雪隼佣兵团:['雪隼']};
async function run(){
 await mkdir(join(gen,'character-canon'),{recursive:true});
 let list=FACTIONS;let suffix='';
 if(ONLY){const names=ONLY.split(',').map(s=>s.trim());list=names.map(n=>({name:n,alias:EXTRA[n]||[n]}));suffix='-additions';}
 console.error('加载三本原文…');const sents=loadAll();console.error('句子 '+sents.length+'，开始抽 '+list.length+' 个组织'+(suffix?' [追加]':''));
 const out=[];
 for(const fa of list){const {total,picked}=retrieve(fa.alias,sents);if(!picked.length){out.push({name:fa.name,_hits:0});console.error('  '+fa.name+':0');continue;}
  try{const o=await ask(prompt(fa.name,picked),fa.name);o._hits=total;out.push(o);console.error('  '+fa.name+': '+total+'句 → 头目['+(o.头目核心||[]).slice(0,3).join('、')+']');}catch(e){out.push({name:fa.name,_error:true});console.error('  '+fa.name+':失败');}}
 await writeFile(join(gen,'character-canon','faction-details-v2'+suffix+'.json'),JSON.stringify({generatedAt:new Date().toISOString(),factions:out},null,2)+'\n');
 const F=['性质','总部','宗旨目标','头目核心','架构层级','手段机制','旗下重要人物','与主角关系','关键事件'];
 const L=['# 仙途 · 势力深设定（通读原文）',''];
 for(const o of out){L.push('## '+o.name);for(const f of F){const v=o[f];const s=Array.isArray(v)?v.join('、'):(v||'');if(s)L.push('- **'+f+'**：'+s);}L.push('');}
 await writeFile(join(gen,'character-canon','faction-details-v2'+suffix+'.md'),L.join('\n')+'\n');
 console.error('写入 faction-details-v2.{json,md}');
}
run().catch(e=>{console.error(e);process.exit(1);});
