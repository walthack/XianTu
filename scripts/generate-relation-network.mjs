// B3 关系网络（数据版）：聚合玩家关系 + NPC↔NPC + 势力关系 → relation-network.md。
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const books = ['qingyu', 'yunlong', 'yange'];
async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

async function run() {
  const name = new Map(); const fname = new Map();
  const player = new Map();   // charId -> {relation, fav}
  const npc = new Map();      // from::to -> {a,b,relation,score}
  const fac = new Map();      // from::to -> {a,b,relation,score}
  for (const book of books) {
    const stageDir = join(gen, book, 'stages');
    for (const fn of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const m = await readJson(join(stageDir, fn));
      for (const c of m.canon?.characters || []) name.set(c.id, c.name);
      for (const f of m.canon?.factions || []) fname.set(f.id, f.name);
      for (const r of m.canon?.playerRelationships || []) if (!player.has(r.characterId)) player.set(r.characterId, { relation: r.relation, fav: r.favorability });
      for (const r of m.canon?.relationships || []) { const k = `${r.fromCharacterId}::${r.toCharacterId}`; if (!npc.has(k)) npc.set(k, { a: r.fromCharacterId, b: r.toCharacterId, relation: r.relation, score: r.score }); }
      for (const r of m.canon?.factionRelationships || []) { const k = `${r.fromFactionId}::${r.toFactionId}`; if (!fac.has(k)) fac.set(k, { a: r.fromFactionId, b: r.toFactionId, relation: r.relation, score: r.score }); }
    }
  }
  const nm = id => name.get(id) || id;
  const fm = id => fname.get(id) || id;
  const lines = ['# 仙途 · 关系网络（数据版）', '', `> 玩家(程宗扬)关系 ${player.size} · NPC↔NPC ${npc.size} · 势力关系 ${fac.size}。跨三本聚合去重。`, ''];

  lines.push(`## 玩家关系（程宗扬 → NPC，按好感排序）`, '');
  for (const [id, r] of [...player.entries()].sort((a, b) => (b[1].fav || 0) - (a[1].fav || 0)))
    lines.push(`- ${nm(id)}：${r.relation}（好感 ${r.fav}）`);
  lines.push('');

  lines.push(`## NPC ↔ NPC（${npc.size}）`, '');
  for (const r of [...npc.values()].sort((a, b) => (a.score) - (b.score)))
    lines.push(`- ${nm(r.a)} ↔ ${nm(r.b)}：${r.relation}（${r.score}）`);
  lines.push('');

  lines.push(`## 势力 ↔ 势力（${fac.size}）`, '');
  for (const r of [...fac.values()].sort((a, b) => (a.score) - (b.score)))
    lines.push(`- ${fm(r.a)} ↔ ${fm(r.b)}：${r.relation}（${r.score}）`);
  lines.push('');

  await writeFile(join(canonDir, 'relation-network.md'), `${lines.join('\n')}\n`);
  console.log(`写入 relation-network.md：玩家 ${player.size} / NPC对 ${npc.size} / 势力对 ${fac.size}`);
}
run().catch(e => { console.error(e); process.exit(1); });
