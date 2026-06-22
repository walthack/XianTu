import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modUrl = new URL('../mods/liuchao-qingyu-prologue/liuchao.qingyu.grassland.json', import.meta.url);

async function loadLiuchaoMod() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  return parseScenarioMod(JSON.parse(await readFile(modUrl, 'utf8')));
}

function createMemoryStorage() {
  let library = null;
  return {
    async load() { return library ? structuredClone(library) : null; },
    async save(next) { library = structuredClone(next); },
  };
}

test('PR8 package imports through the real Mod manager', async () => {
  const { ScenarioModManager } = await loadTs('../src/modules/scenarioMods/manager.ts');
  const manager = new ScenarioModManager(createMemoryStorage(), () => '2026-06-22T00:00:00.000Z');
  const text = await readFile(modUrl, 'utf8');

  const imported = await manager.importText(text);

  assert.equal(imported.mod.manifest.id, 'liuchao.qingyu.grassland');
  assert.equal(imported.mod.rules.mode, 'strict');
  assert.equal(imported.mod.scenario.chapters.length, 6);
  assert.equal(imported.mod.scenario.events.length, 10);
  assert.deepEqual(imported.mod.rules.contentAccess, [{
    contentId: 'liuchao.skill.death_root',
    policy: 'exclusive',
    allowedCharacterIds: ['liuchao.character.cheng_zongyang'],
    playerAllowed: false,
  }]);
});

test('PR12 static analyzer reports no playability issues for the PR8 package', async () => {
  const { analyzeScenarioMod } = await loadTs('../src/modules/scenarioMods/analyzer.ts');
  const result = analyzeScenarioMod(await loadLiuchaoMod());

  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});

test('PR8 Strict initialization keeps canon and never calls AI world generation', async () => {
  const { resolveInitialWorldInfo } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const mod = await loadLiuchaoMod();
  let generatorCalls = 0;

  const result = await resolveInitialWorldInfo(mod, async () => {
    generatorCalls += 1;
    throw new Error('Strict Mod must not generate a world');
  });

  assert.equal(generatorCalls, 0);
  assert.equal(result.worldInfo.世界名称, '六朝并置世界');
  assert.equal(result.strictInitialization.initialLocation.描述, '六朝诸国·月牙平原山丘');
  assert.ok(result.worldInfo.势力信息.some(item => item.名称 === '左武军第一军团'));
  assert.ok(result.worldInfo.势力信息.some(item => item.名称 === '罗马联军'));
  assert.ok(result.strictInitialization.runtimeState.canon.characters.some(item => item.name === '程宗扬'));
  assert.ok(result.strictInitialization.runtimeState.canon.techniques.some(item => item.name === '九阳神功'));
  assert.equal(result.strictInitialization.runtimeState.contentAccess[0].contentId, 'liuchao.skill.death_root');
  const wangZhe = result.strictInitialization.runtimeState.canon.characters.find(item => item.name === '王哲');
  assert.deepEqual(wangZhe.affiliations.map(item => item.category), ['sect', 'military']);
});

test('PR8 activates its opening events while hiding future chapters from story context', async () => {
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt, createScenarioPromptState } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const mod = await loadLiuchaoMod();
  const initialized = applyStrictScenarioInitializationToSave({
    角色: { 位置: { 描述: '旧地点' } },
    世界: { 信息: {}, 状态: {} },
    系统: { 扩展: {} },
  }, buildStrictScenarioInitialization(mod, '2026-06-22T00:00:00.000Z'));

  const opened = advanceScenarioRuntime(initialized).saveData;
  const runtime = opened.世界.状态.剧本模组;
  const promptState = createScenarioPromptState(opened);
  const storyPrompt = buildScenarioStoryPrompt(opened);

  assert.equal(runtime.currentChapterId, 'liuchao.chapter.grassland_arrival');
  assert.deepEqual(runtime.activeEventIds, ['liuchao.event.first_contact', 'liuchao.event.ridge_attack']);
  assert.deepEqual(promptState.世界.状态.剧本模组.chapters.map(item => item.id), ['liuchao.chapter.grassland_arrival']);
  assert.equal(promptState.世界.状态.剧本模组.events.length, 2);
  assert.match(storyPrompt, /当前章节：月牙平原/);
  assert.match(storyPrompt, /山丘上的异乡人/);
  assert.doesNotMatch(storyPrompt, /鹰帜压境/);
  assert.doesNotMatch(storyPrompt, /东西军团交锋/);
});

test('PR8 chapter flags advance through the complete short campaign and survive reload', async () => {
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const mod = await loadLiuchaoMod();
  let save = applyStrictScenarioInitializationToSave({
    角色: { 位置: { 描述: '旧地点' } },
    世界: { 信息: {}, 状态: {} },
    系统: { 扩展: {} },
  }, buildStrictScenarioInitialization(mod, '2026-06-22T00:00:00.000Z'));
  save = advanceScenarioRuntime(save).saveData;

  const milestones = [
    ['chapter.grassland_arrival.done', 'liuchao.chapter.battlefield_survival'],
    ['chapter.battlefield_survival.done', 'liuchao.chapter.left_camp'],
    ['chapter.left_camp.done', 'liuchao.chapter.before_battle'],
    ['chapter.before_battle.done', 'liuchao.chapter.eagle_standard'],
    ['chapter.eagle_standard.done', 'liuchao.chapter.after_battle'],
  ];

  for (const [flag, expectedChapter] of milestones) {
    save.世界.状态.剧本模组.flags[flag] = true;
    save = advanceScenarioRuntime(save).saveData;
    assert.equal(save.世界.状态.剧本模组.currentChapterId, expectedChapter);
  }

  const reloaded = JSON.parse(JSON.stringify(save));
  assert.equal(reloaded.世界.状态.剧本模组.currentChapterId, 'liuchao.chapter.after_battle');
  assert.deepEqual(reloaded.世界.状态.剧本模组.completedChapterIds, [
    'liuchao.chapter.grassland_arrival',
    'liuchao.chapter.battlefield_survival',
    'liuchao.chapter.left_camp',
    'liuchao.chapter.before_battle',
    'liuchao.chapter.eagle_standard',
  ]);
});
