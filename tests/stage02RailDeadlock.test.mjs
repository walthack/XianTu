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
// **2026-08-19 当天已修**：rail 延长到覆盖全关 18 拍（12 份合同由 Grok 按两份抽取取证、Claude 校对）。
// 断言随之翻转为「必须通关」。保留本文件是为了防回归——
// 若日后有人给 rail 关新增了不在 rail 上的 critical，这里会立刻红。

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

test('stage_02：玩家跟着主线（rail）走能通关（rail 已覆盖全关 18 拍）', async () => {
  const out = await playthrough(true);
  assert.equal(out.ready, true, 'rail 若又只盖了一部分，跟着主线走会在 rail 跑完那一刻锁死剩余内容');
  assert.equal(out.done, 18, '18 拍逐一走完');
});

test('stage_02：换一种玩家次序同样能通关（顺序不该决定通不通）', async () => {
  const out = await playthrough(false);
  assert.equal(out.ready, true);
  assert.equal(out.done, 18);
});
