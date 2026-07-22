import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL('../src/modules/scenarioMods/builtins/data/lyg.shixiang_ambush.json', import.meta.url);
const saveContractUrl = new URL('../mod-kit/generated/deepseek-v4-flash/character-canon/SAVE-CONTRACT.json', import.meta.url);
const STAGE_ID = 'lyg.shixiang_ambush';
const SOURCE_ORDER = [
  'lyg.event.shixiang_s10', 'lyg.event.investigate_te_master', 'lyg.event.shixiang_s11',
  'lyg.event.shixiang_s12', 'lyg.event.shixiang_s13', 'lyg.event.track_dagger_attacker',
  'lyg.event.shixiang_s14', 'lyg.event.escape_or_counter', 'lyg.event.lure_pan_jinlian',
  'lyg.event.ambush_at_shuixiang', 'lyg.event.final_showdown', 'lyg.event.raid_qinglongsi',
  'lyg.event.forewarned_from_xinyong', 'lyg.event.capture_feiniao',
];
const APPENDED_IDS = Array.from({ length: 5 }, (_, index) => `lyg.event.shixiang_s${index + 10}`);

const stage = async () => JSON.parse(await readFile(stageUrl, 'utf8'));
const runtimeOf = save => save.世界.状态.剧本模组;

function freshFixture(document) {
  return {
    角色: { 身份: { 名字: 'R2-11U来源重建' }, 位置: { 描述: '宣平坊' }, 属性: { 声望: 0 } },
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

test('nine frozen ids and five append-only beats follow source 69–84 without duplicate primary axes', async () => {
  const document = await stage();
  assert.deepEqual(document.scenario.events.map(event => event.id), SOURCE_ORDER);
  assert.deepEqual(document.scenario.events.map(event => event.axisSeq), [
    1093, 1096, 1097, 1100, 1102, 1103, 1104, 1105, 1106, 1107, 1110, 1113, 1114, 1115,
  ]);
  const axes = document.scenario.events.map(event => event.axisId);
  assert.equal(new Set(axes).size, axes.length);
  const byId = new Map(document.scenario.events.map(event => [event.id, event]));
  for (const [index, id] of SOURCE_ORDER.entries()) {
    const expected = index === 0
      ? 'flags.chapter.lyg.shixiang_ambush.started'
      : byId.get(SOURCE_ORDER[index - 1]).completion[0].path;
    assert.equal(byId.get(id).conditions[0].path, expected, id);
  }
  assert.equal(document.scenario.events.at(-1).axisSeq, 1115);
  assert.equal(document.manifest.nextStageId, 'lyg.changgan_interlude');
});

test('opening stops after the public-enemy decree and before all source 69–84 play beats', async () => {
  const document = await stage();
  const opening = JSON.stringify({ world: document.world, opening: document.scenario.opening });
  assert.match(opening, /佛门公敌/);
  assert.match(opening, /杨玉环/);
  for (const marker of ['水香楼邀捕已经布置', '毒方刺客已经潜入', '飞鸟萤子已经被擒', '信永已经揭露']) {
    assert.equal(opening.includes(marker), false, marker);
  }
});

test('stage cast is the exact event closure and strips future combat payloads', async () => {
  const document = await stage();
  const required = new Set([
    document.scenario.opening.playerCharacterId, ...document.scenario.opening.featuredCharacterIds,
    ...document.scenario.events.flatMap(event => event.relatedCharacterIds || []),
  ]);
  assert.deepEqual(new Set(document.canon.characters.map(item => item.id)), required);
  assert.equal(document.canon.characters.length, 15);
  for (const item of document.canon.characters) {
    assert.equal(typeof item.profile.origin, 'string', item.id);
    assert.deepEqual(Object.keys(item.profile).filter(key => !['origin', 'personality'].includes(key)), [], item.id);
    for (const field of ['realm', 'skillIds', 'techniqueIds', 'itemIds']) assert.equal(field in item, false, `${item.id}:${field}`);
  }
  assert.deepEqual(document.content, { items: [], techniques: [], skills: [] });
  assert.deepEqual(document.rules.contentAccess, []);
});

test('fourteen hand-authored contracts replay in source order and remain idempotent', async () => {
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
  for (let guard = 0; guard < 112; guard += 1) {
    const actions = getCurrentStoryEventActions(save);
    if (!actions.length) break;
    const result = recordStoryEventStructuredAction(save, actions[0]);
    if (result.completed) completed.push(actions[0].eventId);
    save = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  }
  assert.deepEqual(completed, SOURCE_ORDER);
  assert.deepEqual(runtimeOf(save).completedChapterIds, document.scenario.chapters.map(item => item.id));
  assert.deepEqual(runtimeOf(save).offscreenResolvedEventIds, []);
  const left = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  const right = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  assert.equal(JSON.stringify(right), JSON.stringify(left));
});

test('append-only ids and legacy completion paths remain frozen while quarantine stays active', async () => {
  const document = await stage();
  const saveContract = JSON.parse(await readFile(saveContractUrl, 'utf8')).stages[STAGE_ID];
  for (const id of APPENDED_IDS) {
    assert.equal(saveContract.eventIds.includes(id), true, id);
    assert.deepEqual(saveContract.eventFlagPaths[id], [`flags.event.${id.split('.').at(-1)}.done`], id);
  }
  for (const id of SOURCE_ORDER.filter(id => !APPENDED_IDS.includes(id))) {
    assert.deepEqual(saveContract.eventFlagPaths[id], document.scenario.events.find(event => event.id === id).completion.map(item => item.path), id);
  }
  const { isDefaultLineQuarantinedStageId } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  assert.equal(isDefaultLineQuarantinedStageId(STAGE_ID), true);
});
