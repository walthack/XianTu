#!/usr/bin/env node

// Backfill event references after #2 character coverage.
// For each stage event, match it back to the extraction event by name and
// recompute relatedCharacterIds/relatedFactionIds/locationId against the now
// fuller canon. Only augments references (union with existing); never removes,
// never changes event structure/flags. Refs that don't resolve are skipped.
//
// Usage: node scripts/backfill-event-refs.mjs [book...] [--dry-run]

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

function nameMatcher(entities) {
  const list = entities.map(e => ({ id: e.id, names: [e.name, ...(e.aliases || [])].filter(Boolean) }));
  return raw => {
    const name = String(raw || '').trim();
    if (!name) return null;
    for (const e of list) if (e.names.some(n => n === name || n.includes(name) || name.includes(n))) return e.id;
    return null;
  };
}

for (const book of books) {
  const exDir = join(generatedRoot, book.id, 'extraction');
  const stageDir = join(generatedRoot, book.id, 'stages');
  const exEvents = new Map();
  for (const f of (await readdir(exDir)).filter(n => n.endsWith('.json'))) {
    const b = await readJson(join(exDir, f));
    for (const e of b.events || []) if (e && typeof e === 'object' && e.name && !exEvents.has(e.name)) exEvents.set(e.name, e);
  }

  let touched = 0;
  for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
    const mod = await readJson(join(stageDir, f));
    const matchChar = nameMatcher(mod.canon?.characters || []);
    const matchFaction = nameMatcher(mod.canon?.factions || []);
    const matchLoc = nameMatcher(mod.canon?.locations || []);
    let changed = false;
    for (const ev of mod.scenario?.events || []) {
      const src = exEvents.get(ev.name);
      if (!src) continue;
      const chars = [...new Set([...(ev.relatedCharacterIds || []), ...(src.participants || []).map(matchChar).filter(Boolean)])];
      const factions = [...new Set([...(ev.relatedFactionIds || []), ...(src.factions || []).map(matchFaction).filter(Boolean)])];
      const loc = ev.locationId || (src.locations || []).map(matchLoc).find(Boolean) || null;
      if (chars.length > (ev.relatedCharacterIds || []).length) { ev.relatedCharacterIds = chars; changed = true; }
      if (factions.length > (ev.relatedFactionIds || []).length) { ev.relatedFactionIds = factions; changed = true; }
      if (loc && !ev.locationId) { ev.locationId = loc; changed = true; }
    }
    if (changed) {
      if (!dryRun) await writeFile(join(stageDir, f), JSON.stringify(mod, null, 2));
      touched += 1;
    }
  }
  console.log(`${book.id}: ${touched} stage files had event refs backfilled`);
}
console.log(dryRun ? 'DRY RUN — no files written.' : 'Event refs backfilled.');
