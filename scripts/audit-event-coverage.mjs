#!/usr/bin/env node

// Event-chain coverage audit (roadmap #1).
// For each stage, compare the major/climax events extracted from the novel
// (within the stage's global source range) against the events currently
// authored in scenario.events. Emits a markdown report of gaps so the events
// can be strengthened into advanceable chains. Read-only — writes only the report.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const books = [
  { id: 'qingyu', title: '六朝清羽记', prefix: 'lcq' },
  { id: 'yunlong', title: '六朝云龙吟', prefix: 'lyl' },
  { id: 'yange', title: '六朝燕歌行', prefix: 'lyg' },
];

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function dedupeEvents(batches) {
  const map = new Map();
  for (const batch of batches) {
    for (const event of batch.events || []) {
      if (!event || typeof event !== 'object') continue;
      const si = (event.sourceIndices || []).filter(Number.isFinite).sort((a, b) => a - b);
      const key = `${event.name}@${si[0] ?? '?'}`;
      if (!map.has(key)) map.set(key, { name: event.name, si, isMajor: !!event.isMajor, isClimax: !!event.isClimax, pre: event.preClimaxEntry || '' });
    }
  }
  return [...map.values()];
}

const lines = ['# XianTu 事件链覆盖审计（roadmap #1）', '', `生成时间：${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, ''];

for (const book of books) {
  const plan = await readJson(join(generatedRoot, book.id, 'stage-plan.json'));
  const exDir = join(generatedRoot, book.id, 'extraction');
  const batches = await Promise.all((await readdir(exDir)).filter(n => n.endsWith('.json')).map(n => readJson(join(exDir, n))));
  const allEvents = dedupeEvents(batches);
  const stageDir = join(generatedRoot, book.id, 'stages');

  lines.push(`\n## ${book.title} (${book.id})\n`);
  lines.push('| stage | 章节范围 | 高潮/重大事件(抽取) | 现有scenario事件 | 缺口 |');
  lines.push('|---|---|---|---|---|');
  for (const stage of plan.stages || []) {
    const lo = stage.sourceStartIndex, hi = stage.sourceEndIndex;
    const inRange = allEvents.filter(e => e.si.some(i => i >= lo && i <= hi));
    const major = inRange.filter(e => e.isMajor || e.isClimax);
    const climax = major.filter(e => e.isClimax);
    const cur = (await readJson(join(stageDir, `${stage.id}.json`))).scenario?.events || [];
    const gap = Math.max(0, major.length - cur.length);
    lines.push(`| ${stage.id} | ${lo}-${hi} | ${major.length}（高潮${climax.length}） | ${cur.length} | ${gap > 0 ? `**+${gap}**` : '✓'} |`);
  }

  // detail blocks for under-covered stages
  for (const stage of plan.stages || []) {
    const lo = stage.sourceStartIndex, hi = stage.sourceEndIndex;
    const major = allEvents.filter(e => e.si.some(i => i >= lo && i <= hi) && (e.isMajor || e.isClimax)).sort((a, b) => a.si[0] - b.si[0]);
    const cur = (await readJson(join(stageDir, `${stage.id}.json`))).scenario?.events || [];
    if (major.length <= cur.length) continue;
    lines.push(`\n### ${stage.id}（${stage.title}）缺口明细`);
    lines.push(`现有事件：${cur.map(e => e.name).join('、') || '（无）'}`);
    lines.push('抽取的高潮/重大事件（按章节顺序）：');
    for (const e of major) lines.push(`- [si ${e.si.join(',')}]${e.isClimax ? ' **[高潮]**' : ''} ${e.name}`);
  }
}

const out = join(generatedRoot, 'character-canon', 'event-coverage-audit.md');
await writeFile(out, lines.join('\n') + '\n');
console.log(`Wrote ${out}`);
