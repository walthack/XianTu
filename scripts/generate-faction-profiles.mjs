#!/usr/bin/env node

// B1 势力档案：跨 18 关聚合每个势力 → 类型/描述/总部/特征/重要成员/对外关系 → faction-profiles.md。
// 数据源：stage canon.factions + canon.characters[].affiliations(成员) + canon.factionRelationships(对外关系) + atlas/stage locations(总部名)。

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const books = [['qingyu', '六朝清羽记'], ['yunlong', '六朝云龙吟'], ['yange', '六朝燕歌行']];
async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

async function run() {
  const fac = new Map();   // id -> {name,type,desc,hq,features:Set,books:Set,members:Map(name->roles:Set)}
  const locName = new Map();
  const relById = new Map(); // id -> Map(otherId -> {relation,score,tags})
  // atlas 地点名
  const atlasPath = join(gen, 'shared-atlas', 'liuchao.shared-atlas.v1.json');
  if (existsSync(atlasPath)) { const a = await readJson(atlasPath); for (const l of a.locations || []) locName.set(l.id, l.name); for (const f of a.factions || []) if (!fac.has(f.id)) fac.set(f.id, { name: f.name, type: f.type || '', desc: f.description || '', hq: f.headquartersLocationId || '', features: new Set(f.features || []), books: new Set(), members: new Map() }); }

  for (const [book, title] of books) {
    const stageDir = join(gen, book, 'stages');
    for (const fn of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const m = await readJson(join(stageDir, fn));
      for (const l of m.canon?.locations || []) if (l.id && l.name) locName.set(l.id, l.name);
      for (const f of m.canon?.factions || []) {
        const e = fac.get(f.id) || { name: f.name, type: '', desc: '', hq: '', features: new Set(), books: new Set(), members: new Map() };
        if (f.name) e.name = f.name;
        if (f.type) e.type = f.type;
        if (f.description && f.description.length > e.desc.length) e.desc = f.description;
        if (f.headquartersLocationId) e.hq = f.headquartersLocationId;
        for (const x of f.features || []) e.features.add(x);
        e.books.add(title);
        fac.set(f.id, e);
      }
      for (const c of m.canon?.characters || []) for (const a of c.affiliations || []) {
        if (!a.factionId) continue;
        const e = fac.get(a.factionId); if (!e) continue;
        const roles = e.members.get(c.name) || new Set();
        if (a.role) roles.add(a.role);
        e.members.set(c.name, roles);
      }
      for (const r of m.canon?.factionRelationships || []) {
        const map = relById.get(r.fromFactionId) || new Map();
        if (!map.has(r.toFactionId)) map.set(r.toFactionId, { relation: r.relation, score: r.score, tags: r.tags || [] });
        relById.set(r.fromFactionId, map);
        // 反向也记一条(bidirectional 时对称呈现)
        if (r.direction === 'bidirectional') { const m2 = relById.get(r.toFactionId) || new Map(); if (!m2.has(r.fromFactionId)) m2.set(r.fromFactionId, { relation: r.relation, score: r.score, tags: r.tags || [] }); relById.set(r.toFactionId, m2); }
      }
    }
  }

  const lines = ['# 仙途 · 势力档案', '', `> 共 ${fac.size} 个势力，跨三本聚合。含类型/总部/重要成员/对外关系。`, ''];
  const sorted = [...fac.entries()].sort((a, b) => b[1].members.size - a[1].members.size);
  for (const [id, e] of sorted) {
    lines.push(`## ${e.name}　\`${id}\``);
    lines.push(`- 类型：${e.type || '—'}　|　出现：${[...e.books].join('、') || '—'}`);
    if (e.hq) lines.push(`- 总部：${locName.get(e.hq) || e.hq}`);
    if (e.desc) lines.push(`- 简介：${e.desc}`);
    if (e.features.size) lines.push(`- 特征：${[...e.features].join('、')}`);
    if (e.members.size) lines.push(`- 重要成员（${e.members.size}）：${[...e.members.entries()].map(([n, r]) => `${n}${r.size ? `（${[...r].join('/')}）` : ''}`).join('、')}`);
    const rel = relById.get(id);
    if (rel?.size) lines.push(`- 对外关系：${[...rel.entries()].map(([oid, v]) => `${fac.get(oid)?.name || oid}=${v.relation}(${v.score})`).join('、')}`);
    lines.push('');
  }
  await writeFile(join(canonDir, 'faction-profiles.md'), `${lines.join('\n')}\n`);
  console.log(`写入 faction-profiles.md：${fac.size} 势力`);
}
run().catch(e => { console.error(e); process.exit(1); });
