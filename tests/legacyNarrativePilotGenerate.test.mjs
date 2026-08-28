import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const ON = { getItem: key => (key === 'xiantu.legacyNarrativePilot.s01_01.v1' ? 'true' : null) };
const STORY = 'renderGuard.forbiddenTerms=神兵\nrenderGuard.reservedFutureTerms=月霜';

async function openingCompiled() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { planLegacyNarrativePilot } = await loadTs('../src/modules/scenarioMods/legacyNarrativePilot.ts');
  const { compileLegacyNarratorPacket } = await loadTs('../src/modules/scenarioMods/legacyNarratorPacket.ts');
  const raw = await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url), 'utf8');
  const save = createQingyuOpeningPlaytestSave(parseScenarioMod(JSON.parse(raw)));
  const selection = getCurrentStoryEventActions(save).find(item => item.eventId === 'lcq.event.s01_01');
  const plan = planLegacyNarrativePilot({
    saveData: save,
    eventAction: selection,
    eventActionProvenance: 'selected',
    storage: ON,
  });
  const compiled = compileLegacyNarratorPacket(save, plan, STORY, '叙述者配置', '主角性格：谨慎');
  return { ...compiled, plan };
}

test('first failed RenderPlan call retries, then local composition is shown', async () => {
  const { generateLegacyPilotNarrative } = await loadTs('../src/modules/scenarioMods/legacyNarrativePilotGenerate.ts');
  const { countVisibleNarrativeChars } = await loadTs('../src/modules/scenarioMods/legacyNarrativeContract.ts');
  const compiled = await openingCompiled();
  const calls = [];
  const displayed = [];
  const result = await generateLegacyPilotNarrative({
    playerLine: compiled.plan.playerLine,
    storyPrompt: STORY,
    packet: compiled.packet,
    maxRetries: 1,
    useStreaming: true,
    generationId: 'pilot',
    extractNarrativeText: raw => raw,
    onStreamChunk: delta => displayed.push(delta),
    generate: async ({ generationId }) => {
      calls.push(generationId);
      if (calls.length === 1) throw new Error('upstream fail');
      return '{"pacing":"slow_orient","sensory":"grass_iron","companion":"dazed","closing":"hold_ground"}';
    },
  });
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0], calls[1]);
  assert.equal(result.attempts, 2);
  assert.equal(result.retried, true);
  assert.equal(result.text, result.displayed);
  assert.ok(countVisibleNarrativeChars(result.text) >= 800);
  assert.equal(result.text.includes('神兵'), false);
  assert.ok(displayed.join('').length > 0);
});

test('maxRetries=0 does not start a second model attempt', async () => {
  const { generateLegacyPilotNarrative } = await loadTs('../src/modules/scenarioMods/legacyNarrativePilotGenerate.ts');
  const { countVisibleNarrativeChars } = await loadTs('../src/modules/scenarioMods/legacyNarrativeContract.ts');
  const compiled = await openingCompiled();
  const calls = [];
  const result = await generateLegacyPilotNarrative({
    playerLine: compiled.plan.playerLine,
    storyPrompt: STORY,
    packet: compiled.packet,
    maxRetries: 0,
    useStreaming: false,
    generationId: 'pilot',
    extractNarrativeText: raw => raw,
    generate: async ({ generationId }) => {
      calls.push(generationId);
      throw new Error('upstream fail');
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(result.attempts, 1);
  assert.equal(result.retried, false);
  assert.equal(result.usedFallback, true);
  assert.equal(result.text, result.displayed);
  assert.ok(countVisibleNarrativeChars(result.text) >= 800);
  assert.match(result.text, /段强/);
});

test('model free prose never reaches the screen', async () => {
  const { generateLegacyPilotNarrative } = await loadTs('../src/modules/scenarioMods/legacyNarrativePilotGenerate.ts');
  const { countVisibleNarrativeChars } = await loadTs('../src/modules/scenarioMods/legacyNarrativeContract.ts');
  const compiled = await openingCompiled();
  const calls = [];
  const result = await generateLegacyPilotNarrative({
    playerLine: compiled.plan.playerLine,
    storyPrompt: STORY,
    packet: compiled.packet,
    maxRetries: 0,
    useStreaming: true,
    generationId: 'pilot',
    extractNarrativeText: raw => raw,
    generate: async ({ generationId }) => {
      calls.push(generationId);
      return '你撑着湿草站起来，捡起一柄神兵，段强当场死了，随后赶往帅帐。';
    },
  });
  assert.equal(calls.length, 1);
  assert.ok(countVisibleNarrativeChars(result.text) >= 800);
  assert.equal(result.text.includes('神兵'), false);
  assert.equal(result.text.includes('当场死了'), false);
  assert.equal(result.text.includes('赶往帅帐'), false);
  assert.equal(result.text, result.displayed);
});

test('non-streaming pilot never emits chunk callbacks', async () => {
  const { generateLegacyPilotNarrative } = await loadTs('../src/modules/scenarioMods/legacyNarrativePilotGenerate.ts');
  const compiled = await openingCompiled();
  const chunks = [];
  const result = await generateLegacyPilotNarrative({
    playerLine: compiled.plan.playerLine,
    storyPrompt: STORY,
    packet: compiled.packet,
    maxRetries: Number.NaN,
    useStreaming: false,
    generationId: 'pilot',
    extractNarrativeText: raw => raw,
    onStreamChunk: chunk => chunks.push(chunk),
    generate: async () => '{"pacing":"slow_orient","sensory":"mud_body","companion":"answers","closing":"look_far"}',
  });
  assert.equal(result.attempts, 1);
  assert.equal(result.usedFallback, false);
  assert.deepEqual(chunks, []);
  assert.match(result.text, /段强/);
});

test('local wrap-up names every mustAppear person and reserves more room as the cast grows', async () => {
  const { buildLegacySafeNarrative, requiredClosureReserveChars, requiredPresentNames } = await loadTs(
    '../src/modules/scenarioMods/legacyNarrativeContract.ts',
  );
  const compiled = await openingCompiled();
  const one = structuredClone(compiled.packet);
  one.present = ['段强'];
  one.mustAppear = { ...one.mustAppear, present: ['段强'] };
  const two = structuredClone(compiled.packet);
  two.present = ['段强', '秦军斥候'];
  two.mustAppear = { ...two.mustAppear, present: ['段强', '秦军斥候'] };
  const oneText = buildLegacySafeNarrative(one);
  const twoText = buildLegacySafeNarrative(two);
  assert.deepEqual(requiredPresentNames(two), ['段强', '秦军斥候']);
  assert.ok(requiredClosureReserveChars(two) > requiredClosureReserveChars(one));
  assert.equal(oneText.includes('段强'), true);
  assert.equal(twoText.includes('段强'), true);
  assert.equal(twoText.includes('秦军斥候'), true);
});
