import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const fixtureUrl = new URL('./fixtures/scenario-mod/minimal.json', import.meta.url);

async function buildStorySave() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const raw = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  raw.scenario.initialFlags = { met: true, phase: 0 };
  raw.manifest.axisSeqLo = 10;
  raw.manifest.axisSeqHi = 20;
  raw.manifest.nextStageId = 'liuchao.next_stage';
  raw.manifest.nextStageName = '六朝·下一关';
  raw.scenario.events[0].conditions = [{ path: 'flags.met', operator: 'eq', value: true }];
  raw.scenario.events[0].completion = [{ path: 'flags.phase', operator: 'gte', value: 1 }];
  raw.scenario.events[0].axisId = 'test.axis.1';
  raw.scenario.events[0].axisBeat = '程宗扬在建康城外与玩家初次相遇，双方开始建立信任。';
  raw.scenario.chapters[0].completion = [{ path: 'flags.phase', operator: 'gte', value: 1 }];
  raw.scenario.events.push({
    id: 'event.secretwar',
    name: '密战开启',
    description: '尚未公开的未来势力冲突。',
    axisId: 'test.axis.2',
    axisBeat: '暗潮浮现，但具体冲突仍需等当前事件完成后才展开。',
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
  assert.match(prompt, /当前关卡/);
  assert.match(prompt, /六朝·建康风云；主轴范围 #10~#20；下一关 六朝·下一关/);
  assert.match(prompt, /玩家进入建康并接触主要人物/);
  assert.match(prompt, /初会（事件ID：event\.firstmeeting）：玩家第一次遇见程宗扬/);
  assert.match(prompt, /flags\.phase gte 1/);
  assert.match(prompt, /当前相关人物正典约束/);
  assert.match(prompt, /主轴拍点：程宗扬在建康城外与玩家初次相遇/);
  assert.match(prompt, /密战开启（下一拍：暗潮浮现/);
  assert.match(prompt, /程宗扬/);
  // reconcile 会把与真实正典同名的 fixture 角色 personality 对齐到 registry(卡为准)——只断言注入存在,不耦合具体词
  assert.match(prompt, /性格：/);
  assert.match(prompt, /生死根不得被其他 NPC 自动获得/);
  assert.match(prompt, /【身世】【情节】等正典备注是硬约束/);
  assert.match(prompt, /严禁凭空编造跨角色的血缘、师承、结拜、年代等起源设定/);
  assert.doesNotMatch(prompt, /暗潮决战/);
  assert.doesNotMatch(prompt, /未来势力冲突/);
  assert.match(prompt, /不要猜测、引用或泄露后续章节/);
  assert.match(prompt, /只能完成上方“当前事件”列出的事件ID/);
  assert.match(prompt, /不得写 flags\.event\.<id> = true/);
  assert.match(prompt, /不得提前完成未来事件/);
});

test('story prompt names the next stage when the current stage has no next event', async () => {
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = await buildStorySave();
  const runtime = save.世界.状态.剧本模组;
  runtime.events = runtime.events.filter(event => event.id === 'event.firstmeeting');
  runtime.completedEventIds = ['event.firstmeeting'];

  const prompt = buildScenarioStoryPrompt(save);

  assert.match(prompt, /建议切换到下一关：六朝·下一关（liuchao\.next_stage）/);
  assert.match(prompt, /不要在当前关提前展开下一关正文/);
});

test('story prompt blocks next stage while key plot events remain untriggered', async () => {
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = await buildStorySave();
  const runtime = save.世界.状态.剧本模组;
  runtime.events = runtime.events.filter(event => event.id === 'event.firstmeeting' || event.id === 'event.secretwar');
  runtime.completedEventIds = ['event.firstmeeting'];
  runtime.activeEventIds = [];

  const prompt = buildScenarioStoryPrompt(save);

  assert.match(prompt, /本关仍有关键剧情未触发，不能切换下一关/);
  assert.doesNotMatch(prompt, /建议切换到下一关/);
});

test('story context is inert for saves without a Scenario Mod', async () => {
  const { buildScenarioStoryPrompt, createScenarioPromptState } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = { 世界: { 状态: {} }, 角色: { 身份: { 名字: '沈默' } } };

  const promptState = createScenarioPromptState(save);

  assert.deepEqual(promptState, save);
  assert.notEqual(promptState, save);
  assert.equal(buildScenarioStoryPrompt(save), '');
});

test('name-mentioned bystander characters join the focused canon block', async () => {
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = await buildStorySave();

  // 王哲不在活跃事件 relatedCharacterIds 里：默认不聚焦
  const baseline = buildScenarioStoryPrompt(save);
  assert.doesNotMatch(baseline, /- 王哲（/);
  // 玩家点名后 → 确定性召回进聚焦块
  const prompt = buildScenarioStoryPrompt(save, '我去营帐找王哲讨教剑法');
  assert.match(prompt, /- 王哲（/);
});

test('focused characters retain registry speech and cannot inherit a relative or ally sect role', async () => {
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = await buildStorySave();
  const runtime = save.世界.状态.剧本模组;
  runtime.canon.factions.push({ id: 'yun-clan', name: '云氏商会' });
  runtime.canon.characters.push({
    id: 'liuchao.character.yun_dan_liu',
    name: '云丹琉',
    role: '云氏女骑士',
    gender: '女',
    affiliations: [{ factionId: 'yun-clan', category: 'clan', role: '大小姐' }],
    profile: {},
  });
  runtime.events.find(event => event.id === 'event.firstmeeting').relatedCharacterIds.push('liuchao.character.yun_dan_liu');

  const prompt = buildScenarioStoryPrompt(save);

  assert.match(prompt, /云丹琉/);
  assert.match(prompt, /谈吐：语速快、语调高，泼辣好胜/);
  assert.match(prompt, /宗派、道号、自称和教内职位同样是逐人事实/);
  assert.match(prompt, /不得因人物会武、气质近道门、亲属\/师徒属于某派/);
  assert.match(prompt, /太乙真宗的「掌教／教御／弟子」不是泛称/);
});

test('load-bearing character protection and stall steering appear in story prompt', async () => {
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = await buildStorySave();
  const runtime = save.世界.状态.剧本模组;

  // 承重角色保护：未完成 critical 事件的相关人物点名
  const prompt = buildScenarioStoryPrompt(save);
  assert.match(prompt, /【承重角色保护】/);
  assert.match(prompt, /不得死亡、永久残疾/);

  // 停滞分档：停滞 5 轮 → 轻引子；8 轮 → 强路标；都必须可忽略、且禁止拿追兵充当压力
  runtime.stallTurns = 5;
  const softPrompt = buildScenarioStoryPrompt(save);
  assert.match(softPrompt, /【回主线轻引子（玩家可忽略）】/);
  assert.match(softPrompt, /不得用新增战斗\/追兵充当引子/);
  runtime.stallTurns = 8;
  const hardPrompt = buildScenarioStoryPrompt(save);
  assert.match(hardPrompt, /【回主线路标（玩家可忽略）】/);
  assert.match(hardPrompt, /严禁以新增敌袭、追兵或战斗充当压力/);
  assert.match(hardPrompt, /不得直接完成事件/);
  runtime.stallTurns = 0;
  assert.doesNotMatch(buildScenarioStoryPrompt(save), /回主线/);

  // 主线偏移冷却：玩家主动偏移期间(runtime.steeringCooldown>0)彻底静默——即使停滞很多轮也不推任何引子
  runtime.stallTurns = 8;
  runtime.steeringCooldown = 2;
  assert.doesNotMatch(buildScenarioStoryPrompt(save), /回主线/);
});
