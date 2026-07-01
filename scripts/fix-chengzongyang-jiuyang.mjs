#!/usr/bin/env node

// 修复：程宗扬「九阳神功」在多数阶段丢失。王哲身死后（几乎全程）男主都应持有。
// 策略：对每个 程宗扬 缺九阳的阶段——若 content 里已有九阳 technique/skill 实体则把其 id 补进
// 程宗扬 的 techniqueIds/skillIds；若无实体则补建一个标准九阳 technique 再引用。备份 stages-pre-jiuyang-backup。
// 用法：node scripts/fix-chengzongyang-jiuyang.mjs [--dry-run]

import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const books = ['qingyu', 'yunlong', 'yange'];
const dryRun = process.argv.includes('--dry-run');
const CANON = { id: 'liuchao.technique.jiuyang_shengong', name: '九阳神功', description: '程宗扬另一门功法，阳气通神，但导致阳亢之症。', grade: '玄品', techniqueEffects: { 修炼速度加成: 0.24, 属性加成: { 悟性: 3, 灵性: 2 } } };
const hasJ = ids => (ids || []).some(x => /jiuyang/i.test(x));
const findByName = obj => Object.entries(obj || {}).find(([, v]) => v?.name?.includes('九阳'));

let created = 0, linkedTech = 0, linkedSkill = 0, skipped = 0, noCz = 0;
const log = [];
for (const book of books) {
  const dir = join(gen, book, 'stages');
  if (!existsSync(dir)) continue;
  if (!dryRun) { const bk = join(gen, book, 'stages-pre-jiuyang-backup'); if (existsSync(bk)) await rm(bk, { recursive: true }); await cp(dir, bk, { recursive: true }); }
  for (const f of (await readdir(dir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
    const p = join(dir, f);
    const m = JSON.parse(await readFile(p, 'utf8'));
    const cz = (m.canon?.characters || []).find(c => c.name === '程宗扬');
    if (!cz) { noCz++; continue; }
    if (hasJ(cz.skillIds) || hasJ(cz.techniqueIds)) { skipped++; continue; }
    m.content = m.content || {}; m.content.techniques = m.content.techniques || {}; m.content.skills = m.content.skills || {};
    const tHit = findByName(m.content.techniques);
    const sHit = findByName(m.content.skills);
    let action;
    if (tHit) { cz.techniqueIds = [...new Set([...(cz.techniqueIds || []), tHit[1].id])]; linkedTech++; action = `link-tech ${tHit[1].id}`; }
    else if (sHit) { cz.skillIds = [...new Set([...(cz.skillIds || []), sHit[1].id])]; linkedSkill++; action = `link-skill ${sHit[1].id}`; }
    else {
      const keys = Object.keys(m.content.techniques).map(Number).filter(n => !Number.isNaN(n));
      const newKey = String(keys.length ? Math.max(...keys) + 1 : 0);
      m.content.techniques[newKey] = { ...CANON };
      cz.techniqueIds = [...new Set([...(cz.techniqueIds || []), CANON.id])];
      created++; action = `create+link ${CANON.id}`;
    }
    log.push(`${book}/${m.manifest.id}: ${action}`);
    if (!dryRun) await writeFile(p, JSON.stringify(m, null, 2) + '\n');
  }
}
console.log(log.join('\n'));
console.log(`\n${dryRun ? '(DRY) ' : ''}九阳修复：link-tech ${linkedTech}，link-skill ${linkedSkill}，create ${created}，已有跳过 ${skipped}，无程宗扬 ${noCz}。备份 stages-pre-jiuyang-backup。`);
