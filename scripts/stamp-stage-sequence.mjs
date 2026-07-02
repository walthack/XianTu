#!/usr/bin/env node

// Stamp prev/next stage metadata onto the generated Liuchao stage mods.
// This is prompt-level continuity metadata only; it does not auto-switch saves
// between stage mods.
//
// Usage: node scripts/stamp-stage-sequence.mjs

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const books = ['qingyu', 'yunlong', 'yange'];

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const stages = [];
for (const book of books) {
  const stageDir = join(generatedRoot, book, 'stages');
  for (const file of (await readdir(stageDir)).filter(name => name.endsWith('.json') && !name.endsWith('.uncertainties.json'))) {
    const path = join(stageDir, file);
    const mod = await readJson(path);
    stages.push({
      book,
      path,
      id: mod.manifest.id,
      name: mod.manifest.name,
      axisOrder: mod.manifest.axisOrder,
      axisSeqLo: mod.manifest.axisSeqLo,
      axisSeqHi: mod.manifest.axisSeqHi,
      mod,
    });
  }
}

stages.sort((a, b) => {
  const bookDelta = books.indexOf(a.book) - books.indexOf(b.book);
  if (bookDelta !== 0) return bookDelta;
  const aOrder = typeof a.axisOrder === 'number' ? a.axisOrder : Number.MAX_SAFE_INTEGER;
  const bOrder = typeof b.axisOrder === 'number' ? b.axisOrder : Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;
  const aSeq = typeof a.axisSeqLo === 'number' ? a.axisSeqLo : Number.MAX_SAFE_INTEGER;
  const bSeq = typeof b.axisSeqLo === 'number' ? b.axisSeqLo : Number.MAX_SAFE_INTEGER;
  return aSeq - bSeq;
});

let changed = 0;
for (let index = 0; index < stages.length; index += 1) {
  const current = stages[index];
  const prev = stages[index - 1] || null;
  const next = stages[index + 1] || null;
  current.mod.manifest.prevStageId = prev?.id || null;
  current.mod.manifest.prevStageName = prev?.name || null;
  current.mod.manifest.nextStageId = next?.id || null;
  current.mod.manifest.nextStageName = next?.name || null;
  await writeFile(current.path, `${JSON.stringify(current.mod, null, 2)}\n`);
  changed += 1;
}

console.log(`stamped prev/next stage metadata on ${changed} stages`);
console.log(stages.map(stage => `${stage.id} -> ${stage.mod.manifest.nextStageId || 'END'}`).join('\n'));
