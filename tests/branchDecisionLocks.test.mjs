// 固定选项锁（2026-11-03 用户指令）：南荒之约、谢艺托付加锁；锁表每个选项 id 都必须是对应拍里真实存在的动作或致命选项（内置与 overlay 都查）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';

const B = await loadTs('../src/modules/scenarioMods/branchDecision.ts');
const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const rt = s => s.世界.状态.剧本模组;
const readJson = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const BUILTINS = 'src/modules/scenarioMods/builtins/data';
const OVERLAYS = 'mod-kit/canon-authority-overlays';

const optionIdsOf = event => [
  ...(event.playerCompletionContract?.actions || []).map(action => action.id),
  ...(event.fatalOutcomes?.choices || []).map(choice => choice.id),
];
// overlay 只看 op 的 to（生效值；from 是漂移校验用的旧值，如 stage_07 的 from 里有一份不带测试选项的旧殇侯拍），递归收集同 id 的事件对象。
function eventsIn(node, eventId, found = []) {
  if (Array.isArray(node)) node.forEach(item => eventsIn(item, eventId, found));
  else if (node && typeof node === 'object') {
    if (node.id === eventId && (node.playerCompletionContract || node.fatalOutcomes)) found.push(node);
    Object.values(node).forEach(value => eventsIn(value, eventId, found));
  }
  return found;
}
async function jsonDir(dir) {
  const names = (await readdir(new URL(`../${dir}/`, import.meta.url))).filter(name => name.endsWith('.json') && name !== 'manifest.json');
  return Promise.all(names.map(async name => ({ name, doc: await readJson(`${dir}/${name}`) })));
}

test('全表校验：锁表每个选项 id 都在对应拍（内置与 overlay）的动作或致命选项里', async () => {
  const builtins = await jsonDir(BUILTINS);
  const overlays = await jsonDir(OVERLAYS);
  for (const [eventId, entries] of Object.entries(B.LOCKED_DECISIONS)) {
    const builtinEvents = builtins.flatMap(({ name, doc }) => (doc.scenario?.events || []).filter(event => event.id === eventId).map(event => ({ name, event })));
    assert.equal(builtinEvents.length, 1, `${eventId} 内置里恰有一处`);
    const overlayEvents = overlays.flatMap(({ name, doc }) => eventsIn(doc.ops.map(op => op.to), eventId).map(event => ({ name, event })));
    for (const { name, event } of [...builtinEvents, ...overlayEvents]) {
      const ids = optionIdsOf(event);
      for (const [actionId] of entries) assert.ok(ids.includes(actionId), `${name} ${eventId} 缺选项 ${actionId}（现有 ${ids.join(',')}）`);
    }
  }
});

test('殇侯锁：用拍里实际存在的选项 id 能触发', async () => {
  const stage = await readJson(`${BUILTINS}/lcq.stage_05b.json`);
  const overlay = await readJson(`${OVERLAYS}/lcq.stage_05b.json`);
  for (const event of [stage.scenario.events.find(e => e.id === 'lcq.event.shanghou_revealed'), ...eventsIn(overlay.ops.map(op => op.to), 'lcq.event.shanghou_revealed')]) {
    const options = optionIdsOf(event).map(actionId => ({ source: 'event_engine', eventId: event.id, actionId, label: actionId }));
    const decision = B.detectBranchDecision(options);
    assert.deepEqual(decision?.options.map(option => option.actionId), ['refuse_shanghou_relic_test', 'touch_shanghou_relic']);
    assert.equal(B.branchDecisionLocksInput(decision), true);
  }
});

async function opened(id) {
  const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
  const { buildStrictScenarioInitialization, applyStrictScenarioInitializationToSave } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const mod = await readJson(`${BUILTINS}/${id}.json`);
  return R.advanceScenarioRuntime(applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), buildStrictScenarioInitialization(mod))).saveData;
}
async function focus(save, id) {
  const { getCanonRailProfile } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  for (const eventId of getCanonRailProfile(rt(save)).orderedEventIds) {
    if (eventId === id) break;
    rt(save).flags[rt(save).events.find(e => e.id === eventId).completion[0].path.slice(6)] = true;
    save = R.advanceScenarioRuntime(save).saveData;
  }
  assert.ok(rt(save).activeEventIds.includes(id), id);
  return save;
}
// 到达≠完成：人不在本拍地点时只给罗盘移动，先移动到场。
function arrive(save) {
  const travel = R.getCurrentStoryEventActions(save).find(a => a.actionId.startsWith('travel:'));
  if (travel) R.recordStoryEventStructuredAction(save, travel);
  return save;
}
function act(save, actionId) {
  arrive(save);
  const selection = R.getCurrentStoryEventActions(save).find(a => a.actionId === actionId);
  assert.ok(selection, `missing action ${actionId}`);
  rt(save).worldTurn++;
  const result = R.recordStoryEventStructuredAction(save, selection);
  assert.equal(result.attempted, true, result.reason);
  return R.advanceScenarioRuntime(save).saveData;
}
const ofEvent = (save, eventId) => R.getCurrentStoryEventActions(save).filter(option => option.eventId === eventId);

test('南荒之约锁：谈期限那步不锁、致命选项休眠；订约那步锁成「订约／拒绝期限」并关闭自由输入', async () => {
  const eventId = 'lcq.event.sudaji_south_pact';
  let save = arrive(await focus(await opened('lcq.stage_02'), eventId));
  const early = ofEvent(save, eventId);
  assert.equal(B.detectBranchDecision(early), null);
  assert.equal(B.isDormantLockedOption(early.find(option => option.actionId === 'refuse_term_take_paolao')), true);
  assert.equal(B.isDormantLockedOption(early.find(option => option.actionId === 'offer_nylon_clue_for_term')), false);
  save = act(save, 'offer_nylon_clue_for_term');
  const decision = B.detectBranchDecision(ofEvent(save, eventId));
  assert.deepEqual(decision?.options.map(option => option.actionId), ['seal_three_month_south_pact', 'refuse_term_take_paolao']);
  assert.deepEqual(decision.labels, ['当面订下三个月南荒之约', '拒绝期限，要她现在就动炮烙']);
  assert.equal(B.branchDecisionLocksInput(decision), true);
  assert.equal(B.branchDecisionAllowsSend(decision, null, '我拒绝期限', option => option.playerLine), false);
  const sealed = act(save, 'seal_three_month_south_pact');
  assert.ok(rt(sealed).completedEventIds.includes(eventId));
  assert.equal(B.detectBranchDecision(ofEvent(sealed, eventId)), null, '选定后锁消失');
});

test('谢艺托付锁：承接／救治二选一并关闭自由输入；选定后锁消失', async () => {
  const eventId = 'lcq.event.xieyi_entrustment';
  const save = arrive(await focus(await opened('lcq.stage_05b'), eventId));
  const options = ofEvent(save, eventId);
  const decision = B.detectBranchDecision(options);
  assert.deepEqual(decision?.options.map(option => option.actionId), ['accept_entrustment', 'rescue_xieyi']);
  assert.deepEqual(decision.labels, ['承接', '救治']);
  assert.equal(B.branchDecisionLocksInput(decision), true);
  assert.equal(B.branchDecisionAllowsSend(decision, null, '我给谢艺施针', option => option.playerLine), false);
  // 救治要乐明珠在场；不在场时锁里只剩承接。
  const alone = B.detectBranchDecision(options.filter(option => option.actionId !== 'rescue_xieyi'));
  assert.deepEqual(alone?.options.map(option => option.actionId), ['accept_entrustment']);
  const accepted = act(save, 'accept_entrustment');
  assert.equal(B.detectBranchDecision(ofEvent(accepted, eventId)), null, '选定后锁消失');
});

test('殇侯锁：真跑 05b 到殇侯拍，决定步之前致命选项不出、不锁；跟到殇侯处后锁成「不碰／去碰」并关闭自由输入', async () => {
  const eventId = 'lcq.event.shanghou_revealed';
  let save = arrive(await focus(await opened('lcq.stage_05b'), eventId));
  for (let guard = 0; guard < 5 && !ofEvent(save, eventId).some(option => option.actionId === 'refuse_shanghou_relic_test'); guard++) {
    const before = ofEvent(save, eventId);
    assert.equal(B.detectBranchDecision(before), null, '决定步之前不锁');
    assert.ok(!before.some(option => option.actionId === 'touch_shanghou_relic'), '决定步之前致命选项不出');
    save = act(save, before.find(option => !option.actionId.startsWith('travel:')).actionId);
  }
  const decision = B.detectBranchDecision(ofEvent(save, eventId));
  assert.deepEqual(decision?.options.map(option => option.actionId), ['refuse_shanghou_relic_test', 'touch_shanghou_relic']);
  assert.deepEqual(decision.labels, ['认出警示标记，不碰', '伸手去碰那件神物']);
  assert.equal(B.branchDecisionLocksInput(decision), true);
  const refused = act(save, 'refuse_shanghou_relic_test');
  assert.equal(B.detectBranchDecision(ofEvent(refused, eventId)), null, '选定后锁消失');
});
