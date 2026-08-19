import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { loadTs } from './loadTs.mjs';

// 战场拍必须让玩家**感到**时钟在走。
//
// 立项由来（2026-08-19）：制作人真机试玩后说「玩家可以毫无止境地在中州草原闲逛，
// 而不触发段强的死。因为这是一个战争场景而不是普通日常，不应该让玩家太过悠哉」。
//
// 查证结果：机制其实在——`段强被射杀` 早有 `offscreenResolution.afterStallTurns: 8`，
// 并不是无止境。真正的毛病有三个，合起来就成了「感觉可以一直闲逛」：
//   ① 8 轮对战场太长；
//   ② **8 轮里零信号**——引擎知道时钟在走，玩家不知道（与倒计时同一类问题）；
//   ③ worldDelta 写的是「因你缺席」，可玩家正站在那儿。
//
// 故把焰浪那套「逐轮可观察事实」从「只能配死亡」里解绑成 `event.pressure`：
// 演出方式共用，后果不同——绝路到点结束本局，场景压力到点由 offscreenResolution
// 把这一拍按默认结果落定（箭照样射出去，只是玩家没插上手）。

const DATA = 'src/modules/scenarioMods/builtins/data/lcq.stage_01.json';

test('战场拍的引信不超过 5 轮，且逼近提示必须覆盖到落定之前', () => {
  const mod = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  for (const event of mod.scenario.events) {
    if (!event.pressure) continue;
    const fuse = event.offscreenResolution?.afterStallTurns;
    assert.ok(fuse !== undefined, `${event.id} 配了 pressure 却没有 offscreenResolution——到点没有任何事发生`);
    assert.ok(fuse <= 5, `${event.id} 的引信 ${fuse} 轮对战场太长`);
    const last = event.pressure.afterTurns + event.pressure.approach.length;
    assert.ok(last <= fuse, `${event.id} 的逼近提示排到第 ${last} 轮，晚于落定（第 ${fuse} 轮）`);
    for (const line of event.pressure.approach) {
      assert.ok(!/回合|倒计时|剩余/.test(line), `逼近文案出现机制口径：${line}`);
      assert.ok(!/你会死|必死|将被杀/.test(line), `逼近文案预告了结局：${line}`);
    }
  }
});

test('逐轮送出逼近事实，并进到提示词里', async () => {
  const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const mod = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const progress = rtm.createScenarioProgress(mod);
  progress.flags = { ...(mod.scenario.initialFlags || {}) };
  progress.worldTurn = 0;
  progress.modId = mod.manifest.id;
  progress.currentChapterId = rtm.getInitialScenarioChapterId(mod);
  progress.nextStageId = 'NEXT';
  let save = rtm.advanceScenarioRuntime({ 世界: { 状态: { 剧本模组: progress } } }).saveData;
  const rt = () => save.世界.状态.剧本模组;
  // 把玩家钉在「段强被射杀」这一拍上，然后什么都不做
  rt().activeEventIds = ['lcq.event.s01_02'];
  rt().eventTimeline = { 'lcq.event.s01_02': { eligibleAtTurn: 0, activatedAtTurn: Number(rt().worldTurn) || 0 } };

  const delivered = [];
  for (let turn = 0; turn < 4; turn += 1) {
    const out = rtm.advanceScenarioRuntime(save);
    save = out.saveData;
    const hit = out.transitions.find(item => item.type === 'fatal_approach');
    if (hit) delivered.push(hit.detail);
  }
  assert.ok(delivered.length >= 2, `闲逛四轮至少该收到两条逼近，实际 ${delivered.length}`);
  assert.match(delivered[0], /喊杀|草浪/, '第一条应当只是远处的动静');

  rt().pendingFatalApproach = { text: delivered[delivered.length - 1], atTurn: Number(rt().worldTurn) || 0 };
  const prompt = buildScenarioStoryPrompt(save) || '';
  assert.ok(prompt.includes(delivered[delivered.length - 1]), '逼近事实必须进提示词，否则玩家永远感觉不到');
});
