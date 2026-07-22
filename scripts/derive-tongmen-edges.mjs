#!/usr/bin/env node
// P3b：由 stage affiliations 通用派生同门/同族/同袍关系边。
// 保守策略：只 sect/clan/military；排除挂 ≥3 个 sect 的仪式性成员(如杨玉环授箓6道派)；
// 只落两人共同关卡、与已有边去重、幂等(标 tag「同势力派生」可重生)。默认 dry-run，--apply 才写。
// 用法：node scripts/derive-tongmen-edges.mjs [--apply]
import fs from 'node:fs';
import { join, resolve } from 'node:path';

const APPLY = process.argv.includes('--apply');
const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');

const CAT_TAG = { sect: '同门', clan: '同族', military: '同袍' };
const TYPE_TO_CAT = { 宗门: 'sect', 门派: 'sect', 家族: 'clan', 军队: 'military' };
const catOf = (fa) => fa.category || TYPE_TO_CAT[fa.type] || null;
const RELATIONSHIP_TIME_GATE_CHARACTERS = new Map([
  ['lyl.lin_an_bridge', new Set(['liuchao.character.ruan_xiang_ning'])],
  ['lyl.xiaoyingzhou_blacksea_trap', new Set(['liuchao.character.ruan_xiang_ning'])],
]);

// 卡：每角色 sect 归属数（仪式性过滤）
const cards = JSON.parse(fs.readFileSync(join(gen, 'character-canon/character-cards-v3.json'), 'utf8'));
const sectCount = new Map();
const guessSect = (n) => /宗$|观$|寺$|教$|门$|派$|阁$|殿$|丛林|观堂/.test(n);
for (const c of cards.characters) {
  const s = (c.staticProfile.affiliations || []).filter(a => guessSect(a.faction)).length;
  if (s) sectCount.set(c.canonicalName, s);
}

const stages = [];
for (const b of ['qingyu', 'yunlong', 'yange']) { const dir = join(gen, b, 'stages');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json') && !x.endsWith('.uncertainties.json')))
    stages.push({ p: join(dir, f), m: JSON.parse(fs.readFileSync(join(dir, f), 'utf8')) });
}

let added = 0, stagesTouched = 0; const perTag = {}; const sample = [];
for (const { p, m } of stages) {
  const gatedCharacters = RELATIONSHIP_TIME_GATE_CHARACTERS.get(m.manifest.id);
  const facCat = new Map((m.canon.factions || []).map(fa => [fa.id, catOf(fa)]));
  const idName = new Map((m.canon.characters || []).map(c => [c.id, c.name]));
  // 已有边(无向)
  const existing = new Set();
  for (const e of m.canon.relationships || []) if (e.fromCharacterId && e.toCharacterId) existing.add([e.fromCharacterId, e.toCharacterId].sort().join('|'));
  // 每 faction 的在场成员(按 category 过滤 + 仪式性过滤 + clan 仆从过滤)
  const SERVANT = /奴婢|奴|仆|婢|家丁|护卫|客卿|门客|家将|随从|扈从|护院|丫头|家仆|部曲/;
  const byFac = {};
  for (const c of m.canon.characters || []) for (const a of c.affiliations || []) {
    if (gatedCharacters?.has(c.id)) continue;
    const cat = facCat.get(a.factionId); if (!cat || !CAT_TAG[cat]) continue;
    if (cat === 'sect' && (sectCount.get(idName.get(c.id)) || 0) >= 3) continue; // 仪式性挂籍排除
    if (cat === 'clan' && SERVANT.test(a.role || '')) continue; // 家族仆从不算血亲同族
    (byFac[a.factionId] = byFac[a.factionId] || []).push(c.id);
  }
  const newRels = [];
  for (const [fid, ids] of Object.entries(byFac)) {
    if (ids.length < 2) continue; const cat = facCat.get(fid); const tag = CAT_TAG[cat];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const key = [ids[i], ids[j]].sort().join('|'); if (existing.has(key)) continue; existing.add(key);
      newRels.push({ fromCharacterId: ids[i], toCharacterId: ids[j], relation: tag, score: 30, direction: 'bidirectional', tags: [tag, '同势力派生'] });
      added++; perTag[tag] = (perTag[tag] || 0) + 1;
      if (sample.length < 15) sample.push(`[${m.manifest.id}] ${idName.get(ids[i])}—${tag}—${idName.get(ids[j])}`);
    }
  }
  if (newRels.length) { stagesTouched++; if (APPLY) { m.canon.relationships = (m.canon.relationships || []).concat(newRels); fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n'); } }
}
console.log(`=== P3b 同门派生 ${APPLY ? '(已写)' : '(DRY-RUN)'} ===`);
console.log(`新增边:${added} | 分布:${JSON.stringify(perTag)} | 触及关卡:${stagesTouched}`);
if (!APPLY) console.log('样例:\n  ' + sample.join('\n  '));
