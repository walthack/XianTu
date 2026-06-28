#!/usr/bin/env node

// D2 续：合并用户确认的同人异 id（王团练=王天德 本名；武二=武二郎 短名）。
// 剑玉姬≠齐羽仙（用户：剑玉姬是齐羽仙下属，非同一人）——不合并，并清除别称表里抽错的"剑玉姬本名齐羽仙"。
// 级联 + 关卡内去重，同 merge-she-id。备份 stages-pre-mergedup-backup。

import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const dryRun = process.argv.includes('--dry-run');
const books = ['qingyu', 'yunlong', 'yange'];

const GROUPS = [
  { canonical: 'liuchao.character.wang_tian_de', name: '王天德', alias: '王团练', from: ['liuchao.character.wang_tuanlian'] },
  { canonical: 'liuchao.character.wu_er_lang', name: '武二郎', alias: '武二', from: ['lyl.character.wu_er'] },
];
const remap = new Map(); const nameOf = new Map();
for (const g of GROUPS) { nameOf.set(g.canonical, g.name); for (const id of g.from) remap.set(id, g.canonical); }

const REF1 = new Set(['characterId', 'fromCharacterId', 'toCharacterId', 'playerCharacterId']);
const REFA = new Set(['featuredCharacterIds', 'relatedCharacterIds', 'allowedCharacterIds']);
function remapRefs(node) {
  if (Array.isArray(node)) return node.forEach(remapRefs);
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (REF1.has(k) && typeof v === 'string' && remap.has(v)) node[k] = remap.get(v);
    else if (REFA.has(k) && Array.isArray(v)) node[k] = v.map(x => (remap.has(x) ? remap.get(x) : x));
    else remapRefs(v);
  }
}
async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }
const score = p => p ? Object.values(p).filter(v => v && (!Array.isArray(v) || v.length)).length : 0;

async function run() {
  let idChanges = 0, merged = 0;
  for (const book of books) {
    const stageDir = join(gen, book, 'stages');
    if (!dryRun) { const bk = join(gen, book, 'stages-pre-mergedup-backup'); if (existsSync(bk)) await rm(bk, { recursive: true }); await cp(stageDir, bk, { recursive: true }); }
    for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const m = await readJson(join(stageDir, f));
      for (const c of m.canon?.characters || []) if (c.id && remap.has(c.id)) { c.id = remap.get(c.id); c.name = nameOf.get(c.id); idChanges++; }
      const seen = new Map(); const kept = [];
      for (const c of m.canon?.characters || []) {
        if (seen.has(c.id)) { const a = seen.get(c.id); for (const k of ['skillIds', 'techniqueIds', 'itemIds']) if (Array.isArray(c[k])) a[k] = [...new Set([...(a[k] || []), ...c[k]])]; if (score(c.profile) > score(a.profile)) a.profile = c.profile; if (!a.role && c.role) a.role = c.role; merged++; }
        else { seen.set(c.id, c); kept.push(c); }
      }
      if (m.canon) m.canon.characters = kept;
      remapRefs(m);
      if (Array.isArray(m.canon?.playerRelationships)) { const s = new Set(); m.canon.playerRelationships = m.canon.playerRelationships.filter(r => { if (s.has(r.characterId)) { merged++; return false; } s.add(r.characterId); return true; }); }
      if (Array.isArray(m.canon?.relationships)) { const s = new Set(); m.canon.relationships = m.canon.relationships.filter(r => { if (r.fromCharacterId === r.toCharacterId) { merged++; return false; } const k = `${r.fromCharacterId}::${r.toCharacterId}`; if (s.has(k)) { merged++; return false; } s.add(k); return true; }); }
      if (!dryRun) await writeFile(join(stageDir, f), `${JSON.stringify(m, null, 2)}\n`);
    }
  }
  for (const book of books) { const f = join(canonDir, `${book}.character-id-map.json`); if (!existsSync(f)) continue; const map = await readJson(f); for (const v of Object.values(map)) if (v?.id && remap.has(v.id)) v.id = remap.get(v.id); if (!dryRun) await writeFile(f, `${JSON.stringify(map, null, 2)}\n`); }
  // registry：加别称 + 删被合 id；清除抽错的"剑玉姬 本名齐羽仙"
  for (const file of ['character-alias-registry.json', 'alias-registry-v2.json']) {
    const rp = join(canonDir, file); if (!existsSync(rp)) continue;
    const d = await readJson(rp); const arr = d.characters || d;
    for (const g of GROUPS) { const c = arr.find(x => x.id === g.canonical); if (c && file === 'character-alias-registry.json') c.aliases = [...new Set([...(c.aliases || []), g.alias])]; const idx = arr.findIndex(x => x.id === g.from[0]); if (idx >= 0) arr.splice(idx, 1); }
    // 剑玉姬：去掉错误别称 齐羽仙
    const jyj = arr.find(x => x.name === '剑玉姬' || x.id === 'liuchao.character.jian_yu_ji');
    if (jyj && Array.isArray(jyj.aliases)) jyj.aliases = jyj.aliases.filter(a => (typeof a === 'string' ? a : a.alias) !== '齐羽仙');
    if (d.collisions) d.collisions = d.collisions.filter(c => c.alias !== '齐羽仙');
    if (!dryRun) await writeFile(rp, `${JSON.stringify(d, null, 2)}\n`);
  }
  console.log(`合并 王团练→王天德 / 武二→武二郎：改 id ${idChanges}，关内去重 ${merged}。清除剑玉姬错挂"齐羽仙"。备份 stages-pre-mergedup-backup。${dryRun ? ' (DRY)' : ''}`);
}
run().catch(e => { console.error(e); process.exit(1); });
