import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_06.json', import.meta.url);
const STAGE_ID = 'lcq.stage_06';
const SOURCE_ORDER = [
  'lcq.event.s06_01',
  'lcq.event.s06_02',
  'lcq.event.s06_03',
  'lcq.event.s06_04',
  'lcq.event.s06_05',
  'lcq.event.s06_06',
];
const TIME_GATED_IDS = [
  'liuchao.character.cheng_zongyang', 'liuchao.character.le_mingzhu',
  'liuchao.character.xie_yi', 'liuchao.character.wu_er_lang',
  'liuchao.character.ning_yu', 'liuchao.character.su_li',
  'liuchao.character.xiao_zi', 'liuchao.character.gui_wu_wang',
  'liuchao.character.dragon_god', 'lcq.character.np006',
  'liuchao.character.yun_cang_feng', 'liuchao.character.bi_ji',
  'liuchao.character.shang_zhen_yu',
];

const stage = async () => JSON.parse(await readFile(stageUrl, 'utf8'));
const runtimeOf = save => save.世界.状态.剧本模组;

function freshFixture(document) {
  return {
    角色: { 身份: { 名字: 'R2-11R来源重建' }, 位置: { 描述: '鬼王峒' }, 属性: { 声望: 0 } },
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

test('six frozen ids follow the corrected source order and distinct axis bindings', async () => {
  const document = await stage();
  assert.deepEqual(document.scenario.events.map(event => event.id), SOURCE_ORDER);
  assert.deepEqual(document.scenario.chapters[0].eventIds, SOURCE_ORDER);
  assert.deepEqual(document.scenario.events.map(event => [event.id, event.axisId, event.axisSeq]), [
    ['lcq.event.s06_01', 'qingyu.114.2', 205],
    ['lcq.event.s06_02', 'qingyu.117.1', 211],
    ['lcq.event.s06_03', 'qingyu.116.1', 210],
    ['lcq.event.s06_04', 'qingyu.120.1', 217],
    ['lcq.event.s06_05', 'qingyu.122.2', 222],
    ['lcq.event.s06_06', 'qingyu.126.2', 226],
  ]);
  const byId = new Map(document.scenario.events.map(event => [event.id, event]));
  for (const [index, id] of SOURCE_ORDER.entries()) {
    const expected = index === 0 ? 'flags.chapter.lcq.stage_06.started' : byId.get(SOURCE_ORDER[index - 1]).completion[0].path;
    assert.equal(byId.get(id).conditions[0].path, expected, id);
  }
  assert.equal(byId.get('lcq.event.s06_03').axisMethod, 'source-rebuilt-frozen-if-anchor');
});

test('source rewrite removes contradicted objectives and fabricated ice-gu method', async () => {
  const document = await stage();
  const text = JSON.stringify({ world: document.world, opening: document.scenario.opening, events: document.scenario.events, chapters: document.scenario.chapters });
  for (const marker of ['潜入鬼王峒调查龙神', '在战场追击龙神', '在鬼王峒阻止碧姬', '玄冰掌和盐水']) {
    assert.equal(text.includes(marker), false, marker);
  }
  assert.match(document.scenario.events.at(-1).description, /原文依据/);
  assert.equal(document.manifest.axisSeqLo, 205);
  assert.equal(document.manifest.axisSeqHi, 226);
});

test('cast, locations and factions close exactly over the rebuilt stage', async () => {
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
  assert.deepEqual(document.canon.locations.map(location => location.id), [
    'liuchao.location.gui_wang_dong', 'liuchao.location.south_wild_valley',
  ]);
  const ids = new Set(document.canon.characters.map(character => character.id));
  assert.equal(ids.has('liuchao.character.xiao_yao_yi'), false);
  assert.equal(ids.has('liuchao.character.zhuo_yunjun'), false);

  const expectedAffiliations = new Map([
    ['liuchao.character.cheng_zongyang', []],
    ['liuchao.character.le_mingzhu', ['liuchao.faction.guang_ming_guan_tang']],
    ['liuchao.character.xie_yi', ['liuchao.faction.xing_yue_hu']],
    ['liuchao.character.wu_er_lang', ['liuchao.faction.bai_wu', 'liuchao.faction.bai_hu_shang_guan']],
    ['liuchao.character.ning_yu', ['liuchao.faction.bai_hu_shang_guan']],
    ['liuchao.character.su_li', ['liuchao.faction.hua_miao']],
    ['liuchao.character.xiao_zi', ['liuchao.faction.gui_wang_dong']],
    ['liuchao.character.gui_wu_wang', ['liuchao.faction.gui_wang_dong']],
    ['liuchao.character.dragon_god', []],
    ['lcq.character.np006', ['liuchao.faction.gui_wang_dong']],
    ['liuchao.character.yun_cang_feng', ['liuchao.faction.yun_shi_shang_hui']],
    ['liuchao.character.bi_ji', ['liuchao.faction.biyu', 'liuchao.faction.gui_wang_dong']],
    ['liuchao.character.shang_zhen_yu', ['liuchao.faction.x8b538653d9']],
  ]);
  for (const character of document.canon.characters) {
    assert.deepEqual(character.affiliations.map(item => item.factionId), expectedAffiliations.get(character.id), character.id);
    assert.deepEqual(Object.keys(character.profile), ['origin'], character.id);
    for (const field of ['realm', 'skillIds', 'techniqueIds', 'itemIds']) assert.equal(field in character, false, `${character.id}:${field}`);
  }
});

test('build-time cards, runtime registry and focused prompt all preserve opening-safe projections', async () => {
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
  const focusOf = query => buildScenarioStoryPrompt(save, query)
    .match(/## 当前相关人物正典约束（防 OOC）[\s\S]*?(?=\n【人物正典优先级】)/)?.[0] || '';
  // 单次 prompt 的 focused actor 有预算上限；用两个独立查询覆盖全部 13 人。
  const focused = [
    focusOf('我观察程宗扬、乐明珠、谢艺、武二郎、凝羽、苏荔与小紫'),
    focusOf('我观察鬼巫王、龙神、阁罗、云苍峰、碧姬与殇侯'),
  ].join('\n');
  for (const name of ['程宗扬', '乐明珠', '谢艺', '武二郎', '凝羽', '苏荔', '小紫', '鬼巫王', '龙神', '阁罗', '云苍峰', '碧奴', '朱老头']) {
    assert.match(focused, new RegExp(name), name);
  }
  for (const marker of ['盘江程氏', '星月湖大营', '少校', '龙雕弓', '御姬奴', '凝奴', '太一经', '毒宗唯一嫡传', '紫妈妈', '后宫', '拜殇侯为师']) {
    assert.equal(focused.includes(marker), false, marker);
  }
});

test('six hand-authored contracts replay the full canonical rail deterministically', async () => {
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
  for (let guard = 0; guard < 64; guard += 1) {
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

test('source rebuild preserves both IF ids and default-line quarantine', async () => {
  const document = await stage();
  assert.equal(document.scenario.events.some(event => event.id === 'lcq.event.s06_03' && event.axisId === 'qingyu.116.1'), true);
  assert.equal(document.scenario.events.some(event => event.id === 'lcq.event.s06_04'), true);
  const { isDefaultLineQuarantinedStageId } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  assert.equal(isDefaultLineQuarantinedStageId(STAGE_ID), true);
});
