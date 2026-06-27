#!/usr/bin/env node

// 轻规则投影：把 <book>.character-constraints-draft.json 里的约束型设定，作为非露骨注记
// 写进每个 stage 的 canon.characters[].profile.notes（schema 已有 notes 字段，无需改 schema）。
// 约束是角色的内在设定（功法/血脉/体质/誓约/门规），在该角色出现的所有 stage 都成立，
// 故不做时间门控。"补空不覆盖"：只追加尚不存在的注记，不删除既有 notes。
//
// Usage: node scripts/apply-character-constraints-to-scenario-mods.mjs [book...] [--dry-run]

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

function noteOf(c) {
  const head = `【${c.category || '设定约束'}】${c.rule || ''}`.trim();
  return c.consequence && c.consequence !== '未知' ? `${head}（破坏后果：${c.consequence}）` : head;
}

for (const book of books) {
  const draftPath = join(generatedRoot, 'character-canon', `${book.id}.character-constraints-draft.json`);
  if (!existsSync(draftPath)) { console.log(`${book.id}: 无 constraints draft，跳过`); continue; }
  const draft = await readJson(draftPath);
  // 草稿里同名角色可能拆成多条（不同分组各出一次）；按名字合并约束，去重。
  const byName = new Map();
  for (const c of draft.characters || []) {
    const notes = byName.get(c.name) || [];
    for (const n of (c.constraints || []).map(noteOf).filter(Boolean)) if (!notes.includes(n)) notes.push(n);
    byName.set(c.name, notes);
  }
  const stageDir = join(generatedRoot, book.id, 'stages');

  let applied = 0;
  for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
    const mod = await readJson(join(stageDir, f));
    const stageId = mod.manifest?.id;
    let perStage = 0;
    for (const ch of mod.canon?.characters || []) {
      const notes = byName.get(ch.name);
      if (!notes || !notes.length) continue;
      const profile = ch.profile || (ch.profile = {});
      const existing = Array.isArray(profile.notes) ? profile.notes : (profile.notes = []);
      for (const n of notes) {
        if (!existing.includes(n)) { existing.push(n); perStage += 1; }
      }
    }
    if (perStage) {
      if (!dryRun) await writeFile(join(stageDir, f), `${JSON.stringify(mod, null, 2)}\n`);
      applied += perStage;
      console.log(`  ${stageId}: +note ${perStage}`);
    }
  }
  console.log(`${book.id}: 共追加 ${applied} 条约束注记（draft 角色 ${byName.size}）`);
}
console.log(dryRun ? 'DRY RUN — 未写文件。' : '约束注记已投影到 stage canon.characters[].profile.notes。');
