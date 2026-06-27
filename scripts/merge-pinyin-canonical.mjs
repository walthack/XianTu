#!/usr/bin/env node

// 给全np缺拼音的同人组补 pinyin canonical 并合并(pypinyin 生成的 pinyin.json + needpinyin.json)。
// 解决 task3.B：全np组跨书np号碰撞、无法用np当canonical → 改用 liuchao.character.<拼音>。
// 级联 stages 引用 + 关卡内去重 + id-map。collision 守卫。备份 stages-pre-pinyin-backup。
//
// Usage: node scripts/merge-pinyin-canonical.mjs <needpinyin.json> <pinyin.json> [--dry-run]

import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const [needPath, pyPath] = args.filter(a => !a.startsWith('--'));
const books = ['qingyu', 'yunlong', 'yange'];

async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }
const REF1 = new Set(['characterId', 'fromCharacterId', 'toCharacterId', 'playerCharacterId']);
const REFA = new Set(['featuredCharacterIds', 'relatedCharacterIds', 'allowedCharacterIds']);
function remapRefs(n, remap) {
  if (Array.isArray(n)) return n.forEach(x => remapRefs(x, remap));
  if (!n || typeof n !== 'object') return;
  for (const [k, v] of Object.entries(n)) {
    if (REF1.has(k) && typeof v === 'string' && remap.has(v)) n[k] = remap.get(v);
    else if (REFA.has(k) && Array.isArray(v)) n[k] = v.map(x => (remap.has(x) ? remap.get(x) : x));
    else remapRefs(v, remap);
  }
}

async function run() {
  const need = await readJson(needPath);   // {name: [ids]}
  const py = await readJson(pyPath);        // {name: slug}
  const remap = new Map();
  const owner = new Map();
  for (const [name, ids] of Object.entries(need)) {
    const slug = py[name]; if (!slug) { console.error(`无拼音: ${name}`); continue; }
    const canonical = `liuchao.character.${slug}`;
    if (owner.has(canonical) && owner.get(canonical) !== name) throw new Error(`拼音 canonical 冲突 ${canonical}: ${owner.get(canonical)} vs ${name}`);
    owner.set(canonical, name);
    for (const id of ids) if (id !== canonical) remap.set(id, canonical);
  }
  console.log(`补拼音合并 ${Object.keys(need).length} 组，${remap.size} 旧id→canonical。${dryRun ? '(DRY)' : ''}`);
  if (dryRun) return;

  let idc = 0, mg = 0;
  for (const book of books) {
    const stageDir = join(gen, book, 'stages');
    const bk = join(gen, book, 'stages-pre-pinyin-backup');
    if (existsSync(bk)) await rm(bk, { recursive: true });
    await cp(stageDir, bk, { recursive: true });
    for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const m = await readJson(join(stageDir, f));
      for (const c of m.canon?.characters || []) if (c.id && remap.has(c.id)) { c.id = remap.get(c.id); idc++; }
      const seen = new Map(); const kept = [];
      for (const c of m.canon?.characters || []) { if (seen.has(c.id)) { const a = seen.get(c.id); for (const k of ['skillIds', 'techniqueIds', 'itemIds']) if (Array.isArray(c[k])) a[k] = [...new Set([...(a[k] || []), ...c[k]])]; if (!a.profile && c.profile) a.profile = c.profile; mg++; } else { seen.set(c.id, c); kept.push(c); } }
      if (m.canon) m.canon.characters = kept;
      remapRefs(m, remap);
      if (Array.isArray(m.canon?.playerRelationships)) { const s = new Set(); m.canon.playerRelationships = m.canon.playerRelationships.filter(r => (s.has(r.characterId) ? false : (s.add(r.characterId), true))); }
      if (Array.isArray(m.canon?.relationships)) { const s = new Set(); m.canon.relationships = m.canon.relationships.filter(r => r.fromCharacterId !== r.toCharacterId && (s.has(`${r.fromCharacterId}::${r.toCharacterId}`) ? false : (s.add(`${r.fromCharacterId}::${r.toCharacterId}`), true))); }
      await writeFile(join(stageDir, f), `${JSON.stringify(m, null, 2)}\n`);
    }
  }
  for (const book of books) { const f = join(canonDir, `${book}.character-id-map.json`); if (!existsSync(f)) continue; const map = await readJson(f); for (const v of Object.values(map)) if (v?.id && remap.has(v.id)) v.id = remap.get(v.id); await writeFile(f, `${JSON.stringify(map, null, 2)}\n`); }
  console.log(`改 stage id ${idc} 处，关卡内去重 ${mg}。备份 stages-pre-pinyin-backup。`);
}
run().catch(e => { console.error(e); process.exit(1); });
