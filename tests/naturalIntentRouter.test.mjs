import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

async function openingSave() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const playtest = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const stage01 = parseScenarioMod(JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url), 'utf8')));
  const save = rtm.advanceScenarioRuntime(playtest.createQingyuOpeningPlaytestSave(stage01)).saveData;
  const action = rtm.getCurrentStoryEventActions(save).find(item => item.eventId === 'lcq.event.s01_01');
  assert.ok(action);
  return { save, action };
}

test('button clicks skip the classifier and keep the selected action', async () => {
  const router = await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
  const { save, action } = await openingSave();
  let generateCalls = 0;
  const result = await router.resolveNaturalIntent({
    saveData: save,
    playerText: action.playerLine,
    selected: { playerLine: action.playerLine, actionText: action.actionText },
    generate: async () => {
      generateCalls += 1;
      return '{"actionId":"invented","evidence":"x","certainty":"high"}';
    },
  });
  assert.equal(result.kind, 'button');
  assert.equal(result.usedModel, false);
  assert.equal(generateCalls, 0);
});

test('pawn-phone negotiation does not match the south-pact contract and skips keyword combat', async () => {
  const router = await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
  const preflight = await loadTs('../src/utils/judgementPreflight.ts');
  const { save } = await openingSave();
  const result = await router.resolveNaturalIntent({
    saveData: save,
    playerText: '我押手机作担保，换三个月期限。',
    generate: async () => '{"actionId":"none","evidence":"押手机","certainty":"high"}',
  });
  assert.notEqual(result.kind, 'matched');
  assert.equal(result.skipKeywordPreflight, true);
  assert.equal(preflight.shouldSkipJudgementPreflight({
    skipPreflight: result.skipKeywordPreflight,
    userMessage: '我押手机作担保，换三个月期限。',
  }), true);
});

const pickOpening = evidence => async () => JSON.stringify({ actionId: 'advance_declared_objective', eventId: 'lcq.event.s01_01', evidence, certainty: 'high' });

function assertNarratedWithoutSettlement(result, reason) {
  assert.equal(result.kind, 'free', reason);
  assert.equal(result.selection, undefined, reason);
  assert.equal(result.skipKeywordPreflight, true, reason);
}

test('questions, hypotheticals and quotes of others narrate without settling even if the classifier picks an action', async () => {
  const router = await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
  const { save } = await openingSave();
  for (const [playerText, evidence] of [
    ['如果我拒绝呢？', '我拒绝'],
    ['她说我不赌。', '我不赌'],
    ['我并没有说我稳住自己。', '我稳住自己'],
    ['我稳住自己并弄清身在何处吗？', '我稳住自己并弄清身在何处'],
  ]) {
    const result = await router.resolveNaturalIntent({ saveData: save, playerText, generate: pickOpening(evidence) });
    assertNarratedWithoutSettlement(result, playerText);
    assert.equal(result.reason, 'non_affirmative_evidence', playerText);
  }
});

test('a plain statement next to a question still settles on its own clause', async () => {
  const router = await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
  const { save } = await openingSave();
  const result = await router.resolveNaturalIntent({
    saveData: save,
    playerText: '这是哪？我稳住自己并弄清身在何处。',
    generate: pickOpening('我稳住自己并弄清身在何处'),
  });
  assert.equal(result.kind, 'matched');
  assert.equal(result.selection?.actionId, 'advance_declared_objective');
});

test('scoped questions still reach the classifier instead of being bounced back to the player', async () => {
  const router = await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
  const { save } = await openingSave();
  for (const playerText of ['这霓龙丝是哪里产的？', '夫人今晚可有空喝一杯？', '如果你放我走，我就告诉你南荒的产地。', '她说得对，我点点头。']) {
    let calls = 0;
    const result = await router.resolveNaturalIntent({
      saveData: save,
      playerText,
      generate: async () => { calls += 1; return '{"actionId":"none","certainty":"high"}'; },
    });
    assert.equal(calls, 1, playerText);
    assertNarratedWithoutSettlement(result, playerText);
  }
});

test('outside the scoped window, questions pass through untouched', async () => {
  const router = await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
  for (const playerText of ['这霓龙丝是哪里产的？', '如果你放我走，我就告诉你。', '我不想赌。']) {
    const result = await router.resolveNaturalIntent({
      saveData: {},
      playerText,
      generate: async () => { throw new Error('unscoped input must not classify'); },
    });
    assert.equal(result.kind, 'free', playerText);
    assert.equal(result.skipKeywordPreflight, false, playerText);
  }
});

test('classifier failure and malformed output hold input; uncertain and invalid candidates do not settle', async () => {
  const router = await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
  const { save } = await openingSave();
  const cases = [
    ['我把手机押在桌上。', async () => { throw new Error('truncated'); }],
    ['我观察四周。', async () => 'not-json'],
    ['我观察四周。', async () => '{"actionId":"advance_declared_objective","evidence":"观察四周","certainty":"low"}'],
    ['我稳住自己并弄清身在何处。', async () => '{"actionId":"walk_out_wuyuan_shangguan","evidence":"我稳住自己并弄清身在何处","certainty":"high"}'],
    ['我稳住自己并弄清身在何处。', async () => '{"actionId":"advance_declared_objective","evidence":"模型编造的证据","certainty":"high"}'],
  ];
  for (const [index, [playerText, generate]] of cases.entries()) {
    const result = await router.resolveNaturalIntent({ saveData: save, playerText, generate });
    if (index < 2) {
      assert.equal(result.kind, 'failed');
      assert.equal(result.selection, undefined);
      assert.match(result.clarification, /重试/);
    } else assertNarratedWithoutSettlement(result, playerText);
  }
});

test('already-aborted signal does not classify', async () => {
  const router = await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
  const { save } = await openingSave();
  const controller = new AbortController();
  controller.abort();
  const result = await router.resolveNaturalIntent({
    saveData: save,
    playerText: '我观察四周。',
    signal: controller.signal,
    generate: async () => { throw new Error('should not generate after abort'); },
  });
  assert.equal(result.kind, 'failed');
  assert.equal(result.reason, 'aborted');
});
