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

/** 推进到演员已经花过资源、开过多回合行动、落过冷却的中局。 */
async function advanceToMidRound(advanceScenarioRuntime, stage) {
  let save = fixture(stage);
  for (let step = 0; step < 12; step++) {
    save = advanceScenarioRuntime(save).saveData;
    const engine = save.世界.状态.剧本模组.actorEngine;
    const states = engine?.npcStates || [];
    const spent = states.some(actor => actor.activeAction)
      || states.some(actor => Object.keys(actor.actionCooldowns || {}).length);
    if (spent && (engine.decisionRound || 0) >= 1) return save;
  }
  throw new Error('fixture never reached a mid-round actor state');
}

test('config migration carries spent resources, cooldowns, agenda clocks and in-flight actions', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');

  const save = await advanceToMidRound(advanceScenarioRuntime, stage);
  const before = structuredClone(save.世界.状态.剧本模组.actorEngine.npcStates);
  assert.equal(before.length > 0, true);

  // 模拟发版热更：decisionCore 内容变化 -> configHash 失配 -> 走 hydrateNpcActors 重建。
  const drifted = structuredClone(save);
  drifted.世界.状态.剧本模组.actorEngine.decisionConfigHash = 'legacy-config';
  const migrated = advanceScenarioRuntime(drifted).saveData.世界.状态.剧本模组.actorEngine;

  assert.equal(migrated.configMigrations.at(-1).fromHash, 'legacy-config');

  for (const previous of before) {
    const after = migrated.npcStates.find(item => item.characterId === previous.characterId);
    assert.ok(after, `${previous.characterId} must survive migration`);

    assert.deepEqual(
      after.resources, previous.resources,
      `${previous.characterId}: migration must not refund spent resources`,
    );
    assert.deepEqual(
      after.actionCooldowns || {}, previous.actionCooldowns || {},
      `${previous.characterId}: migration must not clear cooldowns and let a blocked action restart`,
    );
    assert.deepEqual(
      after.agendas.map(item => [item.id, item.clock]),
      previous.agendas.map(item => [item.id, item.clock]),
      `${previous.characterId}: agenda clocks must not rewind`,
    );
    assert.deepEqual(
      after.activeAction, previous.activeAction,
      `${previous.characterId}: an in-flight multi-turn action must not silently restart`,
    );
  }
});

test('crossing to a new anchor event still inherits only attitude, knowledge and memories', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { advanceScenarioRuntime, getNarrativeAnchorEvent } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');

  let save = fixture(stage);
  let crossed;
  for (let step = 0; step < 36 && !crossed; step++) {
    save = advanceScenarioRuntime(save).saveData;
    const runtime = save.世界.状态.剧本模组;
    const anchorId = getNarrativeAnchorEvent(runtime)?.id;
    if (anchorId && anchorId !== 'lyg.event.s01_05' && runtime.actorEngine?.anchorEventId === anchorId) {
      crossed = runtime;
    }
  }
  assert.ok(crossed, 'fixture must cross into a later anchor event');

  const anchor = crossed.events.find(item => item.id === crossed.actorEngine.anchorEventId);
  const declared = anchor.worldActor.decisionCore.actors;
  for (const actor of crossed.actorEngine.npcStates) {
    const source = declared.find(item => item.characterId === actor.characterId);
    assert.deepEqual(
      actor.resources, source.resources,
      `${actor.characterId}: a new anchor must start from the core's declared resources`,
    );
    assert.equal(
      actor.activeAction, undefined,
      `${actor.characterId}: an action from the previous event must not stay in flight`,
    );
    assert.deepEqual(
      actor.agendas.map(item => item.clock), source.agendas.map(item => item.clock),
      `${actor.characterId}: agenda clocks belong to the previous event`,
    );
    assert.equal(
      (crossed.actorEngine.decisions || []).some(decision =>
        decision.actorId === actor.characterId && decision.candidates.length === 0),
      false,
      `${actor.characterId}: a fresh anchor must re-score a full candidate list`,
    );
  }
});

test('migration voids an in-flight action whose binding disappeared and blocks an immediate restart', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');

  const save = await advanceToMidRound(advanceScenarioRuntime, stage);
  const engine = save.世界.状态.剧本模组.actorEngine;
  const busy = engine.npcStates.find(actor => actor.activeAction);
  assert.ok(busy, 'fixture must contain an in-flight action');
  const droppedActionId = busy.activeAction.actionId;

  // 新版本删掉了该行动的绑定：既 hash 失配，又让在途行动失去合同。
  const drifted = structuredClone(save);
  drifted.世界.状态.剧本模组.actorEngine.decisionConfigHash = 'legacy-config';
  const anchorId = drifted.世界.状态.剧本模组.actorEngine.anchorEventId;
  const anchor = drifted.世界.状态.剧本模组.events.find(item => item.id === anchorId);
  const core = anchor.worldActor.decisionCore;
  core.actionBindings = core.actionBindings.filter(binding => binding.actionId !== droppedActionId);
  for (const actor of core.actors) {
    actor.allowedActionIds = actor.allowedActionIds.filter(id => id !== droppedActionId);
  }

  const migrated = advanceScenarioRuntime(drifted).saveData.世界.状态.剧本模组.actorEngine;
  const after = migrated.npcStates.find(item => item.characterId === busy.characterId);

  assert.equal(after.activeAction, undefined, 'orphaned activeAction must be voided, not left as a zombie');
  assert.equal(
    after.actionCooldowns[droppedActionId], 1,
    'voiding an in-flight action must still cost a cooldown turn',
  );
  assert.equal(
    (migrated.decisions || []).some(decision =>
      decision.actorId === busy.characterId && decision.actionId === droppedActionId),
    false,
    'a removed binding must not be re-selected after migration',
  );
});
