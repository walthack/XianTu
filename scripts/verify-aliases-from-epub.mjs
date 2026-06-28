#!/usr/bin/env node

// 通读原文复核角色别称清单（又称/绰号/本名/役名/尊称/蔑称…），带原文出处，
// 并做跨角色「撞名」检测：同一别称被多个角色使用 = 需人工裁定（如「蛇夫人」现挂在阮香琳/蛇奴/蛇夫人三个id）。
// 产 character-canon/alias-registry-v2.json + alias-verify-review.md（含撞名告警）。不改 mod / 不改旧 registry。

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const material = '/Volumes/botsvault/06_material';
const model = process.env.XIANTU_ALIAS_MODEL || 'deepseek/deepseek-v4-flash';
const maxTokens = Number(process.env.XIANTU_ALIAS_MAX_TOKENS || 3000);
const budget = Number(process.env.XIANTU_ALIAS_PASSAGE_BUDGET || 6000);
const books = [
  { id: 'qingyu', title: '六朝清羽记', epub: 'A-六朝清羽记.epub' },
  { id: 'yunlong', title: '六朝云龙吟', epub: 'B- 六朝云龙吟.epub' },
  { id: 'yange', title: '六朝燕歌行', epub: 'C-六朝燕歌行.epub' },
];
// 别称信号词：句中出现这些 + 角色名 → 很可能在讲别称。
const ALIAS_KW = /又称|又名|人称|世称|绰号|诨号|诨名|本名|原名|真名|化名|假名|役名|小名|乳名|表字|表号|尊称|敬称|蔑称|贱称|唤作|叫作|称为|称作|被称|自称|名为|即是|便是|外号|代号|花名|道号|法号|本是|原是/;
// 已知需重点复核的撞名/混淆角色
const FOCUS = ['蛇夫人', '蛇奴', '阮香琳', '阮香凝', '尹馥兰', '兰姑', '碧姬', '碧奴', '小紫', '紫妈妈'];

function parseEnv(t) { return Object.fromEntries(t.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; })); }
function parseJson(t) { const f = String(t).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]; const c = f || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(c); }
async function ask(messages, label) {
  const env = existsSync(join(root, '.env')) ? parseEnv(await readFile(join(root, '.env'), 'utf8')) : {};
  const apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');
  for (let i = 1; i <= 4; i++) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'XianTu Alias' }, body: JSON.stringify({ model, temperature: 0, max_tokens: maxTokens, response_format: { type: 'json_object' }, messages }) });
      const b = await r.text(); if (!r.ok) throw new Error(`${r.status}: ${b.slice(0, 200)}`);
      return parseJson(JSON.parse(b).choices?.[0]?.message?.content || '');
    } catch (e) { console.error(`[${label}] ${i}/4 ${e.message}`); await new Promise(s => setTimeout(s, i * 2000)); }
  }
  throw new Error('failed');
}
function load(epub) {
  const dir = mkdtempSync(join(tmpdir(), 'xt-alias-')); execFileSync('unzip', ['-o', '-q', join(material, epub), '-d', dir]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(dir, p)).find(p => existsSync(p));
  const files = readdirSync(base).filter(f => /\d+\.x?html?$/i.test(f) && /^(chapter)?\d/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  return files.map(f => { const raw = readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' '); const text = raw.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim(); const title = (text.match(/第[0-9〇零一二三四五六七八九十百千两]+[章集][·\s][^\s，。]{0,12}/) || [f.replace(/\.html?$/i, '')])[0]; return { title, text }; });
}
const ROLE_KW = /掌教|帮主|家主|老祖|主角|女主|首领|宗主|教主|城主|庄主|公主|王|帝|将军|太尉|反派|盟友|伴侣|未婚妻|妾|侍奴|徒弟|谋士/;
async function roster(bookId) {
  const dir = join(gen, bookId, 'stages'); const cnt = new Map(), role = new Map();
  for (const f of (await readdir(dir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) { const m = JSON.parse(await readFile(join(dir, f), 'utf8')); for (const c of m.canon?.characters || []) { cnt.set(c.name, (cnt.get(c.name) || 0) + 1); if (c.role && !role.get(c.name)) role.set(c.name, c.role); } }
  const main = [...cnt.keys()].filter(n => cnt.get(n) >= 3 || ROLE_KW.test(role.get(n) || ''));
  return [...new Set([...main, ...FOCUS.filter(n => cnt.has(n))])];
}
function variants(name) { const inner = [...name.matchAll(/[（(]([^）)]+)[）)]/g)].map(m => m[1].trim()); const bare = name.replace(/[（(][^）)]*[）)]/g, '').trim(); const parts = []; for (const seg of [bare, ...inner]) parts.push(...seg.split(/[·•・]/)); return [...new Set([name, ...parts].map(s => s.trim()).filter(s => s.length >= 2))]; }
function retrieve(name, chapters) {
  const names = variants(name); const inText = s => names.some(v => s.includes(v));
  const hits = [];
  for (const ch of chapters) { if (!inText(ch.text)) continue; const sents = ch.text.split(/(?<=[。！？])|\n|※/).map(s => s.trim()).filter(s => s.length >= 4); const idx = []; sents.forEach((s, i) => { if (inText(s)) idx.push(i); }); const near = i => idx.some(j => Math.abs(j - i) <= 2); sents.forEach((s, i) => { const named = inText(s); const sig = ALIAS_KW.test(s); if (!sig) return; if (!named && !near(i)) return; hits.push({ title: ch.title, sent: s, score: (named ? 2 : 0) + 1 }); }); }
  hits.sort((a, b) => b.score - a.score); const picked = []; const seen = new Set(); let bud = budget;
  for (const h of hits) { if (seen.has(h.sent) || bud - h.sent.length < 0) continue; seen.add(h.sent); picked.push(h); bud -= h.sent.length; if (picked.length >= 40) break; }
  return { total: hits.length, picked };
}
function prompt(book, name, picked) {
  return [
    { role: 'system', content: '你是小说人物别称考据助手。仅依据给定原文句子，整理该角色的所有别称/称谓（又称、绰号、诨名、本名、原名、化名、役名、小名、尊称、蔑称等）。每条须有原文支撑，无支撑不要写。特别注意：若某别称在原文中其实指向另一个角色、或两个角色共用一个称呼，请在 notes 里明确指出（这对消歧很重要）。' },
    { role: 'user', content: `角色：${name}（《${book.title}》）。基于以下原文句子输出严格 JSON：
{"name":"${name}","aliases":[{"alias":"别称","type":"绰号|本名|役名|尊称|蔑称|化名|小名|其他","evidence":"原文短句"}],"notes":"若有别称实指他人或与其他角色共用称呼，在此说明，否则空"}

原文句子：
${picked.map(p => `〔${p.title}〕${p.sent}`).join('\n')}` },
  ];
}
async function run() {
  const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const namesArg = (process.argv.find(a => a.startsWith('--names=')) || '').replace('--names=', '');
  const explicit = namesArg ? namesArg.split(',').map(s => s.trim()).filter(Boolean) : null;
  const targets = books.filter(b => only.length === 0 || only.includes(b.id));
  await mkdir(join(gen, 'character-canon'), { recursive: true });
  const all = [];
  for (const book of targets) {
    const names = explicit || await roster(book.id);
    console.error(`[${book.id}] 角色 ${names.length}，加载原文…`);
    const chapters = load(book.epub);
    for (const name of names) {
      const { total, picked } = retrieve(name, chapters);
      if (!picked.length) { all.push({ book: book.id, name, aliases: [], notes: '' }); continue; }
      try { const out = await ask(prompt(book, name, picked), `${book.id}-${name}`); out.book = book.id; all.push(out); console.error(`  ${name}: ${(out.aliases || []).map(a => a.alias).join('、') || '无别称'}${out.notes ? ' ⚠' + out.notes.slice(0, 30) : ''}`); }
      catch (e) { all.push({ book: book.id, name, aliases: [], notes: '抽取失败' }); console.error(`  ${name}: 失败`); }
    }
  }
  // 跨角色撞名检测：alias -> [names]
  const collide = new Map();
  for (const c of all) for (const a of c.aliases || []) { const k = a.alias; if (!collide.has(k)) collide.set(k, new Set()); collide.get(k).add(c.name); }
  const conflicts = [...collide.entries()].filter(([, s]) => s.size > 1).map(([a, s]) => ({ alias: a, names: [...s] }));
  await writeFile(join(gen, 'character-canon', 'alias-registry-v2.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), characters: all, collisions: conflicts }, null, 2)}\n`);
  const L = ['# 别称复核（通读原文，带出处）', '', `> 撞名告警 ${conflicts.length} 处（同一别称多个角色用，需人工裁定）。`, ''];
  if (conflicts.length) { L.push('## ⚠️ 撞名（需裁定）'); for (const c of conflicts) L.push(`- **${c.alias}** ← ${c.names.join(' / ')}`); L.push(''); }
  L.push('## 各角色别称');
  for (const c of all) { if (!(c.aliases || []).length && !c.notes) continue; L.push(`### ${c.name}（${c.book}）`); for (const a of c.aliases || []) L.push(`- ${a.alias}〔${a.type}〕：${a.evidence || ''}`); if (c.notes) L.push(`- 📝 ${c.notes}`); L.push(''); }
  await writeFile(join(gen, 'character-canon', 'alias-verify-review.md'), `${L.join('\n')}\n`);
  console.log(`\n复核 ${all.length} 角色 → alias-registry-v2.json + alias-verify-review.md`);
  console.log(`⚠️ 撞名 ${conflicts.length}: ${conflicts.map(c => c.alias).join('、')}`);
}
run().catch(e => { console.error(e); process.exit(1); });
