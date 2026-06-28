#!/usr/bin/env node

// D2：蛇奴 = 蛇夫人 的役名（用户裁定，同一人）。把 she_nu 合并进 she_fu_ren。
// 同 merge-alias-duplicate-ids 的级联+关卡内去重逻辑。备份 stages-pre-shemerge-backup。
// 注意：蛇夫人 ≠ 阮香琳（用户裁定，阮家姐妹另算，已从 registry 清除阮香琳的错挂蛇夫人别名）。

import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const dryRun = process.argv.includes('--dry-run');
const books = ['qingyu', 'yunlong', 'yange'];

const CANONICAL = 'lyg.character.she_fu_ren';
const NAME = '蛇夫人';
const remap = new Map([['liuchao.character.she_nu', CANONICAL]]);

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

async function run() {
  let idChanges = 0, merged = 0;
  for (const book of books) {
    const stageDir = join(gen, book, 'stages');
    if (!dryRun) { const bk = join(gen, book, 'stages-pre-shemerge-backup'); if (existsSync(bk)) await rm(bk, { recursive: true }); await cp(stageDir, bk, { recursive: true }); }
    for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const m = await readJson(join(stageDir, f));
      for (const c of m.canon?.characters || []) if (c.id && remap.has(c.id)) { c.id = remap.get(c.id); c.name = NAME; idChanges += 1; }
      // 关卡内去重（蛇夫人/蛇奴 在 shixiang_ambush 同台 → 并；保留更全 profile）
      const seen = new Map(); const kept = [];
      for (const c of m.canon?.characters || []) {
        if (seen.has(c.id)) {
          const a = seen.get(c.id);
          for (const k of ['skillIds', 'techniqueIds', 'itemIds']) if (Array.isArray(c[k])) a[k] = [...new Set([...(a[k] || []), ...c[k]])];
          // 取更丰富的 profile（字段多者）
          const score = p => p ? Object.values(p).filter(v => v && (!Array.isArray(v) || v.length)).length : 0;
          if (score(c.profile) > score(a.profile)) a.profile = c.profile;
          if (!a.role && c.role) a.role = c.role;
          merged += 1;
        } else { seen.set(c.id, c); kept.push(c); }
      }
      if (m.canon) m.canon.characters = kept;
      remapRefs(m);
      if (Array.isArray(m.canon?.playerRelationships)) { const s = new Set(); m.canon.playerRelationships = m.canon.playerRelationships.filter(r => { if (s.has(r.characterId)) { merged++; return false; } s.add(r.characterId); return true; }); }
      if (Array.isArray(m.canon?.relationships)) { const s = new Set(); m.canon.relationships = m.canon.relationships.filter(r => { if (r.fromCharacterId === r.toCharacterId) { merged++; return false; } const k = `${r.fromCharacterId}::${r.toCharacterId}`; if (s.has(k)) { merged++; return false; } s.add(k); return true; }); }
      if (!dryRun) await writeFile(join(stageDir, f), `${JSON.stringify(m, null, 2)}\n`);
    }
  }
  for (const book of books) { const f = join(canonDir, `${book}.character-id-map.json`); if (!existsSync(f)) continue; const map = await readJson(f); for (const v of Object.values(map)) if (v?.id && remap.has(v.id)) v.id = remap.get(v.id); if (!dryRun) await writeFile(f, `${JSON.stringify(map, null, 2)}\n`); }
  // registry：蛇夫人 加别称 蛇奴；删除独立 蛇奴 条目
  const rp = join(canonDir, 'character-alias-registry.json');
  if (existsSync(rp)) {
    const d = await readJson(rp); const arr = d.characters || d;
    const she = arr.find(c => c.id === CANONICAL);
    if (she) { she.aliases = [...new Set([...(she.aliases || []), '蛇奴'])]; }
    const idx = arr.findIndex(c => c.id === 'liuchao.character.she_nu');
    if (idx >= 0) arr.splice(idx, 1);
    if (!dryRun) await writeFile(rp, `${JSON.stringify(d, null, 2)}\n`);
  }
  console.log(`蛇奴→蛇夫人：改 id ${idChanges} 处，关卡内合并 ${merged} 条。备份 stages-pre-shemerge-backup。${dryRun ? ' (DRY)' : ''}`);
}
run().catch(e => { console.error(e); process.exit(1); });
