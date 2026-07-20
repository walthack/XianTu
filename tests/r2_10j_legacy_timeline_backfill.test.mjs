import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL(
  '../src/modules/scenarioMods/builtins/data/lyg.dingtao_beijing.json',
  import.meta.url,
);

/** 旧档：s01_06 已在进行中并停滞若干轮，但存档里还没有 eventTimeline。 */
function legacySave(stage, { worldTurn, stallTurns }) {
  return {
    角色: { 位置: { 描述: '洛都宫城' }, 属性: { 声望: 0 } },
    社交: { 关系: {} },
    系统: { 扩展: {}, 历史: { 叙事: [] } },
    世界: {
      信息: { 世界名称: stage.world.name, 地点信息: [], 势力信息: [] },
      状态: {
        剧本模组: {
          modId: stage.manifest.id,
          modName: stage.manifest.name,
          mode: 'strict',
          currentChapterId: 'lyg.chapter.dingtao_beijing',
          chapters: structuredClone(stage.scenario.chapters),
          events: structuredClone(stage.scenario.events),
          flags: { ...stage.scenario.initialFlags, 'event.s01_05.done': true },
          activeEventIds: ['lyg.event.s01_06'],
          completedEventIds: [
            'lyg.event.s01_01',
            'lyg.event.s01_02',
            'lyg.event.s01_03',
            'lyg.event.s01_04',
            'lyg.event.s01_05',
          ],
          completedChapterIds: [],
          offscreenResolvedEventIds: [],
          chronicle: [],
          stallTurns,
          steeringCooldown: 50,
          worldTurn,
          nextStageId: stage.manifest.nextStageId,
          canon: structuredClone(stage.canon),
          // eventTimeline 缺席：这正是 R2-10C 之前存档的形态。
        },
      },
    },
  };
}

test('a legacy save mid-event backdates its timeline start instead of restarting the clock', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');

  const start = eventId => advanceScenarioRuntime(
    legacySave(stage, { worldTurn: 5, stallTurns: eventId }),
  ).saveData.世界.状态.剧本模组.eventTimeline['lyg.event.s01_06'];

  const stalled = start(4);
  const fresh = start(0);

  assert.ok(stalled && fresh, 'legacy saves must gain a timeline record');
  assert.equal(
    fresh.eligibleAtTurn - stalled.eligibleAtTurn, 4,
    'eligibility must be backdated by exactly the stalled turns, not reset to the load turn',
  );
  assert.equal(stalled.activatedAtTurn, stalled.eligibleAtTurn);
});

test('a backdated legacy clock still settles the canon deadline on schedule', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');

  // deadlineTurns=6：旧档已停滞 4 轮，剩余窗口应明显短于从零重算的 6 轮。
  let save = legacySave(stage, { worldTurn: 5, stallTurns: 4 });
  let settledAt;
  for (let step = 0; step < 12 && settledAt === undefined; step++) {
    save = advanceScenarioRuntime(save).saveData;
    const runtime = save.世界.状态.剧本模组;
    if (runtime.offscreenResolvedEventIds.includes('lyg.event.s01_06')) {
      settledAt = runtime.eventTimeline['lyg.event.s01_06'].occurredAtTurn;
    }
  }

  assert.ok(settledAt !== undefined, 'the canon deadline must still fire for a legacy save');
  const state = save.世界.状态.剧本模组.eventTimeline['lyg.event.s01_06'];
  assert.equal(
    settledAt - state.eligibleAtTurn, 6,
    'the deadline must be measured from the backdated eligibility, not from the load turn',
  );
});

test('a fresh save is not backdated by an unrelated stall counter', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');

  // 事件尚未激活时，stall 与该事件无关，不得回推。
  const idle = legacySave(stage, { worldTurn: 5, stallTurns: 4 });
  idle.世界.状态.剧本模组.activeEventIds = [];
  const idleState = advanceScenarioRuntime(idle).saveData
    .世界.状态.剧本模组.eventTimeline['lyg.event.s01_06'];
  const inFlightState = advanceScenarioRuntime(legacySave(stage, { worldTurn: 5, stallTurns: 4 }))
    .saveData.世界.状态.剧本模组.eventTimeline['lyg.event.s01_06'];

  assert.ok(idleState && inFlightState);
  assert.equal(
    idleState.eligibleAtTurn - inFlightState.eligibleAtTurn, 4,
    'an event that was not yet in flight must start its clock now, unaffected by the stall counter',
  );
  assert.equal(idleState.activatedAtTurn, undefined);
});
