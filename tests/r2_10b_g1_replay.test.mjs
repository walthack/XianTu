import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL(
  '../src/modules/scenarioMods/builtins/data/lyg.dingtao_beijing.json',
  import.meta.url,
);
const ROUTES = {
  R1: {
    opportunityId: 'opportunity.lyg.s01_05.first_edict',
    entitlement: 'permission.lyg.jia_wenhe.exchange_judgement',
    actions: [
      '我前往昭阳宫，亲自介入新帝诏令。',
      '我明确优先选择安民，另外两项交由贾文和排序。',
      '我公开支持这项选择并承担站队后果。',
    ],
  },
  R2: {
    opportunityId: 'opportunity.lyg.s01_05.court_entry',
    entitlement: 'permission.lyg.huo_zimeng.trusted_intelligence',
    actions: [
      '我向霍子孟出示证据，证明定陶王安全。',
      '我协调北军与凉州军，划出一条不拔刀的入宫路线。',
    ],
  },
  R3: {
    opportunityId: null,
    entitlement: null,
    actions: [],
  },
};

function baseFixture(stage) {
  return {
    角色: {
      身份: { 名字: 'G1验收角色' },
      位置: { 描述: '长秋宫外' },
      属性: { 声望: 0 },
    },
    社交: { 关系: {}, 记忆: { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] } },
    系统: { 扩展: {}, 历史: { 叙事: [] } },
    世界: {
      信息: { 世界名称: stage.world.name, 地点信息: [], 势力信息: [] },
      状态: {
        剧本模组: {
          modId: stage.manifest.id,
          modName: stage.manifest.name,
          mode: 'strict',
          currentChapterId: 'lyg.chapter.s01',
          chapters: structuredClone(stage.scenario.chapters),
          events: structuredClone(stage.scenario.events),
          flags: { ...stage.scenario.initialFlags },
          activeEventIds: ['lyg.event.s01_05'],
          completedEventIds: [
            'lyg.event.s01_01',
            'lyg.event.s01_02',
            'lyg.event.s01_03',
            'lyg.event.s01_04',
          ],
          completedChapterIds: [],
          offscreenResolvedEventIds: [],
          chronicle: [],
          stallTurns: 0,
          worldTurn: 0,
          nextStageId: stage.manifest.nextStageId,
          canon: structuredClone(stage.canon),
        },
      },
    },
  };
}

function setNested(root, path, value) {
  const keys = path.split('.');
  let cursor = root;
  for (const key of keys.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys.at(-1)] = value;
}

function runtimeOf(save) {
  return save.世界.状态.剧本模组;
}

function assertRoundInvariants(runtime, route, snapshots) {
  const engine = runtime.actorEngine;
  if (engine?.decisions?.length) {
    assert.deepEqual(
      Object.keys(engine.situationValues || {}).sort(),
      ['courtLegitimacy', 'militaryTension'],
      `${route}: situation values must remain in the stage whitelist`,
    );
    assert.equal(
      (engine.visibleDecisionIds || []).every(id =>
        engine.decisions.find(decision => decision.id === id)?.visibility !== 'hidden'
      ),
      true,
      `${route}: hidden decisions must never enter the visible set`,
    );
    snapshots.push({
      worldTurn: runtime.worldTurn,
      decisionRound: engine.decisionRound,
      inputHash: engine.decisionInputHash,
      decisions: engine.decisions.map(item => item.actionId),
      visibleDecisionIds: [...(engine.visibleDecisionIds || [])],
      situationValues: { ...(engine.situationValues || {}) },
    });
  }
}

function assertLlmCannotClaimCompletion(save, guardScenarioModCommands) {
  const command = {
    action: 'set',
    key: '世界.状态.剧本模组.flags.event.s01_05.done',
    value: true,
  };
  const guarded = guardScenarioModCommands(save, [command]);
  assert.deepEqual(guarded.accepted, []);
  assert.equal(guarded.rejected.length, 1, 'LLM must not own a deterministic opportunity completion flag');
}

async function replayRoute(route, fixture, deps) {
  let save = structuredClone(fixture);
  const snapshots = [];
  save = deps.advanceScenarioRuntime(save).saveData;
  const initialRuntime = runtimeOf(save);
  const initialHash = initialRuntime.actorEngine.decisionInputHash;
  assert.equal(initialRuntime.worldTurn, 1);
  assert.equal(initialRuntime.actorEngine.decisions.length, 4);
  assertRoundInvariants(initialRuntime, route, snapshots);

  // 三路线共享前四轮；这同时证明机会卡不是世界启动开关。
  while (runtimeOf(save).worldTurn < 5) {
    save = deps.advanceScenarioRuntime(save).saveData;
    assertRoundInvariants(runtimeOf(save), route, snapshots);
  }

  const contract = ROUTES[route];
  if (contract.opportunityId) {
    const tracked = deps.trackStoryOpportunity(save, contract.opportunityId);
    assert.equal(tracked.ok, true, `${route}: opportunity must be trackable`);
  }

  if (route === 'R3') {
    while (
      (
        !runtimeOf(save).offscreenResolvedEventIds.includes('lyg.event.s01_05')
        || runtimeOf(save).worldTurn < 10
      )
      && runtimeOf(save).worldTurn < 15
    ) {
      save = deps.advanceScenarioRuntime(save).saveData;
      assertRoundInvariants(runtimeOf(save), route, snapshots);
    }
  } else {
    assertLlmCannotClaimCompletion(save, deps.guardScenarioModCommands);
    for (const [index, action] of contract.actions.entries()) {
      const recorded = deps.recordStoryOpportunityPlayerAction(save, action);
      assert.equal(recorded.progressed, true, `${route}: step ${index + 1} must be engine-recognized`);
      assert.equal(recorded.completed, index === contract.actions.length - 1);
      save = deps.advanceScenarioRuntime(save).saveData;
      if (index < contract.actions.length - 1) {
        assert.equal(runtimeOf(save).completedEventIds.includes('lyg.event.s01_05'), false);
      }
    }
    while (runtimeOf(save).worldTurn < 10) save = deps.advanceScenarioRuntime(save).saveData;
  }

  const runtime = runtimeOf(save);
  const engine = runtime.actorEngine;
  assert.equal(runtime.worldTurn >= 10 && runtime.worldTurn <= 15, true, `${route}: replay must span 10–15 turns`);
  assert.equal(new Set(snapshots.map(item => item.decisionRound)).size >= 2, true, `${route}: NPCs must take multiple rounds`);
  assert.equal(snapshots[0].inputHash, initialHash);

  if (route === 'R3') {
    assert.equal(runtime.completedEventIds.includes('lyg.event.s01_05'), false);
    assert.equal(runtime.offscreenResolvedEventIds.includes('lyg.event.s01_05'), true);
    assert.equal(runtime.flags['event.s01_05.done'], false);
    assert.equal(engine.entitlements.length, 0);
    assert.equal(engine.receipts.length, 1);
    assert.equal(engine.receipts[0].outcome, 'offscreen');
    assert.match(engine.receipts[0].detail, /未伪记为玩家亲历/);
    assert.match(runtime.chronicle.find(item => item.type === 'world')?.detail || '', /董卓已经拥立定陶王为帝/);
  } else {
    assert.equal(runtime.completedEventIds.includes('lyg.event.s01_05'), true);
    assert.equal(runtime.offscreenResolvedEventIds.includes('lyg.event.s01_05'), false);
    assert.equal(engine.receipts.length, 1);
    assert.equal(engine.receipts[0].outcome, 'participated');
    assert.deepEqual(engine.entitlements.map(item => item.key), [contract.entitlement]);
  }

  // 以 JSON 往返模拟真实存档重载；再次推进不得重复回执或授权。
  const reloaded = JSON.parse(JSON.stringify(save));
  const afterReload = deps.advanceScenarioRuntime(reloaded).saveData;
  const reloadedEngine = runtimeOf(afterReload).actorEngine;
  assert.equal(reloadedEngine.receipts.length, 1, `${route}: receipt must be idempotent after reload`);
  assert.equal(
    reloadedEngine.entitlements.length,
    route === 'R3' ? 0 : 1,
    `${route}: entitlement must be idempotent after reload`,
  );
  assert.equal(reloadedEngine.situationValues, undefined, `${route}: stage situation must clear after anchor change`);

  return {
    route,
    initialHash,
    settledWorldTurn: runtime.worldTurn,
    outcome: engine.receipts[0].outcome,
    receiptId: engine.receipts[0].id,
    entitlements: engine.entitlements.map(item => item.key),
    decisionRounds: new Set(snapshots.map(item => item.decisionRound)).size,
    offscreen: runtime.offscreenResolvedEventIds.includes('lyg.event.s01_05'),
  };
}

test('G1 replays R3/R1/R2 from one fixture without any LLM or network dependency', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const fixture = baseFixture(stage);
  const { advanceScenarioRuntime, trackStoryOpportunity, recordStoryOpportunityPlayerAction } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const deps = {
    advanceScenarioRuntime,
    trackStoryOpportunity,
    recordStoryOpportunityPlayerAction,
    guardScenarioModCommands,
  };

  const results = [];
  for (const route of ['R3', 'R1', 'R2']) {
    results.push(await replayRoute(route, fixture, deps));
  }

  assert.equal(new Set(results.map(item => item.initialHash)).size, 1, 'all routes must fork from one decision state');
  assert.deepEqual(results.map(item => item.outcome), ['offscreen', 'participated', 'participated']);
  assert.deepEqual(results.map(item => item.entitlements.length), [0, 1, 1]);
  console.log('[R2-10B G1 evidence]', JSON.stringify(results));
});
