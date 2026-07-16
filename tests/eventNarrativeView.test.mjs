import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');

test('无预写 variant 时，相关人物分歧自动投影下游事件并替代旧 Rail', async () => {
  const { resolveScenarioEventNarrative, narrativeVariantReplacesCanonRail } = await modPromise;
  const event = {
    id: 'demo.event.02', name: '与赵甲会面', description: '赵甲在渡口交付密信。',
    axisBeat: '赵甲亲手交付密信', objective: '前往渡口与赵甲会面',
    relatedCharacterIds: ['demo.character.zhao_jia'], completion: [],
  };
  const divergences = [{
    id: 'divergence.demo.1', eventId: 'demo.event.01',
    worldDelta: '赵甲在山道失踪，密信去向不明', evidence: '赵甲失踪', sequence: 1,
    characterStates: [{ characterId: 'demo.character.zhao_jia', status: 'missing' }],
  }];
  const view = resolveScenarioEventNarrative(event, {}, divergences);
  assert.match(view.name, /世界线承接/);
  assert.match(view.objective, /赵甲在山道失踪/);
  assert.doesNotMatch(view.axisBeat, /亲手交付/);
  assert.equal(narrativeVariantReplacesCanonRail(event, {}, divergences), true);
});

test('无关人物分歧不改写事件，显式 variant 仍优先于通用投影', async () => {
  const { resolveScenarioEventNarrative } = await modPromise;
  const base = {
    id: 'demo.event.02', name: '会面', description: '默认', relatedCharacterIds: ['demo.character.a'],
    narrativeVariants: [{
      when: [{ path: 'flags.branch.demo.active', operator: 'eq', value: true }],
      name: '手写变体', objective: '执行手写后果', replacesCanonRail: true,
    }],
  };
  const divergences = [{
    id: 'd1', eventId: 'e1', worldDelta: '甲已经离开', evidence: '甲离开', sequence: 1,
    characterStates: [{ characterId: 'demo.character.a', status: 'missing' }],
  }];
  assert.equal(resolveScenarioEventNarrative(base, {}, [{
    ...divergences[0], characterStates: [{ characterId: 'demo.character.b', status: 'missing' }],
  }]).name, '会面');
  assert.equal(resolveScenarioEventNarrative(base, { 'branch.demo.active': true }, divergences).name, '手写变体');
});
