#!/usr/bin/env node
// 一次性迁移 v2（保留作审计）：按 2026-10-16 16:31/16:32 用户裁定复核 split-polysemous-item-ids.mjs 的映射表。
// 裁定：名称或描述文字不一致就不是同一个东西，一律拆独立 id；不借用别的已有 id，也不改指向带标签的药。
//
// 判定口径（逐字，只忽略纯空白）：
//   1. 上一轮映射表（POLYSEMY-SPLIT-MAP.md 第一张表）的每一行，取 327376b9 之前总表里的变体原文，
//      与改指目标的现行主定义比对名称 + description：
//        两项都一致 → 保留改指；
//        另有同名条目两项都一致 → 改指到它（本轮没有出现）；
//        只差标点 → 待裁定，保持原状（本轮没有出现）；
//        其余 → 拆为新建独立 id。
//   2. 暂缓 4 行：新建独立 id，不带 effectTags/onUse。
//   3. 现行总表里「名称相同、描述不同」的变体（backpack、coral_dagger 等）：各按描述拆独立 id，描述相同的共用一个。
//   4. 已是新建的 7 个 id：核对每个来源变体的名称+描述与新 id 定义一致。
// 新建条目的定义取自变体原文，不带效果标签；变体全部拆完后 pendingRename 清空。
//
// 改动面同 v1：mod-kit/entity-catalog/items.json、stage-access.json、validation.config.json、
//   canon-authority-overlays/<stage>.json、mod-kit/generated/.../stages/*.json（gitignored 源）；
//   builtins 由 syncBuiltinModData 重新生成。
//
// 已于 2026-10-16 执行；落盘后再跑会因「新 id 已存在」报错，仅作审计。
// 用法：node scripts/split-polysemous-item-ids-v2.mjs            干跑，只打印
//       node scripts/split-polysemous-item-ids-v2.mjs --apply    落盘（先备份到 _newbot_tmp/backup-1016h/）
//       --report=<path>                                           另写「复核后」Markdown 表
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const APPLY = process.argv.includes('--apply');
const reportArg = process.argv.find(a => a.startsWith('--report='))?.slice(9);
const BASE = '327376b9^'; // v1 迁移之前
const MAP_DOC = 'docs/handoffs/2026-10-16/POLYSEMY-SPLIT-MAP.md';
const LEDGER = 'docs/handoffs/2026-10-16/polysemy-review-rows.json';
const J = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
const W = (p, o) => writeFileSync(join(root, p), `${JSON.stringify(o, null, 2)}\n`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const bookOf = id => id.split('.')[0];
const ws = s => String(s ?? '').replace(/\s+/g, '');
const punctless = s => ws(s).replace(/[\p{P}\p{S}]/gu, '');
const tagged = d => d.effectTags !== undefined || d.onUse !== undefined;
const strip = d => JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'id').sort()));

// 拆出的独立 id（语义 slug，前缀按所在关卡的书系）。键 = 该组第一行的 `旧id@关卡`，同组（名称+描述+其余字段全同）共用。
const SLUGS = {
  'lyg.item.np068@lyg.changgan_begins': 'lyg.item.six_sense_seal_pill',
  'lcq.item.np007@lcq.stage_04': 'lcq.item.zhulu_snake_pill',
  'lyg.item.np014@lyg.dingtao_beijing': 'lyg.item.green_dragon_blade_huaxiong',
  'lcq.item.backpack@lcq.stage_02': 'lcq.item.backpack_plain',
  'liuchao.item.coral_dagger@lyl.jiangzhou_retreat': 'lyl.item.coral_dagger_from_xiao_yaoyi',
  'liuchao.item.coral_dagger@lyl.lin_an_black_sea': 'lyl.item.coral_dagger_carried',
  'lyl.item.coral_dagger@lyl.taiquan_core_conflict': 'lyl.item.coral_dagger_cuts_vine',
};

const catalog = J('mod-kit/entity-catalog/items.json');
const access = J('mod-kit/entity-catalog/stage-access.json');
const cfg = J('mod-kit/entity-catalog/validation.config.json');
const oldCatalog = JSON.parse(execFileSync('git', ['show', `${BASE}:mod-kit/entity-catalog/items.json`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }));
const oldAccess = JSON.parse(execFileSync('git', ['show', `${BASE}:mod-kit/entity-catalog/stage-access.json`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }));
const byId = new Map(catalog.entries.map(e => [e.id, e]));
const oldById = new Map(oldCatalog.entries.map(e => [e.id, e]));

// ───── 1. 读上一轮映射表 ─────
const prev = [];
for (const line of readFileSync(join(root, MAP_DOC), 'utf8').split('\n')) {
  if (!line.startsWith('| ')) { if (prev.length) break; else continue; }
  const c = line.split('|').map(s => s.trim());
  const m = c[3].match(/^`([^`]+)`（.*）$/);
  if (!m || c[1] === '类别') continue;
  prev.push({ kind: c[1], stage: c[2], id: m[1], to: c[4], home: (c[5].match(/`([^`]+)`/) || [])[1] });
}
if (prev.length !== 107) throw new Error(`上一轮映射表应为 107 行，读到 ${prev.length}`);

// ───── 2. 复核 ─────
const rows = []; // {stage, id(旧), curId(现行关卡里实际引用的 id), variant, prevKind, prevHome, verdict, home, why}
for (const p of prev) {
  const v = oldById.get(p.id)?.stageVariants[p.stage];
  if (!v || v.name !== p.to) throw new Error(`旧总表里找不到变体原文：${p.id}@${p.stage}`);
  const r = { stage: p.stage, id: p.id, variant: v, prevKind: p.kind, prevHome: p.home, curId: p.home || p.id };
  const t = p.home && byId.get(p.home)?.definition;
  if (!p.home) {
    const twins = catalog.entries.filter(e => ws(e.definition.name) === ws(v.name) && ws(e.definition.description) === ws(v.description)).map(e => `${e.id}${tagged(e.definition) ? '（带标签）' : ''}`);
    r.verdict = 'split'; r.why = `暂缓行：按裁定拆独立 id，不带标签${twins.length ? `；总表里名称+描述逐字相同的已有条目：${twins.join('、')}` : ''}`;
  }
  else {
    if (!t) throw new Error(`改指目标不在总表：${p.home}`);
    const nameOk = ws(t.name) === ws(v.name), descOk = ws(t.description) === ws(v.description);
    if (nameOk && descOk) { r.verdict = 'keep'; r.home = p.home; r.why = p.kind === '新建' ? '新建 id 的名称+描述与来源变体逐字一致' : '名称+描述与目标定义逐字一致'; }
    else {
      const alt = nameOk && catalog.entries.find(e => e.id !== p.id && e.id !== p.home && ws(e.definition.name) === ws(v.name) && ws(e.definition.description) === ws(v.description));
      if (alt) { r.verdict = 'repoint'; r.home = alt.id; r.why = `目标 ${p.home} 描述不一致，改指描述逐字一致的 ${alt.id}`; }
      else if (punctless(t.name) === punctless(v.name) && punctless(t.description) === punctless(v.description)) { r.verdict = 'pending'; r.home = p.home; r.why = '仅标点差异，待裁定，保持原状'; }
      else { r.verdict = 'split'; r.why = nameOk ? `名称相同但描述不一致（目标：${t.description}）` : `名称不一致（目标：${t.name}）`; }
    }
  }
  rows.push(r);
}
// 现行总表里「名称相同、描述不同」的变体
const reviewed = new Set(prev.map(p => `${p.id}@${p.stage}`)); // 暂缓 4 行的改名变体仍在总表里，已在上面处理
for (const e of catalog.entries) for (const [st, v] of Object.entries(e.stageVariants)) {
  if (reviewed.has(`${e.id}@${st}`)) continue;
  if (ws(v.name) !== ws(e.definition.name)) throw new Error(`现行总表仍有改名变体：${e.id}@${st}`);
  if (ws(v.description) === ws(e.definition.description)) throw new Error(`变体与主定义无差异，需先人工处理：${e.id}@${st}`);
  rows.push({ stage: st, id: e.id, variant: v, prevKind: '同名异描述', prevHome: e.id, curId: e.id, verdict: 'split', why: `名称相同但描述不一致（主定义：${e.definition.description}）` });
}

// ───── 3. 拆分分组与新 id ─────
const groups = new Map(); // strip(variant) -> {slug, rows}
for (const r of rows.filter(r => r.verdict === 'split')) {
  if (tagged(r.variant)) throw new Error(`变体自带效果标签，不应拆成新 id：${r.id}@${r.stage}`);
  const key = strip(r.variant);
  if (!groups.has(key)) groups.set(key, { rows: [] });
  groups.get(key).rows.push(r);
}
const nameDesc = new Map();
for (const g of groups.values()) {
  const slugs = new Set(g.rows.map(r => SLUGS[`${r.id}@${r.stage}`]).filter(Boolean));
  if (slugs.size !== 1) throw new Error(`同组变体需要且只能有一个 slug：${g.rows.map(r => `${r.id}@${r.stage}`).join(', ')} → ${[...slugs]}`);
  g.slug = [...slugs][0];
  const v = g.rows[0].variant, k = `${ws(v.name)}|${ws(v.description)}`;
  if (nameDesc.has(k)) throw new Error(`名称+描述相同但其余字段不同的两组，需人工决定：${g.slug} / ${nameDesc.get(k)}`);
  nameDesc.set(k, g.slug);
  if (byId.has(g.slug)) throw new Error(`新 id 已存在：${g.slug}`);
  for (const r of g.rows) if (bookOf(g.slug) !== bookOf(r.stage)) throw new Error(`新 id 前缀与关卡书系不符：${g.slug}@${r.stage}`);
  for (const r of g.rows) r.home = g.slug;
}
for (const slug of Object.values(SLUGS)) if (![...groups.values()].some(g => g.slug === slug)) throw new Error(`未使用的 slug：${slug}`);

// ───── 4. 关卡级重映射表 ─────
const stageMap = new Map(); // stage -> Map(现行引用 id -> 新引用 id)
for (const r of rows.filter(r => r.verdict === 'split' || r.verdict === 'repoint')) {
  if (r.curId === r.home) continue;
  if (!stageMap.has(r.stage)) stageMap.set(r.stage, new Map());
  const m = stageMap.get(r.stage);
  if (m.has(r.curId) && m.get(r.curId) !== r.home) throw new Error(`${r.stage}: ${r.curId} 同时要改指两个 id`);
  m.set(r.curId, r.home);
  // v1 已把别的行折进了 prevHome：若旧关卡里本来就有 prevHome 自己的引用，改指会误伤，须人工处理
  if (r.prevHome && r.prevHome !== r.id && oldAccess.stages[r.stage].items.some(x => x.id === r.prevHome)) throw new Error(`${r.stage}: 旧关卡里本来就引用了 ${r.prevHome}，不能整体改指`);
}
// 拆出来的变体：关卡里的旧 id 不再有同名主定义，所以只需把引用换成新 id（旧 id 在该关卡里原本就指向这个变体）
const uniq = arr => [...new Set(arr)];
const mapIds = (ids, m) => uniq(ids.map(x => m.get(x) ?? x));
function remapDeep(o, m) {
  if (Array.isArray(o)) return o.map(x => remapDeep(x, m));
  if (!o || typeof o !== 'object') return o;
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k,
    k === 'itemIds' && Array.isArray(v) ? mapIds(v, m) : k === 'contentId' && typeof v === 'string' ? (m.get(v) ?? v) : remapDeep(v, m)]));
}
function remapAccess(refs, m, stage) {
  const out = [];
  for (const r of refs) {
    const id = m.get(r.id) ?? r.id, hit = out.find(x => x.id === id);
    if (!hit) out.push({ ...r, id });
    else if (!same({ ...hit, id: 0 }, { ...r, id: 0 })) throw new Error(`${stage}: ${id} 合并时 availableWhen/revealWhen 冲突`);
  }
  return out;
}
function remapContentAccess(list, m, stage) {
  const out = [];
  for (const e of list) {
    const c = { ...e, contentId: m.get(e.contentId) ?? e.contentId }, hit = out.find(x => x.contentId === c.contentId);
    if (!hit) out.push(c);
    else if (!same(hit, c)) throw new Error(`${stage}: contentAccess ${c.contentId} 合并时规则冲突`);
  }
  return out;
}
function leftovers(o, ids, path = '', out = []) { // 改完后仍残留的旧 id（说明有没覆盖到的引用位置）
  if (Array.isArray(o)) o.forEach((x, i) => leftovers(x, ids, `${path}[${i}]`, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) leftovers(v, ids, `${path}.${k}`, out);
  else if (typeof o === 'string' && ids.has(o)) out.push(`${path}=${o}`);
  return out;
}

// ───── 5. 新总表 ─────
const nextCatalog = structuredClone(catalog);
const nextById = new Map(nextCatalog.entries.map(e => [e.id, e]));
for (const r of rows.filter(r => r.prevKind === '同名异描述' || (r.verdict === 'split' && !r.prevHome)))
  delete nextById.get(r.id).stageVariants[r.stage];
for (const g of groups.values()) {
  const def = { ...g.rows[0].variant, id: g.slug };
  const entry = {
    id: g.slug, aliases: [], definition: def, stageVariants: {}, authoritySource: 'mod-kit/entity-catalog/items.json',
    migratedFrom: g.rows.map(r => `src/modules/scenarioMods/builtins/data/${r.stage}.json#content.items[id=${r.id}]`),
  };
  let at = -1; nextCatalog.entries.forEach((e, i) => { if (bookOf(e.id) === bookOf(g.slug)) at = i; });
  nextCatalog.entries.splice(at + 1, 0, entry);
}
nextCatalog.entries.forEach(e => nextById.set(e.id, e));
const nextAccess = structuredClone(access);
const genFiles = new Map();
for (const book of ['qingyu', 'yunlong', 'yange']) {
  const dir = `mod-kit/generated/deepseek-v4-flash/${book}/stages`;
  for (const f of readdirSync(join(root, dir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) genFiles.set(J(`${dir}/${f}`).manifest.id, `${dir}/${f}`);
}
const writes = [], stats = [];
for (const [stage, m] of stageMap) {
  nextAccess.stages[stage].items = remapAccess(access.stages[stage].items, m, stage);
  const gpath = genFiles.get(stage);
  if (!gpath) throw new Error(`找不到生成源：${stage}`);
  const mod = J(gpath);
  for (const c of mod.canon.characters) if (c.itemIds) c.itemIds = mapIds(c.itemIds, m);
  if (mod.rules?.contentAccess) mod.rules.contentAccess = remapContentAccess(mod.rules.contentAccess, m, stage);
  mod.content.items = nextAccess.stages[stage].items.map(ref => ({ ...JSON.parse(JSON.stringify(nextById.get(ref.id).definition)), ...ref }));
  const opath = `mod-kit/canon-authority-overlays/${stage}.json`;
  const ov = existsSync(join(root, opath)) ? { ...J(opath) } : null;
  if (ov) ov.ops = remapDeep(ov.ops, m);
  const bad = [...leftovers(mod, new Set(m.keys())).map(s => `${gpath}${s}`), ...(ov ? leftovers(ov, new Set(m.keys())).map(s => `${opath}${s}`) : [])];
  if (bad.length) throw new Error(`改指后仍有旧 id 残留（未覆盖的引用位置）：\n${bad.join('\n')}`);
  writes.push([gpath, mod]); if (ov) writes.push([opath, ov]);
  stats.push(`${stage}: ${[...m].map(([a, b]) => `${a}→${b}`).join(', ')}`);
}
// 终态自检：总表不再有任何变体；关卡内无重复 id
for (const e of nextCatalog.entries) if (Object.keys(e.stageVariants).length) throw new Error(`终态仍有变体：${e.id}`);
for (const [st, c] of Object.entries(nextAccess.stages)) { const ids = c.items.map(r => r.id); if (new Set(ids).size !== ids.length) throw new Error(`${st} 有重复 id`); for (const id of ids) if (!nextById.has(id)) throw new Error(`${st} 引用了不存在的 ${id}`); }
const nextCfg = structuredClone(cfg); nextCfg.variantIdentity.pendingRename = [];

// ───── 6. 报告 ─────
const count = v => rows.filter(r => r.verdict === v).length;
console.log(`复核 ${rows.length} 行（旧映射表 ${prev.length} + 同名异描述变体 ${rows.length - prev.length}）：保留 ${count('keep')}、改指他处 ${count('repoint')}、拆独立 id ${count('split')}、待裁定 ${count('pending')}`);
console.log(`新建独立 id ${groups.size} 个：`);
for (const g of groups.values()) console.log(`  ${g.slug}  「${g.rows[0].variant.name}」 ← ${g.rows.map(r => `${r.id}@${r.stage}`).join(', ')}`);
console.log(stats.join('\n'));
const nm = id => nextById.get(id)?.definition.name ?? id;
if (reportArg) {
  const L = ['| 结论 | 来源 | 关卡 | 旧 id（主定义名） | 变体原文名称 | 最终 id | 依据 |', '|---|---|---|---|---|---|---|'];
  const label = { keep: '保留改指', repoint: '改指他处', split: '拆独立 id', pending: '待裁定' };
  for (const r of rows.slice().sort((a, b) => `${a.verdict}|${a.stage}|${a.id}`.localeCompare(`${b.verdict}|${b.stage}|${b.id}`)))
    L.push(`| ${label[r.verdict]} | ${r.prevKind} | ${r.stage} | \`${r.id}\`（${nm(r.id)}） | ${r.variant.name} | \`${r.home}\` | ${r.why} |`);
  writeFileSync(resolve(root, reportArg), `${L.join('\n')}\n`);
}
const ledger = rows.map(r => ({ stage: r.stage, oldId: r.id, prevKind: r.prevKind, verdict: r.verdict, finalId: r.home, name: r.variant.name, description: r.variant.description }));
if (!APPLY) { console.log('（干跑，未落盘；加 --apply 落盘）'); process.exit(0); }

// ───── 7. 落盘 ─────
const bak = join(root, '_newbot_tmp/backup-1016h');
for (const p of ['mod-kit/entity-catalog/items.json', 'mod-kit/entity-catalog/stage-access.json', 'mod-kit/entity-catalog/validation.config.json', ...writes.map(w => w[0])]) {
  const dest = join(bak, p); mkdirSync(dirname(dest), { recursive: true });
  if (!existsSync(dest)) copyFileSync(join(root, p), dest);
}
W('mod-kit/entity-catalog/items.json', nextCatalog);
W('mod-kit/entity-catalog/stage-access.json', nextAccess);
W('mod-kit/entity-catalog/validation.config.json', nextCfg);
for (const [p, o] of writes) W(p, o);
W(LEDGER, ledger);
const { syncBuiltinModData } = await import('./sync-builtin-mods.mjs');
const r = await syncBuiltinModData();
console.log(`builtins 已由生成源重新同步：${r.ids.length} 个，version=${r.version}`);
