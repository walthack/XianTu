#!/usr/bin/env node

// Backfill character 外貌/性格 from canon fragments (appearanceFacts/personalityFacts),
// bypassing the unstable merge step. extraction has no appearance field; the LLM extracted
// it into fragments. Only qingyu has a full merged canon, but yunlong/yange fragments DO
// carry appearanceFacts — so project those onto stage canon.characters[].profile.
// Deterministic. 补空不覆盖 (canon-projected profiles win).
//
// Usage: node scripts/enrich-profile-from-fragments.mjs [book...] [--dry-run]

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const bookArgs = argv.filter(a => !a.startsWith('--'));
const allBooks = [{ id: 'qingyu' }, { id: 'yunlong' }, { id: 'yange' }];
const books = allBooks.filter(b => bookArgs.length === 0 || bookArgs.includes(b.id));

async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }
const UNSET = v => !v || v === 'unknown' || v === '原作未载' || v === '未知';

for (const book of books) {
  const fragDir = join(generatedRoot, 'character-canon', book.id, 'fragments');
  const stageDir = join(generatedRoot, book.id, 'stages');
  if (!existsSync(fragDir)) { console.log(`${book.id}: 无 fragments，跳过`); continue; }

  // aggregate by canonicalName (and aliases) → {app:Set, pers:Set, gender}
  const byName = new Map();
  const aliasMap = new Map(); // alias → canonicalName
  for (const f of (await readdir(fragDir)).filter(n => n.endsWith('.json'))) {
    let frag; try { frag = await readJson(join(fragDir, f)); } catch { continue; }
    for (const c of frag.characters || []) {
      if (!c?.canonicalName) continue;
      const e = byName.get(c.canonicalName) || { app: new Set(), pers: new Set(), gender: '' };
      for (const a of c.appearanceFacts || []) if (a) e.app.add(a);
      for (const p of c.personalityFacts || []) if (p) e.pers.add(p);
      if (!e.gender && c.gender && !UNSET(c.gender)) e.gender = c.gender;
      byName.set(c.canonicalName, e);
      for (const al of c.aliases || []) if (al) aliasMap.set(al, c.canonicalName);
    }
  }
  const lookup = name => byName.get(name) || (aliasMap.has(name) ? byName.get(aliasMap.get(name)) : null);

  let filled = 0;
  for (const fn of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
    const mod = await readJson(join(stageDir, fn));
    let changed = false;
    for (const ch of mod.canon?.characters || []) {
      const e = lookup(ch.name);
      if (!e) continue;
      const profile = ch.profile = ch.profile || {};
      if (UNSET(profile.appearance) && e.app.size) { profile.appearance = [...e.app].join('，'); changed = true; filled += 1; }
      if (!(profile.personality?.length) && e.pers.size) { profile.personality = [...e.pers].slice(0, 6); changed = true; }
      if (UNSET(ch.gender) && e.gender) { ch.gender = e.gender; changed = true; }
    }
    if (changed && !dryRun) await writeFile(join(stageDir, fn), JSON.stringify(mod, null, 2));
  }
  console.log(`${book.id}: fragments 覆盖 ${byName.size} 角色，补外貌 ${filled} 个角色实例`);
}
console.log(dryRun ? 'DRY RUN — 未写文件。' : '外貌/性格已从 fragments 补全。');
