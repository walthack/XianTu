import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';

import { createPinia, setActivePinia } from 'pinia';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: {
    '@': fileURLToPath(new URL('../src', import.meta.url)),
    '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
    '@/services/eventReconcileService': fileURLToPath(new URL('./stubs/eventReconcileServiceForAbortTest.ts', import.meta.url)),
  },
});

async function loadTs(relativePath) {
  return jiti.import(new URL(relativePath, import.meta.url).pathname);
}

function resetCharacterStoreAbortCalls() {
  const bag = globalThis;
  if (Array.isArray(bag.__xiantuAbortCharacterStoreCalls)) bag.__xiantuAbortCharacterStoreCalls.length = 0;
}

function characterStoreAbortCalls() {
  const calls = globalThis.__xiantuAbortCharacterStoreCalls;
  return Array.isArray(calls) ? [...calls] : [];
}

function resetEventReconcileAbortCalls() {
  const bag = globalThis.__xiantuAbortEventReconcile;
  if (!bag) return;
  bag.calls = [];
  bag.finished = [];
  bag.delayMs = 40;
}

function eventReconcileAbortCalls() {
  const bag = globalThis.__xiantuAbortEventReconcile;
  return Array.isArray(bag?.calls) ? [...bag.calls] : [];
}

function eventReconcileAbortFinished() {
  const bag = globalThis.__xiantuAbortEventReconcile;
  return Array.isArray(bag?.finished) ? [...bag.finished] : [];
}

function stage02Runtime() {
  return {
    modId: 'lcq.stage_02',
    stallTurns: 10,
    worldTurn: 10,
    currentChapterId: 'lcq.chapter.s02',
    chapters: [{ id: 'lcq.chapter.s02', eventIds: ['lcq.event.s02_04'] }],
    events: [{
      id: 'lcq.event.s02_04',
      name: '五原落奴',
      description: '点心铺里有人从两面逼近。',
      objective: '先保住性命并看清他们把人往哪里带',
      critical: true,
      completion: [{ path: 'flags.event.s02_04.done', operator: 'eq', value: true }],
    }],
    completedChapterIds: [],
    activeEventIds: ['lcq.event.s02_04'],
    completedEventIds: ['lcq.event.s02_02', 'lcq.event.s02_03'],
    flags: { 'event.s02_02.done': true, 'event.s02_03.done': true, 'event.s02_04.done': false },
    divergences: [],
  };
}

function refreshSnapshots(ctx) {
  ctx.store.loadFromSaveData(ctx.original);
  ctx.originalPrint = fingerprint(ctx.original);
  ctx.liveBefore = ctx.store.toSaveData();
  ctx.liveBeforePrint = fingerprint(ctx.liveBefore);
}

if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (!globalThis.window.location) {
  globalThis.window.location = { hostname: 'localhost', href: 'http://localhost/' };
}

function fingerprint(value) {
  return JSON.stringify(value);
}

function gameplaySlice(save) {
  return {
    声望: save?.角色?.属性?.声望,
    位置: save?.角色?.位置?.描述,
    叙事: (save?.系统?.历史?.叙事 || []).map(entry => entry?.content),
    短期: save?.社交?.记忆?.短期记忆 || [],
    隐式中期: save?.社交?.记忆?.隐式中期记忆 || [],
    背包物品: save?.角色?.背包?.物品 || {},
  };
}

function stableStoreSnapshot(save) {
  if (!save) return save;
  const copy = JSON.parse(JSON.stringify(save));
  if (copy.元数据) delete copy.元数据.更新时间;
  for (const entry of copy.系统?.历史?.叙事 || []) {
    if (entry?.stateChanges?.timestamp) delete entry.stateChanges.timestamp;
  }
  return copy;
}

function abortAfter(allowCalls) {
  let calls = 0;
  const shouldAbort = () => {
    const current = calls;
    calls += 1;
    return current >= allowCalls;
  };
  return {
    shouldAbort,
    calls: () => calls,
  };
}

function twoSetCommands() {
  return [
    { action: 'set', key: '角色.属性.声望', value: 7 },
    { action: 'set', key: '角色.位置.描述', value: '白湖商馆内院' },
  ];
}

function gmResponse(commands) {
  return {
    text: '你走进白湖商馆，把那块玉佩揣进怀里。',
    mid_term_memory: '白湖商馆里暂时安静。',
    tavern_commands: commands,
    action_options: [],
  };
}

async function setup() {
  setActivePinia(createPinia());
  resetCharacterStoreAbortCalls();
  resetEventReconcileAbortCalls();
  const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
  const { AIBidirectionalSystem } = await loadTs('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await loadTs('../src/stores/gameStateStore.ts');
  const original = createMinimalSaveDataV3();
  original.角色.属性.声望 = 0;
  original.角色.位置.描述 = '五原露天市集';
  const store = useGameStateStore();
  store.loadFromSaveData(original);
  const liveBefore = store.toSaveData();
  return {
    AIBidirectionalSystem,
    original,
    originalPrint: fingerprint(original),
    liveBefore,
    liveBeforePrint: fingerprint(liveBefore),
    store,
  };
}

function assertZeroCommit({ original, originalPrint, liveBefore, returned, store, stateChanges, label }) {
  assert.equal(
    fingerprint(original),
    originalPrint,
    `${label}: 输入原档被就地改写`,
  );
  assert.deepEqual(
    gameplaySlice(returned),
    gameplaySlice(original),
    `${label}: 返回档相对原档有半次提交`,
  );
  const live = store.toSaveData();
  if (live) {
    assert.deepEqual(
      gameplaySlice(live),
      gameplaySlice(liveBefore),
      `${label}: gameStateStore 已吃进未提交的 clone`,
    );
    assert.deepEqual(
      stableStoreSnapshot(live),
      stableStoreSnapshot(liveBefore),
      `${label}: 真实 store 快照相对 abort 前不一致`,
    );
  }
  assert.deepEqual(
    characterStoreAbortCalls(),
    [],
    `${label}: abort 路径调用了 saveCurrentGame`,
  );
  const keys = (stateChanges?.changes || []).map(change => String(change.key || ''));
  assert.equal(
    keys.some(key => /eventActionStates|opportunityStates|openWorldSlice|背包|inventory/i.test(key)),
    false,
    `${label}: stateChanges 含事件/机会/移动/背包回执 ${keys.join(',')}`,
  );
}

test('P0-1 取消发生在本地结算前：原档零提交', async () => {
  const ctx = await setup();
  const abort = abortAfter(0);
  const { saveData, stateChanges, abortReason } = await ctx.AIBidirectionalSystem.processGmResponse(
    gmResponse(twoSetCommands()),
    ctx.original,
    false,
    abort.shouldAbort,
    { userAction: '走进白湖商馆' },
  );
  assert.equal(abortReason, 'skip command processing');
  assertZeroCommit({
    ...ctx,
    returned: saveData,
    stateChanges,
    label: '结算前 abort',
  });
  assert.ok(abort.calls() >= 1);
});

test('P0-1 取消发生在本地结算后、命令前：整次响应必须零提交', async () => {
  const ctx = await setup();
  const abort = abortAfter(1);
  const { saveData, stateChanges, abortReason } = await ctx.AIBidirectionalSystem.processGmResponse(
    gmResponse(twoSetCommands()),
    ctx.original,
    false,
    abort.shouldAbort,
    { userAction: '走进白湖商馆' },
  );
  assert.equal(abortReason, 'discard clone after local settlement');
  assertZeroCommit({
    ...ctx,
    returned: saveData,
    stateChanges,
    label: '结算后 abort',
  });
});

test('P0-1 取消发生在第一条命令后：不得留下半条命令或叙事补账', async () => {
  const ctx = await setup();
  const abort = abortAfter(3);
  const { saveData, stateChanges, abortReason } = await ctx.AIBidirectionalSystem.processGmResponse(
    gmResponse(twoSetCommands()),
    ctx.original,
    false,
    abort.shouldAbort,
    { userAction: '走进白湖商馆' },
  );
  assert.equal(abortReason, 'discard clone after partial command execution');
  assertZeroCommit({
    ...ctx,
    returned: saveData,
    stateChanges,
    label: '首条命令后 abort',
  });
  assert.notEqual(saveData.角色?.属性?.声望, 7, '声望不应被半次命令写活');
  assert.notEqual(saveData.角色?.位置?.描述, '白湖商馆内院', '位置不应被第二条或补账写活');
});

test('P0-1 取消发生在命令循环之后：空命令必须打到 post-loop 闸', async () => {
  const ctx = await setup();
  // 空命令：call0 入口、call1 结算后、call2 循环后 reconcile。abortAfter(1) 会误打结算后。
  const abort = abortAfter(2);
  const { saveData, stateChanges, abortReason } = await ctx.AIBidirectionalSystem.processGmResponse(
    gmResponse([]),
    ctx.original,
    false,
    abort.shouldAbort,
    { userAction: '查看任务' },
  );
  assert.equal(abortReason, 'discard clone before post-command reconcile');
  assertZeroCommit({
    ...ctx,
    returned: saveData,
    stateChanges,
    label: '命令后段 abort',
  });
});

test('P0-1 取消发生在辅助等待之后：必须打到 store 写入前的闸', async () => {
  const ctx = await setup();
  const abort = abortAfter(3);
  const { saveData, stateChanges, abortReason } = await ctx.AIBidirectionalSystem.processGmResponse(
    gmResponse([]),
    ctx.original,
    false,
    abort.shouldAbort,
    { userAction: '查看任务' },
  );
  assert.equal(abortReason, 'discard clone after auxiliary wait');
  assertZeroCommit({
    ...ctx,
    returned: saveData,
    stateChanges,
    label: '辅助等待后 abort',
  });
});

test('P0-1 取消发生在 store 写入之后：必须把真实 store 快照滚回 abort 前', async () => {
  const ctx = await setup();
  // 1 条命令：入口、结算后、循环内、循环后、辅助等待后、写入前，第 7 次才是写入后回滚。
  const abort = abortAfter(6);
  const { saveData, stateChanges, abortReason } = await ctx.AIBidirectionalSystem.processGmResponse(
    gmResponse([{ action: 'set', key: '角色.属性.声望', value: 7 }]),
    ctx.original,
    false,
    abort.shouldAbort,
    { userAction: '走进白湖商馆' },
  );
  assert.equal(abortReason, 'restore store after late abort');
  assertZeroCommit({
    ...ctx,
    returned: saveData,
    stateChanges,
    label: 'store 写入后 abort',
  });
});

test('P0-1 正常路径仍提交正文与命令，不能被 abort 闸误伤', async () => {
  const ctx = await setup();
  const { saveData } = await ctx.AIBidirectionalSystem.processGmResponse(
    gmResponse([{ action: 'set', key: '角色.属性.声望', value: 3 }]),
    ctx.original,
    false,
    () => false,
    { userAction: '走进白湖商馆' },
  );
  assert.equal(saveData.角色.属性.声望, 3);
  assert.notEqual(fingerprint(saveData), ctx.originalPrint);
  assert.equal(fingerprint(ctx.original), ctx.originalPrint);
  const live = ctx.store.toSaveData();
  assert.equal(live?.角色?.属性?.声望, 3);
  assert.notDeepEqual(gameplaySlice(live), gameplaySlice(ctx.liveBefore));
});

test('P0-1 外层只认 aborted 标志，成功返回后不再用 shouldAbort 拆已提交事务', async () => {
  const source = await readFile(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url), 'utf8');
  assert.match(source, /const \{ saveData: updatedSaveData, stateChanges, aborted \} = await this\.processGmResponse/);
  assert.match(source, /if \(aborted\) \{/);
  assert.match(source, /processGmResponse aborted, skip transaction commit/);
  assert.doesNotMatch(
    source,
    /if \(shouldAbort\(\)\) \{\s*console\.log\('\[AI System\] Abort detected after processGmResponse/,
  );
});

test('P0-1 取消发生在 store 写入前：必须打到 discard clone before store write', async () => {
  const ctx = await setup();
  // 1 条命令：入口、结算后、循环内、循环后、辅助等待后，第 6 次是写入前。
  const abort = abortAfter(5);
  const { saveData, stateChanges, abortReason } = await ctx.AIBidirectionalSystem.processGmResponse(
    gmResponse([{ action: 'set', key: '角色.属性.声望', value: 7 }]),
    ctx.original,
    false,
    abort.shouldAbort,
    { userAction: '走进白湖商馆' },
  );
  assert.equal(abortReason, 'discard clone before store write');
  assertZeroCommit({
    ...ctx,
    returned: saveData,
    stateChanges,
    label: 'store 写入前 abort',
  });
});

test('P0-1 取消后真实 openWorldAction 回执必须整批丢弃', async () => {
  const ctx = await setup();
  ctx.original.世界.状态.剧本模组 = stage02Runtime();
  const { ensureWuyuanOpenWorldSlice, getWuyuanOpenWorldSelections } = await loadTs(
    '../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts',
  );
  ensureWuyuanOpenWorldSlice(ctx.original);
  const travel = getWuyuanOpenWorldSelections(ctx.original).find(item => item.kind === 'travel');
  refreshSnapshots(ctx);
  assert.ok(travel, '五原市集应有一条显式 travel 选择');
  const abort = abortAfter(1);
  const { saveData, stateChanges, abortReason } = await ctx.AIBidirectionalSystem.processGmResponse(
    gmResponse([]),
    ctx.original,
    false,
    abort.shouldAbort,
    { userAction: travel.actionText, openWorldAction: travel },
  );
  assert.equal(abortReason, 'discard clone after local settlement');
  assertZeroCommit({
    ...ctx,
    returned: saveData,
    stateChanges,
    label: 'openWorldAction abort',
  });
  assert.notEqual(
    ctx.liveBefore?.角色?.位置?.描述,
    '中州·五原·点心铺',
    '基线不应已经走到点心铺',
  );
  assert.notEqual(saveData?.角色?.位置?.描述, '中州·五原·点心铺');
  assert.notEqual(ctx.store.toSaveData()?.角色?.位置?.描述, '中州·五原·点心铺');
  assert.equal(
    ctx.store.toSaveData()?.世界?.状态?.剧本模组?.openWorldSlice?.currentZoneId,
    ctx.liveBefore?.世界?.状态?.剧本模组?.openWorldSlice?.currentZoneId,
  );
});

test('P0-1 abort 返回后后台 event_reconcile 不得写 live store 或 saveCurrentGame', async () => {
  const ctx = await setup();
  ctx.original.世界.状态.剧本模组 = stage02Runtime();
  refreshSnapshots(ctx);
  const { useCharacterStore } = await loadTs('./stubs/characterStoreForAbortTest.ts');
  const { useAPIManagementStore } = await loadTs('../src/stores/apiManagementStore.ts');
  useCharacterStore().rootState.当前激活存档 = { 角色ID: 'char-abort-p01b', 存档槽位: '存档1' };
  useAPIManagementStore().setFunctionEnabled('event_reconcile', true);
  const delayMs = globalThis.__xiantuAbortEventReconcile?.delayMs || 40;
  const abort = abortAfter(3);
  const { saveData, stateChanges, abortReason } = await ctx.AIBidirectionalSystem.processGmResponse(
    gmResponse([]),
    ctx.original,
    false,
    abort.shouldAbort,
    { userAction: '查看任务' },
  );
  assert.equal(abortReason, 'discard clone after auxiliary wait');
  assertZeroCommit({
    ...ctx,
    returned: saveData,
    stateChanges,
    label: '后台对账启动窗口 abort',
  });
  await new Promise(resolve => setTimeout(resolve, delayMs + 80));
  assert.deepEqual(
    eventReconcileAbortCalls(),
    [],
    'abort 路径不应启动后台 event_reconcile',
  );
  assert.deepEqual(eventReconcileAbortFinished(), []);
  assertZeroCommit({
    ...ctx,
    returned: saveData,
    stateChanges,
    label: '后台对账结束后',
  });
  const live = ctx.store.toSaveData();
  assert.equal(live?.世界?.状态?.剧本模组?.flags?.['event.s02_04.done'], false);
  assert.deepEqual(live?.世界?.状态?.剧本模组?.divergences || [], []);
  assert.deepEqual(characterStoreAbortCalls(), []);
});

test('P0-1 正常提交后才启动后台 event_reconcile', async () => {
  const ctx = await setup();
  ctx.original.世界.状态.剧本模组 = stage02Runtime();
  refreshSnapshots(ctx);
  const { useCharacterStore } = await loadTs('./stubs/characterStoreForAbortTest.ts');
  const { useAPIManagementStore } = await loadTs('../src/stores/apiManagementStore.ts');
  useCharacterStore().rootState.当前激活存档 = { 角色ID: 'char-abort-p01b', 存档槽位: '存档1' };
  useAPIManagementStore().setFunctionEnabled('event_reconcile', true);
  const delayMs = globalThis.__xiantuAbortEventReconcile?.delayMs || 40;
  const { abortReason } = await ctx.AIBidirectionalSystem.processGmResponse(
    gmResponse([{ action: 'set', key: '角色.属性.声望', value: 3 }]),
    ctx.original,
    false,
    () => false,
    { userAction: '查看任务' },
  );
  assert.equal(abortReason, undefined);
  assert.equal(eventReconcileAbortFinished().length, 0, '提交返回时后台对账不得已经写完');
  await new Promise(resolve => setTimeout(resolve, delayMs + 80));
  assert.equal(eventReconcileAbortCalls().length, 1);
  assert.equal(eventReconcileAbortFinished().length, 1);
  assert.equal(ctx.store.toSaveData()?.世界?.状态?.剧本模组?.flags?.['event.s02_04.done'], true);
  assert.equal(
    (ctx.store.toSaveData()?.世界?.状态?.剧本模组?.divergences || []).some(item => item?.id === 'abort-test-divergence'),
    true,
  );
  assert.equal(characterStoreAbortCalls().some(item => item.fn === 'saveCurrentGame'), true);
});
