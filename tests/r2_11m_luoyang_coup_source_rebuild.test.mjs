import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const dataUrl = new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url);
const canonUrl = new URL('../mod-kit/generated/deepseek-v4-flash/character-canon/', import.meta.url);

const STAGE_ID = 'lyl.luoyang_coup';

/** 原文第 66 集《两宫交兵》章序，见 docs/R2-11M-QUARANTINE-LUOYANG-COUP-SOURCE-MAP-2026-07-21.md */
const SOURCE_ORDER = [
  'lyl.event.s06_01b',
  'lyl.event.s06_01',
  'lyl.event.s06_02',
  'lyl.event.s06_03',
  'lyl.event.s06_04',
  'lyl.event.s06_04b',
  'lyl.event.s06_05',
  'lyl.event.s06_06',
];

async function stage() {
  return JSON.parse(await readFile(new URL(`${STAGE_ID}.json`, dataUrl), 'utf8'));
}

function setNested(root, path, value) {
  const keys = path.split('.');
  let cursor = root;
  for (const key of keys.slice(0, -1)) cursor = cursor[key] ||= {};
  cursor[keys.at(-1)] = value;
}

/**
 * 只预完成本关来源顺序中的**前驱**事件。
 * 不能像批量夹具那样把所有其它事件标完成——本关章节的完成条件就是末拍 `s06_06.done`，
 * 一并标完成会让整章当场收束，被测事件反而不激活。
 */
function fixture(document, event) {
  const predecessors = document.scenario.events.filter(item =>
    SOURCE_ORDER.indexOf(item.id) < SOURCE_ORDER.indexOf(event.id));
  const flags = structuredClone(document.scenario.initialFlags);
  for (const item of predecessors) {
    for (const completion of item.completion || []) {
      if (completion.operator === 'eq' && completion.value === true && completion.path.startsWith('flags.')) {
        setNested(flags, completion.path.slice('flags.'.length), true);
      }
    }
  }
  const chapter = document.scenario.chapters.find(item => item.eventIds?.includes(event.id));
  return {
    // 到达≠完成：夹具把人放在被测事件的地点上，只验合同本身。
    角色: { 身份: { 名字: 'R2-11M洛都政变' }, 位置: { 描述: document.canon?.locations?.find(item => item.id === event.locationId)?.name || '长秋宫' }, 属性: { 声望: 0 } },
    社交: { 关系: {}, 记忆: { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] } },
    系统: { 扩展: {}, 历史: { 叙事: [] } },
    世界: {
      信息: { 世界名称: document.world.name, 地点信息: [], 势力信息: [] },
      状态: {
        剧本模组: {
          modId: document.manifest.id,
          modName: document.manifest.name,
          mode: 'strict',
          currentChapterId: chapter?.id,
          chapters: structuredClone(document.scenario.chapters),
          events: structuredClone(document.scenario.events),
          flags,
          activeEventIds: [event.id],
          completedEventIds: predecessors.map(item => item.id),
          completedChapterIds: [],
          offscreenResolvedEventIds: [],
          chronicle: [],
          stallTurns: 0,
          worldTurn: 0,
          nextStageId: document.manifest.nextStageId,
          canon: structuredClone(document.canon),
        },
      },
    },
  };
}

/** 全新存档：不预设任何完成标志，用来验证整章确实能从头走到尾。 */
function freshFixture(document) {
  const save = fixture(document, document.scenario.events.find(event => event.id === SOURCE_ORDER[0]));
  const runtime = save.世界.状态.剧本模组;
  runtime.flags = structuredClone(document.scenario.initialFlags);
  runtime.activeEventIds = [];
  runtime.completedEventIds = [];
  return save;
}

const runtimeOf = save => save.世界.状态.剧本模组;

test('rebuilt source order puts the Hanguang hall beat before the forged edict', async () => {
  const document = await stage();
  const events = document.scenario.events;
  assert.deepEqual(document.scenario.chapters[0].eventIds, SOURCE_ORDER);

  const byId = new Map(events.map(event => [event.id, event]));
  // 凌辱/治丧（源 280-281）先于矫诏（源 282）：旧数据把依赖方向写反了。
  assert.equal(byId.get('lyl.event.s06_01b').conditions[0].path, 'flags.chapter.lyl.luoyang_coup.started');
  assert.equal(byId.get('lyl.event.s06_01').conditions[0].path, 'flags.event.s06_01b.done');

  // 裁定 A：四拍原本错挂在源 278《游宫》，实际出自 279《弑君》/280《凌辱》。
  assert.equal(byId.get('lyl.event.s06_01b').axisId, 'yunlong.280.1');
  assert.equal(byId.get('lyl.event.s06_01b').axisAnchor, '六朝云龙吟·#280·凌辱');
  const binding = JSON.parse(await readFile(new URL('axis-binding.json', canonUrl), 'utf8'));
  const bySeq = new Map(binding.nodes.filter(node => node.book === 'yunlong').map(node => [node.seq, node]));
  assert.deepEqual(
    [890, 891, 892, 893].map(seq => bySeq.get(seq).axisId),
    ['yunlong.279.1', 'yunlong.280.1', 'yunlong.279.2', 'yunlong.279.3'],
  );
  assert.equal(binding.nodes.some(node => node.axisId?.startsWith('yunlong.278.')), false);
});

test('every rebuilt beat carries a hand-authored contract and none is mechanically migrated', async () => {
  const document = await stage();
  for (const event of document.scenario.events) {
    const contract = event.playerCompletionContract;
    assert.equal(contract?.kind, 'objective_action', event.id);
    assert.deepEqual(contract.settleOn, ['success'], event.id);
    assert.notEqual(contract.actions[0].id, 'advance_declared_objective', event.id);
    assert.equal(contract.actions.every(action => action.timeCost === 1), true, event.id);
  }
  // 裁定 D：三个与原文矛盾的目标已重写，不再把玩家推向违背正典的行动。
  const byId = new Map(document.scenario.events.map(event => [event.id, event]));
  assert.equal(/前往洛都宫中/.test(byId.get('lyl.event.s06_01').objective), false);
  assert.equal(/武库/.test(byId.get('lyl.event.s06_03').objective), false);
  assert.equal(/支援吕奉先/.test(byId.get('lyl.event.s06_06').objective), false);
  // 裁定 E：武库陷落属源 285《空饷》，不属 284《乱军》。
  assert.equal(/武库/.test(byId.get('lyl.event.s06_03').axisBeat), false);
  assert.equal(/武库/.test(byId.get('lyl.event.s06_04').axisBeat), true);
});

test('the negotiation offers two parallel refusals that settle on the same canon outcome', async () => {
  const document = await stage();
  const contract = document.scenario.events
    .find(event => event.id === 'lyl.event.s06_05').playerCompletionContract;
  const finals = contract.actions.filter(action => action.kind !== 'prepare');
  assert.equal(finals.length, 2);
  // 并列而非串联：两条拒绝共享同一前置，互不为前置。
  for (const action of finals) assert.deepEqual(action.requiresPreparation, ['sequence_step_2']);
  assert.equal(finals.some(action => action.grantsPreparation !== undefined), false);
});

test('the whole chapter is reachable in source order from a fresh save', async () => {
  const document = await stage();
  const { advanceScenarioRuntime, getCurrentStoryEventActions, recordStoryEventStructuredAction } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');

  let save = advanceScenarioRuntime(freshFixture(document)).saveData;
  const completionOrder = [];
  for (let guard = 0; guard < 64; guard += 1) {
    const actions = getCurrentStoryEventActions(save);
    if (!actions.length) break;
    const result = recordStoryEventStructuredAction(save, actions[0]);
    if (result.completed) completionOrder.push(actions[0].eventId);
    save = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  }

  // 补录的 s06_04b 没有轴序，只有排进事件链才会被引擎推到台前；
  // 否则整章会在它出现之前就由末拍 s06_06 收束，这一拍永远玩不到。
  assert.deepEqual(completionOrder, SOURCE_ORDER);
  assert.deepEqual(runtimeOf(save).completedChapterIds, ['lyl.chapter.luoyang_coup']);
  assert.deepEqual(runtimeOf(save).offscreenResolvedEventIds, []);
});

test('luoyang coup beats complete only through the engine and survive JSON reloads', async () => {
  const document = await stage();
  const {
    advanceScenarioRuntime,
    getCurrentStoryEventActions,
    recordStoryEventStructuredAction,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');

  for (const eventId of ['lyl.event.s06_01b', 'lyl.event.s06_04b', 'lyl.event.s06_06']) {
    const event = document.scenario.events.find(item => item.id === eventId);
    const steps = event.playerCompletionContract.actions;
    let save = advanceScenarioRuntime(fixture(document, event)).saveData;

    // LLM 直写完成真值必须被拒。
    const guarded = guardScenarioModCommands(save, [{
      action: 'set',
      key: `世界.状态.剧本模组.${event.completion[0].path}`,
      value: true,
    }]);
    assert.deepEqual(guarded.accepted, [], eventId);

    for (const [index, step] of steps.entries()) {
      // 同期可能有别的事件也在激活（如 s06_04b 与 s06_05 同时开），按事件挑自己的动作。
      const action = getCurrentStoryEventActions(save).find(item => item.actionId === step.id);
      assert.ok(action, `${eventId} step ${index + 1} action missing`);
      const result = recordStoryEventStructuredAction(save, action);
      assert.equal(result.outcome, 'success', eventId);
      assert.equal(result.completed, index === steps.length - 1, `${eventId} step ${index + 1}`);
      save = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
    }

    const left = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
    const right = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
    assert.equal(JSON.stringify(right), JSON.stringify(left), eventId);
    assert.equal(runtimeOf(left).completedEventIds.includes(eventId), true, eventId);
    assert.equal(runtimeOf(left).offscreenResolvedEventIds.includes(eventId), false, eventId);
  }
});

test('the stage stays quarantined from the default canon rail', async () => {
  const { isDefaultLineQuarantinedStageId } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  assert.equal(isDefaultLineQuarantinedStageId(STAGE_ID), true);
});
