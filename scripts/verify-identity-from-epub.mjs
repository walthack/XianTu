#!/usr/bin/env node

// 对"名字不同的合并候选"，从 epub 原文找身份证据，DeepSeek 判定是否同一人。
// 只产报告 verify-identity-report.md，不改数据。用户据此决定是否合并。
//
// Usage: node scripts/verify-identity-from-epub.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const material = '/Volumes/botsvault/06_material';
const model = process.env.XIANTU_VERIFY_MODEL || 'deepseek/deepseek-v4-flash';
const books = [
  { id: 'qingyu', epub: 'A-六朝清羽记.epub' },
  { id: 'yunlong', epub: 'B- 六朝云龙吟.epub' },
  { id: 'yange', epub: 'C-六朝燕歌行.epub' },
];

// 要验证的身份簇（名字不同，疑似同一人）。
const CLUSTERS = [
  { names: ['尹馥兰', '兰姑'], q: '尹馥兰 和 兰姑 是否同一人？' },
  { names: ['安乐公主', '李裹儿'], q: '安乐公主 和 李裹儿 是否同一人？' },
  { names: ['阮香琳', '蛇夫人', '蛇奴'], q: '阮香琳、蛇夫人、蛇奴 三者哪些是同一人？' },
  { names: ['孙暖', '湖阳君'], q: '孙暖 和 湖阳君 是否同一人？' },
];

function parseEnv(t) { return Object.fromEntries(t.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; })); }
function parseJson(t) { const f = String(t).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]; const c = f || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(c); }
async function orJson(messages, label) {
  const env = existsSync(join(root, '.env')) ? parseEnv(await readFile(join(root, '.env'), 'utf8')) : {};
  const key = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  for (let i = 1; i <= 4; i++) {
    try { const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'XianTu Verify' }, body: JSON.stringify({ model, temperature: 0, max_tokens: 1500, response_format: { type: 'json_object' }, messages }) }); const b = await r.text(); if (!r.ok) throw new Error(r.status); return parseJson(JSON.parse(b).choices?.[0]?.message?.content || ''); }
    catch (e) { console.error(`[${label}] ${i}/4 ${e.message}`); await new Promise(s => setTimeout(s, i * 1500)); }
  }
  return null;
}
function loadText(epub) { const dir = mkdtempSync(join(tmpdir(), 'xt-v-')); execFileSync('unzip', ['-o', '-q', join(material, epub), '-d', dir]); const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(dir, p)).find(p => existsSync(p)); return readdirSync(base).filter(f => /\d+\.x?html?$/i.test(f)).map(f => readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ')).join('\n'); }

async function run() {
  const lines = ['# 仙途 · 身份合并验证（DeepSeek 原文判定）', '', '> 对名字不同的疑似同人，从三本原文找证据判定。结论供用户决定是否合并。', ''];
  for (const cl of CLUSTERS) {
    lines.push(`## ${cl.q}`);
    const verdicts = [];
    for (const book of books) {
      const text = loadText(book.epub);
      const sents = text.split(/(?<=[。！？])|\n/).map(s => s.trim());
      // 取同时(或分别)提到簇内名字、且含身份/别名标记或多名共现的句子
      const hits = sents.filter(s => {
        const c = cl.names.filter(n => s.includes(n)).length;
        return c >= 2 || (c >= 1 && /本名|原名|又名|即|便是|就是|乃|化名|人称|改称|本是|原是/.test(s));
      }).slice(0, 14);
      if (!hits.length) continue;
      const out = await orJson([
        { role: 'system', content: '你依据小说原文判断若干称呼是否指同一人。只依据给定原文，给出结论与证据；不确定就说不确定。' },
        { role: 'user', content: `问题：${cl.q}\n依据下列原文（《${book.id}》），输出严格 JSON：\n{"verdict":"同一人|不同人|不确定","which":"说明哪些是同一人/各自是谁","evidence":["原文短句，最多3条"]}\n\n原文：\n${hits.join('\n')}` }],
        `${book.id}-${cl.names[0]}`);
      if (out) verdicts.push({ book: book.id, ...out });
    }
    if (!verdicts.length) lines.push('- 三本均未检索到足够证据。', '');
    else { for (const v of verdicts) { lines.push(`- 《${v.book}》：**${v.verdict}** — ${v.which || ''}`); for (const e of v.evidence || []) lines.push(`  - 证据：“${e}”`); } lines.push(''); }
    console.error(`${cl.q} → ${verdicts.map(v => v.book + ':' + v.verdict).join(', ') || '无证据'}`);
  }
  await writeFile(join(gen, 'character-canon', 'verify-identity-report.md'), `${lines.join('\n')}\n`);
  console.error('写入 verify-identity-report.md');
}
run().catch(e => { console.error(e); process.exit(1); });
