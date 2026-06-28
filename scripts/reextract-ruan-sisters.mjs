#!/usr/bin/env node

// 针对 D2 撞名遗留：阮香琳 / 阮香凝 在跨本里被弄混（谁嫉妒说法相反）。
// 这里对两本各做一次「消歧」抽取：把两姐妹同时点名给模型，要求只归因明确点名某一位的句子，
// 模糊/无法判定的单独列出，绝不互相串。产 character-canon/ruan-sisters-disambig.json + .md 供人审。

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const canon = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'character-canon');
const material = '/Volumes/botsvault/06_material';
const model = process.env.XIANTU_PERSONALITY_MODEL || 'deepseek/deepseek-v4-flash';
const sisters = ['阮香琳', '阮香凝'];
const books = [{ id: 'yunlong', title: '六朝云龙吟', epub: 'B- 六朝云龙吟.epub' }, { id: 'yange', title: '六朝燕歌行', epub: 'C-六朝燕歌行.epub' }];

function parseEnv(t) { return Object.fromEntries(t.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; })); }
function parseJson(t) { const f = String(t).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]; const c = f || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(c); }
async function ask(messages, label) {
  const env = existsSync(join(root, '.env')) ? parseEnv(await readFile(join(root, '.env'), 'utf8')) : {};
  const apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');
  for (let i = 1; i <= 4; i++) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'XianTu Ruan' }, body: JSON.stringify({ model, temperature: 0, max_tokens: 4096, response_format: { type: 'json_object' }, messages }) });
      const b = await r.text(); if (!r.ok) throw new Error(`${r.status}: ${b.slice(0, 300)}`);
      return parseJson(JSON.parse(b).choices?.[0]?.message?.content || '');
    } catch (e) { console.error(`[${label}] ${i}/4 ${e.message}`); await new Promise(s => setTimeout(s, i * 2000)); }
  }
  throw new Error('failed');
}
function load(epub) {
  const dir = mkdtempSync(join(tmpdir(), 'xt-ruan-')); execFileSync('unzip', ['-o', '-q', join(material, epub), '-d', dir]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(dir, p)).find(p => existsSync(p));
  return readdirSync(base).filter(f => /\d+\.x?html?$/i.test(f)).map(f => readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ')).join('\n');
}

async function run() {
  const out = {};
  for (const book of books) {
    const text = load(book.epub);
    const sents = text.split(/(?<=[。！？])|\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s.length >= 6 && sisters.some(n => s.includes(n)));
    const picked = [...new Set(sents)].slice(0, 60);
    console.error(`[${book.id}] 含姐妹句 ${sents.length}，取 ${picked.length}`);
    const msg = [
      { role: 'system', content: '你是小说人物性格整理助手，专门消歧一对易混姐妹。严格：只把【明确点名某一位】的句子归给该人；凡用「她」「姐妹」「两人」等无法确定指代的，一律放进 ambiguous，绝不臆测归属。忠实原文，不脑补。' },
      { role: 'user', content: `《${book.title}》中有一对姐妹：阮香琳、阮香凝（注意二字不同，勿混）。基于以下原文句子，分别提炼两人性格，输出严格 JSON：
{"阮香琳":{"personality":["..."],"evidence":["明确点名阮香琳的原文短句，最多4"]},"阮香凝":{"personality":["..."],"evidence":["明确点名阮香凝的原文短句，最多4"]},"ambiguous":["指代不清、无法判定归属的句子，最多4"]}

原文句子：
${picked.map(s => `- ${s}`).join('\n')}` },
    ];
    out[book.id] = await ask(msg, book.id);
  }
  await writeFile(join(canon, 'ruan-sisters-disambig.json'), `${JSON.stringify(out, null, 2)}\n`);
  const L = ['# 阮香琳 / 阮香凝 消歧重抽（D2 用）', ''];
  for (const b of Object.keys(out)) {
    L.push(`## ${b}`);
    for (const s of sisters) { L.push(`- **${s}**：${(out[b][s]?.personality || []).join(' / ') || '—'}`); for (const e of (out[b][s]?.evidence || [])) L.push(`    · ${e}`); }
    L.push(`- ⚠️ 指代不清：${(out[b].ambiguous || []).map(x => x.slice(0, 40)).join(' ｜ ') || '无'}`, '');
  }
  await writeFile(join(canon, 'ruan-sisters-disambig.md'), `${L.join('\n')}\n`);
  console.error('写入 ruan-sisters-disambig.{json,md}');
  for (const b of Object.keys(out)) for (const s of sisters) console.log(`[${b}] ${s}: ${(out[b][s]?.personality || []).join('/')}`);
}
run().catch(e => { console.error(e); process.exit(1); });
