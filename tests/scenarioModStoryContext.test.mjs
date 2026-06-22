import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const fixtureUrl = new URL('./fixtures/scenario-mod/minimal.json', import.meta.url);

async function buildStorySave() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const raw = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  raw.scenario.initialFlags = { met: true, phase: 0 };
  raw.scenario.events[0].conditions = [{ path: 'flags.met', operator: 'eq', value: true }];
  raw.scenario.events[0].completion = [{ path: 'flags.phase', operator: 'gte', value: 1 }];
  raw.scenario.chapters[0].completion = [{ path: 'flags.phase', operator: 'gte', value: 1 }];
  raw.scenario.events.push({
    id: 'event.secretwar',
    name: '密战开启',
    description: '尚未公开的未来势力冲突。',
    conditions: [{ path: 'flags.phase', operator: 'gte', value: 1 }],
  });
  raw.scenario.chapters.push({
    id: 'chapter.secretwar',
    title: '暗潮决战',
    summary: '这是不应提前泄露的未来章节。',
    activation: [{ path: 'flags.phase', operator: 'gte', value: 1 }],
    eventIds: ['event.secretwar'],
  });
  const mod = parseScenarioMod(raw);
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const initialized = applyStrictScenarioInitializationToSave({
    角色: { 位置: { 描述: '旧地点' } },
    世界: { 信息: {}, 状态: {} },
    系统: { 扩展: {} },
  }, buildStrictScenarioInitialization(mod, '2026-06-22T00:00:00.000Z'));
  return advanceScenarioRuntime(initialized).saveData;
}

test('prompt state keeps only the current chapter and active events without mutating the save', async () => {
  const { createScenarioPromptState } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = await buildStorySave();

  const promptState = createScenarioPromptState(save);
  const promptRuntime = promptState.世界.状态.剧本模组;
  const sourceRuntime = save.世界.状态.剧本模组;

  assert.deepEqual(promptRuntime.chapters.map(item => item.id), ['chapter.arrival']);
  assert.deepEqual(promptRuntime.events.map(item => item.id), ['event.firstmeeting']);
  assert.equal(sourceRuntime.chapters.length, 2);
  assert.equal(sourceRuntime.events.length, 2);
});

test('story prompt includes current objectives and excludes future plot content', async () => {
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = await buildStorySave();

  const prompt = buildScenarioStoryPrompt(save);

  assert.match(prompt, /当前章节：入城/);
  assert.match(prompt, /玩家进入建康并接触主要人物/);
  assert.match(prompt, /初会：玩家第一次遇见程宗扬/);
  assert.match(prompt, /flags\.phase gte 1/);
  assert.doesNotMatch(prompt, /暗潮决战/);
  assert.doesNotMatch(prompt, /未来势力冲突/);
  assert.match(prompt, /不要猜测、引用或泄露后续章节/);
});

test('story context is inert for saves without a Scenario Mod', async () => {
  const { buildScenarioStoryPrompt, createScenarioPromptState } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = { 世界: { 状态: {} }, 角色: { 身份: { 名字: '沈默' } } };

  const promptState = createScenarioPromptState(save);

  assert.deepEqual(promptState, save);
  assert.notEqual(promptState, save);
  assert.equal(buildScenarioStoryPrompt(save), '');
});
