#!/usr/bin/env node
// 只读搜刮内容校验；不生成 builtins，不修改源数据。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
const root = new URL('../', import.meta.url);
const jiti = createJiti(import.meta.url, { interopDefault: true });
const {resolveScenarioContent}=await jiti.import(fileURLToPath(new URL('src/modules/scenarioMods/entityCatalog.ts',root)));
const { canonicalLocationId } = await jiti.import(fileURLToPath(new URL('src/modules/scenarioMods/travel/locationIds.ts', root)));
// 剧情15号稿的可搜刮关卡范围；与全图可见地点区分，不能要求未来关道具在此前全图卡上登记。
export const LOOT_STAGE_COVERAGE = {
  "lcq.location.sheyi_village": [
    "lcq.stage_03b_snake_flower_bridge"
  ],
  "lcq.location.giant_vine": [
    "lcq.stage_03b_snake_flower_bridge"
  ],
  "lcq.location.huamiao_village": [
    "lcq.stage_03b_snake_flower_bridge"
  ],
  "liuchao.location.xiongerpu": [
    "lcq.stage_03b_snake_flower_bridge",
    "lcq.stage_04"
  ],
  "liuchao.location.shan_jian": [
    "lcq.stage_04"
  ],
  "lcq.location.yeao_village": [
    "lcq.stage_04",
    "lcq.stage_05b"
  ],
  "liuchao.location.baiyi": [
    "lcq.stage_04",
    "lcq.stage_04b_lingfei_baiyi_crisis"
  ],
  "liuchao.location.south_wild_valley": [
    "lcq.stage_04b_lingfei_baiyi_crisis"
  ],
  "liuchao.location.biyu_village": [
    "lcq.stage_04b_lingfei_baiyi_crisis"
  ],
  "liuchao.location.sea_temple": [
    "lcq.stage_04b_lingfei_baiyi_crisis"
  ],
  "liuchao.location.gui_wang_dong": [
    "lcq.stage_04b_lingfei_baiyi_crisis",
    "lcq.stage_05b"
  ],
  "lcq.location.guiwang_inn": [
    "lcq.stage_05b"
  ],
  "liuchao.location.gui_wang_gong": [
    "lcq.stage_05b"
  ],
  "liuchao.location.gui_wang_gong.jingshen_tai": [
    "lcq.stage_05b"
  ],
  "lcq.location.nanhuang_departure_camp": [
    "lcq.stage_05b"
  ]
};
export function loadLootInputs() {
  return {
    table: JSON.parse(readFileSync(new URL('mod-kit/location-loot.qingyu.json', root), 'utf8')),
    stages: [...new Set(Object.values(LOOT_STAGE_COVERAGE).flat())].map(id => resolveScenarioContent(JSON.parse(readFileSync(new URL(`src/modules/scenarioMods/builtins/data/${id}.json`, root), 'utf8')))),
  };
}
export function auditLocationLoot({ table, stages, coverage = LOOT_STAGE_COVERAGE }) {
  const errors = [];
  const fail = (at, reason) => errors.push(`${at}: ${reason}`);
  const allowed = (value, fields, at) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { fail(at, '应为对象'); return; }
    for (const key of Object.keys(value)) if (!fields.includes(key)) fail(at, `不支持字段 ${key}`);
  };
  const probability = p => Number.isFinite(p) && p >= 0 && p <= 1;
  allowed(table, ['version','rules','locations'], 'table');
  if (table?.version !== 1) fail('version', '不支持版本');
  const rules = table?.rules || {};
  allowed(rules, ['maxSearches','commonSlots','rareChance','largeCurrencyChance','maxCopperPerSearch'], 'rules');
  if (!Number.isInteger(rules.maxSearches) || rules.maxSearches < 1) fail('maxSearches', '次数无效');
  if (!Array.isArray(rules.commonSlots) || rules.commonSlots.length !== 2 || !rules.commonSlots.every(probability) || !probability(rules.rareChance) || !probability(rules.largeCurrencyChance)) fail('rules', '槽位／概率无效');
  if (!Number.isInteger(rules.maxCopperPerSearch) || rules.maxCopperPerSearch < 0 || rules.maxCopperPerSearch > 80) fail('rules', '普通货币上限无效');
  const byStage = new Map(stages.map(s => [s.manifest.id, s]));
  const events = new Set(stages.flatMap(s => (s.scenario?.events || []).map(e => e.id)));
  const locations = new Set(stages.flatMap(s => (s.canon?.locations || []).map(l => canonicalLocationId(l.id))));
  let entryCount = 0;
  for (const [id, loc] of Object.entries(table?.locations || {})) {
    allowed(loc, ['name','status','entries','maxCopper','kind'], id);
    if (canonicalLocationId(id) !== id) fail(id, '必须使用规范地点 id');
    if (coverage[id] && !locations.has(id)) fail(id, '地点不存在');
    if (!['pending','ready'].includes(loc.status) || !loc.name?.trim()) fail(id, '状态／名称无效');
    if (loc.kind !== undefined && !['ordinary','special'].includes(loc.kind)) fail(id, '地点分类无效');
    if (loc.maxCopper !== undefined && (!Number.isInteger(loc.maxCopper) || loc.maxCopper < 0 || (loc.kind !== 'special' && loc.maxCopper > 80))) fail(id, '货币上限无效');
    if (!Array.isArray(loc.entries)) { fail(id, '条目应为数组'); continue; }
    if (loc.status === 'pending' && loc.entries.length) fail(id, 'pending不得含可结算条目');
    if (loc.entries.length && !coverage[id]) fail(id, '未声明关卡登记范围');
    const seen = new Set();
    for (const e of loc.entries) {
      entryCount++;
      const at = `${id}/${e.id}`;
      allowed(e, ['id','itemId','category','currency','large','weight','chance','quantity','once','afterEventIds'], at);
      if (typeof e.id !== 'string' || !e.id || seen.has(e.id)) fail(at, '条目 id 缺失／重复');
      seen.add(e.id);
      if (!['key','common','rare','currency'].includes(e.category)) fail(at, '分类无效');
      if (!Array.isArray(e.quantity) || e.quantity.length !== 2 || !e.quantity.every(Number.isInteger) || e.quantity[0] < 1 || e.quantity[1] < e.quantity[0]) fail(at, '数量区间无效');
      if (['key','rare'].includes(e.category) && (e.quantity?.[0] !== 1 || e.quantity?.[1] !== 1)) fail(at, '关键／稀有物一次一件');
      if (e.weight !== undefined && (!Number.isFinite(e.weight) || e.weight <= 0)) fail(at, '权重无效');
      if (e.chance !== undefined && !probability(e.chance)) fail(at, '概率无效');
      for (const k of ['once','large']) if (e[k] !== undefined && typeof e[k] !== 'boolean') fail(at, `${k}应为布尔值`);
      if (e.afterEventIds !== undefined && (!Array.isArray(e.afterEventIds) || !e.afterEventIds.every(event => events.has(event)))) fail(at, '事件前置不存在');
      if (e.category === 'currency') {
        if (e.itemId || !['铜铢','银铢','金铢'].includes(e.currency)) fail(at, '币种／物品 id 冲突');
        const rate = {铜铢:1,银铢:100,金铢:2000}[e.currency];
        if (e.quantity?.[0] * rate > (loc.maxCopper ?? rules.maxCopperPerSearch)) fail(at, '最低数量超过货币上限，无法掉落');
      } else {
        if (!e.itemId || e.currency || e.large) fail(at, '非货币条目字段冲突');
        for (const stageId of coverage[id] || []) {
          if (!byStage.get(stageId)?.content?.items?.some(i => i.id === e.itemId)) fail(at, `物品未登记 ${stageId}: ${e.itemId}`);
        }
      }
    }
  }
  for (const id of Object.keys(coverage)) if (!table?.locations?.[id]) fail(id, '缺少地点表');
  return { errors, locations: Object.keys(table?.locations || {}).length, ready: Object.values(table?.locations || {}).filter(l => l.status === 'ready').length, entries: entryCount };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = auditLocationLoot(loadLootInputs());
  for (const error of result.errors) console.error(error);
  console.log(`搜刮校验：${result.locations}地点／${result.ready} ready／${result.entries}条目，失败${result.errors.length}`);
  process.exitCode = result.errors.length ? 1 : 0;
}
