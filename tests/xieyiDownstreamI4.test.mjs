import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stage07Url = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json', import.meta.url);
const linAnUrl = new URL('../src/modules/scenarioMods/builtins/data/lyl.lin_an_bridge.json', import.meta.url);
const SHARED_XIAO_LINE = '我当着萧遥逸的面，听他代表星月湖宣布支持，并问清眼下能用的资源。';

function stage07Fixture(stage, flags = {}) {
  return {
    角色: { 位置: { 描述: '中州·建康' } },
    世界: {
      状态: {
        剧本模组: {
          modId: stage.manifest.id,
          flags: {
            ...stage.scenario.initialFlags,
            'event.xieyi_entrustment.done': true,
            'event.xiaoyaoyi_arrives.done': true,
            ...flags,
          },
          chapters: structuredClone(stage.scenario.chapters),
          currentChapterId: 'lcq.chapter.stage_07_qingyuan_jiankang_jiankang',
          events: structuredClone(stage.scenario.events),
          activeEventIds: ['lcq.event.xiao_opens_resources'],
          completedEventIds: ['lcq.event.xiaoyaoyi_arrives', 'lcq.event.s07_01_old_case'],
          completedChapterIds: [],
          offscreenResolvedEventIds: [],
          eventActionStates: {},
          pathReceipts: {},
          playerKnowledge: {},
          stallTurns: 0,
          worldTurn: 50,
          canon: structuredClone(stage.canon),
        },
      },
    },
  };
}

function linAnFixture(stage, flags = {}) {
  return {
    角色: { 位置: { 描述: '临安' } },
    世界: {
      状态: {
        剧本模组: {
          modId: stage.manifest.id,
          flags: {
            ...stage.scenario.initialFlags,
            ...flags,
          },
          chapters: structuredClone(stage.scenario.chapters),
          currentChapterId: 'lyl.chapter.lin_an_bridge_intel',
          events: structuredClone(stage.scenario.events),
          activeEventIds: ['lyl.event.lin_an_bridge_xieyi_tomb'],
          completedEventIds: [],
          completedChapterIds: [],
          offscreenResolvedEventIds: [],
          eventActionStates: {},
          pathReceipts: {},
          playerKnowledge: {},
          stallTurns: 0,
          worldTurn: 80,
          canon: structuredClone(stage.canon),
        },
      },
    },
  };
}

const runtimeOf = save => save.世界.状态.剧本模组;

test('xiao_opens 两态共用同一句玩家行动，权威效果按命运分叉', async () => {
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');
  const stage = JSON.parse(await readFile(stage07Url, 'utf8'));
  const event = stage.scenario.events.find(item => item.id === 'lcq.event.xiao_opens_resources');
  const authored = event.playerCompletionContract.actions;
  assert.deepEqual(authored.map(item => item.id), ['hear_xingyue_support_dead', 'hear_xingyue_support_longrest']);
  assert.equal(authored[0].actionText, SHARED_XIAO_LINE);
  assert.equal(authored[1].actionText, SHARED_XIAO_LINE);
  assert.equal(authored[0].label, authored[1].label);

  const deadSave = stage07Fixture(stage);
  const deadActions = getCurrentStoryEventActions(deadSave);
  assert.deepEqual(deadActions.map(item => item.actionId), ['hear_xingyue_support_dead']);
  assert.equal(deadActions[0].actionText, SHARED_XIAO_LINE);
  assert.equal(recordStoryEventStructuredAction(deadSave, deadActions[0]).completed, true);
  const deadRt = runtimeOf(deadSave);
  assert.ok(deadRt.playerKnowledge['knowledge.xiao_opens.org_support']);
  assert.ok(deadRt.playerKnowledge['knowledge.xiao_opens.xieyi_estate']);
  assert.equal(deadRt.playerKnowledge['knowledge.xiao_opens.xieyi_retains_affairs'], undefined);
  assert.ok(deadRt.pathReceipts['lcq.event.xiao_opens_resources.path.estate_authority']);
  assert.equal(deadRt.pathReceipts['lcq.event.xiao_opens_resources.path.retains_affairs'], undefined);

  const liveSave = stage07Fixture(stage, { 'branch.lcq.if_xieyi_longrest.active': true });
  const liveActions = getCurrentStoryEventActions(liveSave);
  assert.deepEqual(liveActions.map(item => item.actionId), ['hear_xingyue_support_longrest']);
  assert.equal(liveActions[0].actionText, SHARED_XIAO_LINE);
  assert.equal(recordStoryEventStructuredAction(liveSave, liveActions[0]).completed, true);
  const liveRt = runtimeOf(liveSave);
  assert.ok(liveRt.playerKnowledge['knowledge.xiao_opens.org_support']);
  assert.ok(liveRt.playerKnowledge['knowledge.xiao_opens.xieyi_retains_affairs']);
  assert.equal(liveRt.playerKnowledge['knowledge.xiao_opens.xieyi_estate'], undefined);
  assert.ok(liveRt.pathReceipts['lcq.event.xiao_opens_resources.path.retains_affairs']);
  assert.equal(liveRt.pathReceipts['lcq.event.xiao_opens_resources.path.estate_authority'], undefined);
});

test('临安墓：死亡线可祭谢艺；生还线只祭岳鹏举且不得出现谢艺墓', async () => {
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');
  const stage = JSON.parse(await readFile(linAnUrl, 'utf8'));

  const deadSave = linAnFixture(stage);
  const greetDead = getCurrentStoryEventActions(deadSave);
  assert.deepEqual(greetDead.map(item => item.actionId), ['meet_yueshuang_outside_linan']);
  assert.equal(recordStoryEventStructuredAction(deadSave, greetDead[0]).completed, false);
  runtimeOf(deadSave).worldTurn += 1;
  const deadWorship = getCurrentStoryEventActions(deadSave);
  assert.deepEqual(deadWorship.map(item => item.actionId), ['worship_yue_and_xieyi_tomb']);
  assert.equal(recordStoryEventStructuredAction(deadSave, deadWorship[0]).completed, true);
  assert.ok(runtimeOf(deadSave).playerKnowledge['knowledge.lin_an.xieyi_tomb_visited']);
  assert.equal(runtimeOf(deadSave).playerKnowledge['knowledge.lin_an.no_xieyi_tomb'], undefined);

  const liveSave = linAnFixture(stage, { 'branch.lcq.if_xieyi_longrest.active': true });
  const greetLive = getCurrentStoryEventActions(liveSave);
  assert.equal(recordStoryEventStructuredAction(liveSave, greetLive[0]).completed, false);
  runtimeOf(liveSave).worldTurn += 1;
  const liveWorship = getCurrentStoryEventActions(liveSave);
  assert.deepEqual(liveWorship.map(item => item.actionId), ['worship_yue_only']);
  assert.match(liveWorship[0].actionText, /只祭岳鹏举/);
  assert.equal(/谢艺的墓/.test(liveWorship[0].actionText), false);
  assert.equal(recordStoryEventStructuredAction(liveSave, liveWorship[0]).completed, true);
  assert.ok(runtimeOf(liveSave).playerKnowledge['knowledge.lin_an.no_xieyi_tomb']);
  assert.equal(runtimeOf(liveSave).playerKnowledge['knowledge.lin_an.xieyi_tomb_visited'], undefined);
});
