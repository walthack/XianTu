// 普通世界入口显示开关 ui.worldSelection.showGenericWorlds（用户 2026-10-28 定：先隐藏不删，默认 false）。
// 关：创建角色第 1 步自定义世界／AI推演／本地世界列表／世界规模配置、保存与加载预设不显示；剧本模组与修仙难度照常。
// 普通世界生成代码（generateWorld、AI推演、地图初始化/追加生成）一行不删；剧本锁存档的地图生成入口按锁隐藏。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const entry = await loadTs('../src/modules/scenarioMods/genericWorldEntry.ts');

test('配置默认关：ui.worldSelection.showGenericWorlds=false 已登记进 registry 与生成物', async () => {
  const registry = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
  const merged = JSON.parse(fs.readFileSync(new URL('../mod-kit/game-numbers.qingyu.json', import.meta.url), 'utf8'));
  const runtime = JSON.parse(fs.readFileSync(new URL('../mod-kit/numbers-runtime.json', import.meta.url), 'utf8'));
  assert.equal(merged.ui.worldSelection.showGenericWorlds, false);
  assert.equal(runtime.ui.worldSelection.showGenericWorlds, false);
  assert.equal(numbers.GAME_NUMBERS.ui.worldSelection.showGenericWorlds, false);
  assert.ok(registry.FIELD_SPECS.some(s => s.path === 'ui.worldSelection.showGenericWorlds' && s.kind === 'bool' && s.required));
  assert.equal(entry.showGenericWorldEntries(), false);
});

test('开关可开、复位；非布尔值拒收', () => {
  try {
    numbers.applyGameNumbers({ ui: { worldSelection: { showGenericWorlds: true } } });
    assert.equal(entry.showGenericWorldEntries(), true);
  } finally {
    numbers.applyGameNumbers({ ui: { worldSelection: { showGenericWorlds: false } } });
  }
  assert.equal(entry.showGenericWorldEntries(), false);
  assert.throws(() => numbers.applyGameNumbers({ ui: { worldSelection: { showGenericWorlds: 1 } } }), err => err.code === 'LCQ-NUM-003');
  assert.equal(entry.showGenericWorldEntries(), false);
});

test('界面只隐藏入口，普通世界代码保留', () => {
  const step1 = fs.readFileSync('src/components/character-creation/Step1_WorldSelection.vue', 'utf8');
  assert.ok((step1.match(/v-if="showGenericWorlds"/g) || []).length >= 3);
  assert.match(step1, /<div v-if="showGenericWorlds" class="top-actions-container">/);
  assert.match(step1, /<div v-if="showGenericWorlds" class="list-container">/);
  assert.match(step1, /class="difficulty-section"/, '修仙难度保留');
  assert.match(step1, /handleAIPromptSubmit/);
  assert.match(step1, /generateWithRawPrompt/);

  const creation = fs.readFileSync('src/views/CharacterCreation.vue', 'utf8');
  assert.match(creation, /<LoadingPreSeting v-if="showGenericWorlds"/);
  assert.match(creation, /<StorePreSeting\s+v-if="showGenericWorlds"/);

  const map = fs.readFileSync('src/components/dashboard/GameMapPanel.vue', 'utf8');
  assert.match(map, /const scenarioMapLocked = computed\(\(\) => isScenarioModMapLocked\(gameStateStore\.worldInfo\)\);/);
  assert.match(map, /<div v-if="!scenarioMapLocked" class="map-actions"/);
  assert.match(map, /v-if="!hasMapContent && !isInitializing && !scenarioMapLocked"/);
  assert.match(map, /const initializeMap/);
  assert.match(map, /const generateAdditionalContent/);

  const init = fs.readFileSync('src/services/initialization/characterInitialization.ts', 'utf8');
  assert.match(init, /async function generateWorld/);
});
