#!/usr/bin/env node
// 落地 multimodel-enrichment 提案里的 principles(人物底线) —— 仅填 principles 为空的角色，
// 且提案置信≥medium(deepseek/minimax 至少一个)。不覆盖已有底线。幂等。
// 用法：node scripts/apply-bottomline-proposals.mjs
import fs from 'node:fs';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const d = JSON.parse(fs.readFileSync(join(gen, 'character-canon/multimodel-enrichment/enrichment-proposals.json'), 'utf8'));
const rank = c => c === 'high' ? 3 : c === 'medium' ? 2 : c === 'low' ? 1 : 0;
const usable = new Map();
for (const p of d.proposals) {
  const pr = p.proposed?.principles;
  if (!Array.isArray(pr) || !pr.length) continue;
  if (Math.max(rank(p.confidence?.deepseek), rank(p.confidence?.minimax)) >= 2) usable.set(p.name, pr);
}
console.log(`可用提案(≥medium): ${usable.size}`);
let filled = 0;
for (const cf of ['character-cards-v3.json', 'qingyu.character-cards-v3.json', 'yunlong.character-cards-v3.json', 'yange.character-cards-v3.json']) {
  const p = join(gen, 'character-canon', cf); if (!fs.existsSync(p)) continue;
  const doc = JSON.parse(fs.readFileSync(p, 'utf8')); let ch = false;
  for (const c of doc.characters) {
    const sp = c.staticProfile; if (!sp) continue;
    if ((sp.principles || []).length) continue; // 不覆盖已有
    const pr = usable.get(c.canonicalName); if (!pr) continue;
    sp.principles = pr; filled++; ch = true;
  }
  if (ch) fs.writeFileSync(p, JSON.stringify(doc, null, 2) + '\n');
}
console.log(`填充底线(空→提案): ${filled} 处`);
