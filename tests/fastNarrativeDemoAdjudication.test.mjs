import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const DEMO_ACTION = '我猛地扑向最近的一具尸体，抢下他手里的短刀，然后借着草丛翻滚躲开射来的箭。';
const OUTCOMES = [
  ['perfect', true],
  ['great_success', true],
  ['success', true],
  ['partial', false],
  ['failure', false],
  ['critical_failure', false],
];
const ON_STORAGE = { getItem: key => (key === 'xiantu.fastNarrativeDemo.v1' ? 'true' : null) };
const OFF_STORAGE = { getItem: () => null };
const FACT_ID = 'qingyu-demo.scene.nearest-corpse-short-knife';

async function fixture(outcome, options = {}) {
  const { hashJudgementAction } = await loadTs('../src/utils/judgementEngine.ts');
  const actionHash = hashJudgementAction(options.actionText || DEMO_ACTION);
  const resolution = {
    id: options.id || `judge-${outcome}`,
    status: 'resolved',
    actionText: options.actionText || DEMO_ACTION,
    actionHash,
    kind: 'combat',
    whyNow: '战场抢刀与避箭存在风险',
    difficulty: { band: 'hard', value: 20 },
    factors: [],
    stakes: {
      success: '抢到短刀并躲开箭',
      partial: '短刀脱手但避开致命处',
      failure: '没能从尸体手中取刀',
    },
    canonPolicy: 'route_process_only',
    sourceEventId: 'lcq.event.s01_02',
    createdAtTurn: 1,
    roll: 10,
    total: 20,
    outcome,
    appliedEffects: [],
    resolvedAtTurn: 1,
  };
  const save = {
    角色: { 背包: { 灵石: { 下品: 0, 中品: 0, 上品: 0, 极品: 0 }, 物品: { existing: { 名称: '旧物' } } } },
    系统: {
      扩展: {
        清羽记开局: {
          kind: 'qingyu-demo-v1',
          disposable: true,
          persistence: 'isolated-local',
        },
        判定: { version: 1, recent: [structuredClone(resolution)] },
      },
    },
    世界: {
      状态: {
        剧本模组: {
          modId: options.modId || 'lcq.stage_01',
          flags: { 'event.s01_01.done': true },
          activeEventIds: ['lcq.event.s01_02'],
          completedEventIds: ['lcq.event.s01_01'],
        },
      },
    },
  };
  return { save, resolution };
}

async function legacyVerificationHash(receipt) {
  const { hashJudgementAction } = await loadTs('../src/utils/judgementEngine.ts');
  return hashJudgementAction([
    'xiantu.fastNarrativeDemo.receipt.v1',
    receipt.judgementId,
    receipt.actionHash,
    receipt.outcome,
    receipt.knifeLocation,
    receipt.sceneFactId,
    String(receipt.settledAtTurn),
  ].join('|'));
}

async function installLegacyKnifeState(save, resolution, knifeLocation) {
  const verificationHash = await legacyVerificationHash({
    judgementId: resolution.id,
    actionHash: resolution.actionHash,
    outcome: resolution.outcome,
    knifeLocation,
    sceneFactId: FACT_ID,
    settledAtTurn: resolution.resolvedAtTurn,
  });
  save.系统.扩展.清羽记开局.adjudication = {
    version: 1,
    sceneFacts: [{
      id: FACT_ID,
      kind: 'grounded_scene_item',
      itemName: '短刀',
      quality: '凡品',
      source: 'nearest_battlefield_corpse',
      sourceText: '最近的战场尸体僵硬的手指间原本握着一把凡品短刀。',
      establishedByJudgementId: resolution.id,
    }],
    actionReceipts: [{
      judgementId: resolution.id,
      actionHash: resolution.actionHash,
      outcome: resolution.outcome,
      knifeLocation,
      sceneFactId: FACT_ID,
      settledAtTurn: resolution.resolvedAtTurn,
      verificationHash,
    }],
    knife: {
      itemName: '短刀',
      location: knifeLocation,
      lastJudgementId: resolution.id,
    },
    terminalBoundaries: [{ eventId: 'lcq.event.s01_02', policy: 'fixed_terminal' }],
  };
}

test('六种判定结果映射为 acquired，且不进入背包或改写任务账', async () => {
  const demo = await loadTs('../src/modules/scenarioMods/fastNarrativeDemoAdjudication.ts');
  for (const [outcome, acquired] of OUTCOMES) {
    const { save, resolution } = await fixture(outcome);
    const backpackBefore = structuredClone(save.角色.背包);
    const runtimeBefore = structuredClone(save.世界.状态.剧本模组);

    const settled = demo.settleFastNarrativeDemoAdjudication(save, resolution, { storage: ON_STORAGE });

    assert.equal(settled.applied, true, outcome);
    assert.equal(settled.view.acquired, acquired, outcome);
    assert.equal(settled.view.source, 'nearby_battlefield_corpse', outcome);
    assert.equal(settled.view.judgementId, resolution.id, outcome);
    assert.equal(settled.view.processBoundary, '当前事件终局不可由本轮改写');
    assert.equal('location' in settled.view, false, outcome);
    assert.equal('sceneHeld' in settled.view, false, outcome);
    assert.equal(JSON.stringify(settled.view).includes('段强'), false);
    assert.deepEqual(save.角色.背包, backpackBefore, `${outcome} 不得写入正式背包`);
    assert.deepEqual(save.世界.状态.剧本模组, runtimeBefore, `${outcome} 不得改任务 flag/完成状态`);
    const state = save.系统.扩展.清羽记开局.adjudication;
    assert.equal(state.sceneFacts.length, 1);
    assert.equal(state.sceneFacts[0].source, 'nearby_battlefield_corpse');
    assert.equal(state.actionReceipts.length, 1);
    assert.equal(state.actionReceipts[0].judgementId, resolution.id);
    assert.equal(state.actionReceipts[0].acquired, acquired, outcome);
    assert.equal('knifeLocation' in state.actionReceipts[0], false, outcome);
    assert.match(state.actionReceipts[0].verificationHash, /^[0-9a-z]+$/);
    assert.equal(state.knife.acquired, acquired, outcome);
    assert.equal('location' in state.knife, false, outcome);
  }
});

test('重复 settlement 与同文案新 judgement 都不能成为重复落账或重骰入口', async () => {
  const demo = await loadTs('../src/modules/scenarioMods/fastNarrativeDemoAdjudication.ts');
  const { save, resolution } = await fixture('success');
  assert.equal(demo.settleFastNarrativeDemoAdjudication(save, resolution, { storage: ON_STORAGE }).applied, true);
  const once = structuredClone(save.系统.扩展.清羽记开局.adjudication);

  assert.deepEqual(demo.settleFastNarrativeDemoAdjudication(save, resolution, { storage: ON_STORAGE }), {
    applied: false,
    reason: 'already_settled',
    view: demo.readFastNarrativeDemoAdjudicationView(save),
  });
  assert.deepEqual(save.系统.扩展.清羽记开局.adjudication, once);

  const retry = { ...structuredClone(resolution), id: 'judge-retry' };
  save.系统.扩展.判定.recent.push(retry);
  assert.equal(demo.settleFastNarrativeDemoAdjudication(save, retry, { storage: ON_STORAGE }).reason, 'already_settled');
  assert.deepEqual(save.系统.扩展.清羽记开局.adjudication, once);
});

test('旧 marker 可 additive hydrate，序列化读档后保持同一现场事实', async () => {
  const demo = await loadTs('../src/modules/scenarioMods/fastNarrativeDemoAdjudication.ts');
  const { save, resolution } = await fixture('partial');
  assert.equal(save.系统.扩展.清羽记开局.adjudication, undefined);
  demo.settleFastNarrativeDemoAdjudication(save, resolution, { storage: ON_STORAGE });
  const loaded = JSON.parse(JSON.stringify(save));
  assert.deepEqual(
    demo.readFastNarrativeDemoAdjudicationView(loaded),
    demo.readFastNarrativeDemoAdjudicationView(save),
  );
  assert.equal(demo.settleFastNarrativeDemoAdjudication(loaded, resolution, { storage: ON_STORAGE }).reason, 'already_settled');
});

test('非 Demo、非 stage_01、未匹配动作或未落账 resolution 一律 fail closed', async () => {
  const demo = await loadTs('../src/modules/scenarioMods/fastNarrativeDemoAdjudication.ts');
  const { save, resolution } = await fixture('success');

  assert.equal(demo.settleFastNarrativeDemoAdjudication(save, resolution, { storage: OFF_STORAGE }).reason, 'feature_disabled');
  assert.equal(save.系统.扩展.清羽记开局.adjudication, undefined, '默认关闭时不得写入 Demo 回执');

  const other = structuredClone(save);
  delete other.系统.扩展.清羽记开局;
  assert.equal(demo.settleFastNarrativeDemoAdjudication(other, resolution, { storage: ON_STORAGE }).reason, 'ineligible_save');

  const later = structuredClone(save);
  later.世界.状态.剧本模组.modId = 'lcq.stage_02';
  assert.equal(demo.settleFastNarrativeDemoAdjudication(later, resolution, { storage: ON_STORAGE }).reason, 'ineligible_save');

  const unmatched = { ...structuredClone(resolution), actionText: '我先伏在草里观察。' };
  assert.equal(demo.settleFastNarrativeDemoAdjudication(save, unmatched, { storage: ON_STORAGE }).reason, 'unmatched_action');

  const unverifiedSave = structuredClone(save);
  unverifiedSave.系统.扩展.判定.recent = [];
  assert.equal(demo.settleFastNarrativeDemoAdjudication(unverifiedSave, resolution, { storage: ON_STORAGE }).reason, 'unverified_resolution');
  assert.equal(unverifiedSave.系统.扩展.清羽记开局.adjudication, undefined);
});

test('短刀 item factor 只在 acquired=true 且本轮明确使用时出现', async () => {
  const demo = await loadTs('../src/modules/scenarioMods/fastNarrativeDemoAdjudication.ts');

  const held = await fixture('success');
  demo.settleFastNarrativeDemoAdjudication(held.save, held.resolution, { storage: ON_STORAGE });
  assert.deepEqual(demo.fastNarrativeDemoShortKnifeFactor(held.save, '我用短刀格挡袭来的兵刃', ON_STORAGE), {
    label: '现场物品·凡品短刀', value: 3, source: 'item',
  });
  assert.equal(demo.fastNarrativeDemoShortKnifeFactor(held.save, '我观察短刀落在何处', ON_STORAGE), null);

  const dropped = await fixture('partial');
  demo.settleFastNarrativeDemoAdjudication(dropped.save, dropped.resolution, { storage: ON_STORAGE });
  assert.equal(demo.fastNarrativeDemoShortKnifeFactor(dropped.save, '我用短刀格挡', ON_STORAGE), null);

  const none = await fixture('failure');
  assert.equal(demo.fastNarrativeDemoShortKnifeFactor(none.save, '我用短刀格挡', ON_STORAGE), null);
});

test('总开关关闭时同一 acquired 存档不授予短刀因子且不写入', async () => {
  const demo = await loadTs('../src/modules/scenarioMods/fastNarrativeDemoAdjudication.ts');
  const { save, resolution } = await fixture('success');
  assert.equal(demo.settleFastNarrativeDemoAdjudication(save, resolution, { storage: OFF_STORAGE }).reason, 'feature_disabled');
  assert.equal(save.系统.扩展.清羽记开局.adjudication, undefined);
  assert.equal(demo.fastNarrativeDemoShortKnifeFactor(save, '我用短刀格挡袭来的兵刃', OFF_STORAGE), null);

  demo.settleFastNarrativeDemoAdjudication(save, resolution, { storage: ON_STORAGE });
  assert.deepEqual(demo.fastNarrativeDemoShortKnifeFactor(save, '我用短刀格挡袭来的兵刃', ON_STORAGE), {
    label: '现场物品·凡品短刀', value: 3, source: 'item',
  });
  assert.equal(demo.fastNarrativeDemoShortKnifeFactor(save, '我用短刀格挡袭来的兵刃', OFF_STORAGE), null);
  assert.equal(
    demo.fastNarrativeDemoShortKnifeFactor(save, '我用短刀格挡袭来的兵刃'),
    null,
    '未注入 storage 时沿用默认关闭',
  );
});

test('合法短刀回执不因 recent 滚动窗口过期而失效，篡改摘要或字段则 fail closed', async () => {
  const { getJudgementState } = await loadTs('../src/utils/judgementEngine.ts');
  const demo = await loadTs('../src/modules/scenarioMods/fastNarrativeDemoAdjudication.ts');
  const { save, resolution } = await fixture('success');
  const settled = demo.settleFastNarrativeDemoAdjudication(save, resolution, { storage: ON_STORAGE });
  assert.equal(settled.applied, true);
  assert.equal(settled.view.acquired, true);

  save.系统.扩展.判定.recent = [
    ...save.系统.扩展.判定.recent,
    ...Array.from({ length: 20 }, (_, index) => ({
      ...structuredClone(resolution),
      id: `judge-filler-${index}`,
      actionText: `${DEMO_ACTION} 余波 ${index}`,
      actionHash: `filler-${index}`,
    })),
  ];
  const recent = getJudgementState(save).recent;
  assert.equal(recent.some(item => item.id === resolution.id), false);
  assert.equal(recent.length, 20);

  const view = demo.readFastNarrativeDemoAdjudicationView(save);
  assert.equal(view.acquired, true);
  assert.equal(view.judgementId, resolution.id);
  assert.deepEqual(demo.fastNarrativeDemoShortKnifeFactor(save, '我用短刀格挡袭来的兵刃', ON_STORAGE), {
    label: '现场物品·凡品短刀', value: 3, source: 'item',
  });

  const tamperedHash = structuredClone(save);
  tamperedHash.系统.扩展.清羽记开局.adjudication.actionReceipts[0].verificationHash = 'forged';
  assert.equal(demo.readFastNarrativeDemoAdjudicationView(tamperedHash), null);
  assert.equal(demo.fastNarrativeDemoShortKnifeFactor(tamperedHash, '我用短刀格挡袭来的兵刃', ON_STORAGE), null);

  const tamperedOutcome = structuredClone(save);
  tamperedOutcome.系统.扩展.清羽记开局.adjudication.actionReceipts[0].outcome = 'failure';
  assert.equal(demo.readFastNarrativeDemoAdjudicationView(tamperedOutcome), null);
  assert.equal(demo.fastNarrativeDemoShortKnifeFactor(tamperedOutcome, '我用短刀格挡袭来的兵刃', ON_STORAGE), null);

  const tamperedAcquired = structuredClone(save);
  tamperedAcquired.系统.扩展.清羽记开局.adjudication.actionReceipts[0].acquired = false;
  assert.equal(demo.readFastNarrativeDemoAdjudicationView(tamperedAcquired), null);
  assert.equal(demo.fastNarrativeDemoShortKnifeFactor(tamperedAcquired, '我用短刀格挡袭来的兵刃', ON_STORAGE), null);
});

test('旧 scene_held/on_ground/at_corpse 读取迁移为 acquired，不要求写回位置', async () => {
  const demo = await loadTs('../src/modules/scenarioMods/fastNarrativeDemoAdjudication.ts');
  const cases = [
    ['success', 'scene_held', true],
    ['partial', 'on_ground', false],
    ['failure', 'at_corpse', false],
  ];
  for (const [outcome, location, acquired] of cases) {
    const { save, resolution } = await fixture(outcome);
    await installLegacyKnifeState(save, resolution, location);
    const before = JSON.stringify(save.系统.扩展.清羽记开局.adjudication);
    const view = demo.readFastNarrativeDemoAdjudicationView(save);
    assert.equal(view.acquired, acquired, location);
    assert.equal(view.source, 'nearby_battlefield_corpse', location);
    assert.equal('location' in view, false, location);
    assert.equal(JSON.stringify(save.系统.扩展.清羽记开局.adjudication), before, location);
    assert.equal(
      demo.fastNarrativeDemoShortKnifeFactor(save, '我用短刀格挡袭来的兵刃', ON_STORAGE) != null,
      acquired,
      location,
    );
  }
});
