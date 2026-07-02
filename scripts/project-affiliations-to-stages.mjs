#!/usr/bin/env node
// P3a：把卡 staticProfile.affiliations 投影进 stage canon.characters[].affiliations，
// 并为新势力铸 faction id/category、补进相关 stage canon.factions。
// merge(不覆盖已有,按 factionId 去重)、幂等。默认 dry-run，--apply 才写。
// 用法：node scripts/project-affiliations-to-stages.mjs [--apply]
import fs from 'node:fs';
import crypto from 'node:crypto';
import { join, resolve } from 'node:path';

const APPLY = process.argv.includes('--apply');
const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const BOOKS = ['qingyu', 'yunlong', 'yange'];

// category(en) → faction def type(zh)
const TYPE_ZH = { sect: '宗门', clan: '家族', military: '军队', polity: '势力', organization: '组织' };
const guessCat = (n) => {
  if (/军$|营$|卫$|骑$|兵$|效节|天策府|府兵/.test(n)) return 'military';
  if (/朝廷|京兆府|州府|官府|刑部|大理寺|六扇门|兰台|王国|藩镇|平卢|魏博|昭南/.test(n)) return 'polity';
  if (/侯府$|家$|氏$|族$/.test(n)) return 'clan';
  if (/宗$|观$|寺$|教$|门$|派$|阁$|殿$|丛林/.test(n)) return 'sect';
  return 'organization'; // 行/钱庄/商会/镖局/堂/院/会/社/盟/势力/集团/游侠/帮…
};
const slug = (n) => 'liuchao.faction.x' + crypto.createHash('md5').update(n).digest('hex').slice(0, 10);

// 载入 stage
const stages = [];
const canonFac = new Map(); // name -> {id, category}
for (const b of BOOKS) { const dir = join(gen, b, 'stages');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json') && !x.endsWith('.uncertainties.json'))) {
    const p = join(dir, f); const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    stages.push({ p, m });
    for (const fa of m.canon.factions || []) if (!canonFac.has(fa.name)) canonFac.set(fa.name, { id: fa.id, category: fa.category || guessCat(fa.name) });
  }
}
// 卡 affiliations：canonicalName/alias -> [{faction,role}]
const cards = JSON.parse(fs.readFileSync(join(gen, 'character-canon/character-cards-v3.json'), 'utf8'));
const affByName = new Map();
for (const c of cards.characters) { const list = c.staticProfile.affiliations || []; if (!list.length) continue;
  affByName.set(c.canonicalName, list); for (const a of c.aliases || []) if (!affByName.has(a)) affByName.set(a, list); }

// faction 名 -> {id,category}（含新铸）
const minted = new Map(); // name -> {id,category}
function facOf(name) {
  if (canonFac.has(name)) return canonFac.get(name);
  if (minted.has(name)) return minted.get(name);
  const rec = { id: slug(name), category: guessCat(name) }; minted.set(name, rec); return rec;
}

let projWrites = 0, facDefsAdded = 0, charsTouched = 0, stagesTouched = 0;
for (const { p, m } of stages) {
  let stageChanged = false;
  const facById = new Set((m.canon.factions || []).map(f => f.id));
  for (const c of m.canon.characters || []) {
    const list = affByName.get(c.name); if (!list) continue;
    const existing = c.affiliations || [];
    const seen = new Set(existing.map(a => a.factionId));
    let added = false;
    for (const a of list) {
      if (!a.faction) continue;
      const { id, category } = facOf(a.faction);
      if (seen.has(id)) continue; seen.add(id);
      existing.push({ factionId: id, category, role: a.role || '' });
      projWrites++; added = true;
      // 确保该 stage 有此 faction def
      if (!facById.has(id)) {
        facById.add(id);
        if (APPLY) (m.canon.factions = m.canon.factions || []).push({ id, name: a.faction, description: '', type: TYPE_ZH[category] || '组织', features: [] });
        facDefsAdded++;
      }
    }
    if (added) { c.affiliations = existing; charsTouched++; stageChanged = true; }
  }
  if (stageChanged) { stagesTouched++; if (APPLY) fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n'); }
}
console.log(`=== P3a 投影 ${APPLY ? '(已写)' : '(DRY-RUN)'} ===`);
console.log(`投影写入 affiliations:${projWrites} | 新铸 faction:${minted.size} | faction def 补进 stage:${facDefsAdded} | 触及角色档:${charsTouched} | 触及关卡:${stagesTouched}`);
if (!APPLY) console.log(`新铸示例:`, [...minted.entries()].slice(0, 20).map(([n, v]) => `${n}:${v.category}`).join(' | '));
