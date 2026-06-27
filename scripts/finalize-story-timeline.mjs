#!/usr/bin/env node

// 主轴定稿后处理（确定性，不调 LLM）：
// 1. 重建确定性骨架（与 generate-story-timeline 同逻辑：book/idx/heading/climax，按 sourceIndex 排序）。
// 2. 从生成器产出的 story-timeline.md 按顺序取出每条 beat 文字，与骨架逐条配对（数量须相等）。
// 3. 跨块去重：相邻、同一 sourceIndex 且文本高度相似(bigram Jaccard>=0.82)的节点合并。
// 4. 加锚点：每条 = 〔书·#idx·章节〕，作为下游 ①严格走向 / ②if线分支点 / ③拓展 的承重句柄。
// 输出 character-canon/story-timeline.json（结构化，下游引用）+ 覆写 story-timeline.md（带锚点可读）。

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(generatedRoot, 'character-canon');
const books = [
  { id: 'qingyu', title: '六朝清羽记' },
  { id: 'yunlong', title: '六朝云龙吟' },
  { id: 'yange', title: '六朝燕歌行' },
];

function bigrams(s) {
  const c = (s || '').replace(/[，。、；：（）()【】“”"'\s★]+/g, '');
  const g = new Set();
  for (let i = 0; i + 1 < c.length; i += 1) g.add(c.slice(i, i + 2));
  return g;
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

// 与 generate-story-timeline.collectEvents 一致：确定性骨架。
async function skeleton(book) {
  const dir = join(generatedRoot, book.id, 'extraction');
  const files = (await readdir(dir)).filter(f => /^batch-\d+\.json$/.test(f)).sort();
  const indexMap = new Map();
  const events = [];
  for (const f of files) {
    const d = JSON.parse(await readFile(join(dir, f), 'utf8'));
    for (const r of d.sourceRange || []) if (!indexMap.has(r.sourceIndex)) indexMap.set(r.sourceIndex, r.heading);
    for (const e of d.events || []) {
      if (!e.isMajor) continue;
      const idx = Math.min(...(e.sourceIndices || [Infinity]));
      events.push({ idx: Number.isFinite(idx) ? idx : 1e9, climax: !!e.isClimax, name: e.name, summary: e.summary });
    }
  }
  events.sort((a, b) => a.idx - b.idx);
  return events.map(e => ({ ...e, heading: indexMap.get(e.idx) || '' }));
}

// 取出 md 中每个 ## 《书名》 段落下的 "- " beat 行（顺序即事件顺序）。
function beatsByBook(md) {
  const out = new Map();
  let cur = null;
  for (const line of md.split(/\r?\n/)) {
    const bk = line.match(/^##\s+《(.+?)》/);
    if (bk) { cur = bk[1]; out.set(cur, []); continue; }
    if (cur && line.startsWith('- ')) out.get(cur).push(line.replace(/^- (★ )?/, '').trim());
  }
  return out;
}

async function run() {
  const md = await readFile(join(canonDir, 'story-timeline.md'), 'utf8');
  const beats = beatsByBook(md);
  const nodes = [];
  for (const book of books) {
    const sk = await skeleton(book);
    const bs = beats.get(book.title) || [];
    if (bs.length !== sk.length) {
      throw new Error(`${book.id}: md beat 行数 ${bs.length} ≠ 骨架事件数 ${sk.length}，无法安全配对（生成可能未完成）。`);
    }
    sk.forEach((e, i) => nodes.push({ book: book.id, bookTitle: book.title, idx: e.idx, heading: e.heading, climax: e.climax, beat: bs[i] || e.summary || e.name }));
  }

  // 去重：相邻、同书同 idx、文本高度相似 → 合并（保留更长的一条）。
  const deduped = [];
  let merged = 0;
  for (const n of nodes) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.book === n.book && prev.idx === n.idx && jaccard(bigrams(prev.beat), bigrams(n.beat)) >= 0.82) {
      if (n.beat.length > prev.beat.length) prev.beat = n.beat;
      prev.climax = prev.climax || n.climax;
      merged += 1;
      continue;
    }
    deduped.push({ ...n });
  }

  // 加锚点 + 全局连续序号（供下游引用主轴某一点）。
  deduped.forEach((n, i) => { n.seq = i + 1; n.anchor = `${n.bookTitle}·#${n.idx}·${n.heading}`; });

  await writeFile(join(canonDir, 'story-timeline.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), bookOrder: books.map(b => b.id), totalNodes: deduped.length, mergedDuplicates: merged, nodes: deduped }, null, 2)}\n`);

  // 覆写可读 md（带锚点）。
  const lines = ['# 仙途 · 六朝三部曲线性时间线（主轴 · 定稿）', '', `> 书序 清羽→云龙→燕歌。节点 ${deduped.length} 条（去重合并 ${merged}）。每条带锚点〔书·#sourceIndex·章节〕供下游剧本/if线/拓展引用。★=高潮。`, ''];
  let lastBook = '', lastHeading = '';
  for (const n of deduped) {
    if (n.book !== lastBook) { lines.push(`## 《${n.bookTitle}》`, ''); lastBook = n.book; lastHeading = ''; }
    if (n.heading && n.heading !== lastHeading) { lines.push(`### ${n.heading}`); lastHeading = n.heading; }
    lines.push(`- \`#${n.seq}\` 〔${n.anchor}〕 ${n.climax ? '★ ' : ''}${n.beat}`);
  }
  await writeFile(join(canonDir, 'story-timeline.md'), `${lines.join('\n')}\n`);
  console.log(`定稿完成：${deduped.length} 节点（去重合并 ${merged}）。→ story-timeline.json + story-timeline.md`);
}

run().catch(err => { console.error(err.message); process.exit(1); });
