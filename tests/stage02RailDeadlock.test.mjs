import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { loadTs } from './loadTs.mjs';

// 用真实 `lcq.stage_02` 数据跑引擎，证明「玩家跟着主线走会卡死」。
//
// 立项由来（2026-08-19）：制作人问「现在这个状态是否可以把主轴的部分先做一个 demo 出来测试」。
// 光读代码判不出来——先猜「会卡」，跑完发现顺着做**不卡**（第 19 轮 stage_ready）；
// 换成「优先做 rail 拍」（也就是玩家跟着主线走的最自然路径）才暴露：
//
//   第 6 轮 见完苏妲己 → rail 6 拍全结清 → `railStageComplete` 成立
//           → 它清空 `activeEventIds`、把**所有**章标完成、`currentChapterId = null`
//   第 7 轮 剩下 12 拍再无激活机会，却仍计入 `hasPendingCriticalEvent` → `stage_ready` 永不触发
//
// 根因不是漏绑（那已在 #161 修掉），是 **rail 只覆盖了本关 18 拍中的 6 拍**。
// `railStageComplete` 的语义是「rail 跑完＝整关跑完」，故 **rail 关的 critical 必须全在 rail 上**。
//
// ⚠ 本测试现在断言的是**缺陷仍然存在**。rail 延长到 18 拍后它会红，
// 届时把断言改成「stage_ready 必须触发」——**红了是好事，不要删掉本文件**。

const R = 'src/modules/scenarioMods/builtins/data/lcq.stage_02.json';

async function playthrough(preferRail) {
  const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const cr = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  const mod = JSON.parse(fs.readFileSync(R, 'utf8'));
  const rail = new Set(cr.CANON_RAIL_PROFILES.find(p => p.modId === 'lcq.stage_02').orderedEventIds);

  const progress = rtm.createScenarioProgress(mod);
  // createScenarioProgress 不产出 flags，而 getRuntime 无 flags 即返回 null（整个 advance 会空转）。
  progress.flags = { ...(mod.scenario.initialFlags || {}) };
  progress.worldTurn = 0;
  progress.modId = mod.manifest.id;
  progress.currentChapterId = rtm.getInitialScenarioChapterId(mod);
  progress.nextStageId = 'NEXT';

  let save = rtm.advanceScenarioRuntime({ 世界: { 状态: { 剧本模组: progress } } }).saveData;
  for (let turn = 1; turn <= 40; turn++) {
    const runtime = save.世界.状态.剧本模组;
    if (runtime.nextStageReadyId) return { ready: true, turn, done: runtime.completedEventIds.length };
    const active = [...(runtime.activeEventIds || [])];
    if (!active.length) return { ready: false, turn, done: runtime.completedEventIds.length };
    const pick = (preferRail && active.find(id => rail.has(id))) || active[0];
    runtime.flags[`event.${pick.split('.').pop()}.done`] = true;
    save = rtm.advanceScenarioRuntime(save).saveData;
  }
  return { ready: false, turn: 41, done: save.世界.状态.剧本模组.completedEventIds.length };
}

test('stage_02：玩家跟着主线（rail）走会卡死——rail 只盖了 18 拍中的 6 拍', async () => {
  const out = await playthrough(true);
  assert.equal(out.ready, false, '若这里变成 true，说明 rail 已延长到全关，请把本测试改为断言必须 ready');
  assert.equal(out.done, 6, 'rail 那 6 拍做完就再无可做；剩下 12 拍永远激活不了');
});

test('stage_02：先清池再走 rail 反而能通关（说明缺陷取决于玩家次序，不是必然）', async () => {
  const out = await playthrough(false);
  assert.equal(out.ready, true, '按激活顺序埋头做能走完 18 拍');
  assert.equal(out.done, 18);
});
