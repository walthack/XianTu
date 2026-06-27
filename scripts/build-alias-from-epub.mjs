#!/usr/bin/env node

// 别名表 Phase 2：从 epub 原文挖显式别名(本名/又名/人称/绰号/外号/号曰/表字/小字/化名/真名)。
// 对重要角色(别名骨架多名 ∪ 外貌草稿 ∪ 约束草稿)检索 alias-marker 句 → DeepSeek 抽结构化别名 →
// 合并进 character-alias-registry.json(新增 mined[]，并在找到"本名"时记 realName)。
//
// Usage: node scripts/build-alias-from-epub.mjs [book...] [--limit=N]

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const model = process.env.XIANTU_ALIAS_MODEL || 'deepseek/deepseek-v4-flash';
const material = '/Volumes/botsvault/06_material';
const books = [
  { id: 'qingyu', title: '六朝清羽记', epub: 'A-六朝清羽记.epub' },
  { id: 'yunlong', title: '六朝云龙吟', epub: 'B- 六朝云龙吟.epub' },
  { id: 'yange', title: '六朝燕歌行', epub: 'C-六朝燕歌行.epub' },
];
const MARK = /本名|原名|又名|别名|别号|人称|绰号|外号|号曰|表字|小字|化名|真名|本是|原是|乳名|诨名|江湖人称|道号|法号/;

function parseEnv(t) { return Object.fromEntries(t.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; })); }
function parseJson(t) { const f = String(t).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]; const c = f || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(c); }
async function orJson(messages, label) {
  const env = existsSync(join(root, '.env')) ? parseEnv(await readFile(join(root, '.env'), 'utf8')) : {};
  const key = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  for (let i = 1; i <= 4; i++) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'XianTu Alias' }, body: JSON.stringify({ model, temperature: 0, max_tokens: 2048, response_format: { type: 'json_object' }, messages }) });
      const b = await r.text(); if (!r.ok) throw new Error(`${r.status}`);
      return parseJson(JSON.parse(b).choices?.[0]?.message?.content || '');
    } catch (e) { console.error(`[${label}] ${i}/4 ${e.message}`); await new Promise(s => setTimeout(s, i * 1500)); }
  }
  return null;
}
function loadText(epub) {
  const dir = mkdtempSync(join(tmpdir(), 'xt-alias-'));
  execFileSync('unzip', ['-o', '-q', join(material, epub), '-d', dir]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(dir, p)).find(p => existsSync(p));
  return readdirSync(base).filter(f => /\d+\.x?html?$/i.test(f)).map(f => readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ')).join('\n');
}
function variants(name, aliases) { return [...new Set([name, ...(aliases || [])])].filter(s => s && s.length >= 2); }

async function run() {
  const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const limit = Number((process.argv.find(a => a.startsWith('--limit=')) || '').replace('--limit=', '') || 0);
  const reg = JSON.parse(await readFile(join(canonDir, 'character-alias-registry.json'), 'utf8'));
  const targets = books.filter(b => only.length === 0 || only.includes(b.id));

  // 重要角色集合：别名骨架(有 aliases/多名) ∪ 外貌 ∪ 约束
  const important = new Map(); // book -> Set(canonicalName)
  for (const b of targets) important.set(b.id, new Set());
  for (const r of reg.characters) {
    if (!(r.aliases?.length || r.multiNameAcrossStages)) continue;
    for (const bk of r.books || []) if (important.has(bk)) important.get(bk).add(r.canonicalName);
  }
  for (const b of targets) for (const suf of ['appearance-draft', 'appearance-extra', 'character-constraints-draft']) {
    const p = join(canonDir, `${b.id}.${suf}.json`); if (!existsSync(p)) continue;
    for (const c of (JSON.parse(await readFile(p, 'utf8')).characters || [])) important.get(b.id).add(c.name);
  }

  const byName = new Map(reg.characters.map(r => [r.canonicalName, r]));
  for (const book of targets) {
    let names = [...important.get(book.id)];
    if (limit) names = names.slice(0, limit);
    console.error(`[${book.id}] 候选 ${names.length}，加载原文…`);
    const text = loadText(book.epub);
    const sents = text.split(/(?<=[。！？])|\n/).map(s => s.trim());
    for (const name of names) {
      const rec = byName.get(name); if (!rec) continue;
      const vs = variants(name, rec.aliases);
      const hits = sents.filter(s => MARK.test(s) && vs.some(v => s.includes(v))).slice(0, 12);
      if (!hits.length) continue;
      const out = await orJson([
        { role: 'system', content: '你从小说原文片段中提取某角色的别名/称谓信息。只取原文明确写出的：本名、外号、绰号、人称、尊称、化名、道号等。不臆造。' },
        { role: 'user', content: `角色：${name}。从下列原文句提取其别名信息，严格 JSON：\n{"realName":"若原文点明本名则填，否则空","aliases":[{"name":"别名","type":"本名|外号|绰号|人称|尊称|化名|役名|道号"}]}\n\n原文：\n${hits.join('\n')}` },
      ], `${book.id}-${name}`);
      if (!out) continue;
      rec.mined = out;
      if (out.realName && out.realName !== name) rec.realName = out.realName;
      const add = (out.aliases || []).map(a => a.name).filter(n => n && n !== name && !(rec.aliases || []).includes(n));
      if (add.length) rec.aliases = [...new Set([...(rec.aliases || []), ...add])];
      console.error(`  ${name}: +${add.length} 别名${out.realName ? ` (本名:${out.realName})` : ''}`);
    }
  }
  await writeFile(join(canonDir, 'character-alias-registry.json'), `${JSON.stringify(reg, null, 2)}\n`);
  console.error('别名挖掘合并完成 → character-alias-registry.json');
}
run().catch(e => { console.error(e); process.exit(1); });
