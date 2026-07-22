import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL('../src/modules/scenarioMods/builtins/data/lyg.ganlu_bian.json', import.meta.url);
const saveContractUrl = new URL('../mod-kit/generated/deepseek-v4-flash/character-canon/SAVE-CONTRACT.json', import.meta.url);
const STAGE_ID = 'lyg.ganlu_bian';
const SOURCE_ORDER = [
  'lyg.event.li_jinxiang_meeting', 'lyg.event.yang_yuhuan_report', 'lyg.event.jia_wenhe_plan',
  'lyg.event.soul_summoning', 'lyg.event.bai_nichang_defeat', 'lyg.event.liangzhou_victory',
  'lyg.event.release_jingnian', 'lyg.event.su_sha_identified', 'lyg.event.xiao_zi_departure',
  'lyg.event.ganlu_crisis_final',
];

const stage = async () => JSON.parse(await readFile(stageUrl, 'utf8'));
const runtimeOf = save => save.世界.状态.剧本模组;

function freshFixture(document) {
  return {
    角色: { 身份: { 名字: 'R2-11V来源重建' }, 位置: { 描述: '舞阳侯府' }, 属性: { 声望: 0 } },
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

test('ten frozen events follow source 127–132 and stop before the liangzhou stage', async () => {
  const document = await stage();
  assert.deepEqual(document.scenario.events.map(event => event.id), SOURCE_ORDER);
  assert.deepEqual(document.scenario.events.map(event => event.axisSeq), [1193, 1195, 1196, 1198, 1199, 1200, 1201, 1202, undefined, undefined]);
  assert.deepEqual(document.scenario.events.slice(-2).map(event => event.axisMethod), ['reviewed-no-anchor', 'reviewed-no-anchor']);
  const byId = new Map(document.scenario.events.map(event => [event.id, event]));
  assert.deepEqual(byId.get(SOURCE_ORDER[0]).conditions, []);
  for (let index = 1; index < SOURCE_ORDER.length; index += 1) {
    assert.equal(byId.get(SOURCE_ORDER[index]).conditions[0].path, byId.get(SOURCE_ORDER[index - 1]).completion[0].path);
  }
  assert.equal(document.manifest.axisSeqHi, 1202);
  assert.equal(document.manifest.nextStageId, 'lyg.liangzhou_league');
  for (const marker of ['yange.133', 'yange.134', 'yange.135']) assert.equal(JSON.stringify(document.scenario).includes(marker), false, marker);
});

test('opening owns the source126 plot but leaks none of the playable source127–132 results', async () => {
  const document = await stage();
  const opening = JSON.stringify({ world: document.world, opening: document.scenario.opening });
  assert.match(opening, /王守澄已死/);
  assert.match(opening, /后日.*诛宦/);
  for (const marker of ['黎锦香已经揭露', '飞鸟萤子已经供出', '权宦集团已经完成', '小紫已经前往', '凉州盟比武已经开始']) {
    assert.equal(opening.includes(marker), false, marker);
  }
});

test('fourteen stage actors remain minimal and affiliation locked', async () => {
  const document = await stage();
  const required = new Set([
    document.scenario.opening.playerCharacterId, ...document.scenario.opening.featuredCharacterIds,
    ...document.scenario.events.flatMap(event => event.relatedCharacterIds || []),
  ]);
  assert.deepEqual(new Set(document.canon.characters.map(item => item.id)), required);
  assert.equal(document.canon.characters.length, 14);
  for (const item of document.canon.characters) {
    assert.deepEqual(Object.keys(item.profile), ['origin'], item.id);
    assert.deepEqual(item.affiliations, [], item.id);
    for (const field of ['realm', 'skillIds', 'techniqueIds', 'itemIds']) assert.equal(field in item, false, `${item.id}:${field}`);
  }
  assert.deepEqual(document.content, { items: [], techniques: [], skills: [] });
  assert.deepEqual(document.rules.contentAccess, []);
});

test('ten hand-authored contracts replay across all frozen chapters and are idempotent', async () => {
  const document = await stage();
  for (const event of document.scenario.events) {
    assert.equal(event.playerCompletionContract?.kind, 'objective_action', event.id);
    assert.equal(event.playerCompletionContract.actions.length, 2, event.id);
    assert.equal(event.playerCompletionContract.actions.some(item => item.id === 'advance_declared_objective'), false, event.id);
    assert.equal(event.completion.length, 1, event.id);
  }
  const { advanceScenarioRuntime, getCurrentStoryEventActions, recordStoryEventStructuredAction } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  let save = advanceScenarioRuntime(freshFixture(document)).saveData;
  const completed = [];
  for (let guard = 0; guard < 80; guard += 1) {
    const actions = getCurrentStoryEventActions(save);
    if (!actions.length) break;
    const result = recordStoryEventStructuredAction(save, actions[0]);
    if (result.completed) completed.push(actions[0].eventId);
    save = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  }
  assert.deepEqual(completed, SOURCE_ORDER);
  assert.deepEqual(runtimeOf(save).completedChapterIds, document.scenario.chapters.map(item => item.id));
  const left = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  const right = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  assert.equal(JSON.stringify(right), JSON.stringify(left));
});

test('legacy event and chapter completion paths stay frozen and quarantine remains enabled', async () => {
  const document = await stage();
  const contract = JSON.parse(await readFile(saveContractUrl, 'utf8')).stages[STAGE_ID];
  assert.deepEqual(new Set(contract.eventIds), new Set(SOURCE_ORDER));
  for (const event of document.scenario.events) assert.deepEqual(contract.eventFlagPaths[event.id], event.completion.map(item => item.path), event.id);
  for (const chapter of document.scenario.chapters) assert.deepEqual(new Set(contract.chapterFlagPaths[chapter.id]), new Set(chapter.completion.map(item => item.path)), chapter.id);
  const { isDefaultLineQuarantinedStageId } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  assert.equal(isDefaultLineQuarantinedStageId(STAGE_ID), true);
});
