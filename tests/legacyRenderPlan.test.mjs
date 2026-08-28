import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

test('invalid model output falls back to the default plan and never copies free prose', async () => {
  const { parseLegacyRenderPlan, composeLegacyNarrativeFromPlan, DEFAULT_LEGACY_RENDER_PLAN } = await loadTs(
    '../src/modules/scenarioMods/legacyRenderPlan.ts',
  );
  const parsed = parseLegacyRenderPlan('你捡起神兵，赶往帅帐，段强死了。');
  assert.equal(parsed.parsed, false);
  assert.deepEqual(parsed.plan, DEFAULT_LEGACY_RENDER_PLAN);
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
  };
  const text = composeLegacyNarrativeFromPlan(packet);
  assert.match(text, /段强/);
  assert.match(text, /草原|草地|中州/);
  assert.equal(/前往|赶到|走进/.test(text), false);
  assert.equal(/死了|重伤|身亡/.test(text), false);
});
