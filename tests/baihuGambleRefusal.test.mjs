import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';

import { createPinia, setActivePinia } from 'pinia';

import { loadTs } from './loadTs.mjs';

const pipelineJiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: {
    '@': fileURLToPath(new URL('../src', import.meta.url)),
    '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
  },
});

async function loadPipelineTs(relativePath) {
  return pipelineJiti.import(new URL(relativePath, import.meta.url).pathname);
}

if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
  };
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (!globalThis.window.location) globalThis.window.location = { hostname: 'localhost', href: 'http://localhost/' };

const stage01Url = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url);
const stage02Url = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_02.json', import.meta.url);
const TAKE_MANDATE = 'opportunity.lcq.s02_01.take_full_mandate';
const PAOLAO = 'refuse_term_take_paolao';
const STAGE02_BEATS = [
  'lcq.event.s02_01',
  'lcq.event.s02_03',
  'lcq.event.s02_02',
  'lcq.event.s02_04',
  'lcq.event.s02_05',
  'lcq.event.s02_06',
  'lcq.event.ningyu_enters_gamble',
  'lcq.event.sudaji_south_pact',
  'lcq.event.gamble_bond_signed',
  'lcq.event.charge_sudaji_fee',
  'lcq.event.free_ajiman',
];

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function runtimeOf(save) {
  return save.世界.状态.剧本模组;
}

function copyPlaytestMarker(fromSave, toSave) {
  const marker = cloneJson(fromSave?.系统?.扩展?.清羽记开局);
  assert.equal(marker?.kind, 'qingyu-demo-v1');
  toSave.系统 = toSave.系统 || {};
  toSave.系统.扩展 = toSave.系统.扩展 || {};
  toSave.系统.扩展.清羽记开局 = marker;
}

async function loadMods() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const [raw01, raw02] = await Promise.all([readFile(stage01Url, 'utf8'), readFile(stage02Url, 'utf8')]);
  return {
    stage01: parseScenarioMod(JSON.parse(raw01)),
    stage02: parseScenarioMod(JSON.parse(raw02)),
  };
}

async function loadTools() {
  const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const playtest = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const landing = await loadTs('../src/modules/scenarioMods/xingyuehuLandingPlaytest.ts');
  const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const wuyuan = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
  const refusal = await loadTs('../src/modules/scenarioMods/baihuGambleRefusal.ts');
  const story = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const narrative = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
  const preflight = await loadTs('../src/utils/judgementPreflight.ts');
  return { rtm, playtest, landing, init, wuyuan, refusal, story, narrative, preflight };
}

function contractSelection(rtm, save) {
  const event = rtm.getScenarioFocusEvent(runtimeOf(save));
  const contractIds = new Set((event?.playerCompletionContract?.actions || []).map(action => action.id));
  const actions = rtm.getCurrentStoryEventActions(save);
  // 到达≠完成：人不在本拍地点时先走罗盘移动，到场后下一步才是合同动作。
  return actions.find(item => contractIds.has(item.actionId))
    || actions.find(item => item.actionId.startsWith('travel:'));
}

function recordAndReload(rtm, save, selection) {
  const result = rtm.recordStoryEventStructuredAction(save, selection);
  const reloaded = rtm.advanceScenarioRuntime(cloneJson(save)).saveData;
  return { save: reloaded, result };
}

function proposeGamble(tools, save) {
  const selection = tools.rtm.getCurrentStoryEventActions(save)
    .find(item => item.actionId === 'see_ningyu_sent_into_gamble');
  assert.ok(selection, '拒赌窗口应等凝羽入局准备步之后');
  return recordAndReload(tools.rtm, save, selection).save;
}

async function earnStage02(tools, mods) {
  const { rtm, playtest, init } = tools;
  let save = playtest.createQingyuOpeningPlaytestSave(mods.stage01);
  for (let step = 0; step < 40; step += 1) {
    const rt = runtimeOf(save);
    if (rt.nextStageReadyId === 'lcq.stage_02') break;
    const selection = contractSelection(rtm, save);
    assert.ok(selection, `stage_01 第 ${step + 1} 步应有合同动作`);
    save = recordAndReload(rtm, save, selection).save;
  }
  assert.equal(runtimeOf(save).nextStageReadyId, 'lcq.stage_02');
  const markerSource = cloneJson(save);
  const transitioned = init.transitionToNextScenarioStage(save, [mods.stage02]);
  assert.equal(transitioned.ok, true, transitioned.reason);
  save = transitioned.saveData;
  if (save.系统?.扩展?.清羽记开局?.kind !== 'qingyu-demo-v1') {
    copyPlaytestMarker(markerSource, save);
  }
  save = rtm.advanceScenarioRuntime(cloneJson(save)).saveData;
  assert.equal(runtimeOf(save).modId, 'lcq.stage_02');
  return save;
}

function playOpenWorld(tools, save, selection) {
  const { rtm, wuyuan } = tools;
  const settled = wuyuan.settleWuyuanOpenWorldSelection(save, selection);
  assert.equal(settled.settled, true, settled.reason);
  return rtm.advanceScenarioRuntime(cloneJson(save)).saveData;
}

function completeS0204ViaPastry(tools, save) {
  const { wuyuan } = tools;
  let current = save;
  const arrive = wuyuan.resolveWuyuanOpenWorldSelectionFromText(current, '我去五原城。')
    || wuyuan.getWuyuanOpenWorldSelections(current).find(item => item.identityId === wuyuan.WUYUAN_MARKET_ARRIVAL_ID);
  if (arrive) current = playOpenWorld(tools, current, arrive);
  const travel = wuyuan.getWuyuanOpenWorldSelections(current).find(item => item.kind === 'travel');
  current = playOpenWorld(tools, current, travel);
  const local = wuyuan.getWuyuanOpenWorldSelections(current).find(item => item.kind === 'problem_action');
  current = playOpenWorld(tools, current, local);
  assert.ok(runtimeOf(current).completedEventIds.includes('lcq.event.s02_04'));
  return current;
}

function takeSilkMandate(rtm, save) {
  const tracked = rtm.trackStoryOpportunity(save, TAKE_MANDATE);
  assert.equal(tracked.ok, true, tracked.reason || 's02_01 必须能追踪整份托付');
  for (let step = 0; step < 4; step += 1) {
    const [selection] = rtm.getTrackedStoryOpportunityActions(save);
    if (!selection) break;
    const result = rtm.recordStoryOpportunityStructuredAction(save, selection);
    assert.equal(result.progressed, true, result.reason || selection.actionId);
    save = rtm.advanceScenarioRuntime(cloneJson(save)).saveData;
  }
  return save;
}

async function walkFrom(tools, save, stopEventId) {
  const { rtm } = tools;
  for (const beat of STAGE02_BEATS) {
    if (beat === stopEventId) {
      assert.ok(
        runtimeOf(save).activeEventIds.includes(beat),
        `应停在 ${beat}，实际 active=${JSON.stringify(runtimeOf(save).activeEventIds)}`,
      );
      return save;
    }
    if (runtimeOf(save).completedEventIds.includes(beat)) continue;
    assert.ok(runtimeOf(save).activeEventIds.includes(beat), `下一拍应是 ${beat}`);
    if (beat === 'lcq.event.s02_01') save = takeSilkMandate(rtm, save);
    if (beat === 'lcq.event.s02_04') {
      save = completeS0204ViaPastry(tools, save);
    } else {
      for (let step = 0; step < 8; step += 1) {
        if (runtimeOf(save).completedEventIds.includes(beat)) break;
        const selection = contractSelection(rtm, save);
        assert.ok(selection, `${beat} 第 ${step + 1} 步没有合同动作`);
        assert.equal(selection.eventId, beat);
        assert.notEqual(selection.actionId, PAOLAO);
        const settled = recordAndReload(rtm, save, selection);
        assert.equal(settled.result.attempted, true, settled.result.reason);
        save = settled.save;
      }
    }
    assert.ok(runtimeOf(save).completedEventIds.includes(beat), `${beat} 必须结清`);
  }
  throw new Error(`未走到 ${stopEventId}`);
}

let fixtures;

test.before(async () => {
  const tools = await loadTools();
  const mods = await loadMods();
  let save = await earnStage02(tools, mods);
  const atS0206 = await walkFrom(tools, save, 'lcq.event.s02_06');
  const atNingyu = await walkFrom(tools, cloneJson(atS0206), 'lcq.event.ningyu_enters_gamble');
  const atProposed = proposeGamble(tools, cloneJson(atNingyu));
  const atPact = await walkFrom(tools, cloneJson(atNingyu), 'lcq.event.sudaji_south_pact');
  const atBond = await walkFrom(tools, cloneJson(atPact), 'lcq.event.gamble_bond_signed');
  fixtures = { tools, mods, atS0206, atNingyu, atProposed, atPact, atBond };
});

function at(event) {
  return cloneJson(fixtures[event]);
}

function settleRefusal(tools, save, text) {
  const { rtm, refusal } = tools;
  const selection = refusal.resolveBaihuGambleRefusalFromText(save, text);
  assert.ok(selection, `应识别拒赌/冲突输入：${text}`);
  const result = refusal.settleBaihuGambleRefusalSelection(save, selection);
  assert.equal(result.settled, true, result.reason);
  return {
    save: rtm.advanceScenarioRuntime(cloneJson(save)).saveData,
    result,
    selection,
  };
}

function assertNoAccomplishedLossOrBond(text) {
  assert.equal(
    /你已签下卖身契|此局已判我落败|赌局落败后，我面对|落入白湖商馆奴籍|成为白湖商馆的奴隶/.test(text),
    false,
    text,
  );
}

test('explicit refuse phrases match; questions, hypotheticals, quotes and negations do not', async () => {
  const { refusal } = fixtures.tools;
  for (const line of [
    '赌就不必了',
    '不赌了',
    '我拒绝赌局',
    '我不参加赌局',
    '我说赌就不必了',
    '我没去碰骰盅，朝苏妲己摇摇头：“夫人，这场赌就不必了，我不赌。”',
  ]) {
    assert.equal(refusal.isExplicitRefuseGambleText(line), true, line);
  }
  for (const line of [
    '',
    '我看看',
    '赌就不必了？',
    '难道不赌了吗',
    '如果不参加赌局呢',
    '要是赌就不必了',
    '凝羽说赌就不必了',
    '她说我不参加赌局',
    '我不是不赌',
    '并没有拒绝赌局',
    '不得不赌',
    '我拒绝南荒之约',
    '我还没决定要不要拒绝赌局',
    '我没有说不赌了',
    '他问我是不是不赌了',
    '我不赌了才怪',
    '我并不是要拒绝赌局',
    '我说他拒绝赌局',
    '我说她不赌了',
    '她说：“这场赌就不必了”',
    '她说「我不赌」',
  ]) {
    assert.equal(refusal.isExplicitRefuseGambleText(line), false, line);
  }
});

test('non-gamble windows do not resolve refuse-gamble text', async () => {
  const { refusal } = fixtures.tools;
  const atHall = at('atS0206');
  assert.equal(refusal.resolveBaihuGambleRefusalFromText(atHall, '赌就不必了'), undefined);
  assert.equal(refusal.getBaihuGambleRefusalSelections(atHall).length, 0);
  const pact = at('atPact');
  assert.equal(refusal.resolveBaihuGambleRefusalFromText(pact, '赌就不必了'), undefined);
});

test('south-pact current legal actions are nylon-term, not refuse-only; pawn-phone does not settle', async () => {
  const router = await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
  const preflight = await loadTs('../src/utils/judgementPreflight.ts');
  const save = at('atPact');
  const candidates = router.listNaturalIntentCandidates(save);
  const actionIds = candidates.map(item => item.actionId);
  assert.ok(actionIds.includes('offer_nylon_clue_for_term'), `south-pact candidates=${actionIds.join(',')}`);
  assert.equal(actionIds.includes('refuse_gamble'), false);
  assert.equal(candidates.some(item => item.source === 'event_engine'), true);

  const pawn = await router.resolveNaturalIntent({
    saveData: save,
    playerText: '我押手机作担保，换三个月期限。',
    generate: async () => '{"actionId":"none","evidence":"押手机","certainty":"high"}',
  });
  assert.equal(pawn.kind, 'free');
  assert.equal(pawn.selection, undefined);
  assert.equal(pawn.skipKeywordPreflight, true);
  assert.equal(preflight.shouldSkipJudgementPreflight({
    skipPreflight: pawn.skipKeywordPreflight,
    userMessage: '我押手机作担保，换三个月期限。',
  }), true);

  const matched = await router.resolveNaturalIntent({
    saveData: save,
    playerText: '我用霓龙丝产地线索换三个月期限。',
    generate: async () => JSON.stringify({
      actionId: 'offer_nylon_clue_for_term',
      source: 'event_engine',
      eventId: 'lcq.event.sudaji_south_pact',
      evidence: '霓龙丝产地线索',
      certainty: 'high',
    }),
  });
  assert.equal(matched.kind, 'alias');
  assert.equal(matched.usedModel, false);
  assert.equal(matched.selection?.actionId, 'offer_nylon_clue_for_term');
  assert.equal(matched.selection?.eventId, 'lcq.event.sudaji_south_pact');
});

test('refusal window keeps event acceptance candidates alongside refuse', async () => {
  const router = await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
  const save = at('atProposed');
  const candidates = router.listNaturalIntentCandidates(save);
  const sources = new Set(candidates.map(item => item.source));
  assert.ok(sources.has('baihu_gamble_refusal_engine'));
  assert.ok(sources.has('event_engine'), 'acceptance/event actions must remain classifiable');
  assert.ok(candidates.some(item => item.actionId === 'refuse_gamble'));
  assert.ok(candidates.some(item => item.actionId === 'answer_ningyu_on_debut'));
  const wrongHash = await router.resolveNaturalIntent({
    saveData: save,
    playerText: '我当面回应凝羽。',
    generate: async () => JSON.stringify({
      actionId: 'answer_ningyu_on_debut',
      source: 'event_engine',
      eventId: 'lcq.event.ningyu_enters_gamble',
      contractHash: 'not-the-candidate-hash',
      evidence: '当面回应凝羽',
      certainty: 'high',
    }),
  });
  assert.equal(wrongHash.kind, 'free');
  assert.equal(wrongHash.selection, undefined);

  const refuse = candidates.find(item => item.actionId === 'refuse_gamble');
  const pickRefuse = evidence => async () => JSON.stringify({
    actionId: 'refuse_gamble', source: refuse.source, eventId: refuse.eventId, evidence, certainty: 'high',
  });
  for (const [playerText, evidence] of [
    ['我不想赌。', '我不想赌'],
    ['你凭什么逼我赌？我不赌。', '我不赌'],
    ['我没去碰骰盅，朝苏妲己摇摇头：“夫人，这场赌就不必了，我不赌。”', '这场赌就不必了'],
  ]) {
    const hit = await router.resolveNaturalIntent({ saveData: save, playerText, generate: pickRefuse(evidence) });
    assert.equal(hit.selection?.actionId, 'refuse_gamble', playerText);
  }
  for (const [playerText, evidence] of [
    ['如果我拒绝呢？', '我拒绝'],
    ['这赌局非玩不可吗？', '这赌局非玩不可'],
    ['凝羽说我不赌。', '我不赌'],
    ['我并没有说我不赌。', '我不赌'],
  ]) {
    const miss = await router.resolveNaturalIntent({ saveData: save, playerText, generate: pickRefuse(evidence) });
    assert.equal(miss.kind, 'free', playerText);
    assert.equal(miss.selection, undefined, playerText);
  }
});

test('landing overlay still applies refuse rejectIf on the default gamble actions', async () => {
  const { tools, mods } = fixtures;
  const overlay = tools.landing.overlayXingyuehuLandingPlaytestStage(cloneJson(mods.stage02));
  const bond = overlay.scenario.events.find(item => item.id === 'lcq.event.gamble_bond_signed');
  const confirm = bond.playerCompletionContract.actions.find(item => item.id === 'confirm_rigged_wager_loss');
  assert.ok(confirm.intentMatch.rejectIf.includes('赌就不必了'));
  assert.ok(tools.landing.createXingyuehuLandingPlaytestSave([mods.stage01]).系统.扩展.星月湖落地连续试玩);
});

test('refuse button waits until the gamble is locally proposed', async () => {
  const { refusal } = fixtures.tools;
  const early = at('atNingyu');
  assert.equal(refusal.isBaihuGambleRefusalWindow(early), false);
  assert.equal(refusal.getBaihuGambleRefusalSelections(early).length, 0);
  assert.equal(refusal.resolveBaihuGambleRefusalFromText(early, '赌就不必了'), undefined);
  const proposed = at('atProposed');
  assert.equal(refusal.isBaihuGambleRefusalWindow(proposed), true);
  assert.ok(refusal.getBaihuGambleRefusalSelections(proposed).find(item => item.actionId === 'refuse_gamble'));
});

test('click and natural refuse enter capture, then three responses detain without a lost wager or signed bond', async () => {
  const { rtm, refusal, story, narrative, preflight } = fixtures.tools;
  let save = at('atProposed');

  assert.equal(refusal.isBaihuGambleRefusalWindow(save), true);
  const button = refusal.getBaihuGambleRefusalSelections(save).find(item => item.actionId === 'refuse_gamble');
  assert.ok(button);
  assert.equal(refusal.resolveBaihuGambleRefusalFromText(save, '赌就不必了')?.actionId, 'refuse_gamble');
  assert.equal(refusal.resolveBaihuGambleRefusalFromText(save, '我不参加赌局')?.actionId, 'refuse_gamble');
  assert.equal(
    refusal.resolveBaihuGambleRefusalFromText(save, '我没去碰骰盅，朝苏妲己摇摇头：“夫人，这场赌就不必了，我不赌。”')?.actionId,
    'refuse_gamble',
  );
  assert.equal(preflight.shouldSkipJudgementPreflight({
    selectedSource: 'baihu_gamble_refusal_engine',
    userMessage: '我反抗',
  }), true);

  const captured = settleRefusal(fixtures.tools, save, '赌就不必了');
  save = captured.save;
  assert.equal(captured.result.phase, 'capture_ordered');
  assert.equal(refusal.readBaihuGambleRefusal(save).phase, 'capture_ordered');
  assert.equal(rtm.getCurrentStoryEventActions(save).length, 0);
  const responses = refusal.getBaihuGambleRefusalSelections(save).map(item => item.actionId).sort();
  assert.deepEqual(responses, ['flee', 'resist', 'yield']);
  const promptAtCapture = story.buildScenarioStoryPrompt(save);
  assert.match(promptAtCapture, /明确拒绝与苏妲己对赌/);
  assertNoAccomplishedLossOrBond(promptAtCapture);

  const detained = settleRefusal(fixtures.tools, save, '我反抗');
  save = detained.save;
  const ledger = refusal.readBaihuGambleRefusal(save);
  assert.equal(ledger.phase, 'detained');
  assert.equal(ledger.response, 'resist');
  assert.equal(ledger.gambled, false);
  assert.equal(ledger.signedBond, false);
  assert.equal(ledger.hallControlled, true);
  const rt = runtimeOf(save);
  assert.equal(rt.flags['event.gamble_bond_signed.refused_capture'], true);
  assert.equal(rt.flags['world.baihu.never_gambled'], true);
  assert.ok(rt.completedEventIds.includes('lcq.event.ningyu_enters_gamble'));
  assert.ok(rt.completedEventIds.includes('lcq.event.gamble_bond_signed'));
  assert.equal(rt.completedEventIds.includes('lcq.event.sudaji_south_pact'), false);
  assert.ok(rt.activeEventIds.includes('lcq.event.sudaji_south_pact'));
  const viewed = narrative.resolveScenarioEventNarrative(
    rt.events.find(item => item.id === 'lcq.event.gamble_bond_signed'),
    rt.flags,
  );
  assert.match(viewed.name, /拒赌后被商馆扣押/);
  assert.equal(
    /你已签下卖身契|此局已判我落败|赌局落败后|成为白湖商馆的奴隶/.test(`${viewed.name}${viewed.description}${viewed.objective}`),
    false,
  );
  const prompt = story.buildScenarioStoryPrompt(save);
  assert.match(prompt, /并未入局、并未赌输、并未签卖身契/);
  assertNoAccomplishedLossOrBond(prompt);
});

test('flee and yield keep distinct process receipts but the same detention outcome', async () => {
  const { refusal, rtm } = fixtures.tools;

  for (const [line, response] of [['尝试逃跑', 'flee'], ['我服软', 'yield'], ['我举起双手，任凭处置', 'yield']]) {
    // 用户裁定 2026-10-02：拒赌窗口只在凝羽入局这一拍新开，故从 atProposed 拒赌。
    let save = at('atProposed');
    save = settleRefusal(fixtures.tools, save, '不赌了').save;
    const result = settleRefusal(fixtures.tools, save, line);
    save = result.save;
    const ledger = refusal.readBaihuGambleRefusal(save);
    assert.equal(ledger.response, response, line);
    assert.ok(ledger.receipts.some(item => item.kind === response));
    assert.equal(ledger.gambled, false);
    assert.equal(ledger.signedBond, false);
    assert.equal(runtimeOf(save).flags['event.gamble_bond_signed.refused_capture'], true);
    assert.ok(runtimeOf(save).activeEventIds.includes('lcq.event.sudaji_south_pact'));
    const pact = contractSelection(rtm, save);
    assert.equal(pact?.eventId, 'lcq.event.sudaji_south_pact');
  }
});

test('accept-gamble default path is unchanged and later refuse text cannot rewind a finished loss', async () => {
  const { rtm, refusal } = fixtures.tools;
  let save = at('atBond');
  // 用户裁定 2026-10-02：契书拍不再新开拒赌窗口。
  assert.equal(refusal.getBaihuGambleRefusalSelections(save).some(item => item.actionId === 'refuse_gamble'), false);

  for (const actionId of ['confirm_rigged_wager_loss', 'sign_the_bond']) {
    const selection = rtm.getCurrentStoryEventActions(save).find(item => item.actionId === actionId);
    assert.ok(selection, actionId);
    save = recordAndReload(rtm, save, selection).save;
  }
  assert.ok(runtimeOf(save).completedEventIds.includes('lcq.event.gamble_bond_signed'));
  assert.equal(refusal.readBaihuGambleRefusal(save), undefined);
  assert.equal(runtimeOf(save).flags['event.gamble_bond_signed.refused_capture'], undefined);
  const bond = runtimeOf(save).events.find(item => item.id === 'lcq.event.gamble_bond_signed');
  assert.match(bond.name, /卖身契|落败/);
  assert.equal(refusal.resolveBaihuGambleRefusalFromText(save, '赌就不必了'), undefined);
  assert.equal(runtimeOf(save).flags['world.baihu.never_gambled'], undefined);
});

test('confirming the rigged loss makes refuse-gamble too late', async () => {
  const { rtm, refusal } = fixtures.tools;
  let save = at('atBond');
  const confirm = rtm.getCurrentStoryEventActions(save).find(item => item.actionId === 'confirm_rigged_wager_loss');
  save = recordAndReload(rtm, save, confirm).save;
  assert.equal(refusal.isBaihuGambleRefusalWindow(save), false);
  assert.equal(refusal.resolveBaihuGambleRefusalFromText(save, '赌就不必了'), undefined);
  const sign = rtm.getCurrentStoryEventActions(save).find(item => item.actionId === 'sign_the_bond');
  assert.ok(sign);
});

test('idempotent replay, JSON reload, stale default clicks, and south-pact fatal ending stay intact', async () => {
  const { rtm, refusal } = fixtures.tools;
  let save = at('atProposed');
  const liveDefault = rtm.getCurrentStoryEventActions(save).find(item => item.source === 'event_engine');
  assert.ok(liveDefault, 'capture 前必须拿到真实默认合同动作，不能用伪 hash');
  assert.equal(liveDefault.eventId, 'lcq.event.ningyu_enters_gamble');

  const first = settleRefusal(fixtures.tools, save, '我拒绝赌局');
  save = first.save;
  const capturedDefault = rtm.recordStoryEventStructuredAction(save, liveDefault);
  assert.equal(capturedDefault.attempted, false);
  assert.equal(capturedDefault.completed, false);
  assert.equal(capturedDefault.reason, 'gamble_refusal_capture');
  assert.notEqual(runtimeOf(save).flags['event.ningyu_enters_gamble.done'], true);
  assert.equal(runtimeOf(save).completedEventIds.includes('lcq.event.ningyu_enters_gamble'), false);

  const again = refusal.settleBaihuGambleRefusalSelection(save, first.selection);
  assert.equal(again.settled, true);
  assert.equal(again.idempotent, true);

  const dumped = JSON.parse(JSON.stringify(save));
  const reloaded = rtm.advanceScenarioRuntime(dumped).saveData;
  assert.equal(refusal.readBaihuGambleRefusal(reloaded).phase, 'capture_ordered');
  const fleeSelection = refusal.resolveBaihuGambleRefusalFromText(reloaded, '尝试逃跑');
  assert.ok(fleeSelection);
  const firstFlee = refusal.settleBaihuGambleRefusalSelection(reloaded, fleeSelection);
  assert.equal(firstFlee.settled, true);
  assert.equal(firstFlee.idempotent, false);
  const replaySameWindow = refusal.settleBaihuGambleRefusalSelection(reloaded, fleeSelection);
  assert.equal(replaySameWindow.settled, true);
  assert.equal(replaySameWindow.idempotent, true);
  assert.equal(refusal.readBaihuGambleRefusal(reloaded).receipts.filter(item => item.kind === 'flee').length, 1);

  save = rtm.advanceScenarioRuntime(cloneJson(reloaded)).saveData;
  assert.equal(refusal.readBaihuGambleRefusal(save).response, 'flee');
  assert.equal(runtimeOf(save).flags['event.gamble_bond_signed.refused_capture'], true);
  const afterFocusMoved = refusal.settleBaihuGambleRefusalSelection(save, fleeSelection);
  assert.equal(afterFocusMoved.settled, false);
  assert.equal(afterFocusMoved.idempotent, false);

  const forgedYield = {
    ...fleeSelection,
    actionId: 'yield',
    actionText: '我先服软受押，不硬拼。',
  };
  const incompatible = refusal.settleBaihuGambleRefusalSelection(save, forgedYield);
  assert.equal(incompatible.settled, false);
  assert.equal(incompatible.idempotent, false);
  assert.equal(incompatible.reason, 'stale_selection');
  assert.equal(refusal.readBaihuGambleRefusal(save).response, 'flee');

  const lateRefuse = refusal.settleBaihuGambleRefusalSelection(save, first.selection);
  assert.equal(lateRefuse.settled, false);
  assert.equal(lateRefuse.idempotent, false);

  const otherEvent = {
    ...fleeSelection,
    eventId: 'lcq.event.sudaji_south_pact',
  };
  const wrongEvent = refusal.settleBaihuGambleRefusalSelection(save, otherEvent);
  assert.equal(wrongEvent.settled, false);
  assert.equal(wrongEvent.idempotent, false);

  assert.equal(refusal.resolveBaihuGambleRefusalFromText(save, '我反抗并逃跑'), undefined);
  assert.equal(refusal.resolveBaihuGambleRefusalFromText(save, '如果我逃跑会怎样'), undefined);
  assert.equal(refusal.resolveBaihuGambleRefusalFromText(save, '我不想逃走'), undefined);
  assert.equal(refusal.resolveBaihuGambleRefusalFromText(save, '我不想服软'), undefined);
  let pactSave = at('atPact');
  assert.equal(refusal.resolveBaihuGambleRefusalFromText(pactSave, '赌就不必了'), undefined);
  const fatal = rtm.getCurrentStoryEventActions(pactSave).find(item => item.actionId === PAOLAO);
  assert.ok(fatal);
  const over = rtm.recordStoryEventStructuredAction(pactSave, fatal);
  assert.equal(over.attempted, true);
  assert.equal(runtimeOf(pactSave).gameOver?.endingId, 'lcq.ending.death.paolao');
});

test('after refuse-at-ningyu, the unused south pact remains playable and does not invent consent', async () => {
  const { rtm } = fixtures.tools;
  let save = at('atProposed');
  save = settleRefusal(fixtures.tools, save, '赌就不必了').save;
  save = settleRefusal(fixtures.tools, save, '服软').save;
  assert.ok(runtimeOf(save).activeEventIds.includes('lcq.event.sudaji_south_pact'));
  for (let step = 0; step < 4; step += 1) {
    if (runtimeOf(save).completedEventIds.includes('lcq.event.sudaji_south_pact')) break;
    const selection = contractSelection(rtm, save);
    assert.equal(selection.eventId, 'lcq.event.sudaji_south_pact');
    assert.notEqual(selection.actionId, PAOLAO);
    save = recordAndReload(rtm, save, selection).save;
  }
  assert.ok(runtimeOf(save).completedEventIds.includes('lcq.event.sudaji_south_pact'));
  assert.ok(runtimeOf(save).activeEventIds.includes('lcq.event.charge_sudaji_fee'));
  assert.equal(runtimeOf(save).flags['event.gamble_bond_signed.refused_capture'], true);
});

test('send/click pipeline files actually import the refusal engine', async () => {
  const panel = await readFile(new URL('../src/components/dashboard/MainGamePanel.vue', import.meta.url), 'utf8');
  const ai = await readFile(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url), 'utf8');
  assert.match(panel, /resolveBaihuGambleRefusalFromText/);
  assert.match(panel, /gambleRefusalAction/);
  assert.match(ai, /settleBaihuGambleRefusalSelection/);
  assert.match(ai, /gambleRefusalAction: options\?\.gambleRefusalAction/);
  assert.match(ai, /previewBaihuGambleRefusalNarrative/);
  assert.match(ai, /narrativeAuthority: usedLegacyNarrativePilot \? 'local_contract' : 'model'/);
});

test('preview fail-closed: stale or unverified selection never returns fake success prose', async () => {
  const { refusal } = fixtures.tools;
  const save = at('atProposed');
  const fresh = refusal.getBaihuGambleRefusalSelections(save).find(item => item.actionId === 'refuse_gamble');
  assert.ok(fresh);
  const preview = refusal.previewBaihuGambleRefusalNarrative(save, fresh);
  assert.match(preview, /苏妲己脸色一沉/);
  assert.match(preview, /并未入局/);
  assert.match(preview, /没有赌输/);
  assert.match(preview, /没有签下卖身契/);
  assertNoAccomplishedLossOrBond(preview);

  const stale = {
    ...fresh,
    contractHash: 'forged',
    actionText: '我拒绝赌局并当场脱身。',
  };
  assert.equal(refusal.previewBaihuGambleRefusalNarrative(save, stale), '');
  assert.equal(refusal.previewBaihuGambleRefusalNarrative(save, undefined), '');
});

test('escape releases current hall control; next stage keeps history, not current detention', async () => {
  const { rtm, refusal, story, init } = fixtures.tools;
  let save = at('atProposed');
  save = settleRefusal(fixtures.tools, save, '赌就不必了').save;
  save = settleRefusal(fixtures.tools, save, '我反抗').save;
  assert.equal(refusal.readBaihuGambleRefusal(save).hallControlled, true);
  assert.match(story.buildScenarioStoryPrompt(save), /当前仍被扣押/);

  const remaining = [
    'lcq.event.sudaji_south_pact',
    'lcq.event.charge_sudaji_fee',
    'lcq.event.free_ajiman',
    'lcq.event.baihu_shangguan_escape',
  ];
  for (const beat of remaining) {
    if (runtimeOf(save).completedEventIds.includes(beat)) continue;
    for (let step = 0; step < 8; step += 1) {
      if (runtimeOf(save).completedEventIds.includes(beat)) break;
      const selection = contractSelection(rtm, save);
      assert.ok(selection, `${beat} 第 ${step + 1} 步没有合同动作`);
      assert.equal(selection.eventId, beat);
      assert.notEqual(selection.actionId, PAOLAO);
      save = recordAndReload(rtm, save, selection).save;
    }
    assert.ok(runtimeOf(save).completedEventIds.includes(beat), `${beat} 必须结清`);
  }

  const released = refusal.readBaihuGambleRefusal(save);
  assert.equal(released.phase, 'released');
  assert.equal(released.hallControlled, false);
  assert.equal(released.gambled, false);
  assert.equal(released.signedBond, false);
  assert.equal(runtimeOf(save).flags['world.baihu.hall_controlled'], false);
  assert.equal(runtimeOf(save).flags['world.baihu.never_gambled'], true);
  assert.equal(runtimeOf(save).flags['event.gamble_bond_signed.refused_capture'], true);
  const afterEscapePrompt = story.buildScenarioStoryPrompt(save);
  assert.match(afterEscapePrompt, /并未入局、并未赌输、并未签卖身契/);
  assert.match(afterEscapePrompt, /当前不再被扣押/);
  assert.equal(/当前仍被扣押|当前仍被押/.test(afterEscapePrompt), false);
  assertNoAccomplishedLossOrBond(afterEscapePrompt);

  const rt = runtimeOf(save);
  rt.nextStageReadyId = rt.nextStageId;
  const stage03Url = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_03.json', import.meta.url);
  const stage03bUrl = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json', import.meta.url);
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const [raw03, raw03b] = await Promise.all([readFile(stage03Url, 'utf8'), readFile(stage03bUrl, 'utf8')]);
  const nextMods = [
    fixtures.mods.stage02,
    parseScenarioMod(JSON.parse(raw03)),
    parseScenarioMod(JSON.parse(raw03b)),
  ];
  const transitioned = init.transitionToNextScenarioStage(save, nextMods);
  assert.equal(transitioned.ok, true, transitioned.reason);
  save = transitioned.saveData;
  assert.notEqual(runtimeOf(save).modId, 'lcq.stage_02');
  const inherited = refusal.readBaihuGambleRefusal(save);
  assert.equal(inherited.phase, 'released');
  assert.equal(inherited.hallControlled, false);
  assert.equal(inherited.gambled, false);
  assert.equal(runtimeOf(save).flags['world.baihu.never_gambled'], true);
  assert.equal(runtimeOf(save).flags['world.baihu.never_signed_bond'], true);
  assert.equal(runtimeOf(save).flags['world.baihu.hall_controlled'], false);
  assert.equal(runtimeOf(save).flags['event.gamble_bond_signed.refused_capture'], true);
  const nextPrompt = story.buildScenarioStoryPrompt(save);
  assert.equal(/当前仍被扣押|当前仍被押/.test(nextPrompt), false);
  assert.match(nextPrompt, /并未入局、并未赌输、并未签卖身契|并未入局/);
  assertNoAccomplishedLossOrBond(nextPrompt);
});

test('real capture selection cannot settle after focus or stage changes', async () => {
  const { refusal } = fixtures.tools;
  let save = at('atProposed');
  save = settleRefusal(fixtures.tools, save, '赌就不必了').save;
  const live = refusal.getBaihuGambleRefusalSelections(save).find(item => item.actionId === 'resist');
  assert.ok(live);

  const crossedFocus = cloneJson(save);
  runtimeOf(crossedFocus).completedEventIds = [
    ...new Set([...(runtimeOf(crossedFocus).completedEventIds || []), live.eventId]),
  ];
  runtimeOf(crossedFocus).activeEventIds = ['lcq.event.sudaji_south_pact'];
  const focusMoved = refusal.settleBaihuGambleRefusalSelection(crossedFocus, live);
  assert.equal(focusMoved.settled, false);
  assert.equal(focusMoved.idempotent, false);
  assert.equal(refusal.readBaihuGambleRefusal(crossedFocus).phase, 'capture_ordered');

  const crossedMod = cloneJson(save);
  runtimeOf(crossedMod).modId = 'lcq.stage_03';
  const stageMoved = refusal.settleBaihuGambleRefusalSelection(crossedMod, live);
  assert.equal(stageMoved.settled, false);
  assert.equal(stageMoved.idempotent, false);
  assert.equal(refusal.readBaihuGambleRefusal(crossedMod).phase, 'capture_ordered');
});

test('processPlayerAction forwards gambleRefusalAction through the live chain and settles locally (fixture/controlled chain, not live LLM)', async () => {
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  if (!globalThis.window.location) globalThis.window.location = { hostname: 'localhost', href: 'http://localhost/' };
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipelineTs('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await loadPipelineTs('../src/stores/gameStateStore.ts');
  const { aiService } = await loadPipelineTs('../src/services/aiService.ts');
  const { refusal } = fixtures.tools;

  const originalCheck = aiService.checkAvailability;
  const originalGenerate = aiService.generate;
  const originalGenerateRaw = aiService.generateRaw;
  const originalConfig = structuredClone(aiService.getConfig?.() || aiService.config);
  let generateCalls = 0;
  aiService.checkAvailability = () => ({ available: true, message: 'test-stub' });
  aiService.generate = async () => {
    generateCalls += 1;
    throw new Error('must not call generate');
  };
  aiService.generateRaw = async () => {
    generateCalls += 1;
    throw new Error('must not call generateRaw');
  };

  try {
    let save = at('atProposed');
    const selection = refusal.getBaihuGambleRefusalSelections(save).find(item => item.actionId === 'refuse_gamble');
    assert.ok(selection);
    const store = useGameStateStore();
    store.loadFromSaveData(save);
    // 回执标记（2026-10-02）：本地合同正文不请求模型，回执应标 local 而不是 legacy。
    // 回执只在隔离试玩＋模块开关下写入，这里临时打开，finally 里还原。
    const { useCharacterStore } = await loadPipelineTs('./stubs/characterStoreForAbortTest.ts');
    useCharacterStore().activeCharacterProfile = { 隔离试玩信息: { localOnly: true } };
    globalThis.localStorage.setItem('xiantu.modularTurnPlaytest.v1', 'true');
    const profile = {
      模式: '单机',
      角色: { 名字: '程宗扬', 性别: '男' },
      存档列表: {},
    };
    const response = await AIBidirectionalSystem.processPlayerAction(
      selection.playerLine,
      profile,
      {
        gambleRefusalAction: structuredClone(selection),
        shouldAbort: () => false,
      },
    );
    assert.equal(generateCalls, 0);
    assert.ok(response);
    assert.equal(store.toSaveData().系统.扩展.回合模块试玩?.receipts?.at(-1)?.path, 'local', '本地合同回合的回执不得标成 legacy');
    assert.equal(response.transactionCommitted, true);
    assert.match(response.text, /苏妲己脸色一沉/);
    assert.match(response.text, /并未入局/);
    assert.match(response.text, /没有签下卖身契/);
    assertNoAccomplishedLossOrBond(response.text);
    const live = store.toSaveData();
    const ledger = refusal.readBaihuGambleRefusal(live);
    assert.equal(ledger.phase, 'capture_ordered');
    assert.equal(ledger.gambled, false);
    assert.equal(ledger.signedBond, false);
    assert.equal(runtimeOf(live).flags['world.baihu.never_gambled'], true);

    const staleResponse = await AIBidirectionalSystem.processPlayerAction(
      '我拒绝赌局并当场脱身。',
      profile,
      {
        gambleRefusalAction: {
          ...selection,
          contractHash: 'forged-not-live',
          actionText: '我拒绝赌局并当场脱身。',
        },
        shouldAbort: () => false,
      },
    );
    assert.equal(generateCalls, 0);
    assert.equal(staleResponse.text, refusal.BAIHU_GAMBLE_REFUSAL_UNAVAILABLE_TEXT);
    assert.equal(refusal.readBaihuGambleRefusal(store.toSaveData()).phase, 'capture_ordered');
  } finally {
    const { useCharacterStore } = await loadPipelineTs('./stubs/characterStoreForAbortTest.ts');
    delete useCharacterStore().activeCharacterProfile;
    globalThis.localStorage.removeItem('xiantu.modularTurnPlaytest.v1');
    aiService.checkAvailability = originalCheck;
    aiService.generate = originalGenerate;
    aiService.generateRaw = originalGenerateRaw;
    if (originalConfig && typeof aiService.saveConfig === 'function') {
      aiService.saveConfig(originalConfig);
    }
  }
});

test('canonGuard blocks model writes to the refusal ledger and world.baihu flags', async () => {
  const { refusal } = fixtures.tools;
  const { guardScenarioModCommands, compileScenarioProtectedPaths } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  let save = at('atProposed');
  save = settleRefusal(fixtures.tools, save, '赌就不必了').save;
  assert.ok(compileScenarioProtectedPaths(save).includes('世界.状态.剧本模组'));
  const commands = [
    { action: 'set', key: '世界.状态.剧本模组.baihuGambleRefusal', value: { phase: 'released' } },
    { action: 'set', key: '世界.状态.剧本模组.flags.world.baihu.hall_controlled', value: false },
    { action: 'set', key: '世界.状态.剧本模组.flags.world.baihu.never_gambled', value: false },
    { action: 'set', key: '世界.状态.剧本模组.flags.event.gamble_bond_signed.refused_capture', value: false },
  ];
  const result = guardScenarioModCommands(save, commands);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 4);
  assert.equal(refusal.readBaihuGambleRefusal(save).phase, 'capture_ordered');
});

test('south-pact button and matched natural input settle the local term-open contract; questions and pawn-phone do not', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipelineTs('../src/utils/AIBidirectionalSystem.ts');
  const { rtm } = fixtures.tools;
  const save = at('atPact');
  const action = rtm.getCurrentStoryEventActions(save).find(item => item.actionId === 'offer_nylon_clue_for_term');
  assert.ok(action);

  const published = await AIBidirectionalSystem.processGmResponse(
    {
      text: '本轮只呈现已经确认的公开动静，未出现新的可核实细节。你先前的行动仍然有效，世界会依照既定事实继续推进。',
      mid_term_memory: '本轮已按本地合同推进。',
      tavern_commands: [],
      action_options: [],
    },
    cloneJson(save),
    false,
    () => false,
    {
      eventAction: action,
      userAction: action.playerLine,
      playerIntentText: action.playerLine,
      narrativeAuthority: 'local_contract',
    },
  );
  const state = runtimeOf(published.saveData).eventActionStates['lcq.event.sudaji_south_pact'];
  assert.ok(state?.preparations?.includes('south_pact_terms_opened'), `preparations=${JSON.stringify(state?.preparations)}`);
  assert.equal(runtimeOf(published.saveData).completedEventIds.includes('lcq.event.sudaji_south_pact'), false);
  assert.equal(rtm.getCurrentStoryEventActions(published.saveData).some(item => item.actionId === 'seal_three_month_south_pact'), true);

  const router = await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
  const matched = await router.resolveNaturalIntent({
    saveData: save,
    playerText: '提出三个月期限。',
    resolveFromText: rtm.resolveStoryEventActionFromPlayerText,
    generate: async () => '{"actionId":"none","evidence":"x","certainty":"high"}',
  });
  assert.equal(matched.kind, 'alias');
  assert.equal(matched.selection?.actionId, 'offer_nylon_clue_for_term');

  for (const line of ['提出三个月期限？', '如果提出三个月期限', '她说提出三个月期限']) {
    assert.equal(rtm.resolveStoryEventActionFromPlayerText(save, line), undefined, line);
  }
  const pawn = await router.resolveNaturalIntent({
    saveData: save,
    playerText: '我押手机作担保，换三个月期限。',
    resolveFromText: rtm.resolveStoryEventActionFromPlayerText,
    generate: async () => '{"actionId":"none","evidence":"押手机","certainty":"high"}',
  });
  assert.equal(pawn.selection, undefined);
});

test('processPlayerAction truncated south-pact generate settles the term-open contract within two long requests', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem, shouldSettleLocalContractAfterGenerationFailure } = await loadPipelineTs('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await loadPipelineTs('../src/stores/gameStateStore.ts');
  const { aiService } = await loadPipelineTs('../src/services/aiService.ts');
  const { OutputTruncationError } = await loadPipelineTs('../src/services/aiResponseTermination.ts');
  const { rtm } = fixtures.tools;
  assert.equal(shouldSettleLocalContractAfterGenerationFailure(new OutputTruncationError({ budget: 8192 })), true);
  const save = at('atPact');
  const action = rtm.getCurrentStoryEventActions(save).find(item => item.actionId === 'offer_nylon_clue_for_term');
  assert.ok(action);
  let calls = 0;
  const originalCheck = aiService.checkAvailability;
  const originalGenerate = aiService.generate;
  const originalGenerateRaw = aiService.generateRaw;
  const originalConfig = structuredClone(aiService.getConfig?.() || aiService.config);
  aiService.checkAvailability = () => ({ available: true, message: 'test-stub' });
  aiService.generate = async () => {
    calls += 1;
    throw new OutputTruncationError({ budget: 8192, recoveryAttempted: true });
  };
  aiService.generateRaw = async () => {
    throw new Error('must not call generateRaw');
  };
  try {
    const store = useGameStateStore();
    const legacySave = cloneJson(save);
    delete legacySave.系统.扩展.清羽记开局;
    delete legacySave.系统.扩展.星月湖落地连续试玩;
    store.loadFromSaveData(legacySave);
    const beforePrep = runtimeOf(store.toSaveData()).eventActionStates?.['lcq.event.sudaji_south_pact']?.preparations || [];
    const response = await AIBidirectionalSystem.processPlayerAction(action.playerLine, {
      模式: '单机',
      角色: { 名字: '程宗扬', 性别: '男' },
      存档列表: {},
    }, {
      eventAction: structuredClone(action),
      eventActionProvenance: 'selected',
      playerIntentText: action.playerLine,
      shouldAbort: () => false,
    });
    assert.ok(calls >= 1 && calls <= 2, `long requests=${calls}`);
    assert.equal(response?.transactionCommitted, true);
    const state = runtimeOf(store.toSaveData()).eventActionStates['lcq.event.sudaji_south_pact'];
    assert.ok(state?.preparations?.includes('south_pact_terms_opened'), `preparations=${JSON.stringify(state?.preparations)} before=${JSON.stringify(beforePrep)}`);
    const ledger = fixtures.tools.refusal.readBaihuGambleRefusal(store.toSaveData());
    if (ledger) {
      assert.equal(ledger.gambled, false);
      assert.equal(ledger.signedBond, false);
    }
  } finally {
    aiService.checkAvailability = originalCheck;
    aiService.generate = originalGenerate;
    aiService.generateRaw = originalGenerateRaw;
    if (originalConfig && typeof aiService.saveConfig === 'function') aiService.saveConfig(originalConfig);
  }
});

const SOUTH_PACT_SAFE_JSON = () => JSON.stringify({
  text: '本轮只呈现已经确认的公开动静，未出现新的可核实细节。你先前的行动仍然有效，世界会依照既定事实继续推进。',
  mid_term_memory: '本轮已按本地合同推进。',
  tavern_commands: [],
  action_options: [],
});

test('processPlayerAction generate-publish accepts south-pact nylon term with complete JSON', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipelineTs('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await loadPipelineTs('../src/stores/gameStateStore.ts');
  const { aiService } = await loadPipelineTs('../src/services/aiService.ts');
  const { rtm } = fixtures.tools;
  const save = at('atPact');
  const action = rtm.getCurrentStoryEventActions(save).find(item => item.actionId === 'offer_nylon_clue_for_term');
  assert.ok(action);
  let calls = 0;
  const originalCheck = aiService.checkAvailability;
  const originalGenerate = aiService.generate;
  const originalGenerateRaw = aiService.generateRaw;
  const originalConfig = structuredClone(aiService.getConfig?.() || aiService.config);
  aiService.checkAvailability = () => ({ available: true, message: 'test-stub' });
  aiService.generate = async () => {
    calls += 1;
    return SOUTH_PACT_SAFE_JSON();
  };
  aiService.generateRaw = async () => {
    throw new Error('must not call generateRaw');
  };
  try {
    const store = useGameStateStore();
    const legacySave = cloneJson(save);
    delete legacySave.系统.扩展.清羽记开局;
    delete legacySave.系统.扩展.星月湖落地连续试玩;
    store.loadFromSaveData(legacySave);
    const response = await AIBidirectionalSystem.processPlayerAction(action.playerLine, {
      模式: '单机',
      角色: { 名字: '程宗扬', 性别: '男' },
      存档列表: {},
    }, {
      eventAction: structuredClone(action),
      eventActionProvenance: 'selected',
      playerIntentText: action.playerLine,
      shouldAbort: () => false,
    });
    assert.ok(calls >= 1 && calls <= 2, `generate calls=${calls}`);
    assert.equal(response?.transactionCommitted, true);
    const live = store.toSaveData();
    const state = runtimeOf(live).eventActionStates['lcq.event.sudaji_south_pact'];
    assert.ok(state?.preparations?.includes('south_pact_terms_opened'), `preparations=${JSON.stringify(state?.preparations)}`);
    assert.equal(runtimeOf(live).completedEventIds.includes('lcq.event.sudaji_south_pact'), false);
  } finally {
    aiService.checkAvailability = originalCheck;
    aiService.generate = originalGenerate;
    aiService.generateRaw = originalGenerateRaw;
    if (originalConfig && typeof aiService.saveConfig === 'function') aiService.saveConfig(originalConfig);
  }
});

test('processPlayerAction generate-publish does not fake-consent south-pact from questions', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipelineTs('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await loadPipelineTs('../src/stores/gameStateStore.ts');
  const { aiService } = await loadPipelineTs('../src/services/aiService.ts');
  const { rtm } = fixtures.tools;
  const save = at('atPact');
  assert.equal(rtm.resolveStoryEventActionFromPlayerText(save, '提出三个月期限？'), undefined);
  let calls = 0;
  const originalCheck = aiService.checkAvailability;
  const originalGenerate = aiService.generate;
  const originalGenerateRaw = aiService.generateRaw;
  const originalConfig = structuredClone(aiService.getConfig?.() || aiService.config);
  aiService.checkAvailability = () => ({ available: true, message: 'test-stub' });
  aiService.generate = async () => {
    calls += 1;
    return JSON.stringify({
      text: '你把问题停在嘴里，没有当场答应三个月期限。草原的风还在吹。',
      mid_term_memory: '只是在问。',
      tavern_commands: [],
      action_options: [],
    });
  };
  aiService.generateRaw = async () => {
    throw new Error('must not call generateRaw');
  };
  try {
    const store = useGameStateStore();
    const legacySave = cloneJson(save);
    delete legacySave.系统.扩展.清羽记开局;
    delete legacySave.系统.扩展.星月湖落地连续试玩;
    store.loadFromSaveData(legacySave);
    const beforePrep = runtimeOf(store.toSaveData()).eventActionStates?.['lcq.event.sudaji_south_pact']?.preparations || [];
    const response = await AIBidirectionalSystem.processPlayerAction('提出三个月期限？', {
      模式: '单机',
      角色: { 名字: '程宗扬', 性别: '男' },
      存档列表: {},
    }, {
      playerIntentText: '提出三个月期限？',
      shouldAbort: () => false,
    });
    assert.ok(calls >= 1 && calls <= 2, `generate calls=${calls}`);
    assert.ok(response);
    const live = store.toSaveData();
    const state = runtimeOf(live).eventActionStates?.['lcq.event.sudaji_south_pact'];
    assert.equal(runtimeOf(live).completedEventIds.includes('lcq.event.sudaji_south_pact'), false);
    assert.equal(
      (state?.preparations || []).includes('south_pact_terms_opened'),
      beforePrep.includes('south_pact_terms_opened'),
    );
  } finally {
    aiService.checkAvailability = originalCheck;
    aiService.generate = originalGenerate;
    aiService.generateRaw = originalGenerateRaw;
    if (originalConfig && typeof aiService.saveConfig === 'function') aiService.saveConfig(originalConfig);
  }
});

test('processPlayerAction generate-publish leave-hall releases current detention', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipelineTs('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await loadPipelineTs('../src/stores/gameStateStore.ts');
  const { aiService } = await loadPipelineTs('../src/services/aiService.ts');
  const { rtm, refusal } = fixtures.tools;
  let save = at('atProposed');
  save = settleRefusal(fixtures.tools, save, '赌就不必了').save;
  save = settleRefusal(fixtures.tools, save, '我反抗').save;
  assert.equal(refusal.readBaihuGambleRefusal(save).hallControlled, true);
  const remaining = [
    'lcq.event.sudaji_south_pact',
    'lcq.event.charge_sudaji_fee',
    'lcq.event.free_ajiman',
    'lcq.event.baihu_shangguan_escape',
  ];
  for (const beat of remaining) {
    if (beat === 'lcq.event.baihu_shangguan_escape') break;
    if (runtimeOf(save).completedEventIds.includes(beat)) continue;
    for (let step = 0; step < 8; step += 1) {
      if (runtimeOf(save).completedEventIds.includes(beat)) break;
      const selection = contractSelection(rtm, save);
      assert.ok(selection, `${beat} 第 ${step + 1} 步没有合同动作`);
      assert.equal(selection.eventId, beat);
      assert.notEqual(selection.actionId, PAOLAO);
      save = recordAndReload(rtm, save, selection).save;
    }
    assert.ok(runtimeOf(save).completedEventIds.includes(beat), `${beat} 必须结清`);
  }
  assert.ok(runtimeOf(save).activeEventIds.includes('lcq.event.baihu_shangguan_escape'));
  const action = rtm.getCurrentStoryEventActions(save).find(item => item.eventId === 'lcq.event.baihu_shangguan_escape');
  assert.ok(action);
  let calls = 0;
  const originalCheck = aiService.checkAvailability;
  const originalGenerate = aiService.generate;
  const originalGenerateRaw = aiService.generateRaw;
  const originalConfig = structuredClone(aiService.getConfig?.() || aiService.config);
  aiService.checkAvailability = () => ({ available: true, message: 'test-stub' });
  aiService.generate = async () => {
    calls += 1;
    return SOUTH_PACT_SAFE_JSON();
  };
  aiService.generateRaw = async () => {
    throw new Error('must not call generateRaw');
  };
  try {
    const store = useGameStateStore();
    const legacySave = cloneJson(save);
    delete legacySave.系统.扩展.清羽记开局;
    delete legacySave.系统.扩展.星月湖落地连续试玩;
    store.loadFromSaveData(legacySave);
    const response = await AIBidirectionalSystem.processPlayerAction(action.playerLine, {
      模式: '单机',
      角色: { 名字: '程宗扬', 性别: '男' },
      存档列表: {},
    }, {
      eventAction: structuredClone(action),
      eventActionProvenance: 'selected',
      playerIntentText: action.playerLine,
      shouldAbort: () => false,
    });
    assert.ok(calls >= 1 && calls <= 2, `generate calls=${calls}`);
    assert.equal(response?.transactionCommitted, true);
    const live = store.toSaveData();
    const released = refusal.readBaihuGambleRefusal(live);
    assert.equal(released.hallControlled, false);
    assert.equal(released.phase, 'released');
    assert.equal(released.gambled, false);
    assert.equal(released.signedBond, false);
    assert.ok(runtimeOf(live).completedEventIds.includes('lcq.event.baihu_shangguan_escape'));
  } finally {
    aiService.checkAvailability = originalCheck;
    aiService.generate = originalGenerate;
    aiService.generateRaw = originalGenerateRaw;
    if (originalConfig && typeof aiService.saveConfig === 'function') aiService.saveConfig(originalConfig);
  }
});

test('hard-coded option locks (user ruling 2026-10-02): only the deciding step locks, fixed labels, no free text; capture responses stay free', async () => {
  const { rtm, refusal } = fixtures.tools;
  const branch = await loadTs('../src/modules/scenarioMods/branchDecision.ts');
  const optionsOf = save => [...rtm.getCurrentStoryEventActions(save), ...refusal.getBaihuGambleRefusalSelections(save)];
  const lineOf = option => option.source === 'baihu_gamble_refusal_engine' ? option.actionText : option.playerLine;

  // ① 白湖赌局：答复凝羽那一步锁，二选一「接赌 / 不赌」；扣押分支的拒赌不在锁内提供。
  const proposed = at('atProposed');
  const decision = branch.detectBranchDecision(optionsOf(proposed));
  assert.ok(decision, 'gamble proposed → branch decision');
  assert.deepEqual(decision.options.map(option => option.actionId), ['answer_ningyu_on_debut', 'refuse_gamble_take_paolao']);
  assert.deepEqual(decision.labels, ['接赌', '不赌']);
  assert.equal(decision.labels.some(label => /第\s*\d+\s*\/\s*\d+\s*步/.test(label)), false, 'no step progress in lock labels');
  const [accept, decline] = decision.options;
  assert.equal(branch.branchDecisionAllowsSend(decision, null, '我不赌', lineOf), false, 'free text refused');
  assert.equal(branch.branchDecisionAllowsSend(decision, decline, '我改主意了随便聊聊', lineOf), false, 'edited text refused');
  assert.equal(branch.branchDecisionAllowsSend(decision, decline, lineOf(decline), lineOf), true);
  assert.equal(branch.branchDecisionAllowsSend(decision, accept, lineOf(accept), lineOf), true);
  assert.equal(refusal.isExplicitRefuseGambleText(lineOf(decline)), false, '不赌原句不会被识别成扣押分支的拒赌');

  // 选「不赌」：复用致命选项机制，本局以炮烙结束（拒赌版事实）。
  const declined = recordAndReload(rtm, cloneJson(proposed), decline).save;
  assert.equal(runtimeOf(declined).gameOver?.endingId, 'lcq.ending.death.paolao');
  assert.match(runtimeOf(declined).gameOver.facts.join('；'), /回绝白湖商馆的赌局/);
  assert.equal(runtimeOf(declined).gameOver.sourceEventId, 'lcq.event.ningyu_enters_gamble');

  // 决定步之前（看清凝羽入局）不锁，致命选项不提前显示。
  const early = optionsOf(at('atNingyu'));
  assert.equal(branch.detectBranchDecision(early), null);
  assert.equal(branch.isDormantLockedOption(early.find(option => option.actionId === 'refuse_gamble_take_paolao')), true);
  assert.equal(branch.isDormantLockedOption(early.find(option => option.actionId === 'see_ningyu_sent_into_gamble')), false);

  // 拒赌后被拿下（旧扣押分支，代码保留）：反抗/逃跑/服软不锁。
  const captured = settleRefusal(fixtures.tools, at('atProposed'), '夫人，这场赌就不必了，我不赌').save;
  assert.equal(refusal.getBaihuGambleRefusalSelections(captured).length, 3);
  assert.equal(branch.detectBranchDecision(optionsOf(captured)), null);

  // 表外不锁：签契那一拍、谈期限都是普通交谈。
  for (const key of ['atS0206', 'atPact', 'atBond']) {
    assert.equal(branch.detectBranchDecision(optionsOf(at(key))), null, key);
  }

  // ② 撕毁阿姬曼身契：取契那一步不锁，撕契那一步锁。
  let ajiman = await walkFrom(fixtures.tools, at('atBond'), 'lcq.event.free_ajiman');
  assert.equal(branch.detectBranchDecision(optionsOf(ajiman)), null, 'take-bond step is not the decision');
  assert.equal(optionsOf(ajiman).some(option => option.actionId === 'pocket_ajiman_bond'), false, '不撕选项不提前出现');
  ajiman = recordAndReload(rtm, ajiman, contractSelection(rtm, ajiman)).save;
  const tear = branch.detectBranchDecision(optionsOf(ajiman));
  assert.deepEqual(tear?.options.map(option => option.actionId), ['tear_bond_and_face_blockade', 'pocket_ajiman_bond']);
  assert.deepEqual(tear.labels, ['当面撕契并改道出城', '先收起身契，出城再说']);

  // 裁定 #169：冰蛊第24章才种下，第23章选不撕不能当场死——本拍照常完成，只记路线回执；
  // 死亡延后到冰蛊种下之后最早的可达拍（武二郎入队），激活后 1 回合触发。
  const RECEIPT = 'lcq.event.free_ajiman.path.bond_pocketed';
  const passTurn = save => {
    runtimeOf(save).worldTurn = (Number(runtimeOf(save).worldTurn) || 0) + 1;
    return rtm.advanceScenarioRuntime(save).saveData;
  };
  const walkToWuerlang = save => {
    for (let step = 0; step < 6 && !runtimeOf(save).activeEventIds.includes('lcq.event.wuerlang_joins'); step += 1) {
      assert.equal(runtimeOf(save).gameOver, undefined, '到武二郎入队之前不得结束');
      save = recordAndReload(rtm, save, contractSelection(rtm, save)).save;
    }
    assert.ok(runtimeOf(save).activeEventIds.includes('lcq.event.wuerlang_joins'), JSON.stringify(runtimeOf(save).activeEventIds));
    return save;
  };
  let pocketed = recordAndReload(rtm, cloneJson(ajiman), tear.options[1]).save;
  assert.equal(runtimeOf(pocketed).gameOver, undefined, '第23章选不撕不当场死亡');
  assert.ok(runtimeOf(pocketed).completedEventIds.includes('lcq.event.free_ajiman'), '本拍照常完成');
  assert.equal(runtimeOf(pocketed).pathReceipts?.[RECEIPT]?.choiceId, 'pocket_ajiman_bond');
  assert.ok(runtimeOf(pocketed).activeEventIds.includes('lcq.event.baihu_shangguan_escape'), '剧情照常继续');
  pocketed = passTurn(pocketed);
  assert.equal(runtimeOf(pocketed).gameOver, undefined, '白湖脱身这一拍不触发');
  pocketed = walkToWuerlang(pocketed);
  assert.equal(runtimeOf(pocketed).gameOver, undefined, '刚到触发拍还未结算');
  pocketed = passTurn(pocketed);
  assert.equal(runtimeOf(pocketed).gameOver, undefined, '触发拍第 1 步未发生前不结算');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  assert.match(buildScenarioStoryPrompt(pocketed), /没有撕掉阿姬曼的身契（苏妲己已下令追查买走舞姬的人）/, '触发拍提示带出追查');
  // 武二郎入队第 1 步落账的同一回合结算：不能靠下一回合直接完成本拍躲过。
  pocketed = recordAndReload(rtm, pocketed, contractSelection(rtm, pocketed)).save;
  const over = runtimeOf(pocketed).gameOver;
  assert.equal(over?.endingId, 'lcq.ending.death.ajiman_bond');
  assert.equal(over.title, '冰蛊');
  assert.equal(over.sourceEventId, 'lcq.event.wuerlang_joins');
  assert.match(over.facts.join('；'), /冰蛊是之后苏妲己/);
  assert.equal(over.facts.some(fact => /早在/.test(fact)), false, '不得暗示第23章已种下冰蛊');
  assert.match(over.facts.join('；'), /没有撕掉的身契让她查到了程宗扬/);
  assert.match(over.facts.join('；'), /哥哥将永远等不到她回来/);
  assert.match(over.facts.join('；'), /黑魔海/);
  const endingPrompt = buildScenarioStoryPrompt(pocketed);
  assert.match(endingPrompt, /【本局结束·结局正文】[^\n]*标题是“冰蛊”/);
  assert.match(endingPrompt, /不得留生机[^\n]*不得有任何性内容或露骨描写/);

  // 撕契路径：不写回执，走到武二郎入队并多过几回合也永不触发。
  let torn = recordAndReload(rtm, cloneJson(ajiman), tear.options[0]).save;
  assert.ok(runtimeOf(torn).completedEventIds.includes('lcq.event.free_ajiman'));
  assert.equal(runtimeOf(torn).pathReceipts?.[RECEIPT], undefined);
  torn = walkToWuerlang(torn);
  for (let step = 0; step < 4 && !runtimeOf(torn).completedEventIds.includes('lcq.event.wuerlang_joins'); step += 1) {
    torn = passTurn(recordAndReload(rtm, torn, contractSelection(rtm, torn)).save);
    assert.equal(runtimeOf(torn).gameOver, undefined, '撕契路径永不触发冰蛊结局');
  }
  assert.ok(runtimeOf(torn).completedEventIds.includes('lcq.event.wuerlang_joins'), '撕契路径照常走完武二郎入队');
  for (let turn = 0; turn < 3; turn += 1) torn = passTurn(torn);
  assert.equal(runtimeOf(torn).gameOver, undefined);

  // ③ 第62章白夷生变（用户裁定 2026-10-02 取消锁）：恢复原著单动作，不锁，直接推进到地宫陷阱。
  const stage04b = JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json', import.meta.url), 'utf8'));
  const shift = stage04b.scenario.events.find(event => event.id === 'lcq.event.s04b_lingfei_baiyi_crisis_09');
  assert.deepEqual(shift.playerCompletionContract.actions.map(action => action.id), ['advance_declared_objective']);
  const shiftOptions = shift.playerCompletionContract.actions.map(action => ({ source: 'event_engine', eventId: shift.id, actionId: action.id, label: action.label }));
  assert.equal(branch.detectBranchDecision(shiftOptions), null);
});


test('bond beat outcome is explicit: done means closed, outcome says signed or refused; models cannot write it', async () => {
  const { refusal } = fixtures.tools;
  assert.equal(refusal.gambleBondOutcome(at('atBond')), 'open');
  for (const response of ['我反抗', '尝试逃跑', '服软']) {
    const captured = settleRefusal(fixtures.tools, at('atProposed'), '赌就不必了').save;
    const responded = settleRefusal(fixtures.tools, captured, response).save;
    const rt = responded.世界.状态.剧本模组;
    assert.equal(rt.flags['event.gamble_bond_signed.done'], true, 'beat closed by refusal');
    assert.equal(rt.flags[refusal.GAMBLE_BOND_OUTCOME_FLAG], 'refused');
    assert.equal(refusal.gambleBondOutcome(responded), 'refused');
    assert.equal(refusal.gambleAlreadyLostOrSigned(responded), false);
  }
  const signed = await walkFrom(fixtures.tools, at('atBond'), 'lcq.event.charge_sudaji_fee');
  assert.equal(refusal.gambleBondOutcome(signed), 'signed');
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const guarded = guardScenarioModCommands(at('atBond'), [{ action: 'set', key: '世界.状态.剧本模组.flags.event.gamble_bond_signed.outcome', value: 'refused' }]);
  assert.equal(guarded.accepted.length, 0);
});

test('south pact is ordinary conversation again (user ruling 2026-10-02): no key beat card, no lock, AI options kept', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipelineTs('../src/utils/AIBidirectionalSystem.ts');
  const cards = await loadTs('../src/modules/scenarioMods/keyBeatCards.ts');
  const branch = await loadTs('../src/modules/scenarioMods/branchDecision.ts');
  const { rtm } = fixtures.tools;
  for (const key of ['atS0206', 'atNingyu', 'atProposed', 'atPact', 'atBond']) assert.equal(cards.getActiveKeyBeatCard(at(key)), null, key);
  const save = at('atPact');
  const offer = rtm.getCurrentStoryEventActions(save).find(item => item.actionId === 'offer_nylon_clue_for_term');
  assert.equal(cards.isKeyBeatCardAction(offer), false);
  assert.equal(branch.detectBranchDecision(rtm.getCurrentStoryEventActions(save)), null);
  // 普通交谈回合：AI 选项照常写入历史。
  const free = await AIBidirectionalSystem.processGmResponse(
    { text: '苏妲己倚在榻上，指尖敲着扶手，半晌没有出声。灯影在她脸上晃了一下。', mid_term_memory: '谈期限。', tavern_commands: [], action_options: ['问她霓龙丝的事'] },
    cloneJson(save), false, () => false,
    { userAction: '霓龙丝在南荒哪一带？', playerIntentText: '霓龙丝在南荒哪一带？' },
  );
  assert.deepEqual(free.saveData.系统.历史.叙事.at(-1).actionOptions, ['问她霓龙丝的事']);
  assert.equal(runtimeOf(free.saveData).completedEventIds.includes('lcq.event.sudaji_south_pact'), false);
});


test('bugfix5: actual s02_04 open-world options without actionId never activate a branch lock', async () => {
  const { tools, mods } = fixtures;
  const save = await walkFrom(tools, await earnStage02(tools, mods), 'lcq.event.s02_04');
  const options = tools.wuyuan.getWuyuanOpenWorldSelections(save);
  assert.ok(options.length);
  assert.ok(options.some(option => option.actionId === undefined));
  const { detectBranchDecision } = await loadTs('../src/modules/scenarioMods/branchDecision.ts');
  assert.equal(detectBranchDecision(options), null);
});

test('bugfix5: fatal pact action has distinct label and successful sealing publishes only fixed terms to prose and memory', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipelineTs('../src/utils/AIBidirectionalSystem.ts');
  const { rtm } = fixtures.tools;
  let save = at('atPact');
  const first = rtm.getCurrentStoryEventActions(save).find(item => item.actionId === 'offer_nylon_clue_for_term');
  const initialFatal = rtm.getCurrentStoryEventActions(save).find(item => item.actionId === PAOLAO);
  assert.notEqual(first.label, initialFatal.label);
  assert.match(initialFatal.label, /拒绝期限/);
  save = recordAndReload(rtm, save, first).save;
  const actions = rtm.getCurrentStoryEventActions(save);
  const seal = actions.find(item => item.actionId === 'seal_three_month_south_pact');
  const fatal = actions.find(item => item.actionId === PAOLAO);
  assert.notEqual(seal.label, fatal.label);

  const response = { text: '你答应了，苏妲己承诺三个月没人找你麻烦。', mid_term_memory: '三个月没人找你麻烦。', tavern_commands: [], action_options: ['安心休息'] };
  const published = await AIBidirectionalSystem.processGmResponse(response, save, false, () => false,
    { eventAction: seal, userAction: seal.playerLine, playerIntentText: seal.playerLine, narrativeAuthority: 'local_contract' });
  assert.ok(runtimeOf(published.saveData).completedEventIds.includes('lcq.event.sudaji_south_pact'));
  for (const value of [response.text, response.mid_term_memory,
    published.saveData.系统.历史.叙事.at(-1).content,
    published.saveData.社交.记忆.短期记忆.at(-1),
    published.saveData.社交.记忆.隐式中期记忆.at(-1)]) {
    assert.match(String(value), /逾期受炮烙/);
    assert.doesNotMatch(String(value), /没人找你麻烦/);
  }
});


// Mandatory demo route: actual module transport is fixture-controlled, never a live-LLM acceptance claim.
test('verified bond actions retain complete fixed prose and append history even without stage NPC canon entries', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipelineTs('../src/utils/AIBidirectionalSystem.ts');
  const { fixedBeatNarrative } = await loadPipelineTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
  const { rtm } = fixtures.tools;
  const save = await walkFrom(fixtures.tools, at('atBond'), 'lcq.event.free_ajiman');
  save.角色.背包.货币 ||= {};
  save.角色.背包.货币.金铢 = { 币种: '金铢', 名称: '金铢', 数量: 60, 价值度: 1 };
  const take = rtm.getCurrentStoryEventActions(save).find(item => item.actionId === 'take_ajiman_bond_in_hand');
  const publish = async (current, action) => {
    const text = fixedBeatNarrative(action.eventId, action.actionId);
    const count = current.系统.历史.叙事.length;
    const response = { text, mid_term_memory: '', tavern_commands: [], action_options: [], moduleReceipt: { id: action.actionId, path: 'local', text } };
    const result = await AIBidirectionalSystem.processGmResponse(response, current, false, () => false,
      { eventAction: action, userAction: action.playerLine, playerIntentText: action.playerLine, narrativeAuthority: 'local_contract' });
    assert.equal(response.text, text);
    assert.equal(result.saveData.系统.历史.叙事.length, count + 1);
    assert.equal(result.saveData.系统.历史.叙事.at(-1).content.replace(/^【[^】]+】/, ''), text);
    assert.ok(result.saveData.社交.关系['阿姬曼·芭娜']);
    return result.saveData;
  };
  const holding = await publish(save, take);
  assert.equal(holding.角色.背包.货币.金铢.数量, 10);
  assert.equal(holding.角色.背包.物品['lcq.item.ajiman_bond'].数量, 1);
  for (const actionId of ['tear_bond_and_face_blockade', 'pocket_ajiman_bond']) {
    const branch = cloneJson(holding);
    const action = rtm.getCurrentStoryEventActions(branch).find(item => item.actionId === actionId);
    const settled = await publish(branch, action);
    assert.equal(settled.角色.背包.货币.金铢.数量, 10);
    assert.equal(Boolean(settled.角色.背包.物品['lcq.item.ajiman_bond']), actionId === 'pocket_ajiman_bond');
  }
});

test('no-legacy demo: every declared stage01/02 event with a legal action reaches the module, including s02_02 and post-escape events', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipelineTs('../src/utils/AIBidirectionalSystem.ts');
  const { aiService } = await loadPipelineTs('../src/services/aiService.ts');
  const { useAPIManagementStore } = await loadPipelineTs('../src/stores/apiManagementStore.ts');
  useAPIManagementStore().apiConfigs = [{ id: 'default', name: 'fixture', provider: 'custom', url: 'https://api.minimaxi.com/v1', apiKey: 'fixture-not-a-real-key', model: 'MiniMax-M3', enabled: true }];
  const original = aiService.generate;
  const calls = [];
  aiService.generate = async options => {
    calls.push(options);
    const prompt = (options.injects || []).map(item => item.content).join('\n');
    assert.ok(prompt.length > 0 && prompt.length < 10000);
    assert.doesNotMatch(prompt, /完整游戏存档|精简版SaveData结构说明/);
    return '你观察眼前的动静，依照自己的决定作出回应。周围的风声和脚步声仍然清晰。';
  };
  try {
    const tested = []; const modelEvents = [];
    for (const mod of [fixtures.mods.stage01, fixtures.mods.stage02]) for (const event of mod.scenario.events) {
      const save = at('atPact');
      const rt = runtimeOf(save);
      rt.modId = mod.manifest.id;
      rt.events = [cloneJson(event)];
      rt.canon = cloneJson(mod.canon);
      rt.activeEventIds = [event.id]; rt.completedEventIds = []; rt.pendingEventIds = [];
      rt.eventActionStates = {}; delete rt.gameOver;
      const action = fixtures.tools.rtm.getCurrentStoryEventActions(save).find(item => item.eventId === event.id);
      assert.ok(action, 'fixture needs a legal action for ' + event.id);
      const response = await AIBidirectionalSystem.tryModularTurn(save, { eventAction: action, eventActionProvenance: 'selected' }, 'coverage-' + event.id, () => false, action.playerLine);
      assert.ok(['modular', 'local'].includes(response.moduleReceipt.path), event.id);
      if (response.moduleReceipt.path === 'modular') modelEvents.push(event.id);
      assert.equal(response.moduleReceipt.eventId, event.id);
      tested.push(event.id);
    }
    assert.equal(tested.length, 25);
    assert.ok(tested.includes('lcq.event.s02_02'));
    assert.ok(tested.includes('lcq.event.wuerlang_joins'));
    assert.equal(calls.length, modelEvents.length);
    assert.ok(modelEvents.includes('lcq.event.s02_02'));
  } finally { aiService.generate = original; }
});

test('no-legacy demo: s02_02 publishes and progresses; free questions remain uncommitted to event; two module failures never settle or call legacy', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipelineTs('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await loadPipelineTs('../src/stores/gameStateStore.ts');
  const { useAPIManagementStore } = await loadPipelineTs('../src/stores/apiManagementStore.ts');
  const { aiService } = await loadPipelineTs('../src/services/aiService.ts');
  useAPIManagementStore().apiConfigs = [{ id: 'default', name: 'fixture', provider: 'custom', url: 'https://api.minimaxi.com/v1', apiKey: 'fixture-not-a-real-key', model: 'MiniMax-M3', enabled: true }];
  const original = aiService.generate; const check = aiService.checkAvailability;
  const store = useGameStateStore(); let calls = 0; let fail = false;
  aiService.checkAvailability = () => ({ available: true });
  aiService.generate = async options => {
    calls++;
    const prompt = (options.injects || []).map(item => item.content).join('\n');
    assert.ok(prompt.length > 0 && prompt.length < 10000);
    if (fail) throw new Error('fixture transport failure');
    return '你望向眼前的人，停下来听清对方的话，没有另添条件。';
  };
  const profile = { 模式: '单机', 角色: { 名字: '程宗扬', 性别: '男' }, 存档列表: {} };
  const submit = (line, action) => AIBidirectionalSystem.processPlayerAction(line, profile, { ...(action ? { eventAction: action, eventActionProvenance: 'selected' } : {}), playerIntentText: line });
  try {
    localStorage.setItem('xiantu.modularTurnPlaytest.v1', 'false');
    localStorage.setItem('xiantu.fastNarrativeDemo.v1', 'true');
    const battle = await walkFrom(fixtures.tools, await earnStage02(fixtures.tools, fixtures.mods), 'lcq.event.s02_02');
    store.loadFromSaveData(battle);
    const action = fixtures.tools.rtm.getCurrentStoryEventActions(battle)[0];
    const result = await submit(action.playerLine, action);
    assert.equal(result.moduleReceipt.path, 'modular');
    assert.equal(result.transactionCommitted, true);
    assert.notDeepEqual(runtimeOf(store.toSaveData()).eventActionStates, runtimeOf(battle).eventActionStates);
    store.loadFromSaveData(at('atPact'));
    const question = await submit('要是三个月回不来怎么办？');
    assert.equal(question.moduleReceipt.path, 'modular');
    assert.equal(runtimeOf(store.toSaveData()).completedEventIds.includes('lcq.event.sudaji_south_pact'), false);
    store.loadFromSaveData(battle);
    const before = cloneJson(store.toSaveData()); fail = true; calls = 0;
    const seal = fixtures.tools.rtm.getCurrentStoryEventActions(before)[0];
    const failed = await submit(seal.playerLine, seal);
    assert.equal(calls, 2);
    assert.equal(failed.transactionCommitted, undefined);
    assert.equal(failed.generationError.code, 'DEMO_MODULE_FAILED');
    const afterFailure = cloneJson(store.toSaveData());
    delete afterFailure.元数据?.更新时间; delete before.元数据?.更新时间;
    assert.deepEqual(afterFailure, before);
  } finally {
    aiService.generate = original; aiService.checkAvailability = check;
    localStorage.removeItem('xiantu.modularTurnPlaytest.v1'); localStorage.removeItem('xiantu.fastNarrativeDemo.v1');
  }
});


test('sixty-zhu payment settles once on the second verified fee action', async () => {
  const { rtm } = fixtures.tools;
  const save = await walkFrom(fixtures.tools, at('atBond'), 'lcq.event.charge_sudaji_fee');
  const runtime = runtimeOf(save);
  save.角色.背包.货币 ||= {};
  save.角色.背包.货币.金铢 = { 币种: '金铢', 名称: '金铢', 数量: 0, 价值度: 1 };
  const first = rtm.getCurrentStoryEventActions(save).find(item => item.actionId === 'name_sixty_zhu_before_help');
  assert.ok(first);
  const offered = rtm.recordStoryEventStructuredAction(save, first);
  assert.equal(offered.attempted, true, offered.reason);
  assert.equal(offered.outcome, 'success');
  assert.equal(save.角色.背包.货币.金铢.数量, 0);
  runtime.worldTurn++;
  const second = rtm.getCurrentStoryEventActions(save).find(item => item.actionId === 'lock_fee_then_remove_device');
  assert.ok(second);
  const paid = rtm.recordStoryEventStructuredAction(save, second);
  assert.equal(paid.attempted, true, paid.reason);
  assert.equal(paid.outcome, 'success');
  assert.equal(save.角色.背包.货币.金铢.数量, 60);
  rtm.recordStoryEventStructuredAction(save, second);
  assert.equal(save.角色.背包.货币.金铢.数量, 60);
});
