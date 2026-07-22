import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_05.json', import.meta.url);
const saveContractUrl = new URL('../mod-kit/generated/deepseek-v4-flash/character-canon/SAVE-CONTRACT.json', import.meta.url);
const STAGE_ID = 'lcq.stage_05';
const SOURCE_ORDER = [
  'lcq.event.s05_01', 'lcq.event.s05_02', 'lcq.event.s05_03',
  'lcq.event.s05_07', 'lcq.event.s05_04', 'lcq.event.s05_06',
  'lcq.event.debut_xiaozi', 'lcq.event.s05_16', 'lcq.event.s05_08', 'lcq.event.s05_05',
  'lcq.event.s05_09', 'lcq.event.s05_10', 'lcq.event.s05_11',
  'lcq.event.s05_12', 'lcq.event.s05_13', 'lcq.event.s05_14', 'lcq.event.s05_15',
];
const TIME_GATED_IDS = [
  'liuchao.character.cheng_zongyang', 'liuchao.character.le_mingzhu',
  'liuchao.character.xiao_zi', 'liuchao.character.xie_yi',
  'liuchao.character.yun_cang_feng', 'liuchao.character.ning_yu',
  'liuchao.character.wu_er_lang', 'liuchao.character.su_li',
  'liuchao.character.qi_yuan', 'lcq.character.np004',
  'lcq.character.np006', 'liuchao.character.bi_ji',
  'liuchao.character.a_xi', 'liuchao.character.dan_chen',
];

const stage = async () => JSON.parse(await readFile(stageUrl, 'utf8'));
const runtimeOf = save => save.世界.状态.剧本模组;

function freshFixture(document) {
  return {
    角色: { 身份: { 名字: 'R2-11T来源重建' }, 位置: { 描述: '海神殿' }, 属性: { 声望: 0 } },
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

test('frozen ids and seven append-only transitions follow source 76–94 without duplicate axes', async () => {
  const document = await stage();
  assert.deepEqual(document.scenario.events.map(event => event.id), SOURCE_ORDER);
  assert.deepEqual(document.scenario.chapters[0].eventIds, SOURCE_ORDER);
  assert.deepEqual(document.scenario.events.map(event => [event.id, event.axisId, event.axisSeq]), [
    ['lcq.event.s05_01', 'qingyu.76.1', 124],
    ['lcq.event.s05_02', 'qingyu.77.1', 125],
    ['lcq.event.s05_03', 'qingyu.78.3', 128],
    ['lcq.event.s05_07', 'qingyu.79.3', 131],
    ['lcq.event.s05_04', 'qingyu.80.3', 134],
    ['lcq.event.s05_06', 'qingyu.81.3', 137],
    ['lcq.event.debut_xiaozi', undefined, undefined],
    ['lcq.event.s05_16', 'qingyu.82.2', 139],
    ['lcq.event.s05_08', 'qingyu.84.2', 143],
    ['lcq.event.s05_05', 'qingyu.85.2', 145],
    ['lcq.event.s05_09', 'qingyu.86.2', 147],
    ['lcq.event.s05_10', 'qingyu.87.4', 151],
    ['lcq.event.s05_11', 'qingyu.88.3', 154],
    ['lcq.event.s05_12', 'qingyu.89.2', 156],
    ['lcq.event.s05_13', 'qingyu.90.2', 158],
    ['lcq.event.s05_14', 'qingyu.92.1', 160],
    ['lcq.event.s05_15', 'qingyu.94.1', 162],
  ]);
  const axisIds = document.scenario.events.map(event => event.axisId).filter(Boolean);
  assert.equal(new Set(axisIds).size, axisIds.length);
  const byId = new Map(document.scenario.events.map(event => [event.id, event]));
  for (const [index, id] of SOURCE_ORDER.entries()) {
    const expected = index === 0 ? 'flags.chapter.lcq.stage_05.started' : byId.get(SOURCE_ORDER[index - 1]).completion[0].path;
    assert.equal(byId.get(id).conditions[0].path, expected, id);
  }
  assert.deepEqual(document.scenario.chapters[0].completion, [{ path: 'flags.event.s05_15.done', operator: 'eq', value: true }]);
});

test('opening stops after the tide and before the merfolk attack', async () => {
  const document = await stage();
  const opening = JSON.stringify({ world: document.world, opening: document.scenario.opening });
  assert.match(opening, /大潮/);
  assert.match(opening, /珊瑚匕首/);
  for (const marker of ['鲛人已被击退', '兵器交易已经敲定', '已进入鬼王峒', '碧姬已经现身', '红苗盟友已经受控']) {
    assert.equal(opening.includes(marker), false, marker);
  }
  assert.equal(document.scenario.events.at(-1).axisSeq, 162);
  assert.equal(document.manifest.nextStageId, 'lcq.stage_05b');
});

test('cast, affiliations and locations close over the rebuilt stage with minimal cards', async () => {
  const document = await stage();
  const requiredCharacters = new Set([
    document.scenario.opening.playerCharacterId, ...document.scenario.opening.featuredCharacterIds,
    ...document.scenario.events.flatMap(event => event.relatedCharacterIds || []),
  ]);
  assert.deepEqual(new Set(document.canon.characters.map(character => character.id)), requiredCharacters);
  assert.deepEqual(new Set(document.canon.characters.map(character => character.id)), new Set(TIME_GATED_IDS));
  for (const character of document.canon.characters) {
    assert.deepEqual(Object.keys(character.profile), ['origin'], character.id);
    for (const field of ['realm', 'skillIds', 'techniqueIds', 'itemIds']) assert.equal(field in character, false, `${character.id}:${field}`);
  }
  assert.deepEqual(document.canon.locations.map(location => location.id), [
    'liuchao.location.sea_temple', 'liuchao.location.biyu_village',
    'lcq.location.turtle_road_ruins', 'lcq.location.nanhuang_camp',
    'liuchao.location.guiwang_dong',
  ]);
  assert.equal(document.canon.characters.find(character => character.id === 'liuchao.character.xiao_zi').affiliations
    .some(item => item.factionId === 'liuchao.faction.hei_mo_hai'), false);
});

test('build-time and runtime gates preserve all fourteen stage-time projections', async () => {
  const document = await stage();
  const { resolveScenarioCharacters } = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
  for (const id of TIME_GATED_IDS) {
    const character = structuredClone(document.canon.characters.find(item => item.id === id));
    const before = structuredClone(character);
    assert.equal(resolveScenarioCharacters([character], STAGE_ID), 0, id);
    assert.deepEqual(character, before, id);
  }

  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = advanceScenarioRuntime(freshFixture(document)).saveData;
  const prompts = [
    buildScenarioStoryPrompt(save, '我观察程宗扬、乐明珠、小紫、谢艺、云苍峰、凝羽、武二郎'),
    buildScenarioStoryPrompt(save, '我观察苏荔、祁远、易彪、阁罗、碧姬、阿夕、丹宸'),
  ];
  const focused = prompts.map(prompt => prompt.match(/## 当前相关人物正典约束（防 OOC）[\s\S]*?(?=\n【人物正典优先级】)/)?.[0] || '').join('\n');
  for (const name of ['程宗扬', '乐明珠', '小紫', '谢艺', '云苍峰', '凝羽', '武二郎', '苏荔', '祁远', '易彪', '阁罗', '碧姬', '阿夕', '丹宸']) {
    assert.match(focused, new RegExp(name), name);
  }
  for (const marker of ['盘江程氏', '程氏商会', '紫妈妈', '毒宗唯一嫡传', '岳帅遗孤', '御姬奴', '凝奴']) {
    assert.equal(focused.includes(marker), false, marker);
  }
});

test('seventeen hand-authored contracts replay through the whole chapter and survive JSON reload', async () => {
  const document = await stage();
  for (const event of document.scenario.events) {
    assert.equal(event.playerCompletionContract?.kind, 'objective_action', event.id);
    assert.deepEqual(event.playerCompletionContract.settleOn, ['success'], event.id);
    assert.equal(event.playerCompletionContract.actions.length, 2, event.id);
    assert.equal(event.playerCompletionContract.actions.some(action => action.id === 'advance_declared_objective'), false, event.id);
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
  assert.deepEqual(runtimeOf(save).completedChapterIds, ['lcq.chapter.stage_05']);
  assert.deepEqual(runtimeOf(save).offscreenResolvedEventIds, []);
  const left = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  const right = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  assert.equal(JSON.stringify(right), JSON.stringify(left));
});

test('append-only ids are registered while the rebuilt stage remains quarantined', async () => {
  const saveContract = JSON.parse(await readFile(saveContractUrl, 'utf8')).stages[STAGE_ID];
  for (const id of Array.from({ length: 7 }, (_, index) => `lcq.event.s05_${String(index + 10).padStart(2, '0')}`)) {
    assert.equal(saveContract.eventIds.includes(id), true, id);
    assert.deepEqual(saveContract.eventFlagPaths[id], [`flags.event.${id.split('.').at(-1)}.done`], id);
  }
  assert.deepEqual(saveContract.chapterFlagPaths['lcq.chapter.stage_05'], ['flags.event.s05_15.done']);
  const { isDefaultLineQuarantinedStageId } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  assert.equal(isDefaultLineQuarantinedStageId(STAGE_ID), true);
});
