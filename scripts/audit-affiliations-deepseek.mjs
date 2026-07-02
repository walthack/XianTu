#!/usr/bin/env node
// 归属质量审计（第二信源）：对每个有 affiliations 的角色，喂现有归属+原文证据，
// 让 DeepSeek 逐条判 真实/仪式性/存疑/错误，供人工裁定后修卡。不直接改正典。
// 断点续(已有 {name}.json 跳过)。产物 character-canon/affiliation-audit/{name}.json + REPORT.md
// 用法：node scripts/audit-affiliations-deepseek.mjs   (建议后台跑)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const outDir = join(gen, 'character-canon/affiliation-audit');
const material = '/Volumes/botsvault/06_material';
const model = process.env.XIANTU_VERIFY_MODEL || 'deepseek/deepseek-v4-flash';
const CONC = Number(process.env.CONC || 5);
const BOOKS = { qingyu: 'A-六朝清羽记.epub', yunlong: 'B- 六朝云龙吟.epub', yange: 'C-六朝燕歌行.epub' };

const parseEnv = t => Object.fromEntries(t.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; }));
const parseJson = t => { const f = String(t).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]; const c = f || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(c); };
let KEY;
async function orJson(messages, label) {
  for (let i = 1; i <= 4; i++) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, temperature: 0, max_tokens: 1800, response_format: { type: 'json_object' }, messages }) });
      const b = await r.text(); if (!r.ok) throw new Error(r.status); const c = JSON.parse(b).choices?.[0]?.message?.content || ''; if (!c.trim()) throw new Error('empty'); return parseJson(c);
    } catch (e) { console.error(`  [${label}] ${i}/4 ${e.message}`); await new Promise(s => setTimeout(s, i * 1500)); }
  }
  return null;
}

const cache = {};
function chapters(id) {
  if (cache[id]) return cache[id];
  const tmp = mkdtempSync(join(tmpdir(), `xt-aa-${id}-`));
  execFileSync('unzip', ['-o', '-q', join(material, BOOKS[id]), '-d', tmp]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(tmp, p)).find(existsSync);
  return cache[id] = readdirSync(base).filter(f => /\.x?html?$/i.test(f)).sort().map(f => readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim());
}
function windows(kws, books, span = 360, maxPer = 6, budget = 11000) {
  const out = []; const seen = new Set();
  for (const b of books) { const chs = chapters(b);
    for (const kw of kws) for (let ci = 0; ci < chs.length; ci++) { const t = chs[ci]; let pos = 0, n = 0;
      while (n < maxPer) { const i = t.indexOf(kw, pos); if (i < 0) break; const key = `${b}:${ci}:${i}`;
        if (!seen.has(key)) { seen.add(key); out.push(t.slice(Math.max(0, i - span), i + kw.length + span)); } pos = i + kw.length; n++; } } }
  let used = 0, sel = []; for (const w of out) { if (used + w.length > budget) break; sel.push(w); used += w.length; } return sel.join('\n---\n');
}

const SYS = '你是严谨的小说设定考据员，只依据提供的原文片段判断某角色是否真属于某势力，不脑补。严格输出 JSON。';
async function auditOne(c) {
  const affs = (c.staticProfile.affiliations || []).map(a => `${a.faction}${a.role ? '(' + a.role + ')' : ''}`);
  if (!affs.length) return null;
  const kws = [c.canonicalName, ...(c.aliases || [])].filter(Boolean);
  const books = (c.books && c.books.length) ? c.books : Object.keys(BOOKS);
  const ev = windows(kws, books);
  const user = `角色「${c.canonicalName}」当前登记的势力归属：\n${affs.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\n逐条依据原文判断该归属的真实性，verdict 取值：\n- "真实"：原文支持其实质归属该势力\n- "仪式性"：仅名义/受封/授箓/挂名，非实质成员（如受封女道士挂多个道派）\n- "存疑"：原文证据不足以确认\n- "错误"：原文明显不支持/张冠李戴\n输出 JSON：{"name":"${c.canonicalName}","verdicts":[{"faction":"势力名","verdict":"真实|仪式性|存疑|错误","basis":"一句原文依据或说明"}],"suggestPrimary":"最主要的真实归属(可空)"}\n\n原文片段：\n${ev || '（未命中）'}`;
  const r = await orJson([{ role: 'system', content: SYS }, { role: 'user', content: user }], c.canonicalName);
  return r || { name: c.canonicalName, verdicts: [], needsHuman: true, error: 'no_response' };
}

async function run() {
  mkdirSync(outDir, { recursive: true });
  const env = existsSync(join(root, '.env')) ? parseEnv(await readFile(join(root, '.env'), 'utf8')) : {};
  KEY = env.OPENROUTER_API_KEY;
  const cards = JSON.parse(readFileSync(join(gen, 'character-canon/character-cards-v3.json'), 'utf8'));
  let todo = cards.characters.filter(c => (c.staticProfile.affiliations || []).length && !existsSync(join(outDir, `${c.canonicalName}.json`)));
  if (process.env.ONLY) todo = todo.filter(c => process.env.ONLY.split(',').includes(c.canonicalName));
  if (process.env.LIMIT) todo = todo.slice(0, Number(process.env.LIMIT));
  console.error(`待审 ${todo.length} 角色（并发 ${CONC}）`);
  let done = 0;
  for (let i = 0; i < todo.length; i += CONC) {
    const batch = todo.slice(i, i + CONC);
    await Promise.all(batch.map(async c => {
      const r = await auditOne(c); if (!r) return;
      writeFileSync(join(outDir, `${c.canonicalName}.json`), JSON.stringify(r, null, 2) + '\n');
      done++; if (done % 20 === 0) console.error(`  ...${done}/${todo.length}`);
    }));
  }
  // REPORT：只列有问题的（仪式性/存疑/错误）
  const flagged = [];
  for (const f of readdirSync(outDir).filter(x => x.endsWith('.json'))) {
    const r = JSON.parse(readFileSync(join(outDir, f), 'utf8'));
    const bad = (r.verdicts || []).filter(v => v.verdict !== '真实');
    if (bad.length) flagged.push({ name: r.name, bad, primary: r.suggestPrimary });
  }
  const md = ['# 归属审计（DeepSeek 二次比对）— 只列存疑/仪式性/错误，供人工裁定', '', `生成：${new Date().toISOString()}  模型：${model}  有问题角色：${flagged.length}`, ''];
  for (const x of flagged.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh'))) {
    md.push(`## ${x.name}${x.primary ? `（建议主归属：${x.primary}）` : ''}`);
    for (const v of x.bad) md.push(`- [${v.verdict}] ${v.faction} — ${v.basis || ''}`);
    md.push('');
  }
  writeFileSync(join(outDir, 'REPORT.md'), md.join('\n'));
  console.error(`完成：本次 ${done}，有问题角色 ${flagged.length} → ${outDir}/REPORT.md`);
}
run();
