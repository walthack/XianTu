#!/usr/bin/env node

// 既有人物高光工单为权威基线；MiniMax 全量重抽只生成“未覆盖候选”差集。
// 不调用 LLM，不改 stage/正典/既有工单。候选仍须经内容裁定后才能落 beat。
// Usage: node scripts/build-highlight-supplement-pool.mjs [qingyu|yunlong|yange ...]

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const baselineRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const reextractRoot = join(root, 'mod-kit', 'generated', 'minimax-m2.7', 'trilogy-reextract-2026-07-16');
const BOOKS = { qingyu: '六朝清羽记', yunlong: '六朝云龙吟', yange: '六朝燕歌行' };
const SEX = /阳具|献身|口含|交合|云雨|房事|鼎炉|春宫|情欲|性交|媾和|媾欢|淫辱|奸淫|裸身|裸露|处子之身|以身相酬|双修/;

function text(value) { return String(value || '').replace(/[^\u4e00-\u9fffa-z0-9]/gi, '').toLowerCase(); }
function bigrams(value) {
  const normalized = text(value);
  const grams = new Set();
  for (let index = 0; index < normalized.length - 1; index += 1) grams.add(normalized.slice(index, index + 2));
  return grams;
}
function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const item of a) if (b.has(item)) common += 1;
  return common / (a.size + b.size - common);
}
function flattenWorklist(document) {
  return Object.values(document).flat().filter(item => item && typeof item === 'object');
}
function loadBaseline(book) {
  const path = join(baselineRoot, book, 'highlight-worklist.deepseek.json');
  if (!existsSync(path)) throw new Error(`${book}: missing highlight worklist baseline`);
  return flattenWorklist(JSON.parse(readFileSync(path, 'utf8'))).map(item => ({
    title: item.title || '',
    source: item.source || '',
    char: item.char || '',
    window: item.window || '',
    grams: bigrams(`${item.title || ''}${item.source || ''}`),
  }));
}
function isCovered(event, baseline) {
  const eventGrams = bigrams(`${event.name || ''}${event.summary || ''}`);
  let best = { score: 0, item: null };
  for (const item of baseline) {
    let score = similarity(eventGrams, item.grams);
    if (event.participants?.includes(item.char)) score += 0.08;
    if (score > best.score) best = { score, item };
  }
  return best;
}
function priority(event, score) {
  const people = new Set(event.participants || []).size;
  return Math.round((event.isClimax ? 40 : 20) + Math.min(people, 4) * 8 + Math.max(0, 1 - score) * 35);
}

function build(book) {
  const source = join(reextractRoot, `${book}.reextract.DRAFT.json`);
  if (!existsSync(source)) {
    console.log(`${book}: reextract draft not started; skipped`);
    return;
  }
  const draft = JSON.parse(readFileSync(source, 'utf8'));
  const baseline = loadBaseline(book);
  const candidates = [];
  const quarantined = [];
  for (const event of draft.events || []) {
    if (!event.isMajor) continue;
    const probe = `${event.name || ''}${event.summary || ''}`;
    const coverage = isCovered(event, baseline);
    if (coverage.score >= 0.34) continue;
    const record = {
      sourceIndex: event.sourceIndex,
      heading: event.heading,
      eventOrdinal: event.eventOrdinal ?? 0,
      title: event.name,
      summary: event.summary,
      participants: event.participants || [],
      isClimax: Boolean(event.isClimax),
      baselineSimilarity: Number(coverage.score.toFixed(3)),
      nearestBaseline: coverage.item ? { title: coverage.item.title, char: coverage.item.char, window: coverage.item.window } : null,
      priority: priority(event, coverage.score),
      disposition: 'needs_editorial_adjudication',
    };
    if (SEX.test(probe)) quarantined.push({ ...record, disposition: 'quarantined_desensitize_before_review' });
    else candidates.push(record);
  }
  candidates.sort((a, b) => b.priority - a.priority || a.sourceIndex - b.sourceIndex || a.eventOrdinal - b.eventOrdinal);
  quarantined.sort((a, b) => a.sourceIndex - b.sourceIndex || a.eventOrdinal - b.eventOrdinal);
  const output = {
    schema: 'xiantu.highlight-supplement-pool.v1',
    status: draft.attempted?.length === JSON.parse(readFileSync(join(baselineRoot, book, 'source-index.json'), 'utf8')).length ? 'complete-input' : 'partial-input',
    book,
    bookTitle: BOOKS[book],
    sourceDraft: source.slice(root.length + 1),
    baseline: `${book}/highlight-worklist.deepseek.json`,
    rule: '既有工单为权威；仅输出与基线文本相似度<0.34的 major 候选。该规则只用于召回，不等价于高光裁定。',
    inputStats: { chaptersCompleted: draft.attempted?.length || 0, majorEvents: (draft.events || []).filter(event => event.isMajor).length, baselineItems: baseline.length },
    candidates,
    quarantined,
  };
  const destination = join(reextractRoot, `${book}.highlight-supplement.DRAFT.json`);
  writeFileSync(destination, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`${book}: ${output.status}; baseline ${baseline.length}; candidates ${candidates.length}; quarantined ${quarantined.length}`);
}

const selected = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BOOKS);
for (const book of selected) {
  if (!BOOKS[book]) throw new Error(`unknown book: ${book}`);
  build(book);
}
