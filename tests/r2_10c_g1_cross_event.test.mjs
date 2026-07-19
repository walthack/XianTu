import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL(
  '../src/modules/scenarioMods/builtins/data/lyg.dingtao_beijing.json',
  import.meta.url,
);

function fixture(stage) {
  return {
    角色: {
      身份: { 名字: 'R2-10C跨事件验收角色' },
      位置: { 描述: '洛都宫城' },
      属性: { 声望: 0 },
    },
    社交: { 关系: {}, 记忆: { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] } },
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
          flags: {
            ...stage.scenario.initialFlags,
            'event.s01_05.done': true,
          },
          activeEventIds: [],
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
          stallTurns: 0,
          steeringCooldown: 50,
          worldTurn: 0,
          nextStageId: stage.manifest.nextStageId,
          canon: structuredClone(stage.canon),
        },
      },
    },
  };
}

test('G1 crosses s01_06–08 with hard deadlines, distinct actor cores, and a non-forced knowledge event', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { advanceScenarioRuntime, getNarrativeAnchorEvent } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');
  let save = fixture(stage);
  const seen = [];
  const decisionHashes = new Map();

  for (let step = 0; step < 24; step++) {
    save = advanceScenarioRuntime(save).saveData;
    const runtime = save.世界.状态.剧本模组;
    const anchor = getNarrativeAnchorEvent(runtime);
    if (anchor?.id && runtime.actorEngine?.anchorEventId === anchor.id) {
      seen.push({ turn: runtime.worldTurn, eventId: anchor.id });
      if (runtime.actorEngine.decisionInputHash) {
        decisionHashes.set(anchor.id, runtime.actorEngine.decisionInputHash);
      }
      const visible = new Set(runtime.actorEngine.visibleDecisionIds || []);
      assert.equal(
        (runtime.actorEngine.decisions || [])
          .filter(decision => visible.has(decision.id))
          .every(decision => decision.visibility !== 'hidden'),
        true,
        `${anchor.id}: hidden decisions must remain engine-secret`,
      );
    }
    if (anchor?.id === 'lyg.event.s01_08' && runtime.worldTurn >= 20) break;
  }

  const runtime = save.世界.状态.剧本模组;
  const s06Clock = runtime.eventTimeline['lyg.event.s01_06'];
  const s07Clock = runtime.eventTimeline['lyg.event.s01_07'];
  const s08Clock = runtime.eventTimeline['lyg.event.s01_08'];

  assert.equal(s06Clock.activatedAtTurn - s06Clock.eligibleAtTurn, 1);
  assert.equal(s06Clock.occurredAtTurn - s06Clock.eligibleAtTurn, 6);
  assert.equal(s06Clock.outcome, 'offscreen');
  assert.equal(s06Clock.publiclyRevealedAtTurn - s06Clock.occurredAtTurn, 1);
  assert.equal(s06Clock.playerLearnedAtTurn, s06Clock.publiclyRevealedAtTurn);

  assert.equal(s07Clock.activatedAtTurn - s07Clock.eligibleAtTurn, 0);
  assert.equal(s07Clock.occurredAtTurn - s07Clock.eligibleAtTurn, 5);
  assert.equal(s07Clock.outcome, 'offscreen');
  assert.equal(s07Clock.publiclyRevealedAtTurn - s07Clock.occurredAtTurn, 1);

  assert.equal(s08Clock.activatedAtTurn - s08Clock.eligibleAtTurn, 1);
  assert.equal(s08Clock.occurredAtTurn, undefined, 'emergent player conversation must not auto-resolve');
  assert.equal(runtime.offscreenResolvedEventIds.includes('lyg.event.s01_08'), false);
  assert.equal(runtime.completedEventIds.includes('lyg.event.s01_08'), false);
  assert.equal(getNarrativeAnchorEvent(runtime).id, 'lyg.event.s01_08');

  assert.deepEqual(
    runtime.offscreenResolvedEventIds.filter(id => /^lyg\.event\.s01_0[678]$/.test(id)),
    ['lyg.event.s01_06', 'lyg.event.s01_07'],
  );
  assert.equal(
    runtime.divergences
      .filter(item => /^offscreen\.r2_10/.test(item.id))
      .every(item => item.revealed === true),
    true,
  );
  assert.equal(runtime.actorEngine.entitlements.length, 0, 'offscreen deadlines must never grant opportunity rewards');
  assert.deepEqual([...decisionHashes.keys()], [
    'lyg.event.s01_06',
    'lyg.event.s01_07',
    'lyg.event.s01_08',
  ]);
  assert.equal(new Set(decisionHashes.values()).size, 3, 'each event must have a distinct deterministic input');
  assert.equal(
    seen.some(item => item.eventId === 'lyg.event.s01_06')
      && seen.some(item => item.eventId === 'lyg.event.s01_07')
      && seen.some(item => item.eventId === 'lyg.event.s01_08'),
    true,
  );

  const reloaded = JSON.parse(JSON.stringify(save));
  const afterReload = advanceScenarioRuntime(reloaded).saveData.世界.状态.剧本模组;
  assert.equal(afterReload.offscreenResolvedEventIds.filter(id => /^lyg\.event\.s01_0[67]$/.test(id)).length, 2);
  assert.equal(afterReload.divergences.filter(item => /^offscreen\.r2_10/.test(item.id)).length, 2);
  assert.equal(afterReload.eventTimeline['lyg.event.s01_08'].occurredAtTurn, undefined);

  console.log('[R2-10C G1 evidence]', JSON.stringify({
    s01_06: s06Clock,
    s01_07: s07Clock,
    s01_08: s08Clock,
    hashes: Object.fromEntries(decisionHashes),
  }));
});
