#!/usr/bin/env node

// 用 qingyu 重抽草稿重建主轴 qingyu 段(确定性,无LLM)。yunlong/yange 段保留原样。
// 全表重新编 seq。锚点串 idx-based 不变,仅 seq 变。产 story-timeline.rebuild.DRAFT.{json,md},不覆盖现版。
// 同时校验脊柱4锚点(idx6/122/241/287)在新版是否存在 + 报新 seq。
// Usage: node scripts/rebuild-timeline-qingyu.mjs

import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ccDir = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'character-canon');

function run() {
  const old = JSON.parse(readFileSync(join(ccDir, 'story-timeline.json'), 'utf8'));
  const oldNodes = old.nodes || old;
  const draft = JSON.parse(readFileSync(join(ccDir, 'qingyu.reextract.DRAFT.json'), 'utf8'));

  // 新 qingyu 节点：major 事件，按 sourceIndex 排
  const qj = draft.events.filter(e => e.isMajor).sort((a, b) => a.sourceIndex - b.sourceIndex)
    .map(e => ({ book: 'qingyu', bookTitle: '六朝清羽记', idx: e.sourceIndex, heading: e.heading,
      climax: !!e.isClimax, beat: e.summary,
      anchor: `六朝清羽记·#${e.sourceIndex}·${e.heading}`, participants: e.participants || [] }));

  // 保留 yunlong/yange 原节点
  const rest = oldNodes.filter(n => n.book !== 'qingyu');

  // 合并 + 重编全局 seq
  const all = [...qj, ...rest];
  all.forEach((n, i) => { n.seq = i + 1; });

  const out = { ...(old.nodes ? old : {}), generatedAt: new Date().toISOString(),
    note: 'qingyu 段用重抽草稿重建(major 185→' + qj.length + '),yunlong/yange 原样。全表重编 seq。待审切换。', nodes: all };
  // 写 json
  // md
  const lines = ['# 仙途 · 六朝三部曲线性时间线（主轴 · 重建草稿）', '',
    `> qingyu 重建 ${qj.length} 节点(旧185)。yunlong ${rest.filter(n=>n.book==='yunlong').length} / yange ${rest.filter(n=>n.book==='yange').length}。共 ${all.length}(旧1034)。`, ''];
  let curBook = '', curHead = '';
  for (const n of all) {
    if (n.book !== curBook) { lines.push(`\n## 《${n.bookTitle}》`); curBook = n.book; curHead = ''; }
    if (n.heading !== curHead) { lines.push(`### ${n.heading}`); curHead = n.heading; }
    lines.push(`- \`#${n.seq}\` 〔${n.anchor}〕${n.climax ? ' ★' : ''} ${n.beat}`);
  }

  // 脊柱锚点校验
  const spineIdx = [{ idx: 6, h: '第5章·师帅' }, { idx: 122, h: '第120章·殇侯' }, { idx: 241, h: '第237章·雪战' }, { idx: 287, h: '第282章·刺客' }];
  const report = spineIdx.map(s => {
    const hit = qj.find(n => n.idx === s.idx);
    const node = hit ? all.find(n => n.book === 'qingyu' && n.idx === s.idx) : null;
    return `  脊柱 idx#${s.idx}(${s.h}): ${hit ? '✅ 存在 → 新seq #' + node.seq + ' | beat: ' + node.beat.slice(0, 40) : '❌ 缺失!'}`;
  });

  return Promise.all([
    writeFile(join(ccDir, 'story-timeline.rebuild.DRAFT.json'), JSON.stringify(out, null, 2) + '\n'),
    writeFile(join(ccDir, 'story-timeline.rebuild.DRAFT.md'), lines.join('\n') + '\n'),
  ]).then(() => {
    console.error(`重建草稿: qingyu ${qj.length} + 其余 ${rest.length} = ${all.length} 节点`);
    console.error('脊柱锚点校验:'); report.forEach(r => console.error(r));
  });
}
run();
