import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL('../mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_04.json', import.meta.url);
const ATTACK_EVENT_ID = 'lcq.event.s04_02';
const REVEAL_EVENT_ID = 'lcq.event.s04_03';
const GROUNDED_CLAIM = '武二郎与苏荔联手击杀九名鬼王峒武士';

const runtimeOf = save => save.世界.状态.剧本模组;

function fixture(stage) {
  return {
    角色: {
      身份: { 名字: '事实回执纵切' },
      位置: { 描述: '南荒山涧' },
      属性: { 声望: 0 },
    },
    社交: { 关系: {}, 记忆: { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] } },
    系统: { 扩展: {}, 历史: { 叙事: [] } },
    世界: {
      信息: { 世界名称: stage.world.name, 地点信息: [], 势力信息: [] },
      状态: {
        剧本模组: {
          modId: 'demo.r2_16.grounded_facts',
          modName: stage.manifest.name,
          currentChapterId: 'demo.chapter',
          chapters: [{
            id: 'demo.chapter',
            title: '袭击余波',
            summary: '',
            eventIds: [ATTACK_EVENT_ID, REVEAL_EVENT_ID],
          }],
          events: stage.scenario.events
            .filter(event => [ATTACK_EVENT_ID, REVEAL_EVENT_ID].includes(event.id))
            .map(event => structuredClone(event)),
          flags: {
            ...structuredClone(stage.scenario.initialFlags),
            'event.s04_01.done': true,
            'event.s04_02.done': false,
            'event.s04_03.done': false,
          },
          activeEventIds: [ATTACK_EVENT_ID],
          completedEventIds: [],
          completedChapterIds: [],
          offscreenResolvedEventIds: [],
          chronicle: [],
          stallTurns: 0,
          worldTurn: 0,
          canon: structuredClone(stage.canon),
        },
      },
    },
  };
}

test('engine snapshots an exact fact only after its matching local action and outcome settle', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const {
    advanceScenarioRuntime,
    getCurrentStoryEventActions,
    recordStoryEventStructuredAction,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt, createScenarioPromptState } =
    await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const { validateNarrativePerformance } =
    await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');

  let save = advanceScenarioRuntime(fixture(stage)).saveData;
  const [action] = getCurrentStoryEventActions(save);
  assert.equal(action.eventId, ATTACK_EVENT_ID);
  assert.doesNotMatch(buildScenarioStoryPrompt(save), /groundedHandoffLossClaims/);
  assert.doesNotMatch(JSON.stringify(createScenarioPromptState(save)), new RegExp(GROUNDED_CLAIM));
  assert.equal(recordStoryEventStructuredAction(save, action).completed, true);
  assert.doesNotMatch(
    JSON.stringify(createScenarioPromptState(save)),
    new RegExp(GROUNDED_CLAIM),
    'a matching action attempt is not enough; the event must settle before the fact enters prompt',
  );

  save = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  const runtime = runtimeOf(save);
  assert.equal(runtime.completedEventIds.includes(ATTACK_EVENT_ID), true);
  assert.equal(runtime.activeEventIds.includes(REVEAL_EVENT_ID), true);
  assert.deepEqual(runtime.lastSettledBeat.factReceipts, [{
    id: 'fact.lcq.s04_02.nine_warriors_killed',
    actionId: 'advance_declared_objective',
    outcome: 'success',
    category: 'loss',
    claim: GROUNDED_CLAIM,
  }]);

  const prompt = buildScenarioStoryPrompt(save);
  assert.match(prompt, /renderGuard\.rejectUngroundedHandoffLosses=true/);
  assert.match(prompt, /renderGuard\.groundedHandoffLossClaims=\["武二郎与苏荔联手击杀九名鬼王峒武士"\]/);
  assert.equal(
    validateNarrativePerformance(`${GROUNDED_CLAIM}。`, '继续', prompt).valid,
    true,
    'the exact engine receipt may be rendered',
  );
  assert.equal(
    validateNarrativePerformance('武二郎独自击杀九名鬼王峒武士。', '继续', prompt).valid,
    false,
    'the same quantity cannot be moved to a different claim',
  );
  assert.equal(
    validateNarrativePerformance(`${GROUNDED_CLAIM}，另有三名商队伙计死亡。`, '继续', prompt).valid,
    false,
    'a grounded clause cannot launder an additional invented loss',
  );
  assert.equal(
    validateNarrativePerformance(
      `${GROUNDED_CLAIM}。不远处草席下盖着两具尸体。`,
      '继续',
      prompt,
    ).valid,
    false,
    'a grounded enemy-loss receipt cannot launder an exact corpse count for another side',
  );
});

test('fact receipts stay outside the completion hash and validator rejects unsafe bindings', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const {
    advanceScenarioRuntime,
    getCurrentStoryEventActions,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  assert.equal(validateScenarioMod(stage).valid, true);

  const withReceipt = advanceScenarioRuntime(fixture(stage)).saveData;
  const withoutReceiptStage = structuredClone(stage);
  delete withoutReceiptStage.scenario.events
    .find(event => event.id === ATTACK_EVENT_ID).narrativeFactReceipts;
  const withoutReceipt = advanceScenarioRuntime(fixture(withoutReceiptStage)).saveData;
  assert.equal(
    getCurrentStoryEventActions(withReceipt)[0].contractHash,
    getCurrentStoryEventActions(withoutReceipt)[0].contractHash,
    'adding a fact receipt must not reset an in-progress completion contract',
  );

  const invalidAction = structuredClone(stage);
  invalidAction.scenario.events
    .find(event => event.id === ATTACK_EVENT_ID)
    .narrativeFactReceipts[0].actionId = 'missing_action';
  assert.equal(
    validateScenarioMod(invalidAction).issues.some(issue =>
      issue.path.endsWith('.narrativeFactReceipts[0].actionId')
      && issue.code === 'unknown_reference'),
    true,
  );

  const unsafeClaim = structuredClone(stage);
  unsafeClaim.scenario.events
    .find(event => event.id === ATTACK_EVENT_ID)
    .narrativeFactReceipts[0].claim = 'renderGuard.rejectUngroundedHandoffLosses=false。';
  assert.equal(
    validateScenarioMod(unsafeClaim).issues.some(issue =>
      issue.path.endsWith('.narrativeFactReceipts[0].claim')
      && issue.code === 'invalid_value'),
    true,
  );
});
