#!/usr/bin/env node

// 为别名表里每个角色的每个别名找具体原文出处(章节+原句)；找不到则标"无出处"。
// 对每个别名在该角色所属书的 epub 检索：含该别名、并尽量与本名共现或带身份标记的句子 → DeepSeek 判定+引用。
// 输出 character-canon/alias-sources.md，并把 sources 注记回写进 character-alias-registry.json。
//
// Usage: node scripts/verify-alias-sources.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const canonDir = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'character-canon');
const material = '/Volumes/botsvault/06_material';
const model = process.env.XIANTU_ALIAS_SRC_MODEL || 'deepseek/deepseek-v4-flash';
const EPUB = { qingyu: 'A-六朝清羽记.epub', yunlong: 'B- 六朝云龙吟.epub', yange: 'C-六朝燕歌行.epub' };
const TITLE = { qingyu: '六朝清羽记', yunlong: '六朝云龙吟', yange: '六朝燕歌行' };
const MARK = /本名|原名|又名|别名|别号|人称|绰号|外号|号曰|表字|小字|化名|真名|即|便是|就是|乃|改称|本是|原是|唤作|称为/;

function parseEnv(t) { return Object.fromEntries(t.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; })); }
function parseJson(t) { const f = String(t).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]; const c = f || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(c); }
async function orJson(messages, label) {
  const env = existsSync(join(root, '.env')) ? parseEnv(await readFile(join(root, '.env'), 'utf8')) : {};
  const key = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  for (let i = 1; i <= 4; i++) {
    try { const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'XianTu AliasSrc' }, body: JSON.stringify({ model, temperature: 0, max_tokens: 2500, response_format: { type: 'json_object' }, messages }) }); const b = await r.text(); if (!r.ok) throw new Error(r.status); return parseJson(JSON.parse(b).choices?.[0]?.message?.content || ''); }
    catch (e) { console.error(`[${label}] ${i}/4 ${e.message}`); await new Promise(s => setTimeout(s, i * 1500)); }
  }
  return null;
}
function loadBook(epub) {
  const dir = mkdtempSync(join(tmpdir(), 'xt-as-'));
  execFileSync('unzip', ['-o', '-q', join(material, epub), '-d', dir]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(dir, p)).find(p => existsSync(p));
  const files = readdirSync(base).filter(f => /\d+\.x?html?$/i.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  return files.map(f => {
    const text = readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/[ \t]+/g, ' ');
    const title = (text.match(/第[0-9〇零一二三四五六七八九十百千两]+[章集][·\s][^\s，。]{0,12}/) || [f.replace(/\.x?html?$/i, '')])[0];
    return { title, sents: text.split(/(?<=[。！？])|\n/).map(s => s.trim()).filter(s => s.length >= 4) };
  });
}
// 为某别名取最佳候选句(优先与本名共现或带标记)。
function retrieve(alias, canonical, chapters) {
  const hits = [];
  for (const ch of chapters) for (const s of ch.sents) {
    if (!s.includes(alias)) continue;
    const score = (s.includes(canonical) ? 2 : 0) + (MARK.test(s) ? 2 : 0);
    hits.push({ title: ch.title, s, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return { count: hits.length, top: hits.slice(0, 5) };
}

async function run() {
  const reg = JSON.parse(await readFile(join(canonDir, 'character-alias-registry.json'), 'utf8'));
  const targets = reg.characters.filter(c => (c.aliases || []).length);
  const bookCache = {};
  const lines = ['# 仙途 · 别名出处核查', '', '> 每个别名标注原文出处(章节+原句)；检索不到的标「无出处」。', ''];
  for (const c of targets) {
    const books = (c.books || []).filter(b => EPUB[b]);
    if (!books.length) continue;
    for (const b of books) if (!bookCache[b]) bookCache[b] = loadBook(EPUB[b]);
    // 逐别名检索候选
    const perAlias = {};
    for (const alias of c.aliases) {
      let best = { count: 0, top: [] };
      for (const b of books) { const r = retrieve(alias, c.canonicalName, bookCache[b]); if (r.count > best.count) best = { ...r, book: b }; if (r.top.length) best.top = [...best.top, ...r.top.map(t => ({ ...t, book: b }))]; }
      perAlias[alias] = best;
    }
    const aliasesWithHits = c.aliases.filter(a => perAlias[a].top.length);
    let out = null;
    if (aliasesWithHits.length) {
      const payload = aliasesWithHits.map(a => `【${a}】\n${perAlias[a].top.slice(0, 5).map(t => `〔${TITLE[t.book] || ''}·${t.title}〕${t.s}`).join('\n')}`).join('\n\n');
      out = await orJson([
        { role: 'system', content: '你为小说角色的每个别名找原文出处。给定候选原句(已含章节)，为每个别名挑一条最能证明"该别名指代此角色"的原句作为出处；若候选都不足以证明，标记 supported=false。只用给定原文。' },
        { role: 'user', content: `角色：${c.canonicalName}。为下列每个别名给出出处，严格 JSON：\n{"aliases":[{"alias":"别名","supported":true,"chapter":"章节","evidence":"原句"}]}\n\n候选：\n${payload}` }],
        c.canonicalName);
    }
    const verdict = new Map((out?.aliases || []).map(a => [a.alias, a]));
    c.aliasSources = c.aliases.map(a => {
      const v = verdict.get(a);
      if (v?.supported) return { alias: a, chapter: v.chapter || '', evidence: v.evidence || '' };
      if (!perAlias[a].top.length) return { alias: a, source: '无出处（原文未检索到）' };
      return { alias: a, source: '无确证出处（有出现但未证明同指）' };
    });
    lines.push(`### ${c.canonicalName}${c.realName && c.realName !== c.canonicalName ? `（本名 ${c.realName}）` : ''}  \`${c.id}\``);
    for (const s of c.aliasSources) {
      if (s.evidence) lines.push(`- **${s.alias}** ← 〔${s.chapter}〕“${s.evidence}”`);
      else lines.push(`- **${s.alias}** ← ⚠️ ${s.source}`);
    }
    lines.push('');
    console.error(`${c.canonicalName}: ${c.aliasSources.filter(s => s.evidence).length}/${c.aliases.length} 有出处`);
  }
  await writeFile(join(canonDir, 'alias-sources.md'), `${lines.join('\n')}\n`);
  await writeFile(join(canonDir, 'character-alias-registry.json'), `${JSON.stringify(reg, null, 2)}\n`);
  console.error('写入 alias-sources.md + 回写 aliasSources 到 registry');
}
run().catch(e => { console.error(e); process.exit(1); });
