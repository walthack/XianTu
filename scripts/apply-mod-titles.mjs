#!/usr/bin/env node

// 统一 18 个成品 mod 的 manifest.name 为「书名·开篇章节标题」（如 六朝清羽记·第73章·遇难）。
// 开篇章节标题取 stage-plan.sourceStartIndex 在 extraction sourceRange 里的 heading。
// qingyu heading 带「第N章·」；yunlong/yange 多数仅标题（原始抽取未存章号）。
//
// Usage: node scripts/apply-mod-titles.mjs [--apply]

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const apply = process.argv.includes('--apply');
const TITLES = { qingyu: '六朝清羽记', yunlong: '六朝云龙吟', yange: '六朝燕歌行' };

async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

async function headingMap(book) {
  const ex = join(gen, book, 'extraction');
  const im = new Map();
  for (const f of (await readdir(ex)).filter(n => /^batch-\d+\.json$/.test(n))) {
    const d = await readJson(join(ex, f));
    for (const r of d.sourceRange || []) if (!im.has(r.sourceIndex)) im.set(r.sourceIndex, r.heading);
  }
  return im;
}

async function run() {
  for (const book of Object.keys(TITLES)) {
    const sp = await readJson(join(gen, book, 'stage-plan.json'));
    const stages = Array.isArray(sp) ? sp : (sp.stages || []);
    const im = await headingMap(book);
    const startById = new Map(stages.map(s => [s.id, s.sourceStartIndex]));
    const stageDir = join(gen, book, 'stages');
    for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json')).sort()) {
      const path = join(stageDir, f);
      const mod = await readJson(path);
      const id = mod.manifest.id;
      const heading = im.get(startById.get(id)) || mod.manifest.name;
      const newName = `${TITLES[book]}·${heading}`;
      console.log(`${id}: ${JSON.stringify(mod.manifest.name)} → ${JSON.stringify(newName)}`);
      if (apply) { mod.manifest.name = newName; await writeFile(path, `${JSON.stringify(mod, null, 2)}\n`); }
    }
  }
  console.log(apply ? '\n已应用，记得重跑 sync-builtin-mods + 构建。' : '\nDRY RUN（加 --apply 写入）');
}
run().catch(e => { console.error(e); process.exit(1); });
