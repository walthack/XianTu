// 2026-10-20 用户定：戒瘾药「清心散」珍品、detox 标签；麻古成瘾接受 detox 解除（成瘾与神志不清一起清，算戒除）；南荒药铺/商人可买，部分地点低几率搜到；几率与价格进配置。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { NING_YU, itemEntry, load, makeSave, mods, runJudged } from './freeActionFixture.mjs';
import { loadLootInputs } from '../scripts/validate-location-loot.mjs';

const maigu = await load('../src/modules/scenarioMods/freeAction/maigu.ts');
const shop = await load('../src/modules/scenarioMods/shopStock.ts');
const { canonicalLocationId } = await load('../src/modules/scenarioMods/travel/locationIds.ts');
const ID = 'lcq.item.qingxin_san';
const CFG = mods.numbers.GAME_NUMBERS.status.maigu;
const rows = (save, id) => mods.statusRead.actorStatusRecords(save, id).map(r => r.statusId);
const minutes = (save, n) => { const t = save.元数据.时间; const d = new Date(Date.UTC(t.年 || 1, (t.月 || 1) - 1, t.日 || 1, t.小时 || 0, t.分钟 || 0) + n * 60000); Object.assign(t, { 年: d.getUTCFullYear(), 月: d.getUTCMonth() + 1, 日: d.getUTCDate(), 小时: d.getUTCHours(), 分钟: d.getUTCMinutes() }); };

test('清心散登记：珍品、detox；麻古成瘾的解除规则含 detox；疗伤动作接受 detox 药', () => {
  const items = JSON.parse(readFileSync(new URL('../mod-kit/entity-catalog/items.json', import.meta.url), 'utf8'));
  const def = items.entries.find(e => e.id === ID).definition;
  assert.deepEqual([def.name, def.grade, def.effectTags], ['清心散', '珍品', ['detox']]);
  const pack = JSON.parse(readFileSync(new URL('../src/modules/contentPacks/packs/qingyu/statuses.json', import.meta.url), 'utf8'));
  assert.ok(pack.find(d => d.id === 'addiction.maigu').remove.some(r => r.kind === 'item' && r.ref === 'detox'));
  assert.ok(mods.numbers.GAME_NUMBERS.freeAction.classes.cast.variants.heal.itemTags.includes('detox'));
});

test('疗伤喂清心散：麻古成瘾与戒断神志不清一起解除，算戒除（之后不再计时、不再挂戒断）', () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 80 }, items: { [ID]: itemEntry(ID) } });
  maigu.afterItemFed(save, NING_YU, CFG.itemId);
  minutes(save, CFG.addiction.cravingMinutes); maigu.syncMaigu(save);
  assert.ok(rows(save, NING_YU).includes(CFG.withdrawalStatus));
  const deps = { itemEffect: id => ({ tags: id === ID ? ['detox'] : [], onUse: [] }) };
  const { result } = runJudged(save, { actionClass: 'cast', variant: 'heal', targetId: NING_YU, degree: 'normal', performed: 'yes', evidence: '…', itemId: ID }, 'success', deps);
  assert.ok(['done', 'done_downgraded'].includes(result.resultKey), JSON.stringify(result));
  assert.ok(!rows(save, NING_YU).includes(CFG.addictionStatus), '成瘾解除');
  maigu.syncMaigu(save);
  assert.ok(!rows(save, NING_YU).includes(CFG.withdrawalStatus), '戒断的神志不清一并清掉');
  minutes(save, CFG.addiction.cravingMinutes * 3); assert.deepEqual(maigu.syncMaigu(save), [], '已戒除');
});

test('获得途径：配置的南荒地点可按价买（扣金铢、给物品）；不在售/金铢不足不成交；部分地点低几率搜到', () => {
  const sites = mods.numbers.GAME_NUMBERS.shop.sites;
  const [siteId, site] = Object.entries(sites).find(([, s]) => s.stock.some(r => r.itemId === ID));
  const price = site.stock.find(r => r.itemId === ID).price;
  assert.equal(typeof price, 'number');
  const inputs = loadLootInputs();
  const stage = inputs.stages.find(s => s.manifest.id === 'lcq.stage_04' && s.canon.locations.some(l => canonicalLocationId(l.id) === siteId))
    || inputs.stages.find(s => s.canon.locations.some(l => canonicalLocationId(l.id) === siteId));
  const location = stage.canon.locations.find(l => canonicalLocationId(l.id) === siteId);
  const mk = gold => ({ 元数据: { 创建时间: 'x' }, 角色: { 位置: { 描述: `南荒·${location.name}` }, 背包: { 物品: {}, 货币: { 金铢: { 数量: gold } } } }, 世界: { 状态: { 剧本模组: { modId: stage.manifest.id, canon: { locations: stage.canon.locations, items: stage.content.items } } } } });
  const rich = mk(price + 1);
  assert.deepEqual(shop.purchaseItem(rich, ID), { ok: true, paid: price, itemId: ID });
  assert.equal(rich.角色.背包.货币.金铢.数量, 1);
  assert.equal(rich.角色.背包.物品[ID].数量, 1);
  assert.equal(rich.角色.背包.物品[ID].品质.quality, '珍');
  assert.equal(shop.purchaseItem(mk(price - 1), ID).reason, 'no_money');
  assert.equal(shop.purchaseItem(mk(99), 'lcq.item.np006').reason, 'not_sold');
  const loot = JSON.parse(readFileSync(new URL('../mod-kit/location-loot.qingyu.json', import.meta.url), 'utf8'));
  const lootSites = Object.entries(loot.locations).filter(([, l]) => l.entries.some(e => e.itemId === ID && e.category === 'rare'));
  assert.ok(lootSites.length >= 2, '部分地点可搜到（稀有池，几率读 rareChance 配置）');
});
