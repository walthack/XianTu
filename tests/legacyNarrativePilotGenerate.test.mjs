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

test('first failed attempt with no visible text retries on a fresh stream and does not duplicate', async () => {
  const { generateLegacyPilotNarrative } = await loadTs('../src/modules/scenarioMods/legacyNarrativePilotGenerate.ts');
  const { buildLegacySafeNarrative, countVisibleNarrativeChars } = await loadTs(
    '../src/modules/scenarioMods/legacyNarrativeContract.ts',
  );
  const compiled = await openingCompiled();
  const longText = buildLegacySafeNarrative(compiled.packet);
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
    generate: async ({ generationId, onStreamChunk }) => {
      calls.push(generationId);
      if (calls.length === 1) throw new Error('upstream fail');
      onStreamChunk?.(longText);
      return longText;
    },
  });
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0], calls[1]);
  assert.equal(result.attempts, 2);
  assert.equal(result.retried, true);
  assert.equal(result.usedFallback, false);
  assert.equal(result.text, result.displayed);
  assert.equal(result.text, longText.trim());
  assert.ok(countVisibleNarrativeChars(result.text) >= 800);
  assert.equal(displayed.join('').split(longText.trim()).length - 1, 1);
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

test('visible sentences block a new model attempt and continue locally', async () => {
  const { generateLegacyPilotNarrative } = await loadTs('../src/modules/scenarioMods/legacyNarrativePilotGenerate.ts');
  const { countVisibleNarrativeChars } = await loadTs('../src/modules/scenarioMods/legacyNarrativeContract.ts');
  const compiled = await openingCompiled();
  const calls = [];
  const result = await generateLegacyPilotNarrative({
    playerLine: compiled.plan.playerLine,
    storyPrompt: STORY,
    packet: compiled.packet,
    maxRetries: 1,
    useStreaming: true,
    generationId: 'pilot',
    extractNarrativeText: raw => raw,
    generate: async ({ generationId, onStreamChunk }) => {
      calls.push(generationId);
      onStreamChunk?.('你撑着湿草站起来。风里有铁锈味。');
      throw new Error('broken pipe after visible text');
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(result.usedFallback, true);
  assert.ok(result.text.startsWith('你撑着湿草站起来。'));
  assert.ok(countVisibleNarrativeChars(result.text) >= 800);
  assert.equal(result.text.includes('神兵'), false);
  assert.equal(result.text, result.displayed);
});

test('non-streaming pilot never emits chunk callbacks', async () => {
  const { generateLegacyPilotNarrative } = await loadTs('../src/modules/scenarioMods/legacyNarrativePilotGenerate.ts');
  const { buildLegacySafeNarrative } = await loadTs('../src/modules/scenarioMods/legacyNarrativeContract.ts');
  const compiled = await openingCompiled();
  const chunks = [];
  const body = buildLegacySafeNarrative(compiled.packet);
  const result = await generateLegacyPilotNarrative({
    playerLine: compiled.plan.playerLine,
    storyPrompt: STORY,
    packet: compiled.packet,
    maxRetries: Number.NaN,
    useStreaming: false,
    generationId: 'pilot',
    extractNarrativeText: raw => raw,
    onStreamChunk: chunk => chunks.push(chunk),
    generate: async () => body,
  });
  assert.equal(result.attempts, 1);
  assert.equal(result.usedFallback, false);
  assert.deepEqual(chunks, []);
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
