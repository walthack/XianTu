// D4 剪除:把"晚于关卡范围 > MARGIN"的角色/物品从早期关卡移除,级联清引用。
// 读 time-node-violations.json。MARGIN(默认15)只剪铁板钉钉的,边界留。备份 stages-pre-d4-backup。
// Usage: node scripts/apply-d4-prune.mjs [--dry-run]
import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const dryRun = process.argv.includes('--dry-run');
const MARGIN = Number(process.env.XIANTU_D4_PRUNE_MARGIN || 15);
const books = ['qingyu', 'yunlong', 'yange'];
async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

async function run() {
  const v = await readJson(join(canonDir, 'time-node-violations.json'));
  let rmC = 0, rmI = 0; const kept = [];
  for (const book of books) {
    const bd = v.books[book]; if (!bd) continue;
    const stageDir = join(gen, book, 'stages');
    if (!dryRun) { const bk = join(gen, book, 'stages-pre-d4-backup'); if (existsSync(bk)) await rm(bk, { recursive: true }); await cp(stageDir, bk, { recursive: true }); }
    for (const sv of bd.stages) {
      const end = sv.end;
      const cutChars = new Set(sv.badChars.filter(c => c.firstSeen - end > MARGIN).map(c => c.id));
      const cutItems = new Map(); // iid -> set(holderName)  仅当 acquiredAt-end>MARGIN
      for (const b of sv.badItems) if (b.acquiredAt - end > MARGIN) { if (!cutItems.has(b.id)) cutItems.set(b.id, new Set()); cutItems.get(b.id).add(b.holder); }
      sv.badChars.filter(c => c.firstSeen - end <= MARGIN).forEach(c => kept.push(`${sv.id} 角色 ${c.name}(晚${c.firstSeen - end})`));
      if (!cutChars.size && !cutItems.size) continue;
      const file = join(stageDir, `${sv.id}.json`);
      const m = await readJson(file);
      // 剪角色
      if (cutChars.size) {
        m.canon.characters = (m.canon.characters || []).filter(c => !cutChars.has(c.id));
        if (m.canon.relationships) m.canon.relationships = m.canon.relationships.filter(r => !cutChars.has(r.fromCharacterId) && !cutChars.has(r.toCharacterId));
        if (m.canon.playerRelationships) m.canon.playerRelationships = m.canon.playerRelationships.filter(r => !cutChars.has(r.characterId));
        // 级联清所有数组型角色引用(relatedCharacterIds/featuredCharacterIds/allowedCharacterIds)
        const REFA = new Set(['relatedCharacterIds', 'featuredCharacterIds', 'allowedCharacterIds']);
        const walk = node => { if (Array.isArray(node)) return node.forEach(walk); if (node && typeof node === 'object') for (const [k, val] of Object.entries(node)) { if (REFA.has(k) && Array.isArray(val)) node[k] = val.filter(id => !cutChars.has(id)); else walk(val); } };
        walk(m);
        rmC += cutChars.size;
      }
      // 剪物品(从指定 holder 的 itemIds 移除;若无人再持有→删 content + contentAccess)
      for (const [iid, holders] of cutItems) {
        for (const c of m.canon.characters || []) if (holders.has(c.name) && Array.isArray(c.itemIds)) c.itemIds = c.itemIds.filter(x => x !== iid);
        const stillHeld = (m.canon.characters || []).some(c => (c.itemIds || []).includes(iid));
        if (!stillHeld) {
          if (m.content?.items) m.content.items = m.content.items.filter(it => it.id !== iid);
          if (m.rules?.contentAccess) m.rules.contentAccess = m.rules.contentAccess.filter(a => a.contentId !== iid);
        }
        rmI++;
      }
      if (!dryRun) await writeFile(file, `${JSON.stringify(m, null, 2)}\n`);
      console.log(`${sv.id}: -角色 ${cutChars.size}, -物品 ${cutItems.size}`);
    }
  }
  console.log(`\n剪除角色 ${rmC} / 物品 ${rmI}(margin>${MARGIN})。保留边界 ${kept.length}:\n  ${kept.join('\n  ')}`);
  console.log(dryRun ? '(DRY)' : '备份 stages-pre-d4-backup。');
}
run().catch(e => { console.error(e); process.exit(1); });
