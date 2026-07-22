import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL('../src/modules/scenarioMods/builtins/data/lyl.lin_an_black_sea.json', import.meta.url);
const STAGE_ID = 'lyl.lin_an_black_sea';

const SOURCE_ORDER = [
  'lyl.event.debut_ruan_sisters',
  'liuchao.event.wei_yuan_first_contact',
  'lyl.event.ruan_xiangning_secret',
  'liuchao.event.lin_chong_confront',
  'lyl.event.mingqingsi_encounter',
  'liuchao.event.gather_intel',
  'liuchao.event.factory_registration',
  'liuchao.event.xue_sun_meeting',
  'liuchao.event.cold_poison_mystery',
  'lyl.event.ruan_xianglin_scheme',
  'liuchao.event.wei_yuan_crisis_deepen',
  'liuchao.event.gao_yanei_showdown',
  'liuchao.event.you_chan_meeting',
  'liuchao.event.black_sea_approach',
  'liuchao.event.final_preparations',
];

async function stage() {
  return JSON.parse(await readFile(stageUrl, 'utf8'));
}

function freshFixture(document) {
  return {
    角色: { 身份: { 名字: 'R2-11P临安重建' }, 位置: { 描述: '临安' }, 属性: { 声望: 0 } },
    社交: { 关系: {}, 记忆: { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] } },
    系统: { 扩展: {}, 历史: { 叙事: [] } },
    世界: {
      信息: { 世界名称: document.world.name, 地点信息: [], 势力信息: [] },
      状态: {
        剧本模组: {
          modId: document.manifest.id,
          modName: document.manifest.name,
          mode: 'strict',
          currentChapterId: document.scenario.chapters[0].id,
          chapters: structuredClone(document.scenario.chapters),
          events: structuredClone(document.scenario.events),
          flags: structuredClone(document.scenario.initialFlags),
          activeEventIds: [],
          completedEventIds: [],
          completedChapterIds: [],
          offscreenResolvedEventIds: [],
          chronicle: [],
          stallTurns: 0,
          worldTurn: 0,
          nextStageId: document.manifest.nextStageId,
          canon: structuredClone(document.canon),
        },
      },
    },
  };
}

const runtimeOf = save => save.世界.状态.剧本模组;

test('the frozen legacy ids now form one source-ordered chain over chapters 6–8 only', async () => {
  const document = await stage();
  assert.deepEqual(document.scenario.events.map(event => event.id), SOURCE_ORDER);
  assert.deepEqual(document.scenario.chapters.flatMap(chapter => chapter.eventIds), SOURCE_ORDER);

  const byId = new Map(document.scenario.events.map(event => [event.id, event]));
  assert.deepEqual(
    document.scenario.events.filter(event => event.axisId).map(event => [event.id, event.axisId, event.axisSeq]),
    [
      ['lyl.event.debut_ruan_sisters', 'yunlong.6.1', 556],
      ['liuchao.event.wei_yuan_crisis_deepen', 'yunlong.8.1', 557],
      ['liuchao.event.black_sea_approach', 'yunlong.8.2', 558],
    ],
  );
  for (const [index, id] of SOURCE_ORDER.entries()) {
    const expected = index === 0 ? 'flags.chapter.arrival.started' : byId.get(SOURCE_ORDER[index - 1]).completion[0].path;
    assert.equal(byId.get(id).conditions[0].path, expected, id);
  }
});

test('future chapters and future identity reveals are absent from event and opening content', async () => {
  const document = await stage();
  const narrative = JSON.stringify({ world: document.world, opening: document.scenario.opening, events: document.scenario.events });
  for (const marker of [
    '游婵在临安与你秘密会面', '剑玉姬和西门庆已注意', '林娘子竟仍是处女',
    '阮香琳力主攀附', '小瀛洲伏击', '黑魔海退出宋国', '屠龙刀', '雷射战刀',
  ]) {
    assert.equal(narrative.includes(marker), false, marker);
  }
  assert.match(document.scenario.opening.text, /刚由钱塘门进入临安/);
  assert.match(document.scenario.events.find(event => event.id === 'liuchao.event.black_sea_approach').description, /场外插叙/);
  assert.match(document.scenario.events.find(event => event.id === 'liuchao.event.black_sea_approach').playerCompletionContract.actions[0].actionText, /程宗扬对此尚不知情/);
});

test('world, locations, factions and affiliations are limited to this stage source window', async () => {
  const document = await stage();
  assert.match(document.world.background, /各线此时尚未展开/);
  assert.deepEqual(
    new Set(document.canon.locations.map(location => location.id)),
    new Set(['liuchao.location.lin_an', 'liuchao.location.mingqing_temple', 'liuchao.location.west_lake_cottage', 'liuchao.location.jiangzhou']),
  );
  const referencedFactions = new Set([
    ...document.scenario.events.flatMap(event => event.relatedFactionIds || []),
    ...document.canon.characters.flatMap(character => (character.affiliations || []).map(affiliation => affiliation.factionId)),
  ]);
  assert.deepEqual(new Set(document.canon.factions.map(faction => faction.id)), referencedFactions);

  const liShishi = document.canon.characters.find(character => character.id === 'liuchao.character.li_shi_shi');
  assert.deepEqual(liShishi.affiliations.map(affiliation => affiliation.factionId), [
    'liuchao.faction.guang_ming_guan_tang', 'liuchao.faction.wei_yuan_escort',
  ]);
  const gao = document.canon.characters.find(character => character.id === 'liuchao.character.gao_zhishang');
  assert.deepEqual(gao.affiliations.map(affiliation => affiliation.factionId), ['liuchao.faction.tai_wei_fu']);
});

test('the stage cast is exact and the unrevealed aunt uses a minimal time-gated projection', async () => {
  const document = await stage();
  const required = new Set([
    document.scenario.opening.playerCharacterId,
    ...document.scenario.opening.featuredCharacterIds,
    ...document.scenario.events.flatMap(event => event.relatedCharacterIds || []),
  ]);
  assert.deepEqual(new Set(document.canon.characters.map(character => character.id)), required);

  const aunt = document.canon.characters.find(character => character.id === 'liuchao.character.ruan_xiang_ning');
  assert.equal(aunt.name, '凝姨');
  assert.deepEqual(Object.keys(aunt).sort(), ['affiliations', 'description', 'gender', 'id', 'locationId', 'name', 'profile', 'role']);
  assert.deepEqual(Object.keys(aunt.profile), ['origin']);
  const auntText = JSON.stringify(aunt);
  for (const marker of ['阮香凝', '林冲之妻', '黑魔海', '玉姬', '御姬', '鼎炉', '处女']) {
    assert.equal(auntText.includes(marker), false, marker);
  }

  const feng = document.canon.characters.find(character => character.id === 'liuchao.character.feng_yuan');
  assert.equal(feng.name, '冯源');
  assert.equal('realm' in feng, false);
  assert.equal('skillIds' in feng, false);
  assert.equal(document.canon.playerRelationships.some(relationship =>
    /雷峰塔|吏部调走档案|西湖农居会面/.test(JSON.stringify(relationship))), false);
  assert.equal(document.canon.relationships.some(relationship =>
    relationship.fromCharacterId === aunt.id || relationship.toCharacterId === aunt.id), false);

  const { resolveScenarioCharacters } = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
  const materializedAunt = structuredClone(aunt);
  assert.equal(resolveScenarioCharacters([materializedAunt], STAGE_ID), 0);
  assert.deepEqual(materializedAunt, aunt);
});

test('all fifteen beats use hand-authored contracts and the whole stage replays to completion', async () => {
  const document = await stage();
  for (const event of document.scenario.events) {
    assert.equal(event.playerCompletionContract?.kind, 'objective_action', event.id);
    assert.deepEqual(event.playerCompletionContract.settleOn, ['success'], event.id);
    assert.equal(event.playerCompletionContract.actions.some(action => action.id === 'advance_declared_objective'), false, event.id);
  }

  const { advanceScenarioRuntime, getCurrentStoryEventActions, recordStoryEventStructuredAction } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');
  let save = advanceScenarioRuntime(freshFixture(document)).saveData;
  const completionOrder = [];
  for (let guard = 0; guard < 96; guard += 1) {
    const actions = getCurrentStoryEventActions(save);
    if (!actions.length) break;
    const result = recordStoryEventStructuredAction(save, actions[0]);
    if (result.completed) completionOrder.push(actions[0].eventId);
    save = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  }
  assert.deepEqual(completionOrder, SOURCE_ORDER);
  assert.deepEqual(runtimeOf(save).completedChapterIds, document.scenario.chapters.map(chapter => chapter.id));
  assert.deepEqual(runtimeOf(save).offscreenResolvedEventIds, []);

  const left = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  const right = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  assert.equal(JSON.stringify(right), JSON.stringify(left));
});

test('the stage remains quarantined after source rebuild', async () => {
  const { isDefaultLineQuarantinedStageId } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  assert.equal(isDefaultLineQuarantinedStageId(STAGE_ID), true);
});
