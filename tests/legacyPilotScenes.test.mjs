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

test('s01_06 and incomplete scene contracts fail closed', async () => {
  const {
    acceptLegacyPilotScene,
    isLegacyPilotEventId,
    LEGACY_NARRATIVE_PILOT_EVENT_IDS,
  } = await loadTs('../src/modules/scenarioMods/legacyPilotScenes.ts');
  const { planLegacyNarrativePilot } = await loadTs('../src/modules/scenarioMods/legacyNarrativePilot.ts');
  assert.equal(isLegacyPilotEventId('lcq.event.s01_06'), false);
  assert.ok(LEGACY_NARRATIVE_PILOT_EVENT_IDS.includes('lcq.event.s01_05'));
  assert.equal(acceptLegacyPilotScene(basePacket({ eventId: 'lcq.event.s01_06', present: ['月霜'] })), false);
  assert.equal(acceptLegacyPilotScene(basePacket({
    eventId: 'lcq.event.s01_05',
    present: ['王哲'],
    mustAppear: { location: '中州·草原', present: ['王哲'], objective: '诊治' },
    receipts: { move: false, casualty: false },
  })), false);
  assert.equal(planLegacyNarrativePilot({
    saveData: {},
    eventAction: { source: 'event_engine', eventId: 'lcq.event.s01_06' },
    eventActionProvenance: 'selected',
    storage: ON,
  }), null);
});

test('each expanded scene uses its own local variants, not opening stock', async () => {
  const { composeLegacyNarrativeFromPlan } = await loadTs('../src/modules/scenarioMods/legacyRenderPlan.ts');
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

  assert.equal(acceptLegacyPilotScene(danger), true);
  assert.equal(acceptLegacyPilotScene(interact), true);
  assert.equal(acceptLegacyPilotScene(progress), true);
  assert.equal(acceptLegacyPilotScene(arrive), true);

  for (const packet of [danger, interact, progress, arrive]) {
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

test('s01_02 structured action is accepted after s01_01 settles; s01_06 is not', async () => {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction, advanceScenarioRuntime } = await loadTs(
    '../src/modules/scenarioMods/runtime.ts',
  );
  const { planLegacyNarrativePilot } = await loadTs('../src/modules/scenarioMods/legacyNarrativePilot.ts');
  const { compileLegacyNarratorPacket } = await loadTs('../src/modules/scenarioMods/legacyNarratorPacket.ts');
  const { acceptLegacyPilotScene } = await loadTs('../src/modules/scenarioMods/legacyPilotScenes.ts');
  const raw = await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url), 'utf8');
  let save = createQingyuOpeningPlaytestSave(parseScenarioMod(JSON.parse(raw)));
  const first = getCurrentStoryEventActions(save).find(item => item.eventId === 'lcq.event.s01_01');
  assert.ok(first);
  recordStoryEventStructuredAction(save, first);
  save = advanceScenarioRuntime(save).saveData;
  const second = getCurrentStoryEventActions(save).find(item => item.eventId === 'lcq.event.s01_02');
  assert.ok(second, 's01_02 must become selectable after s01_01');
  const plan = planLegacyNarrativePilot({
    saveData: save,
    eventAction: second,
    eventActionProvenance: 'selected',
    storage: ON,
  });
  assert.ok(plan);
  assert.equal(plan.selection.eventId, 'lcq.event.s01_02');
  const compiled = compileLegacyNarratorPacket(save, plan, 'renderGuard.forbiddenTerms=神兵', '叙述者配置', '性格');
  assert.equal(compiled.packet.receipts.casualty, true);
  assert.equal(compiled.packet.receipts.move, false);
  assert.equal(acceptLegacyPilotScene(compiled.packet), true);

  const sixth = {
    ...second,
    eventId: 'lcq.event.s01_06',
  };
  assert.equal(planLegacyNarrativePilot({
    saveData: save,
    eventAction: sixth,
    eventActionProvenance: 'selected',
    storage: ON,
  }), null);
});
