import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const dataDir = new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url);
const forbiddenOmenText = /(机会卡|世界回合|最后\s*\d+\s*轮|剩余\s*\d+\s*回合|倒计时|将死|必死|终将(死亡|身亡|登基)|注定(死亡|身亡|登基)|必然(死亡|身亡|登基)|必定(死|登基|身亡)|一定(死|身亡|登基)|已经身亡|已经登基)/u;

async function loadBuiltins() {
  const files = (await readdir(new URL(dataDir))).filter(file => file.endsWith('.json') && file !== 'manifest.json').sort();
  return Promise.all(files.map(async file => JSON.parse(await readFile(join(dataDir.pathname, file), 'utf8'))));
}

test('all builtin stages expose a validated world-sim baseline without changing the companion default', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const mods = await loadBuiltins();
  assert.equal(mods.length, 37);
  const omenIds = new Set();
  for (const mod of mods) {
    const result = validateScenarioMod(mod);
    assert.equal(result.valid, true, `${mod.manifest.id}: ${result.issues.map(issue => `${issue.path} ${issue.message}`).join('; ')}`);
    assert.ok(mod.scenario.worldSimulation, `${mod.manifest.id} missing worldSimulation`);
    const events = new Map((mod.scenario.events || []).map(event => [event.id, event]));
    for (const situation of mod.scenario.worldSimulation.situations) {
      const source = events.get(situation.sourceEventId);
      assert.ok(source, `${mod.manifest.id}: unknown situation source ${situation.sourceEventId}`);
      assert.notEqual(source.critical, false, `${mod.manifest.id}: non-critical source became a world situation`);
      assert.ok(Array.isArray(situation.settledWhenAny) && situation.settledWhenAny.length > 0);
      for (const group of situation.settledWhenAny) {
        for (const condition of group) assert.match(String(condition.path), /^flags\./, `${mod.manifest.id}: non-engine settlement path`);
      }
      if (!situation.omen) continue;
      assert.equal(omenIds.has(situation.omen.id), false, `duplicate omen ${situation.omen.id}`);
      omenIds.add(situation.omen.id);
      const omenText = [
        ...(situation.omen.observableFacts || []),
        situation.omen.environmentFallback,
        situation.omen.presentation?.title,
        situation.omen.presentation?.text,
      ].join('｜');
      assert.equal(forbiddenOmenText.test(omenText), false, `${mod.manifest.id}: forbidden omen text ${omenText}`);
      assert.ok(situation.omen.afterTurns >= 0);
    }
  }
  const dingtao = mods.find(mod => mod.manifest.id === 'lyg.dingtao_beijing');
  const dingtaoOmens = [
    ...dingtao.scenario.worldSimulation.situations.flatMap(item => item.omen?.id || []),
    ...(dingtao.scenario.events || []).flatMap(event => event.timeline?.omen?.id || []),
  ];
  assert.ok(dingtaoOmens.includes('omen.lyg.s01_05.enthronement_accelerating'));
  assert.ok(dingtaoOmens.includes('omen.lyg.s01_06.guo_jie_crisis'));
});

test('every baseline stage can initialize an explicit world_sim save', async () => {
  const { buildStrictScenarioInitialization } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const mods = await loadBuiltins();
  for (const mod of mods) {
    const initialization = buildStrictScenarioInitialization(
      mod,
      '2026-08-14T00:00:00.000Z',
      { storyMode: 'world_sim' },
    );
    assert.equal(initialization.runtimeState.storyMode, 'world_sim', mod.manifest.id);
    assert.equal(initialization.runtimeState.worldSimulation.version, 1, mod.manifest.id);
    assert.ok(initialization.runtimeState.worldSimulation.situations.length > 0, `${mod.manifest.id}: no playable situation`);
  }
});

test('a non-curated baseline stage can deliver an in-world omen through the production runtime helper', async () => {
  const { buildStrictScenarioInitialization } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { deliverDueWorldOmens } = await loadTs('../src/modules/scenarioMods/worldSimulation.ts');
  const mods = await loadBuiltins();
  const mod = mods.find(item => item.manifest.id === 'lyl.luoyang_cloud_secret');
  const runtime = buildStrictScenarioInitialization(mod, '2026-08-14T00:00:00.000Z', { storyMode: 'world_sim' }).runtimeState;
  runtime.stallTurns = 1;
  const transitions = [];
  const notices = deliverDueWorldOmens(runtime, transitions);
  assert.ok(notices.length > 0);
  assert.ok(transitions.some(item => item.type === 'event_omen'));
  assert.ok(runtime.worldSimulationState.deliveredOmenIds.length > 0);
  assert.equal(runtime.flags['world.omen.delivered'], undefined);
  assert.equal(runtime.playerKnowledge?.omen, undefined);
});

test('old explicit world_sim saves receive a newly shipped baseline contract without upgrading companion saves', async () => {
  const { backfillRuntimeWorldOmens } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const mod = (await loadBuiltins()).find(item => item.manifest.id === 'lyl.luoyang_cloud_secret');
  const worldOld = { storyMode: 'world_sim', events: structuredClone(mod.scenario.events) };
  const companionOld = { storyMode: undefined, events: structuredClone(mod.scenario.events) };
  assert.ok(backfillRuntimeWorldOmens(worldOld, worldOld.events, mod.scenario.worldSimulation) > 0);
  assert.equal(worldOld.worldSimulation.version, 1);
  assert.equal(backfillRuntimeWorldOmens(companionOld, companionOld.events, mod.scenario.worldSimulation), 0);
  assert.equal(companionOld.worldSimulation, undefined);
});
