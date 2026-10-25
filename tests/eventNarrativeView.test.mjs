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

// 身份账 T2（身份账设计稿 §4.3）：变体求值读账本，文案与 Canon Rail 判定用同一份 runtime
const ZHUSHI = 'liuchao.identity.song.baochao_zhushi';
const identityEvent = () => ({
  id: 'demo.event.song', name: '入宋', description: '默认', axisBeat: '原著', objective: '原著目标', completion: [],
  narrativeVariants: [{
    when: [{ path: `identity.${ZHUSHI}`, operator: 'eq', value: true }],
    name: '以宝钞局主事身份入宋', objective: '凭主事身份入宋', replacesCanonRail: true,
  }],
});
const identityRuntime = () => ({
  flags: {},
  playerIdentities: { [ZHUSHI]: { identityId: ZHUSHI, status: 'active', acquiredAtEventId: 'lcq.event.s02_01', history: [] } },
});

test('身份条件命中选变体且 Rail 判定一致', async () => {
  const { resolveScenarioEventNarrative, narrativeVariantReplacesCanonRail } = await modPromise;
  const runtime = identityRuntime();
  const view = resolveScenarioEventNarrative(identityEvent(), runtime.flags, [], runtime);
  assert.equal(view.name, '以宝钞局主事身份入宋');
  assert.equal(narrativeVariantReplacesCanonRail(identityEvent(), runtime.flags, [], runtime), true);
  runtime.playerIdentities[ZHUSHI].status = 'revoked';
  assert.equal(resolveScenarioEventNarrative(identityEvent(), runtime.flags, [], runtime).name, '入宋');
  assert.equal(narrativeVariantReplacesCanonRail(identityEvent(), runtime.flags, [], runtime), false);
});

test('不传 runtime 时账本条件不命中回落原著', async () => {
  const { resolveScenarioEventNarrative, narrativeVariantReplacesCanonRail } = await modPromise;
  const event = identityEvent();
  // neq 也不命中：账本路径不回落 flags 逻辑
  event.narrativeVariants.unshift({ when: [{ path: `identity.${ZHUSHI}`, operator: 'neq', value: true }], name: '未持有', replacesCanonRail: true });
  const { flags } = identityRuntime();
  const view = resolveScenarioEventNarrative(event, flags, []);
  assert.equal(view.name, '入宋');
  assert.equal(view.objective, '原著目标');
  assert.equal(narrativeVariantReplacesCanonRail(event, flags, []), false);
});

test('flags 变体行为不变', async () => {
  const { resolveScenarioEventNarrative, narrativeVariantReplacesCanonRail } = await modPromise;
  const event = {
    id: 'demo.event.flag', name: '默认', description: '默认', completion: [],
    narrativeVariants: [{ when: [{ path: 'flags.branch.demo.on', operator: 'eq', value: true }], name: '旗标变体', replacesCanonRail: true }],
  };
  const runtime = identityRuntime();
  for (const flags of [{ 'branch.demo.on': true }, { branch: { demo: { on: true } } }]) {
    assert.equal(resolveScenarioEventNarrative(event, flags, []).name, '旗标变体');
    assert.equal(resolveScenarioEventNarrative(event, flags, [], { ...runtime, flags }).name, '旗标变体');
    assert.equal(narrativeVariantReplacesCanonRail(event, flags, [], { ...runtime, flags }), true);
  }
  assert.equal(resolveScenarioEventNarrative(event, {}, [], runtime).name, '默认');
  assert.equal(narrativeVariantReplacesCanonRail(event, {}, []), false);
});
