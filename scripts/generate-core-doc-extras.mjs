// 补缺核心文档:角色总表 character-index.md + 关卡概览 per-stage-summary.md(数据驱动)。
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const books = [['qingyu', '六朝清羽记'], ['yunlong', '六朝云龙吟'], ['yange', '六朝燕歌行']];
const UNSET = v => !v || /原作未载|未知|^无$|未载/.test(v);
async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

async function run() {
  const reg = await readJson(join(canonDir, 'character-alias-registry.json'));
  const aliasById = new Map(reg.characters.map(r => [r.id, r]));
  // 关系弧涉及的角色名
  const arcNames = new Set();
  if (existsSync(join(canonDir, 'relationship-arcs-draft.json'))) for (const a of (await readJson(join(canonDir, 'relationship-arcs-draft.json'))).arcs || []) for (const p of a.pairs || []) { arcNames.add(p.a); arcNames.add(p.b); }

  const byId = new Map();
  const stageRows = [];
  for (const [book, title] of books) {
    const sp = await readJson(join(gen, book, 'stage-plan.json')); const stages = Array.isArray(sp) ? sp : (sp.stages || []);
    const spById = new Map(stages.map(s => [s.id, s]));
    const stageDir = join(gen, book, 'stages');
    for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const m = await readJson(join(stageDir, f));
      const id = m.manifest.id; const plan = spById.get(id) || {};
      stageRows.push({ book: title, id, name: m.manifest.name, range: `${plan.sourceStartIndex ?? '?'}-${plan.sourceEndIndex ?? '?'}`,
        chars: (m.canon?.characters || []).length, factions: (m.canon?.factions || []).length, events: (m.scenario?.events || []).length,
        items: (m.content?.items || []).length, techs: (m.content?.techniques || []).length, skills: (m.content?.skills || []).length,
        rels: (m.canon?.relationships || []).length, prels: (m.canon?.playerRelationships || []).length });
      for (const c of m.canon?.characters || []) {
        if (!c.id) continue;
        const e = byId.get(c.id) || { id: c.id, name: c.name, role: '', gender: '', books: new Set(), stages: new Set(), app: false, notes: false, realm: '' };
        if (c.role && !e.role) e.role = c.role;
        const g = c.gender || c.profile?.gender; if (g && !e.gender) e.gender = g;
        if (c.realm && !e.realm) e.realm = c.realm;
        if (!UNSET(c.profile?.appearance)) e.app = true;
        if ((c.profile?.notes || []).length) e.notes = true;
        e.books.add(title); e.stages.add(id);
        byId.set(c.id, e);
      }
    }
  }

  // 角色总表
  const cl = ['# 仙途 · 角色总表(character-index)', '', `> ${byId.size} 唯一角色。✓=有 / ·=无。出处别名见 character-alias-registry。`, '', '| 角色 | 别名 | role | 性别 | 境界 | 书 | 关卡数 | 外貌 | 约束 | 关系弧 |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const e of [...byId.values()].sort((a, b) => b.stages.size - a.stages.size)) {
    const reg2 = aliasById.get(e.id);
    cl.push(`| ${reg2?.canonicalName || e.name} | ${(reg2?.aliases || []).slice(0, 4).join('、') || '·'} | ${e.role || '·'} | ${e.gender || '·'} | ${e.realm || '·'} | ${[...e.books].map(b => b[2]).join('') || [...e.books].join('')} | ${e.stages.size} | ${e.app ? '✓' : '·'} | ${e.notes ? '✓' : '·'} | ${arcNames.has(e.name) ? '✓' : '·'} |`);
  }
  await writeFile(join(canonDir, 'character-index.md'), `${cl.join('\n')}\n`);

  // 关卡概览
  const sl = ['# 仙途 · 关卡概览(per-stage-summary)', '', `> 18 关。源范围/角色/势力/事件/内容/关系 计数。`, '', '| 关卡 | id | 源范围 | 角色 | 势力 | 事件 | 物品 | 功法 | 技能 | NPC关系 | 玩家关系 |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of stageRows) sl.push(`| ${r.name} | \`${r.id}\` | ${r.range} | ${r.chars} | ${r.factions} | ${r.events} | ${r.items} | ${r.techs} | ${r.skills} | ${r.rels} | ${r.prels} |`);
  await writeFile(join(canonDir, 'per-stage-summary.md'), `${sl.join('\n')}\n`);

  console.log(`character-index.md(${byId.size} 角色) + per-stage-summary.md(${stageRows.length} 关) 写入。`);
}
run().catch(e => { console.error(e); process.exit(1); });
