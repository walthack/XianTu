#!/usr/bin/env node
// 一次性迁移 v4（保留作审计）：按 2026-10-16 用户裁定
//   1) 珊瑚匕首通用条目 liuchao.item.coral_dagger 的品阶/属性加成改回原 lyg.item.np066 那一档（中品、气血上限+30、根骨+4）
//   2) 点名四组之外 31 组「名称+描述逐字相同」的 id 对一并合并（类型/品阶/标签/其它字段逐项核对，不一致即报错停下）
// 保留哪个 id：被更多关卡引用的那个；引用数相同取小号；拉链保留运行时 ZIPPER_ITEM_ID（lcq.item.zipper）。
// 改动面同 v3；落盘后再跑会因「旧 id 不存在」报错，仅作审计。
// 用法：node scripts/merge-same-text-item-ids-v4.mjs            干跑，只打印
//       node scripts/merge-same-text-item-ids-v4.mjs --apply    落盘（先备份到 _newbot_tmp/backup-1016k/）
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const APPLY = process.argv.includes('--apply');
const LEDGER = 'docs/handoffs/2026-10-16/polysemy-review-rows.json';
const J = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
const W = (p, o) => writeFileSync(join(root, p), `${JSON.stringify(o, null, 2)}\n`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const COMMON = 'liuchao.item.coral_dagger';
// 珊瑚匕首原 lyg.item.np066 的数值（2026-10-16 用户裁定改回这一档）
const CORAL_RESTORE = { grade: '中品', attributeBonus: { 气血上限: 30, 后天六司: { 根骨: 4 } } };
// 旧 id → 并入的 id，全部逐字核对名称+描述+其它字段
const MERGE = {
  'lcq.item.np002': 'lcq.item.zipper',
  'lcq.item.np004': 'lcq.item.np003',
  'lyg.item.np001': 'lyg.item.np002', 'lyg.item.np006': 'lyg.item.np007', 'lyg.item.np012': 'lyg.item.np013',
  'lyg.item.np024': 'lyg.item.np025', 'lyg.item.np030': 'lyg.item.np031', 'lyg.item.np035': 'lyg.item.np038',
  'lyg.item.np040': 'lyg.item.np043', 'lyg.item.np055': 'lyg.item.np076', 'lyg.item.np056': 'lyg.item.np077',
  'lyg.item.np058': 'lyg.item.np079', 'lyg.item.np061': 'lyg.item.np083', 'lyg.item.np062': 'lyg.item.np084',
  'lyl.item.np002': 'lyl.item.np048', 'lyl.item.np030': 'lyl.item.np048',
  'lyl.item.np026': 'lyl.item.np025', 'lyl.item.np040': 'lyl.item.np037', 'lyl.item.np042': 'lyl.item.np039',
  'lyl.item.np049': 'lyl.item.np046', 'lyl.item.np056': 'lyl.item.np053', 'lyl.item.np083': 'lyl.item.np068',
  'lyl.item.np084': 'lyl.item.np069', 'lyl.item.np085': 'lyl.item.np070', 'lyl.item.np074': 'lyl.item.np086',
  'lyl.item.np090': 'lyl.item.np075', 'lyl.item.np093': 'lyl.item.np078', 'lyl.item.np079': 'lyl.item.np101',
  'lyl.item.np095': 'lyl.item.np080', 'lyl.item.np081': 'lyl.item.np096', 'lyl.item.np082': 'lyl.item.np097',
  'lyl.item.np099': 'lyl.item.np094',
};
const DROP = [];

const catalog = J('mod-kit/entity-catalog/items.json');
const access = J('mod-kit/entity-catalog/stage-access.json');
const byId = new Map(catalog.entries.map(e => [e.id, e]));
for (const id of [...Object.keys(MERGE), ...Object.values(MERGE), COMMON]) if (!byId.has(id)) throw new Error(`总表里没有 ${id}`);
for (const t of Object.values(MERGE)) if (MERGE[t]) throw new Error(`合并目标不能自己再被并走：${t}`);
for (const [from, to] of Object.entries(MERGE)) {
  const a = byId.get(from).definition, b = byId.get(to).definition;
  if (a.name !== b.name || a.description !== b.description) throw new Error(`${from} 与 ${to} 名称/描述不逐字一致，不能按「文字相同」合并`);
  const { id: _a, effectTags: ea, onUse: oa, ...ra } = a, { id: _b, effectTags: eb, onUse: ob, ...rb } = b;
  if (!same(Object.entries(ra).sort(), Object.entries(rb).sort())) throw new Error(`${from} 与 ${to} 除标签外的其它字段不一致`);
  if ((ea !== undefined || oa !== undefined) && !same([ea, oa], [eb, ob])) throw new Error(`${from} 自带的标签与 ${to} 不同，并入时会丢`);
}
const m = new Map(Object.entries(MERGE));
const gone = new Set([...m.keys(), ...DROP]);

// ───── 总表 ─────
const nextCatalog = structuredClone(catalog);
nextCatalog.entries = nextCatalog.entries.filter(e => !gone.has(e.id));
const nextById = new Map(nextCatalog.entries.map(e => [e.id, e]));
for (const [from, to] of m) {
  const t = nextById.get(to);
  t.migratedFrom = [...new Set([...t.migratedFrom, ...byId.get(from).migratedFrom])];
}
Object.assign(nextById.get(COMMON).definition, structuredClone(CORAL_RESTORE));
if (nextCatalog.entries.length !== catalog.entries.length - gone.size) throw new Error('总表条数不对');

// ───── 关卡级改指 ─────
const uniq = arr => [...new Set(arr)];
const mapIds = ids => uniq(ids.map(x => m.get(x) ?? x));
function remapDeep(o) {
  if (Array.isArray(o)) return o.map(remapDeep);
  if (!o || typeof o !== 'object') return o;
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k,
    k === 'itemIds' && Array.isArray(v) ? mapIds(v) : k === 'contentId' && typeof v === 'string' ? (m.get(v) ?? v) : remapDeep(v)]));
}
function remapAccess(refs, stage) {
  const out = [];
  for (const r of refs) {
    const id = m.get(r.id) ?? r.id, hit = out.find(x => x.id === id);
    if (!hit) out.push({ ...r, id });
    else if (!same({ ...hit, id: 0 }, { ...r, id: 0 })) throw new Error(`${stage}: ${id} 合并时 availableWhen/revealWhen 冲突`);
  }
  return out;
}
function remapContentAccess(list, stage) {
  const out = [];
  for (const e of list) {
    const c = { ...e, contentId: m.get(e.contentId) ?? e.contentId }, hit = out.find(x => x.contentId === c.contentId);
    if (!hit) out.push(c);
    else if (!same(hit, c)) throw new Error(`${stage}: contentAccess ${c.contentId} 合并时规则冲突`);
  }
  return out;
}
function leftovers(o, ids, path = '', out = []) {
  if (Array.isArray(o)) o.forEach((x, i) => leftovers(x, ids, `${path}[${i}]`, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) leftovers(v, ids, `${path}.${k}`, out);
  else if (typeof o === 'string' && ids.has(o)) out.push(`${path}=${o}`);
  return out;
}

const nextAccess = structuredClone(access);
const genFiles = new Map();
for (const book of ['qingyu', 'yunlong', 'yange']) {
  const dir = `mod-kit/generated/deepseek-v4-flash/${book}/stages`;
  for (const f of readdirSync(join(root, dir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) genFiles.set(J(`${dir}/${f}`).manifest.id, `${dir}/${f}`);
}
const writes = [], stats = [];
for (const stage of Object.keys(access.stages)) {
  const gpath = genFiles.get(stage);
  if (!gpath) throw new Error(`找不到生成源：${stage}`);
  const before = J(gpath), mod = J(gpath);
  const touched = access.stages[stage].items.filter(r => gone.has(r.id)).map(r => r.id);
  nextAccess.stages[stage].items = remapAccess(access.stages[stage].items, stage);
  for (const c of mod.canon.characters) if (c.itemIds) c.itemIds = mapIds(c.itemIds);
  if (mod.rules?.contentAccess) mod.rules.contentAccess = remapContentAccess(mod.rules.contentAccess, stage);
  // 原 content.items 里的旧 id 也要改（生成源里它是完整定义；builtins 里只有引用，由 projectContentReferences 覆盖）
  if (touched.length || mod.content.items.some(r => gone.has(r.id)) || access.stages[stage].items.some(r => r.id === COMMON))
    mod.content.items = nextAccess.stages[stage].items.map(ref => ({ ...JSON.parse(JSON.stringify(nextById.get(ref.id).definition)), ...ref }));
  const opath = `mod-kit/canon-authority-overlays/${stage}.json`;
  const ov = existsSync(join(root, opath)) ? J(opath) : null;
  const ovBefore = ov && structuredClone(ov);
  if (ov) ov.ops = remapDeep(ov.ops);
  const bad = [...leftovers(mod, gone).map(s => `${gpath}${s}`), ...(ov ? leftovers(ov, gone).map(s => `${opath}${s}`) : [])];
  if (bad.length) throw new Error(`改指后仍有旧 id 残留（未覆盖的引用位置）：\n${bad.join('\n')}`);
  if (!same(before, mod)) writes.push([gpath, mod]);
  if (ov && !same(ovBefore, ov)) writes.push([opath, ov]);
  if (touched.length) stats.push(`${stage}: ${uniq(touched).map(id => `${id}→${m.get(id) ?? '（删除）'}`).join(', ')}`);
}
// 终态自检
for (const [st, c] of Object.entries(nextAccess.stages)) {
  const ids = c.items.map(r => r.id);
  if (new Set(ids).size !== ids.length) throw new Error(`${st} 有重复 id`);
  for (const id of ids) if (!nextById.has(id)) throw new Error(`${st} 引用了不存在的 ${id}`);
}

// ───── 台账：把已被并走的最终 id 改到并入后的 id ─────
const ledger = J(LEDGER);
const nextLedger = ledger.map(r => {
  const to = m.get(r.finalId);
  if (!to) return r;
  return { ...r, finalId: to, splitId: r.splitId ?? r.finalId };
});

console.log(`总表 ${catalog.entries.length} → ${nextCatalog.entries.length}（并入 ${m.size} 个、清掉 ${DROP.length} 个）`);
console.log(stats.join('\n'));
console.log(`改动文件：${writes.map(w => w[0]).join('\n  ')}`);
console.log(`台账改了 ${nextLedger.filter((r, i) => r !== ledger[i]).length} 行`);
if (!APPLY) { console.log('（干跑，未落盘；加 --apply 落盘）'); process.exit(0); }

// ───── 落盘 ─────
const bak = join(root, '_newbot_tmp/backup-1016k');
for (const p of ['mod-kit/entity-catalog/items.json', 'mod-kit/entity-catalog/stage-access.json', LEDGER, ...writes.map(w => w[0])]) {
  const dest = join(bak, p); mkdirSync(dirname(dest), { recursive: true });
  if (!existsSync(dest)) copyFileSync(join(root, p), dest);
}
W('mod-kit/entity-catalog/items.json', nextCatalog);
W('mod-kit/entity-catalog/stage-access.json', nextAccess);
W(LEDGER, nextLedger);
for (const [p, o] of writes) W(p, o);
const { syncBuiltinModData } = await import('./sync-builtin-mods.mjs');
const r = await syncBuiltinModData();
const { buildEntityIndex } = await import('./build-entity-index.mjs');
writeFileSync(join(root, 'mod-kit/entity-catalog/index.json'), `${JSON.stringify(buildEntityIndex(), null, 2)}\n`);
console.log(`builtins 已由生成源重新同步：${r.ids.length} 个，version=${r.version}`);
