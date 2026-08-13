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

function omenRuntime(overrides = {}) {
  return {
    storyMode: 'world_sim',
    worldTurn: 2,
    flags: {},
    completedEventIds: [],
    offscreenResolvedEventIds: [],
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
        omen: {
          id: 'omen.assassination.watch',
          afterTurns: 2,
          observableFacts: ['宫门正在换防', '护送链没有回音'],
          transmitters: [{ kind: 'messenger' }, { kind: 'environment' }],
          environmentFallback: '远处宫墙灯火改了方向。',
          presentation: { title: '宫门异动', text: '宫门换防，护送链失联，像有人在试探逼近。' },
        },
      },
    }],
    eventTimeline: { 'event.assassination': { eligibleAtTurn: 0 } },
    worldSimulation: {
      version: 1,
      situations: [{
        id: 'situation.assassination',
        title: '刺杀窗口已经打开',
        summary: '剑玉姬正在逼近。',
        sourceEventId: 'event.assassination',
        settledWhenAny: [[{ path: 'flags.assassination.done', operator: 'eq', value: true }]],
        outcomeIds: [], anchorIds: [],
      }],
      structuralAnchors: [], forkableOutcomes: [], referenceBeats: [],
    },
    worldSimulationState: { actionReceipts: [] },
    ...overrides,
  };
}

function snapshotTruth(runtime) {
  return structuredClone({
    flags: runtime.flags,
    completedEventIds: runtime.completedEventIds || [],
    offscreenResolvedEventIds: runtime.offscreenResolvedEventIds || [],
    playerKnowledge: runtime.playerKnowledge || {},
    divergences: runtime.divergences || [],
    eventTimeline: runtime.eventTimeline,
  });
}

test('omen stays silent before the turn threshold', async () => {
  const { deliverDueWorldOmens, getWorldSimulationPresentationNotices } = await loadTs('../src/modules/scenarioMods/worldSimulation.ts');
  const transitions = [];
  const notices = deliverDueWorldOmens(omenRuntime({ worldTurn: 1 }), transitions);
  assert.deepEqual(notices, []);
  assert.deepEqual(transitions, []);
  assert.deepEqual(getWorldSimulationPresentationNotices(omenRuntime({ worldTurn: 1 }), [
    { action: 'event_activated', newValue: 'event.assassination' },
  ]), []);
});

test('omen delivers once at the threshold and refresh or JSON reload does not repeat it', async () => {
  const { deliverDueWorldOmens, getWorldSimulationPresentationNotices } = await loadTs('../src/modules/scenarioMods/worldSimulation.ts');
  const first = omenRuntime({ worldTurn: 2 });
  const before = snapshotTruth(first);
  const transitions = [];
  const notices = deliverDueWorldOmens(first, transitions);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].kind, 'omen');
  assert.equal(notices[0].title, '宫门异动');
  assert.match(notices[0].detail, /护送链失联/);
  assert.doesNotMatch(notices[0].detail, /身亡|会死/);
  assert.deepEqual(transitions, [{ type: 'event_omen', id: 'omen.assassination.watch' }]);
  assert.deepEqual(first.worldSimulationState.deliveredOmenIds, ['omen.assassination.watch']);
  assert.deepEqual(snapshotTruth(first), before);

  const again = deliverDueWorldOmens(first, []);
  assert.deepEqual(again, []);
  assert.deepEqual(first.worldSimulationState.pendingOmenIds, []);

  const reloaded = JSON.parse(JSON.stringify(first));
  assert.deepEqual(deliverDueWorldOmens(reloaded, []), []);
  assert.deepEqual(getWorldSimulationPresentationNotices(reloaded, [
    { action: 'event_omen', newValue: 'omen.assassination.watch' },
  ]).map(item => item.omenId), ['omen.assassination.watch']);
});

test('same-batch settlement does not backfill an expired omen', async () => {
  const { deliverDueWorldOmens } = await loadTs('../src/modules/scenarioMods/worldSimulation.ts');
  const runtime = omenRuntime({
    worldTurn: 6,
    offscreenResolvedEventIds: ['event.assassination'],
    eventTimeline: { 'event.assassination': { eligibleAtTurn: 0, occurredAtTurn: 6, outcome: 'offscreen' } },
  });
  const transitions = [];
  assert.deepEqual(deliverDueWorldOmens(runtime, transitions), []);
  assert.deepEqual(transitions, []);
  assert.deepEqual(runtime.worldSimulationState.deliveredOmenIds, ['omen.assassination.watch']);
  assert.deepEqual(runtime.worldSimulationState.pendingOmenIds, []);
});

test('omen delivery is disabled outside world mode', async () => {
  const { deliverDueWorldOmens } = await loadTs('../src/modules/scenarioMods/worldSimulation.ts');
  const runtime = omenRuntime({ storyMode: 'canon_companion', worldTurn: 6 });
  const before = structuredClone(runtime.worldSimulationState);
  const transitions = [];
  assert.deepEqual(deliverDueWorldOmens(runtime, transitions), []);
  assert.deepEqual(transitions, []);
  assert.deepEqual(runtime.worldSimulationState, before);
});

test('old saves backfill missing omen contracts but do not rewind past events', async () => {
  const { backfillRuntimeWorldOmens, advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const savedEvent = {
    id: 'event.assassination',
    name: '宫门刺杀',
    timeline: {
      kind: 'canon_anchor', notBeforeTurns: 1, deadlineTurns: 6,
      reveal: { publicAfterTurns: 1, playerKnowledge: 'public_report' },
    },
  };
  const runtimeState = {
    storyMode: 'world_sim',
    events: [savedEvent],
    worldTurn: 8,
    flags: { 'world.assassination.occurred': true },
    activeEventIds: [],
    completedEventIds: [],
    offscreenResolvedEventIds: ['event.assassination'],
    eventTimeline: { 'event.assassination': { eligibleAtTurn: 0, occurredAtTurn: 6, outcome: 'offscreen' } },
    worldSimulation: {
      version: 1,
      situations: [{
        id: 'situation.assassination',
        title: '刺杀窗口已经打开',
        summary: '剑玉姬正在逼近。',
        sourceEventId: 'event.assassination',
        settledWhenAny: [[{ path: 'flags.world.assassination.occurred', operator: 'eq', value: true }]],
        outcomeIds: [], anchorIds: [],
      }],
      structuralAnchors: [], forkableOutcomes: [], referenceBeats: [],
    },
    worldSimulationState: { actionReceipts: [] },
    playerKnowledge: { 'knowledge.player.event.event.assassination': { factId: 'knowledge.player.event.event.assassination' } },
  };
  const canonicalOmen = omenRuntime().events[0].timeline.omen;
  const updated = backfillRuntimeWorldOmens(runtimeState, [{
    id: 'event.assassination',
    timeline: { omen: canonicalOmen },
  }], {
    version: 1,
    situations: [{ id: 'situation.assassination', omen: {
      id: 'omen.situation.stale',
      afterTurns: 1,
      observableFacts: ['钟鼓试鸣'],
      environmentFallback: '远处钟鼓响了一阵。',
      presentation: { title: '过期风声', text: '不该再出现。' },
    } }],
    structuralAnchors: [], forkableOutcomes: [], referenceBeats: [],
  });
  assert.equal(updated, 2);
  assert.deepEqual(savedEvent.timeline.omen, canonicalOmen);
  assert.equal(runtimeState.worldSimulation.situations[0].omen.id, 'omen.situation.stale');
  assert.equal(backfillRuntimeWorldOmens(runtimeState, [{
    id: 'event.assassination',
    timeline: { omen: { ...canonicalOmen, presentation: { title: '新', text: '不该覆盖' } } },
  }]), 0);
  assert.equal(savedEvent.timeline.omen.presentation.title, '宫门异动');

  const save = {
    角色: { 位置: { 描述: '宫外' } },
    社交: { 关系: { 吕雉: { 好感: 10 } } },
    系统: { 扩展: {}, 历史: { 叙事: [] } },
    世界: { 状态: { 剧本模组: runtimeState } },
  };
  const knowledgeBefore = structuredClone(runtimeState.playerKnowledge);
  const relationsBefore = structuredClone(save.社交.关系);
  const result = advanceScenarioRuntime(save);
  assert.equal(result.transitions.some(item => item.type === 'event_omen'), false);
  assert.deepEqual(runtimeState.playerKnowledge, knowledgeBefore);
  assert.deepEqual(save.社交.关系, relationsBefore);
  assert.equal(result.saveData.世界.状态.剧本模组.flags['world.assassination.occurred'], true);
  assert.ok((result.saveData.世界.状态.剧本模组.worldSimulationState.deliveredOmenIds || []).includes('omen.assassination.watch'));
  assert.deepEqual(result.saveData.世界.状态.剧本模组.worldSimulationState.pendingOmenIds, []);
});

test('world mode still has no numeric countdown after omen delivery', async () => {
  const source = await readFile(new URL('../src/components/dashboard/RightSidebar.vue', import.meta.url), 'utf8');
  const panel = await readFile(new URL('../src/components/dashboard/MainGamePanel.vue', import.meta.url), 'utf8');
  assert.match(source, /card\.windowText && !worldMode/);
  assert.doesNotMatch(source, /actor-situation-card|situationWindowText|getCurrentWorldSituationTiming/);
  assert.doesNotMatch(panel, /剩余\s*\$\{|倒计时/);
});
