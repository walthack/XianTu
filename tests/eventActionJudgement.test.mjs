import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const EVENT_ID = 'test.event.local_judgement';

function judgementSpec(overrides = {}) {
  return {
    kind: 'cultivate',
    difficulty: 'severe',
    difficultyValue: 25,
    target: 'test.character.wounded',
    successOutcomes: ['success', 'great_success', 'perfect'],
    applyCultivationRecovery: false,
    spiritCost: { onResolveRatio: 0.05, criticalFailureRatio: 0.1 },
    whyNow: '合同签发一次救治判定。',
    stakes: {
      perfect: '伤势压住。',
      greatSuccess: '伤势压住。',
      success: '伤势压住。',
      partial: '只争取到说话的时间。',
      failure: '抢救失败。',
      criticalFailure: '抢救失败，余波更重。',
    },
    ...overrides,
  };
}

function fixture() {
  const event = {
    id: EVENT_ID,
    name: '测试显式判定',
    critical: true,
    completion: [{ path: 'flags.event.local_judgement.done', operator: 'eq', value: true }],
    playerCompletionContract: {
      kind: 'objective_action',
      settleOn: ['success', 'partial', 'failure'],
      actions: [
        {
          id: 'observe',
          label: '观察',
          actionText: '我先观察四周，不贸然动手。',
          timeCost: 1,
          outcomeText: {
            success: '你看清了现场。',
            partial: '该动作不产生 partial。',
            failure: '该动作不产生 failure。',
          },
        },
        {
          id: 'rescue',
          label: '救治',
          actionText: '我运功疗伤，救下他不死。',
          timeCost: 1,
          judgement: judgementSpec(),
          outcomeText: {
            success: '救治成功。',
            partial: '只争取到说话的时间。',
            failure: '抢救失败。',
          },
        },
      ],
    },
  };
  return {
    角色: {
      身份: { 先天六司: { 悟性: 8, 灵性: 6, 心性: 4 }, 后天六司: {} },
      位置: { 灵气浓度: 50, 描述: '南荒·鬼王峒' },
      属性: { 气血: { 当前: 40, 上限: 200 }, 神识: { 当前: 200, 上限: 400 } },
    },
    系统: { 扩展: {} },
    世界: {
      状态: {
        剧本模组: {
          modId: 'test.local_judgement',
          flags: { 'event.local_judgement.done': false },
          chapters: [{ id: 'test.chapter', eventIds: [EVENT_ID], completion: [{ path: 'flags.chapter.done', operator: 'eq', value: true }] }],
          currentChapterId: 'test.chapter',
          events: [event],
          activeEventIds: [EVENT_ID],
          completedEventIds: [],
          completedChapterIds: [],
          offscreenResolvedEventIds: [],
          eventActionStates: {},
          stallTurns: 0,
          worldTurn: 3,
        },
      },
    },
  };
}

test('shouldSkipJudgementPreflight 对普通事件动作仍跳过关键词预检', async () => {
  const { shouldSkipJudgementPreflight } = await loadTs('../src/utils/judgementPreflight.ts');
  const line = '我运功疗伤，救下他不死。';
  assert.equal(shouldSkipJudgementPreflight({
    selectedSource: 'event_engine', selectedPlayerLine: line, userMessage: line,
  }), true);
});

test('合同判定签发 cultivate/severe 25，不走 if_only/100，也不套用自我疗伤', async () => {
  const {
    buildEventActionJudgementProposal,
    prepareEventActionJudgement,
    buildLocalJudgementPreflight,
  } = await loadTs('../src/utils/judgementPreflight.ts');
  const { resolvePendingJudgement, getJudgementState } = await loadTs('../src/utils/judgementEngine.ts');
  const { getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = fixture();
  const rescue = getCurrentStoryEventActions(save).find(item => item.actionId === 'rescue');
  assert.ok(rescue?.judgement, '救治按钮必须带显式判定合同');

  const keyword = buildLocalJudgementPreflight(rescue.actionText, save, 3);
  assert.equal(keyword?.kind, 'cultivate', '关键词路径只会当成普通疗伤，结构化点击还会被 skip 掉');
  const ifOnly = buildLocalJudgementPreflight(
    rescue.actionText,
    { 世界: { 状态: { 剧本模组: { modId: 'lcq.stage_01', activeEventIds: ['lcq.event.s01_04'] } } } },
    1,
  );
  assert.equal(ifOnly?.canonPolicy, 'if_only');
  assert.equal(ifOnly?.difficulty?.value, 100);

  const proposal = buildEventActionJudgementProposal(save, 3, rescue);
  assert.equal(proposal.kind, 'cultivate');
  assert.equal(proposal.difficulty.band, 'severe');
  assert.equal(proposal.difficulty.value, 25);
  assert.equal(proposal.canonPolicy, 'route_process_only');
  assert.equal(proposal.applyCultivationRecovery, false);
  assert.equal(proposal.authorityReceipt.kind, 'event_action_judgement');

  const issued = prepareEventActionJudgement(save, rescue, 3);
  assert.equal(issued.kind, 'issued');
  const hpBefore = save.角色.属性.气血.当前;
  const spiritBefore = save.角色.属性.神识.当前;
  const resolution = resolvePendingJudgement(save, issued.proposal.id, { currentTurn: 3, roll: () => 20 });
  assert.equal(resolution.status, 'resolved');
  assert.equal(save.角色.属性.气血.当前, hpBefore, '合同救治不得套用自我疗伤回血');
  assert.equal(save.角色.属性.神识.当前, spiritBefore - 20, '确认掷骰扣神识 5%');
  assert.equal(getJudgementState(save).pending, undefined);
});

test('取消判定无骰无神识，回到二选一；再点可重新签发', async () => {
  const { prepareEventActionJudgement } = await loadTs('../src/utils/judgementPreflight.ts');
  const { cancelPendingJudgement, getJudgementState } = await loadTs('../src/utils/judgementEngine.ts');
  const { getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = fixture();
  const rescue = getCurrentStoryEventActions(save).find(item => item.actionId === 'rescue');
  const issued = prepareEventActionJudgement(save, rescue, 3);
  const spiritBefore = save.角色.属性.神识.当前;
  const cancelled = cancelPendingJudgement(save, issued.proposal.id, 3);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.roll, undefined);
  assert.equal(save.角色.属性.神识.当前, spiritBefore);
  assert.equal(getJudgementState(save).pending, undefined);
  const actions = getCurrentStoryEventActions(save);
  assert.deepEqual(actions.map(item => item.actionId).sort(), ['observe', 'rescue']);
  const again = prepareEventActionJudgement(save, rescue, 4);
  assert.equal(again.kind, 'issued');
  assert.notEqual(again.proposal.id, issued.proposal.id);
});

test('已掷结果跨 JSON 读档锁定，不得重骰', async () => {
  const { prepareEventActionJudgement } = await loadTs('../src/utils/judgementPreflight.ts');
  const { resolvePendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');
  const { getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = fixture();
  const rescue = getCurrentStoryEventActions(save).find(item => item.actionId === 'rescue');
  const issued = prepareEventActionJudgement(save, rescue, 3);
  let rolls = 0;
  const first = resolvePendingJudgement(save, issued.proposal.id, {
    currentTurn: 3,
    roll: () => { rolls += 1; return 11; },
  });
  const reloaded = JSON.parse(JSON.stringify(save));
  const again = prepareEventActionJudgement(reloaded, rescue, 9);
  assert.equal(again.kind, 'resolved');
  assert.equal(again.resolution.id, first.id);
  assert.equal(again.resolution.roll, 11);
  const retried = resolvePendingJudgement(reloaded, first.id, {
    currentTurn: 9,
    roll: () => { rolls += 1; return 1; },
  });
  assert.equal(rolls, 1);
  assert.deepEqual(retried, first);
});

test('resolution 回传事件结算器；无回执不得当普通点击成功', async () => {
  const { prepareEventActionJudgement } = await loadTs('../src/utils/judgementPreflight.ts');
  const { resolvePendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = fixture();
  const rescue = getCurrentStoryEventActions(save).find(item => item.actionId === 'rescue');
  assert.equal(recordStoryEventStructuredAction(save, rescue).reason, 'judgement_required');
  const issued = prepareEventActionJudgement(save, rescue, 3);
  const resolution = resolvePendingJudgement(save, issued.proposal.id, { currentTurn: 3, testOutcome: 'success', roll: () => 12 });
  const result = recordStoryEventStructuredAction(save, rescue, { judgementResolution: resolution });
  assert.deepEqual(
    { attempted: result.attempted, completed: result.completed, outcome: result.outcome },
    { attempted: true, completed: true, outcome: 'success' },
  );
});

test('critical_failure 的神识 10% 覆盖 5%，不叠乘', async () => {
  const { prepareEventActionJudgement } = await loadTs('../src/utils/judgementPreflight.ts');
  const { resolvePendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');
  const { getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = fixture();
  const rescue = getCurrentStoryEventActions(save).find(item => item.actionId === 'rescue');
  const issued = prepareEventActionJudgement(save, rescue, 3);
  resolvePendingJudgement(save, issued.proposal.id, { currentTurn: 3, testOutcome: 'critical_failure', roll: () => 1 });
  assert.equal(save.角色.属性.神识.当前, 160);
});
