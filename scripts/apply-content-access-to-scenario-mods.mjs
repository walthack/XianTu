#!/usr/bin/env node

// Roadmap #4: lock exclusive content. For every skill/technique/item the novel marks
// as exclusive (extraction contentFacts.exclusive), emit a rules.contentAccess rule so
// runtime canonGuard prevents others/the player from acquiring it (生死根/九阳神功/凤凰宝典…).
// Deterministic. 补空不覆盖 existing rules. allowedCharacterIds must resolve to canon chars.
//
// Usage: node scripts/apply-content-access-to-scenario-mods.mjs [book...] [--dry-run]

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const bookArgs = argv.filter(a => !a.startsWith('--'));
const allBooks = [{ id: 'qingyu' }, { id: 'yunlong' }, { id: 'yange' }];
const books = allBooks.filter(b => bookArgs.length === 0 || bookArgs.includes(b.id));

async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

for (const book of books) {
  const exDir = join(generatedRoot, book.id, 'extraction');
  const stageDir = join(generatedRoot, book.id, 'stages');
  // exclusive contentFacts by kind:name → holders
  const excl = new Map();
  for (const f of (await readdir(exDir)).filter(n => n.endsWith('.json'))) {
    const b = await readJson(join(exDir, f));
    for (const cf of b.contentFacts || []) {
      if (!cf?.name || !cf.kind || !cf.exclusive) continue;
      const k = `${cf.kind}:${cf.name}`;
      const e = excl.get(k) || { holders: new Set() };
      for (const h of cf.holders || []) e.holders.add(String(h));
      excl.set(k, e);
    }
  }

  let added = 0;
  for (const fn of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
    const mod = await readJson(join(stageDir, fn));
    const idByName = new Map((mod.canon?.characters || []).map(c => [c.name, c.id]));
    const pid = mod.scenario?.opening?.playerCharacterId;
    mod.rules = mod.rules || { mode: 'strict' };
    const access = mod.rules.contentAccess = mod.rules.contentAccess || [];
    const have = new Set(access.map(r => r.contentId));
    let changed = false;

    const kinds = [['skills', 'skill'], ['techniques', 'technique'], ['items', 'item']];
    for (const [bucket, kind] of kinds) {
      for (const entry of mod.content?.[bucket] || []) {
        if (have.has(entry.id)) continue;
        const e = excl.get(`${kind}:${entry.name}`);
        if (!e) continue;
        const allowed = [...e.holders].map(h => idByName.get(h)).filter(Boolean);
        // also match holders that exist under a contained name (阿姬曼 vs 阿姬曼·芭娜)
        if (!allowed.length) for (const h of e.holders) for (const [nm, id] of idByName) { if (nm.includes(h) || h.includes(nm)) { allowed.push(id); break; } }
        const uniqAllowed = [...new Set(allowed)];
        if (!uniqAllowed.length) continue; // no resolvable holder in this stage → skip
        access.push({
          contentId: entry.id,
          policy: uniqAllowed.length <= 1 ? 'exclusive' : 'restricted',
          allowedCharacterIds: uniqAllowed,
          playerAllowed: false, // exclusive content not freely player-acquirable; owner (incl. protagonist) access is via allowedCharacterIds
        });
        have.add(entry.id); added += 1; changed = true;
      }
    }
    if (changed && !dryRun) await writeFile(join(stageDir, fn), JSON.stringify(mod, null, 2));
  }
  console.log(`${book.id}: 补 contentAccess 规则 ${added}`);
}
console.log(dryRun ? 'DRY RUN — 未写文件。' : '专属内容访问规则已补齐。');
