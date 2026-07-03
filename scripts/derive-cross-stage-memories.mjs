#!/usr/bin/env node
// 跨关长期记忆·方案A：从各 stage 的关键剧情事件反推「角色经历过什么」，
// 写进角色卡 staticProfile.crossStageMemories = [{bookRank,label,text}]。
// 投影时（apply/resolver buildNotes）只给**早于当前关卡所属书**的条目 →【历程】note，
// 治「小紫到云龙/燕歌不认识王哲谢艺」类跨本失忆；不泄露未来（本书内/后书不注入）。
// 默认 dry-run；--apply 写卡。用法：node scripts/derive-cross-stage-memories.mjs [--apply]
import fs from 'node:fs';
import { join, resolve } from 'node:path';

const APPLY = process.argv.includes('--apply');
const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const BOOKS = [
  { dir: 'qingyu', prefix: 'lcq', rank: 0, label: '清羽篇' },
  { dir: 'yunlong', prefix: 'lyl', rank: 1, label: '云龙篇' },
  { dir: 'yange', prefix: 'lyg', rank: 2, label: '燕歌篇' },
];
const isCritical = (e) => e.critical !== undefined ? e.critical : Boolean(e.axisBeat || e.axisId || typeof e.axisSeq === 'number');

// 1) 扫 stage：每角色的 关键事件足迹 + 在场书
const footprints = new Map(); // name -> [{rank,label,event,co:[names]}]
const presence = new Map();   // name -> Set(rank)
for (const book of BOOKS) {
  const dir = join(gen, book.dir, 'stages');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.endsWith('.uncertainties.json')).sort();
  for (const f of files) {
    const m = JSON.parse(fs.readFileSync(join(dir, f), 'utf8'));
    const idName = new Map((m.canon.characters || []).map(c => [c.id, c.name]));
    for (const c of m.canon.characters || []) {
      if (!presence.has(c.name)) presence.set(c.name, new Set());
      presence.get(c.name).add(book.rank);
    }
    for (const e of (m.scenario?.events) || []) {
      if (!isCritical(e) || !e.name) continue;
      const names = (e.relatedCharacterIds || []).map(id => idName.get(id)).filter(Boolean);
      for (const name of names) {
        if (!footprints.has(name)) footprints.set(name, []);
        const co = names.filter(n => n !== name).slice(0, 3);
        footprints.get(name).push({ rank: book.rank, label: book.label, event: e.name, co });
      }
    }
  }
}

// 2) 组装 crossStageMemories：只给「后书仍在场」的角色，且只收其更早书的足迹
const memories = new Map(); // name -> [{bookRank,label,text}]
for (const [name, prints] of footprints) {
  const ranks = presence.get(name) || new Set();
  const maxRank = Math.max(...ranks);
  const byBook = new Map();
  for (const p of prints) {
    if (p.rank >= maxRank) continue; // 只记早于其最晚在场书的经历
    if (!byBook.has(p.rank)) byBook.set(p.rank, { label: p.label, items: [] });
    byBook.get(p.rank).items.push(p);
  }
  const entries = [];
  for (const [rank, { label, items }] of [...byBook.entries()].sort((a, b) => a[0] - b[0])) {
    // 每书取首尾各2件（开端+收束最有记忆锚点价值），去重事件名
    const seen = new Set(); const picked = [];
    for (const p of [...items.slice(0, 2), ...items.slice(-2)]) {
      if (seen.has(p.event)) continue; seen.add(p.event); picked.push(p);
    }
    const text = picked.map(p => p.co.length ? `${p.event}（与${p.co.join('、')}）` : p.event).join('；');
    if (text) entries.push({ bookRank: rank, label, text: `亲历：${text}` });
  }
  if (entries.length) memories.set(name, entries);
}
console.log(`可写跨本记忆的角色: ${memories.size}`);
for (const n of ['小紫', '程宗扬', '乐明珠', '殇侯', '凝羽']) {
  if (memories.has(n)) console.log(`  [${n}]`, JSON.stringify(memories.get(n)));
}

// 3) 写卡
if (APPLY) {
  let wrote = 0;
  for (const cf of ['character-cards-v3.json', 'qingyu.character-cards-v3.json', 'yunlong.character-cards-v3.json', 'yange.character-cards-v3.json']) {
    const p = join(gen, 'character-canon', cf);
    if (!fs.existsSync(p)) continue;
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    let changed = false;
    for (const c of d.characters) {
      const mem = memories.get(c.canonicalName);
      if (!mem) continue;
      if (JSON.stringify(c.staticProfile.crossStageMemories || null) !== JSON.stringify(mem)) {
        c.staticProfile.crossStageMemories = mem; changed = true; if (cf === 'character-cards-v3.json') wrote++;
      }
    }
    if (changed) fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
  }
  console.log(`已写入 ${wrote} 个角色卡（combined）+ 分卷同步`);
} else {
  console.log('(DRY-RUN，--apply 写卡)');
}
