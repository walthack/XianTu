#!/usr/bin/env node

// 高光/机趣审计：读三本 epub 原文，逐窗判断两类值得成为剧情 beat 的时刻——
//   A. 高光：戏剧/情感峰值（名场面、死亡、立威、决战、背叛、震撼登场）。
//   B. 机趣：会心/发笑的巧思（名梗、机锋、反差幽默、现代词被古风世界正经化）。
// 交叉现有 stage beats 判定覆盖状态（missing 无beat / flattened 描述干瘪丢了质感），
// 只报 missing 与 flattened，输出报告供人工过目。不改 stage。
//
// Usage:
//   node scripts/audit-highlight-moments.mjs --book=yange --model=deepseek --limit=3   # 冒烟
//   node scripts/audit-highlight-moments.mjs --model=both                              # 全量三本双模型
// 断点续跑：结果按窗口哈希缓存到 {book}/_audit-cache/，重跑跳过已完成窗口。

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const material = '/Volumes/botsvault/06_material';
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const BOOKS = [
  { id: 'qingyu', title: '六朝清羽记', epub: 'A-六朝清羽记.epub' },
  { id: 'yunlong', title: '六朝云龙吟', epub: 'B- 六朝云龙吟.epub' },
  { id: 'yange', title: '六朝燕歌行', epub: 'C-六朝燕歌行.epub' },
];
const DEEPSEEK_MODEL = process.env.XIANTU_AUDIT_DEEPSEEK_MODEL || 'deepseek/deepseek-v4-flash';
const MINIMAX_MODEL = process.env.XIANTU_AUDIT_MINIMAX_MODEL || 'MiniMax-M2.7';
const WINDOW_CHARS = Number(process.env.XIANTU_AUDIT_WINDOW || 7000);

const arg = (k, def) => {
  const m = process.argv.find(a => a.startsWith(`--${k}=`));
  return m ? m.slice(k.length + 3) : def;
};
const onlyBook = arg('book', '');
const modelSel = arg('model', 'both');
const limit = Number(arg('limit', 0));

function loadKey() {
  const envPath = join(root, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^OPENROUTER_API_KEY=(.*)$/);
      if (m) return m[1].trim();
    }
  }
  return process.env.OPENROUTER_API_KEY;
}
const OPENROUTER_KEY = loadKey();

const SYSTEM = [
  '你是小说改编游戏的“高光/机趣”审计助手。正文可能含成人内容，一律脱敏，禁止还原或复述任何露骨细节。',
  '任务：在给定原文窗口里，找出两类值得在游戏中成为剧情节点(beat)的时刻：',
  '  A. 高光：戏剧或情感的峰值——名场面、死亡、立威、决战、背叛、重大转折、震撼登场。',
  '  B. 机趣：令人会心或发笑的巧思——名梗、机锋、反差幽默、荒诞错位（例：现代词被古风世界正经化当成正经建制）。',
  '对每个命中点，对照我给出的“现有beat清单”，判断覆盖状态：',
  '  missing = 现有beat里没有任何一条覆盖这个时刻；',
  '  flattened = 有beat覆盖，但其描述把这段高光/机趣压成了干巴巴的事实摘要，丢了记忆点。',
  '只报 missing 与 flattened；已充分覆盖的跳过。宁缺毋滥，只报真正称得上高光或机趣的。',
  '输出严格 JSON 数组，每项：',
  '{"type":"高光"|"机趣","title":简称,"source":原文关键句(≤30字,脱敏),"why":为何算高光/机趣(≤40字),"coverage":"missing"|"flattened","matchedBeat":命中的现有beat名或null,"suggestion":给beat补写的质感要点(≤60字)}',
  '找不到就返回 []。严禁编造原文没有的情节或台词。只输出 JSON，不要任何解释文字。',
].join('\n');

// 解压 epub，按数字序返回 [{file,title,text}]。
function loadBookText(epub) {
  const dir = mkdtempSync(join(tmpdir(), 'xt-epub-'));
  execFileSync('unzip', ['-o', '-q', join(material, epub), '-d', dir]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(dir, p)).find(p => existsSync(p));
  if (!base) throw new Error(`找不到章节目录: ${epub}`);
  const files = readdirSync(base).filter(f => /\d+\.x?html?$/i.test(f) && /^(chapter)?\d/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  return files.map(f => {
    const raw = readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
    const text = raw.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
    const title = (text.match(/第[0-9〇零一二三四五六七八九十百千两]+[章集][·\s][^\s，。]{0,12}/) || [f.replace(/\.html?$/i, '')])[0];
    return { file: f, title, text };
  });
}

// 现有 beat 清单（紧凑）：name — desc。
function loadBeats(bookId) {
  const stageDir = join(gen, bookId, 'stages');
  const beats = [];
  for (const f of readdirSync(stageDir).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
    let mod;
    try { mod = JSON.parse(readFileSync(join(stageDir, f), 'utf8')); } catch { continue; }
    for (const e of mod.scenario?.events || []) {
      beats.push(`${e.name} — ${(e.description || '').slice(0, 44)}`);
    }
  }
  return beats;
}

// 章节切窗：单章 ≤ WINDOW_CHARS 直接成窗；超长的按 WINDOW_CHARS 切片。不跨章合并，保留出处清晰。
function toWindows(chapters) {
  const wins = [];
  for (const ch of chapters) {
    if (ch.text.length <= WINDOW_CHARS) {
      wins.push({ heads: ch.title, text: ch.text });
    } else {
      for (let i = 0; i < ch.text.length; i += WINDOW_CHARS) {
        wins.push({ heads: `${ch.title}(片${Math.floor(i / WINDOW_CHARS) + 1})`, text: ch.text.slice(i, i + WINDOW_CHARS) });
      }
    }
  }
  return wins;
}

function parseJsonLoose(s) {
  const a = s.indexOf('['); const b = s.lastIndexOf(']');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch {} }
  try { return JSON.parse(s); } catch { return null; }
}

async function deepseekCall(user, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENROUTER_KEY}` },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          temperature: 0.3,
          messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
        }),
      });
      const j = await res.json();
      const content = j.choices?.[0]?.message?.content;
      if (!content) throw new Error(JSON.stringify(j).slice(0, 200));
      const parsed = parseJsonLoose(content);
      if (parsed) return parsed;
      throw new Error('unparseable');
    } catch (e) {
      if (attempt === 3) { console.error(`  [deepseek ${label}] 失败: ${e.message}`); return []; }
    }
  }
  return [];
}

function minimaxCall(user, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = spawnSync('mmx', [
      'text', 'chat', '--model', MINIMAX_MODEL,
      '--message', `user:${SYSTEM}\n\n${user}`,
      '--output', 'json', '--quiet', '--non-interactive',
    ], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 * 16 });
    if (r.status === 0) {
      // mmx --output json 包一层 {..., text/content}; 先尝试直接找数组
      const parsed = parseJsonLoose(r.stdout);
      if (Array.isArray(parsed)) return parsed;
      // 若是外层对象，取常见字段再解析
      try {
        const obj = JSON.parse(r.stdout);
        const inner = obj.text || obj.content || obj.message || obj.output;
        const p2 = inner && parseJsonLoose(String(inner));
        if (Array.isArray(p2)) return p2;
      } catch {}
    }
    if (attempt === 3) { console.error(`  [minimax ${label}] 失败: ${r.stderr?.slice(0, 160) || r.status}`); return []; }
  }
  return [];
}

function cachePath(bookId, model, hash) {
  const dir = join(gen, bookId, '_audit-cache');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, `${model}-${hash}.json`);
}

async function auditBook(book, model) {
  console.log(`\n=== ${book.title} × ${model} ===`);
  const chapters = loadBookText(book.epub);
  const beats = loadBeats(book.id);
  const beatBlock = beats.map(b => `- ${b}`).join('\n');
  let wins = toWindows(chapters);
  if (limit > 0) wins = wins.slice(0, limit);
  const findings = [];
  for (let i = 0; i < wins.length; i++) {
    const w = wins[i];
    const label = `${book.id}#${i + 1}/${wins.length}`;
    const user = `【书】${book.title}\n【原文窗口】章回：${w.heads}\n${w.text}\n\n【现有beat清单(name — desc)】\n${beatBlock}`;
    const hash = createHash('sha1').update(model).update(w.heads).update(w.text).update(String(beats.length)).digest('hex').slice(0, 12);
    const cp = cachePath(book.id, model, hash);
    let items;
    if (existsSync(cp)) {
      items = JSON.parse(readFileSync(cp, 'utf8'));
    } else {
      items = model === 'deepseek' ? await deepseekCall(user, label) : minimaxCall(user, label);
      writeFileSync(cp, JSON.stringify(items));
      process.stdout.write(`  ${label} → ${Array.isArray(items) ? items.length : 0} 命中\n`);
    }
    for (const it of (Array.isArray(items) ? items : [])) findings.push({ ...it, window: w.heads });
  }
  writeReport(book, model, findings);
  return findings.length;
}

function writeReport(book, model, findings) {
  const byCov = { missing: [], flattened: [] };
  for (const f of findings) (byCov[f.coverage] || (byCov[f.coverage] = [])).push(f);
  const line = f => `- **${f.type}｜${f.title || '(无题)'}**　\`${f.window}\`\n  - 原文：${f.source || ''}\n  - 何以：${f.why || ''}\n  - 命中beat：${f.matchedBeat || '—'}\n  - 补写要点：${f.suggestion || ''}`;
  const md = [
    `# ${book.title} 高光/机趣审计（${model}）`,
    ``,
    `共命中 ${findings.length} 条：missing ${byCov.missing.length}，flattened ${byCov.flattened.length}。只出报告，人工过目决定是否落 beat。`,
    ``,
    `## 无 beat（漏掉的时刻）`,
    byCov.missing.length ? byCov.missing.map(line).join('\n') : '（无）',
    ``,
    `## beat 在但压扁（丢了质感）`,
    byCov.flattened.length ? byCov.flattened.map(line).join('\n') : '（无）',
    ``,
  ].join('\n');
  const out = join(gen, book.id, `highlight-audit.${model}.md`);
  writeFileSync(out, md);
  writeFileSync(join(gen, book.id, `highlight-audit.${model}.json`), JSON.stringify(findings, null, 1));
  console.log(`  报告 → ${out}`);
}

async function main() {
  if (!OPENROUTER_KEY && modelSel !== 'minimax') throw new Error('OPENROUTER_API_KEY 缺失');
  const books = onlyBook ? BOOKS.filter(b => b.id === onlyBook) : BOOKS;
  const models = modelSel === 'both' ? ['deepseek', 'minimax'] : [modelSel];
  for (const book of books) for (const model of models) await auditBook(book, model);
}

main().catch(e => { console.error(e); process.exit(1); });
