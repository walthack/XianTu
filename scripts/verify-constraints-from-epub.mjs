#!/usr/bin/env node

// 逐条 character-constraint 回原文佐证：按约束已登记 sourceIndex/file 锚定到原文【那一章】，
// 取角色名附近的上下文窗口喂给 DeepSeek，判定 rule 是否被原文支持，注释回 json + 出报告。
// 重点：防过度推断（"发生性关系"≠"破身"、"亲热"≠"破处"），只在原文明确支持时判 confirmed。
//
// Usage:
//   node scripts/verify-constraints-from-epub.mjs qingyu     # 仅指定本（试点）
//   node scripts/verify-constraints-from-epub.mjs            # 三本全跑
// 备份：首次运行写 <book>.character-constraints-draft.pre-verify.json（已存在则不覆盖）。

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const ccDir = join(gen, 'character-canon');
const material = '/Volumes/botsvault/06_material';
const model = process.env.XIANTU_VERIFY_MODEL || 'deepseek/deepseek-v4-flash';
const VERDICTS = ['confirmed', 'partial', 'unsupported', 'contradicted'];
const BOOKS = [
  { id: 'qingyu', epub: 'A-六朝清羽记.epub' },
  { id: 'yunlong', epub: 'B- 六朝云龙吟.epub' },
  { id: 'yange', epub: 'C-六朝燕歌行.epub' },
];
const only = process.argv.slice(2);
const books = only.length ? BOOKS.filter(b => only.includes(b.id)) : BOOKS;

function parseEnv(t) { return Object.fromEntries(t.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; })); }
function parseJson(t) { const f = String(t).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]; const c = f || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(c); }
async function orJson(messages, label) {
  const env = existsSync(join(root, '.env')) ? parseEnv(await readFile(join(root, '.env'), 'utf8')) : {};
  const key = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  for (let i = 1; i <= 4; i++) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'XianTu Constraint Verify' }, body: JSON.stringify({ model, temperature: 0, max_tokens: 1200, response_format: { type: 'json_object' }, messages }) });
      const b = await r.text(); if (!r.ok) throw new Error(r.status + ' ' + b.slice(0, 120));
      const content = JSON.parse(b).choices?.[0]?.message?.content || '';
      if (!content.trim()) throw new Error('empty content');
      return parseJson(content);
    } catch (e) { console.error(`  [${label}] ${i}/4 ${e.message}`); await new Promise(s => setTimeout(s, i * 1500)); }
  }
  return null;
}
// epub 内部 file名(chapterNNN.html / NNNN.html) → 清洗后正文
function loadChapters(epub) {
  const dir = mkdtempSync(join(tmpdir(), 'xt-c-'));
  execFileSync('unzip', ['-o', '-q', join(material, epub), '-d', dir]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(dir, p)).find(p => existsSync(p));
  const map = new Map();
  for (const f of readdirSync(base).filter(f => /\.x?html?$/i.test(f)))
    map.set(f, readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim());
  return map;
}
// 约束的 sources → 涉及的 file 列表（含 approx 范围按 source-index 展开）
function citedFiles(c, idxToFile) {
  const files = new Set();
  for (const s of c.sources || []) {
    if (s.file) files.add(s.file);
    if (s.approx && s.sourceIndex != null && s.toSourceIndex != null)
      for (let i = s.sourceIndex; i <= s.toSourceIndex; i++) if (idxToFile.get(i)) files.add(idxToFile.get(i));
  }
  return [...files];
}
// 在章节正文里取角色名附近窗口；名字没出现则取章首
function windows(text, name, span = 400, max = 3) {
  const out = []; let from = 0, n = 0;
  while (n < max) { const i = text.indexOf(name, from); if (i < 0) break; out.push(text.slice(Math.max(0, i - span), i + span)); from = i + span; n++; }
  if (!out.length) out.push(text.slice(0, 1600));
  return out;
}

const SYS = '你是严谨的小说设定校对员。给你一条"角色设定/约束规则"和原文片段，判断原文是否支持该规则。' +
  '严防过度推断：例如"发生性关系/交欢/亲热"并不等于"破身/失贞/破处"；"走后门/后庭之亲"恰恰可能用于保留处子之身。' +
  '只有原文明确支持时才判 confirmed；部分支持判 partial；原文不足判 unsupported；原文与规则相矛盾判 contradicted。' +
  'verdict 只能是这四个英文词之一。只依据给定原文，禁止脑补。' +
  '输出 JSON：{verdict, support_quote(原文原句,无则""), reason(一句话), over_inference_risk(bool), note(可空)}。';

async function run() {
  const summary = [];
  for (const book of books) {
    const file = join(ccDir, `${book.id}.character-constraints-draft.json`);
    if (!existsSync(file)) { console.error(`skip ${book.id}: no constraints file`); continue; }
    const bak = join(ccDir, `${book.id}.character-constraints-draft.pre-verify.json`);
    if (!existsSync(bak)) copyFileSync(file, bak);
    const siPath = join(gen, book.id, 'source-index.json');
    const idxToFile = new Map(existsSync(siPath) ? JSON.parse(readFileSync(siPath, 'utf8')).map(e => [e.index, e.file]) : []);
    const idxToHeading = new Map(existsSync(siPath) ? JSON.parse(readFileSync(siPath, 'utf8')).map(e => [e.index, e.heading]) : []);
    const data = JSON.parse(await readFile(file, 'utf8'));
    console.error(`\n===== ${book.id} : 解压原文 =====`);
    const chapters = loadChapters(book.epub);
    for (const ch of data.characters) {
      for (const c of ch.constraints) {
        const files = citedFiles(c, idxToFile);
        const frags = [];
        for (const s of c.sources || []) {
          const f = s.file || idxToFile.get(s.sourceIndex);
          const txt = f && chapters.get(f);
          if (txt) frags.push({ head: s.heading || idxToHeading.get(s.sourceIndex) || f, idx: s.sourceIndex, text: windows(txt, ch.name).join(' …… ') });
        }
        let v;
        if (!frags.length) v = { verdict: 'unsupported', support_quote: '', reason: '约束无可定位的原文出处(sources 缺 file/index)', over_inference_risk: false };
        else v = await orJson([
          { role: 'system', content: SYS },
          { role: 'user', content:
            `角色：${ch.name}\n规则：${c.rule}\n后果：${c.consequence || ''}\n\n` +
            `原文片段（按出处章节，已截取「${ch.name}」附近上下文）：\n` +
            frags.map(fr => `〔${fr.head}·#${fr.idx ?? '?'}〕\n${fr.text}`).join('\n\n') }
        ], `${book.id}/${ch.name}`);
        let verdict = (v?.verdict || 'error').toLowerCase();
        if (!VERDICTS.includes(verdict) && verdict !== 'error') verdict = 'unsupported';
        c.verification = {
          verdict, support_quote: v?.support_quote || '', reason: v?.reason || '',
          over_inference_risk: !!v?.over_inference_risk,
          citedSources: (c.sources || []).map(s => ({ heading: s.heading, sourceIndex: s.sourceIndex })),
          model, checkedAt: new Date().toISOString(),
        };
        const tag = verdict + (c.verification.over_inference_risk ? '⚠过度推断' : '');
        console.error(`  ${ch.name}: ${tag}`);
        if (verdict !== 'confirmed' || c.verification.over_inference_risk)
          summary.push(`- **${book.id} / ${ch.name}** [${tag}] ${c.rule}\n    - 佐证：${c.verification.support_quote || '—'}\n    - 理由：${c.verification.reason}`);
      }
    }
    await writeFile(file, JSON.stringify(data, null, 2) + '\n');
    console.error(`写回 ${file}`);
  }
  const rep = join(ccDir, 'constraints-verification-report.md');
  await writeFile(rep, ['# 约束原文佐证报告（DeepSeek）', '',
    `> 模型 ${model}。按约束 sourceIndex 锚定原文章节核验。仅列 **非 confirmed 或 有过度推断风险** 的条目，供人工裁定；全部 verdict 已注释回各 character-constraints-draft.json。`, '',
    summary.length ? summary.join('\n') : '（全部 confirmed、无过度推断风险）', ''].join('\n'));
  console.error(`\n报告 ${rep}（${summary.length} 条需关注）`);
}
run();
