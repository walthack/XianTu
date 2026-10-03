import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import { createPinia, setActivePinia } from 'pinia';
import { loadTs } from './loadTs.mjs';

const pipelineJiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: {
    '@': fileURLToPath(new URL('../src', import.meta.url)),
    '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
  },
});

async function loadPipeline(relativePath) {
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

async function openingSave() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const raw = await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url), 'utf8');
  const save = createQingyuOpeningPlaytestSave(parseScenarioMod(JSON.parse(raw)));
  const action = getCurrentStoryEventActions(save).find(item => item.eventId === 'lcq.event.s01_01');
  assert.ok(action);
  return { save, action };
}

test('salvage recovers a closed text field and drops incomplete commands; unclosed text is not guessed', async () => {
  const salvage = await loadTs('../src/services/narrativeResponseSalvage.ts');
  const complete = salvage.salvageCompleteNarrativeResponse(JSON.stringify({
    text: '你先看清眼前的草原，没有贸然作出新的决定。',
    mid_term_memory: '当下行动已处理。',
    tavern_commands: [{ action: 'set', key: '角色.背包.物品.fake', value: 1 }],
  }));
  assert.equal(complete.salvaged, false);
  assert.match(complete.text, /草原/);
  assert.equal(complete.tavern_commands.length, 1);

  const partial = salvage.salvageCompleteNarrativeResponse(
    '{"text":"你先看清眼前的草原，没有贸然作出新的决定。风从草叶间穿过。","mid_term_memory":"当下',
  );
  assert.equal(partial.salvaged, true);
  assert.match(partial.text, /草原/);
  assert.deepEqual(partial.tavern_commands, []);

  assert.equal(salvage.salvageCompleteNarrativeResponse('{"text":"partial'), null);
  assert.equal(salvage.salvageCompleteNarrativeResponse('{"text":"太短"}').text, '太短');
});

test('truncation with a closed narrative field does not inflate to 16000 or start a second request', async () => {
  const { aiService, MAIN_NARRATIVE_OUTPUT_CAP, TRUNCATION_RECOVERY_MAX_TOKENS } = await loadTs('../src/services/aiService.ts');
  assert.equal(TRUNCATION_RECOVERY_MAX_TOKENS, MAIN_NARRATIVE_OUTPUT_CAP);
  assert.equal(MAIN_NARRATIVE_OUTPUT_CAP, 8192);
  const original = aiService.generateOnce;
  const seen = [];
  const body = JSON.stringify({
    text: '你先看清眼前的草原，没有贸然作出新的决定。风从草叶间穿过。',
    mid_term_memory: '当下行动已处理。',
    tavern_commands: [],
  });
  const term = await loadTs('../src/services/aiResponseTermination.ts');
  aiService.generateOnce = async opts => {
    seen.push(opts);
    throw new term.OutputTruncationError({ budget: 8192, partialContent: body });
  };
  try {
    const result = await aiService.generate({ user_input: 'x', usageType: 'main' });
    assert.match(result, /草原/);
    assert.equal(JSON.parse(result).tavern_commands.length, 0);
    assert.equal(seen.length, 1);
  } finally {
    aiService.generateOnce = original;
  }
});

test('unknown Jev-like models do not receive reasoning parameters', async () => {
  const { optionalReasoningParam } = await loadTs('../src/services/optionalReasoningParams.ts');
  assert.equal(optionalReasoningParam('custom', 'typesafe/jev-router'), undefined);
  assert.equal(optionalReasoningParam('openai', 'typesafe/jev-router'), undefined);
  assert.equal(optionalReasoningParam('openai', 'unknown-flash'), undefined);
  assert.deepEqual(optionalReasoningParam('openai', 'o3-mini'), { reasoning: { effort: 'low' } });
});

test('publish path blocks unreceipted item grants and unknown IDs without treating scene mentions as claims', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
  const { save } = await openingSave();
  const lastNarrative = result => result.saveData.系统.历史.叙事.at(-1).content;
  const hasStarSword = result => Boolean(result.saveData.角色.背包?.物品?.['lcq.item.star_sword']);

  const scene = await AIBidirectionalSystem.processGmResponse(
    { text: '案上仍放着锦囊，你没有伸手去接。', mid_term_memory: '看见锦囊。', tavern_commands: [], action_options: [] },
    structuredClone(save),
    false,
    () => false,
    { userAction: '我听他把话说完。', playerIntentText: '我听他把话说完。' },
  );
  assert.match(lastNarrative(scene), /锦囊/);
  assert.equal(hasStarSword(scene), false);

  const claim = await AIBidirectionalSystem.processGmResponse(
    { text: '你接过星河剑。', mid_term_memory: '得剑。', tavern_commands: [], action_options: [] },
    structuredClone(save),
    false,
    () => false,
    { userAction: '我听他把话说完。', playerIntentText: '我听他把话说完。' },
  );
  assert.match(lastNarrative(claim), /没有新的道具交付/);
  assert.equal(hasStarSword(claim), false);

  const unknown = await AIBidirectionalSystem.processGmResponse(
    {
      text: '你点了点头。',
      mid_term_memory: '点头。',
      tavern_commands: [{ action: 'set', key: '角色.背包.物品.lcq.item.star_sword', value: { 物品ID: 'lcq.item.star_sword', 名称: '星河剑', 数量: 1 } }],
      action_options: [],
    },
    structuredClone(save),
    false,
    () => false,
    { userAction: '我听他把话说完。', playerIntentText: '我听他把话说完。' },
  );
  assert.equal(hasStarSword(unknown), false);

  const bypass = await AIBidirectionalSystem.processGmResponse(
    { text: '你把那把星河剑别在腰间，像早就有了一样。', mid_term_memory: '别剑。', tavern_commands: [], action_options: [] },
    structuredClone(save),
    false,
    () => false,
    { userAction: '我听他把话说完。', playerIntentText: '我听他把话说完。' },
  );
  assert.equal(hasStarSword(bypass), false);
  assert.match(lastNarrative(bypass), /没有新的道具交付/);
  assert.equal(lastNarrative(bypass).includes('星河剑'), false);

  const refs = await AIBidirectionalSystem.processGmResponse(
    {
      text: '你点了点头。',
      mid_term_memory: '点头。',
      tavern_commands: [],
      item_references: [{ id: 'lcq.item.star_sword', purpose: 'claim' }],
      action_options: [],
    },
    structuredClone(save),
    false,
    () => false,
    { userAction: '我听他把话说完。', playerIntentText: '我听他把话说完。' },
  );
  assert.equal(hasStarSword(refs), false);
  // 2026-10-01：结构化字段越权只丢弃结构化数据，不再牵连正文。
  assert.match(lastNarrative(refs), /你点了点头/);
  assert.equal(lastNarrative(refs).includes('没有新的道具交付'), false);

  // 真机报告场景：长正文 + 结构化未知道具 ID → 正文完整保留，背包不变。
  const longProse = '夜色压在废猎屋的檐下。凝羽把刀横在膝上，没有看你，只说门口风大。你在火塘边坐下，听她把今天的路线又理了一遍。火光把她的侧脸照得很淡，她说完便不再开口。';
  const unknownRef = await AIBidirectionalSystem.processGmResponse(
    { text: longProse, mid_term_memory: '夜谈。', tavern_commands: [], item_references: [{ id: 'item_2000111_hut_slip', purpose: 'claim' }], action_options: ['继续守夜'] },
    structuredClone(save), false, () => false,
    { userAction: '我听他把话说完。', playerIntentText: '我听他把话说完。' },
  );
  assert.match(lastNarrative(unknownRef), /凝羽把刀横在膝上/);
  assert.equal(lastNarrative(unknownRef).includes('没有新的道具交付'), false);

  // 正文只有一句越权获得：只删那一句，其余保留。
  const mixed = await AIBidirectionalSystem.processGmResponse(
    { text: longProse + '你接过星河剑。', mid_term_memory: '夜谈。', tavern_commands: [], action_options: [] },
    structuredClone(save), false, () => false,
    { userAction: '我听他把话说完。', playerIntentText: '我听他把话说完。' },
  );
  assert.equal(hasStarSword(mixed), false);
  assert.match(lastNarrative(mixed), /凝羽把刀横在膝上/);
  assert.equal(lastNarrative(mixed).includes('星河剑'), false);
  assert.equal(lastNarrative(mixed).includes('没有新的道具交付'), false);
});

test('publish path blocks Run4 agency counterexamples and does not settle', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
  const { save, action } = await openingSave();
  const beforeCompleted = [...(save.世界.状态.剧本模组.completedEventIds || [])];
  await assert.rejects(
    () => AIBidirectionalSystem.processGmResponse(
      { text: '你抽出短刀，捅死了孙疤脸。', mid_term_memory: '杀人。', tavern_commands: [], action_options: [] },
      structuredClone(save),
      false,
      () => false,
      { eventAction: action, userAction: '我判断她要带我去哪。', playerIntentText: '我判断她要带我去哪。' },
    ),
    err => err?.code === 'PLAYER_AGENCY_VIOLATION' && String(err.message).includes('杀人'),
  );
  await assert.rejects(
    () => AIBidirectionalSystem.processGmResponse(
      { text: '你报出自己的名字。', mid_term_memory: '报名。', tavern_commands: [], action_options: [] },
      structuredClone(save),
      false,
      () => false,
      { eventAction: action, userAction: '我听他把话说完。', playerIntentText: '我听他把话说完。' },
    ),
    err => err?.code === 'PLAYER_AGENCY_VIOLATION',
  );
  await assert.rejects(
    () => AIBidirectionalSystem.processGmResponse(
      { text: '你替月霜解甲，然后喂她药。', mid_term_memory: '越权。', tavern_commands: [], action_options: [] },
      structuredClone(save),
      false,
      () => false,
      { eventAction: action, userAction: '我应对眼前危局。', playerIntentText: '我应对眼前危局。' },
    ),
    err => err?.code === 'PLAYER_AGENCY_VIOLATION',
  );
  assert.deepEqual(save.世界.状态.剧本模组.completedEventIds || [], beforeCompleted);
});

test('typed axios timeout is not swallowed as a generic network error', async () => {
  const { aiService } = await loadTs('../src/services/aiService.ts');
  const { isAiRequestTimeout } = await loadTs('../src/services/aiRequestDeadline.ts');
  const post = axios.post;
  axios.post = async () => {
    throw new axios.AxiosError('timeout of 120000ms exceeded', 'ECONNABORTED', { timeout: 120000 });
  };
  try {
    await assert.rejects(
      aiService.generateWithAPIConfig({ user_input: 'test', should_stream: false, requestMaxRetries: 0, usageType: 'main' }, {
        provider: 'openai', url: 'https://fixture.example/v1', apiKey: 'fixture', model: 'fixture', maxTokens: 8192,
      }),
      err => isAiRequestTimeout(err) && err.message.includes('120秒'),
    );
  } finally {
    axios.post = post;
  }
});

const TEST_PROFILE = {
  模式: '单机',
  角色: { 名字: '程宗扬', 性别: '男' },
  存档列表: {},
};

async function withStubbedGenerate(aiService, impl) {
  const { useAPIManagementStore } = await loadPipeline('../src/stores/apiManagementStore.ts');
  const api = useAPIManagementStore(); const originalApiConfigs = [...api.apiConfigs];
  api.apiConfigs = [{ id: 'fixture-minimax', name: 'fixture', provider: 'custom', url: 'https://api.minimaxi.com/v1', apiKey: 'fixture-not-a-real-key', model: 'MiniMax-M3', enabled: true }];
  const originalCheck = aiService.checkAvailability;
  const originalGenerate = aiService.generate;
  const originalGenerateRaw = aiService.generateRaw;
  const originalConfig = structuredClone(aiService.getConfig?.() || aiService.config);
  aiService.checkAvailability = () => ({ available: true, message: 'test-stub' });
  aiService.generate = impl;
  aiService.generateRaw = async () => {
    throw new Error('must not call generateRaw');
  };
  return () => {
    api.apiConfigs = originalApiConfigs;
    aiService.checkAvailability = originalCheck;
    aiService.generate = originalGenerate;
    aiService.generateRaw = originalGenerateRaw;
    if (originalConfig && typeof aiService.saveConfig === 'function') aiService.saveConfig(originalConfig);
  };
}

test('only truncation/format errors may settle a local contract; infrastructure errors must not', async () => {
  const { shouldSettleLocalContractAfterGenerationFailure } = await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
  const { OutputTruncationError } = await loadPipeline('../src/services/aiResponseTermination.ts');
  const { PlayerAgencyViolationError } = await loadPipeline('../src/modules/scenarioMods/playerAgencyGuard.ts');
  const { AiRequestTimeoutError } = await loadPipeline('../src/services/aiRequestDeadline.ts');
  assert.equal(shouldSettleLocalContractAfterGenerationFailure(new OutputTruncationError({ budget: 8192 })), true);
  assert.equal(shouldSettleLocalContractAfterGenerationFailure(new Error('无法解析AI响应：unexpected end')), true);
  assert.equal(shouldSettleLocalContractAfterGenerationFailure(new Error('AI响应中未提取到有效叙事文本')), true);
  assert.equal(shouldSettleLocalContractAfterGenerationFailure(new Error('indexedDB is not defined')), false);
  assert.equal(shouldSettleLocalContractAfterGenerationFailure(new PlayerAgencyViolationError(['杀人'])), false);
  assert.equal(shouldSettleLocalContractAfterGenerationFailure(new AiRequestTimeoutError('total', 120000)), false);
  const { QingyuTurnLongRequestBudgetError } = await loadPipeline('../src/services/qingyuTurnLongRequests.ts');
  assert.equal(shouldSettleLocalContractAfterGenerationFailure(new QingyuTurnLongRequestBudgetError()), true);
});

test('processPlayerAction generate-publish path rejects unreceipted item grants via item_references', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await loadPipeline('../src/stores/gameStateStore.ts');
  const { aiService } = await loadPipeline('../src/services/aiService.ts');
  const { save, action } = await openingSave();
  let calls = 0;
  const restore = await withStubbedGenerate(aiService, async () => {
    calls += 1;
    return JSON.stringify({
      text: '你接过星河剑。草原的风还在吹。',
      mid_term_memory: '得剑。',
      tavern_commands: [],
      item_references: [{ id: 'lcq.item.star_sword', purpose: 'claim' }],
      action_options: [],
    });
  });
  try {
    const store = useGameStateStore();
    store.loadFromSaveData(structuredClone(save));
    const response = await AIBidirectionalSystem.processPlayerAction(action.playerLine, TEST_PROFILE, {
      eventAction: structuredClone(action),
      eventActionProvenance: 'selected',
      playerIntentText: action.playerLine,
      shouldAbort: () => false,
    });
    assert.ok(calls >= 1 && calls <= 2, `generate calls=${calls}`);
    assert.ok(response);
    assert.equal(response.generationError?.code, 'DEMO_MODULE_FAILED');
    assert.notEqual(response.transactionCommitted, true);
    assert.equal(store.toSaveData().角色.背包?.物品?.['lcq.item.star_sword'], undefined);
  } finally {
    restore();
  }
});

test('processPlayerAction generate-publish path fail-closes unauthorized killing', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await loadPipeline('../src/stores/gameStateStore.ts');
  const { aiService } = await loadPipeline('../src/services/aiService.ts');
  const { save, action } = await openingSave();
  let calls = 0;
  const restore = await withStubbedGenerate(aiService, async () => {
    calls += 1;
    return JSON.stringify({
      text: '你抽出短刀，捅死了孙疤脸。',
      mid_term_memory: '杀人。',
      tavern_commands: [],
      action_options: [],
    });
  });
  try {
    const store = useGameStateStore();
    store.loadFromSaveData(structuredClone(save));
    const before = [...(store.toSaveData().世界.状态.剧本模组.completedEventIds || [])];
    const response = await AIBidirectionalSystem.processPlayerAction('我判断她要带我去哪。', TEST_PROFILE, {
      eventAction: structuredClone(action),
      eventActionProvenance: 'selected',
      playerIntentText: '我判断她要带我去哪。',
      shouldAbort: () => false,
    });
    assert.ok(calls >= 1 && calls <= 2, `generate calls=${calls}`);
    assert.equal(response?.generationError?.code, 'DEMO_MODULE_FAILED');
    assert.notEqual(response?.transactionCommitted, true);
    assert.deepEqual(store.toSaveData().世界.状态.剧本模组.completedEventIds || [], before);
  } finally {
    restore();
  }
});

test('promptStorage loadAll falls back to default prompts without IndexedDB', async () => {
  const { promptStorage } = await loadTs('../src/services/prompts/promptStorage.ts');
  const all = await promptStorage.loadAll();
  assert.ok(Object.keys(all).length > 0, 'default prompts must load so generate-path tests can assemble');
  const enabled = await promptStorage.getEnabledPrompts();
  assert.ok(enabled.length > 0);
});

test('module generate path uses a compact text-only packet and cannot write model commands', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await loadPipeline('../src/stores/gameStateStore.ts');
  const { aiService } = await loadPipeline('../src/services/aiService.ts');
  const { save, action } = await openingSave();
  let calls = 0;
  let seenInput = '';
  const restore = await withStubbedGenerate(aiService, async options => {
    calls += 1;
    seenInput += `\n${String(options?.user_input || '')}\n${(options?.injects || []).map(item => item.content).join('\n')}`;
    assert.equal(options.usageType, 'module_narrative');
    assert.equal(options.maxTokens, 4096);
    assert.equal(options.should_stream, true);
    assert.equal(options.reasoningEffort, 'none');
    return JSON.stringify({
      text: '你先看清眼前的草原，没有贸然作出新的决定。风从草叶间穿过。',
      mid_term_memory: '当下行动已处理。',
      tavern_commands: [],
      item_references: [],
      action_options: [],
    });
  });
  try {
    const store = useGameStateStore();
    store.loadFromSaveData(structuredClone(save));
    const response = await AIBidirectionalSystem.processPlayerAction(action.playerLine, TEST_PROFILE, {
      eventAction: structuredClone(action),
      eventActionProvenance: 'selected',
      playerIntentText: action.playerLine,
      shouldAbort: () => false,
    });
    assert.ok(calls >= 1 && calls <= 2, `generate calls=${calls}`);
    assert.ok(response);
    assert.equal(response.moduleReceipt.path, 'modular');
    assert.equal(response.transactionCommitted, true);
    assert.ok(seenInput.length < 10000);
    assert.doesNotMatch(seenInput, /精简版SaveData结构说明/);
    assert.deepEqual(response.tavern_commands, []);
    assert.equal(/写满8192|限600字/.test(seenInput), false);
  } finally {
    restore();
  }
});

test('qingyu turn long-request budget is two shared slots including recovery', async () => {
  const budget = await loadTs('../src/services/qingyuTurnLongRequests.ts');
  const save = (await openingSave()).save;
  const turnId = budget.beginQingyuTurnLongRequests(save);
  try {
    assert.equal(budget.remainingQingyuTurnLongRequests(turnId), 2);
    assert.equal(budget.consumeQingyuTurnLongRequest({ usageType: 'main', qingyuTurnId: turnId }), true);
    assert.equal(budget.consumeQingyuTurnLongRequest({ usageType: 'main', maxTokens: 1024, qingyuTurnId: turnId }), true, 'intent classifier is not a long request');
    assert.equal(budget.consumeQingyuTurnLongRequest({ usageType: 'main', qingyuTurnId: turnId }), true);
    assert.equal(budget.consumeQingyuTurnLongRequest({ usageType: 'main', qingyuTurnId: turnId }), false);
    assert.equal(budget.remainingQingyuTurnLongRequests(turnId), 0);
    budget.beginQingyuTurnLongRequests(save, turnId);
    try {
      assert.equal(budget.remainingQingyuTurnLongRequests(turnId), 0, 'UI format retry nested in the same turn must not refill');
      assert.equal(budget.consumeQingyuTurnLongRequest({ usageType: 'main', qingyuTurnId: turnId }), false);
    } finally {
      budget.endQingyuTurnLongRequests(turnId);
    }
  } finally {
    budget.endQingyuTurnLongRequests(turnId);
    budget.releaseQingyuTurnLongRequests(turnId);
  }
});

test('late turn A cleanup cannot fail-open turn B budget', async () => {
  const budget = await loadTs('../src/services/qingyuTurnLongRequests.ts');
  const save = (await openingSave()).save;
  const turnA = budget.beginQingyuTurnLongRequests(save);
  assert.equal(budget.consumeQingyuTurnLongRequest({ usageType: 'main', qingyuTurnId: turnA }), true);
  budget.invalidateQingyuTurnLongRequests(turnA);
  const turnB = budget.beginQingyuTurnLongRequests(save);
  assert.notEqual(turnB, turnA);
  assert.equal(budget.remainingQingyuTurnLongRequests(turnB), 2);
  assert.equal(budget.consumeQingyuTurnLongRequest({ usageType: 'main', qingyuTurnId: turnA }), false);
  budget.releaseQingyuTurnLongRequests(turnA);
  budget.endQingyuTurnLongRequests(turnA);
  assert.equal(budget.remainingQingyuTurnLongRequests(turnB), 2, 'A finally must not null B remaining');
  assert.equal(budget.consumeQingyuTurnLongRequest({ usageType: 'main', qingyuTurnId: turnB }), true);
  assert.equal(budget.remainingQingyuTurnLongRequests(turnB), 1);
  budget.releaseQingyuTurnLongRequests(turnB);
});

test('save-switch and unmount share owned-turn cleanup before tavern early return', async () => {
  const panel = await readFile(new URL('../src/components/dashboard/MainGamePanel.vue', import.meta.url), 'utf8');
  const unmount = panel.slice(panel.indexOf('onUnmounted(() => {'));
  const unmountHead = unmount.slice(0, unmount.indexOf('if (!isTavernEnvFlag)'));
  assert.match(unmountHead, /abandonOwnedGameTurn\(\)/);
  assert.match(panel, /const resetPanelState = \(\) => \{[\s\S]*?abandonOwnedGameTurn\(\);/);
  assert.match(panel, /aiService\.abortQingyuTurnRequests\(owned\)/);
  assert.match(panel, /if \(aiResetToken === resetSnapshot\) \{\s*releaseQingyuTurnLongRequests\(qingyuTurnId\);/);
});

function okOpenAIBody(text = '你先看清眼前的草原。') {
  return {
    data: {
      choices: [{
        message: { content: JSON.stringify({ text, mid_term_memory: '当下行动已处理。', tavern_commands: [], action_options: [] }) },
        finish_reason: 'stop',
      }],
    },
  };
}

test('each network retry is a long transport and cannot exceed the turn budget', async () => {
  const budget = await loadTs('../src/services/qingyuTurnLongRequests.ts');
  const { aiService } = await loadTs('../src/services/aiService.ts');
  const save = (await openingSave()).save;
  const turnId = budget.beginQingyuTurnLongRequests(save);
  const post = axios.post;
  let posts = 0;
  axios.post = async () => {
    posts += 1;
    if (posts === 1) {
      const error = new Error('network blip');
      error.response = undefined;
      throw error;
    }
    return okOpenAIBody();
  };
  const originalConfig = structuredClone(aiService.getConfig?.() || aiService.config);
  try {
    aiService.saveConfig({
      mode: 'custom', maxRetries: 3, streaming: false,
      customAPI: { provider: 'openai', url: 'https://fixture.example/v1', apiKey: 'fixture', model: 'fixture', maxTokens: 8192 },
    });
    await aiService.generate({
      user_input: 'x', usageType: 'main', qingyuTurnId: turnId, requestMaxRetries: 3, should_stream: false,
    });
    assert.equal(posts, 2, `transport posts=${posts}`);
    assert.equal(budget.remainingQingyuTurnLongRequests(turnId), 0);
    await assert.rejects(
      aiService.generate({
        user_input: 'y', usageType: 'main', qingyuTurnId: turnId, requestMaxRetries: 3, should_stream: false,
      }),
      err => err?.code === 'QINGYU_TURN_LONG_REQUEST_BUDGET',
    );
    assert.equal(posts, 2, 'budget must stop further HTTP');
  } finally {
    axios.post = post;
    budget.releaseQingyuTurnLongRequests(turnId);
    if (originalConfig && typeof aiService.saveConfig === 'function') aiService.saveConfig(originalConfig);
  }
});

test('stream-unsupported fallback is a second long transport on the same turn', async () => {
  const budget = await loadTs('../src/services/qingyuTurnLongRequests.ts');
  const { aiService } = await loadTs('../src/services/aiService.ts');
  const save = (await openingSave()).save;
  const turnId = budget.beginQingyuTurnLongRequests(save);
  const post = axios.post;
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  let posts = 0;
  globalThis.fetch = async () => {
    fetches += 1;
    throw new Error('stream not supported');
  };
  axios.post = async () => {
    posts += 1;
    return okOpenAIBody();
  };
  const originalConfig = structuredClone(aiService.getConfig?.() || aiService.config);
  try {
    aiService.saveConfig({
      mode: 'custom', maxRetries: 0, streaming: true,
      customAPI: { provider: 'openai', url: 'https://fixture.example/v1', apiKey: 'fixture', model: 'fixture', maxTokens: 8192 },
    });
    await aiService.generate({
      user_input: 'x', usageType: 'main', qingyuTurnId: turnId, requestMaxRetries: 0, should_stream: true,
    });
    assert.equal(fetches, 1);
    assert.equal(posts, 1);
    assert.equal(budget.remainingQingyuTurnLongRequests(turnId), 0);
  } finally {
    axios.post = post;
    globalThis.fetch = originalFetch;
    budget.releaseQingyuTurnLongRequests(turnId);
    if (originalConfig && typeof aiService.saveConfig === 'function') aiService.saveConfig(originalConfig);
  }
});

test('abortQingyuTurnRequests only cancels owned turn; ignored abort cannot spend B budget', async () => {
  const budget = await loadTs('../src/services/qingyuTurnLongRequests.ts');
  const { aiService } = await loadTs('../src/services/aiService.ts');
  const save = (await openingSave()).save;
  const turnA = budget.beginQingyuTurnLongRequests(save);
  const post = axios.post;
  let releaseHang;
  const hang = new Promise(resolve => { releaseHang = resolve; });
  let posts = [];
  axios.post = async (_url, _body, cfg) => {
    const turn = cfg?.signal ? 'signaled' : 'none';
    posts.push({ aborted: Boolean(cfg?.signal?.aborted), turn });
    if (posts.length === 1) {
      await hang;
      return okOpenAIBody('迟到的星河剑不该出现。');
    }
    return okOpenAIBody('你先看清眼前的草原。');
  };
  const originalConfig = structuredClone(aiService.getConfig?.() || aiService.config);
  try {
    aiService.saveConfig({
      mode: 'custom', maxRetries: 0, streaming: false,
      customAPI: { provider: 'openai', url: 'https://fixture.example/v1', apiKey: 'fixture', model: 'fixture', maxTokens: 8192 },
    });
    const pendingA = aiService.generate({
      user_input: 'a', usageType: 'main', qingyuTurnId: turnA, requestMaxRetries: 0, should_stream: false,
    });
    const cancelledA = assert.rejects(pendingA, e => e.name === 'AbortError');
    while (posts.length < 1) await new Promise(resolve => setTimeout(resolve, 10));
    budget.invalidateQingyuTurnLongRequests(turnA);
    aiService.abortQingyuTurnRequests(turnA);
    const turnB = budget.beginQingyuTurnLongRequests(save);
    assert.equal(budget.remainingQingyuTurnLongRequests(turnB), 2);
    await aiService.generate({
      user_input: 'b', usageType: 'main', qingyuTurnId: turnB, requestMaxRetries: 0, should_stream: false,
    });
    assert.equal(posts.length, 2, `posts=${posts.length}`);
    assert.equal(budget.remainingQingyuTurnLongRequests(turnB), 1);
    releaseHang();
    await cancelledA;
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(budget.remainingQingyuTurnLongRequests(turnB), 1, 'A late success must not consume B');
    assert.equal(posts.length, 2);
    budget.releaseQingyuTurnLongRequests(turnB);
  } finally {
    axios.post = post;
    if (originalConfig && typeof aiService.saveConfig === 'function') aiService.saveConfig(originalConfig);
  }
});

test('processPlayerAction late A after abort does not settle into the live save', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await loadPipeline('../src/stores/gameStateStore.ts');
  const { aiService } = await loadPipeline('../src/services/aiService.ts');
  const budget = await loadTs('../src/services/qingyuTurnLongRequests.ts');
  const { save, action } = await openingSave();
  let releaseHang;
  const hang = new Promise(resolve => { releaseHang = resolve; });
  let aborted = false;
  const restore = await withStubbedGenerate(aiService, async () => {
    await hang;
    return JSON.stringify({
      text: '你接过星河剑。草原的风还在吹。',
      mid_term_memory: '得剑。',
      tavern_commands: [],
      item_references: [{ id: 'lcq.item.star_sword', purpose: 'claim' }],
      action_options: [],
    });
  });
  try {
    const store = useGameStateStore();
    store.loadFromSaveData(structuredClone(save));
    const turnA = budget.beginQingyuTurnLongRequests(store.toSaveData());
    const pendingA = AIBidirectionalSystem.processPlayerAction(action.playerLine, TEST_PROFILE, {
      eventAction: structuredClone(action),
      eventActionProvenance: 'selected',
      playerIntentText: action.playerLine,
      qingyuTurnId: turnA,
      shouldAbort: () => aborted,
    });
    aborted = true;
    budget.invalidateQingyuTurnLongRequests(turnA);
    const turnB = budget.beginQingyuTurnLongRequests(store.toSaveData());
    releaseHang();
    await pendingA;
    assert.equal(store.toSaveData().角色.背包?.物品?.['lcq.item.star_sword'], undefined);
    assert.equal(budget.remainingQingyuTurnLongRequests(turnB), 2);
    budget.releaseQingyuTurnLongRequests(turnA);
    budget.releaseQingyuTurnLongRequests(turnB);
  } finally {
    restore();
  }
});

test('turn A hanging transport then B generate keeps B budget after A finally', async () => {
  const budget = await loadTs('../src/services/qingyuTurnLongRequests.ts');
  const { aiService } = await loadTs('../src/services/aiService.ts');
  const save = (await openingSave()).save;
  const turnA = budget.beginQingyuTurnLongRequests(save);
  const post = axios.post;
  let releaseHang;
  const hang = new Promise(resolve => { releaseHang = resolve; });
  let posts = 0;
  axios.post = async () => {
    posts += 1;
    if (posts === 1) {
      await hang;
      throw new Error('A aborted');
    }
    return okOpenAIBody('你把问题停在嘴里。');
  };
  const originalConfig = structuredClone(aiService.getConfig?.() || aiService.config);
  try {
    aiService.saveConfig({
      mode: 'custom', maxRetries: 0, streaming: false,
      customAPI: { provider: 'openai', url: 'https://fixture.example/v1', apiKey: 'fixture', model: 'fixture', maxTokens: 8192 },
    });
    const pendingA = aiService.generate({
      user_input: 'a', usageType: 'main', qingyuTurnId: turnA, requestMaxRetries: 0, should_stream: false,
    });
    budget.invalidateQingyuTurnLongRequests(turnA);
    const turnB = budget.beginQingyuTurnLongRequests(save);
    assert.equal(budget.remainingQingyuTurnLongRequests(turnB), 2);
    budget.releaseQingyuTurnLongRequests(turnA);
    assert.equal(budget.remainingQingyuTurnLongRequests(turnB), 2);
    await aiService.generate({
      user_input: 'b', usageType: 'main', qingyuTurnId: turnB, requestMaxRetries: 0, should_stream: false,
    });
    assert.equal(posts, 2);
    assert.equal(budget.remainingQingyuTurnLongRequests(turnB), 1);
    releaseHang();
    await assert.rejects(pendingA);
    assert.equal(budget.remainingQingyuTurnLongRequests(turnB), 1, 'A reject must not clear B');
    budget.releaseQingyuTurnLongRequests(turnB);
  } finally {
    axios.post = post;
    if (originalConfig && typeof aiService.saveConfig === 'function') aiService.saveConfig(originalConfig);
  }
});

test('bracket labels: drop bare 环境/场景 tags, keep paragraph-lead scene text with a full stop, only unwrap inline item names', async () => {
  setActivePinia(createPinia());
  const { flattenBracketLabels } = await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
  assert.equal(flattenBracketLabels('【环境】内院偏屋，灯暗。'), '内院偏屋，灯暗。');
  assert.equal(flattenBracketLabels('【内院偏屋，灯暗】押你回来的两人一左一右。'), '内院偏屋，灯暗。押你回来的两人一左一右。');
  assert.equal(flattenBracketLabels('你摸到【霓龙丝】，指尖一凉。'), '你摸到霓龙丝，指尖一凉。');
  assert.equal(flattenBracketLabels('【霓龙丝】在你手里发烫。'), '霓龙丝在你手里发烫。');
  assert.equal(flattenBracketLabels('【内院偏屋，灯暗。】押你回来的两人。'), '内院偏屋，灯暗。押你回来的两人。');
  assert.equal(flattenBracketLabels('她说这屋里的环境太闷。\n【内院偏屋，灯暗】押你的人退下。'), '她说这屋里的环境太闷。\n内院偏屋，灯暗。押你的人退下。');
});

test('locally accepted module turn advances the displayed clock once; replayed receipt and generation failure do not', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
  const { appendModuleReceipt } = await loadTs('../src/modules/scenarioMods/modularTurn.ts');
  const { save } = await openingSave();
  save.元数据.时间 = { 年: 200, 月: 1, 日: 1, 小时: 8, 分钟: 0 };
  const receipt = { id: 'nh1-clock-verified', path: 'modular', text: '你静静看着草叶。', route: { configId: 'test', provider: 'minimax', model: 'MiniMax-M3' }, promptChars: 100, foregroundMs: 1, memory: { status: 'pending' } };
  const response = { text: receipt.text, moduleReceipt: receipt, mid_term_memory: '', tavern_commands: [], action_options: [] };
  const options = { userAction: '我观察现场。', playerIntentText: '我观察现场。', narrativeAuthority: 'local_contract' };
  const result = await AIBidirectionalSystem.processGmResponse(structuredClone(response), structuredClone(save), false, () => false, options);
  assert.equal(result.saveData.元数据.时间.分钟, 1);
  appendModuleReceipt(result.saveData, receipt);
  const replay = await AIBidirectionalSystem.processGmResponse(structuredClone(response), result.saveData, false, () => false, options);
  assert.equal(replay.saveData.元数据.时间.分钟, 1);
  const failed = await AIBidirectionalSystem.processGmResponse({ ...structuredClone(response), generationError: { code: 'DEMO_MODULE_FAILED', message: 'failed' } }, structuredClone(save), false, () => false, options);
  assert.equal(failed.saveData.元数据.时间.分钟, 0);
});

test('Nanhuang cast rejection silently rewrites; persistent bad drafts use local current-step text and settle once', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await loadPipeline('../src/stores/gameStateStore.ts');
  const { aiService } = await loadPipeline('../src/services/aiService.ts');
  const { createMinimalSaveDataV3 } = await loadPipeline('../src/utils/dataRepair.ts');
  const { buildStrictScenarioInitialization, applyStrictScenarioInitializationToSave } = await loadPipeline('../src/modules/scenarioMods/strictInitializer.ts');
  const { getCurrentStoryEventActions, advanceScenarioRuntime } = await loadPipeline('../src/modules/scenarioMods/runtime.ts');
  const mod = JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json', import.meta.url), 'utf8'));
  const opened = advanceScenarioRuntime(applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), buildStrictScenarioInitialization(mod))).saveData;
  opened.系统.扩展.清羽记开局 = { kind: 'qingyu-demo-v1', endModId: 'lcq.stage_04b_lingfei_baiyi_crisis', endEventId: 'lcq.event.enter_dong_with_migu' };
  const action = getCurrentStoryEventActions(opened)[0];
  let calls = 0;
  let correctionSeen = false;
  const restore = await withStubbedGenerate(aiService, async options => {
    calls++;
    const prompt = (options.injects || []).map(i => i.content).join('\n') + String(options.user_input || '');
    if (calls > 1 && prompt.includes('上一稿被内部守卫退回')) correctionSeen = true;
    return '你看见段强走进蛇彝村。';
  });
  try {
    const store = useGameStateStore();
    store.loadFromSaveData(structuredClone(opened));
    const response = await AIBidirectionalSystem.processPlayerAction(action.playerLine, TEST_PROFILE, {
      eventAction: structuredClone(action), eventActionProvenance: 'selected', playerIntentText: action.playerLine, shouldAbort: () => false,
    });
    assert.equal(response.generationError, undefined);
    assert.equal(response.transactionCommitted, true);
    assert.equal(response.moduleReceipt.path, 'local');
    assert.equal(calls, 3);
    assert.equal(correctionSeen, true);
    assert.doesNotMatch(response.text, /段强/);
    const current = store.toSaveData().世界.状态.剧本模组;
    assert.equal(current.completedEventIds.filter(id => id === action.eventId).length, 1);
  } finally { restore(); }
});
