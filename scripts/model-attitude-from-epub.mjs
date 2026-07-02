#!/usr/bin/env node

// 处子/破身角色 → 行为态度建模（DeepSeek 执行；框架见 if-branches-sample/attitude-model-FRAMEWORK.md）。
// 自动筛 rule 含 处子/破身/破处/童身/元阴/元红/贞洁/鼎炉/破体 的约束，按其 sources 锚定原文章节，
// DeepSeek 四选一原型 + 脱敏态度短语 + 出处，写回 attitudeArchetype/behavioralEffect/provenance。
// 约束式分类（非自由 verdict），只要标签不要复述细节 → 规避露骨内容审核与"false unsupported"。
//
// Usage: node scripts/model-attitude-from-epub.mjs [qingyu|yunlong|yange ...]
// 备份：<book>.character-constraints-draft.pre-attitude.json（不覆盖既有）。

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
const ARCH = ['resist', 'cultivation_willing', 'conquered_submit', 'violated_resent', 'uncertain'];
const SELECT = /处子|破身|破处|童身|元阴|元红|贞洁|鼎炉|破体/;
const EXCLUDED_SUBJECTS = new Set(['程宗扬', '袁天罡', '云龙', '燕歌']);
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
  for (let i = 1; i <= 5; i++) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'XianTu Attitude' }, body: JSON.stringify({ model, temperature: 0, max_tokens: 700, response_format: { type: 'json_object' }, messages }) });
      const b = await r.text(); if (!r.ok) throw new Error(r.status);
      const content = JSON.parse(b).choices?.[0]?.message?.content || '';
      if (!content.trim()) throw new Error('empty');
      return parseJson(content);
    } catch (e) { console.error(`  [${label}] ${i}/5 ${e.message}`); await new Promise(s => setTimeout(s, i * 1500)); }
  }
  return null;
}
function loadChapters(epub) {
  const dir = mkdtempSync(join(tmpdir(), 'xt-a-'));
  execFileSync('unzip', ['-o', '-q', join(material, epub), '-d', dir]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(dir, p)).find(p => existsSync(p));
  const map = new Map();
  for (const f of readdirSync(base).filter(f => /\.x?html?$/i.test(f)))
    map.set(f, readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim());
  return map;
}
function windows(text, name, span = 300, max = 2) {
  const out = []; let from = 0, n = 0;
  while (n < max) { const i = text.indexOf(name, from); if (i < 0) break; out.push(text.slice(Math.max(0, i - span), i + span)); from = i + span; n++; }
  if (!out.length) out.push(text.slice(0, 1200));
  return out;
}

const SYS = '你是小说人物关系建模员。给你一个角色、其"处子/破身相关约束"、及原文片段。' +
  '判断该角色对男主程宗扬房事/双修要求的【态度原型】，四选一：' +
  'resist(守身抗拒) / cultivation_willing(为修炼自愿但有边界,如走后门保元阴) / conquered_submit(被征服后顺从) / violated_resent(被性侵后怨恨被迫)。原文不足判 uncertain。' +
  '严防过度推断：发生性关系/亲热/双修 不等于 破身；走后门/后庭 恰是保处子手段。' +
  '只输出态度【分类与走向短语】，不要复述露骨细节（脱敏），但走向/边界要明确不许糊。' +
  '输出 JSON：{archetype, asVirgin(处子时态度一句话), afterBroken(破身后态度一句话,无则""), boundary(如走后门保元阴,无则""), citation(最支持的〔章节·#index〕), confidence(high|med|low)}。';

async function run() {
  let done = 0, uncertain = 0; const rows = [];
  for (const book of books) {
    const file = join(ccDir, `${book.id}.character-constraints-draft.json`);
    if (!existsSync(file)) continue;
    const bak = join(ccDir, `${book.id}.character-constraints-draft.pre-attitude.json`);
    if (!existsSync(bak)) copyFileSync(file, bak);
    const siPath = join(gen, book.id, 'source-index.json');
    const idxToFile = new Map(existsSync(siPath) ? JSON.parse(readFileSync(siPath, 'utf8')).map(e => [e.index, e.file]) : []);
    const idxToHead = new Map(existsSync(siPath) ? JSON.parse(readFileSync(siPath, 'utf8')).map(e => [e.index, e.heading]) : []);
    const data = JSON.parse(await readFile(file, 'utf8'));
    console.error(`\n===== ${book.id} : 解压原文 =====`);
    const chapters = loadChapters(book.epub);
    for (const ch of data.characters) for (const c of ch.constraints) {
      if (ch.gender === '男' || EXCLUDED_SUBJECTS.has(ch.name)) {
        continue;
      }
      if (!SELECT.test(c.rule || '')) continue;
      const frags = [];
      for (const s of c.sources || []) {
        const f = s.file || idxToFile.get(s.sourceIndex); const txt = f && chapters.get(f);
        if (txt) frags.push(`〔${s.heading || idxToHead.get(s.sourceIndex) || f}·#${s.sourceIndex ?? '?'}〕${windows(txt, ch.name).join(' …… ')}`);
      }
      const v = frags.length ? await orJson([
        { role: 'system', content: SYS },
        { role: 'user', content: `角色：${ch.name}\n约束：${c.rule}\n后果：${c.consequence || ''}\n\n原文片段：\n${frags.join('\n\n')}` }
      ], `${book.id}/${ch.name}`) : null;
      let arch = (v?.archetype || 'uncertain').toLowerCase();
      if (!ARCH.includes(arch)) arch = 'uncertain';
      c.attitudeArchetype = arch;
      c.behavioralEffect = { asVirgin: v?.asVirgin || '', afterBroken: v?.afterBroken || '', boundary: v?.boundary || '', citation: v?.citation || '', confidence: v?.confidence || 'low' };
      c.attitudeProvenance = 'deepseek';
      done++; if (arch === 'uncertain') uncertain++;
      console.error(`  ${ch.name}: ${arch}${v?.confidence ? '/' + v.confidence : ''}`);
      rows.push(`- **${book.id} / ${ch.name}** \`${arch}\`${arch === 'uncertain' ? ' ⚠待人工' : ''}\n    - 处子时：${c.behavioralEffect.asVirgin || '—'}\n    - 破身后：${c.behavioralEffect.afterBroken || '—'}\n    - 边界：${c.behavioralEffect.boundary || '—'}\n    - 出处：${c.behavioralEffect.citation || '—'}`);
    }
    await writeFile(file, JSON.stringify(data, null, 2) + '\n');
    console.error(`写回 ${file}`);
  }
  const rep = join(ccDir, 'attitude-model-report.md');
  await writeFile(rep, ['# 处子/破身 → 态度原型（DeepSeek 执行）', '',
    `> 框架见 attitude-model-FRAMEWORK.md。共 ${done} 角色约束，其中 uncertain ${uncertain} 待人工。`, '', ...rows, ''].join('\n'));
  console.error(`\n报告 ${rep}（${done} 条 / uncertain ${uncertain}）`);
}
run();
