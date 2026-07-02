#!/usr/bin/env node

// 主轴切换后重锚脊柱:按 axis-binding 把脊柱 anchor 重新解析到新 seq+axisId。
// qingyu 4 锚点(idx/内容有变)用 remap 表;yunlong/yange 按 anchor 串匹配(只 seq 移位)。
// Usage: node scripts/reanchor-spines.mjs

import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ccDir = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'character-canon');
const binding = JSON.parse(readFileSync(join(ccDir, 'axis-binding.json'), 'utf8'));
const byAnchor = new Map(binding.nodes.map(n => [n.anchor, n]));
const byAxisId = new Map(binding.nodes.map(n => [n.axisId, n]));

// qingyu 脊柱锚点:旧 anchor 串 → 新 axisId(已人工核内容)
const REMAP = {
  '六朝清羽记·#6·第5章·师帅': 'qingyu.10.1',
  '六朝清羽记·#122·第120章·殇侯': 'qingyu.122.2',
  '六朝清羽记·#241·第237章·雪战': 'qingyu.241.1',
  '六朝清羽记·#287·第282章·刺客': 'qingyu.292.1',
};

async function run() {
  for (const book of ['qingyu', 'yunlong', 'yange']) {
    const f = join(ccDir, `${book}.story-spines.json`);
    const data = JSON.parse(await readFile(f, 'utf8'));
    const unmatched = [];
    for (const sp of data.spines) {
      for (const a of sp.anchors || []) {
        let node = REMAP[a.anchor] ? byAxisId.get(REMAP[a.anchor])
          : (a.axisId && byAxisId.get(a.axisId)) || byAnchor.get(a.anchor);
        if (!node) { unmatched.push(`${sp.id}:${a.anchor}`); continue; }
        a.axisId = node.axisId; a.seq = node.seq; a.anchor = node.anchor;
      }
    }
    data.axisBound = binding.axisVersion;
    await writeFile(f, JSON.stringify(data, null, 2) + '\n');
    console.error(`${book}: 重锚完成${unmatched.length ? ' ⚠未匹配 ' + unmatched.join(', ') : ' ✅'}`);
    for (const sp of data.spines) for (const a of sp.anchors || [])
      console.error(`   ${sp.id}: ${a.axisId} seq#${a.seq} ${a.anchor}`);
  }
}
run();
