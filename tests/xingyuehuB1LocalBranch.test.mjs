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
// 南荒新增前置拍现在累计+80；从0开始保留托付+8的可用空间，生产上限仍为100。
const XIEYI_EXISTING_AFFINITY = 0;
const CRITICAL_AFFINITY_GRANT = 8;

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

function seedExistingXieyiRelation(save, favorability = XIEYI_EXISTING_AFFINITY) {
  save.社交 ||= {};
  save.社交.关系 ||= {};
  save.社交.关系.谢艺 = {
    名字: '谢艺',
    好感度: favorability,
    与玩家关系: '同伴',
  };
}

function xieyiFavorability(save) {
  const value = Number(save.社交?.关系?.谢艺?.好感度);
  assert.equal(Number.isFinite(value), true, '须存在既有谢艺关系且好感度为有限数');
  return value;
}

function assertXieyiCriticalAffinity(save, beforeFav, label) {
  assert.equal(
    xieyiFavorability(save),
    beforeFav + CRITICAL_AFFINITY_GRANT,
    `${label}: 谢艺好感须精确 +${CRITICAL_AFFINITY_GRANT}`,
  );
  assert.ok(
    (runtimeOf(save).affinityGrantedEventIds || []).includes(ENTRUSTMENT),
    `${label}: 须登记共历关系结算`,
  );
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
    { resolvePendingJudgement, getJudgementState, createJudgementProposal, persistPendingJudgement, cancelPendingJudgement },
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
    getJudgementState,
    createJudgementProposal,
    persistPendingJudgement,
    cancelPendingJudgement,
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
  seedExistingXieyiRelation(save);
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

// 第106章战前锁（裁定 #168）：默认选【支援】，与此前逐拍点第一个可用动作的行为一致。
async function walkToEntrustment(api, stage, supportChoice = 'support_xieyi_counterstrike') {
  let save = await productionSave(api, stage);
  for (let turn = 0; turn < 40; turn += 1) {
    const runtime = runtimeOf(save);
    const lockChoice = api.getCurrentStoryEventActions(save).find(item => item.actionId === supportChoice);
    if (lockChoice) {
      assert.equal(api.recordStoryEventStructuredAction(save, lockChoice).attempted, true, supportChoice);
      save = api.advanceScenarioRuntime(save).saveData;
      runtimeOf(save).worldTurn = (Number(runtimeOf(save).worldTurn) || 0) + 1;
      continue;
    }
    if ((runtime.activeEventIds || []).includes(ENTRUSTMENT)) {
      const actions = api.getCurrentStoryEventActions(save);
      if (actions.some(item => item.eventId === ENTRUSTMENT)) {
        // 上一拍在同一轮 advance 里才写入 completedEventIds，共历好感要再推一轮才入账。
        // 这一轮不是玩家行动，不能消耗场外 afterStallTurns 窗口。
        const stallBefore = Number(runtimeOf(save).stallTurns) || 0;
        save = api.advanceScenarioRuntime(save).saveData;
        runtimeOf(save).stallTurns = stallBefore;
        assertNoFateInjected(save, '走到命运拍');
        assert.ok(
          api.getCurrentStoryEventActions(save).some(item => item.eventId === ENTRUSTMENT),
          '收口共历好感后仍须停在命运拍',
        );
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

function stallInPlaceUntilEntrustmentSettled(api, save, { pendingId } = {}) {
  const location = String(save.角色.位置.描述 || '');
  assert.match(location, /鬼王峒/, '停滞须从命运拍现场开始');
  const afterStallTurns = Number(
    (runtimeOf(save).events || []).find(item => item.id === ENTRUSTMENT)?.offscreenResolution?.afterStallTurns,
  );
  assert.equal(afterStallTurns, 2, '命运拍 afterStallTurns 须为生产默认 2');
  const maxAdvances = afterStallTurns + 6;
  for (let turn = 0; turn < maxAdvances; turn += 1) {
    assert.equal(String(save.角色.位置.描述 || ''), location, '停滞期间须保持原地');
    assert.notEqual(runtimeOf(save).flags['event.xieyi_entrustment.done'], true, '阈值前不得完成托付');
    assert.notEqual(runtimeOf(save).flags['character.xie_yi.status'], 'dead', '阈值前不得预写 dead');
    if (pendingId) {
      assert.equal(
        api.getJudgementState(save).pending?.id,
        pendingId,
        '阈值前须保持 rescue pending，settleAbandoned 不得因同场提前清掉',
      );
    }
    save = api.advanceScenarioRuntime(save).saveData;
    if (
      runtimeOf(save).flags['character.xie_yi.status'] === 'dead'
      || runtimeOf(save).flags['event.xieyi_entrustment.done'] === true
    ) {
      return save;
    }
  }
  throw new Error(`stayed on scene ${maxAdvances} advances without default fate; stall=${runtimeOf(save).stallTurns}`);
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
  const beforeFav = xieyiFavorability(save);

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
  assert.equal(xieyiFavorability(after), beforeFav, '重复推进不得改谢艺好感');
  return after;
}

test('B1 生产入口【承接】唯一落成 dead，资源/关系后果经 JSON 重载保持且幂等', async () => {
  const api = await loadProductionApi();
  const stage = await loadStage();
  let save = await walkToEntrustment(api, stage);
  const accept = api.getCurrentStoryEventActions(save).find(item => item.actionId === 'accept_entrustment');
  assert.ok(accept, '生产入口必须枚举【承接】');
  const beforeFav = xieyiFavorability(save);

  const recorded = api.recordStoryEventStructuredAction(save, accept);
  assert.equal(recorded.completed, true);
  const sameTurn = api.recordStoryEventStructuredAction(save, accept);
  assert.equal(sameTurn.reason, 'already_completed', '同一拍重复承接须直接拒绝');
  save = settleChoice(api, save);
  assertDeadFate(save, '承接当场');
  assertXieyiCriticalAffinity(save, beforeFav, '承接当场');

  const reloaded = reloadSave(save);
  assertDeadFate(reloaded, 'JSON 重载');
  assertXieyiCriticalAffinity(reloaded, beforeFav, 'JSON 重载');
  const replay = api.getCurrentStoryEventActions(reloaded);
  assert.equal(replay.some(item => item.eventId === ENTRUSTMENT), false, '重载后不得再给命运二选一');
  await pokeIdempotency(api, reloaded, accept, SURVIVAL_TEXT);
  assertDeadFate(reloaded, '重放后');
  assertXieyiCriticalAffinity(reloaded, beforeFav, '重放后');
});

test('B1 生产入口【救治】success+ 唯一落成 longrest，无骨灰，JSON 重载保持且幂等', async () => {
  const api = await loadProductionApi();
  const stage = await loadStage();
  let save = await walkToEntrustment(api, stage);
  const rescue = api.getCurrentStoryEventActions(save).find(item => item.actionId === 'rescue_xieyi');
  assert.ok(rescue, '乐明珠在场时生产入口必须枚举【救治】');
  const beforeFav = xieyiFavorability(save);

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
  assertXieyiCriticalAffinity(save, beforeFav, '救治当场');

  const reloaded = reloadSave(save);
  assertLongrestFate(reloaded, 'JSON 重载');
  assertXieyiCriticalAffinity(reloaded, beforeFav, 'JSON 重载');
  await pokeIdempotency(api, reloaded, rescue, DEATH_TEXT);
  assertLongrestFate(reloaded, '重放后');
  assertXieyiCriticalAffinity(reloaded, beforeFav, '重放后');
});

test('B1 未知/不可解析位置 fail-closed，不得离场默认 dead；可解析外场后再按离场收束', async () => {
  const api = await loadProductionApi();
  const stage = await loadStage();
  let save = await walkToEntrustment(api, stage);
  const accept = api.getCurrentStoryEventActions(save).find(item => item.actionId === 'accept_entrustment');
  assert.ok(accept, '走到命运拍后须仍有【承接】');
  assert.match(String(save.角色.位置.描述 || ''), /鬼王峒/);
  const beforeFav = xieyiFavorability(save);

  save.角色.位置.描述 = '__unresolvable_location__';
  save = settleChoice(api, save);
  assertNoFateInjected(save, '不可解析位置推进后');
  assert.notEqual(runtimeOf(save).flags['event.xieyi_entrustment.done'], true, '不可解析位置不得完成托付');
  assert.equal(
    (runtimeOf(save).completedEventIds || []).includes(ENTRUSTMENT),
    false,
    '不可解析位置不得把托付写入 completedEventIds',
  );
  // 到达≠完成：解析不出按不在场处理（fail closed），只给回鬼王峒的移动；移回后命运二选一仍在。
  const [back] = api.getCurrentStoryEventActions(save);
  assert.match(back.actionId, /^travel:/, '不可解析位置只给移动');
  const away = structuredClone(save);
  assert.equal(api.recordStoryEventStructuredAction(away, back).completed, false);
  assert.equal(
    api.getCurrentStoryEventActions(away).some(item => item.actionId === 'accept_entrustment'),
    true,
    '移回现场后仍须保留命运二选一',
  );
  assert.equal(xieyiFavorability(save), beforeFav, '不可解析位置不得发谢艺好感');

  save.角色.位置.描述 = '南荒·碧鲮族';
  save = settleChoice(api, save);
  assertDeadFate(save, '可解析外场后离开现场');
  assertXieyiCriticalAffinity(save, beforeFav, '可解析外场后离开现场');

  const reloaded = reloadSave(save);
  assertDeadFate(reloaded, '外场收束后 JSON 重载');
  assertXieyiCriticalAffinity(reloaded, beforeFav, '外场收束后 JSON 重载');
  await pokeIdempotency(api, reloaded, accept, SURVIVAL_TEXT);
});

test('到达≠完成（2026-10-03）不改谢艺托付：在场或走到现场都不自动结清，离开仍按承接（裁定 #90）', async () => {
  const api = await loadProductionApi();
  const stage = await loadStage();
  const save = await walkToEntrustment(api, stage);
  const locations = runtimeOf(save).canon?.locations || [];
  const activatedAt = runtimeOf(save).eventActivatedAtLocation?.[ENTRUSTMENT];
  assert.equal(locations.find(item => item.id === activatedAt)?.name, '鬼王峒', '激活位置须照旧记录');

  const stayed = settleChoice(api, structuredClone(save));
  assert.notEqual(runtimeOf(stayed).flags['event.xieyi_entrustment.done'], true, '留在现场不得结清');
  assert.ok(api.getCurrentStoryEventActions(stayed).some(item => item.actionId === 'accept_entrustment'));

  // 模拟「在别处激活、再走到鬼王峒」：旧 settleArrivalObjective 会在这里自动替玩家选第一项。
  const arrived = structuredClone(save);
  const elsewhere = locations.find(item => item.name === '碧鲮族')?.id;
  assert.ok(elsewhere);
  runtimeOf(arrived).eventActivatedAtLocation[ENTRUSTMENT] = elsewhere;
  const afterArrival = settleChoice(api, arrived);
  assert.notEqual(runtimeOf(afterArrival).flags['event.xieyi_entrustment.done'], true, '走到现场不得自动结清');
  assertNoFateInjected(afterArrival, '走到现场后');

  const left = structuredClone(save);
  left.角色.位置.描述 = '南荒·碧鲮族';
  assertDeadFate(settleChoice(api, left), '离开即接受不变');
});

test('B1 离开命运拍现场按承接收束 dead，且不得被重放切走', async () => {
  const api = await loadProductionApi();
  const stage = await loadStage();
  let save = await walkToEntrustment(api, stage);
  const accept = api.getCurrentStoryEventActions(save).find(item => item.actionId === 'accept_entrustment');
  assert.ok(accept);
  assert.match(String(save.角色.位置.描述 || ''), /鬼王峒/);
  const beforeFav = xieyiFavorability(save);
  const activatedAt = runtimeOf(save).eventActivatedAtLocation?.[ENTRUSTMENT];
  const activatedName = String(
    (runtimeOf(save).canon?.locations || []).find(item => item.id === activatedAt)?.name || '',
  );
  assert.equal(activatedName, '鬼王峒', '命运拍须在鬼王峒记下激活位置');

  save.角色.位置.描述 = '南荒·碧鲮族';
  save = settleChoice(api, save);
  assertDeadFate(save, '离开现场');
  assertXieyiCriticalAffinity(save, beforeFav, '离开现场');

  const reloaded = reloadSave(save);
  assertDeadFate(reloaded, '离开后 JSON 重载');
  assertXieyiCriticalAffinity(reloaded, beforeFav, '离开后 JSON 重载');
  await pokeIdempotency(api, reloaded, accept, SURVIVAL_TEXT);
});

test('B1 挂起 rescue judgement 后离场按死亡收束，清理 pending，旧判定不能改写命运', async () => {
  const api = await loadProductionApi();
  const stage = await loadStage();
  let save = await walkToEntrustment(api, stage);
  const rescue = api.getCurrentStoryEventActions(save).find(item => item.actionId === 'rescue_xieyi');
  const accept = api.getCurrentStoryEventActions(save).find(item => item.actionId === 'accept_entrustment');
  assert.ok(rescue, '乐明珠在场时须枚举【救治】');
  assert.ok(accept, '挂起判定时仍须保留【承接】');
  const beforeFav = xieyiFavorability(save);
  const spiritBefore = Number(save.角色.属性.神识.当前);
  assert.equal(Number.isFinite(spiritBefore), true);

  const issued = api.prepareEventActionJudgement(save, rescue, runtimeOf(save).worldTurn);
  assert.ok(issued.proposal?.id, '须签发 rescue pending judgement');
  assert.equal(api.getJudgementState(save).pending?.id, issued.proposal.id, '离场前须挂起 rescue 判定');
  assertNoFateInjected(save, '签发 pending 后');

  save.角色.位置.描述 = '南荒·碧鲮族';
  save = settleChoice(api, save);
  assertDeadFate(save, '挂起 rescue 后离场');
  assertXieyiCriticalAffinity(save, beforeFav, '挂起 rescue 后离场');
  const judgement = api.getJudgementState(save);
  assert.equal(judgement.pending, undefined, '离场后不得残留 pending judgement');
  const archived = judgement.recent.find(item => item.id === issued.proposal.id);
  assert.ok(archived, '离场须按现有契约归档挂起判定');
  assert.equal(archived.status, 'cancelled', '未兑现的 rescue 判定须归档为 cancelled');
  assert.equal(Number(save.角色.属性.神识.当前), spiritBefore, '未兑现的 rescue 判定不得在离场后扣神识');

  const replayed = api.resolvePendingJudgement(save, issued.proposal.id, {
    currentTurn: runtimeOf(save).worldTurn,
    testOutcome: 'success',
    roll: () => 18,
  });
  assert.equal(replayed.status, 'cancelled', '归档后不得重骰成 success');
  assert.notEqual(replayed.outcome, 'success');
  assertDeadFate(save, '旧 pending resolve 后');
  assert.equal(xieyiFavorability(save), beforeFav + CRITICAL_AFFINITY_GRANT, '旧 pending resolve 后不得重奖好感');

  const recorded = api.recordStoryEventStructuredAction(save, rescue, {
    judgementResolution: {
      ...issued.proposal,
      status: 'resolved',
      roll: 18,
      total: 40,
      outcome: 'success',
      appliedEffects: [],
      resolvedAtTurn: runtimeOf(save).worldTurn,
    },
  });
  assert.ok(
    recorded.reason === 'already_completed'
      || recorded.reason === 'stale_event'
      || recorded.reason === 'stale_judgement'
      || recorded.reason === 'judgement_required',
    `旧 rescue record 须拒绝，实际=${recorded.reason}`,
  );
  assertDeadFate(save, '旧 rescue record 后');
  assert.notEqual(runtimeOf(save).flags['character.xie_yi.status'], 'longrest');
  assert.notEqual(runtimeOf(save).flags['branch.lcq.if_xieyi_longrest.active'], true);

  const reloaded = reloadSave(save);
  assertDeadFate(reloaded, '挂起离场 JSON 重载');
  assert.equal(api.getJudgementState(reloaded).pending, undefined, 'JSON 重载后不得复活 pending');
  await pokeIdempotency(api, reloaded, accept, SURVIVAL_TEXT);
  assertDeadFate(reloaded, '挂起离场重放后');
  assertXieyiCriticalAffinity(reloaded, beforeFav, '挂起离场重放后');
});

test('B1 已掷 rescue success+ 尚未落账时离场仍死亡，旧 result 不能切到 longrest', async () => {
  const api = await loadProductionApi();
  const stage = await loadStage();
  let save = await walkToEntrustment(api, stage);
  const rescue = api.getCurrentStoryEventActions(save).find(item => item.actionId === 'rescue_xieyi');
  const accept = api.getCurrentStoryEventActions(save).find(item => item.actionId === 'accept_entrustment');
  assert.ok(rescue);
  assert.ok(accept);
  const beforeFav = xieyiFavorability(save);

  const issued = api.prepareEventActionJudgement(save, rescue, runtimeOf(save).worldTurn);
  const locked = api.resolvePendingJudgement(save, issued.proposal.id, {
    currentTurn: runtimeOf(save).worldTurn,
    testOutcome: 'success',
    roll: () => 18,
  });
  assert.equal(locked.status, 'resolved');
  assert.equal(locked.outcome, 'success');
  assert.equal(api.getJudgementState(save).pending, undefined, '已掷后 pending 应已归档');
  assertNoFateInjected(save, '已掷尚未落账');

  save.角色.位置.描述 = '南荒·碧鲮族';
  save = settleChoice(api, save);
  assertDeadFate(save, '已掷 success+ 后离场');
  assertXieyiCriticalAffinity(save, beforeFav, '已掷 success+ 后离场');
  assert.equal(api.getJudgementState(save).pending, undefined);

  const again = api.resolvePendingJudgement(save, issued.proposal.id, {
    currentTurn: runtimeOf(save).worldTurn,
    testOutcome: 'failure',
    roll: () => 1,
  });
  assert.equal(again.outcome, 'success', '已掷结果锁定不可重骰');
  const recorded = api.recordStoryEventStructuredAction(save, rescue, { judgementResolution: locked });
  assert.ok(
    recorded.reason === 'already_completed' || recorded.reason === 'stale_event',
    `已落成死亡后旧 success+ 不得再记账，实际=${recorded.reason}`,
  );
  assertDeadFate(save, '旧 success+ record 后');
  assert.notEqual(runtimeOf(save).flags['event.s06_03.void'], true);
  assert.notEqual(runtimeOf(save).flags['character.xie_yi.status'], 'longrest');
  assert.equal(xieyiFavorability(save), beforeFav + CRITICAL_AFFINITY_GRANT);

  const reloaded = reloadSave(save);
  assertDeadFate(reloaded, '已掷离场 JSON 重载');
  await pokeIdempotency(api, reloaded, accept, SURVIVAL_TEXT);
  assertXieyiCriticalAffinity(reloaded, beforeFav, '已掷离场重放后');
});

test('B1 现场签发 rescue pending 后原地停滞到 afterStallTurns，默认死亡须归档 pending 并解除全局判定软锁', async () => {
  const api = await loadProductionApi();
  const stage = await loadStage();
  let save = await walkToEntrustment(api, stage);
  const rescue = api.getCurrentStoryEventActions(save).find(item => item.actionId === 'rescue_xieyi');
  const accept = api.getCurrentStoryEventActions(save).find(item => item.actionId === 'accept_entrustment');
  assert.ok(rescue, '乐明珠在场时须枚举【救治】');
  assert.ok(accept, '签发 pending 时仍须保留【承接】');
  assert.match(String(save.角色.位置.描述 || ''), /鬼王峒/);
  const beforeFav = xieyiFavorability(save);
  const spiritBefore = Number(save.角色.属性.神识.当前);
  const hpBefore = Number(save.角色.属性.气血.当前);
  assert.equal(Number.isFinite(spiritBefore), true);
  assert.equal(Number.isFinite(hpBefore), true);

  const issued = api.prepareEventActionJudgement(save, rescue, runtimeOf(save).worldTurn);
  assert.ok(issued.proposal?.id, '须签发 rescue pending judgement');
  assert.equal(api.getJudgementState(save).pending?.id, issued.proposal.id);
  assertNoFateInjected(save, '签发 pending 后');

  save = stallInPlaceUntilEntrustmentSettled(api, save, { pendingId: issued.proposal.id });
  save = api.advanceScenarioRuntime(save).saveData;
  assert.match(String(save.角色.位置.描述 || ''), /鬼王峒/, '默认收束后仍须在命运拍现场');
  assertDeadFate(save, '原地停滞默认收束');
  assertXieyiCriticalAffinity(save, beforeFav, '原地停滞默认收束');
  assert.equal(
    (runtimeOf(save).completedEventIds || []).includes(ENTRUSTMENT),
    true,
    '托付须写入 completedEventIds',
  );
  assert.equal(Number(save.角色.属性.神识.当前), spiritBefore, '未兑现 rescue 不得扣神识');
  assert.equal(Number(save.角色.属性.气血.当前), hpBefore, '未兑现 rescue 不得扣气血');

  const judgement = api.getJudgementState(save);
  assert.equal(judgement.pending, undefined, '原地停滞默认死亡后不得残留 pending');
  const archived = judgement.recent.find(item => item.id === issued.proposal.id);
  assert.ok(archived, '须按现有契约归档未兑现 rescue');
  assert.equal(archived.status, 'cancelled', '未兑现 rescue 须归档为 cancelled，不能把显式 cancel 映射成死亡');
  assert.equal(archived.roll, undefined);
  assert.deepEqual(archived.appliedEffects, []);

  const unrelated = api.createJudgementProposal({
    actionText: '翻越有守卫的城墙',
    kind: 'stealth',
    whyNow: '守卫巡逻存在暴露风险',
    difficulty: { band: 'hard', value: 20 },
    factors: [{ label: '夜色掩护', value: 3, source: 'condition' }],
    stakes: { success: '悄然通过', partial: '留下痕迹但进入内城', failure: '被守卫察觉' },
    canonPolicy: 'free',
    createdAtTurn: runtimeOf(save).worldTurn,
  });
  const persisted = api.persistPendingJudgement(save, unrelated);
  assert.equal(persisted.id, unrelated.id);
  assert.notEqual(persisted.id, issued.proposal.id, '新 pending 不得复用已归档 rescue id');
  assert.equal(api.getJudgementState(save).pending?.id, persisted.id, '归档后须能签发无关判定');
  const cleaned = api.cancelPendingJudgement(save, persisted.id, runtimeOf(save).worldTurn);
  assert.equal(cleaned.status, 'cancelled');
  assert.equal(api.getJudgementState(save).pending, undefined, '测试结束须按契约取消清理无关 pending');

  const reloaded = reloadSave(save);
  assertDeadFate(reloaded, '原地停滞 JSON 重载');
  assertXieyiCriticalAffinity(reloaded, beforeFav, '原地停滞 JSON 重载');
  assert.equal(api.getJudgementState(reloaded).pending, undefined, 'JSON 重载后不得复活 pending');
  await pokeIdempotency(api, reloaded, accept, SURVIVAL_TEXT);
  assertDeadFate(reloaded, '原地停滞重放后');
  assertXieyiCriticalAffinity(reloaded, beforeFav, '原地停滞重放后');
  assert.equal(xieyiFavorability(reloaded), beforeFav + CRITICAL_AFFINITY_GRANT);
  assert.equal(Number(reloaded.角色.属性.神识.当前), spiritBefore);
  assert.equal(Number(reloaded.角色.属性.气血.当前), hpBefore);
});


// ── 第106章「支不支援谢艺」（裁定 #168）：支援只给救治判定一个公开 +2，生死仍按 #163 映射结算。
const SUPPORT = 'support_xieyi_counterstrike';
const NO_SUPPORT = 'rest_then_follow_team';
const factorSum = proposal => proposal.factors.reduce((sum, factor) => sum + factor.value, 0);
const supportFactors = proposal => proposal.factors.filter(factor => factor.label === '此前支援');
// 幸运点取 Math.random；签发时固定随机数，使两条路线的基础因子可比（只影响测试，不改产品逻辑）。
function prepareWithFixedLuck(api, save, rescue) {
  const original = Math.random;
  Math.random = () => 0.5;
  try { return api.prepareEventActionJudgement(save, rescue, runtimeOf(save).worldTurn); } finally { Math.random = original; }
}

async function rescueWithRoll(choice, roll) {
  const api = await loadProductionApi();
  let save = await walkToEntrustment(api, await loadStage(), choice);
  const rescue = api.getCurrentStoryEventActions(save).find(item => item.actionId === 'rescue_xieyi');
  assert.ok(rescue, '乐明珠在场时仍须枚举【救治】（支援不替代医者）');
  const issued = prepareWithFixedLuck(api, save, rescue);
  const resolution = api.resolvePendingJudgement(save, issued.proposal.id, { currentTurn: runtimeOf(save).worldTurn, roll: () => roll });
  const recorded = api.recordStoryEventStructuredAction(save, rescue, { judgementResolution: resolution });
  assert.equal(recorded.completed, true);
  save = settleChoice(api, save);
  return { api, save, proposal: issued.proposal, resolution };
}

async function baseFactorSum() {
  const api = await loadProductionApi();
  const save = await walkToEntrustment(api, await loadStage(), NO_SUPPORT);
  const rescue = api.getCurrentStoryEventActions(save).find(item => item.actionId === 'rescue_xieyi');
  return factorSum(prepareWithFixedLuck(api, save, rescue).proposal);
}

test('第106章锁：临时协定先完成准备步，再二选一【支援】/【不主动支援】，两者都完成本拍', async () => {
  const api = await loadProductionApi();
  const branch = await loadTs('../src/modules/scenarioMods/branchDecision.ts');
  let save = await productionSave(api, await loadStage());
  for (let turn = 0; turn < 40; turn += 1) {
    const actions = api.getCurrentStoryEventActions(save);
    if (actions.some(item => item.actionId === SUPPORT)) break;
    save = playAvailableAction(api, save);
    runtimeOf(save).worldTurn = (Number(runtimeOf(save).worldTurn) || 0) + 1;
  }
  const decision = branch.detectBranchDecision(api.getCurrentStoryEventActions(save));
  assert.deepEqual(decision?.labels, ['协助谢艺准备反杀，随队返回', '不主动支援，先休整，随队同行']);
  for (const choice of [SUPPORT, NO_SUPPORT]) {
    const fork = reloadSave(save);
    const option = api.getCurrentStoryEventActions(fork).find(item => item.actionId === choice);
    api.recordStoryEventStructuredAction(fork, option);
    const after = api.advanceScenarioRuntime(fork).saveData;
    assert.ok(runtimeOf(after).completedEventIds.includes('lcq.event.s05b_09_temporary_pact_with_xiaozi'), choice);
    assertNoFateInjected(after, `${choice} 不提前决定谢艺命运`);
  }
});

test('支援／不支援 × 救治成功／死亡：+2 公开计入一次，生死仍按 #163 映射', async () => {
  const base = await baseFactorSum();
  const pivot = 25 - base - 2; // 支援时总值恰为 25（success），不支援时为 23（partial→死亡）
  assert.ok(pivot >= 1 && pivot <= 20, `基础因子和 ${base} 使 +2 无法成为胜负手，请调整夹具`);

  const supportWins = await rescueWithRoll(SUPPORT, pivot);
  assert.deepEqual(supportFactors(supportWins.proposal).map(factor => factor.value), [2], '支援：判定前公开「此前支援 +2」');
  assert.equal(factorSum(supportWins.proposal), base + 2);
  assert.equal(supportWins.resolution.outcome, 'success');
  assertLongrestFate(supportWins.save, '支援→救治成功');

  const supportDies = await rescueWithRoll(SUPPORT, 1);
  assert.equal(supportFactors(supportDies.proposal).length, 1);
  assert.ok(supportDies.resolution.total < 25, '支援不保证救活');
  assertDeadFate(supportDies.save, '支援→死亡');

  const noSupportWins = await rescueWithRoll(NO_SUPPORT, 20);
  assert.equal(supportFactors(noSupportWins.proposal).length, 0, '不支援：原公式，无加成');
  assert.ok(noSupportWins.resolution.total >= 25, `基础因子和 ${base} + 20 应能成功`);
  assertLongrestFate(noSupportWins.save, '不支援→救治成功');

  const noSupportDies = await rescueWithRoll(NO_SUPPORT, pivot);
  assert.equal(supportFactors(noSupportDies.proposal).length, 0);
  assert.equal(noSupportDies.resolution.outcome, 'partial', '同一骰点下缺这 +2 即不足 25');
  assertDeadFate(noSupportDies.save, '不支援→死亡');
});

test('支援加成只计一次：撤回重开、JSON 读档、重试都不叠加；已掷后不可补加', async () => {
  const api = await loadProductionApi();
  let save = await walkToEntrustment(api, await loadStage(), SUPPORT);
  const rescue = api.getCurrentStoryEventActions(save).find(item => item.actionId === 'rescue_xieyi');
  const first = api.prepareEventActionJudgement(save, rescue, runtimeOf(save).worldTurn);
  assert.equal(supportFactors(first.proposal).length, 1);
  api.cancelPendingJudgement(save, first.proposal.id, runtimeOf(save).worldTurn);
  save = reloadSave(save);
  const reissued = api.prepareEventActionJudgement(save, rescue, runtimeOf(save).worldTurn);
  assert.deepEqual(supportFactors(reissued.proposal).map(factor => factor.value), [2], '撤回重开、读档后仍只有一个 +2');
  const locked = api.resolvePendingJudgement(save, reissued.proposal.id, { currentTurn: runtimeOf(save).worldTurn, roll: () => 10 });
  save = reloadSave(save);
  const replay = api.resolvePendingJudgement(save, reissued.proposal.id, { currentTurn: runtimeOf(save).worldTurn, roll: () => 20 });
  assert.equal(replay.total, locked.total, '已掷结果锁定，重试不重骰也不补加');
  // 已掷后再补一次"支援"回执也不改变已锁定的结果。
  const states = runtimeOf(save).eventActionStates['lcq.event.s05b_09_temporary_pact_with_xiaozi'];
  states.attempts.push({ ...states.attempts.find(item => item.actionId === SUPPORT) });
  const afterExtra = api.resolvePendingJudgement(save, reissued.proposal.id, { currentTurn: runtimeOf(save).worldTurn, roll: () => 20 });
  assert.equal(afterExtra.total, locked.total);
});


test('B1 托付在好感100时只登记共历回执，不突破全局上限', async () => {
  const api = await loadProductionApi();
  let save = await walkToEntrustment(api, await loadStage());
  seedExistingXieyiRelation(save, 100);
  const accept = api.getCurrentStoryEventActions(save).find(item => item.actionId === 'accept_entrustment');
  assert.ok(accept);
  assert.equal(api.recordStoryEventStructuredAction(save, accept).completed, true);
  save = settleChoice(api, save);
  assert.equal(xieyiFavorability(save), 100);
  assert.ok(runtimeOf(save).affinityGrantedEventIds.includes(ENTRUSTMENT));
  assert.equal(xieyiFavorability(settleChoice(api, reloadSave(save))), 100);
});
