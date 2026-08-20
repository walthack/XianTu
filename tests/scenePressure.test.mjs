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

test('闲逛时逐轮送出逼近事实，并进到提示词里（走真实路径，不伪造时钟）', async () => {
  // ⚠ 初版这条测试**手动塞了 `eventTimeline[...].activatedAtTurn`**，于是绿得很好看，
  // 而线上一次都没发出来——`activatedAtTurn` 只对配了 `timeline` 字段的 event 存在，
  // 战场这些拍都没有。制作人玩了很多回合没见到任何逼近提示，离线复现才查出来。
  // 现在时钟改用 `stallTurns`（与 offscreen 引信同一把尺），测试也必须走真实路径。
  const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const mod = parseScenarioMod(JSON.parse(fs.readFileSync(DATA, 'utf8')));

  let save = createQingyuOpeningPlaytestSave(mod);
  const rt = () => save.世界.状态.剧本模组;
  // 像真实玩家那样做掉首拍，让「段强被射杀」成为当前拍
  rt().flags['event.s01_01.done'] = true;
  save = rtm.advanceScenarioRuntime(save).saveData;
  assert.deepEqual(rt().activeEventIds, ['lcq.event.s01_02'], '首拍完成后应当推进到段强这一拍');

  // 之后什么都不做
  const delivered = [];
  let promptWhenDelivered = '';
  for (let turn = 0; turn < 4; turn += 1) {
    const out = rtm.advanceScenarioRuntime(save);
    save = out.saveData;
    const hit = out.transitions.find(item => item.type === 'fatal_approach');
    if (!hit) continue;
    delivered.push(hit.detail);
    // 必须在**送出的那一轮**取提示词：非本轮的逼近会被主动清掉（不重演上一轮）。
    promptWhenDelivered = buildScenarioStoryPrompt(save) || '';
  }
  assert.equal(delivered.length, 3, `闲逛应逐轮收到三条逼近，实际 ${delivered.length}：${delivered.join(' | ')}`);
  assert.match(delivered[0], /喊杀|草浪/, '第一条只是远处的动静');
  assert.match(delivered[2], /箭/, '第三条箭应该已经落到脚边');

  assert.ok(
    promptWhenDelivered.includes(delivered[delivered.length - 1]),
    '逼近事实必须进提示词，否则玩家永远感觉不到',
  );
  assert.match(promptWhenDelivered, /眼前的危险/, '必须带上"只演出不预告结局"的指令');
});
