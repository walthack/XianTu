#!/usr/bin/env node

// 合并用户确认的同一人异卡：萧太后(xiao_tai_hou) → 萧氏(xiao_shi)。
// 证据：同为唐国太后=李昂生母=安乐之母，被宦官迫害，且在相同6个yange阶段各自作为独立角色出现。
// 处理：卡合并(v3+分卷) + 阶段 id 级联/关内去重 + id-map + registry。模式同 merge-dup-ids.mjs。
// 用法：node scripts/merge-xiao-taihou-into-xiao-shi.mjs [--dry-run]

import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const dryRun = process.argv.includes('--dry-run');
const books = ['qingyu', 'yunlong', 'yange'];

const FROM_ID = 'liuchao.character.xiao_tai_hou';
const CANON_ID = 'liuchao.character.xiao_shi';
const CANON_NAME = '萧氏';
const FROM_NAME = '萧太后';

const remap = new Map([[FROM_ID, CANON_ID]]);
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
const uniq = a => [...new Set((a || []).filter(Boolean))];
const score = p => p ? Object.values(p).filter(v => v && (!Array.isArray(v) || v.length)).length : 0;

// ---------- 1) 卡合并（combined + 分卷）----------
let cardMerges = 0;
for (const file of ['character-cards-v3.json', ...books.map(b => `${b}.character-cards-v3.json`)]) {
  const fp = join(canonDir, file);
  if (!existsSync(fp)) continue;
  const d = await readJson(fp);
  const arr = d.characters || [];
  const canon = arr.find(c => c.canonicalName === CANON_NAME);
  const fromIdx = arr.findIndex(c => c.canonicalName === FROM_NAME);
  if (!canon || fromIdx < 0) continue;
  const from = arr[fromIdx];
  // 别名
  canon.aliases = uniq([...(canon.aliases || []), FROM_NAME, ...(from.aliases || [])]);
  // keyEvents / relationToProtagonist / joining 并集
  const sp = canon.staticProfile, fp2 = from.staticProfile || {};
  sp.keyEvents = uniq([...(sp.keyEvents || []), ...(fp2.keyEvents || [])]);
  sp.relationToProtagonist = uniq([...(sp.relationToProtagonist || []), ...(fp2.relationToProtagonist || [])]);
  sp.joining = uniq([...(sp.joining || []), ...(fp2.joining || [])]);
  // sourceCards 并集
  canon.sourceCards = [...(canon.sourceCards || []), ...(from.sourceCards || [])];
  // phaseIdentities：保留 canon 的；补入 from 里 stageId 不重复的 stage-projection
  const haveStage = new Set((canon.phaseIdentities || []).filter(p => p.scope === 'stage-projection').map(p => p.stageId));
  for (const p of (from.phaseIdentities || [])) {
    if (p.scope === 'stage-projection' && !haveStage.has(p.stageId)) { canon.phaseIdentities.push(p); haveStage.add(p.stageId); }
  }
  arr.splice(fromIdx, 1);
  cardMerges++;
  if (!dryRun) await writeFile(fp, JSON.stringify(d, null, 2));
  console.log(`[card] ${file}: merged ${FROM_NAME} -> ${CANON_NAME}; aliases now ${JSON.stringify(canon.aliases)}`);
}

// ---------- 2) 阶段 id 级联 + 关内去重 ----------
let idChanges = 0, merged = 0, touchedStages = 0;
for (const book of books) {
  const stageDir = join(gen, book, 'stages');
  if (!existsSync(stageDir)) continue;
  if (!dryRun) { const bk = join(gen, book, 'stages-pre-xiaomerge-backup'); if (existsSync(bk)) await rm(bk, { recursive: true }); await cp(stageDir, bk, { recursive: true }); }
  for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
    const m = await readJson(join(stageDir, f));
    let changed = false;
    for (const c of m.canon?.characters || []) if (c.id && remap.has(c.id)) { c.id = remap.get(c.id); c.name = CANON_NAME; idChanges++; changed = true; }
    const seen = new Map(); const kept = [];
    for (const c of m.canon?.characters || []) {
      if (seen.has(c.id)) { const a = seen.get(c.id); for (const k of ['skillIds', 'techniqueIds', 'itemIds']) if (Array.isArray(c[k])) a[k] = uniq([...(a[k] || []), ...c[k]]); if (score(c.profile) > score(a.profile)) a.profile = c.profile; if (!a.role && c.role) a.role = c.role; merged++; changed = true; }
      else { seen.set(c.id, c); kept.push(c); }
    }
    if (m.canon) m.canon.characters = kept;
    remapRefs(m);
    if (Array.isArray(m.canon?.playerRelationships)) { const s = new Set(); m.canon.playerRelationships = m.canon.playerRelationships.filter(r => { if (s.has(r.characterId)) { merged++; return false; } s.add(r.characterId); return true; }); }
    if (Array.isArray(m.canon?.relationships)) { const s = new Set(); m.canon.relationships = m.canon.relationships.filter(r => { if (r.fromCharacterId === r.toCharacterId) { merged++; return false; } const k = `${r.fromCharacterId}::${r.toCharacterId}`; if (s.has(k)) { merged++; return false; } s.add(k); return true; }); }
    if (changed) { touchedStages++; if (!dryRun) await writeFile(join(stageDir, f), `${JSON.stringify(m, null, 2)}\n`); }
  }
}

// ---------- 3) id-map ----------
for (const book of books) {
  const f = join(canonDir, `${book}.character-id-map.json`); if (!existsSync(f)) continue;
  const map = await readJson(f); let hit = false;
  for (const v of Object.values(map)) if (v?.id && remap.has(v.id)) { v.id = remap.get(v.id); hit = true; }
  if (hit && !dryRun) await writeFile(f, `${JSON.stringify(map, null, 2)}\n`);
}

// ---------- 4) registry：canon 加别名 + 删被合条目 ----------
{
  const rp = join(canonDir, 'character-alias-registry.json');
  if (existsSync(rp)) {
    const d = await readJson(rp); const arr = d.characters || d;
    const c = arr.find(x => x.id === CANON_ID || x.name === CANON_NAME);
    if (c) c.aliases = uniq([...(c.aliases || []).map(a => (typeof a === 'string' ? a : a.alias)), FROM_NAME]);
    const idx = arr.findIndex(x => x.id === FROM_ID || x.name === FROM_NAME);
    if (idx >= 0) arr.splice(idx, 1);
    if (!dryRun) await writeFile(rp, `${JSON.stringify(d, null, 2)}\n`);
  }
}

console.log(`\n${dryRun ? '(DRY) ' : ''}萧太后→萧氏：卡合并 ${cardMerges} 文件，阶段改id ${idChanges}，关内去重 ${merged}，触及阶段 ${touchedStages}。备份 stages-pre-xiaomerge-backup。`);
