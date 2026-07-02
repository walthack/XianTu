#!/usr/bin/env node

// if 线分支校验器(Session C 首步)。校验 <book>.if-branches.json 对 axis-binding + story-spines 的一致性。
// 规则:
//  1. fork / replacementNodes[].source / reconverge(anchor) / deletedCanonNodes 的锚点必须能在 axis-binding 解析到节点。
//     解析优先 axisId(精确);仅 anchor 串时:0命中=错(不存在), >1命中=警告(歧义,应改用 axisId), 1命中=过。
//  2. reconverge.mode ∈ {anchor, spine, none, ending}。spine→spineId 必须在本书 spines;anchor→须解析;ending→须 endingType。
//  3. branchType=ending ⟺ reconverge.mode=ending。kind=protagonist_death → 必须 ending + endingType=death。
//  4. deletedCanonNodes 不得包含任一脊柱锚点(脊柱节点不可删)。
//  5. spineConstraints[].spineId 必须在本书 spines。
//
// Usage: node scripts/validate-if-branches.mjs [file1.json ...]
// 默认只扫 character-canon/{qingyu,yunlong,yange}.if-branches.json；草稿/样章请显式传路径。

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ccDir = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'character-canon');

const binding = JSON.parse(readFileSync(join(ccDir, 'axis-binding.json'), 'utf8'));
const byAxisId = new Map(binding.nodes.map(n => [n.axisId, n]));
const byAnchor = new Map(); // anchor 串 → 节点数组(可能多个)
for (const n of binding.nodes) { if (!byAnchor.has(n.anchor)) byAnchor.set(n.anchor, []); byAnchor.get(n.anchor).push(n); }

// 各书脊柱:spineId 集 + 脊柱锚点 axisId 集(不可删)
const spineIds = {}, spineAxisIds = {};
for (const bk of ['qingyu', 'yunlong', 'yange']) {
  const f = join(ccDir, `${bk}.story-spines.json`);
  if (!existsSync(f)) continue;
  const s = JSON.parse(readFileSync(f, 'utf8'));
  spineIds[bk] = new Set(s.spines.map(x => x.id));
  spineAxisIds[bk] = new Set(s.spines.flatMap(x => (x.anchors || []).map(a => a.axisId).filter(Boolean)));
}

// 解析一个锚点引用 {axisId?, anchor?} → {node?, err?, warn?}
function resolveRef(ref, label) {
  if (!ref) return { err: `${label}: 缺失` };
  if (ref.axisId) {
    const n = byAxisId.get(ref.axisId);
    return n ? { node: n } : { err: `${label}: axisId「${ref.axisId}」在主轴不存在` };
  }
  if (ref.anchor) {
    const arr = byAnchor.get(ref.anchor) || [];
    if (arr.length === 0) return { err: `${label}: 锚点「${ref.anchor}」在主轴不存在` };
    if (arr.length > 1) return { node: arr[0], warn: `${label}: 锚点「${ref.anchor}」对应${arr.length}个节点(歧义)→ 应改用 axisId 精确指定` };
    return { node: arr[0] };
  }
  return { err: `${label}: 既无 axisId 也无 anchor` };
}

function validateFile(file) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const book = data.book || 'qingyu';
  const errs = [], warns = [];
  const sIds = spineIds[book] || new Set();
  const sAxis = spineAxisIds[book] || new Set();
  for (const b of data.branches || []) {
    const tag = b.id || b.title;
    // 1. fork
    const fk = resolveRef(b.fork, `${tag}.fork`);
    if (fk.err) errs.push(fk.err); if (fk.warn) warns.push(fk.warn);
    // replacementNodes
    for (const r of b.replacementNodes || []) {
      const rr = resolveRef({ axisId: r.sourceAxisId, anchor: r.sourceAnchor }, `${tag}.replacementNode`);
      if (rr.err) errs.push(rr.err); if (rr.warn) warns.push(rr.warn);
    }
    // 2/3. reconverge
    const rc = b.reconverge || {};
    if (!['anchor', 'spine', 'none', 'ending'].includes(rc.mode)) errs.push(`${tag}.reconverge.mode「${rc.mode}」非法`);
    if (rc.mode === 'spine' && !sIds.has(rc.spineId)) errs.push(`${tag}.reconverge.spineId「${rc.spineId}」不在 ${book} 脊柱`);
    if (rc.mode === 'anchor') { const r = resolveRef(rc, `${tag}.reconverge`); if (r.err) errs.push(r.err); if (r.warn) warns.push(r.warn); }
    if (rc.mode === 'ending' && !rc.endingType) errs.push(`${tag}.reconverge=ending 缺 endingType`);
    // branchType=ending ⟺ reconverge=ending
    if ((b.branchType === 'ending') !== (rc.mode === 'ending')) errs.push(`${tag}: branchType(${b.branchType}) 与 reconverge.mode(${rc.mode}) 的 ending 不一致`);
    // protagonist_death → ending/death
    if (b.kind === 'protagonist_death' && !(rc.mode === 'ending' && rc.endingType === 'death')) errs.push(`${tag}: kind=protagonist_death 必须 reconverge=ending+endingType=death`);
    // 4. deletedCanonNodes 不含脊柱
    for (const d of b.deletedCanonNodes || []) {
      const dr = resolveRef({ axisId: d.axisId, anchor: d.anchor }, `${tag}.deletedCanonNode`);
      if (dr.err) errs.push(dr.err); else if (dr.node && sAxis.has(dr.node.axisId)) errs.push(`${tag}.deletedCanonNode「${dr.node.axisId}」是脊柱锚点,不可删`);
      if (dr.warn) warns.push(dr.warn);
    }
    // 5. spineConstraints
    for (const sc of b.spineConstraints || []) if (!sIds.has(sc.spineId)) errs.push(`${tag}.spineConstraints「${sc.spineId}」不在 ${book} 脊柱`);
  }
  return { errs, warns, n: (data.branches || []).length };
}

function run() {
  let files = process.argv.slice(2);
  if (!files.length) {
    files = ['qingyu', 'yunlong', 'yange']
      .map(book => join(ccDir, `${book}.if-branches.json`))
      .filter(existsSync);
  }
  let totalErr = 0;
  for (const f of files) {
    const { errs, warns, n } = validateFile(f);
    totalErr += errs.length;
    const st = errs.length ? `❌ ${errs.length}错` : '✅';
    console.log(`\n${st} ${basename(f)} (${n}分支)${warns.length ? ` ⚠${warns.length}警` : ''}`);
    errs.forEach(e => console.log('  ❌ ' + e));
    warns.forEach(w => console.log('  ⚠ ' + w));
  }
  console.log(`\n=== 共 ${totalErr} 错 ===`);
  process.exit(totalErr ? 1 : 0);
}
run();
