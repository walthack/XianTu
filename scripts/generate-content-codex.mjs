// B2 功法/物品/技能图鉴：跨关聚合 content + 持有者 + 品级 + 独占策略 → content-codex.md。
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const books = ['qingyu', 'yunlong', 'yange'];
async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

async function run() {
  const kinds = { techniques: new Map(), skills: new Map(), items: new Map() };
  const charName = new Map();
  const holders = new Map();      // contentId -> Set(charName)
  const access = new Map();        // contentId -> {policy, allowed:[ids]}
  const holdField = { skills: 'skillIds', techniques: 'techniqueIds', items: 'itemIds' };

  for (const book of books) {
    const stageDir = join(gen, book, 'stages');
    for (const fn of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const m = await readJson(join(stageDir, fn));
      for (const c of m.canon?.characters || []) charName.set(c.id, c.name);
      for (const k of Object.keys(kinds)) for (const e of m.content?.[k] || []) {
        if (!e.id) continue;
        const cur = kinds[k].get(e.id) || { name: e.name, grade: '', type: '', desc: '' };
        if (e.name) cur.name = e.name;
        if (e.grade) cur.grade = e.grade;
        if (e.type) cur.type = e.type;
        if (e.description && e.description.length > cur.desc.length) cur.desc = e.description;
        kinds[k].set(e.id, cur);
      }
      for (const c of m.canon?.characters || []) for (const k of Object.keys(holdField)) for (const cid of c[holdField[k]] || []) {
        const set = holders.get(cid) || new Set(); set.add(c.name); holders.set(cid, set);
      }
      for (const r of m.rules?.contentAccess || []) if (!access.has(r.contentId)) access.set(r.contentId, { policy: r.policy, allowed: r.allowedCharacterIds || [] });
    }
  }

  const label = { techniques: '功法', skills: '技能/异能', items: '物品/装备' };
  const lines = ['# 仙途 · 功法/物品/技能图鉴', '', `> 跨三本聚合。含品级、持有者、独占/限制策略。`, ''];
  for (const k of ['techniques', 'skills', 'items']) {
    const entries = [...kinds[k].entries()].sort((a, b) => (b[1].grade || '').localeCompare(a[1].grade || '') || a[1].name.localeCompare(b[1].name));
    lines.push(`## ${label[k]}（${entries.length}）`, '');
    for (const [id, e] of entries) {
      const hold = [...(holders.get(id) || [])];
      const ac = access.get(id);
      const acStr = ac ? `　[${ac.policy === 'exclusive' ? '独占' : ac.policy === 'restricted' ? '限制' : ac.policy}：${ac.allowed.map(i => charName.get(i) || i).join('/') || '—'}]` : '';
      lines.push(`- **${e.name}**${e.grade ? `（${e.grade}）` : ''}${e.type ? `〔${e.type}〕` : ''}${acStr}`);
      if (e.desc) lines.push(`  - ${e.desc}`);
      if (hold.length) lines.push(`  - 持有：${hold.join('、')}`);
    }
    lines.push('');
  }
  await writeFile(join(canonDir, 'content-codex.md'), `${lines.join('\n')}\n`);
  console.log(`写入 content-codex.md：功法 ${kinds.techniques.size} / 技能 ${kinds.skills.size} / 物品 ${kinds.items.size}`);
}
run().catch(e => { console.error(e); process.exit(1); });
