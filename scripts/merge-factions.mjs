#!/usr/bin/env node
// P0 势力去重：把重复/空壳 faction 重定向到规范 id，并归一 stage 内的所有引用。
// 覆盖 factions[].id / affiliations[].factionId / factionRelationships[].from|toFactionId / relatedFactionIds[]。
// 用法：node scripts/merge-factions.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const gen = resolve(import.meta.dirname, '..', 'mod-kit/generated/deepseek-v4-flash');
const BOOKS = ['qingyu', 'yunlong', 'yange'];

// old id -> new id
const MAP = {
  'liuchao.faction.han_tang': 'liuchao.faction.han_guo_chao_ting',   // 汉廷→汉国朝廷
  'lyg.faction.han_state': 'liuchao.faction.han_guo_chao_ting',      // 汉国→汉国朝廷
  'lcq.faction.left_army': 'lcq.faction.left_guard',                 // 左武军第一军团→左武军
  'lyl.faction.heimo_hai': 'liuchao.faction.hei_mo_hai',             // 黑魔海毒宗→黑魔海
  'liuchao.faction.du_zong': 'liuchao.faction.hei_mo_hai',           // 毒宗→黑魔海
  'liuchao.faction.song_court': 'lyg.faction.song_state',            // 宋国朝廷→宋国
  'liuchao.faction.song_army': 'lyg.faction.song_state',             // 宋军→宋国
  'liuchao.faction.lv_shi_ji_tuan': 'lyl.faction.lyu_clan',          // 吕氏集团→吕氏(id保留refs更多者)
};
// 规范名（合并目标统一命名；含单纯改名 lyu_clan→吕氏外戚集团）
const CANON_NAME = {
  'liuchao.faction.han_guo_chao_ting': '汉国朝廷',
  'lcq.faction.left_guard': '左武军',
  'liuchao.faction.hei_mo_hai': '黑魔海',
  'lyg.faction.song_state': '宋国',
  'lyl.faction.lyu_clan': '吕氏外戚集团',
};

let filesChanged = 0, defsRemoved = 0, affDeduped = 0, relSelfLoop = 0, relDeduped = 0, arrDeduped = 0;

for (const book of BOOKS) {
  const dir = join(gen, book, 'stages');
  for (const f of readdirSync(dir).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
    const p = join(dir, f);
    let raw = readFileSync(p, 'utf8');
    const before = raw;
    // 1) 全 token 替换（带引号，避免 id 子串误伤）
    for (const [oldId, newId] of Object.entries(MAP)) raw = raw.split(`"${oldId}"`).join(`"${newId}"`);
    const m = JSON.parse(raw);
    const canon = m.canon || {};

    // 2) 去重 factions（按 id，保留字段更全者），并强制规范名
    if (Array.isArray(canon.factions)) {
      const byId = new Map();
      for (const fac of canon.factions) {
        const ex = byId.get(fac.id);
        if (!ex) byId.set(fac.id, fac);
        else { defsRemoved++; if (JSON.stringify(fac).length > JSON.stringify(ex).length) byId.set(fac.id, fac); }
      }
      for (const [id, fac] of byId) if (CANON_NAME[id]) fac.name = CANON_NAME[id];
      canon.factions = [...byId.values()];
    }

    // 3) 角色 affiliations 去重（factionId+category）
    for (const c of canon.characters || []) {
      if (!Array.isArray(c.affiliations)) continue;
      const seen = new Set(); const out = [];
      for (const a of c.affiliations) {
        const k = `${a.factionId}|${a.category || ''}`;
        if (seen.has(k)) { affDeduped++; continue; }
        seen.add(k); out.push(a);
      }
      c.affiliations = out;
    }

    // 4) factionRelationships：删自环 + 去重(from|to 无向)
    if (Array.isArray(canon.factionRelationships)) {
      const seen = new Set(); const out = [];
      for (const r of canon.factionRelationships) {
        if (r.fromFactionId === r.toFactionId) { relSelfLoop++; continue; }
        const k = [r.fromFactionId, r.toFactionId].sort().join('|');
        if (seen.has(k)) { relDeduped++; continue; }
        seen.add(k); out.push(r);
      }
      canon.factionRelationships = out;
    }

    // 5) 递归去重所有 relatedFactionIds 数组
    const walk = (o) => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (o && typeof o === 'object') {
        for (const [k, v] of Object.entries(o)) {
          if (k === 'relatedFactionIds' && Array.isArray(v)) {
            const u = [...new Set(v)]; if (u.length !== v.length) arrDeduped += v.length - u.length; o[k] = u;
          } else walk(v);
        }
      }
    };
    walk(canon);

    const out = JSON.stringify(m, null, 2) + '\n';
    if (out !== before) { writeFileSync(p, out); filesChanged++; }
  }
}
console.log(`改动文件:${filesChanged} | 删重复def:${defsRemoved} | affiliations去重:${affDeduped} | 删自环关系:${relSelfLoop} | 关系去重:${relDeduped} | 数组去重:${arrDeduped}`);

// 校验：残留 old id?
let residual = 0;
for (const book of BOOKS) { const dir = join(gen, book, 'stages');
  for (const f of readdirSync(dir).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
    const raw = readFileSync(join(dir, f), 'utf8');
    for (const oldId of Object.keys(MAP)) if (raw.includes(`"${oldId}"`)) { console.log(`⚠ 残留 ${oldId} in ${f}`); residual++; }
  }
}
console.log(residual ? `⚠ 残留 ${residual}` : '✓ 无残留 old id');
