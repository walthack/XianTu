#!/usr/bin/env node

// Mark events that were reviewed by Claude and intentionally left without an
// axis anchor. This prevents future audits from treating them as accidental
// omissions while keeping axisId null.
//
// Usage: node scripts/apply-axis-no-anchor-review.mjs

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');

const reviewedNoAnchorIds = new Set([
  'liuchao.event.you_chan_meeting',
  'liuchao.event.xue_sun_meeting',
  'liuchao.event.cold_poison_mystery',
  'liuchao.event.black_sea_approach',
  'liuchao.event.final_preparations',
  'lyl.event.yin_fulan_aid',
  'lyl.event.plan_counterattack',
  'lyl.event.pan_jinlian_ambush',
  'lyl.event.yin_yang_counter',
  'lyl.event.decide_yin_fulan_fate',
  'liuchao.event.enter_taiquan',
  'liuchao.event.reconnoiter',
  'liuchao.event.du_zong_raid',
  'liuchao.event.fruit_conflict',
  'liuchao.event.escape_taiquan',
  'lyg.event.jia_wenhe_plan',
]);

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

let touchedFiles = 0;
let markedEvents = 0;
for (const book of ['qingyu', 'yunlong', 'yange']) {
  const stageDir = join(generatedRoot, book, 'stages');
  for (const file of (await readdir(stageDir)).filter(name => name.endsWith('.json') && !name.endsWith('.uncertainties.json'))) {
    const path = join(stageDir, file);
    const mod = await readJson(path);
    let changed = false;
    for (const event of mod.scenario?.events || []) {
      if (!reviewedNoAnchorIds.has(event.id)) continue;
      event.axisId = null;
      event.axisMethod = 'reviewed-no-anchor';
      delete event.axisSeq;
      delete event.axisAnchor;
      delete event.axisBeat;
      changed = true;
      markedEvents++;
    }
    if (changed) {
      await writeFile(path, `${JSON.stringify(mod, null, 2)}\n`);
      touchedFiles++;
    }
  }
}

console.log(`marked ${markedEvents} reviewed no-anchor events in ${touchedFiles} stage files`);
