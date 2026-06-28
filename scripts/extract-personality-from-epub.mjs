#!/usr/bin/env node

// 从 NAS 三本 epub 原文，为"主要角色"抽取性格特征（忠实原文，带出处）。
// 动机：之前 character-descriptions.json 那批小说化 blurb 会把人设带偏（如乐明珠被写成腹黑，
// 实为没心机的笨蛋丫头）。故 personality 不从 blurb 反推，改从原文角色言行/他人评价/叙述描写抽取。
// 流程：解压 epub → 读章节 → 对每个角色检索其姓名附近的性格线索句（含人名或距人名±窗口且含性格关键词）
// → DeepSeek 仅据原文段落抽 {personality[3-5], summary, evidence, sourceChapters}，原文不足则标注。
// 只产草稿 character-canon/<book>.personality-draft.json，不改任何 mod。
// 目标默认 = 主要角色(出场≥3关 或 role 命中关键词)；--names=A,B 显式指定；位置参数限定书。

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const material = '/Volumes/botsvault/06_material';
const model = process.env.XIANTU_PERSONALITY_MODEL || 'deepseek/deepseek-v4-flash';
const maxTokens = Number(process.env.XIANTU_PERSONALITY_MAX_TOKENS || 4096);
const perCharCharBudget = Number(process.env.XIANTU_PERSONALITY_PASSAGE_BUDGET || 6000);

const books = [
  { id: 'qingyu', title: '六朝清羽记', epub: 'A-六朝清羽记.epub' },
  { id: 'yunlong', title: '六朝云龙吟', epub: 'B- 六朝云龙吟.epub' },
  { id: 'yange', title: '六朝燕歌行', epub: 'C-六朝燕歌行.epub' },
];

// 性格线索关键词：性情形容、他人评价、行为倾向。命中=该句更可能含性格信息。
const PERS_KW = /性[格子情]|脾[气性]|为人|秉性|品性|天真|单纯|烂漫|纯真|憨|傻|笨|蠢|呆|狡[猾黠诈]|阴[狠险沉毒]|腹黑|心机|城府|工于心计|温[和柔婉]|和善|善良|心善|暴[躁怒]|火爆|刚烈|泼辣|胆[小怯大]|怯懦|懦弱|果[决断敢]|坚毅|刚毅|冷[漠静酷傲淡]|高傲|孤傲|骄横|跋扈|傲慢|傲娇|爽[朗快]|豪[爽迈]|开朗|活泼|羞[涩怯赧]|内向|沉默|寡言|多疑|猜忌|忠[诚心义]|义气|重情|深情|无情|薄情|贪[婪财色]|奸[诈猾邪]|憨厚|老实|敦厚|精明|聪[慧明颖]|机灵|愚钝|懒|勤勉|谨慎|稳重|沉稳|鲁莽|莽撞|冲动|霸道|强势|柔弱|娇憨|乖巧|调皮|顽皮|促狭|狠辣|残忍|善妒|嫉妒|怕事|胆怯|心狠|心软|执拗|倔强|隐忍|洒脱|不羁|轻浮|风流|正直|刚正|圆滑|世故/;

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) return [];
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return [[m[1], v]];
  }));
}
function parseJson(text) {
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || String(text).slice(String(text).indexOf('{'), String(text).lastIndexOf('}') + 1);
  return JSON.parse(candidate);
}
async function openRouterJson(messages, label) {
  const envPath = join(root, '.env');
  const env = existsSync(envPath) ? parseEnv(await readFile(envPath, 'utf8')) : {};
  const apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing');
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://github.com/qianye60/XianTu', 'X-Title': 'XianTu Personality' },
        body: JSON.stringify({ model, temperature: 0, max_tokens: maxTokens, response_format: { type: 'json_object' }, messages }),
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 600)}`);
      return parseJson(JSON.parse(body).choices?.[0]?.message?.content || '');
    } catch (error) {
      lastError = error;
      console.error(`[${label}] attempt ${attempt}/4 failed: ${error.message}`);
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  throw lastError;
}

function loadBookText(epub) {
  const dir = mkdtempSync(join(tmpdir(), 'xt-epub-'));
  execFileSync('unzip', ['-o', '-q', join(material, epub), '-d', dir]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(dir, p)).find(p => existsSync(p));
  if (!base) throw new Error(`找不到章节目录: ${epub}`);
  const files = readdirSync(base).filter(f => /\d+\.x?html?$/i.test(f) && /^(chapter)?\d/.test(f))
    .sort((a, b) => (Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0])));
  return files.map(f => {
    const raw = readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
    const text = raw.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
    const title = (text.match(/第[0-9〇零一二三四五六七八九十百千两]+[章集][·\s][^\s，。]{0,12}/) || [f.replace(/\.html?$/i, '')])[0];
    return { file: f, title, text };
  });
}

// 主要角色 = 出场≥3关 或 role 命中。返回 [{name, gender}]。
const ROLE_KW = /掌教|帮主|家主|老祖|主角|女主|首领|宗主|教主|城主|庄主|公主|王|帝|将军|太尉|反派|盟友|伴侣|未婚妻|妾|侍奴|徒弟|谋士/;
async function mainCharacters(bookId) {
  const stageDir = join(generatedRoot, bookId, 'stages');
  const cnt = new Map(); const role = new Map(); const gender = new Map();
  for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
    const mod = JSON.parse(await readFile(join(stageDir, f), 'utf8'));
    for (const c of mod.canon?.characters || []) {
      cnt.set(c.name, (cnt.get(c.name) || 0) + 1);
      if (c.role && !role.get(c.name)) role.set(c.name, c.role);
      const g = c.gender || c.profile?.gender; if (g && !gender.get(c.name)) gender.set(c.name, g);
    }
  }
  return [...cnt.keys()].filter(n => cnt.get(n) >= 3 || ROLE_KW.test(role.get(n) || ''))
    .map(n => ({ name: n, gender: gender.get(n) || '' }));
}

function kwCount(s) { let n = 0; const re = new RegExp(PERS_KW, 'g'); while (re.exec(s)) n += 1; return n; }
function variantsOf(name) {
  const parts = [];
  const inner = [...name.matchAll(/[（(]([^）)]+)[）)]/g)].map(m => m[1].trim());
  const bare = name.replace(/[（(][^）)]*[）)]/g, '').trim();
  for (const seg of [bare, ...inner]) parts.push(...seg.split(/[·•・]/).map(s => s.trim()));
  return [...new Set([name, ...parts].filter(s => s && s.length >= 2))];
}
// 性格线索靠言行/评价，常以代词或对话承接。纳入：含人名的句；或距人名±窗口且含性格关键词的句；
// 含人名且带对话引号的句也加权（对白最能体现性格）。
function retrieve(name, chapters) {
  const WINDOW = 3;
  const names = variantsOf(name);
  const inText = s => names.some(v => s.includes(v));
  const hits = [];
  for (const ch of chapters) {
    if (!inText(ch.text)) continue;
    const sents = ch.text.split(/(?<=[。！？])|\n|※/).map(s => s.trim()).filter(s => s.length >= 4);
    const nameIdx = [];
    sents.forEach((s, i) => { if (inText(s)) nameIdx.push(i); });
    const nearName = i => nameIdx.some(j => Math.abs(j - i) <= WINDOW);
    sents.forEach((s, i) => {
      const kc = kwCount(s);
      const named = inText(s);
      if (!named && !(kc > 0 && nearName(i))) return;
      const quote = /["“”「」]/.test(s) ? 1 : 0;
      const score = (named ? 1 : 0) + 3 * kc + (named ? quote : 0);
      if (score > 0) hits.push({ title: ch.title, sent: s, score });
    });
  }
  hits.sort((a, b) => b.score - a.score);
  const picked = []; const seen = new Set(); let budget = perCharCharBudget;
  for (const h of hits) {
    if (seen.has(h.sent) || budget - h.sent.length < 0) continue;
    seen.add(h.sent); picked.push(h); budget -= h.sent.length;
    if (picked.length >= 45) break;
  }
  return { total: hits.length, picked };
}

function prompt(book, name, picked) {
  return [
    { role: 'system', content: '你是小说人物性格整理助手。仅依据给定原文段落（角色的言行、对白、他人评价、叙述者描写），提炼该角色的核心性格特征。严格忠实原文：只写原文明确表现或他人明确评价的性格，绝不臆造、不脑补、不被刻板印象带偏；若原文线索不足以判断性格，personality 用空数组、summary 写"原文性格线索不足"。措辞用客观的性格形容词/短语，不要复述剧情情节。' },
    { role: 'user', content: `角色：${name}（《${book.title}》）。基于以下原文段落输出严格 JSON：
{"name":"${name}","gender":"男|女|未知","personality":["3-5条性格特征短语，如'天真单纯''心直口快''重情重义'，须有原文支撑"],"summary":"一句话忠实性格概括（可用于角色简介，不夸张不戏剧化）","evidence":["支撑性格判断的原文短句，最多4条"],"sourceChapters":["涉及章节标题"]}

原文段落：
${picked.map(p => `〔${p.title}〕${p.sent}`).join('\n')}` },
  ];
}

async function run() {
  const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const namesArg = (process.argv.find(a => a.startsWith('--names=')) || '').replace('--names=', '');
  const explicitNames = namesArg ? namesArg.split(',').map(s => s.trim()).filter(Boolean) : null;
  const targets = books.filter(b => only.length === 0 || only.includes(b.id));
  await mkdir(join(generatedRoot, 'character-canon'), { recursive: true });
  for (const book of targets) {
    const roster = explicitNames ? explicitNames.map(n => ({ name: n, gender: '' })) : await mainCharacters(book.id);
    console.error(`[${book.id}] 主要角色 ${roster.length} 人，加载原文…`);
    const chapters = loadBookText(book.epub);
    console.error(`[${book.id}] 章节 ${chapters.length}，开始检索+抽取`);
    const results = [];
    for (const { name } of roster) {
      const { total, picked } = retrieve(name, chapters);
      if (!picked.length) { results.push({ name, personality: [], summary: '原文未检索到该名出现', evidence: [], sourceChapters: [], _hits: 0 }); console.error(`  ${name}: 0 命中`); continue; }
      let out;
      try {
        out = await openRouterJson(prompt(book, name, picked), `${book.id}-${name}`);
      } catch (e) {
        console.error(`  ${name}: 抽取失败(${e.message.slice(0, 40)})，记空待重试`);
        results.push({ name, personality: [], summary: '抽取失败待重试', evidence: [], sourceChapters: [], _hits: total });
        continue;
      }
      out._hits = total;
      results.push(out);
      console.error(`  ${name}: ${total} 句命中 → ${(out.personality || []).join('、') || out.summary}`);
    }
    const outPath = join(generatedRoot, 'character-canon', `${book.id}.personality-draft.json`);
    await writeFile(outPath, `${JSON.stringify({ book: book.id, generatedAt: new Date().toISOString(), characters: results }, null, 2)}\n`);
    console.error(`[${book.id}] 写入 ${outPath}（${results.length} 人）`);
  }
}

run().catch(err => { console.error(err); process.exit(1); });
