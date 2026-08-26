import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
  };
}

const stage01Url = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url);
const stage02Url = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_02.json', import.meta.url);
const ON_STORAGE = { getItem: key => (key === 'xiantu.fastNarrativeDemo.v1' ? 'true' : null) };
const TAKE_MANDATE = 'opportunity.lcq.s02_01.take_full_mandate';
const SILK_ITEM = 'lcq.item.jin_nang';
const WITNESS = 'witness_wang_zhe_nine_suns';
const PAOLAO = 'refuse_term_take_paolao';
const B_CLASS = new Set(['lcq.event.s02_03', 'lcq.event.s02_02']);
const STAGE02_BEATS = [
  'lcq.event.s02_01',
  'lcq.event.s02_03',
  'lcq.event.s02_02',
  'lcq.event.s02_04',
  'lcq.event.s02_05',
  'lcq.event.s02_06',
  'lcq.event.ningyu_enters_gamble',
  'lcq.event.sudaji_south_pact',
  'lcq.event.gamble_bond_signed',
  'lcq.event.charge_sudaji_fee',
  'lcq.event.free_ajiman',
  'lcq.event.baihu_shangguan_escape',
];

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function runtimeOf(save) {
  return save.世界.状态.剧本模组;
}

function silkCount(save) {
  return Number(save?.角色?.背包?.物品?.[SILK_ITEM]?.数量) || 0;
}

function copyPlaytestMarker(fromSave, toSave) {
  const marker = cloneJson(fromSave?.系统?.扩展?.清羽记开局);
  assert.equal(marker?.kind, 'qingyu-demo-v1');
  toSave.系统 = toSave.系统 || {};
  toSave.系统.扩展 = toSave.系统.扩展 || {};
  toSave.系统.扩展.清羽记开局 = marker;
}

async function loadMods() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const [raw01, raw02] = await Promise.all([readFile(stage01Url, 'utf8'), readFile(stage02Url, 'utf8')]);
  return {
    stage01: parseScenarioMod(JSON.parse(raw01)),
    stage02: parseScenarioMod(JSON.parse(raw02)),
  };
}

async function loadTools() {
  const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const demo = await loadTs('../src/modules/scenarioMods/fastNarrativeDemo.ts');
  const playtest = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  return { rtm, demo, playtest, init };
}

function contractSelection(rtm, save) {
  const event = rtm.getScenarioFocusEvent(runtimeOf(save));
  const contractIds = new Set((event?.playerCompletionContract?.actions || []).map(action => action.id));
  return rtm.getCurrentStoryEventActions(save).find(item => contractIds.has(item.actionId));
}

function assertFast(demo, save, extra) {
  const playerAction = extra.eventAction?.actionText
    || extra.opportunityAction?.actionText
    || extra.playerAction
    || '我按当前合同行动';
  const before = JSON.stringify(save);
  const route = demo.routeFastNarrativeDemo({
    saveData: save,
    playerAction,
    storage: ON_STORAGE,
    ...extra,
  });
  assert.notEqual(route.outcome, 'legacy', JSON.stringify({
    extra: Object.keys(extra),
    eventId: extra.eventAction?.eventId || extra.opportunityAction?.eventId,
    actionId: extra.eventAction?.actionId || extra.opportunityAction?.actionId,
    outcome: route.outcome,
    text: route.text,
  }));
  assert.equal(route.outcome, 'fast', route.text || route.outcome);
  assert.ok(route.plan, 'fresh selection must produce a Fast plan');
  assert.equal(JSON.stringify(save), before, 'Fast planner must not mutate the live save');
}

function recordAndReload(rtm, save, selection) {
  const result = rtm.recordStoryEventStructuredAction(save, selection);
  const reloaded = rtm.advanceScenarioRuntime(cloneJson(save)).saveData;
  return { save: reloaded, result };
}

function idle(rtm, save, turns) {
  let current = save;
  const seen = [];
  for (let turn = 1; turn <= turns; turn += 1) {
    const out = rtm.advanceScenarioRuntime(current);
    current = out.saveData;
    seen.push(out.transitions.map(item => item.type));
    if (runtimeOf(current).gameOver) break;
  }
  return { save: current, seen };
}

async function earnStage02(tools, mods) {
  const { rtm, playtest, init } = tools;
  let save = playtest.createQingyuOpeningPlaytestSave(mods.stage01);
  for (let step = 0; step < 40; step += 1) {
    const rt = runtimeOf(save);
    if (rt.nextStageReadyId === 'lcq.stage_02') break;
    const selection = contractSelection(rtm, save);
    assert.ok(selection, `stage_01 第 ${step + 1} 步应有合同动作；active=${JSON.stringify(rt.activeEventIds)} ready=${rt.nextStageReadyId || ''}`);
    save = recordAndReload(rtm, save, selection).save;
  }
  assert.equal(runtimeOf(save).nextStageReadyId, 'lcq.stage_02', '必须靠走完 stage_01 挣到切关，不得手写 nextStageReadyId');
  const markerSource = cloneJson(save);
  const transitioned = init.transitionToNextScenarioStage(save, [mods.stage02]);
  assert.equal(transitioned.ok, true, transitioned.reason);
  save = transitioned.saveData;
  if (save.系统?.扩展?.清羽记开局?.kind !== 'qingyu-demo-v1') {
    copyPlaytestMarker(markerSource, save);
  }
  save = rtm.advanceScenarioRuntime(cloneJson(save)).saveData;
  assert.equal(runtimeOf(save).modId, 'lcq.stage_02');
  assert.equal(save.系统.扩展.清羽记开局.kind, 'qingyu-demo-v1');
  return save;
}

function takeSilkMandate(rtm, demo, save) {
  const tracked = rtm.trackStoryOpportunity(save, TAKE_MANDATE);
  assert.equal(tracked.ok, true, tracked.reason || 's02_01 必须能追踪整份托付，锦囊才有合同入口');
  for (let step = 0; step < 4; step += 1) {
    const [selection] = rtm.getTrackedStoryOpportunityActions(save);
    if (!selection) break;
    assertFast(demo, save, { opportunityAction: selection, playerAction: selection.actionText });
    const result = rtm.recordStoryOpportunityStructuredAction(save, selection);
    assert.equal(result.progressed, true, result.reason || selection.actionId);
    save = rtm.advanceScenarioRuntime(cloneJson(save)).saveData;
  }
  assert.equal(silkCount(save), 1, '锦囊必须恰好一次落入背包');
  return save;
}

async function walkHappyPath(tools, mods, stopWhen) {
  const { rtm, demo } = tools;
  let save = await earnStage02(tools, mods);
  const completed = [];
  for (const beat of STAGE02_BEATS) {
    if (stopWhen?.({ save, beat, completed, phase: 'active' })) return { save, completed };
    assert.ok(
      runtimeOf(save).activeEventIds.includes(beat),
      `下一拍应是 ${beat}，实际 active=${JSON.stringify(runtimeOf(save).activeEventIds)} completed=${JSON.stringify(runtimeOf(save).completedEventIds)}`,
    );
    if (beat === 'lcq.event.s02_01') save = takeSilkMandate(rtm, demo, save);
    for (let step = 0; step < 8; step += 1) {
      if (runtimeOf(save).completedEventIds.includes(beat)) break;
      const selection = contractSelection(rtm, save);
      assert.ok(selection, `${beat} 第 ${step + 1} 步没有合同动作`);
      assert.equal(selection.eventId, beat);
      assert.notEqual(selection.actionId, PAOLAO);
      assertFast(demo, save, { eventAction: selection, playerAction: selection.actionText });
      const settled = recordAndReload(rtm, save, selection);
      assert.equal(settled.result.attempted, true, settled.result.reason);
      save = settled.save;
      assert.equal(runtimeOf(save).gameOver, undefined, `${beat} 正常路线不得 gameOver`);
    }
    assert.ok(runtimeOf(save).completedEventIds.includes(beat), `${beat} 必须由结构化动作结清`);
    assert.equal((runtimeOf(save).offscreenResolvedEventIds || []).includes(beat), false, `${beat} 正常路线不得走场外`);
    completed.push(beat);
    if (stopWhen?.({ save, beat, completed, phase: 'done' })) return { save, completed };
  }
  return { save, completed };
}

test('后半 12 拍合同 walker：真实切关、rail 激活序、锦囊一次、Fast 不回 Legacy', async () => {
  const tools = await loadTools();
  const mods = await loadMods();
  const { rtm, demo } = tools;
  const { save, completed } = await walkHappyPath(tools, mods);
  assert.deepEqual(completed, STAGE02_BEATS);
  assert.equal(silkCount(save), 1);
  assert.equal(runtimeOf(save).inventoryTransferReceipts?.length, 1);
  assert.equal(runtimeOf(save).gameOver, undefined);
  assert.ok(runtimeOf(save).completedEventIds.includes('lcq.event.baihu_shangguan_escape'));
  const closedRoute = demo.routeFastNarrativeDemo({
    saveData: save,
    playerAction: '我再走进白湖商馆',
    storage: ON_STORAGE,
  });
  assert.equal(closedRoute.outcome, 'legacy', '白湖脱身之后 Fast 必须 fail-close');
  const replay = rtm.advanceScenarioRuntime(cloneJson(save)).saveData;
  const replay2 = rtm.advanceScenarioRuntime(cloneJson(save)).saveData;
  assert.equal(JSON.stringify(replay), JSON.stringify(replay2));
});

test('A 类 10 拍没有合法动作不得自结', async () => {
  const tools = await loadTools();
  const mods = await loadMods();
  const { rtm } = tools;
  let save = await earnStage02(tools, mods);
  const aClass = STAGE02_BEATS.filter(id => !B_CLASS.has(id));
  const proven = [];
  for (const beat of STAGE02_BEATS) {
    assert.ok(runtimeOf(save).activeEventIds.includes(beat), beat);
    if (aClass.includes(beat)) {
      const idled = idle(rtm, cloneJson(save), 8).save;
      const rt = runtimeOf(idled);
      assert.equal(rt.completedEventIds.includes(beat), false, `${beat} 闲逛不得自结`);
      assert.ok(rt.activeEventIds.includes(beat), `${beat} 闲逛后仍应在场`);
      assert.equal((rt.offscreenResolvedEventIds || []).includes(beat), false, `${beat} 不得场外收束`);
      assert.equal(rt.gameOver, undefined, `${beat} 闲逛不得 gameOver`);
      proven.push(beat);
    }
    if (beat === 'lcq.event.s02_01') save = takeSilkMandate(rtm, tools.demo, save);
    while (!runtimeOf(save).completedEventIds.includes(beat)) {
      const selection = contractSelection(rtm, save);
      save = recordAndReload(rtm, save, selection).save;
    }
  }
  assert.deepEqual(proven, aClass);
});

test('B 类 s02_03 / s02_02 玩家参与与停滞 7 回合场外都能结清', async () => {
  const tools = await loadTools();
  const mods = await loadMods();
  const { rtm, demo } = tools;

  for (const beat of ['lcq.event.s02_03', 'lcq.event.s02_02']) {
    const walked = await walkHappyPath(tools, mods, ({ save, phase }) => (
      phase === 'active' && runtimeOf(save).activeEventIds.includes(beat)
    ));
    assert.ok(runtimeOf(walked.save).activeEventIds.includes(beat), beat);

    let participating = cloneJson(walked.save);
    while (!runtimeOf(participating).completedEventIds.includes(beat)) {
      const selection = contractSelection(rtm, participating);
      assertFast(demo, participating, { eventAction: selection, playerAction: selection.actionText });
      participating = recordAndReload(rtm, participating, selection).save;
    }
    assert.equal(runtimeOf(participating).gameOver, undefined, `${beat} 参与路径不得死`);
    assert.equal((runtimeOf(participating).offscreenResolvedEventIds || []).includes(beat), false);

    const stalled = idle(rtm, cloneJson(walked.save), 12);
    const rt = runtimeOf(stalled.save);
    assert.ok(rt.completedEventIds.includes(beat) || (rt.offscreenResolvedEventIds || []).includes(beat), `${beat} 停滞应场外结清：${JSON.stringify({
      completed: rt.completedEventIds,
      offscreen: rt.offscreenResolvedEventIds,
      active: rt.activeEventIds,
      stallTurns: rt.stallTurns,
      gameOver: rt.gameOver,
    })}`);
    assert.ok((rt.offscreenResolvedEventIds || []).includes(beat), `${beat} 停滞必须记入场外账本`);
    assert.equal(rt.gameOver, undefined, `${beat} 未见证自爆前闲逛不得焰浪死亡`);
  }
});

test('焰浪只在见证九阳之后拖满 3 回合死亡；炮烙只由显式拒绝触发', async () => {
  const tools = await loadTools();
  const mods = await loadMods();
  const { rtm } = tools;

  const atBlast = await walkHappyPath(tools, mods, ({ save, phase }) => (
    phase === 'active' && runtimeOf(save).activeEventIds.includes('lcq.event.s02_02')
  ));
  let save = atBlast.save;
  const first = contractSelection(rtm, save);
  assert.equal(first.actionId, 'hold_left_army_line');
  save = recordAndReload(rtm, save, first).save;
  const witness = contractSelection(rtm, save);
  assert.equal(witness.actionId, WITNESS);
  save = recordAndReload(rtm, save, witness).save;
  const afterWitness = cloneJson(save);
  const burned = idle(rtm, afterWitness, 3);
  assert.equal(runtimeOf(burned.save).gameOver?.endingId, 'lcq.ending.death.wangzhe_blast');
  assert.equal(runtimeOf(burned.save).gameOver?.title, '十里焦土');

  const escaped = recordAndReload(rtm, cloneJson(save), contractSelection(rtm, save));
  assert.ok(runtimeOf(escaped.save).completedEventIds.includes('lcq.event.s02_02'));
  assert.equal(runtimeOf(escaped.save).gameOver, undefined);

  const atPact = await walkHappyPath(tools, mods, ({ save: current, phase }) => (
    phase === 'active' && runtimeOf(current).activeEventIds.includes('lcq.event.sudaji_south_pact')
  ));
  const pactSave = atPact.save;
  const idlePact = idle(rtm, cloneJson(pactSave), 8).save;
  assert.equal(runtimeOf(idlePact).gameOver, undefined, '南荒之约闲逛不得炮烙');
  assert.equal(runtimeOf(idlePact).completedEventIds.includes('lcq.event.sudaji_south_pact'), false);

  const fatal = rtm.getCurrentStoryEventActions(pactSave).find(item => item.actionId === PAOLAO);
  assert.ok(fatal, '炮烙必须作为并列绝路选项出现');
  const fatalSave = cloneJson(pactSave);
  const refused = rtm.recordStoryEventStructuredAction(fatalSave, fatal);
  assert.equal(refused.attempted, true);
  assert.equal(refused.completed, false);
  assert.equal(runtimeOf(fatalSave).gameOver?.endingId, 'lcq.ending.death.paolao');
  assert.equal(runtimeOf(fatalSave).completedEventIds.includes('lcq.event.sudaji_south_pact'), false);
});
