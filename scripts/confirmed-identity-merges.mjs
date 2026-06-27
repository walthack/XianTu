#!/usr/bin/env node

// 用户已确认的同人合并(2026-06-26)：
//  - 小紫：后宫尊称"紫妈妈"(正宫/最有手腕)、紫丫头、紫玫 全是小紫本人 → 并入 xiao_zi；宠物为犬"雪雪"。
//  - 高智商 = 甄厚道 → 并入 gao_zhishang。
// 级联改引用 + 关卡内去重 + id-map；小紫描述补充称呼/宠物。备份 stages-pre-confirmmerge-backup。
//
// Usage: node scripts/confirmed-identity-merges.mjs [--dry-run]

import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const dryRun = process.argv.includes('--dry-run');
const books = ['qingyu', 'yunlong', 'yange'];

const GROUPS = [
  { canonical: 'liuchao.character.xiao_zi', name: '小紫', descAdd: '（后宫尊称"紫妈妈"，正宫，最有手腕、能管束众人；宠物为犬"雪雪"）', mark: '紫妈妈',
    from: ['lcq.character.np030', 'lyg.character.np037', 'lyg.character.np067', 'lyg.character.np006'] },
  { canonical: 'liuchao.character.gao_zhishang', name: '高智商', descAdd: '（本名甄厚道）', mark: '甄厚道',
    from: ['lyl.character.np072'] },
  // 经 DeepSeek 原文判定确认(2026-06-26)
  { canonical: 'liuchao.character.sun_nuan', name: '孙暖', descAdd: '（原汉国湖阳君）', mark: '湖阳君',
    from: ['lyg.character.np029', 'lyg.character.np030'] },
  { canonical: 'liuchao.character.an_le_gong_zhu', name: '安乐公主', descAdd: '（本名李裹儿）', mark: '李裹儿',
    from: ['lyg.character.np079', 'lyg.character.np082', 'lyg.character.np083'] },
];
const remap = new Map();
for (const g of GROUPS) for (const id of g.from) if (id !== g.canonical) remap.set(id, g.canonical);
const meta = new Map(GROUPS.map(g => [g.canonical, g]));

const REF1 = new Set(['characterId', 'fromCharacterId', 'toCharacterId', 'playerCharacterId']);
const REFA = new Set(['featuredCharacterIds', 'relatedCharacterIds', 'allowedCharacterIds']);
function remapRefs(n) {
  if (Array.isArray(n)) return n.forEach(remapRefs);
  if (!n || typeof n !== 'object') return;
  for (const [k, v] of Object.entries(n)) {
    if (REF1.has(k) && typeof v === 'string' && remap.has(v)) n[k] = remap.get(v);
    else if (REFA.has(k) && Array.isArray(v)) n[k] = v.map(x => (remap.has(x) ? remap.get(x) : x));
    else remapRefs(v);
  }
}
async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

async function run() {
  let idc = 0, mg = 0;
  for (const book of books) {
    const stageDir = join(gen, book, 'stages');
    if (!dryRun) { const bk = join(gen, book, 'stages-pre-confirmmerge-backup'); if (existsSync(bk)) await rm(bk, { recursive: true }); await cp(stageDir, bk, { recursive: true }); }
    for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const m = await readJson(join(stageDir, f));
      for (const c of m.canon?.characters || []) {
        if (c.id && remap.has(c.id)) { c.id = remap.get(c.id); idc++; const mt = meta.get(c.id); if (mt?.name) c.name = mt.name; }
        const mt = meta.get(c.id);
        if (mt?.descAdd && !(c.description || '').includes(mt.mark)) c.description = `${c.description || ''}${mt.descAdd}`;
      }
      const seen = new Map(); const kept = [];
      for (const c of m.canon?.characters || []) { if (seen.has(c.id)) { const a = seen.get(c.id); for (const k of ['skillIds', 'techniqueIds', 'itemIds']) if (Array.isArray(c[k])) a[k] = [...new Set([...(a[k] || []), ...c[k]])]; if (!a.profile && c.profile) a.profile = c.profile; mg++; } else { seen.set(c.id, c); kept.push(c); } }
      if (m.canon) m.canon.characters = kept;
      remapRefs(m);
      if (Array.isArray(m.canon?.playerRelationships)) { const s = new Set(); m.canon.playerRelationships = m.canon.playerRelationships.filter(r => (s.has(r.characterId) ? false : (s.add(r.characterId), true))); }
      if (Array.isArray(m.canon?.relationships)) { const s = new Set(); m.canon.relationships = m.canon.relationships.filter(r => r.fromCharacterId !== r.toCharacterId && (s.has(`${r.fromCharacterId}::${r.toCharacterId}`) ? false : (s.add(`${r.fromCharacterId}::${r.toCharacterId}`), true))); }
      if (!dryRun) await writeFile(join(stageDir, f), `${JSON.stringify(m, null, 2)}\n`);
    }
  }
  for (const book of books) { const f = join(canonDir, `${book}.character-id-map.json`); if (!existsSync(f)) continue; const map = await readJson(f); for (const v of Object.values(map)) if (v?.id && remap.has(v.id)) v.id = remap.get(v.id); if (!dryRun) await writeFile(f, `${JSON.stringify(map, null, 2)}\n`); }
  console.log(`改 id ${idc} 处，关卡内去重 ${mg}。${dryRun ? '(DRY)' : '备份 stages-pre-confirmmerge-backup'}`);
}
run().catch(e => { console.error(e); process.exit(1); });
