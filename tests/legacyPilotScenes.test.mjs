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
  assert.equal(acceptLegacyPilotScene(basePacket({ eventId: 'lcq.event.s02_03', present: ['月霜'] })), false);
  assert.equal(planLegacyNarrativePilot({
    saveData: {},
    eventAction: { source: 'event_engine', eventId: 'lcq.event.s02_01' },
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

  assert.equal(acceptLegacyPilotScene(danger), true);
  assert.equal(acceptLegacyPilotScene(interact), true);
  assert.equal(acceptLegacyPilotScene(progress), true);
  assert.equal(acceptLegacyPilotScene(arrive), true);
  assert.equal(acceptLegacyPilotScene(frost), true);
  assert.equal(acceptLegacyPilotScene(mandate), true);

  for (const packet of [danger, interact, progress, arrive, frost, mandate]) {
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
