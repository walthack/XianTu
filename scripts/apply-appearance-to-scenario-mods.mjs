#!/usr/bin/env node

// 把 <book>.appearance-draft.json 的原文外貌投影进 stage canon.characters[].profile.appearance。
// 策略：用 epub 抽取版覆盖（用户审过的统一原文版更丰富）；但跳过"原文未明确/未检索到"的空值，
// 不拿空白洗掉既有好数据。仅按角色名匹配。bodyFeatures 已被 appearance 段落综合，不单独落。
//
// Usage: node scripts/apply-appearance-to-scenario-mods.mjs [book...] [--dry-run] [--fill-only]

import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const fillOnly = argv.includes('--fill-only'); // 补空不覆盖
const bookArgs = argv.filter(a => !a.startsWith('--'));
const allBooks = ['qingyu', 'yunlong', 'yange'];
const books = allBooks.filter(b => bookArgs.length === 0 || bookArgs.includes(b));

const UNSET = v => !v || v === '原作未载' || v === '未知' || v === '无' || v === '未载';
const BLANK_DRAFT = v => !v || /原文未明确|未检索/.test(v);
async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

for (const book of books) {
  // 读女性 draft + 男性 male-draft + 补充 extra，合并按名字取外貌。
  const byName = new Map();
  let any = false;
  for (const suffix of ['appearance-draft', 'appearance-male-draft', 'appearance-extra']) {
    const p = join(generatedRoot, 'character-canon', `${book}.${suffix}.json`);
    if (!existsSync(p)) continue;
    any = true;
    for (const c of (await readJson(p)).characters || []) if (!BLANK_DRAFT(c.appearance) && !byName.has(c.name)) byName.set(c.name, c.appearance);
  }
  if (!any) { console.log(`${book}: 无 appearance 草稿，跳过`); continue; }
  const stageDir = join(generatedRoot, book, 'stages');

  if (!dryRun) {
    const backup = join(generatedRoot, book, 'stages-pre-appearance-backup');
    if (existsSync(backup)) await rm(backup, { recursive: true });
    await cp(stageDir, backup, { recursive: true });
  }

  let applied = 0, skipped = 0;
  for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
    const mod = await readJson(join(stageDir, f));
    let perStage = 0;
    for (const c of mod.canon?.characters || []) {
      const app = byName.get(c.name);
      if (!app) continue;
      const profile = c.profile || (c.profile = {});
      if (fillOnly && !UNSET(profile.appearance)) { skipped += 1; continue; }
      if (profile.appearance === app) continue;
      profile.appearance = app;
      perStage += 1;
    }
    if (perStage) {
      if (!dryRun) await writeFile(join(stageDir, f), `${JSON.stringify(mod, null, 2)}\n`);
      applied += perStage;
      console.log(`  ${mod.manifest?.id}: +外貌 ${perStage}`);
    }
  }
  console.log(`${book}: 投影外貌 ${applied} 处${fillOnly ? `（补空模式，跳过已有 ${skipped}）` : '（覆盖模式）'}，draft 有效女性 ${byName.size}`);
}
console.log(dryRun ? 'DRY RUN — 未写文件。' : '外貌已投影到 stage profile.appearance。');
