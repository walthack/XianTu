import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url);
const stage02Url = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_02.json', import.meta.url);

async function loadStage() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  return parseScenarioMod(JSON.parse(await readFile(stageUrl, 'utf8')));
}

test('qingyu opening playtest save is isolated canon_companion with player completion contracts', async () => {
  const mod = await loadStage();
  const {
    createQingyuOpeningPlaytestSave,
    isQingyuOpeningPlaytestSave,
    QINGYU_OPENING_PLAYTEST_EVENT_IDS,
    QINGYU_OPENING_PLAYTEST_KIND,
    QINGYU_OPENING_PLAYTEST_MOD_ID,
  } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { advanceScenarioRuntime, getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');

  const save = createQingyuOpeningPlaytestSave(mod, '2026-08-19T00:00:00.000Z');
  const runtime = save.世界.状态.剧本模组;

  assert.equal(isQingyuOpeningPlaytestSave(save), true);
  assert.equal(save.系统.扩展.清羽记开局.kind, QINGYU_OPENING_PLAYTEST_KIND);
  assert.equal(save.系统.扩展.六朝世界试玩, undefined);
  assert.equal(runtime.modId, QINGYU_OPENING_PLAYTEST_MOD_ID);
  assert.notEqual(runtime.storyMode, 'world_sim');
  assert.equal(save.系统.扩展.剧本模组.storyMode, undefined);
  assert.equal(save.角色.身份.名字, '程宗扬');
  assert.equal(QINGYU_OPENING_PLAYTEST_EVENT_IDS.length, 18);
  assert.equal(save.系统.扩展.清羽记开局.eventIds.at(-1), 'lcq.event.baihu_shangguan_escape');

  const advanced = advanceScenarioRuntime(save).saveData;
  const actions = getCurrentStoryEventActions(advanced);
  assert.ok(actions.length > 0, 'canon_companion 开局应出现完成合同按钮');
});

test('第一屏停在穿越落地，自由行动 2-3 回合后自动进入段强遇袭', async () => {
  const {
    createQingyuOpeningPlaytestSave,
    QINGYU_OPENING_S01_01_AUTO_STALL_TURNS,
  } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { advanceScenarioRuntime, resolveStoryEventActionFromPlayerText } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const mod = await loadStage();
  let save = createQingyuOpeningPlaytestSave(mod);
  const runtime = () => save.世界.状态.剧本模组;
  assert.equal(runtime().flags['event.s01_01.done'], false, '穿越落地不再预置结清，留给玩家 2-3 回合');
  assert.deepEqual(runtime().activeEventIds, ['lcq.event.s01_01'], '第一屏应激活穿越落地，任务栏才有 objective');
  assert.equal(runtime().storyMode, undefined, 'demo 必须留在 canon_companion，否则完成合同按钮不出现');
  assert.equal(
    resolveStoryEventActionFromPlayerText(save, '先确认段强还在身边')?.eventId,
    'lcq.event.s01_01',
    '开场选项必须能直接推进 s01_01',
  );
  assert.equal(resolveStoryEventActionFromPlayerText(save, '我变成美少女'), undefined);

  const s01_01 = runtime().events.find(event => event.id === 'lcq.event.s01_01');
  assert.equal(s01_01?.offscreenResolution?.afterStallTurns, QINGYU_OPENING_S01_01_AUTO_STALL_TURNS);
  assert.equal(s01_01?.playerPresence, 'required');

  let settledAt = 0;
  for (let turn = 1; turn <= QINGYU_OPENING_S01_01_AUTO_STALL_TURNS; turn += 1) {
    save = advanceScenarioRuntime(save).saveData;
    if (!runtime().activeEventIds.includes('lcq.event.s01_01')) {
      settledAt = turn;
      break;
    }
  }
  assert.ok(settledAt >= 2 && settledAt <= 3, `s01_01 应在第 2-3 次自由推进时结清，实际第 ${settledAt} 次`);
  assert.ok(runtime().completedEventIds.includes('lcq.event.s01_01'), '在场结清应记入完成账本');
  assert.ok(!(runtime().offscreenResolvedEventIds || []).includes('lcq.event.s01_01'));
  assert.deepEqual(runtime().activeEventIds, ['lcq.event.s01_02'], '结清后应激活段强遇袭');
  const demoOnly = runtime().events.filter(event => String(event.offscreenResolution?.id || '').includes('qingyu_demo'));
  assert.deepEqual(demoOnly.map(event => event.id), ['lcq.event.s01_01'], 'Demo 不得给其它拍加自动推进覆写');
});

test('Demo 自然行动与点击建议落同一份本地回执并在当前响应轮推进', async () => {
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const {
    advanceScenarioRuntime,
    getCurrentStoryEventActions,
    recordStoryEventStructuredAction,
    resolveStoryEventActionFromPlayerText,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const original = createQingyuOpeningPlaytestSave(await loadStage());
  const clicked = getCurrentStoryEventActions(original).find(item => item.eventId === 'lcq.event.s01_01');
  const natural = resolveStoryEventActionFromPlayerText(original, '我先观察四周，再查看段强是否受伤。');
  assert.ok(clicked);
  assert.deepEqual(natural, clicked);

  const clickSave = structuredClone(original);
  const naturalSave = structuredClone(original);
  assert.equal(recordStoryEventStructuredAction(clickSave, clicked).completed, true);
  assert.equal(recordStoryEventStructuredAction(naturalSave, natural).completed, true);
  const clickedAdvanced = advanceScenarioRuntime(clickSave).saveData;
  const naturalAdvanced = advanceScenarioRuntime(naturalSave).saveData;
  assert.deepEqual(
    naturalAdvanced.世界.状态.剧本模组.eventActionStates,
    clickedAdvanced.世界.状态.剧本模组.eventActionStates,
  );
  assert.deepEqual(
    naturalAdvanced.世界.状态.剧本模组.completedEventIds,
    clickedAdvanced.世界.状态.剧本模组.completedEventIds,
  );
  assert.equal(naturalAdvanced.世界.状态.剧本模组.flags['event.s01_01.done'], true);
  assert.deepEqual(naturalAdvanced.世界.状态.剧本模组.activeEventIds, ['lcq.event.s01_02']);
});

test('Demo stage_02 为每个承重步骤补自然行动，不改 builtin 源数据', async () => {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { overlayQingyuStage02Opening } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const source = parseScenarioMod(JSON.parse(await readFile(stage02Url, 'utf8')));
  const sourceJson = JSON.stringify(source);
  const demo = overlayQingyuStage02Opening(source);
  const actions = new Map();
  for (const event of demo.scenario.events) {
    for (const action of event.playerCompletionContract?.actions || []) {
      actions.set(`${event.id}:${action.id}`, action);
    }
  }
  for (const key of [
    'lcq.event.s02_01:advance_declared_objective',
    'lcq.event.s02_02:hold_left_army_line',
    'lcq.event.s02_02:witness_wang_zhe_nine_suns',
    'lcq.event.s02_02:record_battlefield_aftermath',
    'lcq.event.ningyu_enters_gamble:see_ningyu_sent_into_gamble',
    'lcq.event.ningyu_enters_gamble:answer_ningyu_on_debut',
    'lcq.event.sudaji_south_pact:offer_nylon_clue_for_term',
    'lcq.event.sudaji_south_pact:seal_three_month_south_pact',
    'lcq.event.baihu_shangguan_escape:walk_out_wuyuan_shangguan',
  ]) {
    assert.ok(actions.get(key)?.intentMatch?.matchAny?.length, `${key} 应有 Demo 自然行动入口`);
  }
  assert.equal(
    actions.has('lcq.event.s02_04:advance_declared_objective')
      && Boolean(actions.get('lcq.event.s02_04:advance_declared_objective')?.intentMatch?.matchAny?.length),
    false,
    '五原落奴不得绕过地图／局部动作回执',
  );
  assert.equal(JSON.stringify(source), sourceJson, 'Demo overlay 不得反写 builtin 模组');
});

test('清羽 Demo UI 把剧情合同呈现为行动建议，不显示主线／普通一回合成本', async () => {
  const panel = await readFile(new URL('../src/components/dashboard/MainGamePanel.vue', import.meta.url), 'utf8');
  assert.match(panel, /v-if="showScenarioActionMechanics\(option\)" class="engine-action-badge"/);
  assert.match(panel, /qingyuOpeningDemo \? t\('可以直接描述行动，也可点按建议填入'\)/);
  assert.match(panel, /!qingyuOpeningDemo\.value \|\| option\.source !== 'event_engine'/);
});

test('s01_02 在 4 个自由回合内到点结清段强之死，不靠诊治原句', async () => {
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { advanceScenarioRuntime, peekImminentWorldResolution } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  let save = createQingyuOpeningPlaytestSave(await loadStage());
  const rt = () => save.世界.状态.剧本模组;
  for (let turn = 0; turn < 6 && rt().activeEventIds.includes('lcq.event.s01_01'); turn += 1) {
    save = advanceScenarioRuntime(save).saveData;
  }
  assert.deepEqual(rt().activeEventIds, ['lcq.event.s01_02']);
  const fuse = rt().events.find(event => event.id === 'lcq.event.s01_02')?.offscreenResolution?.afterStallTurns;
  assert.equal(fuse, 4);

  let settledAt = 0;
  for (let turn = 1; turn <= fuse; turn += 1) {
    const due = peekImminentWorldResolution(save);
    save = advanceScenarioRuntime(save).saveData;
    if (rt().completedEventIds.includes('lcq.event.s01_02')) {
      settledAt = turn;
      assert.equal(due?.eventId, 'lcq.event.s01_02', '到点当轮应先织进当前行动，再落账');
      assert.match(String(due.ending), /脖子|中箭|身亡|领口/);
      break;
    }
  }
  assert.ok(settledAt >= 1 && settledAt <= fuse, `段强之死应在 ${fuse} 回合内到点，实际第 ${settledAt || '未结'} 回合`);
  assert.ok(!(rt().offscreenResolvedEventIds || []).includes('lcq.event.s01_02'));
  assert.deepEqual(rt().activeEventIds, ['lcq.event.s01_03']);
});

test('Demo 五拍自然行动词保持保守，世界压力与场外结算时钟不变', async () => {
  const mod = await loadStage();
  const events = new Map(mod.scenario.events.map(event => [event.id, event]));
  for (const id of ['lcq.event.s01_02', 'lcq.event.s01_03', 'lcq.event.s01_04', 'lcq.event.s01_05', 'lcq.event.s01_06']) {
    const action = events.get(id)?.playerCompletionContract?.actions?.[0];
    assert.ok(action?.intentMatch?.matchAny?.length, `${id} 应声明自然行动正向短语`);
    assert.ok(action?.intentMatch?.rejectIf?.length, `${id} 应声明否定优先短语`);
  }
  assert.equal(events.get('lcq.event.s01_02')?.pressure?.afterTurns, 1);
  assert.equal(events.get('lcq.event.s01_02')?.offscreenResolution?.afterStallTurns, 4);
  assert.equal(events.get('lcq.event.s01_04')?.pressure?.afterTurns, 1);
  assert.equal(events.get('lcq.event.s01_04')?.offscreenResolution?.afterStallTurns, 5);
  assert.equal(events.get('lcq.event.s01_03')?.offscreenResolution, undefined);
  assert.equal(events.get('lcq.event.s01_05')?.offscreenResolution, undefined);
  assert.equal(events.get('lcq.event.s01_06')?.offscreenResolution, undefined);
});

test('Demo A 线覆写：去帅帐/见人能推进，且不加自动推进 timer', async () => {
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const {
    advanceScenarioRuntime,
    resolveStoryEventActionFromPlayerText,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { formatQuestCompass } = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
  const save = createQingyuOpeningPlaytestSave(await loadStage());
  const events = save.世界.状态.剧本模组.events;
  const byId = id => events.find(event => event.id === id);
  const phrases = id => byId(id)?.playerCompletionContract?.actions?.[0]?.intentMatch?.matchAny || [];

  assert.equal(byId('lcq.event.s01_05')?.locationId, 'lcq.location.command_tent');
  assert.ok(phrases('lcq.event.s01_03').includes('见月霜'));
  assert.ok(phrases('lcq.event.s01_05').includes('去帅帐'));
  assert.ok(phrases('lcq.event.s01_05').includes('见王哲'));
  assert.ok(phrases('lcq.event.s01_06').includes('见月霜'));
  assert.equal(byId('lcq.event.s01_03')?.offscreenResolution, undefined);
  assert.equal(byId('lcq.event.s01_05')?.offscreenResolution, undefined);
  assert.equal(byId('lcq.event.s01_06')?.offscreenResolution, undefined);
  const demoTimers = events.filter(event => String(event.offscreenResolution?.id || '').includes('qingyu_demo'));
  assert.deepEqual(demoTimers.map(event => event.id), ['lcq.event.s01_01']);

  const prior = ['lcq.event.s01_01', 'lcq.event.s01_02', 'lcq.event.s01_03', 'lcq.event.s01_04', 'lcq.event.s01_06'];
  const rt = save.世界.状态.剧本模组;
  rt.completedEventIds = prior;
  for (const id of prior) rt.flags[`event.${id.slice('lcq.event.'.length)}.done`] = true;
  rt.activeEventIds = [];
  const next = advanceScenarioRuntime(save).saveData;
  assert.ok(next.世界.状态.剧本模组.activeEventIds.includes('lcq.event.s01_05'));
  const compass = formatQuestCompass(
    next.世界.状态.剧本模组.events.find(event => event.id === 'lcq.event.s01_05'),
    next.世界.状态.剧本模组,
    'lcq.location.grassland',
  );
  assert.match(compass, /去帅帐/);
  assert.match(compass, /见王哲/);
  assert.equal(resolveStoryEventActionFromPlayerText(next, '去帅帐')?.eventId, 'lcq.event.s01_05');
  assert.equal(resolveStoryEventActionFromPlayerText(next, '请王哲诊治')?.eventId, 'lcq.event.s01_05');
  assert.equal(resolveStoryEventActionFromPlayerText(next, '随便走走')?.eventId, undefined);
});

test('开场正文不得剧透后续拍，也不得出现机制术语', async () => {
  // 2026-08-19：初版开场把十八拍全列了出来（段强之死、王哲传功、五原城落为奴隶…），
  // 还写了「Canon Rail 钉死」「任务栏会给出当前合同」「两处绝路会直接结束本局」——
  // 制作人一进游戏就看到了。这些话属于**入口卡片**，不属于叙事面。
  // 与本项目清理 objective 的规矩同源：玩家看到的东西里不许有开发者语言与剧透。
  const mod = await loadStage();
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const save = createQingyuOpeningPlaytestSave(mod);
  const opening = (save.系统?.历史?.叙事 || []).map(entry => [entry?.content, ...(entry?.actionOptions || [])].join(' ')).join('\n');
  assert.ok(opening.length > 40, '开场正文不应为空');

  // 机制术语：玩家不该在正文里读到系统怎么运作
  for (const term of ['Canon Rail', '合同', '按钮', '任务栏', '回合', '拍', '本局']) {
    assert.ok(!opening.includes(term), `开场正文出现机制术语「${term}」`);
  }
  // 后续拍的剧透：这些人和事在第一拍都还没发生
  for (const term of ['段强之死', '王哲', '月霜', '太乙', '五原城', '苏妲己', '炮烙', '奴隶', '自爆']) {
    assert.ok(!opening.includes(term), `开场正文剧透了后续内容「${term}」`);
  }
});

test('清羽切关进帅帐不剧透自爆或玩家可改结局', async () => {
  const { createQingyuOpeningPlaytestSave, QINGYU_STAGE_02_OPENING_TEXT } =
    await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { transitionToNextScenarioStage } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { getStageEntryPresentation } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const stage02Url = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_02.json', import.meta.url);
  const stage02 = parseScenarioMod(JSON.parse(await readFile(stage02Url, 'utf8')));
  const save = createQingyuOpeningPlaytestSave(await loadStage());
  save.世界.状态.剧本模组.nextStageReadyId = 'lcq.stage_02';
  const result = transitionToNextScenarioStage(save, [stage02]);
  assert.equal(result.ok, true, result.reason);
  const entry = getStageEntryPresentation(result.saveData);
  assert.equal(entry?.text, QINGYU_STAGE_02_OPENING_TEXT);
  for (const term of ['自爆', '全军覆没', '玩家可介入', '改变月霜', '救援韩庚']) {
    assert.equal(entry?.text.includes(term), false, `切关正文剧透「${term}」`);
  }
  assert.match(String(stage02.scenario.opening.text), /自爆/, '内置模组原文仍保留，只覆写 Demo 切关阅读面');
});
