import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const DEMO_ACTION = '我猛地扑向最近的一具尸体，抢下他手里的短刀，然后借着草丛翻滚躲开射来的箭。';
const OUTCOMES = [
  ['perfect', 'scene_held'],
  ['great_success', 'scene_held'],
  ['success', 'scene_held'],
  ['partial', 'on_ground'],
  ['failure', 'at_corpse'],
  ['critical_failure', 'at_corpse'],
];
const ON_STORAGE = { getItem: key => (key === 'xiantu.fastNarrativeDemo.v1' ? 'true' : null) };
const OFF_STORAGE = { getItem: () => null };

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

test('六种判定结果映射为互斥的短刀现场终态，且不进入背包或改写任务账', async () => {
  const demo = await loadTs('../src/modules/scenarioMods/fastNarrativeDemoAdjudication.ts');
  for (const [outcome, location] of OUTCOMES) {
    const { save, resolution } = await fixture(outcome);
    const backpackBefore = structuredClone(save.角色.背包);
    const runtimeBefore = structuredClone(save.世界.状态.剧本模组);

    const settled = demo.settleFastNarrativeDemoAdjudication(save, resolution, { storage: ON_STORAGE });

    assert.equal(settled.applied, true, outcome);
    assert.equal(settled.view.location, location, outcome);
    assert.equal(settled.view.sceneHeld, location === 'scene_held', outcome);
    assert.equal(settled.view.judgementId, resolution.id, outcome);
    assert.equal(settled.view.processBoundary, '当前事件终局不可由本轮改写');
    assert.equal(JSON.stringify(settled.view).includes('段强'), false);
    assert.deepEqual(save.角色.背包, backpackBefore, `${outcome} 不得写入正式背包`);
    assert.deepEqual(save.世界.状态.剧本模组, runtimeBefore, `${outcome} 不得改任务 flag/完成状态`);
    const state = save.系统.扩展.清羽记开局.adjudication;
    assert.equal(state.sceneFacts.length, 1);
    assert.equal(state.actionReceipts.length, 1);
    assert.equal(state.actionReceipts[0].judgementId, resolution.id);
    assert.match(state.actionReceipts[0].verificationHash, /^[0-9a-z]+$/);
    assert.equal(state.knife.location, location);
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

test('短刀 item factor 只在现场持有且本轮明确使用时出现', async () => {
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

test('总开关关闭时同一 scene_held 存档不授予短刀因子且不写入', async () => {
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
  assert.equal(settled.view.sceneHeld, true);

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
  assert.equal(view.sceneHeld, true);
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

  const tamperedLocation = structuredClone(save);
  tamperedLocation.系统.扩展.清羽记开局.adjudication.actionReceipts[0].knifeLocation = 'at_corpse';
  assert.equal(demo.readFastNarrativeDemoAdjudicationView(tamperedLocation), null);
  assert.equal(demo.fastNarrativeDemoShortKnifeFactor(tamperedLocation, '我用短刀格挡袭来的兵刃', ON_STORAGE), null);
});
