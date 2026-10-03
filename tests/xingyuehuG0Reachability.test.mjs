import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const data = id => new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`, import.meta.url);

const STAGE_IDS = {
  stage04b: 'lcq.stage_04b_lingfei_baiyi_crisis',
  stage05: 'lcq.stage_05',
  stage05b: 'lcq.stage_05b',
  stage06: 'lcq.stage_06',
  stage07: 'lcq.stage_07_qingyuan_jiankang',
  stage08: 'lcq.stage_08_jiankang_coup',
  linAn: 'lyl.lin_an_bridge',
};

const BILING_WAR = 'lcq.event.xieyi_biling_war';
const XIAO_OPENS = 'lcq.event.xiao_opens_resources';
const TOMB = 'lyl.event.lin_an_bridge_xieyi_tomb';
const ASHES_RECEIPT = 'lcq.event.xiaoyaoyi_arrives.path.ashes_delivered';
const WOUNDED_RECEIPT = 'lcq.event.xiaoyaoyi_arrives.path.wounded_escorted';
const S08_DEBUT = 'lcq.event.s08_debut_xiaoyaoyi';

const runtimeOf = save => save.世界.状态.剧本模组;

async function loadStage(id) {
  return JSON.parse(await readFile(data(id), 'utf8'));
}

async function productionSave(stage, mutate) {
  const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
  const { applyStrictScenarioInitializationToSave, buildStrictScenarioInitialization } =
    await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = applyStrictScenarioInitializationToSave(
    createMinimalSaveDataV3(),
    buildStrictScenarioInitialization(stage, '2026-09-12T00:00:00.000Z'),
  );
  mutate?.(runtimeOf(save));
  return advanceScenarioRuntime(save).saveData;
}

function completionFlag(runtime, eventId) {
  const event = (runtime.events || []).find(item => item.id === eventId);
  const path = event?.completion?.[0]?.path;
  if (typeof path === 'string' && path.startsWith('flags.')) return path.slice('flags.'.length);
  return `event.${eventId.split('.').pop()}.done`;
}

async function walkRailUntil(save, targetId, railIds) {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  let current = save;
  for (let turn = 0; turn < 80; turn += 1) {
    const runtime = runtimeOf(current);
    if ((runtime.activeEventIds || []).includes(targetId)) return current;
    if (runtime.nextStageReadyId) {
      throw new Error(`stage_ready before reaching ${targetId}; active=${runtime.activeEventIds}`);
    }
    const head = railIds.find(id => (runtime.activeEventIds || []).includes(id));
    if (!head) throw new Error(`rail stalled before ${targetId}; active=${runtime.activeEventIds}`);
    runtime.flags[completionFlag(runtime, head)] = true;
    current = advanceScenarioRuntime(current).saveData;
  }
  throw new Error(`did not reach ${targetId}`);
}

async function finishRail(save, railIds) {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  let current = save;
  for (let turn = 0; turn < 80; turn += 1) {
    const runtime = runtimeOf(current);
    if (runtime.nextStageReadyId) return current;
    const head = railIds.find(id => (runtime.activeEventIds || []).includes(id)
      && !(runtime.completedEventIds || []).includes(id));
    if (!head) {
      current = advanceScenarioRuntime(current).saveData;
      continue;
    }
    runtime.flags[completionFlag(runtime, head)] = true;
    current = advanceScenarioRuntime(current).saveData;
  }
  throw new Error(`rail did not reach stage_ready; active=${runtimeOf(current).activeEventIds}`);
}

async function loadTransitionMods() {
  return Promise.all([
    loadStage(STAGE_IDS.stage04b),
    loadStage(STAGE_IDS.stage05),
    loadStage(STAGE_IDS.stage05b),
    loadStage(STAGE_IDS.stage06),
    loadStage(STAGE_IDS.stage07),
    loadStage(STAGE_IDS.stage08),
  ]);
}

test('承重拍挂在默认路线 rail 的指定位置', async () => {
  const { CANON_RAIL_PROFILES } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  const byId = Object.fromEntries(CANON_RAIL_PROFILES.map(profile => [profile.modId, profile]));

  const stage04b = byId[STAGE_IDS.stage04b];
  assert.equal(
    stage04b.orderedEventIds[stage04b.orderedEventIds.indexOf('lcq.event.s04b_lingfei_baiyi_crisis_16') + 1],
    BILING_WAR,
  );

  const stage07 = byId[STAGE_IDS.stage07];
  assert.equal(
    stage07.orderedEventIds[stage07.orderedEventIds.indexOf('lcq.event.s07_05_eight_steeds_informed') + 1],
    XIAO_OPENS,
  );

  const linAn = byId[STAGE_IDS.linAn];
  assert.equal(
    linAn.orderedEventIds[linAn.orderedEventIds.indexOf('lyl.event.lin_an_bridge_04_beat') + 1],
    TOMB,
  );
  assert.equal(stage04b.contracts.length, stage04b.orderedEventIds.length);
  assert.equal(stage07.contracts.length, stage07.orderedEventIds.length);
  assert.equal(linAn.contracts.length, linAn.orderedEventIds.length);
});

test('B1/B2：04b 生产入口能走到谢艺旧战，未挂章 critical 不再挡切关', async () => {
  const { getCanonRailProfile } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  const { transitionToNextScenarioStage } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { hasPendingProductionCriticalEvent } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const stage = await loadStage(STAGE_IDS.stage04b);
  const rail = getCanonRailProfile({ modId: stage.manifest.id }).orderedEventIds;
  assert.ok(rail.includes(BILING_WAR));

  const opened = await walkRailUntil(await productionSave(stage), BILING_WAR, rail);
  assert.ok(runtimeOf(opened).activeEventIds.includes(BILING_WAR));

  const ready = await finishRail(opened, rail);
  const readyRt = runtimeOf(ready);
  assert.equal(readyRt.nextStageReadyId, 'lcq.stage_05');
  assert.equal(hasPendingProductionCriticalEvent(readyRt), false);
  assert.equal(readyRt.flags['event.biling_bay_stance.done'], true);
  assert.equal(
    stage.scenario.events.some(event => event.id === 'lcq.event.weapon_deal_with_geluo' && event.critical === true),
    true,
    '碧鲮至进峒事件已挂接，不再是悬空内容',
  );

  const mods = await loadTransitionMods();
  const jumped = transitionToNextScenarioStage(ready, mods);
  assert.equal(jumped.ok, true, jumped.reason);
  assert.equal(jumped.to, STAGE_IDS.stage05b);
});

test('B3：05b 未挂章 critical 不挡切关，命运 IF 可带进 07', async () => {
  const { getCanonRailProfile } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  const { transitionToNextScenarioStage } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const stage = await loadStage(STAGE_IDS.stage05b);
  const rail = getCanonRailProfile({ modId: stage.manifest.id }).orderedEventIds;
  assert.equal(rail.includes('lcq.event.biling_bay_stance'), false);
  assert.equal(rail.includes('lcq.event.huamiao_coop_boundary'), false);

  const ready = await finishRail(await productionSave(stage), rail);
  const readyRt = runtimeOf(ready);
  assert.equal(readyRt.nextStageReadyId, 'lcq.stage_06');
  assert.notEqual(readyRt.flags['event.biling_bay_stance.done'], true);
  assert.notEqual(readyRt.flags['event.huamiao_coop_boundary.done'], true);

  readyRt.flags['character.xie_yi.status'] = 'longrest';
  readyRt.flags['branch.lcq.if_xieyi_longrest.active'] = true;
  readyRt.flags['branch.lcq.if_xieyi_longrest.unlocked'] = true;
  readyRt.flags['event.s06_03.void'] = true;

  const mods = await loadTransitionMods();
  const jumped = transitionToNextScenarioStage(ready, mods);
  assert.equal(jumped.ok, true, jumped.reason);
  assert.equal(jumped.to, STAGE_IDS.stage07);
  const dest = runtimeOf(jumped.saveData);
  assert.equal(dest.flags['branch.lcq.if_xieyi_longrest.active'], true);
  assert.equal(dest.flags['character.xie_yi.status'], 'longrest');
  assert.equal(dest.flags['event.s06_03.void'], true);
  assert.ok(dest.activeEventIds.includes('lcq.event.xiaoyaoyi_arrives'));
  assert.deepEqual(
    getCurrentStoryEventActions(jumped.saveData).map(item => item.actionId),
    ['escort_wounded'],
  );
});

test('B4：07 生产入口在 s07_05 之后激活星月开库', async () => {
  const { getCanonRailProfile } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');
  const stage = await loadStage(STAGE_IDS.stage07);
  const rail = getCanonRailProfile({ modId: stage.manifest.id }).orderedEventIds;
  let save = await productionSave(stage);
  const first = getCurrentStoryEventActions(save).find(item => item.actionId === 'deliver_ashes');
  assert.ok(first, '死亡线应先见到交骨灰');
  assert.equal(recordStoryEventStructuredAction(save, first).completed, true);
  assert.ok(runtimeOf(save).pathReceipts[ASHES_RECEIPT]);
  assert.equal(runtimeOf(save).pathReceipts[WOUNDED_RECEIPT], undefined);

  save = await walkRailUntil(save, XIAO_OPENS, rail);
  assert.ok(runtimeOf(save).activeEventIds.includes(XIAO_OPENS));
  // 到达≠完成：人不在开库地点时只有移动，到场后才是合同动作。
  const [travel] = getCurrentStoryEventActions(save);
  assert.match(travel.actionId, /^travel:/);
  assert.equal(recordStoryEventStructuredAction(save, travel).completed, false);
  assert.deepEqual(
    getCurrentStoryEventActions(save).map(item => item.actionId),
    ['hear_xingyue_support_dead'],
  );
});

test('B5：临安生产入口能走到墓祭；dead 可见谢艺墓，longrest 隐藏', async () => {
  const { getCanonRailProfile } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');
  const stage = await loadStage(STAGE_IDS.linAn);
  const rail = getCanonRailProfile({ modId: stage.manifest.id }).orderedEventIds;

  const dead = await walkRailUntil(await productionSave(stage), TOMB, rail);
  assert.ok(runtimeOf(dead).activeEventIds.includes(TOMB));
  const greet = getCurrentStoryEventActions(dead);
  assert.deepEqual(greet.map(item => item.actionId), ['meet_yueshuang_outside_linan']);
  assert.equal(recordStoryEventStructuredAction(dead, greet[0]).completed, false);
  runtimeOf(dead).worldTurn += 1;
  assert.deepEqual(
    getCurrentStoryEventActions(dead).map(item => item.actionId),
    ['worship_yue_and_xieyi_tomb'],
  );

  const liveSave = await productionSave(stage);
  runtimeOf(liveSave).flags['branch.lcq.if_xieyi_longrest.active'] = true;
  const live = await walkRailUntil(liveSave, TOMB, rail);
  const liveGreet = getCurrentStoryEventActions(live);
  assert.equal(recordStoryEventStructuredAction(live, liveGreet[0]).completed, false);
  runtimeOf(live).worldTurn += 1;
  const liveWorship = getCurrentStoryEventActions(live);
  assert.deepEqual(liveWorship.map(item => item.actionId), ['worship_yue_only']);
  assert.match(liveWorship[0].actionText, /只祭岳鹏举/);
  assert.equal(/谢艺的墓/.test(liveWorship[0].actionText), false);
});

test('B6：07 登场回执跨关继承后，08 不再二次死亡登场', async () => {
  const { getCanonRailProfile } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { transitionToNextScenarioStage } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const stage07 = await loadStage(STAGE_IDS.stage07);
  const stage08 = await loadStage(STAGE_IDS.stage08);
  const rail = getCanonRailProfile({ modId: stage07.manifest.id }).orderedEventIds;

  let save = await productionSave(stage07);
  const debut = getCurrentStoryEventActions(save).find(item => item.actionId === 'deliver_ashes');
  assert.equal(recordStoryEventStructuredAction(save, debut).completed, true);
  save = await finishRail(save, rail);
  assert.equal(runtimeOf(save).nextStageReadyId, STAGE_IDS.stage08);

  const jumped = transitionToNextScenarioStage(save, await loadTransitionMods());
  assert.equal(jumped.ok, true, jumped.reason);
  assert.equal(jumped.to, STAGE_IDS.stage08);
  const dest = runtimeOf(jumped.saveData);
  assert.ok(dest.pathReceipts[ASHES_RECEIPT]);
  assert.equal(dest.pathReceipts[WOUNDED_RECEIPT], undefined);
  assert.equal(dest.activeEventIds.includes(S08_DEBUT), false);

  const fresh08 = await productionSave(stage08);
  assert.ok(
    runtimeOf(fresh08).activeEventIds.includes(S08_DEBUT),
    '无继承回执时 08 仍保留旧登场入口',
  );
});

test('B6b：两条唯一登场回执均可跨关 suppress 08；event.done 单独不能', async () => {
  const stage07 = await loadStage(STAGE_IDS.stage07);
  const stage08 = await loadStage(STAGE_IDS.stage08);
  const debut = stage07.scenario.events.find(event => event.id === 'lcq.event.xiaoyaoyi_arrives');
  const receiptIds = debut.playerCompletionContract.actions.flatMap(action =>
    (action.outcomeEffects?.success?.pathReceipts || []).map(receipt => receipt.receiptId),
  );
  assert.deepEqual(receiptIds, [ASHES_RECEIPT, WOUNDED_RECEIPT]);
  assert.equal(new Set(receiptIds).size, receiptIds.length);

  const conditions = stage08.scenario.events.find(event => event.id === S08_DEBUT).conditions;
  assert.deepEqual(conditions, [
    { path: `pathReceipts.${ASHES_RECEIPT}`, operator: 'neq', value: true },
    { path: `pathReceipts.${WOUNDED_RECEIPT}`, operator: 'neq', value: true },
  ]);

  const plant = (receiptId, choiceId) => runtime => {
    runtime.pathReceipts[receiptId] = {
      receiptId,
      sourceEventId: 'lcq.event.xiaoyaoyi_arrives',
      choiceId,
      mutexGroupId: 'lcq.event.xiaoyaoyi_arrives.mutex.fate',
      dimension: 'method',
      label: 'planted',
      consumeAtEventIds: ['lcq.event.s07_05_eight_steeds_informed'],
      selectedAtTurn: 1,
    };
  };

  const ashes08 = await productionSave(stage08, plant(ASHES_RECEIPT, 'deliver_ashes'));
  assert.equal(runtimeOf(ashes08).activeEventIds.includes(S08_DEBUT), false);

  const wounded08 = await productionSave(stage08, plant(WOUNDED_RECEIPT, 'escort_wounded'));
  assert.equal(runtimeOf(wounded08).activeEventIds.includes(S08_DEBUT), false);

  const doneOnly = await productionSave(stage08, runtime => {
    runtime.flags['event.xiaoyaoyi_arrives.done'] = true;
  });
  assert.ok(
    runtimeOf(doneOnly).activeEventIds.includes(S08_DEBUT),
    '不得靠 event.done 跨关 suppress 08 死亡登场',
  );
});

test('B7：report_death 对 future absence fail-closed；无 absence 时死亡线仍可见', async () => {
  const { getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const stage = await loadStage(STAGE_IDS.stage07);
  const base = {
    角色: { 位置: { 描述: '中州·建康' } },
    世界: {
      状态: {
        剧本模组: {
          modId: stage.manifest.id,
          flags: {
            ...stage.scenario.initialFlags,
            'event.xieyi_entrustment.done': true,
            'event.xiaoyaoyi_arrives.done': true,
          },
          chapters: structuredClone(stage.scenario.chapters),
          currentChapterId: 'lcq.chapter.stage_07_qingyuan_jiankang_jiankang',
          events: structuredClone(stage.scenario.events),
          activeEventIds: ['lcq.event.s07_05_eight_steeds_informed'],
          completedEventIds: ['lcq.event.xiaoyaoyi_arrives'],
          completedChapterIds: [],
          pathReceipts: {},
          playerKnowledge: {},
          stallTurns: 0,
          worldTurn: 40,
          canon: structuredClone(stage.canon),
        },
      },
    },
  };

  assert.deepEqual(
    getCurrentStoryEventActions(structuredClone(base)).map(item => item.actionId),
    ['report_death'],
  );

  const missing = structuredClone(base);
  runtimeOf(missing).flags['world.xieyi_absence.active'] = true;
  assert.deepEqual(
    getCurrentStoryEventActions(missing).map(item => item.actionId),
    ['idle:lcq.event.s07_05_eight_steeds_informed'],
    'absence 不得落到死亡按钮；到场无可用动作时只给固定提示',
  );
});
