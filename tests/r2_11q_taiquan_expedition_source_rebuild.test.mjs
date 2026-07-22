import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL('../src/modules/scenarioMods/builtins/data/lyl.taiquan_expedition.json', import.meta.url);
const STAGE_ID = 'lyl.taiquan_expedition';
const SOURCE_ORDER = [
  'liuchao.event.enter_taiquan',
  'liuchao.event.reconnoiter',
  'liuchao.event.du_zong_raid',
  'liuchao.event.fruit_conflict',
  'liuchao.event.escape_taiquan',
];
const TIME_GATED_IDS = [
  'canon.character.7718ae444a', 'liuchao.character.ruan_xiang_lin',
  'liuchao.character.ruan_xiang_ning', 'liuchao.character.gao_zhishang',
  'liuchao.character.lu_qian',
];

const stage = async () => JSON.parse(await readFile(stageUrl, 'utf8'));
const runtimeOf = save => save.世界.状态.剧本模组;

function freshFixture(document) {
  return {
    角色: { 身份: { 名字: 'R2-11Q来源重建' }, 位置: { 描述: '临安' }, 属性: { 声望: 0 } },
    社交: { 关系: {}, 记忆: { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] } },
    系统: { 扩展: {}, 历史: { 叙事: [] } },
    世界: {
      信息: { 世界名称: document.world.name, 地点信息: [], 势力信息: [] },
      状态: { 剧本模组: {
        modId: document.manifest.id, modName: document.manifest.name, mode: 'strict',
        currentChapterId: document.scenario.chapters[0].id,
        chapters: structuredClone(document.scenario.chapters), events: structuredClone(document.scenario.events),
        flags: structuredClone(document.scenario.initialFlags), activeEventIds: [], completedEventIds: [],
        completedChapterIds: [], offscreenResolvedEventIds: [], chronicle: [], stallTurns: 0, worldTurn: 0,
        nextStageId: document.manifest.nextStageId, canon: structuredClone(document.canon),
      } },
    },
  };
}

test('historical ids now form the source-ordered chapters 12–14 chain', async () => {
  const document = await stage();
  assert.deepEqual(document.scenario.events.map(event => event.id), SOURCE_ORDER);
  assert.deepEqual(document.scenario.chapters.flatMap(chapter => chapter.eventIds), SOURCE_ORDER);
  assert.deepEqual(document.scenario.events.filter(event => event.axisId).map(event => [event.id, event.axisId, event.axisSeq]), [
    ['liuchao.event.reconnoiter', 'yunlong.12.1', 563],
    ['liuchao.event.du_zong_raid', 'yunlong.13.1', 564],
    ['liuchao.event.fruit_conflict', 'yunlong.14.1', 565],
    ['liuchao.event.escape_taiquan', 'yunlong.14.2', 566],
  ]);
  const byId = new Map(document.scenario.events.map(event => [event.id, event]));
  for (const [index, id] of SOURCE_ORDER.entries()) {
    const expected = index === 0 ? 'flags.chapter.arrival_in_canglan.started' : byId.get(SOURCE_ORDER[index - 1]).completion[0].path;
    assert.equal(byId.get(id).conditions[0].path, expected, id);
  }
});

test('the stage is Lin-an only and contains no fabricated Taiquan expedition', async () => {
  const document = await stage();
  assert.equal(document.manifest.axisSeqLo, 563);
  assert.equal(document.manifest.axisSeqHi, 566);
  assert.match(document.manifest.name, /镖局、宝刀与处子/);
  assert.deepEqual(document.world.continents.map(item => item.id), ['liuchao.continent.zhongzhou']);
  assert.deepEqual(document.canon.locations.map(item => item.id), ['liuchao.location.linan_city']);
  const text = JSON.stringify({ world: document.world, opening: document.scenario.opening, events: document.scenario.events, chapters: document.scenario.chapters });
  for (const marker of ['赤阳圣果', '苍澜镇', '太泉古阵探险', '进入太泉古阵', '毒宗伏击', '撤离古阵', '结盟某方', '雷射战刀']) {
    assert.equal(text.includes(marker), false, marker);
  }
  assert.match(document.world.background, /太泉古阵此时尚未进入本关时间线/);
});

test('cast and factions close over event references and five reveal-sensitive cards stay minimal', async () => {
  const document = await stage();
  const requiredCharacters = new Set([
    document.scenario.opening.playerCharacterId, ...document.scenario.opening.featuredCharacterIds,
    ...document.scenario.events.flatMap(event => event.relatedCharacterIds || []),
  ]);
  assert.deepEqual(new Set(document.canon.characters.map(character => character.id)), requiredCharacters);
  const requiredFactions = new Set([
    ...document.scenario.events.flatMap(event => event.relatedFactionIds || []),
    ...document.canon.characters.flatMap(character => character.affiliations.map(item => item.factionId)),
  ]);
  assert.deepEqual(new Set(document.canon.factions.map(faction => faction.id)), requiredFactions);

  const { resolveScenarioCharacters } = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
  for (const id of TIME_GATED_IDS) {
    const character = structuredClone(document.canon.characters.find(item => item.id === id));
    const before = structuredClone(character);
    assert.equal(resolveScenarioCharacters([character], STAGE_ID), 0, id);
    assert.deepEqual(character, before, id);
    assert.deepEqual(Object.keys(character.profile), ['origin'], id);
  }
  const ruan = document.canon.characters.find(item => item.id === 'liuchao.character.ruan_xiang_ning');
  for (const marker of ['御姬', '凝玉姬', '鼎炉', '结局', '伴侣']) assert.equal(JSON.stringify(ruan).includes(marker), false, marker);
  const gao = document.canon.characters.find(item => item.id === 'liuchao.character.gao_zhishang');
  for (const marker of ['真宋主', '岳帅私生子', '徒弟', '入伙']) assert.equal(JSON.stringify(gao).includes(marker), false, marker);
});

test('five hand-authored contracts replay the entire stage deterministically', async () => {
  const document = await stage();
  for (const event of document.scenario.events) {
    assert.equal(event.playerCompletionContract?.kind, 'objective_action', event.id);
    assert.deepEqual(event.playerCompletionContract.settleOn, ['success'], event.id);
    assert.equal(event.playerCompletionContract.actions.some(action => action.id === 'advance_declared_objective'), false, event.id);
  }
  const { advanceScenarioRuntime, getCurrentStoryEventActions, recordStoryEventStructuredAction } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  let save = advanceScenarioRuntime(freshFixture(document)).saveData;
  const completed = [];
  for (let guard = 0; guard < 48; guard += 1) {
    const actions = getCurrentStoryEventActions(save);
    if (!actions.length) break;
    const result = recordStoryEventStructuredAction(save, actions[0]);
    if (result.completed) completed.push(actions[0].eventId);
    save = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  }
  assert.deepEqual(completed, SOURCE_ORDER);
  assert.deepEqual(runtimeOf(save).completedChapterIds, document.scenario.chapters.map(chapter => chapter.id));
  assert.deepEqual(runtimeOf(save).offscreenResolvedEventIds, []);
  const left = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  const right = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  assert.equal(JSON.stringify(right), JSON.stringify(left));
});

test('source rebuild does not remove quarantine', async () => {
  const { isDefaultLineQuarantinedStageId } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  assert.equal(isDefaultLineQuarantinedStageId(STAGE_ID), true);
});
