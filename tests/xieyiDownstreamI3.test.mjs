import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json', import.meta.url);

function fixture(stage, flags = {}) {
  return {
    角色: { 位置: { 描述: '中州·清远' } },
    世界: {
      状态: {
        剧本模组: {
          modId: stage.manifest.id,
          flags: {
            ...stage.scenario.initialFlags,
            'event.xieyi_entrustment.done': true,
            ...flags,
          },
          chapters: structuredClone(stage.scenario.chapters),
          currentChapterId: 'lcq.chapter.stage_07_qingyuan_jiankang_qingyuan',
          events: structuredClone(stage.scenario.events),
          activeEventIds: ['lcq.event.xiaoyaoyi_arrives'],
          completedEventIds: [],
          completedChapterIds: [],
          offscreenResolvedEventIds: [],
          eventActionStates: {},
          pathReceipts: {},
          playerKnowledge: {},
          stallTurns: 0,
          worldTurn: 40,
          canon: structuredClone(stage.canon),
        },
      },
    },
  };
}

const runtimeOf = save => save.世界.状态.剧本模组;

test('萧遥逸首次登场在 s07_01 之前，且按命运露出交骨灰或密送', async () => {
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction, advanceScenarioRuntime } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const rail = (await loadTs('../src/modules/scenarioMods/canonRail.ts')).CANON_RAIL_PROFILES
    .find(profile => profile.modId === 'lcq.stage_07_qingyuan_jiankang');
  assert.equal(rail.orderedEventIds[0], 'lcq.event.xiaoyaoyi_arrives');
  assert.ok(rail.orderedEventIds.indexOf('lcq.event.xiaoyaoyi_arrives')
    < rail.orderedEventIds.indexOf('lcq.event.s07_01_old_case'));

  const deadSave = fixture(stage);
  const deadActions = getCurrentStoryEventActions(deadSave);
  assert.deepEqual(deadActions.map(item => item.actionId), ['deliver_ashes']);
  const dead = recordStoryEventStructuredAction(deadSave, deadActions[0]);
  assert.equal(dead.completed, true);
  assert.ok(runtimeOf(deadSave).pathReceipts['lcq.event.xiaoyaoyi_arrives.path.ashes_delivered']);

  const liveSave = fixture(stage, { 'branch.lcq.if_xieyi_longrest.active': true });
  const liveActions = getCurrentStoryEventActions(liveSave);
  assert.deepEqual(liveActions.map(item => item.actionId), ['escort_wounded']);
  const live = recordStoryEventStructuredAction(liveSave, liveActions[0]);
  assert.equal(live.completed, true);
  assert.ok(runtimeOf(liveSave).pathReceipts['lcq.event.xiaoyaoyi_arrives.path.wounded_escorted']);
  assert.equal(runtimeOf(liveSave).pathReceipts['lcq.event.xiaoyaoyi_arrives.path.ashes_delivered'], undefined);

  const after = advanceScenarioRuntime(JSON.parse(JSON.stringify(deadSave))).saveData;
  assert.equal(runtimeOf(after).completedEventIds.includes('lcq.event.xiaoyaoyi_arrives'), true);
});

test('s07_05 死亡线说明已死；生还线两项都落账且玩家只认领一边', async () => {
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const base = () => {
    const save = fixture(stage);
    runtimeOf(save).currentChapterId = 'lcq.chapter.stage_07_qingyuan_jiankang_jiankang';
    runtimeOf(save).activeEventIds = ['lcq.event.s07_05_eight_steeds_informed'];
    runtimeOf(save).completedEventIds = ['lcq.event.xiaoyaoyi_arrives', 'lcq.event.s07_01_old_case'];
    return save;
  };

  const deadSave = base();
  const deadActions = getCurrentStoryEventActions(deadSave);
  assert.deepEqual(deadActions.map(item => item.actionId), ['report_death']);
  assert.equal(recordStoryEventStructuredAction(deadSave, deadActions[0]).completed, true);
  assert.equal(runtimeOf(deadSave).playerKnowledge['knowledge.s07_05.meng_secret_transfer'], undefined);
  assert.ok(runtimeOf(deadSave).playerKnowledge['knowledge.s07_05.death_reported']);

  const escortSave = base();
  runtimeOf(escortSave).flags['branch.lcq.if_xieyi_longrest.active'] = true;
  const escortActions = getCurrentStoryEventActions(escortSave);
  assert.deepEqual(escortActions.map(item => item.actionId).sort(), ['claim_escort', 'claim_investigate']);
  assert.equal(recordStoryEventStructuredAction(escortSave, escortActions.find(item => item.actionId === 'claim_escort')).completed, true);
  const escortRt = runtimeOf(escortSave);
  assert.ok(escortRt.playerKnowledge['knowledge.s07_05.meng_secret_transfer']);
  assert.ok(escortRt.playerKnowledge['knowledge.s07_05.meng_investigation_open']);
  assert.ok(escortRt.pathReceipts['lcq.event.s07_05_eight_steeds_informed.path.player_escort']);
  assert.equal(escortRt.pathReceipts['lcq.event.s07_05_eight_steeds_informed.path.player_investigate'], undefined);

  const investigateSave = base();
  runtimeOf(investigateSave).flags['branch.lcq.if_xieyi_longrest.active'] = true;
  const investigateActions = getCurrentStoryEventActions(investigateSave);
  assert.equal(recordStoryEventStructuredAction(
    investigateSave,
    investigateActions.find(item => item.actionId === 'claim_investigate'),
  ).completed, true);
  assert.ok(runtimeOf(investigateSave).pathReceipts['lcq.event.s07_05_eight_steeds_informed.path.player_investigate']);
  assert.ok(runtimeOf(investigateSave).playerKnowledge['knowledge.s07_05.meng_secret_transfer']);
});

test('谢艺人物任务不再指向不存在或串线的 event id', async () => {
  const { CHARACTER_QUESTS } = await loadTs('../src/modules/scenarioMods/characterQuests.ts');
  const xieyi = CHARACTER_QUESTS.find(item => item.id === 'xieyi');
  const ids = xieyi.beats.flatMap(beat => beat.eventIds || []);
  assert.equal(ids.includes('lyg.event.s06_03'), false);
  assert.equal(ids.includes('lcq.event.s04b_xieyi_yue_mission'), false);
  assert.ok(ids.includes('lcq.event.xieyi_entrustment'));
  assert.ok(ids.includes('lcq.event.xieyi_biling_war'));
  const xiao = CHARACTER_QUESTS.find(item => item.id === 'xiaoyaoyi');
  assert.ok(xiao.beats.some(beat => (beat.eventIds || []).includes('lcq.event.xiaoyaoyi_arrives')));
});
