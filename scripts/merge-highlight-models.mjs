#!/usr/bin/env node

// 双模型对比：把 DeepSeek 与 MiniMax 的分级结果交叉匹配。
//  - 同窗 + 标题相似 → 标 consensus(双证，两模型都命中，置信最高)。
//  - MiniMax 独有且 tier S/A → 增补候选(DeepSeek 可能漏的高光)。
// 产出合并数据供工单页更新。只读，不改 stage。
//
// Usage: node scripts/merge-highlight-models.mjs

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const BOOKS = { qingyu: '六朝清羽记', yunlong: '六朝云龙吟', yange: '六朝燕歌行' };
const SEX = /阳具|献身|口含|交合|云雨|房事|鼎炉|春宫|情欲|性交|媾和|媾欢|欢好|淫辱|奸淫|裸身|裸露|处子之身|以身相酬|双修/;

function bigrams(s) {
  const t = (s || '').replace(/[^一-龥a-z0-9]/gi, '');
  const g = new Set();
  for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2));
  return g;
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
const norm = w => (w || '').replace(/\(片\d+\)/, '');

function merge(book) {
  const dp = join(gen, book, 'highlight-graded.deepseek.json');
  const mp = join(gen, book, 'highlight-graded.minimax.json');
  if (!existsSync(dp) || !existsSync(mp)) { console.log(`跳过 ${book}：缺分级文件`); return null; }
  const ds = JSON.parse(readFileSync(dp, 'utf8'));
  const mm = JSON.parse(readFileSync(mp, 'utf8'));

  // MiniMax 按窗索引，预算 bigrams
  const mmByWin = new Map();
  for (const m of mm) { m._g = bigrams((m.title || '') + (m.source || '')); const w = norm(m.window); if (!mmByWin.has(w)) mmByWin.set(w, []); mmByWin.get(w).push(m); }

  const mmMatched = new Set();
  for (const d of ds) {
    const dg = bigrams((d.title || '') + (d.source || ''));
    const cands = mmByWin.get(norm(d.window)) || [];
    let best = 0, bestM = null;
    for (const m of cands) {
      let sim = jaccard(dg, m._g);
      if (d.char && d.char === m.char) sim += 0.15; // 同角色加权
      if (sim > best) { best = sim; bestM = m; }
    }
    if (best >= 0.34 && bestM) { d.consensus = true; d.mmTitle = bestM.title; mmMatched.add(bestM); }
    else d.consensus = false;
  }

  // MiniMax 独有的高价值(S/A，非性相关) = 增补候选
  const supplements = mm.filter(m => !mmMatched.has(m) && ['S', 'A'].includes(m.tier) && !SEX.test((m.title || '') + (m.why || '')))
    .sort((a, b) => (b.pri || 0) - (a.pri || 0));

  const consensusCount = ds.filter(d => d.consensus).length;
  console.log(`${BOOKS[book]}: DeepSeek ${ds.length} 条中双证 ${consensusCount} | MiniMax 独有高价值增补 ${supplements.length}`);
  return { ds, supplements, consensusCount };
}

const result = {};
for (const b of Object.keys(BOOKS)) { const r = merge(b); if (r) result[b] = r; }
writeFileSync(join(gen, 'highlight-merged.json'), JSON.stringify(result, null, 1));
console.log('\n合并数据 → mod-kit/generated/deepseek-v4-flash/highlight-merged.json');
