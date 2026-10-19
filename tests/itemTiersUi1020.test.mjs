// 2026-10-20 用户定：原著无道具品级体系，道具直接用凡品/灵品/仙品/神品四品；UI 与给 AI 的提示词只显示四品，旧档兼容迁移；mod-kit/item-grades.json 唯一权威。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { load } from './freeActionFixture.mjs';

const q = await load('../src/data/itemQuality.ts');
const repair = await load('../src/utils/dataRepair.ts');
const ws = await load('../src/utils/prompts/definitions/worldStandards.ts');
const crafting = await load('../src/utils/craftingSystem.ts');
const table = JSON.parse(readFileSync(new URL('../mod-kit/item-grades.json', import.meta.url), 'utf8'));
const src = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

test('四品来自配置；任意旧写法都落到四品', () => {
  assert.deepEqual(q.ITEM_TIER_TABLE.map(t => t.name), ['凡品', '灵品', '仙品', '神品']);
  assert.deepEqual(q.ITEM_TIER_TABLE.map(t => t.short), ['凡', '灵', '仙', '神']);
  for (const [legacy, id] of Object.entries(table.legacySaveQualities)) assert.equal(q.itemTierOf({ quality: legacy, grade: 3 }).id, id, legacy);
  for (const [alias, id] of Object.entries(table.legacyAliases)) assert.equal(q.itemTierOfQuality(alias).id, id, alias);
  assert.equal(q.itemTierLabel({ quality: '玄', grade: 4 }), '灵品');
  assert.equal(q.itemTierLabel({ quality: '玄阶', grade: 4 }), '灵品');
  assert.equal(q.itemTierLabel(undefined), '凡品');
  assert.equal(q.itemTierLabel({ quality: '莫名其妙' }), '凡品');
});

test('旧档迁移：读档修复把道具的七档换成四品，功法不动；已是四品的保持原 grade', () => {
  const save = { 背包: { 物品: {
    a: { 物品ID: 'a', 名称: '旧刀', 类型: '装备', 品质: { quality: '玄', grade: 4 }, 数量: 1 },
    b: { 物品ID: 'b', 名称: '旧丹', 类型: '丹药', 品质: { quality: '天', grade: 6 }, 数量: 1 },
    c: { 物品ID: 'c', 名称: '新丹', 类型: '丹药', 品质: { quality: '仙', grade: 8 }, 数量: 1 },
    d: { 物品ID: 'd', 名称: '心法', 类型: '功法', 品质: { quality: '玄', grade: 4 }, 数量: 1 },
  } } };
  const items = {};
  for (const [id, item] of Object.entries(save.背包.物品)) items[id] = q.normalizeItemQuality(item.品质);
  assert.deepEqual(items.a, { quality: '灵', grade: table.tiers[1].save.grade });
  assert.deepEqual(items.b, { quality: '仙', grade: table.tiers[2].save.grade });
  assert.deepEqual(items.c, { quality: '仙', grade: 8 });
  assert.match(src('src/utils/dataRepair.ts'), /repaired\.类型 !== '功法'\) \{\n\s+repaired\.品质 = normalizeItemQuality\(repaired\.品质\);/);
  void repair;
});

test('给 AI 的道具品质说明只有四品（不再出现黄/玄/地/天档或上中下品）', () => {
  const prompt = q.generateQualitySystemPrompt();
  for (const t of q.ITEM_TIER_TABLE) assert.ok(prompt.includes(t.name), t.name);
  assert.doesNotMatch(prompt, /黄品|玄品|地品|天品|下品|中品|上品|极品|残缺/);
  const item = ws.QUALITY_SYSTEM.split('\n').filter(l => !l.startsWith('功法'));
  assert.doesNotMatch(item.join('\n'), /黄|玄|地品|天品/);
  assert.match(ws.EQUIPMENT_SYSTEM, /灵品=名匠精制/);
  assert.doesNotMatch(ws.EQUIPMENT_SYSTEM, /黄品|玄品|地品/);
  for (const f of ['src/utils/prompts/tasks/craftingPrompts.ts', 'src/utils/prompts/tasks/characterInitializationPrompts.ts']) assert.doesNotMatch(src(f), /【黄品】|【玄品】|【地品】|【天品】|"地品"|"天品"/, f);
});

test('炼制产出四品：材料旧七档按配置换算，成品 quality 只会是四品单字', () => {
  const shorts = new Set(q.ITEM_TIER_TABLE.map(t => t.short));
  assert.equal(crafting.getItemQualityScore({ 品质: { quality: '玄', grade: 0 } }), 2);
  assert.equal(crafting.getItemQualityScore({ 品质: { quality: '灵', grade: 0 } }), 2);
  assert.ok(!/'黄', '玄', '地', '天'/.test(src('src/utils/craftingSystem.ts')));
  for (const s of shorts) assert.ok(['凡', '灵', '仙', '神'].includes(s));
});

test('UI：背包/人物详情/人物关系三处道具显示四品名，功法仍显示原品级', () => {
  const inv = src('src/components/dashboard/InventoryPanel.vue');
  assert.match(inv, /itemTierOf\(item\.品质\)\.name/);
  assert.equal((inv.match(/&& isTechnique\(/g) || []).length, 4, '上中下品与 grade 数字只给功法显示');
  assert.match(inv, /\.text-quality-灵,/);
  assert.match(src('src/components/dashboard/CharacterDetailsPanel.vue'), /itemTierOf\(item\.品质\)\.short/);
  assert.match(src('src/components/dashboard/RelationshipNetworkPanel.vue'), /itemTierOf\(item\.品质\)\.name/);
});
