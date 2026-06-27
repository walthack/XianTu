#!/usr/bin/env node

// 角色别名/称谓表 —— 确定性骨架(不调 LLM)。
// 来源：18 stage canon.characters 的 id→显示名(捕获同id多名,如 碧姬/碧奴 按关卡变体) +
// id-map.json 的名字 + 括号/·别名拆分(孙寿（襄城君）→孙寿/襄城君；阿姬曼·芭娜→阿姬曼/芭娜)。
// 输出 character-canon/character-alias-registry.json + .md。后续可用 DeepSeek 从原文挖更多别名补进 aliases。
//
// Usage: node scripts/build-alias-registry.mjs

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const books = [
  { id: 'qingyu', title: '六朝清羽记' },
  { id: 'yunlong', title: '六朝云龙吟' },
  { id: 'yange', title: '六朝燕歌行' },
];

async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

// 名字拆出潜在别名：括号内 + ·/• 分段。
function splitNames(name) {
  const out = new Set([name]);
  const inner = [...name.matchAll(/[（(]([^）)]+)[）)]/g)].map(m => m[1].trim());
  const bare = name.replace(/[（(][^）)]*[）)]/g, '').trim();
  for (const seg of [bare, ...inner]) for (const p of seg.split(/[·•・\/、]/).map(s => s.trim())) if (p.length >= 2) out.add(p);
  return [...out];
}

async function run() {
  // id -> { names: Map(name->count), byStage: {stageId:name}, role, books:Set }
  const reg = new Map();
  for (const book of books) {
    const stageDir = join(gen, book.id, 'stages');
    for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const m = await readJson(join(stageDir, f));
      const stageId = m.manifest?.id || f;
      for (const c of m.canon?.characters || []) {
        if (!c.id) continue;
        const r = reg.get(c.id) || { id: c.id, names: new Map(), byStage: {}, role: '', books: new Set() };
        if (c.name) { r.names.set(c.name, (r.names.get(c.name) || 0) + 1); r.byStage[stageId] = c.name; }
        if (c.role && !r.role) r.role = c.role;
        r.books.add(book.id);
        reg.set(c.id, r);
      }
    }
    // id-map 里的名字(可能含 stage 未出现的)
    const mapPath = join(canonDir, `${book.id}.character-id-map.json`);
    if (existsSync(mapPath)) {
      const idmap = await readJson(mapPath);
      for (const [name, v] of Object.entries(idmap)) {
        if (!v?.id) continue;
        const r = reg.get(v.id) || { id: v.id, names: new Map(), byStage: {}, role: v.role || '', books: new Set() };
        r.names.set(name, (r.names.get(name) || 0) + 1);
        if (v.role && !r.role) r.role = v.role;
        reg.set(v.id, r);
      }
    }
  }

  // 整理每个角色：canonicalName=最常用；aliases=全部名字+拆分去重(去掉 canonical)；多名/跨书标记。
  const records = [];
  for (const r of reg.values()) {
    const names = [...r.names.entries()].sort((a, b) => b[1] - a[1]);
    // canonical 取最常用显示名的原子形式（去括号合成）。
    const canonical = (names[0]?.[0] || r.id).replace(/[（(][^）)]*[）)]/g, '').split(/[·•・]/)[0].trim() || r.id;
    const aliasSet = new Set();
    // D1：只收原子别名，丢弃含括号的合成形式（如"杨玉环（太真公主）"是噪音）。
    for (const [n] of names) for (const s of splitNames(n)) if (!/[（(]/.test(s)) aliasSet.add(s);
    aliasSet.delete(canonical);
    const stageNameVariants = [...new Set(Object.values(r.byStage))];
    records.push({
      id: r.id,
      canonicalName: canonical,
      aliases: [...aliasSet],
      role: r.role || '',
      books: [...r.books],
      multiNameAcrossStages: stageNameVariants.length > 1 ? stageNameVariants : undefined,
    });
  }
  // 合并保留 epub 挖掘结果(realName / mined / 额外 aliases)，避免重跑覆盖。
  const regPath = join(canonDir, 'character-alias-registry.json');
  if (existsSync(regPath)) {
    const old = new Map((await readJson(regPath)).characters.map(r => [r.id, r]));
    for (const r of records) {
      const o = old.get(r.id); if (!o) continue;
      if (o.realName) r.realName = o.realName;
      if (o.mined) r.mined = o.mined;
      if (o.aliases?.length) r.aliases = [...new Set([...r.aliases, ...o.aliases])].filter(a => a !== r.canonicalName && !/[（(\/、]/.test(a));
    }
  }
  records.sort((a, b) => a.id.localeCompare(b.id));

  await writeFile(regPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), note: '骨架(stage+id-map) + epub 挖掘(mined/realName)', characters: records }, null, 2)}\n`);

  // 可读 md：突出有别名 / 多名 / 本名的
  const withAlias = records.filter(r => r.aliases.length || r.multiNameAcrossStages || r.realName);
  const lines = ['# 仙途 · 角色别名/称谓表（骨架）', '',
    `> 共 ${records.length} 角色，其中 ${withAlias.length} 个有别名或跨关卡多名。canonicalName=最常用显示名；aliases=名字变体+括号/·拆分。后续可由原文补充本名/外号/绰号/尊称。`, ''];
  for (const book of books) {
    const rs = withAlias.filter(r => r.books.includes(book.id)).sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
    if (!rs.length) continue;
    lines.push(`## 《${book.title}》`, '');
    for (const r of rs) {
      const variant = r.multiNameAcrossStages ? `  ⟨跨关卡显示名：${r.multiNameAcrossStages.join(' / ')}⟩` : '';
      const real = r.realName && r.realName !== r.canonicalName ? `〔本名：${r.realName}〕` : '';
      lines.push(`- **${r.canonicalName}**${real}（\`${r.id}\`）${r.aliases.length ? ` ← 别名：${r.aliases.join('、')}` : ''}${variant}`);
    }
    lines.push('');
  }
  await writeFile(join(canonDir, 'character-alias-registry.md'), `${lines.join('\n')}\n`);
  console.log(`写入 registry：${records.length} 角色，${withAlias.length} 个有别名/多名。`);
}

run().catch(e => { console.error(e); process.exit(1); });
