#!/usr/bin/env node

// Roadmap #5 (relations matrix): derive canon.factionRelationships from character data.
// For each stage, aggregate the relationship edges between members of different factions
// (extraction characterStates.relationships, scored by affinity) into a faction-to-faction
// score, mapped to the game's SectRelationship vocabulary (仇敌…盟友). Needs the schema PR
// that added canon.factionRelationships. Deterministic. 补空不覆盖.
//
// Usage: node scripts/derive-faction-relationships.mjs [book...] [--dry-run]

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const bookArgs = argv.filter(a => !a.startsWith('--'));
const allBooks = [{ id: 'qingyu' }, { id: 'yunlong' }, { id: 'yange' }];
const books = allBooks.filter(b => bookArgs.length === 0 || bookArgs.includes(b.id));

async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

function affinity(relation) {
  const r = relation || '';
  if (/情人|爱人|伴侣|性伴侣|夫妻|妻|夫|挚爱|恋|红颜|男女/.test(r)) return 75;
  if (/亲人|父|母|兄|弟|姐|妹|子女|血亲|族人|家人/.test(r)) return 60;
  if (/恩人|救命|挚友|生死之交|结义|义兄|义弟/.test(r)) return 55;
  if (/师父|师尊|师徒|弟子|授业/.test(r)) return 48;
  if (/好友|好兄弟|知己|友/.test(r)) return 42;
  if (/盟友|合作|伙伴|同伴|同盟|搭档|附庸|归顺/.test(r)) return 35;
  if (/主人|主仆|雇主|雇员|下属|属下|部下|侍/.test(r)) return 25;
  if (/相识|认识|中立|陌生|点头|同行|同事/.test(r)) return 8;
  if (/对手|竞争|政敌|宿敌/.test(r)) return -20;
  if (/仇人|仇敌|敌人|死敌|宿仇|杀|背叛|出卖/.test(r)) return /施救|救|恩/.test(r) ? -10 : -55;
  return 5;
}
// game SectRelationship: 仇敌|敌对|冷淡|中立|友好|盟友|附庸
function scoreToRelation(s) {
  if (s >= 60) return '盟友';
  if (s >= 25) return '友好';
  if (s >= -10) return '中立';
  if (s >= -30) return '冷淡';
  if (s >= -55) return '敌对';
  return '仇敌';
}

for (const book of books) {
  const exDir = join(generatedRoot, book.id, 'extraction');
  const stageDir = join(generatedRoot, book.id, 'stages');
  // character → relations (name→other→relation)
  const charRel = [];
  for (const f of (await readdir(exDir)).filter(n => n.endsWith('.json'))) {
    const b = await readJson(join(exDir, f));
    for (const cs of b.characterStates || []) {
      if (!cs?.name) continue;
      for (const r of cs.relationships || []) if (r?.other && r?.relation) charRel.push([cs.name, r.other, r.relation]);
    }
  }

  let total = 0;
  for (const fn of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
    const mod = await readJson(join(stageDir, fn));
    if ((mod.canon?.factionRelationships || []).length) continue; // 补空不覆盖
    const chars = mod.canon?.characters || [];
    const factionsOf = new Map(); // char name → [factionId]
    for (const c of chars) {
      const fids = [...new Set([c.factionId, ...((c.affiliations || []).map(a => a.factionId))].filter(Boolean))];
      if (fids.length) factionsOf.set(c.name, fids);
    }
    // aggregate cross-faction edges
    const pair = new Map(); // "fa|fb"(fa<fb) → {sum,count,relations:Set}
    for (const [a, b, relation] of charRel) {
      const fa = factionsOf.get(a), fb = factionsOf.get(b);
      if (!fa || !fb) continue;
      const sc = affinity(relation);
      for (const x of fa) for (const y of fb) {
        if (x === y) continue;
        const [lo, hi] = x < y ? [x, y] : [y, x];
        const k = `${lo}|${hi}`;
        const e = pair.get(k) || { sum: 0, count: 0, rels: new Set() };
        e.sum += sc; e.count += 1; e.rels.add(relation); pair.set(k, e);
      }
    }
    const out = [];
    for (const [k, e] of pair) {
      const [from, to] = k.split('|');
      const score = Math.round(e.sum / e.count);
      out.push({ fromFactionId: from, toFactionId: to, relation: scoreToRelation(score), score, direction: 'bidirectional', tags: [...e.rels].slice(0, 3) });
    }
    if (out.length) {
      mod.canon = mod.canon || {};
      mod.canon.factionRelationships = out;
      if (!dryRun) await writeFile(join(stageDir, fn), JSON.stringify(mod, null, 2));
      total += out.length;
    }
  }
  console.log(`${book.id}: 推断势力关系 ${total} 条`);
}
console.log(dryRun ? 'DRY RUN — 未写文件。' : '势力关系矩阵已生成。');
