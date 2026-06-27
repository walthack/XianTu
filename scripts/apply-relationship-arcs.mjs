// A3 落地：把 relationship-arcs-draft 按"关卡状态快照"写入 mod。
// 每对(跳过未变化):事件前的关卡=before 状态、事件所在/之后的关卡=after 状态；仅当双方都在该关阵容才写。
// 程宗扬→playerRelationships，其余→canon.relationships。备份 stages-pre-arcs-backup。
// Usage: node scripts/apply-relationship-arcs.mjs [--dry-run]
import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const dryRun = process.argv.includes('--dry-run');
const books = ['qingyu', 'yunlong', 'yange'];
const PLAYER_NAME = '程宗扬';
const deParen = s => s.replace(/[（(][^）)]*[）)]/g, '').split(/[·•・]/)[0].trim();
async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

async function run() {
  const draft = await readJson(join(canonDir, 'relationship-arcs-draft.json'));
  const timeline = await readJson(join(canonDir, 'story-timeline.json'));
  const seqIdx = new Map(timeline.nodes.map(n => [n.seq, { book: n.book, idx: n.idx }]));

  // 预聚合每本的 stage 数据
  const data = {};
  for (const b of books) {
    const sp = await readJson(join(gen, b, 'stage-plan.json')); const stages = Array.isArray(sp) ? sp : (sp.stages || []);
    const stageDir = join(gen, b, 'stages');
    const files = (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'));
    const mods = {};
    for (const f of files) { const m = await readJson(join(stageDir, f)); mods[m.manifest.id] = { m, file: join(stageDir, f) }; }
    data[b] = { stages, mods };
    if (!dryRun) { const bk = join(gen, b, 'stages-pre-arcs-backup'); if (existsSync(bk)) await rm(bk, { recursive: true }); await cp(stageDir, bk, { recursive: true }); }
  }
  const resolveId = (mod, name) => { const dn = deParen(name); const c = (mod.canon?.characters || []).find(x => x.name === name || deParen(x.name) === dn); return c?.id; };

  let applied = 0, skipped = 0;
  const changedArcs = [];
  for (const arc of draft.arcs) {
    const loc = seqIdx.get(arc.seq); if (!loc) continue;
    const { book, idx: eventIdx } = loc;
    for (const p of arc.pairs || []) {
      const same = p.before?.relation === p.after?.relation && p.before?.score === p.after?.score;
      if (same) { skipped++; continue; }
      let pairApplied = 0;
      for (const s of data[book].stages) {
        const entry = data[book].mods[s.id]; if (!entry) continue;
        const state = s.sourceEndIndex < eventIdx ? p.before : p.after; // 整段在事件前→before；否则after(含事件所在关)
        if (!state) continue;
        const aId = resolveId(entry.m, p.a), bId = resolveId(entry.m, p.b);
        if (!aId || !bId || aId === bId) continue;
        const m = entry.m; m.canon = m.canon || {};
        const playerId = m.canon.playerCharacterId;
        const aPlayer = p.a === PLAYER_NAME || aId === playerId, bPlayer = p.b === PLAYER_NAME || bId === playerId;
        if (aPlayer || bPlayer) {
          const otherId = aPlayer ? bId : aId;
          if (otherId === playerId) continue;
          const pr = m.canon.playerRelationships = m.canon.playerRelationships || [];
          const ex = pr.find(r => r.characterId === otherId);
          if (ex) { ex.relation = state.relation; ex.favorability = state.score; } else pr.push({ characterId: otherId, relation: state.relation, favorability: state.score });
        } else {
          const rels = m.canon.relationships = m.canon.relationships || [];
          const ex = rels.find(r => (r.fromCharacterId === aId && r.toCharacterId === bId) || (r.fromCharacterId === bId && r.toCharacterId === aId));
          if (ex) { ex.relation = state.relation; ex.score = state.score; } else rels.push({ fromCharacterId: aId, toCharacterId: bId, relation: state.relation, score: state.score, direction: 'bidirectional' });
        }
        entry.dirty = true; pairApplied++;
      }
      if (pairApplied) { applied++; changedArcs.push(`#${arc.seq} ${p.a}↔${p.b}: ${p.before?.relation}→${p.after?.relation} (${pairApplied}关)`); }
      else skipped++;
    }
  }
  if (!dryRun) for (const b of books) for (const id in data[b].mods) { const e = data[b].mods[id]; if (e.dirty) await writeFile(e.file, `${JSON.stringify(e.m, null, 2)}\n`); }
  console.log(`应用关系对 ${applied}，跳过 ${skipped}（未变化/双方不同关）。`);
  console.log(changedArcs.slice(0, 30).join('\n'));
}
run().catch(e => { console.error(e); process.exit(1); });
