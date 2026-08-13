import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

function runtime() {
  return {
    storyMode: 'world_sim',
    worldTurn: 4,
    flags: {},
    events: [{
      id: 'event.assassination',
      name: '宫门刺杀',
      description: '郭解在宫门遇袭。',
      timeline: {
        kind: 'canon_anchor', notBeforeTurns: 1, deadlineTurns: 6,
        reveal: {
          publicAfterTurns: 1,
          playerKnowledge: 'public_report',
          presentation: { title: '宫中急报', text: '一名黄门赶到阶前，禀报郭解已经伤重身亡。' },
        },
      },
    }],
    worldSimulation: {
      version: 1,
      situations: [{
        id: 'situation.assassination',
        title: '刺杀窗口已经打开',
        summary: '剑玉姬正在逼近，新君与郭解都面临危险。',
        sourceEventId: 'event.assassination',
        settledWhenAny: [[{ path: 'flags.assassination.done', operator: 'eq', value: true }]],
        outcomeIds: [], anchorIds: [],
      }],
      structuralAnchors: [], forkableOutcomes: [], referenceBeats: [],
    },
    divergences: [{
      id: 'offscreen.assassination',
      eventId: 'event.assassination',
      verdict: 'done',
      worldDelta: '郭解伤重身亡，消息稍后由宫中传出。',
      evidence: '测试',
      revealed: true,
    }],
  };
}

test('main presentation ignores hidden settlement and reports it only after player revelation', async () => {
  const { getWorldSimulationPresentationNotices } = await loadTs('../src/modules/scenarioMods/worldSimulation.ts');
  const hidden = getWorldSimulationPresentationNotices(runtime(), [
    { action: 'world_event_resolved', newValue: 'offscreen.assassination' },
  ]);
  assert.deepEqual(hidden, []);

  const revealed = getWorldSimulationPresentationNotices(runtime(), [
    { action: 'event_revealed', newValue: 'event.assassination' },
    { action: 'world_event_resolved', newValue: 'offscreen.assassination' },
  ]);
  assert.equal(revealed.length, 1);
  assert.equal(revealed[0].title, '宫中急报');
  assert.match(revealed[0].detail, /一名黄门赶到阶前/);
  assert.match(revealed[0].detail, /郭解.*伤重身亡/);
});

test('newly activated situation stays out of meta UI and awaits in-world narrative signals', async () => {
  const { getWorldSimulationPresentationNotices } = await loadTs('../src/modules/scenarioMods/worldSimulation.ts');
  const notices = getWorldSimulationPresentationNotices(runtime(), [
    { action: 'event_activated', newValue: 'event.assassination' },
  ]);
  assert.deepEqual(notices, []);
});

test('world mode does not render a numeric opportunity countdown in the right sidebar', async () => {
  const source = await readFile(new URL('../src/components/dashboard/RightSidebar.vue', import.meta.url), 'utf8');
  assert.match(source, /card\.windowText && !worldMode/);
  assert.doesNotMatch(source, /actor-situation-card|situationWindowText|getCurrentWorldSituationTiming/);
});

test('old world-mode saves backfill only missing in-world reveal presentation metadata', async () => {
  const { backfillRuntimeEventRevealPresentations } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const savedEvent = {
    id: 'event.assassination',
    name: '宫门刺杀',
    timeline: {
      kind: 'canon_anchor', notBeforeTurns: 1, deadlineTurns: 6,
      reveal: { publicAfterTurns: 1, playerKnowledge: 'public_report' },
    },
    offscreenResolution: { id: 'offscreen.assassination', afterStallTurns: 2, flagKey: 'world.assassination.occurred' },
  };
  const runtimeState = {
    events: [savedEvent],
    worldTurn: 5,
    flags: { world: { assassination: { occurred: true } } },
    activeEventIds: [],
    completedEventIds: [],
    offscreenResolvedEventIds: ['offscreen.assassination'],
  };
  const stateBefore = structuredClone({
    worldTurn: runtimeState.worldTurn,
    flags: runtimeState.flags,
    activeEventIds: runtimeState.activeEventIds,
    completedEventIds: runtimeState.completedEventIds,
    offscreenResolvedEventIds: runtimeState.offscreenResolvedEventIds,
    timeline: savedEvent.timeline,
    offscreenResolution: savedEvent.offscreenResolution,
  });
  const canonicalEvents = [{
    id: 'event.assassination',
    timeline: {
      kind: 'canon_anchor', notBeforeTurns: 99, deadlineTurns: 100,
      reveal: {
        publicAfterTurns: 9,
        playerKnowledge: 'permission',
        presentation: { title: '宫中急报', text: '一名黄门赶到阶前，禀报郭解已经伤重身亡。' },
      },
    },
  }];

  assert.equal(backfillRuntimeEventRevealPresentations(runtimeState, canonicalEvents), 1);
  assert.deepEqual(savedEvent.timeline.reveal.presentation, canonicalEvents[0].timeline.reveal.presentation);
  const stateAfterWithoutPresentation = structuredClone({
    worldTurn: runtimeState.worldTurn,
    flags: runtimeState.flags,
    activeEventIds: runtimeState.activeEventIds,
    completedEventIds: runtimeState.completedEventIds,
    offscreenResolvedEventIds: runtimeState.offscreenResolvedEventIds,
    timeline: savedEvent.timeline,
    offscreenResolution: savedEvent.offscreenResolution,
  });
  delete stateAfterWithoutPresentation.timeline.reveal.presentation;
  assert.deepEqual(stateAfterWithoutPresentation, stateBefore);
  assert.equal(backfillRuntimeEventRevealPresentations(runtimeState, canonicalEvents), 0);
});

test('same-turn public offscreen resolution writes one player-facing chronicle entry', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = {
    角色: { 位置: { 描述: '宫外' } },
    社交: { 关系: {} },
    系统: { 扩展: {}, 历史: { 叙事: [] } },
    世界: { 状态: { 剧本模组: {
      modId: 'demo.knowledge-handoff',
      currentChapterId: 'chapter.demo',
      chapters: [{ id: 'chapter.demo', title: '宫变', eventIds: ['event.demo'] }],
      events: [{
        id: 'event.demo', name: '宫变消息', critical: true,
        timeline: {
          kind: 'canon_anchor', notBeforeTurns: 0, deadlineTurns: 0,
          reveal: {
            publicAfterTurns: 0,
            playerKnowledge: 'public_report',
            presentation: { title: '宫中急报', text: '一名黄门赶来禀报宫变结果。' },
          },
        },
        offscreenResolution: {
          id: 'offscreen.demo', afterStallTurns: 99, flagKey: 'world.demo.occurred',
          resolvedEventIds: ['event.demo'], worldDelta: '宫变已经发生，消息传到玩家面前。', evidence: '测试合同',
        },
      }],
      flags: {}, activeEventIds: ['event.demo'], completedEventIds: [], completedChapterIds: [],
      offscreenResolvedEventIds: [], eventTimeline: { 'event.demo': { eligibleAtTurn: 0, activatedAtTurn: 0 } },
      playerKnowledge: {}, pathReceipts: {}, npcPrivateKnowledge: {}, eventActionStates: {},
      worldTurn: 0, stallTurns: 0,
    } } },
  };
  const result = advanceScenarioRuntime(save);
  const chronicle = result.saveData.世界.状态.剧本模组.chronicle;
  assert.equal(result.transitions.some(item => item.type === 'event_revealed'), true);
  assert.equal(result.transitions.some(item => item.type === 'world_event_resolved'), true);
  assert.equal(chronicle.length, 1);
  assert.equal(chronicle[0].title, '宫中急报');
  assert.match(chronicle[0].detail, /宫变已经发生/);
});
