#!/usr/bin/env node
// 按六朝高手榜 roster 对齐 canon 角色 realm(战力档=高手榜级)。
// 默认 dry-run 只报告;加 --apply 才写 stage 文件。用法:node scripts/align-realms-to-gaoshoubang.mjs [--apply]
import fs from 'node:fs';
import { join, resolve } from 'node:path';

const APPLY = process.argv.includes('--apply');
const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const BOOKS = ['qingyu', 'yunlong', 'yange'];

const roster = JSON.parse(fs.readFileSync(join(gen, 'character-canon/gaoshoubang-roster.json'), 'utf8'));
const reg = JSON.parse(fs.readFileSync(join(root, 'src/modules/scenarioMods/builtins/character-registry.json'), 'utf8'));

// 名/别名 → 规范名(用 registry)
const toCanon = new Map();
for (const c of reg.characters) { toCanon.set(c.canonicalName, c.canonicalName); for (const a of c.aliases || []) if (!toCanon.has(a)) toCanon.set(a, c.canonicalName); }
const canonName = (n) => toCanon.get(n) || n;

// roster: 规范名 → 目标 realm(跳过 废)
const target = new Map(); const unresolved = [];
for (const e of roster.entries) {
  if (e.status === '废') continue;
  const cn = canonName(e.name) !== e.name ? canonName(e.name) : (e.alias && toCanon.has(e.alias) ? toCanon.get(e.alias) : canonName(e.name));
  target.set(cn, { realm: e.realm, from: e.name });
}

// 遍历 stage,收集每角色现 realm + 出现文件
const occur = new Map(); // canonName -> {realms:Set, files:[{path,idx,cur}]}
const files = {};
for (const b of BOOKS) { const dir = join(gen, b, 'stages');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json') && !x.endsWith('.uncertainties.json'))) {
    const p = join(dir, f); const m = JSON.parse(fs.readFileSync(p, 'utf8')); files[p] = m;
    (m.canon?.characters || []).forEach((c) => {
      const cn = canonName(c.name);
      if (!occur.has(cn)) occur.set(cn, { realms: new Set(), refs: [] });
      occur.get(cn).realms.add(c.realm || '(无)');
      occur.get(cn).refs.push({ p, c });
    });
  }
}

// 方案B阈值:仅当 榜realm≥化神 或 榜比现峰值高≥2档 才对齐(保留弱起弧/小差距角色)
const RANK = { 凡人: 0, 练气: 1, 筑基: 2, 金丹: 3, 元婴: 4, 化神: 5, 炼虚: 6, 合体: 7, 渡劫: 8 };
const HUASHEN = 5;

const changes = [], noMatchRoster = [], sameAlready = [], belowThreshold = [];
for (const [cn, t] of target) {
  const oc = occur.get(cn);
  if (!oc) { noMatchRoster.push(`${t.from}${cn !== t.from ? '→' + cn : ''} (榜:${t.realm}) 无对应 canon 角色`); continue; }
  const curSet = [...oc.realms];
  if (curSet.length === 1 && curSet[0] === t.realm) { sameAlready.push(cn); continue; }
  const targetRank = RANK[t.realm] ?? 0;
  const peakRank = Math.max(-1, ...curSet.map(r => RANK[r] ?? -1));
  const pass = targetRank >= HUASHEN || (targetRank - peakRank) >= 2;
  if (!pass) { belowThreshold.push(`${cn}: ${curSet.join('/')} → 榜${t.realm}(峰值差${targetRank - peakRank},未达阈值,跳过)`); continue; }
  changes.push({ cn, from: curSet.join('/'), to: t.realm, n: oc.refs.length });
  if (APPLY) for (const r of oc.refs) r.c.realm = t.realm;
}

if (APPLY) { for (const [p, m] of Object.entries(files)) fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n'); }

console.log(`=== 高手榜 realm 对齐 ${APPLY ? '(已写入)' : '(DRY-RUN)'} ===`);
console.log(`roster(非废):${target.size} | 达阈值改:${changes.length} | 已一致:${sameAlready.length} | 未达阈值跳过:${belowThreshold.length} | 无对应canon:${noMatchRoster.length}`);
console.log('\n--- 达阈值·对齐(现→榜) ---');
changes.sort((a, b) => (RANK[b.to] ?? 0) - (RANK[a.to] ?? 0) || a.cn.localeCompare(b.cn, 'zh')).forEach(c => console.log(`  ${c.cn}: ${c.from} → ${c.to}  (${c.n}处)`));
console.log('\n--- 未达阈值·保留(弱起弧/小差距) ---');
belowThreshold.forEach(x => console.log('  ' + x));
console.log('\n--- roster 无对应 canon 角色(转录名可能有误/非登场角色) ---');
noMatchRoster.forEach(x => console.log('  ' + x));
