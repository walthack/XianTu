#!/usr/bin/env node

// 落地准备①:为主轴(重建草稿)每节点 mint 稳定 axisId = <book>.<idx>.<ordinal>,生成 axis-binding.json 的 nodes 骨架。
// 非破坏:读 story-timeline.rebuild.DRAFT.json,产 axis-binding.DRAFT.json(stage/spine/if 绑定后续步骤填)。
// Usage: node scripts/mint-axis-ids.mjs [--from <timeline.json>]

import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ccDir = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'character-canon');
const fromArg = process.argv.includes('--from') ? process.argv[process.argv.indexOf('--from') + 1] : 'story-timeline.rebuild.DRAFT.json';
const src = join(ccDir, fromArg);

function run() {
  const tl = JSON.parse(readFileSync(src, 'utf8'));
  const nodes = tl.nodes || tl;
  const ordinal = new Map(); // key book|idx -> count
  const out = nodes.map(n => {
    const k = n.book + '|' + n.idx;
    const o = (ordinal.get(k) || 0) + 1; ordinal.set(k, o);
    return { axisId: `${n.book}.${n.idx}.${o}`, seq: n.seq, book: n.book, idx: n.idx, heading: n.heading, anchor: n.anchor, climax: !!n.climax, beat: n.beat };
  });
  // 撞车自检:axisId 必须唯一
  const ids = new Set(); const dup = [];
  for (const x of out) { if (ids.has(x.axisId)) dup.push(x.axisId); ids.add(x.axisId); }
  const multi = [...ordinal.entries()].filter(([, v]) => v > 1).length;

  const binding = {
    axisVersion: 'rebuild-2026-06-28',
    mintedAt: new Date().toISOString(),
    note: 'axisId=<book>.<idx>.<ordinal>。seq仅展示排序,引用键用axisId。stage/spine/if 绑定见后续步骤。',
    nodes: out,
    stageBindings: [], spineBindings: [], ifBindings: [], uncovered: [], unmatched: [],
  };
  return writeFile(join(ccDir, 'axis-binding.DRAFT.json'), JSON.stringify(binding, null, 2) + '\n').then(() => {
    console.error(`mint 完成: ${out.length} 节点 axisId | 唯一性 ${dup.length === 0 ? '✅无撞车' : '❌撞车' + dup.length} | 多事件同idx的章 ${multi} 个`);
    console.error('样例:', out.slice(0, 3).map(x => x.axisId).join(', '), '...', out.filter(x => x.idx === 122).map(x => x.axisId).join(','), '(idx122)');
  });
}
run();
