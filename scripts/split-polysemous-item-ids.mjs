#!/usr/bin/env node
// 一次性迁移（已执行，保留作审计）：清理总表里「同一物品 id 在不同关卡指向不同物品」的多义 id。
// 做法：变体（stageVariants）改了名称的行，把该关卡里的引用改指「同名本家」id，再删掉这条变体；
// 无本家的行新建语义 slug 条目。带标签本家会扩大标签覆盖的行，按 validation.config.json 的
// variantIdentity.pendingRename 暂缓，不动。
//
// 改动面（canon:build 的 sync 会用 stage-access.json 重写 builtins 的 content，所以必须改源头而不是 builtins）：
//   mod-kit/entity-catalog/items.json、stage-access.json、canon-authority-overlays/<stage>.json、
//   mod-kit/generated/.../stages/*.json（gitignored 源）；builtins 由 syncBuiltinModData 重新生成。
//
// 用法：node scripts/split-polysemous-item-ids.mjs            干跑，只打印
//       node scripts/split-polysemous-item-ids.mjs --apply    落盘（先备份到 _newbot_tmp/backup-1016-polysemy/）
//       --report=<path>                                        另写 Markdown 映射表
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const APPLY = process.argv.includes('--apply');
const reportArg = process.argv.find(a => a.startsWith('--report='))?.slice(9);
const J = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
const W = (p, o) => writeFileSync(join(root, p), `${JSON.stringify(o, null, 2)}\n`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const bookOf = id => id.split('.')[0];

// 无同名本家的名称 → 新建的语义 slug（前缀按所属书系；同名同义的多行共用一个 id）
const NEW_IDS = {
  '银龙鳞甲': 'lyg.item.silver_dragon_scale_armor',
  '残缺玉佩': 'lyg.item.broken_jade_pendant',
  '《武穆秘籍》': 'lyg.item.wumu_manual_swapped',
  '经济牌跑鞋': 'lyg.item.economy_sneakers',
  '铁轨': 'lyl.item.iron_rail',
  '传国玉玺': 'lyl.item.imperial_seal',
  '虎符': 'lyl.item.tiger_tally',
};

const catalog = J('mod-kit/entity-catalog/items.json');
const access = J('mod-kit/entity-catalog/stage-access.json');
const cfg = J('mod-kit/entity-catalog/validation.config.json');
const pending = new Set(cfg.variantIdentity.pendingRename.map(p => `${p.id}@${p.stageId}`));
const byId = new Map(catalog.entries.map(e => [e.id, e]));
const byName = new Map();
for (const e of catalog.entries) { const n = e.definition.name; if (!byName.has(n)) byName.set(n, []); byName.get(n).push(e.id); }
const usage = id => Object.values(access.stages).filter(c => c.items.some(r => r.id === id)).length;
const strip = d => JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'id').sort()));
const tagged = d => d.effectTags !== undefined || d.onUse !== undefined;
const renamedAt = new Map(); // stage -> Set(id)
for (const e of catalog.entries) for (const [st, v] of Object.entries(e.stageVariants)) if (v.name !== e.definition.name) { if (!renamedAt.has(st)) renamedAt.set(st, new Set()); renamedAt.get(st).add(e.id); }

function pickHome(row) {
  const v = row.variant;
  let cands = (byName.get(v.name) || []).filter(h => h !== row.id);
  const why = [];
  if (cands.length <= 1) return { cands, why: cands.length ? ['唯一同名'] : [] };
  const narrow = (label, f) => { const n = cands.filter(f); if (n.length && n.length < cands.length) { cands = n; why.push(label); } };
  narrow('定义与变体逐字一致', h => strip(byId.get(h).definition) === strip(v));
  narrow('本关已有且含义未变', h => (access.stages[row.stage]?.items || []).some(r => r.id === h) && !renamedAt.get(row.stage)?.has(h));
  narrow('同书系前缀', h => bookOf(h) === bookOf(row.stage));
  narrow('类型/品阶/属性加成一致', h => { const d = byId.get(h).definition; return d.type === v.type && d.grade === v.grade && same(d.attributeBonus, v.attributeBonus); });
  narrow('语义 slug 优先于 npNNN', h => !/\.np\d+$/.test(h));
  const top = Math.max(...cands.map(usage));
  narrow('被最多关卡引用', h => usage(h) === top);
  if (cands.length > 1) { cands = [cands.slice().sort()[0]]; why.push('取最小 id'); }
  return { cands, why };
}

// ───── 1. 计划 ─────
const rows = [];
for (const e of catalog.entries) for (const [st, v] of Object.entries(e.stageVariants)) {
  if (v.name === e.definition.name) continue;
  const row = { id: e.id, stage: st, from: e.definition.name, to: v.name, variant: v, held: pending.has(`${e.id}@${st}`) };
  if (row.held) { rows.push(row); continue; }
  const { cands, why } = pickHome(row);
  if (cands.length) { row.home = cands[0]; row.kind = why[0] === '唯一同名' ? 'auto' : 'multi'; row.why = why.join('+'); row.homeCount = (byName.get(v.name) || []).filter(h => h !== e.id).length; }
  else {
    row.home = NEW_IDS[v.name]; row.kind = 'new'; row.why = '无同名本家，新建语义 slug';
    if (!row.home) throw new Error(`无本家且未登记新 id：${e.id}@${st} ${v.name}`);
  }
  const home = byId.get(row.home)?.definition;
  if (home && tagged(home) && !tagged(v)) throw new Error(`改指会扩大标签覆盖，需先登记到 pendingRename：${e.id}@${st} → ${row.home}`);
  rows.push(row);
}
const newDefs = new Map(); // newId -> {def, sources}
for (const r of rows.filter(r => r.kind === 'new')) {
  const def = { ...r.variant, id: r.home };
  const got = newDefs.get(r.home);
  if (got && !same(got.def, def)) throw new Error(`同名新建物品的变体内容不一致：${r.home}`);
  const src = `src/modules/scenarioMods/builtins/data/${r.stage}.json#content.items[id=${r.id}]`;
  if (got) got.sources.push(src); else newDefs.set(r.home, { def, sources: [src] });
}
for (const id of newDefs.keys()) if (byId.has(id)) throw new Error(`新 id 已存在：${id}`);
const stageMap = new Map();
for (const r of rows.filter(r => !r.held)) { if (!stageMap.has(r.stage)) stageMap.set(r.stage, new Map()); stageMap.get(r.stage).set(r.id, r.home); }

// ───── 2. 变换 ─────
const uniq = arr => [...new Set(arr)];
const mapIds = (ids, m) => uniq(ids.map(x => m.get(x) ?? x));
function remapDeep(o, m) { // 覆盖/叠加层 ops 里的角色 itemIds 与 contentAccess.contentId
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
    else if (!same(hit, c)) throw new Error(`${stage}: contentAccess ${c.contentId} 合并时规则冲突：${JSON.stringify(hit)} vs ${JSON.stringify(c)}`);
  }
  return out;
}

const nextCatalog = structuredClone(catalog);
for (const r of rows.filter(r => !r.held)) delete nextCatalog.entries.find(e => e.id === r.id).stageVariants[r.stage];
for (const [id, { def, sources }] of newDefs) {
  const entry = { id, aliases: [], definition: def, stageVariants: {}, authoritySource: 'mod-kit/entity-catalog/items.json', migratedFrom: sources };
  let at = -1; nextCatalog.entries.forEach((e, i) => { if (bookOf(e.id) === bookOf(id)) at = i; });
  nextCatalog.entries.splice(at + 1, 0, entry);
}
const nextById = new Map(nextCatalog.entries.map(e => [e.id, e]));
const nextAccess = structuredClone(access);
const genFiles = new Map();
for (const book of ['qingyu', 'yunlong', 'yange']) {
  const dir = `mod-kit/generated/deepseek-v4-flash/${book}/stages`;
  for (const f of readdirSync(join(root, dir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) genFiles.set(J(`${dir}/${f}`).manifest.id, `${dir}/${f}`);
}
const writes = []; // [path, object]
const stats = [];
for (const [stage, m] of stageMap) {
  nextAccess.stages[stage].items = remapAccess(access.stages[stage].items, m, stage);
  const gpath = genFiles.get(stage);
  if (!gpath) throw new Error(`找不到生成源：${stage}`);
  const mod = J(gpath);
  for (const c of mod.canon.characters) if (c.itemIds) c.itemIds = mapIds(c.itemIds, m);
  if (mod.rules?.contentAccess) mod.rules.contentAccess = remapContentAccess(mod.rules.contentAccess, m, stage);
  mod.content.items = nextAccess.stages[stage].items.map(ref => ({ ...JSON.parse(JSON.stringify(nextById.get(ref.id).stageVariants[stage] || nextById.get(ref.id).definition)), ...ref }));
  writes.push([gpath, mod]);
  const opath = `mod-kit/canon-authority-overlays/${stage}.json`;
  if (existsSync(join(root, opath))) { const ov = J(opath); ov.ops = remapDeep(ov.ops, m); writes.push([opath, ov]); }
  stats.push(`${stage}: ${m.size} 个 id 重映射，content.items ${access.stages[stage].items.length}→${nextAccess.stages[stage].items.length}`);
}

// ───── 3. 报告 ─────
const count = k => rows.filter(r => r.kind === k).length;
console.log(`多义行 ${rows.length}：自动 ${count('auto')}、多本家人工选 ${count('multi')}、新建 ${count('new')}（${newDefs.size} 个新 id）、暂缓 ${rows.filter(r => r.held).length}`);
console.log(stats.join('\n'));
if (reportArg) {
  const nm = id => byId.get(id)?.definition.name ?? newDefs.get(id)?.def.name ?? id;
  const L = ['# 多义 item id 清理映射表（2026-10-16）', '', '由 `scripts/split-polysemous-item-ids.mjs` 生成。每行：某关卡里原 id 实际指向的物品，改指到的 id。', '',
    '| 类别 | 关卡 | 原 id（主定义名） | 变体实际是 | 改指 | 选择依据 |', '|---|---|---|---|---|---|'];
  const label = { auto: '自动(唯一本家)', multi: '多本家人工选', new: '新建', undefined: '暂缓' };
  for (const r of rows.slice().sort((a, b) => `${a.kind}|${a.stage}|${a.id}`.localeCompare(`${b.kind}|${b.stage}|${b.id}`)))
    L.push(`| ${label[r.kind]} | ${r.stage} | \`${r.id}\`（${r.from}） | ${r.to} | ${r.held ? '—（暂缓）' : `\`${r.home}\``} | ${r.held ? cfg.variantIdentity.pendingRename.find(p => p.id === r.id && p.stageId === r.stage).reason : `${r.why}${r.kind === 'multi' ? `；候选 ${r.homeCount} 个` : ''}`} |`);
  writeFileSync(join(root, reportArg), `${L.join('\n')}\n`);
}
if (!APPLY) { console.log('（干跑，未落盘；加 --apply 落盘）'); process.exit(0); }

// ───── 4. 落盘 ─────
const bak = join(root, '_newbot_tmp/backup-1016-polysemy');
for (const p of ['mod-kit/entity-catalog/items.json', 'mod-kit/entity-catalog/stage-access.json', ...writes.map(w => w[0])]) {
  const dest = join(bak, p); mkdirSync(dirname(dest), { recursive: true });
  if (!existsSync(dest)) copyFileSync(join(root, p), dest);
}
W('mod-kit/entity-catalog/items.json', nextCatalog);
W('mod-kit/entity-catalog/stage-access.json', nextAccess);
for (const [p, o] of writes) W(p, o);
const { syncBuiltinModData } = await import('./sync-builtin-mods.mjs');
const r = await syncBuiltinModData();
console.log(`builtins 已由生成源重新同步：${r.ids.length} 个，version=${r.version}`);
