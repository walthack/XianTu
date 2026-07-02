#!/usr/bin/env node

// 主轴重建后,把 qingyu if 线样章(旧seq/anchor)重锚到新主轴 axisId(按内容已人工核)。
// 产正式 character-canon/qingyu.if-branches.json + 同步会话副本。Usage: node scripts/reanchor-if-branches.mjs

import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ccDir = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'character-canon');
const binding = JSON.parse(readFileSync(join(ccDir, 'axis-binding.json'), 'utf8'));
const byAxisId = new Map(binding.nodes.map(n => [n.axisId, n]));
const ref = (axisId) => { const n = byAxisId.get(axisId); if (!n) throw new Error('axisId 不存在: ' + axisId); return { axisId, seq: n.seq, anchor: n.anchor }; };

// 每条分支:fork / replacement / deleted 的新 axisId(已按内容核对新主轴)
const PLAN = {
  'lcq.if_xiaozi_spares_mother': { fork: 'qingyu.120.1', replacement: ['qingyu.120.1'] },        // 小紫弑母→第118章·弑亲
  'lcq.if_sudaji_slain_mochou': { fork: 'qingyu.167.1', replacement: ['qingyu.167.1'], deleted: ['qingyu.194.2'] }, // 苏妲己伏击(掌誓) / 删:小魏死+坠江(如梦幻泡)
  'lcq.if_xieyi_longrest': { fork: 'qingyu.116.1', replacement: ['qingyu.116.1'] },               // 谢艺被闪电坠落→第114章·围猎
  'lcq.if_mochou_protagonist_fall': { fork: 'qingyu.167.1', replacement: ['qingyu.167.1'] },       // 萧遥逸没救→主角死(同伏击点)
};

async function run() {
  const src = join(ccDir, 'qingyu.if-branches.SAMPLE.json'); // 工作目录现有样章(旧schema v1) — 改用会话v3
  const v3 = '/Users/clawbot/Projects/XianTu/if-branches-sample/qingyu.if-branches.v3.json';
  const data = JSON.parse(readFileSync(v3, 'utf8'));
  data.axisVersion = binding.axisVersion;
  for (const b of data.branches) {
    const p = PLAN[b.id];
    if (!p) { console.error('⚠ 无PLAN,跳过:', b.id); continue; }
    if (b.fork && p.fork) { const r = ref(p.fork); b.fork.axisId = r.axisId; b.fork.seq = r.seq; b.fork.anchor = r.anchor; }
    if (b.replacementNodes && p.replacement) b.replacementNodes.forEach((rn, i) => { if (p.replacement[i]) { const r = ref(p.replacement[i]); rn.sourceAxisId = r.axisId; rn.sourceSeq = r.seq; rn.sourceAnchor = r.anchor; } });
    if (p.deleted) b.deletedCanonNodes = p.deleted.map(a => { const r = ref(a); return { axisId: r.axisId, seq: r.seq, anchor: r.anchor, reason: '苏妲己出局,该高潮连带不发生' }; });
    console.error(`✅ ${b.id}: fork→${b.fork?.axisId}${p.deleted ? ' deleted→' + p.deleted.join(',') : ''}`);
  }
  const out = join(ccDir, 'qingyu.if-branches.json');
  await writeFile(out, JSON.stringify(data, null, 2) + '\n');
  await writeFile('/Users/clawbot/Projects/XianTu/if-branches-sample/qingyu.if-branches.json', JSON.stringify(data, null, 2) + '\n');
  console.error('\n产出: ' + out + ' + 会话副本');
}
run();
