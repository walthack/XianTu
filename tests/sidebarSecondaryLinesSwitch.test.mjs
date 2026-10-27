// 右栏「可投的门路」显示开关 ui.rightSidebar.showSecondaryLines（用户 2026-10-27 08:53 定：先隐藏不删，默认 false）。
// 关：列表为空、右栏整块不渲染；开：与抽出前同一组装（二级线入口＋questLineView 支线）。人物任务与主线不受影响。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const entries = await loadTs('../src/modules/scenarioMods/sidebarLineEntries.ts');
const { questLineView } = await loadTs('../src/modules/scenarioMods/questLineView.ts');
const { resolveAvailableLines } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const repair = await loadTs('../src/utils/dataRepair.ts');
const rail = await loadTs('../src/modules/scenarioMods/canonRail.ts');
const { QUEST_LINES } = await loadTs('../src/modules/scenarioMods/questLines.ts');

const withSwitch = (on, fn) => {
  // 当前线卡默认开（用户 2026-10-27 08:57 定），两块不并存：测「可投的门路」时先关当前线卡
  numbers.applyGameNumbers({ ui: { rightSidebar: { showSecondaryLines: on, showLineCompass: false } } });
  try { return fn(); } finally { numbers.applyGameNumbers({ ui: { rightSidebar: { showSecondaryLines: false, showLineCompass: true } } }); }
};

// 碧鲮藻丝支线（questLineView.secondary）＋商道二级线（锚事完成）同时可见的存档
function fixture() {
  const mod = JSON.parse(fs.readFileSync(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json', import.meta.url)));
  const save = init.applyStrictScenarioInitializationToSave(repair.createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(mod));
  const r = save.世界.状态.剧本模组;
  const beat = QUEST_LINES.find(l => l.id === 'line.side.biling_algae_silk').beats[0];
  r.currentChapterId = rail.getCanonRailProfile(r).chapterId;
  r.completedEventIds = ['lcq.event.biling_bay_stance', 'lcq.event.weapon_deal_with_geluo'];
  r.activeEventIds = ['lcq.event.ruins_ghost_warriors'];
  r.worldTurn = 10;
  const loc = r.canon.locations.find(l => l.id === beat.locationId);
  save.角色.位置 = { 描述: loc.name, 地点ID: loc.id, x: loc.coordinates.x, y: loc.coordinates.y };
  return { save, r, locationId: loc.id };
}

test('配置默认关：ui.rightSidebar.showSecondaryLines=false 已登记进 registry 与生成物', async () => {
  const registry = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
  const merged = JSON.parse(fs.readFileSync(new URL('../mod-kit/game-numbers.qingyu.json', import.meta.url), 'utf8'));
  assert.equal(merged.ui.rightSidebar.showSecondaryLines, false);
  assert.equal(numbers.GAME_NUMBERS.ui.rightSidebar.showSecondaryLines, false);
  assert.ok(registry.FIELD_SPECS.some(s => s.path === 'ui.rightSidebar.showSecondaryLines' && s.kind === 'bool' && s.required));
  assert.ok(registry.REQUIRED_TOP.some(t => t.key === 'ui' && t.section === 'runtime'));
  assert.equal(entries.showSecondaryLines(), false);
  assert.throws(() => numbers.applyGameNumbers({ ui: { rightSidebar: { showSecondaryLines: 1 } } }), err => err.code === 'LCQ-NUM-003');
});

test('开关关：列表为空（二级线与支线都不出），开关开：恢复原组装', () => {
  const { save, r, locationId } = fixture();
  const expectedSecondary = resolveAvailableLines(locationId, r.acquaintances, r.completedEventIds).map(l => l.id);
  const expectedSide = questLineView(save).secondary.map(l => l.id);
  assert.ok(expectedSecondary.includes('commerce'), '夹具应让商道二级线可见');
  assert.ok(expectedSide.includes('line.side.biling_algae_silk'), '夹具应让碧鲮藻丝支线可见');

  assert.deepEqual(entries.sidebarAvailableLines(r, save, locationId, undefined, () => '目标'), []);

  const shown = withSwitch(true, () => entries.sidebarAvailableLines(r, save, locationId, undefined, () => '目标'));
  assert.deepEqual(shown.map(l => l.id), [...expectedSecondary, ...expectedSide]);
  const commerce = shown.find(l => l.id === 'commerce');
  assert.equal(commerce.kind, '商道');
  assert.equal(commerce.locked, false);
  assert.equal(commerce.objective, '', '当前拍不属于商道时不带当前目标');
  const side = shown.find(l => l.id === 'line.side.biling_algae_silk');
  assert.equal(side.kind, '支线');
  assert.deepEqual(side.hintLines, [side.hint]);

  // 关回去又是空
  assert.deepEqual(entries.sidebarAvailableLines(r, save, locationId, undefined, () => '目标'), []);
});

test('右栏：availableLines 先问开关、整块 v-if 跟随列表；人物任务与主线不读开关', () => {
  const vue = fs.readFileSync('src/components/dashboard/RightSidebar.vue', 'utf8');
  const block = vue.slice(vue.indexOf('const availableLines = computed('), vue.indexOf('const characterBeats = computed('));
  assert.match(block, /^const availableLines = computed\(\(\) => \{\n  if \(!showSecondaryLines\(\)\) return \[\];/);
  assert.match(block, /sidebarAvailableLines\(rt, gameStateStore\.toSaveData\(\), questAtLocationId\(rt\), event, \(\) => visibleQuestObjective\(rt, event\)\)/);
  assert.match(vue, /<div v-if="availableLines\.length" class="collapsible-section quest-section">/);
  const beats = vue.slice(vue.indexOf('const characterBeats = computed('), vue.indexOf('const questMain = computed('));
  const main = vue.slice(vue.indexOf('const questMain = computed('));
  assert.doesNotMatch(beats, /showSecondaryLines/);
  assert.doesNotMatch(main.slice(0, main.indexOf('\n});')), /showSecondaryLines/);
  // 代码、数据保留：二级线入口模块仍在
  for (const f of ['secondaryLines.ts', 'secondaryLineEntry.ts', 'lineUnlock.ts']) assert.ok(fs.existsSync(`src/modules/scenarioMods/${f}`), f);
});
