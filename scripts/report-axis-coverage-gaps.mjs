#!/usr/bin/env node

// Generate a concise report of main-axis ranges not covered by the current
// generated stage mods. This is planning data for future stage creation, not a
// content generator.
//
// Usage: node scripts/report-axis-coverage-gaps.mjs

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedDir = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(generatedDir, 'character-canon');
const binding = JSON.parse(await readFile(join(canonDir, 'axis-binding.json'), 'utf8'));

const stageBooks = ['qingyu', 'yunlong', 'yange'];
const currentStages = [];
for (const book of stageBooks) {
  const stageDir = join(generatedDir, book, 'stages');
  for (const file of (await readdir(stageDir)).filter(name => name.endsWith('.json') && !name.endsWith('.uncertainties.json'))) {
    const mod = JSON.parse(await readFile(join(stageDir, file), 'utf8'));
    const { id, axisSeqLo, axisSeqHi } = mod.manifest || {};
    if (typeof axisSeqLo === 'number' && typeof axisSeqHi === 'number') {
      currentStages.push({ book, id, lo: axisSeqLo, hi: axisSeqHi });
    }
  }
}

function intervalsForBook(book) {
  return currentStages
    .filter(stage => stage.book === book)
    .map(stage => ({ lo: stage.lo, hi: stage.hi, id: stage.id }))
    .sort((a, b) => a.lo - b.lo || a.hi - b.hi);
}

function isCovered(seq, intervals) {
  return intervals.some(interval => seq >= interval.lo && seq <= interval.hi);
}

function summarizeGap(nodes) {
  const climaxCount = nodes.filter(node => node.climax).length;
  const anchors = [...new Set(nodes.map(node => node.anchor).filter(Boolean))];
  const sample = nodes
    .filter(node => node.climax)
    .concat(nodes)
    .filter((node, index, list) => list.findIndex(item => item.axisId === node.axisId) === index)
    .slice(0, 5)
    .map(node => `${node.axisId}: ${node.beat}`);
  return {
    book: nodes[0]?.book || '',
    seqLo: nodes[0]?.seq,
    seqHi: nodes[nodes.length - 1]?.seq,
    count: nodes.length,
    climaxCount,
    anchors: anchors.slice(0, 6),
    sample,
  };
}

const bookTitles = {
  qingyu: '六朝清羽记',
  yunlong: '六朝云龙吟',
  yange: '六朝燕歌行',
};

const report = [];
report.push('# 主轴覆盖盲区报告');
report.push('');
report.push('生成时间：2026-06-30');
report.push('');
report.push(`说明：按当前 ${currentStages.length} 个 stage 的 \`manifest.axisSeqLo/axisSeqHi\` 计算覆盖；未覆盖不代表需要全部补关，优先看 climax 密度和剧情跨度。`);
report.push('');

for (const book of ['qingyu', 'yunlong', 'yange']) {
  const nodes = binding.nodes.filter(node => node.book === book).sort((a, b) => a.seq - b.seq);
  const intervals = intervalsForBook(book);
  const gaps = [];
  let current = [];
  for (const node of nodes) {
    if (!isCovered(node.seq, intervals)) current.push(node);
    else if (current.length) {
      gaps.push(summarizeGap(current));
      current = [];
    }
  }
  if (current.length) gaps.push(summarizeGap(current));
  gaps.sort((a, b) => b.climaxCount - a.climaxCount || b.count - a.count);
  const covered = nodes.filter(node => isCovered(node.seq, intervals)).length;

  report.push(`## ${bookTitles[book]} (${book})`);
  report.push(`- 主轴节点：${nodes.length}`);
  report.push(`- 当前覆盖：${covered} (${Math.round(covered / nodes.length * 100)}%)`);
  report.push(`- 未覆盖：${nodes.length - covered}`);
  report.push(`- 未覆盖连续段：${gaps.length}`);
  report.push('');
  report.push('| 优先 | seq | 节点数 | 高潮数 | anchor 摘要 | 样例 beat |');
  report.push('| ---: | --- | ---: | ---: | --- | --- |');
  for (const [index, gap] of gaps.slice(0, 12).entries()) {
    const priority = gap.climaxCount > 0 ? index + 1 : '';
    const anchors = gap.anchors.join('；').replace(/\|/g, '/');
    const sample = gap.sample.join('<br>').replace(/\|/g, '/');
    report.push(`| ${priority} | #${gap.seqLo}~#${gap.seqHi} | ${gap.count} | ${gap.climaxCount} | ${anchors} | ${sample} |`);
  }
  report.push('');
}

report.push('## 建议');
report.push('- 先补高潮数高、连续跨度大的缺口；低高潮密度段可先通过当前关事件链/旁白摘要过渡。');
report.push('- 云龙的太泉/黑魔海现有 stage 与主轴候选错位，已由 Claude 二审确认为 no_anchor；后续如果要提高覆盖率，应重做这些 stage 的主轴范围或新增桥接元数据。');
report.push('- 新增关卡前，先人工批准每本前 3 个缺口是否进入内容生产。');
report.push('');

await writeFile(join(canonDir, 'axis-coverage-gaps.md'), `${report.join('\n')}\n`);
console.log(`wrote ${join(canonDir, 'axis-coverage-gaps.md')}`);
