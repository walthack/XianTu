#!/usr/bin/env node

// P1: project the deepseek/minimax character-canon profile onto each stage's
// canon.characters[].profile, so the runtime (relationships.ts / strictInitializer)
// can map it to the in-game NPC fields (外貌描述/性格特征/灵根/天赋/先天六司/记忆…).
//
// canon stores per-stage data (memoriesByStage / currentAppearanceByStage); the
// stage character.profile schema is FLAT (additionalProperties:false), so we project
// the current stage's slice. Match by character name. "补空不覆盖": only fill a
// character's profile when it doesn't already have one.
//
// Usage: node scripts/apply-character-canon-to-scenario-mods.mjs [book...] [--force] [--dry-run]

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const force = argv.includes('--force');
const bookArgs = argv.filter(a => !a.startsWith('--'));
const allBooks = [{ id: 'qingyu' }, { id: 'yunlong' }, { id: 'yange' }];
const books = allBooks.filter(b => bookArgs.length === 0 || bookArgs.includes(b.id));

async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }
const UNSET = v => !v || v === '原作未载' || v === '未知' || v === '未载';

// Build the flat, schema-valid profile for a given stage from a canon character.
function projectProfile(canonChar, stageId) {
  const cp = canonChar.profile || {};
  const profile = {};
  if (cp.appearance && !UNSET(cp.appearance)) profile.appearance = cp.appearance;
  if (Array.isArray(cp.personality) && cp.personality.length) profile.personality = cp.personality.slice(0, 6);
  if (cp.race && !UNSET(cp.race)) profile.race = cp.race;
  if (cp.origin && !UNSET(cp.origin)) profile.origin = cp.origin;
  if (cp.spiritRoot?.name && !UNSET(cp.spiritRoot.name)) {
    profile.spiritRoot = { name: cp.spiritRoot.name };
    if (cp.spiritRoot.tier && !UNSET(cp.spiritRoot.tier)) profile.spiritRoot.tier = cp.spiritRoot.tier;
    if (cp.spiritRoot.description && !UNSET(cp.spiritRoot.description)) profile.spiritRoot.description = cp.spiritRoot.description;
  }
  const talents = (cp.talents || []).filter(t => t?.name).map(t => ({ name: t.name, description: t.description || '' }));
  if (talents.length) profile.talents = talents;
  if (cp.attributes && typeof cp.attributes === 'object') {
    const a = {};
    for (const k of ['rootBone', 'spirituality', 'comprehension', 'fortune', 'charm', 'temperament']) {
      if (Number.isInteger(cp.attributes[k])) a[k] = Math.max(0, Math.min(10, cp.attributes[k]));
    }
    if (Object.keys(a).length) profile.attributes = a;
  }
  const curApp = cp.currentAppearanceByStage?.[stageId];
  if (curApp && !UNSET(curApp)) profile.currentAppearance = curApp;
  const mem = cp.memoriesByStage?.[stageId];
  if (Array.isArray(mem) && mem.length) profile.memories = mem.slice(0, 5);
  return profile;
}

for (const book of books) {
  const canonPath = join(generatedRoot, 'character-canon', book.id, `${book.id}.character-canon.json`);
  if (!existsSync(canonPath)) { console.log(`${book.id}: 无 character-canon，跳过（需先生成）`); continue; }
  const canon = await readJson(canonPath);
  const canonByName = new Map((canon.characters || []).map(c => [c.name, c]));
  const stageDir = join(generatedRoot, book.id, 'stages');

  let applied = 0;
  for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
    const mod = await readJson(join(stageDir, f));
    const stageId = mod.manifest?.id;
    let changed = false;
    let perStage = 0;
    for (const ch of mod.canon?.characters || []) {
      const canonChar = canonByName.get(ch.name);
      if (!canonChar) continue;
      if (ch.profile && !force) continue; // 补空不覆盖
      const profile = projectProfile(canonChar, stageId);
      if (Object.keys(profile).length === 0) continue;
      ch.profile = profile;
      changed = true;
      perStage += 1;
    }
    if (changed) {
      if (!dryRun) await writeFile(join(stageDir, f), JSON.stringify(mod, null, 2));
      applied += perStage;
      console.log(`  ${stageId}: +profile ${perStage} 角色`);
    }
  }
  console.log(`${book.id}: 共投影 ${applied} 个角色 profile（canon 角色 ${canonByName.size}）`);
}
console.log(dryRun ? 'DRY RUN — 未写文件。' : '角色 profile 已投影到 stage canon。');
