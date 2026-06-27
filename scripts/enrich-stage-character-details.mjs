#!/usr/bin/env node

// Enrich stage characters with skills / techniques / items derived from extraction
// contentFacts (which carry holders), so the in-game NPC shows correct 技能/功法/背包.
// Deterministic (no LLM). For each stage character, find contentFacts whose holders
// include them, import the skill/technique/item into the stage's top-level content
// (reusing an existing same-name id, else minting a stable npNNN id), and union the
// id into the character's skillIds / techniqueIds / itemIds (never removes existing).
//
// Usage: node scripts/enrich-stage-character-details.mjs [book...] [--dry-run]

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const bookArgs = argv.filter(a => !a.startsWith('--'));
const allBooks = [{ id: 'qingyu', prefix: 'lcq' }, { id: 'yunlong', prefix: 'lyl' }, { id: 'yange', prefix: 'lyg' }];
const books = allBooks.filter(b => bookArgs.length === 0 || bookArgs.includes(b.id));

async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

function itemType(name, fact) {
  const s = `${name} ${fact || ''}`;
  if (/冠|甲|盾|袍|铠|衣|靴|护|帽|面具|束胸|绡/.test(s)) return 'armor';
  if (/剑|刀|弓|枪|匕首|锤|戟|鞭|弩|斧|镖|针/.test(s)) return 'weapon';
  if (/丹|药|散|丸|符|酒|水|食/.test(s)) return 'consumable';
  if (/矿|石|材|皮|骨|血|草|木|铁|玉/.test(s)) return 'material';
  return 'other';
}
const slug = (prefix, kind, n) => `${prefix}.${kind}.np${String(n).padStart(3, '0')}`;

for (const book of books) {
  const exDir = join(generatedRoot, book.id, 'extraction');
  const stageDir = join(generatedRoot, book.id, 'stages');

  // aggregate contentFacts by kind+name
  const facts = new Map();
  for (const f of (await readdir(exDir)).filter(n => n.endsWith('.json'))) {
    const b = await readJson(join(exDir, f));
    for (const cf of b.contentFacts || []) {
      if (!cf?.name || !cf.kind) continue;
      // skip extraction noise mislabeled as content (境界/状态/修为 phrases, not real 技能/物品)
      if (/级修为|第[一二三四五六七八九十\d]+级|境界|修为|突破|重伤|平庸|身手|阶段|^真阳$/.test(cf.name)) continue;
      const key = `${cf.kind}:${cf.name}`;
      const e = facts.get(key) || { kind: cf.kind, name: cf.name, holders: new Set(), fact: cf.fact || '', acquiredAt: Infinity };
      for (const h of cf.holders || []) e.holders.add(String(h));
      if (Number.isFinite(cf.acquiredAtSourceIndex)) e.acquiredAt = Math.min(e.acquiredAt, cf.acquiredAtSourceIndex);
      facts.set(key, e);
    }
  }

  // 阶段持有过滤：只给角色配该 stage 剧情时间点(sourceEndIndex)之前已获得的内容，
  // 不把后期才获得的专属道具(珊瑚匕首 acquiredAt=76、妖瓶=249 等)提前发放到开局 stage。
  const plan = await readJson(join(generatedRoot, book.id, 'stage-plan.json'));
  const stageEnd = new Map((plan.stages || []).map(s => [s.id, s.sourceEndIndex]));

  let enriched = 0;
  for (const fn of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
    const mod = await readJson(join(stageDir, fn));
    mod.content = mod.content || {};
    const bucket = { skill: (mod.content.skills = mod.content.skills || []), technique: (mod.content.techniques = mod.content.techniques || []), item: (mod.content.items = mod.content.items || []) };
    const byName = { skill: new Map(), technique: new Map(), item: new Map() };
    for (const k of ['skill', 'technique', 'item']) for (const e of bucket[k]) byName[k].set(e.name, e.id);
    let seq = [...bucket.skill, ...bucket.technique, ...bucket.item].filter(e => /\.np\d+$/.test(e.id)).length;

    const charNames = new Set((mod.canon?.characters || []).map(c => c.name));
    const ensureContentId = (kind, name, fact) => {
      if (byName[kind].has(name)) return byName[kind].get(name);
      seq += 1;
      const id = slug(book.prefix, kind, seq);
      const entry = kind === 'item'
        ? { id, name, type: itemType(name, fact), description: fact || name }
        : { id, name, description: fact || name };
      bucket[kind].push(entry);
      byName[kind].set(name, id);
      return id;
    };

    let changed = false;
    const endIdx = stageEnd.get(mod.manifest?.id) ?? Infinity;
    for (const ch of mod.canon?.characters || []) {
      const idField = { skill: 'skillIds', technique: 'techniqueIds', item: 'itemIds' };
      for (const e of facts.values()) {
        if (Number.isFinite(e.acquiredAt) && e.acquiredAt > endIdx) continue; // 该阶段尚未获得，不提前发放
        if (![...e.holders].some(h => h === ch.name || h.includes(ch.name) || ch.name.includes(h))) continue;
        const field = idField[e.kind];
        if (!field) continue;
        const id = ensureContentId(e.kind, e.name, e.fact);
        ch[field] = ch[field] || [];
        if (!ch[field].includes(id)) { ch[field].push(id); changed = true; enriched += 1; }
      }
    }
    void charNames;
    if (changed && !dryRun) await writeFile(join(stageDir, fn), JSON.stringify(mod, null, 2));
    if (changed) console.log(`  ${mod.manifest?.id}: 补技能/装备引用 +${enriched}`);
  }
  console.log(`${book.id}: 完成（contentFacts ${facts.size} 条）`);
}
console.log(dryRun ? 'DRY RUN — 未写文件。' : '角色技能/功法/装备已补齐。');
