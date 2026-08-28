import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const VALID = '{"pacing":"slow_orient","sensory":"grass_iron","companion":"dazed","closing":"hold_ground"}';

test('invalid model output falls back to the default plan and never copies free prose', async () => {
  const { parseLegacyRenderPlan, DEFAULT_LEGACY_RENDER_PLAN } = await loadTs(
    '../src/modules/scenarioMods/legacyRenderPlan.ts',
  );
  const parsed = parseLegacyRenderPlan('你捡起神兵，赶往帅帐，段强死了。');
  assert.equal(parsed.parsed, false);
  assert.deepEqual(parsed.plan, DEFAULT_LEGACY_RENDER_PLAN);
});

test('RenderPlan requires all four legal fields and rejects extras or illegal values', async () => {
  const { parseLegacyRenderPlan, DEFAULT_LEGACY_RENDER_PLAN, LEGACY_RENDER_PLAN_INSTRUCTION } = await loadTs(
    '../src/modules/scenarioMods/legacyRenderPlan.ts',
  );
  assert.equal(parseLegacyRenderPlan(VALID).parsed, true);
  assert.equal(parseLegacyRenderPlan(`<think>hide</think>${VALID}`).parsed, true);
  assert.equal(parseLegacyRenderPlan(`  ${VALID}  `).parsed, true);
  assert.equal(parseLegacyRenderPlan(`说明${VALID}谢谢`).parsed, false);
  assert.equal(parseLegacyRenderPlan(`${VALID}\n谢谢`).parsed, false);
  assert.equal(parseLegacyRenderPlan(`\`\`\`json\n${VALID}\n\`\`\``).parsed, false);
  assert.equal(parseLegacyRenderPlan('{"pacing":"slow_orient","sensory":"grass_iron","companion":"dazed"}').parsed, false);
  assert.equal(parseLegacyRenderPlan('{"pacing":"slow_orient","sensory":"grass_iron","companion":"dazed","closing":"hold_ground","text":"正文"}').parsed, false);
  assert.equal(parseLegacyRenderPlan('{"pacing":"sprint","sensory":"grass_iron","companion":"dazed","closing":"hold_ground"}').parsed, false);
  assert.deepEqual(parseLegacyRenderPlan('{"pacing":"sprint","sensory":"grass_iron","companion":"dazed","closing":"hold_ground"}').plan, DEFAULT_LEGACY_RENDER_PLAN);
  assert.match(LEGACY_RENDER_PLAN_INSTRUCTION, /slow_orient/);
  assert.match(LEGACY_RENDER_PLAN_INSTRUCTION, /hold_ground/);
  assert.match(LEGACY_RENDER_PLAN_INSTRUCTION, /不要 text 字段/);
});

test('narrative text extractor would drop a RenderPlan JSON without a text field', async () => {
  const { parseLegacyRenderPlan } = await loadTs('../src/modules/scenarioMods/legacyRenderPlan.ts');
  const extracted = JSON.parse(VALID).text || '';
  assert.equal(extracted, '');
  assert.equal(parseLegacyRenderPlan(VALID).parsed, true);
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../src/modules/scenarioMods/legacyNarrativePilotGenerate.ts', import.meta.url), 'utf8'));
  assert.equal(source.includes('extractNarrativeText'), false);
});

test('composed prose stays inside Packet receipts', async () => {
  const { composeLegacyNarrativeFromPlan } = await loadTs('../src/modules/scenarioMods/legacyRenderPlan.ts');
  const packet = {
    action: '稳住自己',
    settledOutcome: '弄清身在何处',
    location: '中州·草原',
    currentObjective: '先稳住自己并弄清身在何处',
    publicFacts: ['中州·草原', '段强在场'],
    localReceipt: { source: 'event_action', action: '稳住自己', outcome: '弄清身在何处' },
    present: ['段强'],
    presentActors: [{ name: '段强', traits: [] }],
    mustAppear: { location: '中州·草原', present: ['段强'], objective: '先稳住自己并弄清身在何处' },
    mustNotAppear: ['月霜'],
    body: { 气血: '100/100' },
    recentNarrative: '',
    outputContract: 'plan',
    receipts: { move: false, casualty: false },
    eventId: 'lcq.event.s01_01',
  };
  const text = composeLegacyNarrativeFromPlan(packet);
  assert.match(text, /段强/);
  assert.match(text, /草原|草地|中州/);
  assert.equal(/前往|赶到|走进/.test(text), false);
  assert.equal(/死了|重伤|身亡/.test(text), false);
});
