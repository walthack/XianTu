import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

function eventAction(id, phrase) {
  return {
    id,
    label: `执行${id}`,
    actionText: `我执行${id}`,
    timeCost: 1,
    intentMatch: {
      matchAny: [phrase],
      rejectIf: ['丢下段强'],
    },
    outcomeText: {
      success: `${id}成功`,
      partial: `${id}部分成功`,
      failure: `${id}失败`,
    },
  };
}

function intentSave(actions, extraEvents = []) {
  const current = {
    id: 'event.demo.current',
    name: '眼前危局',
    description: '危险正在逼近。',
    objective: '带人寻找掩护',
    critical: true,
    completion: [{ path: 'flags.event.demo.current.done', operator: 'eq', value: true }],
    playerCompletionContract: {
      kind: 'objective_action',
      settleOn: ['success'],
      actions,
    },
  };
  return {
    世界: { 状态: { 剧本模组: {
      modId: 'demo.stage',
      worldTurn: 3,
      currentChapterId: 'demo.chapter',
      chapters: [{ id: 'demo.chapter', eventIds: [current.id, ...extraEvents.map(event => event.id)] }],
      events: [current, ...extraEvents],
      completedChapterIds: [],
      activeEventIds: [current.id],
      completedEventIds: [],
      flags: { 'event.demo.current.done': false },
    } } },
  };
}

test('specific natural action resolves to the current immutable event selection', async () => {
  const { resolveStoryEventActionFromPlayerText } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = intentSave([eventAction('protect_duan', '带段强找掩护')]);

  const resolved = resolveStoryEventActionFromPlayerText(save, '我带 段强，找掩护！');

  assert.equal(resolved?.eventId, 'event.demo.current');
  assert.equal(resolved?.actionId, 'protect_duan');
  assert.equal(resolved?.actionText, '我执行protect_duan');
  assert.equal(typeof resolved?.contractHash, 'string');
});

test('negation wins and generic or unmatched text stays free-form', async () => {
  const { resolveStoryEventActionFromPlayerText } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = intentSave([eventAction('protect_duan', '带段强找掩护')]);

  assert.equal(resolveStoryEventActionFromPlayerText(save, '我丢下段强，不带段强找掩护'), undefined);
  assert.equal(resolveStoryEventActionFromPlayerText(save, '我看看'), undefined);
  assert.equal(resolveStoryEventActionFromPlayerText(save, '我去检查远处的草丛'), undefined);
});

test('ambiguous authored matches fail closed', async () => {
  const { resolveStoryEventActionFromPlayerText } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = intentSave([
    eventAction('route_a', '带段强找掩护'),
    eventAction('route_b', '带段强找掩护'),
  ]);

  assert.equal(resolveStoryEventActionFromPlayerText(save, '带段强找掩护'), undefined);
});

test('resolver cannot select an inactive future event action', async () => {
  const { resolveStoryEventActionFromPlayerText } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const future = {
    id: 'event.demo.future',
    name: '未来事件',
    description: '尚未激活。',
    critical: true,
    completion: [{ path: 'flags.event.demo.future.done', operator: 'eq', value: true }],
    playerCompletionContract: {
      kind: 'objective_action',
      settleOn: ['success'],
      actions: [eventAction('future_action', '请求王哲诊治')],
    },
  };
  const save = intentSave([eventAction('protect_duan', '带段强找掩护')], [future]);

  assert.equal(resolveStoryEventActionFromPlayerText(save, '请求王哲诊治'), undefined);
});

test('existing exact structured selection still settles through the original local gate', async () => {
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = intentSave([eventAction('protect_duan', '带段强找掩护')]);
  const [selection] = getCurrentStoryEventActions(save);

  const result = recordStoryEventStructuredAction(save, selection);

  assert.equal(result.attempted, true);
  assert.equal(result.completed, true);
  assert.equal(result.actionId, 'protect_duan');
});
