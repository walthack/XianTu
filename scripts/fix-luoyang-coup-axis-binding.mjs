#!/usr/bin/env node
/**
 * R2-11M 裁定 A：修正洛都政变前夜四拍的来源标注。
 *
 * seq 890-893 原本全部挂在 `yunlong.278`（源 278 =《游宫》），但《游宫》原文结尾只是
 * 程宗扬带友通期入宫，没有任何死亡。逐章核对 EPUB 后确认这四拍分别出自
 * 源 279《弑君》与源 280《凌辱》。
 *
 * 只改 idx/heading/anchor/axisId 四个字段，不插入也不删除节点，因此全局 seq 不移动，
 * 其余书目的 axisSeq 不受影响。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const canon = 'mod-kit/generated/deepseek-v4-flash/character-canon';

/** seq → 逐章核对后的真实来源。ordinal 由 seq 顺序推出，与校验器算法一致。 */
const REMAP = new Map([
  [890, { idx: 279, heading: '弑君', axisId: 'yunlong.279.1' }],
  [891, { idx: 280, heading: '凌辱', axisId: 'yunlong.280.1' }],
  [892, { idx: 279, heading: '弑君', axisId: 'yunlong.279.2' }],
  [893, { idx: 279, heading: '弑君', axisId: 'yunlong.279.3' }],
]);

const anchorOf = target => `六朝云龙吟·#${target.idx}·${target.heading}`;

/** 旧 axisId → 新 axisId。脊柱与 if 线按 id 引用，必须同批改，否则轴引用校验会挂。 */
const ID_REMAP = new Map(
  [...REMAP.values()].map((target, index) => [`yunlong.278.${index + 1}`, target]),
);

function remapNodes(nodes, label) {
  let changed = 0;
  for (const node of nodes) {
    if (node.book !== 'yunlong') continue;
    const target = REMAP.get(node.seq);
    if (!target) continue;
    if (node.idx !== 278 && node.idx !== target.idx) {
      throw new Error(`${label} seq ${node.seq}: expected idx 278, found ${node.idx}`);
    }
    node.idx = target.idx;
    node.heading = target.heading;
    node.anchor = anchorOf(target);
    if ('axisId' in node) node.axisId = target.axisId;
    changed += 1;
  }
  if (changed !== REMAP.size) throw new Error(`${label}: remapped ${changed}, expected ${REMAP.size}`);
  return changed;
}

/** 按 seq 定位后重写 axisId/anchor：seq 不移动，所以 seq 是这轮最稳的锚。 */
function remapReferences(value) {
  if (!value || typeof value !== 'object') return 0;
  if (Array.isArray(value)) return value.reduce((total, item) => total + remapReferences(item), 0);
  let changed = 0;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string' && ID_REMAP.has(child) && /axisId$/i.test(key)) {
      const target = ID_REMAP.get(child);
      value[key] = target.axisId;
      const anchorKey = key.replace(/axisId$/i, match => (match === 'axisId' ? 'anchor' : 'Anchor'));
      if (typeof value[anchorKey] === 'string') value[anchorKey] = anchorOf(target);
      changed += 1;
    } else {
      changed += remapReferences(child);
    }
  }
  return changed;
}

for (const file of ['story-timeline.json', 'axis-binding.json']) {
  const path = join(canon, file);
  const document = JSON.parse(readFileSync(path, 'utf8'));
  remapNodes(document.nodes, file);
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`${file}: remapped ${REMAP.size} nodes`);
}

for (const file of ['yunlong.story-spines.json', 'yunlong.if-branches.json']) {
  const path = join(canon, file);
  const document = JSON.parse(readFileSync(path, 'utf8'));
  const changed = remapReferences(document);
  if (changed) writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`${file}: remapped ${changed} axis references`);
}
