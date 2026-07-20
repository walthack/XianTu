import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL(
  '../src/modules/scenarioMods/builtins/data/lyg.dingtao_beijing.json',
  import.meta.url,
);
const FIRST_EDICT = 'opportunity.lyg.s01_05.first_edict';

function fixture(stage) {
  return {
    角色: { 身份: { 名字: 'R2-10G验收角色' }, 位置: { 描述: '长秋宫外' }, 属性: { 声望: 0 } },
    社交: { 关系: {}, 记忆: { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] } },
    系统: { 扩展: {}, 历史: { 叙事: [] } },
    世界: {
      信息: { 世界名称: stage.world.name, 地点信息: [], 势力信息: [] },
      状态: {
        剧本模组: {
          modId: stage.manifest.id,
          currentChapterId: 'lyg.chapter.s01',
          chapters: structuredClone(stage.scenario.chapters),
          events: structuredClone(stage.scenario.events),
          flags: { ...stage.scenario.initialFlags },
          activeEventIds: ['lyg.event.s01_05'],
          completedEventIds: ['lyg.event.s01_01', 'lyg.event.s01_02', 'lyg.event.s01_03', 'lyg.event.s01_04'],
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

const runtimeOf = save => save.世界.状态.剧本模组;
function setNested(root, path, value) {
  const keys = path.split('.');
  let cursor = root;
  for (const key of keys.slice(0, -1)) cursor = cursor[key] ||= {};
  cursor[keys.at(-1)] = value;
}

test('opportunity cards surface from decisions, expire deterministically, and reject late tracking', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { advanceScenarioRuntime, trackStoryOpportunity } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');
  let save = advanceScenarioRuntime(fixture(stage)).saveData;
  const engine = runtimeOf(save).actorEngine;
  assert.equal(engine.opportunityStates[FIRST_EDICT].status, 'available');
  assert.equal(engine.opportunityStates['opportunity.lyg.s01_05.court_entry'].status, 'available');

  while (runtimeOf(save).worldTurn < 7) save = advanceScenarioRuntime(save).saveData;
  assert.equal(runtimeOf(save).actorEngine.opportunityStates[FIRST_EDICT].status, 'expired');
  assert.equal(trackStoryOpportunity(save, FIRST_EDICT).ok, false);

  const hiddenStage = structuredClone(stage);
  hiddenStage.scenario.events.find(event => event.id === 'lyg.event.s01_05')
    .worldActor.opportunities[0].trigger.actionIds = ['block_road'];
  const hidden = advanceScenarioRuntime(fixture(hiddenStage)).saveData;
  assert.equal(runtimeOf(hidden).actorEngine.opportunityStates[FIRST_EDICT], undefined);
});

test('switching opportunity cards preserves the first tracking turn and tracked cards expire explicitly', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { advanceScenarioRuntime, trackStoryOpportunity, TRACKED_OPPORTUNITY_MAX_TURNS } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');
  const courtEntry = 'opportunity.lyg.s01_05.court_entry';
  let save = advanceScenarioRuntime(fixture(stage)).saveData;
  assert.equal(trackStoryOpportunity(save, FIRST_EDICT).ok, true);
  const firstTrackedAt = runtimeOf(save).actorEngine.opportunityStates[FIRST_EDICT].trackedAtTurn;
  while (runtimeOf(save).worldTurn < 4) save = advanceScenarioRuntime(save).saveData;
  assert.equal(trackStoryOpportunity(save, courtEntry).ok, true);
  assert.equal(trackStoryOpportunity(save, FIRST_EDICT).ok, true);
  const engine = runtimeOf(save).actorEngine;
  assert.equal(engine.opportunityStates[FIRST_EDICT].trackedAtTurn, firstTrackedAt);
  assert.equal(engine.trackedAtTurn, firstTrackedAt);

  while (runtimeOf(save).worldTurn - firstTrackedAt < TRACKED_OPPORTUNITY_MAX_TURNS) {
    save = advanceScenarioRuntime(save).saveData;
  }
  assert.equal(runtimeOf(save).actorEngine.opportunityStates[FIRST_EDICT].status, 'expired');
  assert.notEqual(runtimeOf(save).actorEngine.trackedOpportunityId, FIRST_EDICT);
  assert.equal(trackStoryOpportunity(save, FIRST_EDICT).ok, false);
});

test('participated opportunity becomes durable NPC memory and changes a later utility score', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { advanceScenarioRuntime, trackStoryOpportunity } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { decideNpcActions } = await loadTs('../src/modules/scenarioMods/npcDecisionCore.ts');
  let save = advanceScenarioRuntime(fixture(stage)).saveData;
  assert.equal(trackStoryOpportunity(save, FIRST_EDICT).ok, true);
  setNested(runtimeOf(save).flags, 'event.s01_05.done', true);
  save = advanceScenarioRuntime(save).saveData;
  const memory = runtimeOf(save).actorEngine.actorMemory['liuchao.character.jia_wenhe'];
  const episode = memory.episodes.find(item => item.tags.includes(`opportunity:${FIRST_EDICT}`));
  assert.equal(episode.salience, 100);
  assert.match(episode.summary, /玩家介入并兑现/);
  assert.equal(runtimeOf(save).actorEngine.opportunityStates[FIRST_EDICT].status, 'participated');

  const core = stage.scenario.events.find(event => event.id === 'lyg.event.s01_07').worldActor.decisionCore;
  const cold = decideNpcActions(core);
  const actors = structuredClone(core.actors);
  actors.find(actor => actor.characterId === 'liuchao.character.jia_wenhe').memories = [episode];
  const warm = decideNpcActions(core, core.situation.initialValues, actors);
  const coldScore = cold.decisions.find(item => /jia_wenhe/.test(item.actorId))
    .candidates.find(item => item.actionId === 'reserve_supplies').score;
  const warmDecision = warm.decisions.find(item => /jia_wenhe/.test(item.actorId));
  const warmScore = warmDecision.candidates.find(item => item.actionId === 'reserve_supplies').score;
  assert.equal(warmScore, coldScore + 3);
  assert.equal(warmDecision.memories[0].id, episode.id);
});

test('long-term memory keeps only the twelve most salient episodes across JSON reload', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = fixture(stage);
  runtimeOf(save).actorEngine = {
    surfacedAgendaIds: [],
    receipts: [],
    entitlements: [],
    actorMemory: {
      'liuchao.character.jia_wenhe': {
        relationships: {},
        knowledge: [],
        episodes: Array.from({ length: 15 }, (_, index) => ({
          id: `memory.synthetic.${index}`,
          eventId: 'lyg.event.s01_04',
          summary: `经历${index}`,
          tags: [`synthetic:${index}`],
          salience: index,
          occurredAtTurn: index,
        })),
        updatedAtTurn: 15,
      },
    },
  };
  const restored = JSON.parse(JSON.stringify(save));
  const advanced = advanceScenarioRuntime(restored).saveData;
  const actor = runtimeOf(advanced).actorEngine.npcStates.find(item => /jia_wenhe/.test(item.characterId));
  assert.equal(actor.memories.length, 12);
  assert.equal(actor.memories.some(item => item.id === 'memory.synthetic.0'), false);
  assert.equal(actor.memories.some(item => item.id === 'memory.synthetic.14'), true);
});

test('validator rejects invalid opportunity lifecycle and memory utility contracts', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const invalid = structuredClone(stage);
  const event = invalid.scenario.events.find(item => item.id === 'lyg.event.s01_06');
  event.worldActor.opportunities[0].expiresAfterTurns = 0;
  event.worldActor.opportunities[0].trigger = { actorIds: ['missing.actor'] };
  event.worldActor.decisionCore.actionBindings[0].utility.memories = [{ tag: '', weight: 'heavy' }];
  const issues = validateScenarioMod(invalid).issues;
  assert.equal(issues.some(item => item.path.endsWith('.expiresAfterTurns') && item.code === 'invalid_range'), true);
  assert.equal(issues.some(item => item.path.endsWith('.trigger.actorIds') && item.code === 'unknown_reference'), true);
  assert.equal(issues.some(item => item.path.endsWith('.memories[0].tag') && item.code === 'required_string'), true);
  assert.equal(issues.some(item => item.path.endsWith('.memories[0].weight') && item.code === 'invalid_number'), true);
});
