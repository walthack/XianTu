#!/usr/bin/env node

// 生成约束审核清单 Markdown。出处用确定性回溯（不经 LLM，避免编造章节）：
// 把每条约束的 evidence 关键词匹配回 extraction 的 characterState 关系证据 / contentFact，
// 取该记录的 sourceIndex → 章节标题(heading) → chapterNN.html。匹配不到则回退到角色出场章节区间。

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const books = [
  { id: 'qingyu', title: '六朝清羽记' },
  { id: 'yunlong', title: '六朝云龙吟' },
  { id: 'yange', title: '六朝燕歌行' },
];

async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

// 中文 2-gram shingle 化，用于 evidence ↔ 源记录的重叠匹配（整段汉字不能当单 token）。
function tokens(s) {
  const clean = (s || '').replace(/[，。、；：（）()【】“”"'\s]+/g, '');
  const grams = new Set();
  for (let i = 0; i + 1 < clean.length; i += 1) grams.add(clean.slice(i, i + 2));
  return grams;
}
function overlap(a, b) {
  let n = 0;
  for (const t of a) if (b.has(t)) n += 1;
  return n;
}

async function buildBook(book) {
  const dir = join(generatedRoot, book.id, 'extraction');
  const files = (await readdir(dir)).filter(f => /^batch-\d+\.json$/.test(f)).sort();
  const indexMap = new Map(); // sourceIndex -> {heading, file}
  const records = new Map();  // name -> [{text, index, heading, file, src}]
  const span = new Map();     // name -> {lo, hi}
  for (const f of files) {
    const d = await readJson(join(dir, f));
    for (const r of d.sourceRange || []) if (!indexMap.has(r.sourceIndex)) indexMap.set(r.sourceIndex, { heading: r.heading, file: r.file });
    for (const c of d.characterStates || []) {
      if (!c.name) continue;
      const lo = c.firstSeenSourceIndex, hi = c.lastSeenSourceIndex;
      const cur = span.get(c.name) || { lo: Infinity, hi: -Infinity };
      if (Number.isFinite(lo)) cur.lo = Math.min(cur.lo, lo);
      if (Number.isFinite(hi)) cur.hi = Math.max(cur.hi, hi);
      span.set(c.name, cur);
      const list = records.get(c.name) || [];
      for (const rel of c.relationships || []) {
        if (rel.evidence) list.push({ text: rel.evidence, index: lo, src: 'relationship' });
      }
      records.set(c.name, list);
    }
    for (const cf of d.contentFacts || []) {
      if (!cf.fact) continue;
      for (const h of cf.holders || []) {
        const list = records.get(h) || [];
        list.push({ text: `${cf.name}：${cf.fact}`, index: cf.acquiredAtSourceIndex, src: 'contentFact' });
        records.set(h, list);
      }
    }
  }
  const citeObj = idx => {
    const meta = indexMap.get(idx);
    return { heading: meta?.heading || null, sourceIndex: idx ?? null, file: meta?.file || null };
  };
  return { indexMap, records, span, citeObj };
}

const fmtSource = s => s.approx
  ? `角色出场区间 ${s.heading}（#${s.sourceIndex}，${s.file}） ~ ${s.toHeading}（#${s.toSourceIndex}，${s.toFile}）（未精确匹配到单条证据）`
  : s.heading ? `${s.heading}（#${s.sourceIndex}，${s.file}）${s.evidence ? ` — “${s.evidence}”` : ''}` : '未在 extraction 中定位到出处';

// 返回结构化出处数组，供 md 渲染 + 回写 draft。
function sourcesFor(constraint, ctx) {
  const recs = ctx.records.get(constraint.__name) || [];
  const et = tokens(constraint.evidence);
  const scored = recs
    .map(r => ({ r, score: overlap(et, tokens(r.text)) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (scored.length) {
    return scored.map(x => ({ ...ctx.citeObj(x.r.index), evidence: x.r.text }));
  }
  const sp = ctx.span.get(constraint.__name);
  if (sp && Number.isFinite(sp.lo)) {
    const lo = ctx.citeObj(sp.lo); const hi = ctx.citeObj(sp.hi);
    return [{ approx: true, ...lo, toHeading: hi.heading, toSourceIndex: hi.sourceIndex, toFile: hi.file }];
  }
  return [{ heading: null, sourceIndex: null, file: null }];
}

async function run() {
  const lines = ['# 仙途 · 角色约束审核清单', '', '> 出处由 extraction 元数据确定性回溯（章节标题 / #sourceIndex / chapter文件），非 LLM 生成，可逐条核对。', ''];
  for (const book of books) {
    const draftPath = join(generatedRoot, 'character-canon', `${book.id}.character-constraints-draft.json`);
    const draft = await readJson(draftPath);
    const ctx = await buildBook(book);
    lines.push(`## 《${book.title}》（${book.id}） — ${draft.characters.length} 角色`, '');
    for (const c of draft.characters) {
      lines.push(`### ${c.name}`);
      for (const k of c.constraints || []) {
        const sources = sourcesFor({ ...k, __name: c.name }, ctx);
        k.sources = sources; // 回写 draft：每条约束自带结构化出处
        lines.push(`- **[${k.category || '约束'}]** ${k.rule || ''}`);
        if (k.consequence && k.consequence !== '未知') lines.push(`  - 后果：${k.consequence}`);
        lines.push(`  - 抽取依据：${k.evidence || '—'}`);
        for (const s of sources) lines.push(`  - 原文出处：${fmtSource(s)}`);
      }
      lines.push('');
    }
    await writeFile(draftPath, `${JSON.stringify(draft, null, 2)}\n`); // 持久化 sources 到 draft
  }
  const out = join(generatedRoot, 'character-canon', 'constraints-review.md');
  await writeFile(out, `${lines.join('\n')}\n`);
  console.log(`写入 ${out} + 回写 sources 到 3 个 constraints-draft.json`);
}

run().catch(err => { console.error(err); process.exit(1); });
