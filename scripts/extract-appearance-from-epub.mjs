#!/usr/bin/env node

// 从 NAS 上的三本 epub 原文，为"缺外貌的女性角色"抽取外貌/身体特征。
// 流程：解压 epub → 按阅读序读章节(chapterN.html 文件名直连 extraction 章节出处) →
// 对每个目标角色全文检索其句子、按外貌/身体关键词加权取 top 段落 → DeepSeek 仅从这些原文段落
// 抽结构化外貌(不臆造，原文无则标"原文未明确") → 输出 character-canon/<book>.appearance-draft.json。
// 只产草稿，不改任何 mod。目标默认 = 各书 gender=女 且 appearance 缺失的角色（来自 stage 数据）。

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const material = '/Volumes/botsvault/06_material';
const model = process.env.XIANTU_APPEARANCE_MODEL || 'deepseek/deepseek-v4-flash';
const maxTokens = Number(process.env.XIANTU_APPEARANCE_MAX_TOKENS || 4096);
const perCharCharBudget = Number(process.env.XIANTU_APPEARANCE_PASSAGE_BUDGET || 5200);

const books = [
  { id: 'qingyu', title: '六朝清羽记', epub: 'A-六朝清羽记.epub' },
  { id: 'yunlong', title: '六朝云龙吟', epub: 'B- 六朝云龙吟.epub' },
  { id: 'yange', title: '六朝燕歌行', epub: 'C-六朝燕歌行.epub' },
];

const APP_KW = /胸|乳|肌肤|肤|娇|身段|身姿|胴体|脸|面[容颊孔]|眉|眼|眸|发[丝髻]|秀发|裙|衫|罗衣|妆|腰|腿|臀|玉|丰|貌|美[艳貌丽人]|容颜|颜|唇|齿|颈|肩|高挑|娇小|玲珑|婀娜|身材|衣着|气质|风姿|窈窕|苗条|丰腴/;

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
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://github.com/qianye60/XianTu', 'X-Title': 'XianTu Appearance' },
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

// 解压 epub，按 chapterN.html 数字序返回 [{file, title, text}]。
function loadBookText(epub) {
  const dir = mkdtempSync(join(tmpdir(), 'xt-epub-'));
  execFileSync('unzip', ['-o', '-q', join(material, epub), '-d', dir]);
  // 不同 epub 用 OPS/Text 或 OEBPS/Text；文件名可能是 chapterN.html 或 0001.html。
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(dir, p)).find(p => existsSync(p));
  if (!base) throw new Error(`找不到章节目录: ${epub}`);
  const textDir = base;
  const files = readdirSync(textDir).filter(f => /\d+\.x?html?$/i.test(f) && /^(chapter)?\d/.test(f))
    .sort((a, b) => (Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0])));
  return files.map(f => {
    const raw = readFileSync(join(textDir, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
    const text = raw.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
    const title = (text.match(/第[0-9〇零一二三四五六七八九十百千两]+[章集][·\s][^\s，。]{0,12}/) || [f.replace(/\.html?$/i, '')])[0];
    return { file: f, title, text };
  });
}

// 目标：某书 gender=女 的角色。--all 含全部女性；否则仅全部出场关卡均缺 appearance 的。
async function targetFemales(bookId) {
  const includeAll = process.argv.includes('--all');
  const stageDir = join(generatedRoot, bookId, 'stages');
  const UNSET = v => !v || v === '原作未载' || v === '未知' || v === '无' || v === '未载';
  const agg = new Map();
  for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
    const mod = JSON.parse(await readFile(join(stageDir, f), 'utf8'));
    for (const c of mod.canon?.characters || []) {
      const a = agg.get(c.name) || { name: c.name, gender: '', hasApp: false };
      const g = c.gender || c.profile?.gender; if (g && !a.gender) a.gender = g;
      if (!UNSET(c.profile?.appearance)) a.hasApp = true;
      agg.set(c.name, a);
    }
  }
  const wantGender = (process.argv.find(a => a.startsWith('--gender=')) || '--gender=女').split('=')[1];
  return [...agg.values()].filter(a => a.gender === wantGender && (includeAll || !a.hasApp)).map(a => a.name);
}

// 计 APP_KW 命中次数（描述密度）。
function kwCount(s) {
  let n = 0; const re = new RegExp(APP_KW, 'g'); while (re.exec(s)) n += 1; return n;
}
// 关键：外貌描写常用代词承接（她/少女/乳球…），不一定含人名。
// 所以对"含人名"或"距某次人名提及 ±窗口内且含外貌关键词"的句子都纳入，按关键词密度加权。
// 全名 + 按 ·/• 拆短名(阿姬曼·芭娜→阿姬曼/芭娜) + 拆括号别名(孙寿（襄城君）→孙寿/襄城君)。
function variantsOf(name) {
  const parts = [];
  const inner = [...name.matchAll(/[（(]([^）)]+)[）)]/g)].map(m => m[1].trim());
  const bare = name.replace(/[（(][^）)]*[）)]/g, '').trim();
  for (const seg of [bare, ...inner]) parts.push(...seg.split(/[·•・]/).map(s => s.trim()));
  return [...new Set([name, ...parts].filter(s => s && s.length >= 2))];
}
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
      const score = (named ? 1 : 0) + 3 * kc;
      if (score > 0) hits.push({ title: ch.title, sent: s, score });
    });
  }
  hits.sort((a, b) => b.score - a.score);
  const picked = [];
  const seen = new Set();
  let budget = perCharCharBudget;
  for (const h of hits) {
    if (seen.has(h.sent) || budget - h.sent.length < 0) continue;
    seen.add(h.sent); picked.push(h); budget -= h.sent.length;
    if (picked.length >= 40) break;
  }
  return { total: hits.length, picked };
}

function prompt(book, name, picked) {
  return [
    { role: 'system', content: '你是小说人物外貌整理助手。仅依据给定原文段落，提炼该角色的外貌与身体特征（面容、身材、肤色、发、衣着气质等）。只写原文明确写到或强烈暗示的，绝不臆造；原文未写则相应字段写"原文未明确"。客观中性措辞，不复述露骨性描写过程，但可保留对角色身体特征本身的客观描述。' },
    { role: 'user', content: `角色：${name}（《${book.title}》）。基于以下原文段落输出严格 JSON：
{"name":"${name}","gender":"男|女|未知","appearance":"整合成一段的外貌描述，或原文未明确","bodyFeatures":["要点，如身材/肤色/特征，最多6条"],"evidence":["支撑用的原文短句，最多4条"],"sourceChapters":["涉及章节标题"]}

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
    const names = explicitNames || await targetFemales(book.id);
    console.error(`[${book.id}] 缺外貌女性 ${names.length} 人，加载原文…`);
    const chapters = loadBookText(book.epub);
    console.error(`[${book.id}] 章节 ${chapters.length}，开始检索+抽取`);
    const results = [];
    for (const name of names) {
      const { total, picked } = retrieve(name, chapters);
      if (!picked.length) { results.push({ name, appearance: '原文未检索到该名出现', bodyFeatures: [], evidence: [], sourceChapters: [], _hits: 0 }); console.error(`  ${name}: 0 命中`); continue; }
      let out;
      try {
        out = await openRouterJson(prompt(book, name, picked), `${book.id}-${name}`);
      } catch (e) {
        console.error(`  ${name}: 抽取失败(${e.message.slice(0, 40)})，记空待重试`);
        results.push({ name, appearance: '抽取失败待重试', bodyFeatures: [], evidence: [], sourceChapters: [], _hits: total });
        continue;
      }
      out._hits = total;
      results.push(out);
      console.error(`  ${name}: ${total} 句命中 → ${out.appearance && out.appearance !== '原文未明确' ? '✓有外貌' : '原文未明确'}`);
    }
    const wantGender = (process.argv.find(a => a.startsWith('--gender=')) || '--gender=女').split('=')[1];
    const suffix = explicitNames ? 'extra' : (wantGender === '男' ? 'male-draft' : 'draft');
    const outPath = join(generatedRoot, 'character-canon', `${book.id}.appearance-${suffix}.json`);
    await writeFile(outPath, `${JSON.stringify({ book: book.id, generatedAt: new Date().toISOString(), characters: results }, null, 2)}\n`);
    console.error(`[${book.id}] 写入 ${outPath}（${results.length} 人）`);
  }
}

run().catch(err => { console.error(err); process.exit(1); });
