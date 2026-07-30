#!/usr/bin/env node

// 第 2 步：为「没有官方插图」的角色补抽**可画维度**（发型/服装/配饰/配色），供立绘生成。
//
// 与 extract-appearance-from-epub.mjs 的关键区别（后者的产物身体维度全、可画维度缺，见裁定 #142 前的审计）：
//   1) 检索权重重做：服饰/发型/配饰/颜色 = 高权，面容/眼 = 中权，体型 = 低权，
//      纯身体性征 = 零权。旧脚本的关键词表里身体词 21 个、服饰词只有 5 个，
//      且 3×kwCount 的加权把情色段落顶进 top40，模型看不到穿着句自然写不出穿着。
//   2) 输出 schema 与 portrait-visual-appearance.json（官图反向回填产物）同构，两批可直接合并。
//   3) 原文确实没写的角色标记跳过、不臆造（用户裁定：先不补设计稿）。
//
// 用法：node scripts/extract-portrait-visual-from-epub.mjs [--limit=N] [--names=A,B] [--book=qingyu]
// 默认读 character-canon/portrait-visual-targets.json 的 todo 名单，断点续跑（已有结果不重抽）。

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const canonDir = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon');
const material = '/Volumes/botsvault/06_material';
const model = process.env.XIANTU_VISUAL_MODEL || 'deepseek/deepseek-v4-flash';
const maxTokens = Number(process.env.XIANTU_VISUAL_MAX_TOKENS || 2048);
const passageBudget = Number(process.env.XIANTU_VISUAL_PASSAGE_BUDGET || 6000);
const outPath = join(canonDir, 'portrait-visual-from-source.json');

const books = {
  qingyu: { title: '六朝清羽记', epub: 'A-六朝清羽记.epub' },
  yunlong: { title: '六朝云龙吟', epub: 'B- 六朝云龙吟.epub' },
  yange: { title: '六朝燕歌行', epub: 'C-六朝燕歌行.epub' },
};

// 分层权重：可画维度优先。旧脚本的问题就是这张表里服饰词太少、身体词太多。
const WEIGHTED = [
  // 服装形制（最高权：这是立绘缺得最狠的维度）
  [6, /袍|衫|裙|襦|裳|甲|铠|靴|履|屐|袜|裤|绔|褂|氅|披风|斗篷|罩|轻绡|纱衣|锦衣|布衣|僧衣|道袍|戎装|铁衣|皮甲/],
  // 配饰/头面/随身
  [5, /冠|帽|巾|盔|簪|钗|步摇|璎珞|项圈|耳[坠环]|镯|臂钏|指环|玉佩|腰带|革带|绦|绶|印绶|面具|眼罩|铃|流苏|羽饰/],
  // 发型发色
  [5, /[乌青银白金赤褐灰栗紫朱墨]发|发[丝髻辫绺]|长发|短发|秀发|鬓|髻|辫|披散|束发|马尾/],
  // 颜色（配色是立绘的骨架）
  [4, /大红|朱红|绛|赤|殷红|青色|靛|碧|翠|黛|藏蓝|湛蓝|月白|素白|雪白|鸦青|玄色|漆黑|明黄|杏|绯|绿|紫|银|金/],
  // 面容/眼（中权）
  [3, /眉|眼|眸|瞳|脸|面[容颊孔]|唇|须|髯|胡|鼻|额|颔|颏|疤|痣|刺青|纹身|胎记/],
  // 体型/气质（低权，已有数据）
  [1, /身材|身量|高挑|娇小|魁梧|健硕|瘦削|佝偻|个头|身高|气质|风姿|威严|清冷/],
  // 纯身体性征：零权（不加分。含服饰词的句子仍可入选，避免漏掉「衣襟半开」这类）
  [0, /乳|胸脯|臀|胴体|玉体|下体|私处/],
];

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
async function ask(messages, label) {
  const envPath = join(root, '.env');
  const env = existsSync(envPath) ? parseEnv(await readFile(envPath, 'utf8')) : {};
  const apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing');
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.2 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text) throw new Error('empty completion');
      return parseJson(text);
    } catch (err) {
      lastError = err;
      if (attempt < 4) await new Promise(r => setTimeout(r, attempt * 1500));
    }
  }
  throw new Error(`${label}: ${lastError?.message || 'unknown'}`);
}

function loadBookText(epub) {
  const dir = mkdtempSync(join(tmpdir(), 'xt-visual-'));
  execFileSync('unzip', ['-qq', '-o', join(material, epub), '-d', dir]);
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
  const files = walk(dir).filter(f => /\.x?html?$/i.test(f)).sort((a, b) => {
    const na = Number(a.match(/(\d+)\.x?html?$/i)?.[1] ?? 0);
    const nb = Number(b.match(/(\d+)\.x?html?$/i)?.[1] ?? 0);
    return na - nb || a.localeCompare(b);
  });
  return files.map(f => {
    const raw = readFileSync(f, 'utf8');
    const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()
      || f.split('/').pop().replace(/\.x?html?$/i, '');
    const text = raw.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ');
    return { title, text };
  });
}

function scoreOf(s) {
  let n = 0;
  for (const [w, re] of WEIGHTED) {
    if (!w) continue;
    const g = new RegExp(re.source, 'g');
    while (g.exec(s)) n += w;
  }
  return n;
}
function variantsOf(name) {
  const parts = [];
  const inner = [...name.matchAll(/[（(]([^）)]+)[）)]/g)].map(m => m[1].trim());
  const bare = name.replace(/[（(][^）)]*[）)]/g, '').trim();
  for (const seg of [bare, ...inner]) parts.push(...seg.split(/[·•・]/).map(s => s.trim()));
  return [...new Set([name, ...parts].filter(s => s && s.length >= 2))];
}
function retrieve(name, chapters) {
  const WINDOW = 2; // 比旧脚本收紧：可画维度多与人名同句或紧邻
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
      const sc = scoreOf(s);
      if (sc === 0) return;
      const named = inText(s);
      if (!named && !nearName(i)) return;
      hits.push({ title: ch.title, sent: s, score: sc + (named ? 4 : 0) });
    });
  }
  hits.sort((a, b) => b.score - a.score);
  const picked = [];
  const seen = new Set();
  let budget = passageBudget;
  for (const h of hits) {
    if (seen.has(h.sent) || budget - h.sent.length < 0) continue;
    seen.add(h.sent); picked.push(h); budget -= h.sent.length;
    if (picked.length >= 45) break;
  }
  return { total: hits.length, picked };
}

function prompt(bookTitle, name, picked) {
  return [
    { role: 'system', content: [
      '你为小说角色整理**可用于绘制立绘**的外观信息。只依据给定原文段落，绝不臆造。',
      '重点是画师需要的东西：头发（长短/发式/发色）、眼睛、面容特征、**穿什么**（形制、材质、纹样）、',
      '配饰头面、**配色**、随身器物、身上的标记（刺青/疤/胎记）。',
      '身材只写档位（如高挑/娇小/魁梧），**不写性征细节**。',
      '某一维度原文没写就填空字符串，不要编，也不要写"原文未明确"以外的猜测。',
      '',
      '**outfit 与 accessories 的硬约束**：只写衣物与饰物本身（形制、材质、颜色、纹样、佩戴位置）。',
      '原文段落可能取自情色场景——一律不写裸露状态、脱衣过程、身体部位，也不收性征饰物（如乳环、乳钉、私处饰品）。',
      '若某角色的原文只有脱衣/裸露而没有衣物形制，outfit 就留空，不要写"赤裸"或"无衣物"。',
      '衣物在场景中破损或半褪时，只记它完整时的形制（例：「珠裙被扯脱大半」→ 记「珍珠舞衣」）。',
    ].join('') },
    { role: 'user', content: `角色：${name}（《${bookTitle}》）。只依据下列原文段落，输出严格 JSON：
{"name":"${name}","visual":{"hair":"","eyes":"","face":"","outfit":"","accessories":"","palette":["主色，最多5个"],"build":"","poseProps":"随身器物/常见姿态"},"evidence":["支撑穿着或发型的原文短句，最多4条"],"sourceChapters":["涉及章节标题"],"coverage":"full|partial|none"}

coverage 判定：outfit 与 hair 都有内容=full；只有其一或只有面容=partial；几乎无可画信息=none。

原文段落：
${picked.map(p => `〔${p.title}〕${p.sent}`).join('\n')}` },
  ];
}

async function run() {
  const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || '';
  const limit = Number(arg('limit') || 0);
  const onlyBook = arg('book');
  const explicit = arg('names') ? arg('names').split(',').map(s => s.trim()).filter(Boolean) : null;

  const targets = JSON.parse(await readFile(join(canonDir, 'portrait-visual-targets.json'), 'utf8'));
  let todo = targets.todo;
  if (onlyBook) todo = todo.filter(t => t.book === onlyBook);
  if (explicit) todo = explicit.map(n => todo.find(t => t.name === n) || { name: n, book: onlyBook || 'qingyu' });

  // 断点续跑
  const prev = existsSync(outPath) ? JSON.parse(await readFile(outPath, 'utf8')) : { characters: [] };
  const done = new Map(prev.characters.map(c => [c.name, c]));
  todo = todo.filter(t => !done.has(t.name));
  if (limit) todo = todo.slice(0, limit);
  console.error(`待抽 ${todo.length} 人（已完成 ${done.size}）`);

  const byBook = new Map();
  for (const t of todo) {
    if (!byBook.has(t.book)) byBook.set(t.book, []);
    byBook.get(t.book).push(t);
  }
  for (const [bookId, list] of byBook) {
    const book = books[bookId];
    console.error(`[${bookId}] ${list.length} 人，加载原文…`);
    const chapters = loadBookText(book.epub);
    for (const t of list) {
      const { total, picked } = retrieve(t.name, chapters);
      if (!picked.length) {
        done.set(t.name, { name: t.name, book: bookId, coverage: 'none', visual: null, note: '检索无可画维度命中' });
        console.error(`  ${t.name}: 0 命中 → 跳过`);
        continue;
      }
      try {
        const out = await ask(prompt(book.title, t.name, picked), `${bookId}-${t.name}`);
        out.book = bookId;
        out.provenance = 'source-text';
        out._hits = total;
        done.set(t.name, out);
        const v = out.visual || {};
        console.error(`  ${t.name}: ${total} 命中 → ${out.coverage} | 发:${v.hair ? '✓' : '✗'} 衣:${v.outfit ? '✓' : '✗'} 饰:${v.accessories ? '✓' : '✗'}`);
      } catch (e) {
        console.error(`  ${t.name}: 失败 ${e.message.slice(0, 60)}`);
      }
      // 每人写一次盘，断点安全
      await mkdir(canonDir, { recursive: true });
      await writeFile(outPath, `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        source: 'EPUB 原文（可画维度专用检索权重）',
        model,
        note: '与 portrait-visual-appearance.json（官图回填）同构，可合并；coverage=none 的角色按用户裁定标记跳过、不补设计稿',
        characters: [...done.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh')),
      }, null, 1)}\n`);
    }
  }
  const all = [...done.values()];
  const cnt = k => all.filter(c => c.coverage === k).length;
  console.error(`\n完成 ${all.length} 人：full ${cnt('full')} / partial ${cnt('partial')} / none ${cnt('none')}`);
  console.error(`→ ${outPath}`);
}

run().catch(err => { console.error(err); process.exit(1); });
