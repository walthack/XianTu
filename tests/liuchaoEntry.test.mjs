// 首页「入六朝」入口＋「初入仙途」显示开关 ui.modeSelection.showGenericStart（用户 2026-10-29 定：先隐藏不删，默认 false）。
// 入六朝：/creation?mod=lcq.stage_01 → 按 id 取内置模组（不看模组库 enabled）→ 直接到第 7 步预览，走正常 createCharacter 路径；返回回首页。
// mod 找不到：记 LCQ-PCK-006、toast，留在第 1 步。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const entry = await loadTs('../src/modules/scenarioMods/liuchaoEntry.ts');
const read = rel => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

test('配置默认关：ui.modeSelection.showGenericStart=false 已登记进 registry 与生成物', async () => {
  const registry = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
  const merged = JSON.parse(read('mod-kit/game-numbers.qingyu.json'));
  const runtime = JSON.parse(read('mod-kit/numbers-runtime.json'));
  assert.equal(merged.ui.modeSelection.showGenericStart, false);
  assert.equal(runtime.ui.modeSelection.showGenericStart, false);
  assert.equal(numbers.GAME_NUMBERS.ui.modeSelection.showGenericStart, false);
  assert.deepEqual(merged.ui, runtime.ui, '生成物 ui 段与源一致');
  assert.match(runtime.ui.note, /modeSelection\.showGenericStart/);
  assert.ok(registry.FIELD_SPECS.some(s => s.path === 'ui.modeSelection.showGenericStart' && s.kind === 'bool' && s.required));
  assert.equal(entry.showGenericStartEntry(), false);
});

test('开关可开、复位；非布尔值拒收', () => {
  try {
    numbers.applyGameNumbers({ ui: { modeSelection: { showGenericStart: true } } });
    assert.equal(entry.showGenericStartEntry(), true);
  } finally {
    numbers.applyGameNumbers({ ui: { modeSelection: { showGenericStart: false } } });
  }
  assert.equal(entry.showGenericStartEntry(), false);
  assert.throws(() => numbers.applyGameNumbers({ ui: { modeSelection: { showGenericStart: 'yes' } } }), err => err.code === 'LCQ-NUM-003');
  assert.equal(entry.showGenericStartEntry(), false);
});

test('模组 id 常量指向存在的内置模组', () => {
  assert.equal(entry.LIUCHAO_ENTRY_MOD_ID, 'lcq.stage_01');
  const manifest = JSON.parse(read('src/modules/scenarioMods/builtins/manifest.json'));
  assert.ok(manifest.ids.includes(entry.LIUCHAO_ENTRY_MOD_ID));
});

test('首页：「入六朝」在前，「初入仙途」受开关控制，代码保留', () => {
  const view = read('src/views/ModeSelection.vue');
  const group = view.slice(view.indexOf('<div class="action-group">'));
  const liuchao = group.indexOf('<span>入六朝</span>');
  const generic = group.indexOf("{{ $t('初入仙途') }}");
  assert.ok(liuchao > 0 && generic > liuchao, '「入六朝」是 action-group 第一个按钮');
  assert.match(group, /<button class="btn-primary" data-testid="liuchao-entry" @click="enterLiuchao">\s*<Sparkles/);
  assert.match(group, /<button v-if="showGenericStart" class="btn-primary" @click="startNewGame">/);
  assert.match(view, /const showGenericStart = showGenericStartEntry\(\);/);
  assert.match(view, /router\.push\(\{ path: '\/creation', query: \{ mod: LIUCHAO_ENTRY_MOD_ID \} \}\)/);
  assert.doesNotMatch(view, /'lcq\.stage_01'/, '模组 id 不散落魔法字符串');
});

test('创角页：默认名之后按 query mod 取内置模组，直接到最后一步；返回回首页', () => {
  const creation = read('src/views/CharacterCreation.vue');
  const mounted = creation.slice(creation.indexOf('onMounted(async () => {'), creation.indexOf('onUnmounted('));
  const defaultName = mounted.lastIndexOf("store.characterPayload.character_name = '无名者';");
  const queryMod = mounted.indexOf('route.query.mod');
  assert.ok(defaultName > 0 && queryMod > defaultName, 'query mod 处理在默认名赋值之后');
  assert.match(mounted, /BUILTIN_SCENARIO_MODS\.find\(item => item\.manifest\.id === modId\)/);
  assert.match(mounted, /store\.selectScenarioMod\(mod\);\s*store\.goToStep\(store\.totalSteps\);\s*enteredViaModQuery\.value = true;/);
  assert.match(mounted, /logEvent\(\{ code: 'LCQ-PCK-006'/);
  assert.match(mounted, /toast\.error\(/);
  assert.doesNotMatch(mounted, /scenarioModManager|\.enabled/, '不依赖模组库 enabled');
  assert.match(creation, /if \(enteredViaModQuery\.value && store\.currentStep === store\.totalSteps\) \{\s*props\.onBack\(\);/);
});

test('入六朝走正常角色路径：不用 localOnly / installIsolatedPlaytestCharacter', () => {
  for (const file of ['src/views/ModeSelection.vue', 'src/views/CharacterCreation.vue', 'src/modules/scenarioMods/liuchaoEntry.ts']) {
    const src = read(file);
    assert.doesNotMatch(src, /localOnly/, file);
    assert.doesNotMatch(src, /installIsolatedPlaytestCharacter/, file);
  }
});

test('LCQ-PCK-006 在 codes.ts 与 ERROR-CODES.md 都已登记', async () => {
  const codes = await loadTs('../src/modules/diagnostics/codes.ts');
  assert.equal(codes.ERROR_CODES['LCQ-PCK-006']?.module, 'scenarioMods');
  assert.match(read('docs/ERROR-CODES.md'), /^\| LCQ-PCK-006 \| warn \| scenarioMods \|/m);
});
