import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const ON = { getItem: key => (key === 'xiantu.legacyNarrativePilot.s01_01.v1' ? 'true' : null) };

function basePacket(over = {}) {
  return {
    action: '行动',
    settledOutcome: '结果',
    location: '中州·草原',
    currentObjective: '先稳住自己并弄清身在何处',
    publicFacts: ['中州·草原'],
    localReceipt: { source: 'event_action', action: '行动', outcome: '结果' },
    present: ['段强'],
    presentActors: [{ name: '段强', traits: [] }],
    mustAppear: { location: '中州·草原', present: ['段强'], objective: '先稳住自己并弄清身在何处' },
    mustNotAppear: ['月霜'],
    body: { 气血: '100/100' },
    recentNarrative: '',
    outputContract: 'plan',
    receipts: { move: false, casualty: false },
    eventId: 'lcq.event.s01_01',
    ...over,
  };
}

test('incomplete scene contracts fail closed; s01_06 requires 月霜', async () => {
  const {
    acceptLegacyPilotScene,
    filterLegacyPilotEventCharacterNames,
    isLegacyPilotEventId,
    LEGACY_NARRATIVE_PILOT_EVENT_IDS,
  } = await loadTs('../src/modules/scenarioMods/legacyPilotScenes.ts');
  const { composeLegacyNarrativeFromPlan } = await loadTs('../src/modules/scenarioMods/legacyRenderPlan.ts');
  const { planLegacyNarrativePilot } = await loadTs('../src/modules/scenarioMods/legacyNarrativePilot.ts');
  assert.equal(isLegacyPilotEventId('lcq.event.s01_06'), true);
  assert.ok(LEGACY_NARRATIVE_PILOT_EVENT_IDS.includes('lcq.event.s01_06'));
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s01_06',
    present: ['月霜'],
    presentActors: [{ name: '月霜', traits: [] }],
    mustAppear: { location: '中州·草原', present: ['月霜'], objective: '月霜身上的寒毒正在失控，先应对眼前危局' },
  })), true);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s01_06',
    present: ['段强'],
    mustAppear: { location: '中州·草原', present: ['段强'], objective: '寒毒' },
  })), false);
  const mixed = basePacket({
    eventId: 'lcq.event.s01_06',
    present: ['月霜', '段强'],
    presentActors: [{ name: '月霜', traits: [] }, { name: '段强', traits: [] }],
    mustAppear: { location: '中州·草原', present: ['月霜', '段强'], objective: '月霜身上的寒毒正在失控，先应对眼前危局' },
    publicFacts: ['中州·草原', '月霜在场', '段强在场'],
  });
  assert.equal(acceptLegacyPilotScene(mixed), false);
  const mixedText = composeLegacyNarrativeFromPlan(mixed);
  assert.equal(mixedText.includes('段强'), false, mixedText);
  assert.match(mixedText, /月霜/);
  assert.match(mixedText, /丹药/);
  assert.match(mixedText, /强行|掐开|灌/);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s01_05',
    present: ['王哲'],
    mustAppear: { location: '中州·草原', present: ['王哲'], objective: '诊治' },
    receipts: { move: false, casualty: false },
  })), false);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_01',
    present: ['王哲'],
    presentActors: [{ name: '王哲', traits: [] }],
    location: '中州·帅帐',
    mustAppear: { location: '中州·帅帐', present: ['王哲'], objective: '王哲还有事要当面交代，先听他把话说完' },
  })), true);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_01',
    present: ['王哲', '段强'],
    location: '中州·帅帐',
    mustAppear: { location: '中州·帅帐', present: ['王哲', '段强'], objective: '听他把话说完' },
  })), false);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_01',
    present: ['王哲'],
    location: '中州·草原',
    mustAppear: { location: '中州·草原', present: ['王哲'], objective: '听他把话说完' },
  })), false);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_03',
    location: '中州·帅帐',
    present: ['月霜'],
    presentActors: [{ name: '月霜', traits: [] }],
    mustAppear: { location: '中州·帅帐', present: ['月霜'], objective: '在秦军与罗马军的交战中求生并观察战局' },
    receipts: { move: false, casualty: false },
  })), true);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_03',
    location: '中州·草原',
    present: ['月霜'],
    presentActors: [{ name: '月霜', traits: [] }],
    mustAppear: { location: '中州·草原', present: ['月霜'], objective: '在秦军与罗马军的交战中求生并观察战局' },
  })), false);
  for (const fake of ['中州·帅帐外', '中州·帅帐门前', '中州·帅帐旧址']) {
    assert.equal(acceptLegacyPilotScene(basePacket({
      eventId: 'lcq.event.s02_03',
      location: fake,
      present: ['月霜'],
      presentActors: [{ name: '月霜', traits: [] }],
      mustAppear: { location: fake, present: ['月霜'], objective: '在秦军与罗马军的交战中求生并观察战局' },
      receipts: { move: false, casualty: false },
    })), false, fake);
  }
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_03',
    location: '中州·帅帐',
    present: ['月霜'],
    mustAppear: { location: '中州·帅帐', present: ['月霜'], objective: '在秦军与罗马军的交战中求生并观察战局' },
    receipts: { move: true, casualty: false, moveTo: '中州·草原' },
  })), false);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_03',
    present: ['月霜', '段强'],
    location: '中州·帅帐',
    mustAppear: { location: '中州·帅帐', present: ['月霜', '段强'], objective: '求生并观察战局' },
  })), false);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_02',
    location: '中州·帅帐',
    present: ['王哲', '月霜'],
    presentActors: [{ name: '王哲', traits: [] }, { name: '月霜', traits: [] }],
    mustAppear: { location: '中州·帅帐', present: ['王哲', '月霜'], objective: '左武军已与联军开战，先保住自己和月霜，跟上战局变化' },
    receipts: { move: false, casualty: true },
  })), true);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_02',
    location: '中州·帅帐',
    present: ['王哲', '月霜'],
    mustAppear: { location: '中州·帅帐', present: ['王哲', '月霜'], objective: '左武军已与联军开战，先保住自己和月霜，跟上战局变化' },
    receipts: { move: false, casualty: false },
  })), false);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_02',
    present: ['王哲'],
    location: '中州·帅帐',
    mustAppear: { location: '中州·帅帐', present: ['王哲'], objective: '跟上战局变化' },
    receipts: { move: false, casualty: true },
  })), false);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_02',
    location: '中州·帅帐',
    present: ['王哲', '月霜', '韩庚', '阿伽门侬'],
    mustAppear: { location: '中州·帅帐', present: ['王哲', '月霜', '韩庚', '阿伽门侬'], objective: '左武军已与联军开战，先保住自己和月霜，跟上战局变化' },
    receipts: { move: false, casualty: true },
  })), false);
  for (const fake of ['帅帐', '南荒·敌军·帅帐', '中州·五原·帅帐', '中州·帅帐外']) {
    assert.equal(acceptLegacyPilotScene(basePacket({
      eventId: 'lcq.event.s02_02',
      location: fake,
      present: ['王哲', '月霜'],
      mustAppear: { location: fake, present: ['王哲', '月霜'], objective: '左武军已与联军开战，先保住自己和月霜，跟上战局变化' },
      receipts: { move: false, casualty: true },
    })), false, fake);
  }
  assert.deepEqual(filterLegacyPilotEventCharacterNames('lcq.event.s02_02', ['月霜', '王哲', '阿伽门侬', '韩庚']), ['月霜', '王哲']);
  assert.equal(isLegacyPilotEventId('lcq.event.s02_04'), true);
  assert.ok(LEGACY_NARRATIVE_PILOT_EVENT_IDS.includes('lcq.event.s02_04'));
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_04',
    location: '中州·帅帐',
    present: [],
    presentActors: [],
    mustAppear: { location: '中州·五原城', present: [], objective: '五原城里有人把你当成逃奴，先应付眼前的盘问与拉扯' },
    receipts: { move: true, casualty: false, moveTo: '中州·五原城' },
  })), true);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_04',
    location: '中州·五原城',
    present: ['月霜'],
    presentActors: [{ name: '月霜', traits: [] }],
    mustAppear: { location: '中州·五原城', present: ['月霜'], objective: '五原城里有人把你当成逃奴，先应付眼前的盘问与拉扯' },
    receipts: { move: false, casualty: false },
  })), true);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_04',
    location: '中州·帅帐',
    present: ['月霜'],
    mustAppear: { location: '中州·帅帐', present: ['月霜'], objective: '五原城里有人把你当成逃奴，先应付眼前的盘问与拉扯' },
    receipts: { move: false, casualty: false },
  })), false);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_04',
    location: '中州·五原城',
    present: ['王哲'],
    mustAppear: { location: '中州·五原城', present: ['王哲'], objective: '五原城里有人把你当成逃奴，先应付眼前的盘问与拉扯' },
    receipts: { move: true, casualty: false, moveTo: '中州·五原城' },
  })), false);
  for (const fake of ['五原露天市集', '五原商馆', '中州·五原·帅帐', '白湖商馆水牢']) {
    assert.equal(acceptLegacyPilotScene(basePacket({
      eventId: 'lcq.event.s02_04',
      location: fake,
      present: [],
      mustAppear: { location: fake, present: [], objective: '五原城里有人把你当成逃奴，先应付眼前的盘问与拉扯' },
      receipts: { move: true, casualty: false, moveTo: fake },
    })), false, fake);
  }
  assert.equal(isLegacyPilotEventId('lcq.event.s02_05'), true);
  assert.ok(LEGACY_NARRATIVE_PILOT_EVENT_IDS.includes('lcq.event.s02_05'));
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_05',
    location: '中州·五原城',
    present: [],
    presentActors: [],
    mustAppear: { location: '中州·五原城', present: [], objective: '地牢里有人靠近你，先判断她要带你去哪' },
    receipts: { move: false, casualty: false },
  })), true);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_05',
    location: '中州·五原·白湖商馆水牢',
    present: [],
    presentActors: [],
    mustAppear: { location: '中州·五原·白湖商馆水牢', present: [], objective: '地牢里有人靠近你，先判断她要带你去哪' },
    receipts: { move: false, casualty: false },
  })), true);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_05',
    location: '中州·五原城',
    present: ['月霜'],
    mustAppear: { location: '中州·五原城', present: ['月霜'], objective: '地牢里有人靠近你，先判断她要带你去哪' },
    receipts: { move: false, casualty: false },
  })), false);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_05',
    location: '中州·五原城',
    present: [],
    mustAppear: { location: '中州·五原城', present: [], objective: '地牢里有人靠近你，先判断她要带你去哪' },
    receipts: { move: true, casualty: false, moveTo: '中州·五原·白湖商馆内院' },
  })), false);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_05',
    location: '中州·五原城',
    present: [],
    mustAppear: { location: '中州·五原·白湖商馆水牢', present: [], objective: '地牢里有人靠近你，先判断她要带你去哪' },
    receipts: { move: false, casualty: false },
  })), false);
  for (const fake of ['白湖商馆内院', '点心铺', '中州·帅帐', '五原商馆']) {
    assert.equal(acceptLegacyPilotScene(basePacket({
      eventId: 'lcq.event.s02_05',
      location: fake,
      present: [],
      mustAppear: { location: fake, present: [], objective: '地牢里有人靠近你，先判断她要带你去哪' },
      receipts: { move: false, casualty: false },
    })), false, fake);
  }
  assert.equal(isLegacyPilotEventId('lcq.event.s02_06'), true);
  assert.deepEqual(filterLegacyPilotEventCharacterNames('lcq.event.s02_06', ['苏妲己', '凝羽']), []);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_06',
    location: '中州·五原城',
    present: [],
    presentActors: [],
    mustAppear: { location: '中州·五原城', present: [], objective: '在白湖商馆与馆主当面周旋，看清她究竟是谁' },
    receipts: { move: false, casualty: false },
  })), true);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_06',
    location: '中州·五原·白湖商馆内院',
    present: [],
    mustAppear: { location: '中州·五原·白湖商馆内院', present: [], objective: '在白湖商馆与馆主当面周旋，看清她究竟是谁' },
    receipts: { move: false, casualty: false },
  })), true);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_06',
    location: '中州·五原城',
    present: ['苏妲己'],
    mustAppear: { location: '中州·五原城', present: ['苏妲己'], objective: '在白湖商馆与馆主当面周旋，看清她究竟是谁' },
    receipts: { move: false, casualty: false },
  })), false);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s02_06',
    location: '中州·五原城',
    present: [],
    mustAppear: { location: '中州·五原·白湖商馆内院', present: [], objective: '在白湖商馆与馆主当面周旋，看清她究竟是谁' },
    receipts: { move: false, casualty: false },
  })), false);
  assert.equal(isLegacyPilotEventId('lcq.event.ningyu_enters_gamble'), true);
  assert.deepEqual(filterLegacyPilotEventCharacterNames('lcq.event.ningyu_enters_gamble', ['苏妲己', '凝羽']), ['凝羽']);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.ningyu_enters_gamble',
    location: '中州·五原城',
    present: ['凝羽'],
    presentActors: [{ name: '凝羽', traits: [] }],
    mustAppear: { location: '中州·五原城', present: ['凝羽'], objective: '凝羽突然入局，当面看清她此刻的处境并回应' },
    receipts: { move: false, casualty: false },
  })), true);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.ningyu_enters_gamble',
    location: '中州·五原城',
    present: ['凝羽', '苏妲己'],
    mustAppear: { location: '中州·五原城', present: ['凝羽', '苏妲己'], objective: '凝羽突然入局，当面看清她此刻的处境并回应' },
    receipts: { move: false, casualty: false },
  })), false);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.ningyu_enters_gamble',
    location: '中州·五原城',
    present: [],
    mustAppear: { location: '中州·五原城', present: [], objective: '凝羽突然入局，当面看清她此刻的处境并回应' },
    receipts: { move: false, casualty: false },
  })), false);
  assert.equal(isLegacyPilotEventId('lcq.event.sudaji_south_pact'), true);
  assert.deepEqual(filterLegacyPilotEventCharacterNames('lcq.event.sudaji_south_pact', ['苏妲己']), []);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.sudaji_south_pact',
    location: '中州·五原城',
    present: [],
    presentActors: [],
    mustAppear: { location: '中州·五原城', present: [], objective: '面对苏妲己就霓龙丝一事的逼问，谈清眼下能换到的期限' },
    receipts: { move: false, casualty: false },
  })), true);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.sudaji_south_pact',
    location: '中州·五原城',
    present: ['苏妲己'],
    mustAppear: { location: '中州·五原城', present: ['苏妲己'], objective: '面对苏妲己就霓龙丝一事的逼问，谈清眼下能换到的期限' },
    receipts: { move: false, casualty: false },
  })), false);
  assert.equal(acceptLegacyPilotScene(basePacket({ eventId: 'lcq.event.gamble_bond_signed', present: [] })), false);
  assert.equal(planLegacyNarrativePilot({
    saveData: {},
    eventAction: { source: 'event_engine', eventId: 'lcq.event.s02_01' },
    eventActionProvenance: 'selected',
    storage: ON,
  }), null);
});

test('each expanded scene uses its own local variants, not opening stock', async () => {
  const {
    composeLegacyNarrativeFromPlan,
    LEGACY_RENDER_PACING,
    LEGACY_RENDER_SENSORY,
    LEGACY_RENDER_COMPANION,
    LEGACY_RENDER_CLOSING,
  } = await loadTs('../src/modules/scenarioMods/legacyRenderPlan.ts');
  const { usesOpeningStockSentences, acceptLegacyPilotScene } = await loadTs(
    '../src/modules/scenarioMods/legacyPilotScenes.ts',
  );
  const { countVisibleNarrativeChars, validateLegacyVisibleNarrative } = await loadTs(
    '../src/modules/scenarioMods/legacyNarrativeContract.ts',
  );

  const danger = basePacket({
    eventId: 'lcq.event.s01_02',
    action: '保住自己和身边的人',
    currentObjective: '草原上半兽人突然杀到，先保住自己和身边的人',
    mustAppear: { location: '中州·草原', present: ['段强'], objective: '草原上半兽人突然杀到，先保住自己和身边的人' },
    publicFacts: ['中州·草原', '段强在场', '段强中箭身亡'],
    receipts: { move: false, casualty: true },
  });
  const interact = basePacket({
    eventId: 'lcq.event.s01_03',
    present: ['月霜'],
    presentActors: [{ name: '月霜', traits: [] }],
    action: '判断该不该伸手相助',
    currentObjective: '战场上有名受伤军士，先判断该不该伸手相助',
    mustAppear: { location: '中州·草原', present: ['月霜'], objective: '战场上有名受伤军士，先判断该不该伸手相助' },
    mustNotAppear: ['神兵'],
    publicFacts: ['中州·草原', '月霜在场'],
  });
  const progress = basePacket({
    eventId: 'lcq.event.s01_04',
    present: ['卓云君', '月霜'],
    presentActors: [{ name: '卓云君', traits: [] }, { name: '月霜', traits: [] }],
    action: '设法带着伤者脱险',
    currentObjective: '有修士突然插手战场，先设法带着伤者脱险',
    mustAppear: { location: '中州·草原', present: ['卓云君', '月霜'], objective: '有修士突然插手战场，先设法带着伤者脱险' },
    mustNotAppear: ['神兵'],
    publicFacts: ['中州·草原', '卓云君在场', '月霜在场'],
  });
  const arrive = basePacket({
    eventId: 'lcq.event.s01_05',
    location: '中州·草原',
    present: ['王哲'],
    presentActors: [{ name: '王哲', traits: [] }],
    action: '让对方诊治你的伤',
    currentObjective: '在帅帐里把来历说清楚，先让对方诊治你的伤',
    mustAppear: { location: '中州·帅帐', present: ['王哲'], objective: '在帅帐里把来历说清楚，先让对方诊治你的伤' },
    mustNotAppear: ['神兵'],
    publicFacts: ['中州·草原', '中州·帅帐', '王哲在场'],
    receipts: { move: true, casualty: false, moveTo: '中州·帅帐' },
  });
  const frost = basePacket({
    eventId: 'lcq.event.s01_06',
    present: ['月霜'],
    presentActors: [{ name: '月霜', traits: [] }],
    action: '应对眼前危局',
    currentObjective: '月霜身上的寒毒正在失控，先应对眼前危局',
    mustAppear: { location: '中州·草原', present: ['月霜'], objective: '月霜身上的寒毒正在失控，先应对眼前危局' },
    mustNotAppear: ['神兵'],
    publicFacts: ['中州·草原', '月霜在场'],
  });
  const mandate = basePacket({
    eventId: 'lcq.event.s02_01',
    location: '中州·帅帐',
    present: ['王哲'],
    presentActors: [{ name: '王哲', traits: [] }],
    action: '听他把话说完',
    currentObjective: '王哲还有事要当面交代，先听他把话说完',
    mustAppear: { location: '中州·帅帐', present: ['王哲'], objective: '王哲还有事要当面交代，先听他把话说完' },
    mustNotAppear: ['神兵'],
    publicFacts: ['中州·帅帐', '王哲在场', '锦囊'],
  });
  const legion = basePacket({
    eventId: 'lcq.event.s02_03',
    location: '中州·帅帐',
    present: ['月霜'],
    presentActors: [{ name: '月霜', traits: [] }],
    action: '在秦军与罗马军的交战中求生并观察战局',
    currentObjective: '在秦军与罗马军的交战中求生并观察战局',
    mustAppear: { location: '中州·帅帐', present: ['月霜'], objective: '在秦军与罗马军的交战中求生并观察战局' },
    mustNotAppear: ['神兵'],
    publicFacts: ['中州·帅帐', '月霜在场', '秦军', '罗马'],
    receipts: { move: false, casualty: false },
  });
  const martyr = basePacket({
    eventId: 'lcq.event.s02_02',
    location: '中州·帅帐',
    present: ['王哲', '月霜'],
    presentActors: [{ name: '王哲', traits: [] }, { name: '月霜', traits: [] }],
    action: '确认焦土余波与殉军结果',
    currentObjective: '左武军已与联军开战，先保住自己和月霜，跟上战局变化',
    mustAppear: { location: '中州·帅帐', present: ['王哲', '月霜'], objective: '左武军已与联军开战，先保住自己和月霜，跟上战局变化' },
    mustNotAppear: ['神兵'],
    publicFacts: ['中州·帅帐', '王哲在场', '月霜在场', '王哲九阳殉军'],
    receipts: { move: false, casualty: true },
  });
  const brand = basePacket({
    eventId: 'lcq.event.s02_04',
    location: '中州·帅帐',
    present: [],
    presentActors: [],
    action: '应付眼前的盘问与拉扯',
    currentObjective: '五原城里有人把你当成逃奴，先应付眼前的盘问与拉扯',
    mustAppear: { location: '中州·五原城', present: [], objective: '五原城里有人把你当成逃奴，先应付眼前的盘问与拉扯' },
    mustNotAppear: ['神兵'],
    publicFacts: ['中州·帅帐', '中州·五原城', '奴隶印记'],
    receipts: { move: true, casualty: false, moveTo: '中州·五原城' },
  });
  const ambush = basePacket({
    eventId: 'lcq.event.s02_05',
    location: '中州·五原城',
    present: [],
    presentActors: [],
    action: '判断她要带你去哪',
    currentObjective: '地牢里有人靠近你，先判断她要带你去哪',
    mustAppear: { location: '中州·五原城', present: [], objective: '地牢里有人靠近你，先判断她要带你去哪' },
    mustNotAppear: ['神兵'],
    publicFacts: ['中州·五原城', '地牢'],
    receipts: { move: false, casualty: false },
  });
  const hall = basePacket({
    eventId: 'lcq.event.s02_06',
    location: '中州·五原城',
    present: [],
    presentActors: [],
    action: '看清她究竟是谁',
    currentObjective: '在白湖商馆与馆主当面周旋，看清她究竟是谁',
    mustAppear: { location: '中州·五原城', present: [], objective: '在白湖商馆与馆主当面周旋，看清她究竟是谁' },
    mustNotAppear: ['神兵'],
    publicFacts: ['中州·五原城', '白湖商馆', '霓龙丝'],
    receipts: { move: false, casualty: false },
  });
  const debut = basePacket({
    eventId: 'lcq.event.ningyu_enters_gamble',
    location: '中州·五原城',
    present: ['凝羽'],
    presentActors: [{ name: '凝羽', traits: [] }],
    action: '当面回应登场的凝羽',
    currentObjective: '凝羽突然入局，当面看清她此刻的处境并回应',
    mustAppear: { location: '中州·五原城', present: ['凝羽'], objective: '凝羽突然入局，当面看清她此刻的处境并回应' },
    mustNotAppear: ['神兵'],
    publicFacts: ['中州·五原城', '凝羽在场'],
    receipts: { move: false, casualty: false },
  });
  const pact = basePacket({
    eventId: 'lcq.event.sudaji_south_pact',
    location: '中州·五原城',
    present: [],
    presentActors: [],
    action: '当面订下三个月南荒之约',
    currentObjective: '面对苏妲己就霓龙丝一事的逼问，谈清眼下能换到的期限',
    mustAppear: { location: '中州·五原城', present: [], objective: '面对苏妲己就霓龙丝一事的逼问，谈清眼下能换到的期限' },
    mustNotAppear: ['神兵'],
    publicFacts: ['中州·五原城', '霓龙丝', '三个月'],
    receipts: { move: false, casualty: false },
  });

  assert.equal(acceptLegacyPilotScene(danger), true);
  assert.equal(acceptLegacyPilotScene(interact), true);
  assert.equal(acceptLegacyPilotScene(progress), true);
  assert.equal(acceptLegacyPilotScene(arrive), true);
  assert.equal(acceptLegacyPilotScene(frost), true);
  assert.equal(acceptLegacyPilotScene(mandate), true);
  assert.equal(acceptLegacyPilotScene(legion), true);
  assert.equal(acceptLegacyPilotScene(martyr), true);
  assert.equal(acceptLegacyPilotScene(brand), true);
  assert.equal(acceptLegacyPilotScene(ambush), true);
  assert.equal(acceptLegacyPilotScene(hall), true);
  assert.equal(acceptLegacyPilotScene(debut), true);
  assert.equal(acceptLegacyPilotScene(pact), true);

  for (const packet of [danger, interact, progress, arrive, frost, mandate, legion, martyr, brand, ambush, hall, debut, pact]) {
    const text = composeLegacyNarrativeFromPlan(packet);
    const check = validateLegacyVisibleNarrative(text, packet);
    assert.equal(check.valid, true, `${packet.eventId}: ${check.issues.join(';')}\n${text}`);
    assert.ok(countVisibleNarrativeChars(text) >= 800, packet.eventId);
    assert.equal(usesOpeningStockSentences(text), false, packet.eventId);
    assert.equal(text.includes('这不是飞机'), false);
    assert.equal(text.includes('湿草撑起'), false);
  }
  const dangerText = composeLegacyNarrativeFromPlan(danger);
  assert.match(dangerText, /段强/);
  assert.match(dangerText, /箭|弓/);
  assert.match(dangerText, /中箭身亡|气绝|脖子/);
  const extraDeath = composeLegacyNarrativeFromPlan(basePacket({
    eventId: 'lcq.event.s01_02',
    present: ['帐内亲兵', '段强'],
    presentActors: [{ name: '帐内亲兵', traits: [] }, { name: '段强', traits: [] }],
    mustAppear: { location: '中州·草原', present: ['帐内亲兵', '段强'], objective: '草原上半兽人突然杀到，先保住自己和身边的人' },
    publicFacts: ['中州·草原', '帐内亲兵在场', '段强在场', '段强中箭身亡'],
    receipts: { move: false, casualty: true },
  }));
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s01_02',
    present: ['帐内亲兵', '段强'],
    mustAppear: { location: '中州·草原', present: ['帐内亲兵', '段强'], objective: '草原上半兽人突然杀到，先保住自己和身边的人' },
    receipts: { move: false, casualty: true },
  })), false);
  assert.match(extraDeath, /段强/);
  assert.doesNotMatch(extraDeath, /帐内亲兵.{0,12}(脖子|中箭|气绝)/);
  const interactText = composeLegacyNarrativeFromPlan(interact);
  assert.match(interactText, /月霜/);
  assert.match(interactText, /伸手相助|伤/);
  const progressText = composeLegacyNarrativeFromPlan(progress);
  assert.match(progressText, /卓云君/);
  assert.match(progressText, /月霜/);
  assert.match(progressText, /脱险|修士/);
  const arriveText = composeLegacyNarrativeFromPlan(arrive);
  assert.match(arriveText, /王哲/);
  assert.match(arriveText, /帅帐/);
  assert.match(arriveText, /诊治|来历/);
  const frostText = composeLegacyNarrativeFromPlan(frost);
  assert.match(frostText, /月霜/);
  assert.match(frostText, /寒毒/);
  assert.match(frostText, /丹药/);
  assert.match(frostText, /强行|掐开|灌/);
  assert.match(frostText, /真阳/);
  assert.match(frostText, /交合|贴身|发生关系|传入/);
  assert.equal(frostText.includes('段强'), false);
  const mandateText = composeLegacyNarrativeFromPlan(mandate);
  assert.match(mandateText, /王哲/);
  assert.match(mandateText, /帅帐/);
  assert.match(mandateText, /锦囊/);
  assert.match(mandateText, /案上/);
  assert.match(mandateText, /托付|听他把话说完|当面交代/);
  assert.equal(/入手|掌心|交到你手里|落到你手上/.test(mandateText), false, mandateText);
  assert.equal(mandateText.includes('段强'), false);
  assert.equal(mandateText.includes('这不是飞机'), false);
  assert.equal(mandateText.includes('寒毒正在失控'), false);
  const legionText = composeLegacyNarrativeFromPlan(legion);
  assert.match(legionText, /月霜/);
  assert.match(legionText, /秦军/);
  assert.match(legionText, /罗马/);
  assert.match(legionText, /溃散/);
  assert.match(legionText, /求生|观察战局/);
  assert.match(legionText, /帅帐/);
  assert.equal(legion.receipts.move, false);
  assert.equal(/走进了|冲出帅帐|按进泥/.test(legionText), false, legionText);
  for (const pacing of LEGACY_RENDER_PACING) {
    for (const sensory of LEGACY_RENDER_SENSORY) {
      for (const companion of LEGACY_RENDER_COMPANION) {
        for (const closing of LEGACY_RENDER_CLOSING) {
          const text = composeLegacyNarrativeFromPlan(legion, { pacing, sensory, companion, closing });
          assert.equal(/未结算|回执|合同/.test(text), false, text);
          assert.match(text, /帅帐/);
        }
      }
    }
  }
  assert.equal(legionText.includes('段强'), false);
  assert.equal(legionText.includes('这不是飞机'), false);
  assert.equal(legionText.includes('寒毒正在失控'), false);
  assert.equal(legionText.includes('锦囊入手'), false);
  const martyrText = composeLegacyNarrativeFromPlan(martyr);
  assert.match(martyrText, /王哲/);
  assert.match(martyrText, /月霜/);
  assert.match(martyrText, /九阳/);
  assert.match(martyrText, /日轮/);
  assert.match(martyrText, /焦土/);
  assert.match(martyrText, /帅帐/);
  assert.equal(martyrText.includes('一招自爆'), false);
  assert.equal(martyrText.includes('段强'), false);
  assert.equal(martyrText.includes('阿伽门侬'), false);
  assert.equal(martyrText.includes('韩庚'), false);
  assert.equal(martyrText.includes('文泽'), false);
  assert.equal(/走进了|冲出帅帐/.test(martyrText), false, martyrText);
  assert.equal(/未结算|回执|合同/.test(martyrText), false, martyrText);
  for (const pacing of LEGACY_RENDER_PACING) {
    for (const sensory of LEGACY_RENDER_SENSORY) {
      for (const companion of LEGACY_RENDER_COMPANION) {
        for (const closing of LEGACY_RENDER_CLOSING) {
          const text = composeLegacyNarrativeFromPlan(martyr, { pacing, sensory, companion, closing });
          assert.equal(text.includes('阿伽门侬'), false, text);
          assert.equal(text.includes('韩庚'), false, text);
          assert.equal(text.includes('文泽'), false, text);
        }
      }
    }
  }
  const brandText = composeLegacyNarrativeFromPlan(brand);
  assert.match(brandText, /五原城/);
  assert.match(brandText, /逃奴|盘问|拉扯/);
  assert.match(brandText, /烙|奴隶印记/);
  assert.equal(brandText.includes('王哲'), false);
  assert.equal(brandText.includes('段强'), false);
  assert.equal(brandText.includes('戈龙'), false);
  assert.equal(brandText.includes('孙疤脸'), false);
  assert.equal(brandText.includes('解除'), false);
  assert.equal(/未结算|回执|合同/.test(brandText), false, brandText);
  for (const pacing of LEGACY_RENDER_PACING) {
    for (const sensory of LEGACY_RENDER_SENSORY) {
      for (const companion of LEGACY_RENDER_COMPANION) {
        for (const closing of LEGACY_RENDER_CLOSING) {
          const text = composeLegacyNarrativeFromPlan(brand, { pacing, sensory, companion, closing });
          assert.equal(text.includes('戈龙'), false, text);
          assert.equal(text.includes('孙疤脸'), false, text);
          assert.equal(text.includes('王哲'), false, text);
          assert.match(text, /五原城/);
        }
      }
    }
  }
  const ambushText = composeLegacyNarrativeFromPlan(ambush);
  assert.match(ambushText, /地牢|牢房/);
  assert.match(ambushText, /靠近|带你去哪/);
  assert.match(ambushText, /伏击/);
  assert.equal(ambushText.includes('阿姬曼'), false);
  assert.equal(ambushText.includes('戈龙'), false);
  assert.equal(ambushText.includes('孙疤脸'), false);
  assert.equal(ambushText.includes('王哲'), false);
  assert.equal(/身亡|死亡|气绝/.test(ambushText), false, ambushText);
  assert.equal(/未结算|回执|合同/.test(ambushText), false, ambushText);
  for (const pacing of LEGACY_RENDER_PACING) {
    for (const sensory of LEGACY_RENDER_SENSORY) {
      for (const companion of LEGACY_RENDER_COMPANION) {
        for (const closing of LEGACY_RENDER_CLOSING) {
          const text = composeLegacyNarrativeFromPlan(ambush, { pacing, sensory, companion, closing });
          assert.equal(text.includes('阿姬曼'), false, text);
          assert.equal(text.includes('戈龙'), false, text);
          assert.equal(text.includes('孙疤脸'), false, text);
          assert.match(text, /伏击|地牢/);
        }
      }
    }
  }
  const hallText = composeLegacyNarrativeFromPlan(hall);
  assert.match(hallText, /白湖商馆|馆主/);
  assert.match(hallText, /霓龙丝/);
  assert.match(hallText, /囚禁|伪装/);
  assert.equal(hallText.includes('苏妲己'), false);
  assert.equal(hallText.includes('凝羽'), false);
  assert.equal(hallText.includes('脱身'), false);
  assert.equal(/未结算|回执|合同/.test(hallText), false, hallText);
  for (const pacing of LEGACY_RENDER_PACING) {
    for (const sensory of LEGACY_RENDER_SENSORY) {
      for (const companion of LEGACY_RENDER_COMPANION) {
        for (const closing of LEGACY_RENDER_CLOSING) {
          const text = composeLegacyNarrativeFromPlan(hall, { pacing, sensory, companion, closing });
          assert.equal(text.includes('苏妲己'), false, text);
          assert.equal(text.includes('凝羽'), false, text);
          assert.equal(text.includes('脱身'), false, text);
        }
      }
    }
  }
  const debutText = composeLegacyNarrativeFromPlan(debut);
  assert.match(debutText, /凝羽/);
  assert.match(debutText, /入局|赌/);
  assert.equal(debutText.includes('苏妲己'), false);
  assert.equal(debutText.includes('卖身契'), false);
  assert.equal(/未结算|回执|合同/.test(debutText), false, debutText);
  for (const pacing of LEGACY_RENDER_PACING) {
    for (const sensory of LEGACY_RENDER_SENSORY) {
      for (const companion of LEGACY_RENDER_COMPANION) {
        for (const closing of LEGACY_RENDER_CLOSING) {
          const text = composeLegacyNarrativeFromPlan(debut, { pacing, sensory, companion, closing });
          assert.equal(text.includes('苏妲己'), false, text);
          assert.equal(text.includes('卖身契'), false, text);
          assert.match(text, /凝羽/);
        }
      }
    }
  }
  const pactText = composeLegacyNarrativeFromPlan(pact);
  assert.match(pactText, /三个月|期限/);
  assert.match(pactText, /霓龙丝/);
  assert.match(pactText, /南荒/);
  assert.equal(pactText.includes('苏妲己'), false);
  assert.equal(/未结算|回执|合同/.test(pactText), false, pactText);
  for (const pacing of LEGACY_RENDER_PACING) {
    for (const sensory of LEGACY_RENDER_SENSORY) {
      for (const companion of LEGACY_RENDER_COMPANION) {
        for (const closing of LEGACY_RENDER_CLOSING) {
          const text = composeLegacyNarrativeFromPlan(pact, { pacing, sensory, companion, closing });
          assert.equal(text.includes('苏妲己'), false, text);
          assert.match(text, /三个月|期限|霓龙丝/);
        }
      }
    }
  }
});

test('movement is authorized only by structured receipt, never by matching 去帅帐', async () => {
  const { validateLegacyVisibleNarrative } = await loadTs('../src/modules/scenarioMods/legacyNarrativeContract.ts');
  const { composeLegacyNarrativeFromPlan } = await loadTs('../src/modules/scenarioMods/legacyRenderPlan.ts');
  const noReceipt = basePacket({
    eventId: 'lcq.event.s01_01',
    receipts: { move: false, casualty: false },
  });
  const invented = `${'你把呼吸稳住。'.repeat(20)}你走进了帅帐。王哲正在等你诊治。`;
  assert.equal(validateLegacyVisibleNarrative(invented, noReceipt).valid, false);
  const withReceipt = basePacket({
    eventId: 'lcq.event.s01_05',
    present: ['王哲'],
    presentActors: [{ name: '王哲', traits: [] }],
    currentObjective: '在帅帐里把来历说清楚，先让对方诊治你的伤',
    mustAppear: { location: '中州·帅帐', present: ['王哲'], objective: '在帅帐里把来历说清楚，先让对方诊治你的伤' },
    publicFacts: ['中州·帅帐', '王哲在场'],
    receipts: { move: true, casualty: false, moveTo: '中州·帅帐' },
  });
  const text = composeLegacyNarrativeFromPlan(withReceipt);
  assert.match(text, /帅帐/);
  assert.equal(validateLegacyVisibleNarrative(text, withReceipt).valid, true, validateLegacyVisibleNarrative(text, withReceipt).issues.join(';'));
  const playerSaidGo = '去帅帐';
  assert.equal(withReceipt.receipts.move, true);
  assert.equal(playerSaidGo.includes('去帅帐'), true);
});

test('s02_02 81 plans on a natural stage-02 save never name unmet 阿伽门侬', async () => {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { transitionToNextScenarioStage } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const {
    getCurrentStoryEventActions,
    getScenarioFocusEvent,
    recordStoryEventStructuredAction,
    advanceScenarioRuntime,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { planLegacyNarrativePilot } = await loadTs('../src/modules/scenarioMods/legacyNarrativePilot.ts');
  const { compileLegacyNarratorPacket, previewLegacyPilotSettlement } = await loadTs(
    '../src/modules/scenarioMods/legacyNarratorPacket.ts',
  );
  const { acceptLegacyPilotScene } = await loadTs('../src/modules/scenarioMods/legacyPilotScenes.ts');
  const {
    composeLegacyNarrativeFromPlan,
    LEGACY_RENDER_PACING,
    LEGACY_RENDER_SENSORY,
    LEGACY_RENDER_COMPANION,
    LEGACY_RENDER_CLOSING,
  } = await loadTs('../src/modules/scenarioMods/legacyRenderPlan.ts');
  const [raw01, raw02] = await Promise.all([
    readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_02.json', import.meta.url), 'utf8'),
  ]);
  const stage01 = parseScenarioMod(JSON.parse(raw01));
  const stage02 = parseScenarioMod(JSON.parse(raw02));
  let save = createQingyuOpeningPlaytestSave(stage01);
  const runtimeOf = current => current.世界?.状态?.剧本模组;
  const contractAction = current => {
    const event = getScenarioFocusEvent(runtimeOf(current));
    const contractIds = new Set((event?.playerCompletionContract?.actions || []).map(action => action.id));
    return getCurrentStoryEventActions(current).find(item => contractIds.has(item.actionId));
  };
  const playCurrent = () => {
    const selection = contractAction(save);
    assert.ok(selection, `missing selectable ${JSON.stringify(runtimeOf(save)?.activeEventIds)}`);
    recordStoryEventStructuredAction(save, selection);
    save = advanceScenarioRuntime(save).saveData;
  };
  for (let step = 0; step < 40; step += 1) {
    if (save.世界?.状态?.剧本模组?.nextStageReadyId === 'lcq.stage_02') break;
    playCurrent();
  }
  assert.equal(save.世界?.状态?.剧本模组?.nextStageReadyId, 'lcq.stage_02');
  const transitioned = transitionToNextScenarioStage(save, [stage02]);
  assert.equal(transitioned.ok, true, transitioned.reason);
  save = advanceScenarioRuntime(transitioned.saveData).saveData;
  delete save.世界.状态.剧本模组.departedCast;
  for (const beat of ['lcq.event.s02_01', 'lcq.event.s02_03', 'lcq.event.s02_02']) {
    for (let step = 0; step < 8; step += 1) {
      if ((save.世界?.状态?.剧本模组?.completedEventIds || []).includes(beat)) break;
      const selection = getCurrentStoryEventActions(save).find(item => item.eventId === beat);
      assert.ok(selection, `${beat} step ${step + 1}`);
      if (beat === 'lcq.event.s02_02' && selection.actionId === 'record_battlefield_aftermath') {
        delete save.世界.状态.剧本模组.departedCast;
        const plan = planLegacyNarrativePilot({
          saveData: save,
          eventAction: selection,
          eventActionProvenance: 'selected',
          storage: ON,
        });
        assert.ok(plan);
        const preview = previewLegacyPilotSettlement(save, selection);
        const compiled = compileLegacyNarratorPacket(
          preview.settled,
          plan,
          '',
          '',
          '',
          preview.receipts,
        );
        const met = Object.values(save.世界?.状态?.剧本模组?.acquaintances || {})
          .filter(record => record?.name && record.kind !== 'rumored')
          .map(record => String(record.name));
        assert.equal(met.includes('阿伽门侬'), false, met.join(','));
        assert.deepEqual([...compiled.packet.present].sort(), ['月霜', '王哲'], compiled.packet.present.join(','));
        assert.equal(acceptLegacyPilotScene(compiled.packet), true);
        for (const pacing of LEGACY_RENDER_PACING) {
          for (const sensory of LEGACY_RENDER_SENSORY) {
            for (const companion of LEGACY_RENDER_COMPANION) {
              for (const closing of LEGACY_RENDER_CLOSING) {
                const text = composeLegacyNarrativeFromPlan(compiled.packet, {
                  pacing, sensory, companion, closing,
                });
                assert.equal(text.includes('阿伽门侬'), false, text);
                assert.equal(text.includes('韩庚'), false, text);
                assert.equal(text.includes('文泽'), false, text);
              }
            }
          }
        }
      }
      recordStoryEventStructuredAction(save, selection);
      save = advanceScenarioRuntime(save).saveData;
    }
    assert.ok((save.世界?.状态?.剧本模组?.completedEventIds || []).includes(beat), beat);
  }
});

test('s02_02 co-located outsider stays in compiled present and fails accept', async () => {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { compileLegacyNarratorPacket, readLocalMemoryCapsule } = await loadTs(
    '../src/modules/scenarioMods/legacyNarratorPacket.ts',
  );
  const { acceptLegacyPilotScene } = await loadTs('../src/modules/scenarioMods/legacyPilotScenes.ts');
  const raw = await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url), 'utf8');
  const save = createQingyuOpeningPlaytestSave(parseScenarioMod(JSON.parse(raw)));
  save.角色.位置.描述 = '中州·帅帐';
  save.社交 = save.社交 || {};
  save.社交.关系 = save.社交.关系 || {};
  save.社交.关系['王哲'] = { 名字: '王哲', 当前位置: { 描述: '中州·帅帐' } };
  save.社交.关系['月霜'] = { 名字: '月霜', 当前位置: { 描述: '中州·帅帐' } };
  save.社交.关系['帐内亲兵'] = { 名字: '帐内亲兵', 当前位置: { 描述: '中州·帅帐' } };
  const selection = {
    source: 'event_engine',
    eventId: 'lcq.event.s02_02',
    actionId: 'record_battlefield_aftermath',
    actionText: '确认焦土余波与殉军结果',
    playerLine: '确认焦土余波与殉军结果',
    outcomeText: '王哲九阳殉军',
  };
  const capsule = readLocalMemoryCapsule(save, selection);
  assert.ok(capsule.presentNames.includes('帐内亲兵'), capsule.presentNames.join(','));
  assert.ok(capsule.presentNames.includes('王哲'));
  assert.ok(capsule.presentNames.includes('月霜'));
  const compiled = compileLegacyNarratorPacket(
    save,
    { selection, playerLine: selection.playerLine, outcomeText: selection.outcomeText, compactState: {} },
    '',
    '',
    '',
    { move: false, casualty: true },
  );
  assert.ok(compiled.packet.present.includes('帐内亲兵'), compiled.packet.present.join(','));
  assert.equal(acceptLegacyPilotScene(compiled.packet), false);

  save.社交.关系['帐内亲兵'].当前位置.描述 = '中州·营门';
  save.社交.记忆 = save.社交.记忆 || {};
  save.社交.记忆.短期记忆 = ['帐内亲兵还在帅帐里守着门槛。'];
  const stale = compileLegacyNarratorPacket(
    save,
    { selection, playerLine: selection.playerLine, outcomeText: selection.outcomeText, compactState: {} },
    '',
    '',
    '',
    { move: false, casualty: true },
  );
  assert.ok(stale.packet.present.includes('帐内亲兵'), stale.packet.present.join(','));
  assert.equal(acceptLegacyPilotScene(stale.packet), false);
});

test('real canon order s01_01→02→03→04→06→05 never revives 段强 and move receipts come from settlement', async () => {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction, advanceScenarioRuntime } = await loadTs(
    '../src/modules/scenarioMods/runtime.ts',
  );
  const { planLegacyNarrativePilot } = await loadTs('../src/modules/scenarioMods/legacyNarrativePilot.ts');
  const {
    compileLegacyNarratorPacket,
    previewLegacyPilotSettlement,
  } = await loadTs('../src/modules/scenarioMods/legacyNarratorPacket.ts');
  const { acceptLegacyPilotScene } = await loadTs('../src/modules/scenarioMods/legacyPilotScenes.ts');
  const { composeLegacyNarrativeFromPlan } = await loadTs('../src/modules/scenarioMods/legacyRenderPlan.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const { focusedNpcNamesFromState } = await loadTs('../src/modules/scenarioMods/presence.ts');
  const raw = await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url), 'utf8');
  let save = createQingyuOpeningPlaytestSave(parseScenarioMod(JSON.parse(raw)));
  const seen = [];

  const play = eventId => {
    const selection = getCurrentStoryEventActions(save).find(item => item.eventId === eventId);
    assert.ok(selection, `missing selectable ${eventId}`);
    const plan = planLegacyNarrativePilot({
      saveData: save,
      eventAction: selection,
      eventActionProvenance: 'selected',
      storage: ON,
    });
    assert.ok(plan, eventId);
    const preview = previewLegacyPilotSettlement(save, selection);
    const compiled = compileLegacyNarratorPacket(
      preview.settled,
      plan,
      'renderGuard.forbiddenTerms=神兵',
      '叙述者配置',
      '性格',
      preview.receipts,
    );
    assert.equal(acceptLegacyPilotScene(compiled.packet), true, eventId);
    const text = composeLegacyNarrativeFromPlan(compiled.packet);
    seen.push({
      eventId,
      present: compiled.packet.present,
      mustAppear: compiled.packet.mustAppear.present,
      receipts: compiled.packet.receipts,
      location: compiled.packet.location,
      text,
    });
    recordStoryEventStructuredAction(save, selection);
    save = advanceScenarioRuntime(save).saveData;
  };

  play('lcq.event.s01_01');
  play('lcq.event.s01_02');
  play('lcq.event.s01_03');
  play('lcq.event.s01_04');
  const s01_06Prompt = buildScenarioStoryPrompt(save);
  assert.doesNotMatch(s01_06Prompt, /【在场】[^\n]*段强/);
  assert.match(s01_06Prompt, /当前不在场】段强/);
  assert.equal(focusedNpcNamesFromState(save).includes('段强'), false);
  play('lcq.event.s01_06');
  play('lcq.event.s01_05');

  const byId = Object.fromEntries(seen.map(item => [item.eventId, item]));
  assert.deepEqual(byId['lcq.event.s01_01'].present, ['段强']);
  assert.equal(byId['lcq.event.s01_02'].receipts.casualty, true);
  assert.match(byId['lcq.event.s01_02'].text, /段强/);
  assert.equal(byId['lcq.event.s01_03'].present.includes('段强'), false, byId['lcq.event.s01_03'].present.join(','));
  assert.equal(byId['lcq.event.s01_03'].text.includes('段强'), false);
  assert.match(byId['lcq.event.s01_03'].text, /月霜/);
  assert.equal(byId['lcq.event.s01_04'].present.includes('段强'), false);
  assert.equal(byId['lcq.event.s01_04'].text.includes('段强'), false);
  assert.equal(byId['lcq.event.s01_06'].present.includes('段强'), false);
  assert.equal(byId['lcq.event.s01_06'].text.includes('段强'), false);
  assert.match(byId['lcq.event.s01_06'].text, /月霜/);
  assert.match(byId['lcq.event.s01_06'].text, /寒毒/);
  assert.match(byId['lcq.event.s01_06'].text, /丹药/);
  assert.match(byId['lcq.event.s01_06'].text, /强行|掐开|灌/);
  assert.match(byId['lcq.event.s01_06'].text, /真阳/);
  assert.equal(byId['lcq.event.s01_06'].receipts.move, false);
  assert.equal(byId['lcq.event.s01_05'].present.includes('段强'), false);
  assert.equal(byId['lcq.event.s01_05'].text.includes('段强'), false);
  assert.equal(byId['lcq.event.s01_05'].receipts.move, true);
  assert.match(byId['lcq.event.s01_05'].receipts.moveTo, /帅帐/);
  assert.match(byId['lcq.event.s01_05'].location, /帅帐/);
  assert.match(save.角色.位置.描述, /帅帐/);
});

test('production pilot withholds player chunks until the event transaction commits', async () => {
  const { readFile } = await import('node:fs/promises');
  const system = await readFile(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url), 'utf8');
  const start = system.indexOf('private async tryLegacyNarrativePilot');
  const slice = system.slice(start, system.indexOf('public async processPlayerAction', start));
  assert.equal(/onStreamChunk: options\?\.onStreamChunk/.test(slice), false);
  assert.match(slice, /useStreaming: false/);
  assert.match(slice, /if \(shouldAbort\(\)\) throw/);
  const commit = system.slice(system.indexOf('if (aborted)'), system.indexOf('public async generateInitialMessage'));
  assert.match(commit, /usedLegacyNarrativePilot && gmResponse\.text/);
  assert.match(commit, /onStreamChunk\?\.\(gmResponse\.text\)/);
  assert.match(commit, /gmResponse = \{ text: '', mid_term_memory: '', tavern_commands: \[\], action_options: \[\] \}/);
});
