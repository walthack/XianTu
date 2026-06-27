#!/usr/bin/env node

// Roadmap #2: character coverage. Add important characters (villains, faction
// leaders, sect elders, key supporting cast) that are active in a stage's source
// range but missing from its canon.characters. Deterministic (no LLM): driven by
// extraction characterStates (index-fixed). A character is added only to stages
// where it is active (firstSeen<=end && lastSeen>=start), which naturally encodes
// per-stage presence. IDs reuse existing canon ids; new ones get a stable npNNN id
// persisted to a per-book id map for reuse and human reference.
//
// Usage: node scripts/augment-stage-characters.mjs [book...] [--min=3] [--dry-run]

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const minCount = Number((argv.find(a => a.startsWith('--min=')) || '').split('=')[1] || 3);
const maxAdd = Number((argv.find(a => a.startsWith('--max=')) || '').split('=')[1] || 15);
const bookArgs = argv.filter(a => !a.startsWith('--'));
const allBooks = [
  { id: 'qingyu', prefix: 'lcq' },
  { id: 'yunlong', prefix: 'lyl' },
  { id: 'yange', prefix: 'lyg' },
];
const books = allBooks.filter(b => bookArgs.length === 0 || bookArgs.includes(b.id));
const ROLE_KW = /王|侯|帝|后|将|帅|宗主|掌门|长老|首领|教御|八骏|杀手|使者|公主|太后|大侠|宗|真宗|军团|商会|护卫|侍卫长|谋士/;

async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

for (const book of books) {
  const exDir = join(generatedRoot, book.id, 'extraction');
  const stageDir = join(generatedRoot, book.id, 'stages');
  const plan = await readJson(join(generatedRoot, book.id, 'stage-plan.json'));

  // aggregate character profiles from extraction
  const byName = new Map();
  for (const f of (await readdir(exDir)).filter(n => n.endsWith('.json'))) {
    const b = await readJson(join(exDir, f));
    for (const cs of b.characterStates || []) {
      if (!cs || !cs.name) continue;
      const e = byName.get(cs.name) || { name: cs.name, count: 0, first: Infinity, last: 0, intervals: [], roles: [], aliveStates: [] };
      e.count += 1;
      const fi = cs.firstSeenSourceIndex ?? cs.lastSeenSourceIndex;
      const la = cs.lastSeenSourceIndex ?? cs.firstSeenSourceIndex;
      if (Number.isFinite(fi) && Number.isFinite(la)) {
        e.first = Math.min(e.first, fi);
        e.last = Math.max(e.last, la);
        e.intervals.push([Math.min(fi, la), Math.max(fi, la)]);
      }
      if (cs.role) e.roles.push(cs.role);
      if (cs.aliveState) e.aliveStates.push(cs.aliveState);
      byName.set(cs.name, e);
    }
  }
  const important = [...byName.values()].filter(e => e.count >= minCount || e.roles.some(r => ROLE_KW.test(r)));

  // load all current stage files + collect existing name->id
  const stageFiles = (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'));
  const mods = new Map();
  const nameToId = new Map();
  for (const f of stageFiles) {
    const mod = await readJson(join(stageDir, f));
    mods.set(f, mod);
    for (const c of mod.canon?.characters || []) if (c.name && !nameToId.has(c.name)) nameToId.set(c.name, c.id);
  }

  // id map (persisted): reuse existing, assign npNNN to new ones in deterministic order
  const idMapPath = join(generatedRoot, 'character-canon', `${book.id}.character-id-map.json`);
  const idMap = existsSync(idMapPath) ? await readJson(idMapPath) : {};
  for (const [name, id] of nameToId) idMap[name] = idMap[name] || { id, role: '' };
  let seq = Object.values(idMap).filter(v => /\.np\d+$/.test(v.id)).length;
  const longestRole = e => e.roles.slice().sort((a, b) => b.length - a.length)[0] || '';
  for (const e of [...important].sort((a, b) => (a.first - b.first) || a.name.localeCompare(b.name))) {
    if (!idMap[e.name]) {
      seq += 1;
      idMap[e.name] = { id: `${book.prefix}.character.np${String(seq).padStart(3, '0')}`, role: longestRole(e) };
    } else if (!idMap[e.name].role) {
      idMap[e.name].role = longestRole(e);
    }
  }
  if (!dryRun) await writeFile(idMapPath, JSON.stringify(idMap, null, 2));

  let added = 0;
  const perStage = [];
  for (const st of plan.stages) {
    const f = `${st.id}.json`;
    const mod = mods.get(f);
    if (!mod) continue;
    const lo = st.sourceStartIndex, hi = st.sourceEndIndex;
    const have = new Set((mod.canon?.characters || []).map(c => c.name));
    // "in this stage" = a single characterState interval overlaps the stage range (precise),
    // not the global first/last (which would pull in every recurring protagonist).
    const active = important
      .filter(e => !have.has(e.name) && e.intervals.some(([a, b]) => a <= hi && b >= lo))
      .sort((a, b) => b.count - a.count)
      .slice(0, maxAdd);
    const newChars = active.map(e => {
      const role = longestRole(e) || `${book.id}配角`;
      const ch = { id: idMap[e.name].id, name: e.name, role, description: role };
      return ch;
    });
    if (newChars.length) {
      mod.canon = mod.canon || {};
      mod.canon.characters = [...(mod.canon.characters || []), ...newChars];
      if (!dryRun) await writeFile(join(stageDir, f), JSON.stringify(mod, null, 2));
      added += newChars.length;
    }
    perStage.push(`  ${st.id}: +${newChars.length} (canon ${have.size}->${have.size + newChars.length})`);
  }
  console.log(`\n${book.id}: important=${important.length} added=${added}`);
  perStage.forEach(l => console.log(l));
}
console.log(dryRun ? '\nDRY RUN — no files written.' : '\nCharacters augmented.');
