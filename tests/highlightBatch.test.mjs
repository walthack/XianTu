import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const stageFiles = [
  '../src/modules/scenarioMods/builtins/data/lcq.stage_02.json',
  '../src/modules/scenarioMods/builtins/data/lcq.stage_04.json',
  '../src/modules/scenarioMods/builtins/data/lyl.lin_an_black_sea.json',
  '../src/modules/scenarioMods/builtins/data/lyg.dingtao_beijing.json',
];

const highlightContracts = {
  'lcq.event.s02_02': ['左武第一军团', '王哲', '九阳', '日轮', '阿伽门侬', '焦土'],
  'lcq.event.s04_05': ['山洪', '易虎', '千斤坠', '巨石', '洪水吞没', '他是我哥'],
  'lyl.event.mingqingsi_encounter': ['高衙内', '阮香凝', '林冲', '拳头', '水镜'],
  'lyg.event.highlight_banchao_lamb_leg': ['羊腿', '刀尖', '吉策', '九门出入记录', '田荣', '差事'],
};

async function loadHighlightEvents() {
  const events = [];
  for (const relativePath of stageFiles) {
    const raw = JSON.parse(await readFile(new URL(relativePath, import.meta.url), 'utf8'));
    events.push(...raw.scenario.events);
  }
  return new Map(events.map(event => [event.id, event]));
}

test('cross-book highlight batch keeps full contracts and deterministic completion evidence', async () => {
  const events = await loadHighlightEvents();

  for (const [eventId, expectedEvidence] of Object.entries(highlightContracts)) {
    const event = events.get(eventId);
    assert.ok(event, `missing highlight event ${eventId}`);
    assert.match(event.axisBeat, /^半预制高光：/);
    assert.deepEqual(event.completionEvidence, expectedEvidence);
    assert.ok(event.axisBeat.length > 100, `${eventId} contract was unexpectedly flattened`);
    for (const evidence of expectedEvidence) {
      assert.match(event.axisBeat, new RegExp(evidence));
    }
  }

  const dongZhuo = events.get('lyg.event.s01_07');
  assert.match(dongZhuo.axisBeat, /^半预制高光：/);
  assert.match(dongZhuo.axisBeat, /时也，命也/);
});

test('highlight batch uses explicit per-event BGM moods', async () => {
  const source = await readFile(new URL('../src/utils/musicLibrary.ts', import.meta.url), 'utf8');
  const expectations = {
    'lcq.event.s02_02': 'lament',
    'lcq.event.s04_05': 'lament',
    'lyl.event.mingqingsi_encounter': 'intrigue',
    'lyg.event.s01_07': 'lament',
    'lyg.event.highlight_banchao_lamb_leg': 'intrigue',
  };

  for (const [eventId, expectedMood] of Object.entries(expectations)) {
    const mapping = `'${eventId}': '${expectedMood}'`;
    assert.equal(source.split(mapping).length - 1, 1, `${eventId} should have one explicit ${expectedMood} mapping`);
  }
});
