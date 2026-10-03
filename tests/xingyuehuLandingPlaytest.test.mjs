import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const ROUTE_STAGE_IDS = [
  'lcq.stage_01',
  'lcq.stage_02',
  'lcq.stage_03b_snake_flower_bridge',
  'lcq.stage_04',
  'lcq.stage_04b_lingfei_baiyi_crisis',
  'lcq.stage_05b',
  'lcq.stage_07_qingyuan_jiankang',
];

const TRANSITION_STAGE_IDS = [
  ...ROUTE_STAGE_IDS,
  'lcq.stage_03',
  'lcq.stage_05',
  'lcq.stage_06',
];

const FUTURE_LEAK = /骨灰|失踪|星月开库|八骏得讯|生还长养|死亡线|密送|萧遥逸|孟非卿|海神殿/;
const FUTURE_DONE = [
  'event.slay_dragon.done',
  'event.xieyi_entrustment.done',
  'event.xiaoyaoyi_arrives.done',
  'event.s07_05.done',
  'event.xiao_opens_resources.done',
];

const runtimeOf = save => save.世界.状态.剧本模组;

async function loadStage(id) {
  return JSON.parse(await readFile(
    new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`, import.meta.url),
    'utf8',
  ));
}

async function loadRouteStages() {
  return Promise.all(ROUTE_STAGE_IDS.map(loadStage));
}

async function loadTransitionMods() {
  return Promise.all(TRANSITION_STAGE_IDS.map(loadStage));
}

async function api() {
  const landing = await loadTs('../src/modules/scenarioMods/xingyuehuLandingPlaytest.ts');
  const playtest = await loadTs('../src/modules/scenarioMods/xingyuehuQuestPlaytest.ts');
  const experience = await loadTs('../src/modules/scenarioMods/xingyuehuQuestPlaytestExperience.ts');
  const runtime = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const strict = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const rail = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  const qingyu = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  return { ...landing, ...playtest, ...experience, ...runtime, ...strict, ...rail, ...qingyu };
}

function completionFlag(runtime, eventId) {
  const event = (runtime.events || []).find(item => item.id === eventId);
  const path = event?.completion?.[0]?.path;
  if (typeof path === 'string' && path.startsWith('flags.')) return path.slice('flags.'.length);
  return `event.${eventId.split('.').pop()}.done`;
}

function takeAction(tools, save, actionId) {
  // 到达≠完成：人不在本拍地点时先走罗盘移动，到场后才有合同动作。
  const travel = tools.getCurrentStoryEventActions(save).find(item => item.actionId.startsWith('travel:'));
  if (travel) assert.equal(tools.recordStoryEventStructuredAction(save, travel).completed, false);
  const action = tools.getCurrentStoryEventActions(save).find(item => item.actionId === actionId);
  assert.ok(action, `当前应提供动作 ${actionId}; active=${runtimeOf(save).activeEventIds}`);
  const result = tools.recordStoryEventStructuredAction(save, action);
  assert.equal(result.attempted, true, result.reason);
  return result;
}

function advance(tools, save) {
  return tools.advanceScenarioRuntime(save).saveData;
}

function eventIdsOf(mod) {
  return (mod.scenario.events || []).map(event => event.id);
}

async function walkRailUntil(tools, save, targetId) {
  const rail = tools.getCanonRailProfile({ modId: runtimeOf(save).modId }).orderedEventIds;
  let current = save;
  for (let turn = 0; turn < 80; turn += 1) {
    const runtime = runtimeOf(current);
    if ((runtime.activeEventIds || []).includes(targetId)) return current;
    if (runtime.nextStageReadyId) {
      throw new Error(`stage_ready before reaching ${targetId}; active=${runtime.activeEventIds}`);
    }
    const head = rail.find(id => (runtime.activeEventIds || []).includes(id));
    if (!head) throw new Error(`rail stalled before ${targetId}; active=${runtime.activeEventIds}`);
    runtime.flags[completionFlag(runtime, head)] = true;
    current = advance(tools, current);
  }
  throw new Error(`did not reach ${targetId}`);
}

async function finishRail(tools, save) {
  const rail = tools.getCanonRailProfile({ modId: runtimeOf(save).modId }).orderedEventIds;
  let current = save;
  for (let turn = 0; turn < 80; turn += 1) {
    const runtime = runtimeOf(current);
    if (runtime.nextStageReadyId) return current;
    const head = rail.find(id => (runtime.activeEventIds || []).includes(id)
      && !(runtime.completedEventIds || []).includes(id));
    if (!head) {
      current = advance(tools, current);
      continue;
    }
    runtime.flags[completionFlag(runtime, head)] = true;
    current = advance(tools, current);
  }
  throw new Error(`rail did not reach stage_ready; active=${runtimeOf(current).activeEventIds}`);
}

test('新档从草原落地开始，s01_01 未完成，且不预置未来命运或开库', async () => {
  const tools = await api();
  const stages = await loadRouteStages();
  const sourceJson = stages.map(stage => JSON.stringify(stage));
  const save = tools.createXingyuehuLandingPlaytestSave(stages, '2026-09-21T00:00:00.000Z');
  const runtime = runtimeOf(save);

  assert.equal(tools.isXingyuehuLandingPlaytestSave(save), true);
  assert.equal(tools.isXingyuehuQuestPlaytestSave(save), false);
  assert.equal(tools.isQingyuOpeningPlaytestSave(save), false);
  assert.equal(save.系统.扩展.清羽记开局, undefined);
  assert.equal(save.系统.扩展.星月湖任务线试玩, undefined);
  assert.equal(save.元数据.存档ID, tools.XINGYUEHU_LANDING_PLAYTEST_SAVE_ID);
  assert.equal(save.元数据.存档名, tools.XINGYUEHU_LANDING_PLAYTEST_SLOT);
  assert.notEqual(tools.XINGYUEHU_LANDING_PLAYTEST_CHARACTER_ID, tools.XINGYUEHU_QUEST_PLAYTEST_CHARACTER_ID);
  assert.notEqual(tools.XINGYUEHU_LANDING_PLAYTEST_CHARACTER_ID, tools.QINGYU_OPENING_PLAYTEST_CHARACTER_ID);
  assert.equal(runtime.modId, 'lcq.stage_01');
  assert.deepEqual(runtime.activeEventIds, ['lcq.event.s01_01']);
  assert.equal(runtime.flags['event.s01_01.done'], false);
  for (const key of FUTURE_DONE) {
    assert.notEqual(runtime.flags[key], true, `新档不得预置 ${key}`);
  }
  assert.equal(runtime.flags['character.xie_yi.status'], undefined);
  assert.doesNotMatch(save.系统.历史.叙事[0].content, FUTURE_LEAK);
  assert.equal(save.角色.身份.名字, '程宗扬');
  assert.deepEqual(stages.map(stage => JSON.stringify(stage)), sourceJson, '落地试玩不得改 builtin 输入');
});

test('落地 overlay 保留全关事件，不把 04b/05b 裁成单事件，也不把 slay_dragon 写成初始 done', async () => {
  const tools = await api();
  const stages = await loadRouteStages();
  for (const source of stages) {
    const overlay = tools.overlayXingyuehuLandingPlaytestStage(source);
    assert.equal(overlay.manifest.id, source.manifest.id, '不得改原 lcq stage id');
    assert.deepEqual(eventIdsOf(overlay), eventIdsOf(source));
    assert.equal((overlay.scenario.events || []).length, (source.scenario.events || []).length);
    assert.notEqual(overlay.scenario.initialFlags?.['event.slay_dragon.done'], true);
    assert.notEqual(overlay.scenario.initialFlags?.['event.xieyi_entrustment.done'], true);
    assert.notEqual(overlay.scenario.initialFlags?.['event.xiao_opens_resources.done'], true);
  }
  const stage04b = stages.find(stage => stage.manifest.id === 'lcq.stage_04b_lingfei_baiyi_crisis');
  const stage05b = stages.find(stage => stage.manifest.id === 'lcq.stage_05b');
  assert.ok(eventIdsOf(stage04b).length > 1);
  assert.ok(eventIdsOf(stage05b).includes('lcq.event.slay_dragon'));
  assert.ok(eventIdsOf(stage05b).includes('lcq.event.xieyi_entrustment'));
  assert.equal(
    tools.overlayXingyuehuLandingPlaytestStage(stage04b).scenario.events.length,
    stage04b.scenario.events.length,
  );
  assert.equal(
    tools.overlayXingyuehuLandingPlaytestStage(stage05b).scenario.events.length,
    stage05b.scenario.events.length,
  );
});

test('切关单测：沿正式 transition 走完整主路并跳过隔离关，新关事件不因切关伪完成', async () => {
  const tools = await api();
  const stages = await loadRouteStages();
  const mods = await loadTransitionMods();
  let save = tools.createXingyuehuLandingPlaytestSave(stages);
  const hops = [];

  for (let index = 0; index < ROUTE_STAGE_IDS.length - 1; index += 1) {
    const from = ROUTE_STAGE_IDS[index];
    const expectedTo = ROUTE_STAGE_IDS[index + 1];
    assert.equal(runtimeOf(save).modId, from);
    const beforeIds = eventIdsOf({ scenario: { events: runtimeOf(save).events } });
    const source = stages.find(stage => stage.manifest.id === from);
    assert.deepEqual(beforeIds, eventIdsOf(source));

    const blocked = tools.transitionToNextScenarioStage(save, mods);
    assert.equal(blocked.ok, false, `${from} 未完成时不得切关`);

    save = await finishRail(tools, save);
    assert.equal(runtimeOf(save).nextStageReadyId, runtimeOf(save).nextStageId);
    const result = tools.transitionToNextScenarioStage(save, mods);
    assert.equal(result.ok, true, result.reason);
    assert.equal(result.to, expectedTo);
    hops.push({ from, to: result.to, skipped: result.from });
    save = result.saveData;
    const dest = runtimeOf(save);
    assert.equal(dest.modId, expectedTo);
    const destSource = stages.find(stage => stage.manifest.id === expectedTo);
    assert.deepEqual(eventIdsOf({ scenario: { events: dest.events } }), eventIdsOf(destSource));
    for (const key of FUTURE_DONE) {
      if (expectedTo === 'lcq.stage_07_qingyuan_jiankang' && key === 'event.xieyi_entrustment.done') {
        assert.notEqual(dest.flags[key], true, '进 07 不得预置托付 done');
        continue;
      }
      if (destSource.scenario.initialFlags?.[key] === false) {
        assert.notEqual(dest.flags[key], true, `${expectedTo} 切关后不得把 ${key} 写成完成`);
      }
    }
  }

  assert.deepEqual(hops.map(item => item.to), ROUTE_STAGE_IDS.slice(1));
  assert.equal(runtimeOf(save).modId, 'lcq.stage_07_qingyuan_jiankang');
  assert.ok(runtimeOf(save).activeEventIds.includes('lcq.event.xiaoyaoyi_arrives'));
  assert.equal(runtimeOf(save).flags['event.xieyi_entrustment.done'], false);
  assert.equal(runtimeOf(save).flags['event.xiao_opens_resources.done'], false);
});

test('中间关完成标准能阻止提前跳到结局', async () => {
  const tools = await api();
  const stages = await loadRouteStages();
  const mods = await loadTransitionMods();
  let save = tools.createXingyuehuLandingPlaytestSave(stages);
  runtimeOf(save).flags['event.s01_01.done'] = true;
  save = advance(tools, save);
  assert.equal(tools.transitionToNextScenarioStage(save, mods).ok, false);

  for (const expected of ROUTE_STAGE_IDS.slice(0, 4)) {
    save = await finishRail(tools, save);
    const jumped = tools.transitionToNextScenarioStage(save, mods);
    assert.equal(jumped.ok, true, jumped.reason);
    save = jumped.saveData;
    assert.equal(runtimeOf(save).modId, ROUTE_STAGE_IDS[ROUTE_STAGE_IDS.indexOf(expected) + 1]);
  }
  assert.equal(runtimeOf(save).modId, 'lcq.stage_04b_lingfei_baiyi_crisis');
  const biling = 'lcq.event.xieyi_biling_war';
  save = await walkRailUntil(tools, save, biling);
  runtimeOf(save).flags[completionFlag(runtimeOf(save), biling)] = true;
  save = advance(tools, save);
  assert.equal(runtimeOf(save).nextStageReadyId, undefined);
  assert.equal(tools.transitionToNextScenarioStage(save, mods).ok, false);
});

test('生死两条经真实命运动作接到开库，进 07 不预置托付 done，且不写失踪', async () => {
  const tools = await api();
  const { prepareEventActionJudgement } = await loadTs('../src/utils/judgementPreflight.ts');
  const { resolvePendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');
  const stages = await loadRouteStages();
  const mods = await loadTransitionMods();

  async function reachFateBeat() {
    let save = tools.createXingyuehuLandingPlaytestSave(stages);
    for (let index = 0; index < ROUTE_STAGE_IDS.length - 2; index += 1) {
      assert.equal(runtimeOf(save).modId, ROUTE_STAGE_IDS[index]);
      save = await finishRail(tools, save);
      const jumped = tools.transitionToNextScenarioStage(save, mods);
      assert.equal(jumped.ok, true, jumped.reason);
      assert.equal(jumped.to, ROUTE_STAGE_IDS[index + 1]);
      save = jumped.saveData;
    }
    assert.equal(runtimeOf(save).modId, 'lcq.stage_05b');
    save = await walkRailUntil(tools, save, 'lcq.event.xieyi_entrustment');
    assert.ok(runtimeOf(save).activeEventIds.includes('lcq.event.xieyi_entrustment'));
    assert.notEqual(runtimeOf(save).flags['event.xieyi_entrustment.done'], true);
    return save;
  }

  async function finishFromFate(save, choose) {
    if (choose === 'dead') {
      assert.equal(takeAction(tools, save, 'accept_entrustment').completed, true);
    } else {
      const travel = tools.getCurrentStoryEventActions(save).find(item => item.actionId.startsWith('travel:'));
      if (travel) assert.equal(tools.recordStoryEventStructuredAction(save, travel).completed, false);
      const rescue = tools.getCurrentStoryEventActions(save).find(item => item.actionId === 'rescue_xieyi');
      assert.ok(rescue?.judgement, '救治必须走正式判定合同');
      const issued = prepareEventActionJudgement(save, rescue, 20);
      const resolution = resolvePendingJudgement(save, issued.proposal.id, {
        currentTurn: 20,
        testOutcome: 'success',
        roll: () => 18,
      });
      assert.equal(tools.recordStoryEventStructuredAction(save, rescue, { judgementResolution: resolution }).completed, true);
    }
    save = advance(tools, save);
    save = await finishRail(tools, save);
    const jumped = tools.transitionToNextScenarioStage(save, mods);
    assert.equal(jumped.ok, true, jumped.reason);
    assert.equal(jumped.to, 'lcq.stage_07_qingyuan_jiankang');
    save = jumped.saveData;
    assert.equal(runtimeOf(save).flags['event.xieyi_entrustment.done'], false, '进 07 不得预置托付 done');
    assert.equal(runtimeOf(save).flags['character.xie_yi.status'], choose === 'dead' ? 'dead' : 'longrest');

    if (choose === 'dead') {
      assert.equal(takeAction(tools, save, 'deliver_ashes').completed, true);
    } else {
      assert.equal(takeAction(tools, save, 'escort_wounded').completed, true);
    }
    save = advance(tools, save);
    save = await walkRailUntil(tools, save, 'lcq.event.s07_05_eight_steeds_informed');
    if (choose === 'dead') {
      assert.equal(takeAction(tools, save, 'report_death').completed, true);
    } else {
      assert.equal(takeAction(tools, save, 'claim_investigate').completed, true);
    }
    save = advance(tools, save);
    save = await walkRailUntil(tools, save, 'lcq.event.xiao_opens_resources');
    assert.equal(
      takeAction(tools, save, choose === 'dead' ? 'hear_xingyue_support_dead' : 'hear_xingyue_support_longrest').completed,
      true,
    );
    save = advance(tools, save);
    assert.equal(tools.isXingyuehuLandingPlaytestFinished(save), true);
    assert.equal(tools.isXingyuehuQuestPlaytestFinished(save), false);
    const experience = tools.deriveXingyuehuQuestPlaytestExperience(save);
    assert.equal(experience.finished, true);
    assert.equal(experience.routeMode, 'from-landing');
    assert.doesNotMatch((experience.recap?.lines || []).join('\n'), /失踪/);
    assert.doesNotMatch([
      experience.stageLabel,
      experience.currentGoal,
      experience.whyNow,
      ...(experience.recap?.lines || []),
    ].filter(Boolean).join('\n'), /失踪/);
    return save;
  }

  const deadSave = await finishFromFate(await reachFateBeat(), 'dead');
  const liveSave = await finishFromFate(await reachFateBeat(), 'longrest');
  assert.equal(runtimeOf(deadSave).flags['character.xie_yi.status'], 'dead');
  assert.equal(runtimeOf(liveSave).flags['character.xie_yi.status'], 'longrest');
  assert.ok(runtimeOf(deadSave).pathReceipts['lcq.event.xiaoyaoyi_arrives.path.ashes_delivered']);
  assert.ok(runtimeOf(liveSave).pathReceipts['lcq.event.xiaoyaoyi_arrives.path.wounded_escorted']);
});

test('短版与长版结束条件互不污染；落地 HUD 开场不泄漏谢艺命运', async () => {
  const tools = await api();
  const landingStages = await loadRouteStages();
  const shortStages = await Promise.all([
    loadStage('lcq.stage_04b_lingfei_baiyi_crisis'),
    loadStage('lcq.stage_05b'),
    loadStage('lcq.stage_07_qingyuan_jiankang'),
  ]);
  const landing = tools.createXingyuehuLandingPlaytestSave(landingStages);
  const short = tools.createXingyuehuQuestPlaytestSave(shortStages);
  assert.equal(tools.isXingyuehuLandingPlaytestSave(short), false);
  assert.equal(tools.isXingyuehuQuestPlaytestSave(landing), false);
  runtimeOf(landing).flags['event.xiao_opens_resources.done'] = true;
  assert.equal(tools.isXingyuehuLandingPlaytestFinished(landing), false, '仍在 stage_01 时即使有开库旗标也不算长版结束');
  runtimeOf(short).flags['event.xiao_opens_resources.done'] = true;
  assert.equal(tools.isXingyuehuQuestPlaytestFinished(short), false);

  const fresh = tools.createXingyuehuLandingPlaytestSave(landingStages);
  const experience = tools.deriveXingyuehuQuestPlaytestExperience(fresh);
  assert.equal(experience.visible, true);
  assert.equal(experience.finished, false);
  assert.equal(experience.routeMode, 'from-landing');
  assert.equal(experience.choice, null);
  assert.equal(experience.recap, null);
  assert.match(experience.stageLabel, /穿越|草原/);
  assert.doesNotMatch([
    experience.stageLabel,
    experience.currentGoal,
    experience.whyNow,
    experience.continueJourneyHint,
  ].filter(Boolean).join('\n'), /命运|失踪|骨灰|长养|星月开库|萧遥逸|孟非卿|海神殿/);
});
