import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';

const fx = n => JSON.parse(readFileSync(new URL(`./fixtures/playtest-5e8f/${n}`, import.meta.url), 'utf8'));
const loot = await loadTs('../src/modules/scenarioMods/locationLoot.ts');

// 1) 真机：「我回到龙神的尸身旁，搜查尸身，在龙颅和龙脑处翻找有什么能带走的东西」整句没被认成搜刮，落到叙事模型（小紫那句「不到时候」是叙事模型写的，不是防剧透闸）。
test('龙神尸身搜刮：真机原句进搜刮池，夹带逃跑的句子不进', () => {
  assert.equal(loot.isLocationLootInput('我回到龙神的尸身旁，搜查尸身，在龙颅和龙脑处翻找有什么能带走的东西'), true);
  assert.equal(loot.isLocationLootInput('搜尸身，翻找四周'), true);
  assert.equal(loot.isLocationLootInput('我回到尸身旁，搜查尸身，然后逃跑'), false);
  assert.equal(loot.isLocationLootInput('我不顾小紫的劝阻，伸手把龙脑裂口里那点莹白的东西取出来收好，再翻找龙神身下和祭台四周'), false, '取龙精是原著锁住的事，不当搜刮');
});

test('龙神尸身搜刮：CP-5e8f-03 存档在鬼王峒、杀龙已完成，能拿到龙神专属道具', () => {
  const save = fx('cp03-dragon-corpse.json');
  const r = loot.settleLocationLoot(save);
  assert.equal(r.status, 'settled');
  assert.ok(r.receipt.drops.some(d => /^lcq\.item\.nh_dragon_(scale|bone|horn|fang|sinew|blood)$/.test(d.itemId)), JSON.stringify(r.receipt.drops));
});

// 防剧透：名字带「龙」的搜刮条目只在原著 #116 之后（杀龙 #117）才可得。
test('防剧透：带「龙」字的搜刮条目都要等原著 #116 之后的事件', () => {
  const dir = new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url);
  const seq = {};
  for (const f of readdirSync(dir).filter(f => f.startsWith('lcq.'))) {
    const text = readFileSync(new URL(f, dir), 'utf8');
    for (const m of text.matchAll(/"id": "(lcq\.event\.[^"]+)"[\s\S]{0,4000}?"axisAnchor": "([^"]+)"/g)) { const n = m[2].match(/#(\d+)/); if (n && !(m[1] in seq)) seq[m[1]] = Number(n[1]); }
  }
  const names = Object.fromEntries(JSON.parse(readFileSync('mod-kit/entity-catalog/items.json', 'utf8')).entries.map(e => [e.id, e.definition?.name || '']));
  const table = JSON.parse(readFileSync('mod-kit/location-loot.qingyu.json', 'utf8'));
  for (const [loc, l] of Object.entries(table.locations)) for (const e of l.entries || []) {
    if (!(names[e.itemId] || '').includes('龙')) continue;
    assert.ok((e.afterEventIds || []).some(id => seq[id] >= 116), `${loc}/${e.id}（${names[e.itemId]}）`);
  }
});

// 2) 按文字点「继续到下一期」点到的是上面那句提示（提示里也有这几个字），不是按钮。
test('「继续到下一期」在页面上只出现在按钮上', () => {
  const vue = readFileSync('src/components/dashboard/MainGamePanel.vue', 'utf8');
  const template = vue.slice(0, vue.indexOf('<script'));
  assert.equal((template.match(/继续到下一期/g) || []).length, 1);
  assert.match(template, /<button[^>]*>继续到下一期<\/button>/);
});

// 4) 真阳之血：真机预览 2→6。不是重复计算：真阳之血 +2、井口地形 +1、新组合 +1（只一次），两件抓手相关再给优势；模拟器用同一个 evaluatePlan。
test('真阳之血加值拆分：抓手 +2，与井口一起 +3，新组合另 +1', async () => {
  const core = await loadTs('../src/modules/sceneModule/index.ts');
  const registry = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
  const c = registry.sceneContractById('combat.f13.ghost_king_final');
  const s = core.beginScene(c, { seed: 1 }).state;
  const ctx = { factors: 0, playerDefense: 0, factorProfiles: {} };
  const plan = levers => ({ goal: 'hold_well', magnitude: 1, scope: 'single', targets: ['well_front'], levers });
  const none = core.evaluatePlan(c, s, plan([]), ctx);
  const both = core.evaluatePlan(c, s, plan([{ element: 'blood', verb: 'ward' }, { element: 'passage', verb: 'hold' }]), ctx);
  const blood = core.evaluatePlan(c, s, plan([{ element: 'blood', verb: 'ward' }]), ctx);
  assert.equal(blood.modifierParts.levers, 2);
  assert.equal(both.modifierParts.levers, 3);
  assert.equal(both.modifier - none.modifier, both.modifierParts.levers + both.modifierParts.novelty);
  assert.equal(both.modifier - none.modifier, 4, '真机 2→6');
});
