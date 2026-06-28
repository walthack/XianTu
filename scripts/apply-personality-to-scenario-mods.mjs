#!/usr/bin/env node

// 把 personality-consolidated.json（全本统一一套）投影进各关 canon.characters[].profile.personality。
// 主要角色（在 consolidated 里且 personality 非空）→ 覆盖（用户要「重新整理」=统一替换，非补空）。
// 不在 consolidated 的次要角色 → 不动。备份 stages-pre-personality-backup。
// Usage: node scripts/apply-personality-to-scenario-mods.mjs [book...] [--dry-run]

import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canon = join(gen, 'character-canon');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const books = ['qingyu', 'yunlong', 'yange'].filter(b => argv.filter(a => !a.startsWith('--')).length === 0 || argv.includes(b));

async function run() {
  const data = JSON.parse(await readFile(join(canon, 'personality-consolidated.json'), 'utf8'));
  const byName = new Map(data.characters.filter(c => (c.personality || []).length).map(c => [c.name, c.personality]));
  console.log(`统一 personality 角色 ${byName.size} 人`);
  let total = 0;
  const touched = new Set();
  for (const book of books) {
    const stageDir = join(gen, book, 'stages');
    if (!dryRun) { const bk = join(gen, book, 'stages-pre-personality-backup'); if (existsSync(bk)) await rm(bk, { recursive: true }); await cp(stageDir, bk, { recursive: true }); }
    for (const fn of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const mod = JSON.parse(await readFile(join(stageDir, fn), 'utf8'));
      let changed = false;
      for (const c of mod.canon?.characters || []) {
        const p = byName.get(c.name);
        if (!p) continue;
        c.profile = c.profile || {};
        const before = JSON.stringify(c.profile.personality || []);
        if (before === JSON.stringify(p)) continue;
        c.profile.personality = [...p];
        changed = true; total += 1; touched.add(c.name);
      }
      if (changed && !dryRun) await writeFile(join(stageDir, fn), `${JSON.stringify(mod, null, 2)}\n`);
    }
  }
  console.log(`覆盖 ${total} 处 profile.personality（涉及 ${touched.size} 个角色）${dryRun ? ' [DRY]' : ''}`);
  console.log(dryRun ? '' : '备份 stages-pre-personality-backup。');
}
run().catch(e => { console.error(e); process.exit(1); });
