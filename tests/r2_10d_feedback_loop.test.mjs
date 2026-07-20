import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL(
  '../src/modules/scenarioMods/builtins/data/lyg.dingtao_beijing.json',
  import.meta.url,
);
const FALLBACK_FACT = 'knowledge.lyg.jia_fallback_prepared';

function coreOf(stage, eventId) {
  return stage.scenario.events.find(event => event.id === eventId).worldActor.decisionCore;
}

function fixture(stage) {
  return {
    角色: { 身份: { 名字: 'R2-10D反馈验收角色' }, 位置: { 描述: '长秋宫外' }, 属性: { 声望: 0 } },
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
          flags: { ...stage.scenario.initialFlags },
          activeEventIds: ['lyg.event.s01_05'],
          completedEventIds: [
            'lyg.event.s01_01',
            'lyg.event.s01_02',
            'lyg.event.s01_03',
            'lyg.event.s01_04',
          ],
          completedChapterIds: [],
          offscreenResolvedEventIds: [],
          chronicle: [],
          stallTurns: 0,
          worldTurn: 0,
          nextStageId: stage.manifest.nextStageId,
          canon: structuredClone(stage.canon),
        },
      },
    },
  };
}

test('knowledge gates candidates and state effects unlock later actions without leaking secret facts', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { applyNpcDecisionActorState, decideNpcActions } =
    await loadTs('../src/modules/scenarioMods/npcDecisionCore.ts');

  const s06 = coreOf(stage, 'lyg.event.s01_06');
  const round06 = decideNpcActions(s06);
  const guo = round06.decisions.find(item => item.actorId === 'liuchao.character.guo_jie');
  const jian = round06.decisions.find(item => item.actorId === 'liuchao.character.jian_yu_ji');
  assert.match(guo.candidates.find(item => item.actionId === 'escort_witness').eliminatedReason, /^knowledge:/);
  assert.match(jian.candidates.find(item => item.actionId === 'block_road').eliminatedReason, /^knowledge:/);
  const state06 = applyNpcDecisionActorState(s06, s06.actors, round06.decisions);
  const next06 = decideNpcActions(s06, s06.situation.initialValues, state06);
  assert.equal(next06.decisions.find(item => item.actorId === guo.actorId)
    .candidates.find(item => item.actionId === 'escort_witness').eligible, true);
  assert.equal(next06.decisions.find(item => item.actorId === jian.actorId)
    .candidates.find(item => item.actionId === 'block_road').eligible, true);

  const s08 = coreOf(stage, 'lyg.event.s01_08');
  const round08 = decideNpcActions(s08);
  const initial = round08.decisions[0];
  assert.equal(initial.actionId, 'verify_rumor');
  assert.deepEqual(initial.attitudes, [{
    targetCharacterId: 'liuchao.character.cheng_zongyang',
    dimension: 'trust',
    value: 44,
  }]);
  assert.match(initial.candidates.find(item => item.actionId === 'gather_intelligence').eliminatedReason, /^knowledge:/);
  assert.equal(initial.knownFacts.some(fact => /黑魔海御姬奴/.test(fact)), false);
  const state08 = applyNpcDecisionActorState(s08, s08.actors, round08.decisions);
  assert.equal(state08[0].knowledge.includes('knowledge.lyg.s01_08.source_verified'), true);
  assert.equal(state08[0].relationships['liuchao.character.cheng_zongyang'].trust, 49);
  const verifyBinding = s08.actionBindings.find(item => item.actionId === 'verify_rumor');
  assert.equal(
    state08[0].resources.intelligence,
    s08.actors[0].resources.intelligence
      - (verifyBinding.costs?.intelligence || 0)
      + verifyBinding.stateEffects.resources.intelligence,
  );
  const next08 = decideNpcActions(s08, s08.situation.initialValues, state08);
  assert.equal(next08.decisions[0].candidates.find(item => item.actionId === 'gather_intelligence').eligible, true);
});

test('attitude changes utility and is clamped while canon config remains immutable', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { applyNpcDecisionActorState, decideNpcActions } =
    await loadTs('../src/modules/scenarioMods/npcDecisionCore.ts');
  const core = coreOf(stage, 'lyg.event.s01_08');
  const lowTrustActors = structuredClone(core.actors);
  lowTrustActors[0].relationships['liuchao.character.cheng_zongyang'].trust = -100;
  const highTrustActors = structuredClone(core.actors);
  highTrustActors[0].relationships['liuchao.character.cheng_zongyang'].trust = 100;
  const low = decideNpcActions(core, core.situation.initialValues, lowTrustActors);
  const high = decideNpcActions(core, core.situation.initialValues, highTrustActors);
  const score = round => round.decisions[0].candidates.find(item => item.actionId === 'verify_rumor').score;
  assert.equal(
    Math.abs((score(high) - score(low)) - 8) < 1e-9,
    true,
    'relationship utility must use normalized -100..100 attitude',
  );

  const overflowing = structuredClone(core);
  overflowing.actionBindings.find(item => item.actionId === 'verify_rumor')
    .stateEffects.relationships[0].deltas.trust = 500;
  const settled = applyNpcDecisionActorState(
    overflowing,
    overflowing.actors,
    decideNpcActions(overflowing).decisions,
  );
  assert.equal(settled[0].relationships['liuchao.character.cheng_zongyang'].trust, 100);
  assert.equal(core.actors[0].relationships['liuchao.character.cheng_zongyang'].trust, 44);
});

test('s01_05 knowledge and attitude survive JSON reload and change the s01_07 candidate set', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { decideNpcActions } = await loadTs('../src/modules/scenarioMods/npcDecisionCore.ts');
  const { advanceScenarioRuntime, getNarrativeAnchorEvent } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');

  const cold07 = decideNpcActions(coreOf(stage, 'lyg.event.s01_07'));
  assert.match(
    cold07.decisions.find(item => item.actorId === 'liuchao.character.jia_wenhe')
      .candidates.find(item => item.actionId === 'withdraw_force').eliminatedReason,
    /^knowledge:/,
  );

  let save = fixture(stage);
  let reloaded = false;
  for (let step = 0; step < 36; step++) {
    save = advanceScenarioRuntime(save).saveData;
    const runtime = save.世界.状态.剧本模组;
    if (!reloaded && runtime.actorEngine?.actorMemory?.['liuchao.character.jia_wenhe']?.knowledge.includes(FALLBACK_FACT)) {
      save = JSON.parse(JSON.stringify(save));
      reloaded = true;
    }
    if (getNarrativeAnchorEvent(runtime)?.id === 'lyg.event.s01_07'
      && runtime.actorEngine?.anchorEventId === 'lyg.event.s01_07') break;
  }

  const runtime = save.世界.状态.剧本模组;
  assert.equal(reloaded, true);
  assert.equal(getNarrativeAnchorEvent(runtime).id, 'lyg.event.s01_07');
  const remembered = runtime.actorEngine.actorMemory['liuchao.character.jia_wenhe'];
  assert.equal(remembered.knowledge.includes(FALLBACK_FACT), true);
  assert.equal(
    remembered.relationships['liuchao.character.dong_zhuo'].obligation > 58,
    true,
    's01_05 actions must alter the attitude carried into s01_07',
  );
  const jia = runtime.actorEngine.npcStates.find(item => item.characterId === 'liuchao.character.jia_wenhe');
  assert.equal(jia.knowledge.includes(FALLBACK_FACT), true);
  const withdraw = runtime.actorEngine.decisions.find(item => item.actorId === jia.characterId)
    .candidates.find(item => item.actionId === 'withdraw_force');
  assert.equal(withdraw.eligible, true);
  assert.equal(withdraw.breakdown.relationshipMotive > 0, true);
  assert.match(buildScenarioStoryPrompt(save), /态度=董卓\.obligation=/);
});
