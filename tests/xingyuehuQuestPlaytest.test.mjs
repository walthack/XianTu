import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const STAGE_IDS = [
  'lcq.stage_04b_lingfei_baiyi_crisis',
  'lcq.stage_05b',
  'lcq.stage_07_qingyuan_jiankang',
];

async function loadStages() {
  return Promise.all(STAGE_IDS.map(async id => JSON.parse(await readFile(
    new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`, import.meta.url),
    'utf8',
  ))));
}

const runtimeOf = save => save.世界.状态.剧本模组;

async function api() {
  const playtest = await loadTs('../src/modules/scenarioMods/xingyuehuQuestPlaytest.ts');
  const runtime = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const strict = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  return { ...playtest, ...runtime, ...strict };
}

function takeAction(tools, save, actionId) {
  // 到达≠完成：人不在本拍地点时先走罗盘移动，到场后才有合同动作。
  const travel = tools.getCurrentStoryEventActions(save).find(item => item.actionId.startsWith('travel:'));
  if (travel) assert.equal(tools.recordStoryEventStructuredAction(save, travel).completed, false);
  const action = tools.getCurrentStoryEventActions(save).find(item => item.actionId === actionId);
  assert.ok(action, `当前应提供动作 ${actionId}`);
  const result = tools.recordStoryEventStructuredAction(save, action);
  assert.equal(result.attempted, true, result.reason);
  return result;
}

function advance(tools, save) {
  return tools.advanceScenarioRuntime(save).saveData;
}

function depart(tools, save, mods) {
  const target = runtimeOf(save).nextStageReadyId;
  assert.ok(target, '当前小幕完成后应提供继续旅程');
  const result = tools.transitionToNextScenarioStage(save, mods);
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.to, target);
  return result.saveData;
}

test('星月湖试玩建立隔离 canon_companion 存档并从正式旧战合同开始', async () => {
  const tools = await api();
  const stages = await loadStages();
  const sourceJson = stages.map(stage => JSON.stringify(stage));
  const save = tools.createXingyuehuQuestPlaytestSave(stages, '2026-09-15T00:00:00.000Z');
  const runtime = runtimeOf(save);

  assert.equal(tools.isXingyuehuQuestPlaytestSave(save), true);
  assert.equal(save.系统.扩展.星月湖任务线试玩.kind, tools.XINGYUEHU_QUEST_PLAYTEST_KIND);
  assert.equal(save.角色.身份.名字, '程宗扬');
  assert.equal(runtime.storyMode, undefined);
  assert.equal(runtime.modId, tools.XINGYUEHU_QUEST_PLAYTEST_START_MOD_ID);
  assert.deepEqual(runtime.activeEventIds, ['lcq.event.xieyi_biling_war']);
  // 剧情裁定：海神殿是碧鲮的子地点，「南荒·海神殿」开局即在碧鲮，不多一步移动。
  assert.deepEqual(
    tools.getCurrentStoryEventActions(save).map(item => item.actionId),
    ['hear_xieyi_biling_war_and_crown'],
  );
  assert.deepEqual(stages.map(stage => JSON.stringify(stage)), sourceJson, '试玩 overlay 不得改 builtin 输入');
});

test('死亡路线在正常 runtime 中跨三幕传递骨灰与资源处理权并结束试玩', async () => {
  const tools = await api();
  const stages = await loadStages();
  let save = tools.createXingyuehuQuestPlaytestSave(stages);

  assert.equal(takeAction(tools, save, 'hear_xieyi_biling_war_and_crown').completed, false);
  runtimeOf(save).worldTurn = (Number(runtimeOf(save).worldTurn) || 0) + 1;
  assert.equal(takeAction(tools, save, 'answer_xieyi_yue_unfinished').completed, true);
  save = advance(tools, save);
  save = depart(tools, save, stages);

  assert.equal(runtimeOf(save).modId, tools.XINGYUEHU_QUEST_PLAYTEST_FATE_MOD_ID);
  assert.deepEqual(tools.getCurrentStoryEventActions(save).map(item => item.actionId), ['accept_entrustment', 'rescue_xieyi']);
  assert.equal(takeAction(tools, save, 'accept_entrustment').completed, true);
  save = advance(tools, save);
  assert.equal(runtimeOf(save).flags['character.xie_yi.status'], 'dead');
  assert.equal(Number(save.角色.背包.物品['lcq.item.xieyi_ashes']?.数量), 1);
  save = depart(tools, save, stages);

  assert.equal(runtimeOf(save).modId, tools.XINGYUEHU_QUEST_PLAYTEST_END_MOD_ID);
  assert.deepEqual(tools.getCurrentStoryEventActions(save).map(item => item.actionId), ['deliver_ashes']);
  assert.equal(takeAction(tools, save, 'deliver_ashes').completed, true);
  save = advance(tools, save);
  assert.deepEqual(tools.getCurrentStoryEventActions(save).map(item => item.actionId), ['report_death']);
  assert.equal(takeAction(tools, save, 'report_death').completed, true);
  save = advance(tools, save);
  assert.deepEqual(tools.getCurrentStoryEventActions(save).map(item => item.actionId), ['hear_xingyue_support_dead']);
  assert.equal(takeAction(tools, save, 'hear_xingyue_support_dead').completed, true);
  save = advance(tools, save);

  assert.equal(tools.isXingyuehuQuestPlaytestFinished(save), true);
  assert.ok(runtimeOf(save).pathReceipts['lcq.event.xiaoyaoyi_arrives.path.ashes_delivered']);
  assert.ok(runtimeOf(save).pathReceipts['lcq.event.xiao_opens_resources.path.estate_authority']);
});

test('生还路线经正式判定进入长养，并把调查选择传到星月湖资源回应', async () => {
  const tools = await api();
  const { prepareEventActionJudgement } = await loadTs('../src/utils/judgementPreflight.ts');
  const { resolvePendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');
  const stages = await loadStages();
  let save = tools.createXingyuehuQuestPlaytestSave(stages);

  takeAction(tools, save, 'hear_xieyi_biling_war_and_crown');
  runtimeOf(save).worldTurn = (Number(runtimeOf(save).worldTurn) || 0) + 1;
  takeAction(tools, save, 'answer_xieyi_yue_unfinished');
  save = depart(tools, advance(tools, save), stages);

  const rescue = tools.getCurrentStoryEventActions(save).find(item => item.actionId === 'rescue_xieyi');
  assert.ok(rescue?.judgement, '救治必须走正式判定合同');
  const issued = prepareEventActionJudgement(save, rescue, 20);
  const resolution = resolvePendingJudgement(save, issued.proposal.id, {
    currentTurn: 20,
    testOutcome: 'success',
    roll: () => 18,
  });
  assert.equal(tools.recordStoryEventStructuredAction(save, rescue, { judgementResolution: resolution }).completed, true);
  save = advance(tools, save);
  assert.equal(runtimeOf(save).flags['character.xie_yi.status'], 'longrest');
  assert.equal(save.角色.背包.物品['lcq.item.xieyi_ashes'], undefined);
  save = depart(tools, save, stages);

  assert.deepEqual(tools.getCurrentStoryEventActions(save).map(item => item.actionId), ['escort_wounded']);
  takeAction(tools, save, 'escort_wounded');
  save = advance(tools, save);
  assert.deepEqual(
    tools.getCurrentStoryEventActions(save).map(item => item.actionId),
    ['claim_escort', 'claim_investigate'],
  );
  takeAction(tools, save, 'claim_investigate');
  save = advance(tools, save);
  assert.deepEqual(tools.getCurrentStoryEventActions(save).map(item => item.actionId), ['hear_xingyue_support_longrest']);
  takeAction(tools, save, 'hear_xingyue_support_longrest');
  save = advance(tools, save);

  assert.equal(tools.isXingyuehuQuestPlaytestFinished(save), true);
  assert.ok(runtimeOf(save).pathReceipts['lcq.event.xiaoyaoyi_arrives.path.wounded_escorted']);
  assert.ok(runtimeOf(save).pathReceipts['lcq.event.s07_05_eight_steeds_informed.path.player_investigate']);
  assert.ok(runtimeOf(save).pathReceipts['lcq.event.xiao_opens_resources.path.retains_affairs']);
});

test('同名鬼王峒别名被视为同一现场，承接与救治保持两个真实动作', async () => {
  const tools = await api();
  const stages = await loadStages();
  const fateSource = stages.find(stage => stage.manifest.id === tools.XINGYUEHU_QUEST_PLAYTEST_FATE_SOURCE_MOD_ID);
  const fate = tools.overlayXingyuehuQuestPlaytestStage(fateSource);
  const save = tools.applyStrictScenarioInitializationToSave(
    (await loadTs('../src/utils/dataRepair.ts')).createMinimalSaveDataV3(),
    tools.buildStrictScenarioInitialization(fate),
  );
  save.系统.扩展.星月湖任务线试玩 = {
    kind: tools.XINGYUEHU_QUEST_PLAYTEST_KIND,
    disposable: true,
    persistence: 'isolated-local',
  };
  const active = advance(tools, save);
  const actions = tools.getCurrentStoryEventActions(active);
  assert.deepEqual(actions.map(item => item.actionId), ['accept_entrustment', 'rescue_xieyi']);
  assert.equal(new Set(actions.map(item => item.label)).size, 2, '两个命运动作不得退化成同一个罗盘文案');
  assert.deepEqual(actions.map(item => item.actionText), [
    '我陪谢艺把话说完，不打断、不施针。',
    '让乐明珠施针，我运功护持。不灌补心丹。',
  ]);
});
