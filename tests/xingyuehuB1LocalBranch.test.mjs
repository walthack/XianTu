import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const STAGE_ID = 'lcq.stage_05b';
const ENTRUSTMENT = 'lcq.event.xieyi_entrustment';
const ASHES_ITEM = 'lcq.item.xieyi_ashes';
const ASHES_TRANSFER = 'lcq.event.xieyi_entrustment.inventory.xieyi_ashes';
const SURVIVAL_TEXT = '谢艺重伤昏迷但尚有气息，众人救回了他，确认谢艺生还。';
const DEATH_TEXT = '谢艺倒在乱石间，呼吸断绝，确认其已经死亡。';

const runtimeOf = save => save.世界.状态.剧本模组;

function reloadSave(save) {
  return JSON.parse(JSON.stringify(save));
}

function ashesCount(save) {
  return Number(save.角色?.背包?.物品?.[ASHES_ITEM]?.数量) || 0;
}

function ashesReceipts(save) {
  return (runtimeOf(save).inventoryTransferReceipts || []).filter(item => item.transferId === ASHES_TRANSFER);
}

function assertNoFateInjected(save, label) {
  const flags = runtimeOf(save).flags || {};
  assert.notEqual(flags['event.s06_03.done'], true, `${label}: 不得预置 s06_03.done`);
  assert.notEqual(flags['event.s06_03.void'], true, `${label}: 不得预置 s06_03.void`);
  assert.notEqual(flags['branch.lcq.if_xieyi_longrest.active'], true, `${label}: 不得预置 longrest IF`);
  assert.equal(flags['character.xie_yi.status'], undefined, `${label}: 不得预置谢艺状态`);
  assert.notEqual(flags['world.xieyi_ashes.generated'], true, `${label}: 不得预置骨灰`);
  assert.equal(ashesCount(save), 0, `${label}: 选择前不得发骨灰`);
}

function assertDeadFate(save, label) {
  const flags = runtimeOf(save).flags || {};
  assert.equal(flags['event.xieyi_entrustment.done'], true, `${label}: 托付须完成`);
  assert.equal(flags['event.s06_03.done'], true, `${label}: 死亡须映射 s06_03.done`);
  assert.notEqual(flags['event.s06_03.void'], true, `${label}: 死亡不得 void`);
  assert.equal(flags['character.xie_yi.status'], 'dead', `${label}: 谢艺须为 dead`);
  assert.notEqual(flags['branch.lcq.if_xieyi_longrest.active'], true, `${label}: 死亡不得激活 longrest IF`);
  assert.notEqual(flags['world.xieyi_absence.active'], true, `${label}: 本纵切不得写 missing`);
  assert.equal(flags['world.xieyi_ashes.generated'], true, `${label}: 死亡须发骨灰回执`);
  assert.equal(ashesCount(save), 1, `${label}: 骨灰数量须为 1`);
  assert.equal(ashesReceipts(save).length, 1, `${label}: 骨灰 transfer 只能一次`);
}

function assertLongrestFate(save, label) {
  const flags = runtimeOf(save).flags || {};
  assert.equal(flags['event.xieyi_entrustment.done'], true, `${label}: 托付须完成`);
  assert.equal(flags['event.s06_03.void'], true, `${label}: 生还须 void s06_03`);
  assert.notEqual(flags['event.s06_03.done'], true, `${label}: 生还不得 done`);
  assert.equal(flags['character.xie_yi.status'], 'longrest', `${label}: 谢艺须为 longrest`);
  assert.equal(flags['branch.lcq.if_xieyi_longrest.active'], true, `${label}: 须激活 longrest IF`);
  assert.notEqual(flags['world.xieyi_absence.active'], true, `${label}: 本纵切不得写 missing`);
  assert.notEqual(flags['world.xieyi_ashes.generated'], true, `${label}: 生还不得发骨灰`);
  assert.equal(ashesCount(save), 0, `${label}: 生还背包不得有骨灰`);
  assert.equal(ashesReceipts(save).length, 0, `${label}: 生还不得有骨灰 transfer`);
}

async function loadProductionApi() {
  const [
    { createMinimalSaveDataV3 },
    { applyStrictScenarioInitializationToSave, buildStrictScenarioInitialization },
    runtime,
    { prepareEventActionJudgement },
    { resolvePendingJudgement },
    { runDeterministicXieyiReconcile, runEventReconcile },
  ] = await Promise.all([
    loadTs('../src/utils/dataRepair.ts'),
    loadTs('../src/modules/scenarioMods/strictInitializer.ts'),
    loadTs('../src/modules/scenarioMods/runtime.ts'),
    loadTs('../src/utils/judgementPreflight.ts'),
    loadTs('../src/utils/judgementEngine.ts'),
    loadTs('../src/services/eventReconcileService.ts'),
  ]);
  return {
    createMinimalSaveDataV3,
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
    ...runtime,
    prepareEventActionJudgement,
    resolvePendingJudgement,
    runDeterministicXieyiReconcile,
    runEventReconcile,
  };
}

async function loadStage() {
  const url = new URL(`../src/modules/scenarioMods/builtins/data/${STAGE_ID}.json`, import.meta.url);
  return JSON.parse(await readFile(url, 'utf8'));
}

async function productionSave(api, stage) {
  const save = api.applyStrictScenarioInitializationToSave(
    api.createMinimalSaveDataV3(),
    api.buildStrictScenarioInitialization(stage, '2026-09-13T00:00:00.000Z'),
  );
  return api.advanceScenarioRuntime(save).saveData;
}

function playAvailableAction(api, save) {
  const actions = api.getCurrentStoryEventActions(save);
  const action = actions.find(item => item.eventId !== ENTRUSTMENT && !item.judgement);
  if (!action) {
    throw new Error(`no playable prior action; active=${runtimeOf(save).activeEventIds} actions=${actions.map(item => item.actionId)}`);
  }
  const recorded = api.recordStoryEventStructuredAction(save, action);
  if (!recorded.attempted && recorded.reason === 'already_attempted') {
    runtimeOf(save).worldTurn = (Number(runtimeOf(save).worldTurn) || 0) + 1;
    const retry = api.recordStoryEventStructuredAction(save, action);
    if (!retry.attempted) {
      throw new Error(`prior action blocked after turn bump: ${retry.reason} ${action.actionId}`);
    }
  } else if (!recorded.attempted) {
    throw new Error(`prior action blocked: ${recorded.reason} ${action.actionId}`);
  }
  return api.advanceScenarioRuntime(save).saveData;
}

async function walkToEntrustment(api, stage) {
  let save = await productionSave(api, stage);
  for (let turn = 0; turn < 40; turn += 1) {
    const runtime = runtimeOf(save);
    if ((runtime.activeEventIds || []).includes(ENTRUSTMENT)) {
      const actions = api.getCurrentStoryEventActions(save);
      if (actions.some(item => item.eventId === ENTRUSTMENT)) {
        assertNoFateInjected(save, '走到命运拍');
        return save;
      }
    }
    if (runtime.nextStageReadyId) {
      throw new Error(`stage_ready before ${ENTRUSTMENT}; active=${runtime.activeEventIds}`);
    }
    save = playAvailableAction(api, save);
    runtimeOf(save).worldTurn = (Number(runtimeOf(save).worldTurn) || 0) + 1;
  }
  throw new Error(`did not reach ${ENTRUSTMENT}; active=${runtimeOf(save).activeEventIds}`);
}

function settleChoice(api, save) {
  let next = api.advanceScenarioRuntime(save).saveData;
  runtimeOf(next).worldTurn = (Number(runtimeOf(next).worldTurn) || 0) + 1;
  next = api.advanceScenarioRuntime(next).saveData;
  return next;
}

async function pokeIdempotency(api, save, selection, oppositeText) {
  const beforeAshes = ashesCount(save);
  const beforeFlags = JSON.stringify({
    done: runtimeOf(save).flags['event.s06_03.done'] === true,
    voided: runtimeOf(save).flags['event.s06_03.void'] === true,
    status: runtimeOf(save).flags['character.xie_yi.status'],
    ifActive: runtimeOf(save).flags['branch.lcq.if_xieyi_longrest.active'] === true,
    ashes: runtimeOf(save).flags['world.xieyi_ashes.generated'] === true,
  });
  const beforeAffinity = [...(runtimeOf(save).affinityGrantedEventIds || [])].sort();
  const beforeFav = Number(save.社交?.关系?.谢艺?.好感度);

  const replayed = api.recordStoryEventStructuredAction(save, selection);
  assert.ok(
    replayed.reason === 'already_completed' || replayed.reason === 'stale_event',
    `重复动作须拒绝二次结算，实际=${replayed.reason}`,
  );

  api.runDeterministicXieyiReconcile(save, oppositeText);
  const llm = await api.runEventReconcile({
    saveData: save,
    recentText: oppositeText,
    userAction: '重复对账',
    generate: async () => JSON.stringify({
      verdicts: [{
        id: 'lcq.event.s06_03',
        verdict: oppositeText.includes('生还') ? 'void' : 'done',
        evidence: oppositeText,
        confidence: 0.99,
        characterStates: { 'liuchao.character.xie_yi': oppositeText.includes('生还') ? 'longrest' : 'dead' },
      }],
    }),
  });
  assert.deepEqual(llm, [], '本地合同拍不得把命运交给 LLM 对账');

  const after = settleChoice(api, save);
  const afterFlags = JSON.stringify({
    done: runtimeOf(after).flags['event.s06_03.done'] === true,
    voided: runtimeOf(after).flags['event.s06_03.void'] === true,
    status: runtimeOf(after).flags['character.xie_yi.status'],
    ifActive: runtimeOf(after).flags['branch.lcq.if_xieyi_longrest.active'] === true,
    ashes: runtimeOf(after).flags['world.xieyi_ashes.generated'] === true,
  });
  assert.equal(afterFlags, beforeFlags, '重复 reconcile/advance 不得回滚或切换命运');
  assert.equal(ashesCount(after), beforeAshes, '不得二次发放骨灰');
  assert.equal(ashesReceipts(after).length, beforeAshes, '骨灰 transfer 仍只能一次');
  assert.deepEqual(
    [...(runtimeOf(after).affinityGrantedEventIds || [])].sort(),
    beforeAffinity,
    '重复推进不得二次发放共历好感',
  );
  if (Number.isFinite(beforeFav)) {
    assert.equal(Number(after.社交.关系.谢艺.好感度), beforeFav, '重复推进不得改谢艺好感');
  }
  return after;
}

test('B1 生产入口【承接】唯一落成 dead，资源/关系后果经 JSON 重载保持且幂等', async () => {
  const api = await loadProductionApi();
  const stage = await loadStage();
  let save = await walkToEntrustment(api, stage);
  const accept = api.getCurrentStoryEventActions(save).find(item => item.actionId === 'accept_entrustment');
  assert.ok(accept, '生产入口必须枚举【承接】');
  const beforeFav = Number(save.社交?.关系?.谢艺?.好感度);

  const recorded = api.recordStoryEventStructuredAction(save, accept);
  assert.equal(recorded.completed, true);
  const sameTurn = api.recordStoryEventStructuredAction(save, accept);
  assert.equal(sameTurn.reason, 'already_completed', '同一拍重复承接须直接拒绝');
  save = settleChoice(api, save);
  assertDeadFate(save, '承接当场');
  assert.ok(
    (runtimeOf(save).affinityGrantedEventIds || []).includes(ENTRUSTMENT),
    '死亡线须登记共历关系结算',
  );
  if (Number.isFinite(beforeFav) && save.社交?.关系?.谢艺) {
    assert.ok(Number(save.社交.关系.谢艺.好感度) >= beforeFav, '死亡线不得扣谢艺好感');
  }

  const reloaded = reloadSave(save);
  assertDeadFate(reloaded, 'JSON 重载');
  const replay = api.getCurrentStoryEventActions(reloaded);
  assert.equal(replay.some(item => item.eventId === ENTRUSTMENT), false, '重载后不得再给命运二选一');
  await pokeIdempotency(api, reloaded, accept, SURVIVAL_TEXT);
  assertDeadFate(reloaded, '重放后');
});

test('B1 生产入口【救治】success+ 唯一落成 longrest，无骨灰，JSON 重载保持且幂等', async () => {
  const api = await loadProductionApi();
  const stage = await loadStage();
  let save = await walkToEntrustment(api, stage);
  const rescue = api.getCurrentStoryEventActions(save).find(item => item.actionId === 'rescue_xieyi');
  assert.ok(rescue, '乐明珠在场时生产入口必须枚举【救治】');
  const beforeFav = Number(save.社交?.关系?.谢艺?.好感度);

  const issued = api.prepareEventActionJudgement(save, rescue, runtimeOf(save).worldTurn);
  let pendingReload = reloadSave(save);
  const locked = api.resolvePendingJudgement(pendingReload, issued.proposal.id, {
    currentTurn: runtimeOf(pendingReload).worldTurn,
    testOutcome: 'success',
    roll: () => 18,
  });
  pendingReload = reloadSave(pendingReload);
  const again = api.resolvePendingJudgement(pendingReload, issued.proposal.id, {
    currentTurn: runtimeOf(pendingReload).worldTurn,
    testOutcome: 'failure',
    roll: () => 1,
  });
  assert.equal(again.outcome, 'success', '已掷判定 JSON 重载后不得重骰');
  assert.equal(again.id, locked.id);

  const recorded = api.recordStoryEventStructuredAction(pendingReload, rescue, { judgementResolution: again });
  assert.equal(recorded.completed, true);
  save = settleChoice(api, pendingReload);
  assertLongrestFate(save, '救治当场');
  assert.ok(
    (runtimeOf(save).affinityGrantedEventIds || []).includes(ENTRUSTMENT),
    '生还线须登记共历关系结算',
  );
  if (Number.isFinite(beforeFav) && save.社交?.关系?.谢艺) {
    assert.ok(Number(save.社交.关系.谢艺.好感度) >= beforeFav, '生还线不得扣谢艺好感');
  }

  const reloaded = reloadSave(save);
  assertLongrestFate(reloaded, 'JSON 重载');
  await pokeIdempotency(api, reloaded, rescue, DEATH_TEXT);
  assertLongrestFate(reloaded, '重放后');
});

test('B1 未知/不可解析位置 fail-closed，不得离场默认 dead；可解析外场后再按离场收束', async () => {
  const api = await loadProductionApi();
  const stage = await loadStage();
  let save = await walkToEntrustment(api, stage);
  const accept = api.getCurrentStoryEventActions(save).find(item => item.actionId === 'accept_entrustment');
  assert.ok(accept, '走到命运拍后须仍有【承接】');
  assert.match(String(save.角色.位置.描述 || ''), /鬼王峒/);

  save.角色.位置.描述 = '__unresolvable_location__';
  save = settleChoice(api, save);
  assertNoFateInjected(save, '不可解析位置推进后');
  assert.notEqual(runtimeOf(save).flags['event.xieyi_entrustment.done'], true, '不可解析位置不得完成托付');
  assert.equal(
    (runtimeOf(save).completedEventIds || []).includes(ENTRUSTMENT),
    false,
    '不可解析位置不得把托付写入 completedEventIds',
  );
  assert.equal(
    api.getCurrentStoryEventActions(save).some(item => item.actionId === 'accept_entrustment'),
    true,
    '不可解析位置后仍须保留命运二选一',
  );

  save.角色.位置.描述 = '南荒·碧鲮族';
  save = settleChoice(api, save);
  assertDeadFate(save, '可解析外场后离开现场');

  const reloaded = reloadSave(save);
  assertDeadFate(reloaded, '外场收束后 JSON 重载');
  await pokeIdempotency(api, reloaded, accept, SURVIVAL_TEXT);
});

test('B1 离开命运拍现场按承接收束 dead，且不得被重放切走', async () => {
  const api = await loadProductionApi();
  const stage = await loadStage();
  let save = await walkToEntrustment(api, stage);
  const accept = api.getCurrentStoryEventActions(save).find(item => item.actionId === 'accept_entrustment');
  assert.ok(accept);
  assert.match(String(save.角色.位置.描述 || ''), /鬼王峒/);
  const activatedAt = runtimeOf(save).eventActivatedAtLocation?.[ENTRUSTMENT];
  const activatedName = String(
    (runtimeOf(save).canon?.locations || []).find(item => item.id === activatedAt)?.name || '',
  );
  assert.equal(activatedName, '鬼王峒', '命运拍须在鬼王峒记下激活位置');

  save.角色.位置.描述 = '南荒·碧鲮族';
  save = settleChoice(api, save);
  assertDeadFate(save, '离开现场');

  const reloaded = reloadSave(save);
  assertDeadFate(reloaded, '离开后 JSON 重载');
  await pokeIdempotency(api, reloaded, accept, SURVIVAL_TEXT);
});
