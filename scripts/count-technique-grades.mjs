// 功法按四品计数（mod-kit/item-grades.json 换算）：实体目录全部条目 + 各关 content.techniques 引用（按目录解析，含关卡变体）。
// 用法：node scripts/count-technique-grades.mjs [--json]
import fs from 'node:fs';
const table = JSON.parse(fs.readFileSync('mod-kit/item-grades.json', 'utf8'));
const tierName = Object.fromEntries(table.tiers.map(t => [t.id, t.name]));
const tierOf = raw => {
  const s = String(raw ?? '').trim();
  if (!s) return tierName[table.defaultTier];
  const t = table.tiers.find(x => x.short === s || x.name === s);
  if (t) return t.name;
  const base = s.replace(/[品阶级]$/, '');
  const id = table.legacyAliases[s] ?? table.legacySaveQualities[s] ?? table.legacySaveQualities[base] ?? table.legacyAliases[base];
  return id ? tierName[id] : `未识别:${s}`;
};
function count(list) {
  const acc = Object.fromEntries(table.tiers.map(t => [t.name, 0]));
  for (const g of list) acc[tierOf(g)] = (acc[tierOf(g)] || 0) + 1;
  return acc;
}
const catalog = JSON.parse(fs.readFileSync('mod-kit/entity-catalog/techniques.json', 'utf8')).entries;
const dir = 'src/modules/scenarioMods/builtins/data/';
const byId = new Map(catalog.map(e => [e.id, e]));
const stage = fs.readdirSync(dir).filter(f => f.endsWith('.json')).flatMap(f => {
  const j = JSON.parse(fs.readFileSync(dir + f, 'utf8'));
  return (j.content?.techniques || []).map(ref => {
    if (ref.name !== undefined) return ref;
    const e = byId.get(ref.id);
    return { id: ref.id, grade: (e?.stageVariants?.[j.manifest.id] || e?.definition)?.grade };
  });
});
const byBook = {};
for (const e of catalog) (byBook[e.id.split('.')[0]] ||= []).push(e.definition.grade);
const out = {
  catalog: { total: catalog.length, byTier: count(catalog.map(e => e.definition.grade)), byBook: Object.fromEntries(Object.entries(byBook).map(([k, v]) => [k, count(v)])) },
  stageRefs: { total: stage.length, uniqueIds: new Set(stage.map(t => t.id)).size, byTier: count(stage.map(t => t.grade)) },
};
console.log(process.argv.includes('--json') ? JSON.stringify(out, null, 2) : JSON.stringify(out));
