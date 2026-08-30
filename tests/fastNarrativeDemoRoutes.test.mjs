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
const S02_01 = 'lcq.event.s02_01';
const S02_02 = 'lcq.event.s02_02';
const S02_03 = 'lcq.event.s02_03';
const S02_04 = 'lcq.event.s02_04';
const BAIHU = 'lcq.event.baihu_shangguan_escape';
const SUDAJI = 'lcq.event.sudaji_south_pact';
const TAKE_MANDATE = 'opportunity.lcq.s02_01.take_full_mandate';
const WALK_OUT = 'walk_out_wuyuan_shangguan';
const TAMPERED_JUDGEMENT = {
  id: 'judge-tampered-not-on-save',
  status: 'resolved',
  kind: 'combat',
  outcome: 'success',
  actionText: '篡改判定',
};

async function loadMods() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const [raw01, raw02] = await Promise.all([
    readFile(stage01Url, 'utf8'),
    readFile(stage02Url, 'utf8'),
  ]);
  return {
    stage01: parseScenarioMod(JSON.parse(raw01)),
    stage02: parseScenarioMod(JSON.parse(raw02)),
  };
}

async function loadDemo() {
  return loadTs('../src/modules/scenarioMods/fastNarrativeDemo.ts');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function snapshot(save) {
  return JSON.stringify(save);
}

function runtimeOf(save) {
  return save.世界.状态.剧本模组;
}

function playtestMarker(save) {
  return save?.系统?.扩展?.清羽记开局;
}

function copyPlaytestMarker(fromSave, toSave) {
  const marker = cloneJson(playtestMarker(fromSave));
  assert.equal(marker?.kind, 'qingyu-demo-v1', 'must copy the real demo marker kind');
  toSave.系统 = toSave.系统 || {};
  toSave.系统.扩展 = toSave.系统.扩展 || {};
  toSave.系统.扩展.清羽记开局 = marker;
}

function locateEvent(save, eventId, extra = {}) {
  const rt = runtimeOf(save);
  const chapter = (rt.chapters || []).find(item => (item.eventIds || []).includes(eventId));
  assert.ok(chapter, `chapter containing ${eventId} must exist in parsed stage_02`);
  rt.currentChapterId = extra.currentChapterId || chapter.id;
  rt.activeEventIds = extra.activeEventIds || [eventId];
  if (extra.completedEventIds) rt.completedEventIds = extra.completedEventIds;
  rt.flags = { ...(rt.flags || {}), ...(extra.flags || {}) };
  if (extra.flags === undefined) {
    const doneKey = eventId.replace(/^lcq\./, '').replace(/^event\./, 'event.') + '.done';
    const short = eventId.replace(/^lcq\.event\./, 'event.') + '.done';
    rt.flags[short] = false;
    rt.flags[doneKey] = false;
  }
}

function planInput(save, extra = {}) {
  return {
    saveData: save,
    playerAction: extra.playerAction ?? extra.eventAction?.actionText ?? extra.opportunityAction?.actionText
      ?? extra.openWorldAction?.actionText ?? '我按当前合同行动',
    storage: extra.storage ?? ON_STORAGE,
    ...extra,
  };
}

async function stage02Fixture() {
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
    transitionToNextScenarioStage,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
  const { stage01, stage02 } = await loadMods();
  const stage01Save = createQingyuOpeningPlaytestSave(stage01);
  const source = cloneJson(stage01Save);
  source.世界.状态.剧本模组.nextStageReadyId = 'lcq.stage_02';
  const transitioned = transitionToNextScenarioStage(source, [stage02]);
  let save;
  if (transitioned.ok) {
    save = transitioned.saveData;
    if (playtestMarker(save)?.kind !== playtestMarker(stage01Save)?.kind) {
      copyPlaytestMarker(stage01Save, save);
    }
  } else {
    save = applyStrictScenarioInitializationToSave(
      createMinimalSaveDataV3(),
      buildStrictScenarioInitialization(stage02),
    );
    copyPlaytestMarker(stage01Save, save);
  }
  assert.equal(runtimeOf(save).modId, 'lcq.stage_02');
  assert.equal(playtestMarker(save).kind, 'qingyu-demo-v1');
  return save;
}

test('stage02 fresh event selection plans kind=event without mutating save', async () => {
  const demo = await loadDemo();
  const { getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { QINGYU_OPENING_PLAYTEST_EVENT_IDS } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const save = await stage02Fixture();
  const allowed = new Set(QINGYU_OPENING_PLAYTEST_EVENT_IDS);
  const rt = runtimeOf(save);
  const candidate = (rt.events || []).find(event =>
    allowed.has(event.id) && event.playerCompletionContract);
  assert.ok(candidate, 'stage_02 must expose a playtest event with a completion contract');
  locateEvent(save, candidate.id);

  const actions = getCurrentStoryEventActions(save);
  const selection = actions.find(item => allowed.has(item.eventId));
  assert.ok(selection, 'getCurrentStoryEventActions must return a real playtest event selection');
  const before = snapshot(save);

  const plan = demo.planFastNarrativeDemo(planInput(save, {
    eventAction: selection,
    playerAction: selection.actionText,
  }));
  assert.ok(plan, 'fresh event selection must plan');
  assert.equal(plan.packet.kind, 'event');
  assert.equal(snapshot(save), before, 'planner must not mutate the original save');

  const tamperedId = { ...selection, actionId: `${selection.actionId}__tampered` };
  assert.equal(demo.planFastNarrativeDemo(planInput(save, { eventAction: tamperedId })), null);
  const tamperedHash = { ...selection, contractHash: `${selection.contractHash}__stale` };
  assert.equal(demo.planFastNarrativeDemo(planInput(save, { eventAction: tamperedHash })), null);
  assert.equal(demo.planFastNarrativeDemo(planInput(save, {
    eventAction: selection,
    judgementResolution: TAMPERED_JUDGEMENT,
  })), null);
  assert.equal(snapshot(save), before);
});

test('wang zhe silk pouch opportunity plans kind=opportunity with exact transfer fact', async () => {
  const demo = await loadDemo();
  const {
    getCurrentStoryEventActions,
    getTrackedStoryOpportunityActions,
    trackStoryOpportunity,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = await stage02Fixture();
  locateEvent(save, S02_01, {
    completedEventIds: [],
    flags: { 'event.s02_01.done': false, 'chapter.lcq.stage_02.started': true },
  });

  const tracked = trackStoryOpportunity(save, TAKE_MANDATE);
  assert.equal(tracked.ok, true, tracked.reason || 'trackStoryOpportunity must accept take_full_mandate');
  const selections = getTrackedStoryOpportunityActions(save);
  const selection = selections[0];
  assert.ok(selection, 'tracked opportunity must expose a real first-step selection');
  const before = snapshot(save);

  const plan = demo.planFastNarrativeDemo(planInput(save, {
    opportunityAction: selection,
    playerAction: selection.actionText,
  }));
  assert.ok(plan, 'fresh opportunity selection must plan');
  assert.equal(plan.packet.kind, 'opportunity');
  assert.deepEqual(plan.packet.settledFacts, ['获得1×锦囊']);
  assert.equal(plan.packet.kind === 'event', false);
  assert.equal(snapshot(save), before, 'planner must not mutate the original save');

  // Freshness enumeration reconciles its argument, so perform this independent
  // comparison on a clone instead of attributing enumerator writes to the planner.
  const eventActions = getCurrentStoryEventActions(cloneJson(save));
  const eventPlan = eventActions.length
    ? demo.planFastNarrativeDemo(planInput(save, { eventAction: eventActions[0] }))
    : null;
  if (eventPlan) {
    assert.equal((eventPlan.packet.settledFacts || []).includes('获得1×锦囊'), false,
      'the silk-pouch transfer must not be attributed to a normal event plan');
  }

  const tamperedId = { ...selection, actionId: `${selection.actionId}__tampered` };
  assert.equal(demo.planFastNarrativeDemo(planInput(save, { opportunityAction: tamperedId })), null);
  const stale = { ...selection, contractHash: `${selection.contractHash}__stale` };
  assert.equal(demo.planFastNarrativeDemo(planInput(save, { opportunityAction: stale })), null);
  assert.equal(demo.planFastNarrativeDemo(planInput(save, {
    opportunityAction: selection,
    judgementResolution: TAMPERED_JUDGEMENT,
  })), null);
  assert.equal(snapshot(save), before);
});

test('qingyu demo structured opportunityAction renders from local receipts and never invents loot', async () => {
  const demo = await loadDemo();
  const {
    getTrackedStoryOpportunityActions,
    recordStoryOpportunityStructuredAction,
    trackStoryOpportunity,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = await stage02Fixture();
  locateEvent(save, S02_01, {
    completedEventIds: [],
    flags: { 'event.s02_01.done': false, 'chapter.lcq.stage_02.started': true },
  });
  assert.equal(trackStoryOpportunity(save, TAKE_MANDATE).ok, true);
  const firstSelection = getTrackedStoryOpportunityActions(save)[0];
  const before = snapshot(save);

  const firstText = demo.previewQingyuOpportunityNarrative(save, firstSelection);
  assert.match(firstText, /锦囊已经到手/);
  assert.match(firstText, /接下来需要认下托付/);
  assert.doesNotMatch(firstText, /令牌|旧帕|缺口|过哨|获得|回执|落账|机制/);
  assert.equal(snapshot(save), before, 'preview must not mutate the live save');

  const first = recordStoryOpportunityStructuredAction(save, firstSelection);
  assert.equal(first.progressed, true);
  assert.equal(save.角色.背包.物品['lcq.item.jin_nang'].数量, 1);
  save.世界.状态.剧本模组.worldTurn += 1;

  const secondSelection = getTrackedStoryOpportunityActions(save)[0];
  assert.match(secondSelection.label, /认下托付/);
  const secondText = demo.previewQingyuOpportunityNarrative(save, secondSelection);
  assert.match(secondText, /眼前这一步已经做完/);
  assert.doesNotMatch(secondText, /令牌|旧帕|缺口|过哨|获得|已经到手/);
  assert.equal(save.角色.背包.物品['lcq.item.jin_nang'].数量, 1);
  assert.equal(save.世界.状态.剧本模组.inventoryTransferReceipts.length, 1);

  const stale = demo.previewQingyuOpportunityNarrative(save, firstSelection);
  assert.match(stale, /已经过期/);
  assert.doesNotMatch(stale, /令牌|旧帕/);

  const unmarked = cloneJson(save);
  delete unmarked.系统.扩展.清羽记开局;
  assert.equal(demo.previewQingyuOpportunityNarrative(unmarked, secondSelection), '');
});

test('qingyu demo structured opportunityAction is wired before 156KB Legacy', async () => {
  const system = await readFile(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url), 'utf8');
  const start = system.indexOf('if (!legacyNarrativePilotResponse)');
  const slice = system.slice(start, system.indexOf('const v3 = isSaveDataV3'));
  assert.match(slice, /previewQingyuOpportunityNarrative/);
  assert.match(slice, /if \(!localContractText\)/);
});

test('wuyuan open world fresh selection plans kind=open_world from clone settlement', async () => {
  const demo = await loadDemo();
  const {
    getWuyuanOpenWorldSelections,
    settleWuyuanOpenWorldSelection,
  } = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
  const save = await stage02Fixture();
  locateEvent(save, S02_04, {
    completedEventIds: [S02_02, S02_03],
    flags: {
      'event.s02_04.done': false,
      'event.s02_03.done': true,
      'event.s02_02.done': true,
      'chapter.lcq.stage_02.started': true,
    },
  });
  assert.equal(playtestMarker(save).kind, 'qingyu-demo-v1');

  const selections = getWuyuanOpenWorldSelections(save);
  const immediate = selections.find((item) => {
    const preview = settleWuyuanOpenWorldSelection(cloneJson(save), item);
    return preview?.settled === true && preview?.idempotent !== true;
  });
  assert.ok(immediate, 'a travel/notice/problem action must settle immediately');
  const cloneFacts = settleWuyuanOpenWorldSelection(cloneJson(save), immediate).settledFacts;
  const before = snapshot(save);

  const plan = demo.planFastNarrativeDemo(planInput(save, {
    openWorldAction: immediate,
    playerAction: immediate.actionText,
  }));
  assert.ok(plan, 'fresh open-world selection must plan');
  assert.equal(plan.packet.kind, 'open_world');
  assert.deepEqual(plan.packet.settledFacts, cloneFacts);
  assert.equal(snapshot(save), before);

  const tampered = { ...immediate, identityId: `${immediate.identityId}__tampered` };
  assert.equal(demo.planFastNarrativeDemo(planInput(save, { openWorldAction: tampered })), null);
  assert.equal(demo.planFastNarrativeDemo(planInput(save, {
    openWorldAction: immediate,
    judgementResolution: TAMPERED_JUDGEMENT,
  })), null);
  assert.equal(snapshot(save), before);
});

test('baihu escape is last demo event and fail-closes every fast route after completion', async () => {
  const demo = await loadDemo();
  const { getCurrentStoryEventActions, getTrackedStoryOpportunityActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { getWuyuanOpenWorldSelections } = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
  const { QINGYU_OPENING_PLAYTEST_EVENT_IDS } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const save = await stage02Fixture();
  const markerIds = playtestMarker(save).eventIds;
  assert.equal(markerIds.at(-1), BAIHU);
  assert.equal(markerIds.slice(markerIds.indexOf(BAIHU) + 1).includes(SUDAJI), false);
  assert.equal(QINGYU_OPENING_PLAYTEST_EVENT_IDS.at(-1), BAIHU);

  locateEvent(save, BAIHU, {
    flags: { 'event.baihu_shangguan_escape.done': false, 'chapter.lcq.stage_02.started': true },
  });
  const actions = getCurrentStoryEventActions(save);
  const walkOut = actions.find(item => item.actionId === WALK_OUT);
  assert.ok(walkOut, 'fresh walk_out_wuyuan_shangguan must come from getCurrentStoryEventActions');
  const before = snapshot(save);
  const plan = demo.planFastNarrativeDemo(planInput(save, {
    eventAction: walkOut,
    playerAction: walkOut.actionText,
  }));
  assert.ok(plan, 'baihu walk-out must plan while the event is still active');
  assert.equal(plan.packet.kind, 'event');
  assert.equal(snapshot(save), before);

  const closed = cloneJson(save);
  const closedRt = runtimeOf(closed);
  closedRt.completedEventIds = [...new Set([...(closedRt.completedEventIds || []), BAIHU])];
  closedRt.activeEventIds = (closedRt.activeEventIds || []).filter(id => id !== BAIHU);
  closedRt.flags = { ...closedRt.flags, 'event.baihu_shangguan_escape.done': true };

  const closedActions = getCurrentStoryEventActions(closed);
  const closedOpp = getTrackedStoryOpportunityActions(closed);
  const closedOpen = getWuyuanOpenWorldSelections(closed);
  assert.equal(demo.planFastNarrativeDemo(planInput(closed, { eventAction: walkOut })), null);
  if (closedActions[0]) {
    assert.equal(demo.planFastNarrativeDemo(planInput(closed, { eventAction: closedActions[0] })), null);
  }
  if (closedOpp[0]) {
    assert.equal(demo.planFastNarrativeDemo(planInput(closed, { opportunityAction: closedOpp[0] })), null);
  }
  if (closedOpen[0]) {
    assert.equal(demo.planFastNarrativeDemo(planInput(closed, { openWorldAction: closedOpen[0] })), null);
  }
  assert.equal(demo.planFastNarrativeDemo(planInput(closed, {
    judgementResolution: TAMPERED_JUDGEMENT,
  })), null);
});
