import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_03.json', import.meta.url);
const saveContractUrl = new URL('../mod-kit/generated/deepseek-v4-flash/character-canon/SAVE-CONTRACT.json', import.meta.url);
const STAGE_ID = 'lcq.stage_03';
const SOURCE_ORDER = [
  'lcq.event.s03_01', 'lcq.event.debut_ningyu', 'lcq.event.s03_02',
  'lcq.event.s03_03', 'lcq.event.s03_04', 'lcq.event.s03_05',
  'lcq.event.s03_06', 'lcq.event.s03_07', 'lcq.event.s03_08',
  'lcq.event.s03_09', 'lcq.event.s03_10', 'lcq.event.s03_11', 'lcq.event.s03_12',
];
const TIME_GATED_IDS = [
  'liuchao.character.cheng_zongyang', 'liuchao.character.su_daji',
  'liuchao.character.ning_yu', 'liuchao.character.a_jiman_bana',
  'liuchao.character.wu_er_lang', 'liuchao.character.xi_men_qing',
  'liuchao.character.qi_yuan', 'liuchao.character.yun_cang_feng',
  'liuchao.character.xie_yi',
];

const stage = async () => JSON.parse(await readFile(stageUrl, 'utf8'));
const runtimeOf = save => save.世界.状态.剧本模组;

function freshFixture(document) {
  return {
    角色: { 身份: { 名字: 'R2-11S来源重建' }, 位置: { 描述: '白湖商馆' }, 属性: { 声望: 0 } },
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

test('frozen ids and three append-only transitions follow the source window without duplicate axes', async () => {
  const document = await stage();
  assert.deepEqual(document.scenario.events.map(event => event.id), SOURCE_ORDER);
  assert.deepEqual(document.scenario.chapters[0].eventIds, SOURCE_ORDER);
  assert.deepEqual(document.scenario.events.map(event => [event.id, event.axisId, event.axisSeq]), [
    ['lcq.event.s03_01', 'qingyu.20.2', 36],
    ['lcq.event.debut_ningyu', undefined, undefined],
    ['lcq.event.s03_02', 'qingyu.21.1', 37],
    ['lcq.event.s03_03', 'qingyu.23.1', 38],
    ['lcq.event.s03_04', 'qingyu.25.1', 40],
    ['lcq.event.s03_05', 'qingyu.26.1', 42],
    ['lcq.event.s03_06', 'qingyu.31.2', 47],
    ['lcq.event.s03_07', 'qingyu.32.2', 50],
    ['lcq.event.s03_08', 'qingyu.33.1', 51],
    ['lcq.event.s03_09', 'qingyu.35.1', 53],
    ['lcq.event.s03_10', 'qingyu.35.2', 54],
    ['lcq.event.s03_11', 'qingyu.37.2', 58],
    ['lcq.event.s03_12', 'qingyu.38.1', 59],
  ]);
  const axisIds = document.scenario.events.map(event => event.axisId).filter(Boolean);
  assert.equal(new Set(axisIds).size, axisIds.length);
  const byId = new Map(document.scenario.events.map(event => [event.id, event]));
  for (const [index, id] of SOURCE_ORDER.entries()) {
    const expected = index === 0 ? 'flags.chapter.lcq.stage_03.started' : byId.get(SOURCE_ORDER[index - 1]).completion[0].path;
    assert.equal(byId.get(id).conditions[0].path, expected, id);
  }
  assert.deepEqual(document.scenario.chapters[0].completion, [{ path: 'flags.event.s03_12.done', operator: 'eq', value: true }]);
});

test('opening stops before the wager, ice gu and southbound journey', async () => {
  const document = await stage();
  const opening = JSON.stringify({ world: document.world, opening: document.scenario.opening });
  assert.match(opening, /识破.*扣/);
  for (const marker of ['签下卖身契', '已经下冰蛊', '武二郎已答应', '已抵达蛇彝村', '蛇彝村灭门']) {
    assert.equal(opening.includes(marker), false, marker);
  }
  const all = JSON.stringify(document.scenario);
  for (const contradicted of ['在商馆揭穿苏妲己的伪装', '寻找解冰蛊的方法', '程宗扬与西门庆相识']) {
    assert.equal(all.includes(contradicted), false, contradicted);
  }
});

test('cast, affiliations and locations close over the rebuilt stage with minimal cards', async () => {
  const document = await stage();
  const requiredCharacters = new Set([
    document.scenario.opening.playerCharacterId, ...document.scenario.opening.featuredCharacterIds,
    ...document.scenario.events.flatMap(event => event.relatedCharacterIds || []),
  ]);
  assert.deepEqual(new Set(document.canon.characters.map(character => character.id)), requiredCharacters);
  const expectedAffiliations = new Map([
    ['liuchao.character.cheng_zongyang', ['liuchao.faction.bai_hu_shang_guan']],
    ['liuchao.character.su_daji', ['liuchao.faction.bai_hu_shang_guan']],
    ['liuchao.character.ning_yu', ['liuchao.faction.bai_hu_shang_guan']],
    ['liuchao.character.a_jiman_bana', ['liuchao.faction.bai_hu_shang_guan']],
    ['liuchao.character.wu_er_lang', ['liuchao.faction.bai_hu_shang_guan', 'liuchao.faction.bai_wu']],
    ['liuchao.character.xi_men_qing', []],
    ['liuchao.character.qi_yuan', ['liuchao.faction.bai_hu_shang_guan']],
    ['liuchao.character.yun_cang_feng', ['liuchao.faction.yun_shi_shang_hui']],
    ['liuchao.character.xie_yi', []],
  ]);
  for (const character of document.canon.characters) {
    assert.deepEqual(character.affiliations.map(item => item.factionId), expectedAffiliations.get(character.id), character.id);
    assert.deepEqual(Object.keys(character.profile), ['origin'], character.id);
    for (const field of ['realm', 'skillIds', 'techniqueIds', 'itemIds']) assert.equal(field in character, false, `${character.id}:${field}`);
  }
  assert.deepEqual(document.canon.locations.map(location => location.id), [
    'liuchao.location.baihu_shang_guan', 'liuchao.location.wuyuan',
    'lcq.location.nanhuang_route', 'lcq.location.sheyi_village',
  ]);
});

test('build-time and runtime time gates prevent later identities from entering the opening prompt', async () => {
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
  const prompt = buildScenarioStoryPrompt(save, '我观察苏妲己、凝羽、祁远和谢艺');
  const focused = prompt.match(/## 当前相关人物正典约束（防 OOC）[\s\S]*?(?=\n【人物正典优先级】)/)?.[0] || '';
  for (const name of ['苏妲己', '凝羽', '祁远', '谢艺']) assert.match(focused, new RegExp(name));
  for (const marker of ['盘江程氏', '程氏商会', '黑魔海', '御姬奴', '凝奴', '太一经', '星月湖大营', '少校', '龙雕弓']) {
    assert.equal(focused.includes(marker), false, marker);
  }
});

test('thirteen hand-authored contracts replay to the snake village and survive JSON reload', async () => {
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
  for (let guard = 0; guard < 96; guard += 1) {
    const actions = getCurrentStoryEventActions(save);
    if (!actions.length) break;
    const result = recordStoryEventStructuredAction(save, actions[0]);
    if (result.completed) completed.push(actions[0].eventId);
    save = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  }
  assert.deepEqual(completed, SOURCE_ORDER);
  assert.deepEqual(runtimeOf(save).completedChapterIds, ['lcq.chapter.stage_03']);
  assert.deepEqual(runtimeOf(save).offscreenResolvedEventIds, []);
  const left = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  const right = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  assert.equal(JSON.stringify(right), JSON.stringify(left));
});

test('append-only ids are registered while the rebuilt stage remains quarantined', async () => {
  const saveContract = JSON.parse(await readFile(saveContractUrl, 'utf8')).stages[STAGE_ID];
  for (const id of ['lcq.event.s03_10', 'lcq.event.s03_11', 'lcq.event.s03_12']) {
    assert.equal(saveContract.eventIds.includes(id), true, id);
    assert.deepEqual(saveContract.eventFlagPaths[id], [`flags.event.${id.split('.').at(-1)}.done`], id);
  }
  assert.deepEqual(saveContract.chapterFlagPaths['lcq.chapter.stage_03'], ['flags.event.s03_12.done']);
  const { isDefaultLineQuarantinedStageId } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  assert.equal(isDefaultLineQuarantinedStageId(STAGE_ID), true);
});
