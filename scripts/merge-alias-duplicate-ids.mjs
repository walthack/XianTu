#!/usr/bin/env node

// 第二轮 ID 合并：别名表揪出的"同人多ID"中，影响游戏(关卡内)的 3 组。
// 别名变体/称号/np占位/真身 导致第一轮(按精确名)漏合并。级联改引用 + 关卡内去重 + 更新 id-map。
// 朱老头真身=殇振羽(殇侯一系,用户定);显示名保留化名，真身记入 description。
//
// Usage: node scripts/merge-alias-duplicate-ids.mjs [--dry-run]

import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const dryRun = process.argv.includes('--dry-run');
const books = ['qingyu', 'yunlong', 'yange'];

const GROUPS = [
  { canonical: 'liuchao.character.sun_shou', name: '孙寿', descAdd: '',
    from: ['liuchao.character.np004', 'lyl.character.sun_shou'] },
  { canonical: 'liuchao.character.yang_yuhuan', name: '杨玉环', descAdd: '',
    from: ['lyg.character.np039', 'lyg.character.np088', 'lyg.character.yang_yuhuan'] },
  { canonical: 'liuchao.character.shang_zhen_yu', name: null, descAdd: '（真身殇振羽，殇侯一系；化名朱老头/刘询）',
    from: ['liuchao.character.np019', 'liuchao.character.zhu_lao_tou', 'lyg.character.np016', 'lyg.character.np018', 'lyl.character.np083', 'lyl.character.zhu_laotou'] },
];
const remap = new Map();
for (const g of GROUPS) for (const id of g.from) if (id !== g.canonical) remap.set(id, g.canonical);
const canonMeta = new Map(GROUPS.map(g => [g.canonical, g]));

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
    if (!dryRun) {
      const backup = join(gen, book, 'stages-pre-merge2-backup');
      if (existsSync(backup)) await rm(backup, { recursive: true });
      await cp(stageDir, backup, { recursive: true });
    }
    for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const m = await readJson(join(stageDir, f));
      for (const c of m.canon?.characters || []) {
        if (c.id && remap.has(c.id)) {
          c.id = remap.get(c.id); idChanges += 1;
          const meta = canonMeta.get(c.id);
          if (meta?.name) c.name = meta.name;
          if (meta?.descAdd && !(c.description || '').includes('殇振羽')) c.description = `${c.description || ''}${meta.descAdd}`;
        }
      }
      // 关卡内去重(同 canonical id 多条 → 并)
      const seen = new Map(); const kept = [];
      for (const c of m.canon?.characters || []) {
        if (seen.has(c.id)) {
          const a = seen.get(c.id);
          for (const k of ['skillIds', 'techniqueIds', 'itemIds']) if (Array.isArray(c[k])) a[k] = [...new Set([...(a[k] || []), ...c[k]])];
          if (!a.profile && c.profile) a.profile = c.profile;
          merged += 1;
        } else { seen.set(c.id, c); kept.push(c); }
      }
      if (m.canon) m.canon.characters = kept;
      remapRefs(m);
      // 合并后去重关系(同 canonical 撞车)：playerRelationships 按 characterId；relationships 按 from::to 且删自环
      if (Array.isArray(m.canon?.playerRelationships)) {
        const s = new Set(); m.canon.playerRelationships = m.canon.playerRelationships.filter(r => {
          if (s.has(r.characterId)) { merged += 1; return false; } s.add(r.characterId); return true;
        });
      }
      if (Array.isArray(m.canon?.relationships)) {
        const s = new Set(); m.canon.relationships = m.canon.relationships.filter(r => {
          if (r.fromCharacterId === r.toCharacterId) { merged += 1; return false; }
          const k = `${r.fromCharacterId}::${r.toCharacterId}`;
          if (s.has(k)) { merged += 1; return false; } s.add(k); return true;
        });
      }
      if (!dryRun) await writeFile(join(stageDir, f), `${JSON.stringify(m, null, 2)}\n`);
    }
  }
  // id-map 更新
  for (const book of books) {
    const f = join(canonDir, `${book}.character-id-map.json`);
    if (!existsSync(f)) continue;
    const map = await readJson(f);
    for (const v of Object.values(map)) if (v?.id && remap.has(v.id)) v.id = remap.get(v.id);
    if (!dryRun) await writeFile(f, `${JSON.stringify(map, null, 2)}\n`);
  }
  console.log(`改 id ${idChanges} 处，关卡内合并 ${merged} 条。备份 stages-pre-merge2-backup。${dryRun ? ' (DRY)' : ''}`);
}
run().catch(e => { console.error(e); process.exit(1); });
