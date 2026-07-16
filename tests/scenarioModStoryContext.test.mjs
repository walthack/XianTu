import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const fixtureUrl = new URL('./fixtures/scenario-mod/minimal.json', import.meta.url);
const stage07Url = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json', import.meta.url);
const stage08Url = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_08_jiankang_coup.json', import.meta.url);
const stage09Url = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_09_trade_and_escape.json', import.meta.url);
const stage12Url = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_12_jiangzhou_counterwar.json', import.meta.url);
const yangeOpeningUrl = new URL('../src/modules/scenarioMods/builtins/data/lyg.dingtao_beijing.json', import.meta.url);

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
  assert.match(prompt, /六朝·建康风云；主轴范围 #10~#20/);
  assert.doesNotMatch(prompt, /下一关 六朝·下一关/);
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

test('Canon Rail surfaces the active beat specific forbidden rewrites to the narrator', async () => {
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = await buildStorySave();
  const runtime = save.世界.状态.剧本模组;
  runtime.modId = 'lcq.stage_01';
  runtime.events[0].id = 'lcq.event.s01_02';
  runtime.activeEventIds = ['lcq.event.s01_02'];

  const prompt = buildScenarioStoryPrompt(save);

  assert.match(prompt, /本拍特定禁止改写：段强存活；段强失踪；替换死亡结果/);
});

test('谢艺生还 variant 替代旧死亡 Rail 合同，并要求孟非卿采取具体行动', async () => {
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = await buildStorySave();
  const runtime = save.世界.状态.剧本模组;
  runtime.modId = 'lcq.stage_07_qingyuan_jiankang';
  runtime.flags['branch.lcq.if_xieyi_longrest.active'] = true;
  runtime.events[0] = {
    ...runtime.events[0],
    id: 'lcq.event.s07_05_eight_steeds_informed',
    name: '八骏得讯',
    description: '孟非卿得知谢艺死因与黑魔海相关。',
    axisBeat: '孟非卿得知谢艺之死与黑魔海有关后决定报复。',
    narrativeVariants: [{
      when: [{ path: 'flags.branch.lcq.if_xieyi_longrest.active', operator: 'eq', value: true }],
      replacesCanonRail: true,
      name: '谢艺生还的后果',
      description: '孟非卿得知谢艺生还；他必须据此调度星月湖人手，而非只确认消息。',
      axisBeat: '孟非卿确认谢艺仍然生还，当场至少作出一项具体安排：派人接应或探望谢艺，或命人调查黑魔海与鬼王峒线索。',
      objective: '说明谢艺生还与鬼王峒变故，并见证孟非卿作出具体安排',
    }],
  };
  runtime.activeEventIds = ['lcq.event.s07_05_eight_steeds_informed'];

  const prompt = buildScenarioStoryPrompt(save);

  assert.match(prompt, /当场至少作出一项具体安排/);
  assert.match(prompt, /接应或探望谢艺/);
  assert.doesNotMatch(prompt, /谢艺之死与黑魔海有关后/);
});

test('谢艺缺席失败以搜寻与联络线防卫替代死亡 Rail，并保留玩家分工', async () => {
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = await buildStorySave();
  const runtime = save.世界.状态.剧本模组;
  runtime.modId = 'lcq.stage_07_qingyuan_jiankang';
  runtime.flags['world.xieyi_absence.active'] = true;
  runtime.events[0] = {
    ...runtime.events[0],
    id: 'lcq.event.s07_05_eight_steeds_informed', name: '八骏得讯',
    description: '孟非卿得知谢艺死因与黑魔海相关。',
    axisBeat: '孟非卿得知谢艺之死与黑魔海有关后决定报复。',
    narrativeVariants: [{
      when: [{ path: 'flags.world.xieyi_absence.active', operator: 'eq', value: true }],
      replacesCanonRail: true, name: '谢艺失踪的后果',
      axisBeat: '不得确认谢艺死亡或安全。孟非卿须分出人手追查谢艺下落，并护住或改换可能泄露的联络线；玩家可选择参与其中一项，另一项仍作为持续压力存在。',
      objective: '协助搜寻谢艺踪迹，或守住星月湖被黑魔海窥伺的联络线',
    }],
  };
  runtime.activeEventIds = ['lcq.event.s07_05_eight_steeds_informed'];

  const prompt = buildScenarioStoryPrompt(save);

  assert.match(prompt, /不得确认谢艺死亡或安全/);
  assert.match(prompt, /分出人手追查谢艺下落/);
  assert.match(prompt, /玩家可选择参与其中一项/);
  assert.doesNotMatch(prompt, /谢艺之死与黑魔海有关后决定报复/);
});

test('谢艺正典路线保留死亡 Rail，且不混入生还或失踪合同', async () => {
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = await buildStorySave();
  const runtime = save.世界.状态.剧本模组;
  runtime.modId = 'lcq.stage_07_qingyuan_jiankang';
  runtime.events[0] = {
    ...runtime.events[0],
    id: 'lcq.event.s07_05_eight_steeds_informed', name: '八骏得讯',
    description: '孟非卿得知谢艺死因与黑魔海相关。',
    axisBeat: '孟非卿得知谢艺之死与黑魔海有关后决定报复。',
  };
  runtime.activeEventIds = ['lcq.event.s07_05_eight_steeds_informed'];

  const prompt = buildScenarioStoryPrompt(save);

  assert.match(prompt, /谢艺之死与黑魔海有关后决定报复/);
  assert.doesNotMatch(prompt, /谢艺仍然生还/);
  assert.doesNotMatch(prompt, /谢艺下落不明/);
});

test('内置 stage_07 将谢艺生还与失踪后果绑定到互斥状态，而非裸 void', async () => {
  const stage = JSON.parse(await readFile(stage07Url, 'utf8'));
  const event = stage.scenario.events.find(item => item.id === 'lcq.event.s07_05_eight_steeds_informed');
  const survival = event?.narrativeVariants?.find(item => item.name === '谢艺生还的后果');
  const absence = event?.narrativeVariants?.find(item => item.name === '谢艺失踪的后果');

  assert.deepEqual(survival?.when, [{
    path: 'flags.branch.lcq.if_xieyi_longrest.active', operator: 'eq', value: true,
  }]);
  assert.equal(survival?.replacesCanonRail, true);
  assert.deepEqual(absence?.when, [{
    path: 'flags.world.xieyi_absence.active', operator: 'eq', value: true,
  }]);
  assert.equal(absence?.replacesCanonRail, true);
  assert.match(absence?.axisBeat ?? '', /不得确认谢艺死亡或安全/);
  assert.match(absence?.axisBeat ?? '', /联络线/);
});

test('小紫未弑母 variant 在后续关要求处置碧姬，且替代原 Rail', async () => {
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = await buildStorySave();
  const runtime = save.世界.状态.剧本模组;
  runtime.modId = 'lcq.stage_07_qingyuan_jiankang';
  runtime.flags['branch.lcq.if_xiaozi_spares_mother.active'] = true;
  runtime.events[0] = {
    ...runtime.events[0],
    id: 'lcq.event.s07_03_xiaozi_appears',
    name: '小紫现身',
    description: '小紫以毒戒制住卓云君并救下程宗扬，她先前的弱态伪装开始转向残忍操控。',
    axisBeat: '小紫突然现身，以轻灵身法和毒戒制服重伤的卓云君，救下被卓云君制住的程宗扬。',
    narrativeVariants: [{
      when: [{ path: 'flags.branch.lcq.if_xiaozi_spares_mother.active', operator: 'eq', value: true }],
      replacesCanonRail: true,
      name: '小紫现身·未弑母的余波',
      description: '碧姬仍活着；小紫或同行者必须当场明确其看守、送离或托付给可信者的具体处置。',
      axisBeat: '小紫不得被写成已弑母；碧姬仍活着，必须由小紫或同行者当场作出看守、送离或托付给可信者的一项具体处置。',
      objective: '协助小紫制服卓云君，并落实碧姬仍活着后的具体处置',
    }],
  };
  runtime.activeEventIds = ['lcq.event.s07_03_xiaozi_appears'];

  const prompt = buildScenarioStoryPrompt(save);

  assert.match(prompt, /不得被写成已弑母/);
  assert.match(prompt, /看守、送离或托付给可信者/);
  assert.doesNotMatch(prompt, /先前的弱态伪装开始转向残忍操控/);
});

test('内置 stage_07 携带小紫未弑母的跨关回响合同', async () => {
  const stage = JSON.parse(await readFile(stage07Url, 'utf8'));
  const event = stage.scenario.events.find(item => item.id === 'lcq.event.s07_03_xiaozi_appears');
  const variant = event?.narrativeVariants?.find(item => item.name === '小紫现身·未弑母的余波');

  assert.ok(variant);
  assert.deepEqual(variant.when, [{
    path: 'flags.branch.lcq.if_xiaozi_spares_mother.active', operator: 'eq', value: true,
  }]);
  assert.equal(variant.replacesCanonRail, true);
  assert.match(variant.axisBeat, /不得被写成已弑母/);
  assert.match(variant.axisBeat, /看守、送离或托付给可信者/);
});

test('普通条件化 variant 不会吞掉 Canon Rail 合同', async () => {
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = await buildStorySave();
  const runtime = save.世界.状态.剧本模组;
  runtime.modId = 'lcq.stage_07_qingyuan_jiankang';
  runtime.flags['event.s06_03.void'] = true;
  runtime.events[0] = {
    ...runtime.events[0],
    id: 'lcq.event.s07_05_eight_steeds_informed',
    name: '八骏得讯',
    description: '孟非卿得知谢艺死因与黑魔海相关。',
    axisBeat: '孟非卿得知谢艺之死与黑魔海有关后决定报复。',
    narrativeVariants: [{
      when: [{ path: 'flags.event.s06_03.void', operator: 'eq', value: true }],
      axisBeat: '仅改变本拍的叙事语气，不替代默认结局。',
    }],
  };
  runtime.activeEventIds = ['lcq.event.s07_05_eight_steeds_informed'];

  const prompt = buildScenarioStoryPrompt(save);

  assert.match(prompt, /仅改变本拍的叙事语气/);
  assert.match(prompt, /【Canon Rail·默认正典】/);
});

test('苏妲己伏诛在 stage_08 到 stage_09 替代追杀链且保留可继续局面', async () => {
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = await buildStorySave();
  const runtime = save.世界.状态.剧本模组;
  runtime.modId = 'lcq.stage_09_trade_and_escape';
  runtime.flags['branch.lcq.if_sudaji_slain_mochou.active'] = true;
  runtime.events[0] = {
    ...runtime.events[0],
    id: 'lcq.event.s09_03_xiaozi_wounded',
    name: '小紫重伤',
    description: '程宗扬巡视产业时遭苏妲己暗算，小紫重伤，程宗扬与小紫坠入大江。',
    axisBeat: '程宗扬巡视产业时遭苏妲己暗算，小紫重伤，程宗扬与小紫坠入大江。',
    narrativeVariants: [{
      when: [{ path: 'flags.branch.lcq.if_sudaji_slain_mochou.active', operator: 'eq', value: true }],
      replacesCanonRail: true,
      description: '苏妲己已死，原本的暗算不再发生。程宗扬必须处理黑魔海遗留账册与联络点。',
      axisBeat: '不得让苏妲己继续暗算，亦不得把小紫写成因她重伤坠江。众人必须处理黑魔海遗留账册与联络点。',
      objective: '保住黑魔海遗留账册，并决定其交接或封存方式',
    }],
  };
  runtime.activeEventIds = ['lcq.event.s09_03_xiaozi_wounded'];

  const prompt = buildScenarioStoryPrompt(save);

  assert.match(prompt, /不得让苏妲己继续暗算/);
  assert.match(prompt, /处理黑魔海遗留账册/);
  assert.doesNotMatch(prompt, /小紫重伤，程宗扬与小紫坠入大江/);
  assert.doesNotMatch(prompt, /【Canon Rail·默认正典】/);
});

test('英逝双枢纽在同关落为受限辅政与凉州收束，而不推翻登基脊柱', async () => {
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = await buildStorySave();
  const runtime = save.世界.状态.剧本模组;
  runtime.modId = 'lyg.dingtao_beijing';
  runtime.flags['branch.lyg.if_guojie_longrest.active'] = true;
  runtime.flags['branch.lyg.if_dongzhuo_longrest.active'] = true;
  runtime.events[0] = {
    ...runtime.events[0],
    id: 'lyg.event.s01_08',
    name: '阮香凝透露定陶王与盛姬关联',
    description: '阮香凝告知程宗扬定陶王因盛姬而亲近她。',
    axisBeat: '阮香凝告知程宗扬盛姬线索。',
    narrativeVariants: [{
      when: [
        { path: 'flags.branch.lyg.if_guojie_longrest.active', operator: 'eq', value: true },
        { path: 'flags.branch.lyg.if_dongzhuo_longrest.active', operator: 'eq', value: true },
      ],
      replacesCanonRail: true,
      name: '英逝双线·新朝的两份遗产',
      description: '郭解的游侠耳目与贾文和收束的凉州旧部成为新朝两条外线。',
      axisBeat: '盛姬线索照常成立。郭解以游侠网络辅政；董卓不得回京争权，贾文和须收束凉州旧部。两条外线都服务定陶王新朝。',
      objective: '明确两条外线如何护持而不挟持新朝',
    }],
  };
  runtime.activeEventIds = ['lyg.event.s01_08'];

  const prompt = buildScenarioStoryPrompt(save);

  assert.match(prompt, /郭解以游侠网络辅政/);
  assert.match(prompt, /贾文和须收束凉州旧部/);
  assert.match(prompt, /定陶王新朝/);
  assert.doesNotMatch(prompt, /阮香凝告知程宗扬盛姬线索。/);
});

test('内置燕歌开篇携带英逝双枢纽的同关可见余波合同', async () => {
  const stage = JSON.parse(await readFile(yangeOpeningUrl, 'utf8'));
  const guojie = stage.scenario.events.find(item => item.id === 'lyg.event.s01_06');
  const dongzhuo = stage.scenario.events.find(item => item.id === 'lyg.event.s01_07');
  const aftermath = stage.scenario.events.find(item => item.id === 'lyg.event.s01_08');

  assert.equal(guojie?.narrativeVariants?.[0]?.replacesCanonRail, true);
  assert.match(guojie?.narrativeVariants?.[0]?.axisBeat ?? '', /不得被写死/);
  assert.equal(dongzhuo?.narrativeVariants?.[0]?.replacesCanonRail, true);
  assert.match(dongzhuo?.narrativeVariants?.[0]?.axisBeat ?? '', /不得回京夺权/);
  const combined = aftermath?.narrativeVariants?.find(item => item.name === '英逝双线·新朝的两份遗产');
  assert.ok(combined);
  assert.equal(combined.replacesCanonRail, true);
  assert.match(combined.axisBeat, /定陶王登基/);
});

test('星月湖战争缺席后，stage_12 以战报和余波替代玩家亲历叙事', async () => {
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = await buildStorySave();
  const runtime = save.世界.状态.剧本模组;
  runtime.modId = 'lcq.stage_12_jiangzhou_counterwar';
  runtime.flags['world.xingyuehu_war.offscreen_resolved'] = true;
  runtime.events[0] = {
    ...runtime.events[0],
    id: 'lcq.event.s12_01_grain_route_blocked', name: '粮路受阻',
    description: '程宗扬发现浮凌江乱石滩无法通航。', axisBeat: '程宗扬发现粮食转运计划受阻。',
    narrativeVariants: [{
      when: [{ path: 'flags.world.xingyuehu_war.offscreen_resolved', operator: 'eq', value: true }],
      replacesCanonRail: true, name: '缺席后的江州战报', description: '烈山之战未等程宗扬赶到便已推进，江州提前戒严。',
      axisBeat: '不得把程宗扬写成亲历烈山战场；以战报、伤员与江州戒严承接缺席后果，玩家只能介入余波或继续置身事外。',
      objective: '在江州戒严与粮线告急中决定是否介入战后余波',
    }],
  };
  runtime.activeEventIds = ['lcq.event.s12_01_grain_route_blocked'];

  const prompt = buildScenarioStoryPrompt(save);
  assert.match(prompt, /不得把程宗扬写成亲历烈山战场/);
  assert.match(prompt, /战报、伤员与江州戒严/);
  assert.doesNotMatch(prompt, /程宗扬发现粮食转运计划受阻。/);
});

test('内置 stage_12 携带星月湖战争缺席后的战报合同', async () => {
  const stage = JSON.parse(await readFile(stage12Url, 'utf8'));
  const event = stage.scenario.events.find(item => item.id === 'lcq.event.s12_01_grain_route_blocked');
  const variant = event?.narrativeVariants?.find(item => item.name === '缺席后的江州战报');
  assert.ok(variant);
  assert.equal(variant.replacesCanonRail, true);
  assert.match(variant.axisBeat, /不得把程宗扬写成亲历了烈山战场/);
  assert.match(variant.objective, /粮线告急/);
});

test('内置 stage_08/09 携带苏妲己伏诛的跨关合同', async () => {
  const [stage08, stage09] = await Promise.all([stage08Url, stage09Url].map(async url => JSON.parse(await readFile(url, 'utf8'))));
  const first = stage08.scenario.events.find(item => item.id === 'lcq.event.s08_06_pursuit_repelled');
  const downstream = stage09.scenario.events.find(item => item.id === 'lcq.event.s09_03_xiaozi_wounded');
  const firstVariant = first?.narrativeVariants?.find(item => item.name === '莫愁伏诛·黑魔海断线');
  const downstreamVariant = downstream?.narrativeVariants?.find(item => item.name === '伏诛后的产业清算');

  assert.equal(firstVariant?.replacesCanonRail, true);
  assert.match(firstVariant?.axisBeat || '', /苏妲己已死/);
  assert.equal(downstreamVariant?.replacesCanonRail, true);
  assert.match(downstreamVariant?.axisBeat || '', /不得让苏妲己继续暗算/);
});

test('story prompt offers an in-world transition without leaking the next stage', async () => {
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = await buildStorySave();
  const runtime = save.世界.状态.剧本模组;
  runtime.events = runtime.events.filter(event => event.id === 'event.firstmeeting');
  runtime.completedEventIds = ['event.firstmeeting'];

  const prompt = buildScenarioStoryPrompt(save);

  assert.match(prompt, /用来信、人物提议、路况或远近局势等角色可感知的契机自然引出转场/);
  assert.match(prompt, /不得说“下一关”/);
  assert.doesNotMatch(prompt, /六朝·下一关/);
  assert.doesNotMatch(prompt, /liuchao\.next_stage/);
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

test('已落账的世界线分歧进入叙事 prompt，并要求人物采取行动', async () => {
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = await buildStorySave();
  save.世界.状态.剧本模组.divergences = [{
    id: 'divergence.lcq.event.s06_03.1',
    eventId: 'lcq.event.s06_03',
    branchId: 'lcq.if_xieyi_longrest',
    worldDelta: '谢艺在围猎后生还，但需长期静养',
    characterStates: [{ characterId: 'liuchao.character.xie_yi', status: 'longrest' }],
    evidence: '谢艺拄刀而立',
    sequence: 1,
  }];
  const prompt = buildScenarioStoryPrompt(save);
  assert.match(prompt, /【本世界线分歧·已经发生的事实】/);
  assert.match(prompt, /谢艺在围猎后生还/);
  assert.match(prompt, /相关人物据此采取行动/);
  assert.match(prompt, /不得把原著旧结果重新写回/);
});
