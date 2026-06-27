#!/usr/bin/env node

// 扫描 18 个 stage mod，列出"在其所有出场关卡里都缺外貌"的角色（去重到每书唯一角色）。
// 按 性别(女→男→未知) + 出场关卡数(重要度) 排序，供日后有原文时批量补。
// 输出 character-canon/missing-appearance.md。不改任何 mod。

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const books = [
  { id: 'qingyu', title: '六朝清羽记' },
  { id: 'yunlong', title: '六朝云龙吟' },
  { id: 'yange', title: '六朝燕歌行' },
];
const UNSET = v => !v || v === '原作未载' || v === '未知' || v === '无' || v === '未载';

async function run() {
  const lines = ['# 仙途 · 缺角色外貌清单（待原文批量补）', '', '> 列出在其全部出场关卡里都无外貌的角色，按书 → 性别(女优先) → 出场关卡数(重要度)排序。有原文后按此逐个补。', ''];
  let totalMissing = 0, femMissing = 0;
  for (const book of books) {
    const stageDir = join(generatedRoot, book.id, 'stages');
    const agg = new Map(); // name -> {gender, roles:Set, stages:[], hasAppAnywhere}
    for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const mod = JSON.parse(await readFile(join(stageDir, f), 'utf8'));
      const stageId = mod.manifest?.id || f;
      for (const c of mod.canon?.characters || []) {
        const a = agg.get(c.name) || { gender: '', roles: new Set(), stages: [], hasApp: false };
        const g = c.gender || c.profile?.gender;
        if (g && !a.gender) a.gender = g;
        if (c.role) a.roles.add(c.role);
        a.stages.push(stageId);
        if (!UNSET(c.profile?.appearance)) a.hasApp = true;
        agg.set(c.name, a);
      }
    }
    const missing = [...agg.entries()]
      .filter(([, a]) => !a.hasApp)
      .map(([name, a]) => ({ name, gender: a.gender || '未知', roles: [...a.roles].join('/'), n: a.stages.length, stages: a.stages }))
      .sort((x, y) => {
        const rank = g => (g === '女' ? 0 : g === '男' ? 1 : 2);
        return rank(x.gender) - rank(y.gender) || y.n - x.n;
      });
    const fem = missing.filter(m => m.gender === '女');
    totalMissing += missing.length;
    femMissing += fem.length;
    lines.push(`## 《${book.title}》 — 缺外貌 ${missing.length} 人（女 ${fem.length}）`, '');
    let lastG = '';
    for (const m of missing) {
      if (m.gender !== lastG) { lines.push(`**【${m.gender}】**`, ''); lastG = m.gender; }
      lines.push(`- ${m.name}（${m.roles || '—'}）· 出场 ${m.n} 关：${m.stages.join(', ')}`);
    }
    lines.push('');
  }
  lines.splice(3, 0, `统计：缺外貌唯一角色共 **${totalMissing}** 人，其中女性 **${femMissing}** 人。`, '');
  const out = join(generatedRoot, 'character-canon', 'missing-appearance.md');
  await writeFile(out, `${lines.join('\n')}\n`);
  console.log(`写入 ${out} — 缺外貌 ${totalMissing} 人（女 ${femMissing}）`);
}

run().catch(err => { console.error(err); process.exit(1); });
