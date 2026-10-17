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

test('修炼句和其他自由句一样交给意图模型：返回结果（含空票）就跳过旧预检，不再有修炼词例外', async () => {
  const router = await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
  const { save } = await openingSave();
  for (const playerText of ['我闭关修炼，冲击境界。', '我独自练功。']) {
    let generateCalls = 0;
    const result = await router.resolveNaturalIntent({
      saveData: save, playerText,
      generate: async () => { generateCalls += 1; return '{"actionId":"none","evidence":"","certainty":"high","statusProposals":[],"tickets":[]}'; },
    });
    assert.deepEqual([result.kind, result.skipKeywordPreflight, result.usedModel, generateCalls], ['free', true, true, 1], playerText);
  }
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

test('classifier failure on a contract chain holds input; uncertain and invalid candidates do not settle', async () => {
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
      // 固定事件链上识别失败：停下保留输入，常驻提示（用户裁定 2026-10-01，真机 fx-pact2）。
      assert.equal(result.kind, 'failed');
      assert.equal(result.selection, undefined);
      assert.equal(result.hold, true);
      assert.equal(result.clarification, router.NATURAL_INTENT_CONTRACT_HOLD);
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


test('classifier failure degrades to a non-settling free action only when nothing but local open-world actions is offered', async () => {
  const router = await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
  const local = router.onClassifierFailure('classifier_error', [{ source: 'open_world_engine', actionId: 'walk', label: '去点心铺' }]);
  assert.equal(local.kind, 'free');
  assert.equal(local.skipKeywordPreflight, false, '识别失败才回落旧关键词预检');
  assert.equal(local.unsettled, true, '回落的同时仍告诉叙事“未发生”');
  assert.equal(local.notice, router.NATURAL_INTENT_DEGRADED_NOTICE);
  assert.equal(router.onClassifierFailure('classifier_error', [{ source: 'open_world_engine', actionId: 'walk', label: '去点心铺' }], true).skipKeywordPreflight, true, '原话归自由行动变体时不回落');
  for (const source of ['event_engine', 'baihu_gamble_refusal_engine', 'opportunity_engine']) {
    const held = router.onClassifierFailure('malformed', [{ source: 'open_world_engine', actionId: 'walk', label: '去点心铺' }, { source, actionId: 'x', label: '合同动作' }]);
    assert.equal(held.kind, 'failed', source);
    assert.equal(held.hold, true, source);
  }
});

test('legacy V03 saves refresh only question-matcher metadata without resetting action progress', async () => {
  const runtimeModule = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const stage02 = JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_02.json', import.meta.url), 'utf8'));
  const eventId = 'lcq.event.ningyu_regicide_offer';
  const canonical = structuredClone(stage02.scenario.events.find(event => event.id === eventId));
  const saved = structuredClone(canonical);
  delete saved.playerCompletionContract.actions.find(action => action.id === 'hear_ningyu_regicide_price').intentMatch.allowInquiry;
  const priorAttempt = { actionId: 'hear_ningyu_regicide_price', outcome: 'success', attemptedAtTurn: 55, detail: 'existing progress' };
  const eventRuntime = {
    modId: 'lcq.stage_02',
    events: [saved],
    eventActionStates: {
      [eventId]: {
        contractHash: 'e23c70e6',
        attemptCount: 1,
        preparations: ['existing_preparation'],
        attempts: [priorAttempt],
        lastAttemptAtTurn: 55,
        lastOutcome: 'success',
      },
    },
  };

  const migrated = runtimeModule.reconcileNaturalIntentMetadata({ 世界: { 状态: { 剧本模组: eventRuntime } } }, stage02.scenario.events);

  assert.equal(migrated, 1);
  assert.equal(saved.playerCompletionContract.actions.find(action => action.id === 'hear_ningyu_regicide_price').intentMatch.allowInquiry, true);
  assert.equal(eventRuntime.eventActionStates[eventId].attemptCount, 1);
  assert.deepEqual(eventRuntime.eventActionStates[eventId].preparations, ['existing_preparation']);
  assert.deepEqual(eventRuntime.eventActionStates[eventId].attempts, [priorAttempt]);
  assert.notEqual(eventRuntime.eventActionStates[eventId].contractHash, 'e23c70e6');
});

test('shared intent response carries validated V07 semantics without a second model request', async () => {
 const router=await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');const {save}=await openingSave();
 const input='我连灌了几碗烈酒，头重脚轻，站都站不稳。';let calls=0;
 const result=await router.resolveNaturalIntent({saveData:save,playerText:input,generate:async request=>{
  calls++;const data=JSON.parse(request.userPrompt);assert.ok(data.statusCatalog.some(d=>d.id==='drunk'));
  assert.ok(data.statusCatalog.every(d=>d.evidenceFrom==='input'));assert.ok(!request.systemPrompt.includes('饮酒行为本身'));
  return JSON.stringify({actionId:'none',certainty:'high',statusProposals:[{statusId:'drunk',actor:'player',assertion:'current',source:'input',evidence:input,confidence:.99}]});
 }});
 assert.equal(calls,1);assert.equal(result.kind,'free');assert.deepEqual(result.freeTextStatusResolution.statusIds,['drunk']);
});

test('shared status proposals: absent legacy compatible; denied safe; uncertainty and malformed held',async()=>{
 const router=await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
 const text='我滴酒未沾，脑子清醒得很。';
 for(const [field,expected] of [[undefined,'free'],[[],'free'],[[{statusId:'drunk',actor:'player',assertion:'denied',source:'input',evidence:text,confidence:.99}],'free'],[null,'unclear'],[[{statusId:'drunk',actor:'unknown',assertion:'uncertain',source:'input',evidence:text,confidence:.99}],'unclear'],[[{statusId:'invented',actor:'player',assertion:'current',source:'input',evidence:text,confidence:.99}],'unclear']]){
  const {save}=await openingSave();const result=await router.resolveNaturalIntent({saveData:save,playerText:text,generate:async()=>JSON.stringify({actionId:'none',certainty:'high',statusProposals:field})});
  assert.equal(result.kind,expected);if(expected==='unclear'){assert.equal(result.hold,true);assert.equal(result.selection,undefined);assert.deepEqual(result.freeTextStatusResolution.statusIds,[]);}else if(field!==undefined)assert.deepEqual(result.freeTextStatusResolution.statusIds,[]);else assert.equal(result.freeTextStatusResolution,undefined);
 }
});

test('shared status recognition never bypasses snapshot validation or fast paths',async()=>{
 const router=await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');const {save,action}=await openingSave();
 const result=await router.resolveNaturalIntent({saveData:save,playerText:'我试着描述自己的状态。',generate:async()=>{
  save.世界.状态.剧本模组.worldTurn++;
  return JSON.stringify({actionId:'none',certainty:'high',statusProposals:[]});
 }});assert.equal(result.reason,'state_changed');assert.equal(result.freeTextStatusResolution,undefined);
 const quick=await router.resolveNaturalIntent({saveData:save,playerText:action.playerLine,selected:{playerLine:action.playerLine,actionText:action.actionText},generate:async()=>{throw Error('must not call');}});assert.equal(quick.kind,'button');assert.equal(quick.freeTextStatusResolution,undefined);
});


test('no action candidates still permit independent status recognition with the configured request',async()=>{
 const router=await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');const {save}=await openingSave();
 save.世界.状态.剧本模组.activeEventIds=[];
 assert.equal(router.listNaturalIntentCandidates(save).length,0);
 let calls=0;const input='我喝醉了。';
 const r=await router.resolveNaturalIntent({saveData:save,playerText:input,generate:async q=>{
  calls++;assert.deepEqual(JSON.parse(q.userPrompt).candidates,[]);
  return JSON.stringify({actionId:'none',certainty:'high',statusProposals:[{statusId:'drunk',actor:'player',assertion:'current',source:'input',evidence:input,confidence:0.99}]});
 }});
 assert.equal(calls,1);assert.equal(r.kind,'free');assert.deepEqual(r.freeTextStatusResolution.statusIds,['drunk']);assert.equal(r.selection,undefined);
});
