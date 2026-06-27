#!/usr/bin/env node

// Normalize XianTu extraction sourceIndex numbering.
// Some extraction batches reset sourceIndex to a local 1..N range instead of
// continuing the global, contiguous sequence. Chapter headings are contiguous
// across the boundary, so the correct global index is deterministic:
//   offset = (prevGlobalHi + 1) - batchLocalMin   (applied when batchLocalMin <= prevGlobalHi)
// All index-bearing fields in a reset batch are shifted by that offset.
// Idempotent: after normalization no batch is a reset, so re-runs apply offset 0.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const books = ['qingyu', 'yunlong', 'yange'];
const dryRun = process.argv.includes('--dry-run');

function shiftBatch(batch, offset) {
  for (const ref of batch.sourceRange || []) ref.sourceIndex += offset;
  for (const event of batch.events || []) {
    if (!event || typeof event !== 'object') continue;
    event.sourceIndices = (event.sourceIndices || []).map(i => i + offset);
  }
  for (const state of batch.characterStates || []) {
    if (Number.isFinite(state.firstSeenSourceIndex)) state.firstSeenSourceIndex += offset;
    if (Number.isFinite(state.lastSeenSourceIndex)) state.lastSeenSourceIndex += offset;
  }
  for (const fact of batch.contentFacts || []) {
    if (Number.isFinite(fact.acquiredAtSourceIndex)) fact.acquiredAtSourceIndex += offset;
  }
  for (const entry of batch.candidateStageEntries || []) {
    if (Number.isFinite(entry.afterSourceIndex)) entry.afterSourceIndex += offset;
    if (Number.isFinite(entry.beforeSourceIndex)) entry.beforeSourceIndex += offset;
  }
}

function batchMaxIndex(batch) {
  let max = 0;
  for (const ref of batch.sourceRange || []) max = Math.max(max, ref.sourceIndex);
  for (const event of batch.events || []) for (const i of event.sourceIndices || []) max = Math.max(max, i);
  return max;
}

for (const book of books) {
  const dir = join(generatedRoot, book, 'extraction');
  const names = (await readdir(dir)).filter(n => n.endsWith('.json'))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] || 0) - Number(b.match(/\d+/)?.[0] || 0));
  let prevHi = 0;
  let fixed = 0;
  for (const name of names) {
    const path = join(dir, name);
    const batch = JSON.parse(await readFile(path, 'utf8'));
    const localMin = Math.min(...(batch.sourceRange || []).map(r => r.sourceIndex));
    let offset = 0;
    if (localMin <= prevHi) {
      offset = (prevHi + 1) - localMin;
      shiftBatch(batch, offset);
      fixed += 1;
      console.log(`${book}/${name}: reset detected (local ${localMin}) -> offset +${offset} -> global ${localMin + offset}..${batchMaxIndex(batch)}`);
      if (!dryRun) await writeFile(path, JSON.stringify(batch, null, 2));
    }
    prevHi = Math.max(prevHi, batchMaxIndex(batch));
  }
  console.log(`${book}: ${fixed} batches normalized, final global max=${prevHi}`);
}
console.log(dryRun ? 'DRY RUN — no files written.' : 'Normalization written.');
