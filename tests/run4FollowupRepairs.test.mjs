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

test('processPlayerAction generate-publish path observes off-list items without rejecting prose or granting inventory', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await loadPipeline('../src/stores/gameStateStore.ts');
  const { aiService } = await loadPipeline('../src/services/aiService.ts');
  const { save, action } = await openingSave();
  let calls = 0;
  const restore = await withStubbedGenerate(aiService, async () => {
    calls += 1;
    return JSON.stringify({
      text: '你端详星河剑。草原的风还在吹。',
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
    assert.equal(calls, 1);
    assert.ok(response);
    assert.equal(response.generationError, undefined);
    assert.equal(response.moduleReceipt.path, 'modular');
    assert.doesNotMatch(response.text, /本地事件判定/);
    assert.equal(response.transactionCommitted, true);
    assert.equal(store.toSaveData().角色.背包?.物品?.['lcq.item.star_sword'], undefined);
  } finally {
    restore();
  }
});

test('processPlayerAction generate-publish path silently replaces unauthorized killing', async () => {
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
    assert.equal(calls, 3);
    assert.equal(response?.generationError, undefined);
    assert.equal(response.moduleReceipt.path, 'local');
    assert.doesNotMatch(response.text, /捅死|杀人|本地事件判定/);
    assert.equal(response?.transactionCommitted, true);
    assert.ok(store.toSaveData().世界.状态.剧本模组.completedEventIds.includes(action.eventId));
    assert.ok(before.every(id => store.toSaveData().世界.状态.剧本模组.completedEventIds.includes(id)));
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
  let opened = advanceScenarioRuntime(applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), buildStrictScenarioInitialization(mod))).saveData;
  opened.系统.扩展.清羽记开局 = { kind: 'qingyu-demo-v1', endModId: 'lcq.stage_04b_lingfei_baiyi_crisis', endEventId: 'lcq.event.enter_dong_with_migu' };
  opened.世界.状态.剧本模组.flags['event.s03b_snake_flower_bridge_01.done'] = true;
  opened = advanceScenarioRuntime(opened).saveData;
  const action = getCurrentStoryEventActions(opened)[0];
  assert.equal(action.eventId, 'lcq.event.s03b_snake_flower_bridge_02');
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
    const response = await AIBidirectionalSystem.processPlayerAction(`<行动趋向>${action.playerLine}</行动趋向> 本地事件判定已预结算事件=${action.eventId}；动作=advance_declared_objective`, TEST_PROFILE, {
      eventAction: structuredClone(action), eventActionProvenance: 'selected', playerIntentText: action.playerLine, shouldAbort: () => false,
    });
    assert.equal(response.generationError, undefined);
    assert.equal(response.transactionCommitted, true);
    assert.equal(response.moduleReceipt.path, 'local');
    assert.equal(calls, 3);
    assert.equal(correctionSeen, true);
    assert.doesNotMatch(response.text, /段强|<行动趋向>|本地事件判定|advance_declared_objective|lcq\.event\./);
    const current = store.toSaveData().世界.状态.剧本模组;
    assert.equal(current.completedEventIds.filter(id => id === action.eventId).length, 1);
  } finally { restore(); }
});

test('Nanhuang missing fixed facts silently rewrites three drafts, safely settles once', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await loadPipeline('../src/stores/gameStateStore.ts');
  const { aiService } = await loadPipeline('../src/services/aiService.ts');
  const { createMinimalSaveDataV3 } = await loadPipeline('../src/utils/dataRepair.ts');
  const { buildStrictScenarioInitialization, applyStrictScenarioInitializationToSave } = await loadPipeline('../src/modules/scenarioMods/strictInitializer.ts');
  const { getCurrentStoryEventActions, advanceScenarioRuntime } = await loadPipeline('../src/modules/scenarioMods/runtime.ts');
  const mod = JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json', import.meta.url), 'utf8'));
  let opened = advanceScenarioRuntime(applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), buildStrictScenarioInitialization(mod))).saveData;
  opened.角色.身份.名字 = '程宗扬';
  opened.系统.扩展.清羽记开局 = { kind: 'qingyu-demo-v1', endModId: 'lcq.stage_04b_lingfei_baiyi_crisis', endEventId: 'lcq.event.enter_dong_with_migu' };
  opened.世界.状态.剧本模组.flags['event.s03b_snake_flower_bridge_01.done'] = true;
  opened = advanceScenarioRuntime(opened).saveData;
  const action = getCurrentStoryEventActions(opened)[0];
  assert.equal(action.eventId, 'lcq.event.s03b_snake_flower_bridge_02');
  let calls = 0;
  let correctionSeen = false;
  const restore = await withStubbedGenerate(aiService, async options => {
    calls++;
    const prompt = (options.injects || []).map(i => i.content).join('\n') + String(options.user_input || '');
    if (calls > 1 && prompt.includes('上一稿被内部守卫退回：步骤固定要点缺失')) correctionSeen = true;
    return '你与云苍峰、凝羽、武二郎、祁远、吴战威、易彪、谢艺一同搜查蛇彝长屋。你得到一枚神秘玉符，放进背包。';
  });
  try {
    const store = useGameStateStore();
    store.loadFromSaveData(structuredClone(opened));
    const response = await AIBidirectionalSystem.processPlayerAction(`<行动趋向>${action.playerLine}</行动趋向> 本地事件判定已预结算事件=${action.eventId}；动作=advance_declared_objective`, TEST_PROFILE, {
      eventAction: structuredClone(action), eventActionProvenance: 'selected', playerIntentText: action.playerLine, shouldAbort: () => false,
    });
    assert.equal(response.generationError, undefined);
    assert.equal(response.transactionCommitted, true);
    assert.equal(response.moduleReceipt.path, 'local');
    assert.equal(calls, 3);
    assert.equal(correctionSeen, true);
    assert.match(response.text, /鬼王峒/);
    assert.doesNotMatch(response.text, /观察 ·|眼前的事情告一段落/);
    assert.doesNotMatch(response.text, /神秘玉符|<行动趋向>|本地事件判定|advance_declared_objective|lcq\.event\./);
    const current = store.toSaveData().世界.状态.剧本模组;
    assert.equal(current.completedEventIds.filter(id => id === action.eventId).length, 1);
  } finally { restore(); }
});

test('stage_02 regicide-offer age failures silently retry and safely settle its second step', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await loadPipeline('../src/stores/gameStateStore.ts');
  const { aiService } = await loadPipeline('../src/services/aiService.ts');
  const { createMinimalSaveDataV3 } = await loadPipeline('../src/utils/dataRepair.ts');
  const { buildStrictScenarioInitialization, applyStrictScenarioInitializationToSave } = await loadPipeline('../src/modules/scenarioMods/strictInitializer.ts');
  const { getCurrentStoryEventActions, advanceScenarioRuntime } = await loadPipeline('../src/modules/scenarioMods/runtime.ts');
  const mod = JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_02.json', import.meta.url), 'utf8'));
  const opened = advanceScenarioRuntime(applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), buildStrictScenarioInitialization(mod))).saveData;
  opened.系统.扩展.清羽记开局 = { kind: 'qingyu-demo-v1', endModId: 'lcq.stage_04b_lingfei_baiyi_crisis', endEventId: 'lcq.event.enter_dong_with_migu' };
  const runtime = opened.世界.状态.剧本模组;
  for (const event of runtime.events) {
    if (event.id === 'lcq.event.ningyu_regicide_offer') continue;
    runtime.completedEventIds.push(event.id);
    for (const condition of event.completion || []) {
      if (condition.path.startsWith('flags.')) runtime.flags[condition.path.slice(6)] = condition.value;
    }
  }
  runtime.activeEventIds = ['lcq.event.ningyu_regicide_offer'];
  const { recordStoryEventStructuredAction } = await loadPipeline('../src/modules/scenarioMods/runtime.ts');
  const first = getCurrentStoryEventActions(opened)[0];
  assert.equal(first.eventId, 'lcq.event.ningyu_regicide_offer');
  runtime.worldTurn++;
  assert.equal(recordStoryEventStructuredAction(opened, first).attempted, true);
  const action = getCurrentStoryEventActions(opened)[0];
  assert.ok(action);
  assert.equal(action.stepIndex, 2);
  runtime.worldTurn++;
  let calls = 0;
  let correctionSeen = false;
  const restore = await withStubbedGenerate(aiService, async options => {
    calls++;
    const prompt = (options.injects || []).map(i => i.content).join('\n') + String(options.user_input || '');
    if (calls > 1 && prompt.includes('上一稿被内部守卫退回')) correctionSeen = true;
    return '你看见不过十七八岁的姑娘站在篝火旁。';
  });
  try {
    const store = useGameStateStore();
    store.loadFromSaveData(structuredClone(opened));
    const response = await AIBidirectionalSystem.processPlayerAction(`<行动趋向>${action.playerLine}</行动趋向> 本地事件判定已预结算事件=${action.eventId}；动作=advance_declared_objective`, TEST_PROFILE, {
      eventAction: structuredClone(action), eventActionProvenance: 'selected', playerIntentText: action.playerLine, shouldAbort: () => false,
    });
    assert.equal(response.generationError, undefined);
    assert.equal(response.transactionCommitted, true);
    assert.equal(response.moduleReceipt.path, 'local');
    assert.equal(calls, 3);
    assert.equal(correctionSeen, true);
    assert.doesNotMatch(response.text, /十七八|<行动趋向>|本地事件判定|advance_declared_objective|lcq\.event\./);
    const current = store.toSaveData().世界.状态.剧本模组;
    assert.equal(current.completedEventIds.filter(id => id === action.eventId).length, 1);
  } finally { restore(); }
});

test('Zixi and Black Shoal request model performance instead of bypassing it with fixed summaries', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await loadPipeline('../src/stores/gameStateStore.ts');
  const { aiService } = await loadPipeline('../src/services/aiService.ts');
  const { createMinimalSaveDataV3 } = await loadPipeline('../src/utils/dataRepair.ts');
  const { buildStrictScenarioInitialization, applyStrictScenarioInitializationToSave } = await loadPipeline('../src/modules/scenarioMods/strictInitializer.ts');
  const { getCurrentStoryEventActions, advanceScenarioRuntime, recordStoryEventStructuredAction } = await loadPipeline('../src/modules/scenarioMods/runtime.ts');
  const { fixedBeatNarrative } = await loadPipeline('../src/modules/scenarioMods/fixedEndingNarratives.ts');
  for (const [stageId, id, location, secondStep] of [
    ['02', 'lcq.event.zixi_taiyi_intercept', '中州·南荒途中·紫溪', false],
    ['02', 'lcq.event.rainforest_black_shoal', '中州·南荒途中·雨林黑石滩', true],
    ['04', 'lcq.event.s04_04', '叶媪山村', false],
  ]) {
    const mod = JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/lcq.stage_${stageId}.json`, import.meta.url), 'utf8'));
    const opened = advanceScenarioRuntime(applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), buildStrictScenarioInitialization(mod))).saveData;
    opened.系统.扩展.清羽记开局 = { kind: 'qingyu-demo-v1' };
    const runtime = opened.世界.状态.剧本模组;
    for (const event of runtime.events) {
      if (event.id === id) continue;
      runtime.completedEventIds.push(event.id);
      for (const c of event.completion || []) if (c.path.startsWith('flags.')) runtime.flags[c.path.slice(6)] = c.value;
    }
    runtime.activeEventIds = [id];
    if (secondStep) {
      runtime.worldTurn++;
      recordStoryEventStructuredAction(opened, getCurrentStoryEventActions(opened)[0]);
    }
    opened.角色.位置.描述 = location;
    runtime.worldTurn++;
    const action = getCurrentStoryEventActions(opened)[0];
    assert.equal(action.eventId, id);
    for (const a of runtime.events.find(e => e.id === id).playerCompletionContract.actions) assert.equal(fixedBeatNarrative(id, a.id), undefined);
    let calls = 0;
    let sceneCalls = 0;
    const restore = await withStubbedGenerate(aiService, async options => {
      calls++;
      const prompt = (options.injects || []).map(i => i.content).join('\n') + String(options.user_input || '');
      if (!prompt.includes('场景材料：')) return '你停下来察看眼前的情况。';
      sceneCalls++;
      assert.match(prompt, /玩家主角姓名：程宗扬/);
      assert.doesNotMatch(prompt, /苏黎/);
      const scene = JSON.parse(prompt.split('场景材料：')[1].split('\n历史摘录')[0]);
      assert.equal(scene.location, location);
      assert.equal(scene.mustAppear.location, location);
      if (secondStep) assert.ok(!scene.publicFacts.some(fact => /蛇彝村/.test(fact)), '下一站不能成为本拍现场事实');
      if (id === 'lcq.event.s04_04') assert.ok(!scene.publicFacts.some(fact => /山涧/.test(fact)), '穿山终点不能成为叶媪村现场');
      return `你和${scene.present.join('、')}一同${action.label}。你停下来察看眼前的情况。`;
    });
    try {
      useGameStateStore().loadFromSaveData(structuredClone(opened));
      const response = await AIBidirectionalSystem.processPlayerAction(action.playerLine, TEST_PROFILE, { eventAction: action, eventActionProvenance: 'selected', playerIntentText: action.playerLine, shouldAbort: () => false });
      assert.equal(response.generationError, undefined);
      assert.equal(response.moduleReceipt.path, 'modular');
      assert.ok(sceneCalls > 0, '必须核验实际演出材料');
      assert.ok(calls > 0, `${id} must request the narrative model`);
    } finally { restore(); }
  }
});


test('凝羽合同中的西门庆旧事保留完整对白，未授权当前登场仍被拦', async () => {
  setActivePinia(createPinia());
  const { useGameStateStore } = await loadPipeline('../src/stores/gameStateStore.ts');
  const { AIBidirectionalSystem } = await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
  const { createMinimalSaveDataV3 } = await loadPipeline('../src/utils/dataRepair.ts');
  const { buildStrictScenarioInitialization, applyStrictScenarioInitializationToSave } = await loadPipeline('../src/modules/scenarioMods/strictInitializer.ts');
  const { getCurrentStoryEventActions, advanceScenarioRuntime, recordStoryEventStructuredAction } = await loadPipeline('../src/modules/scenarioMods/runtime.ts');
  const { stripNarrativeUnintroducedCharacters } = await loadPipeline('../src/modules/scenarioMods/characterResolver.ts');
  const mod = JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_02.json', import.meta.url), 'utf8'));
  const save = advanceScenarioRuntime(applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), buildStrictScenarioInitialization(mod))).saveData;
  const runtime = save.世界.状态.剧本模组;
  runtime.activeEventIds = ['lcq.event.ningyu_regicide_offer'];
  const first = getCurrentStoryEventActions(save).find(a => a.eventId === 'lcq.event.ningyu_regicide_offer');
  runtime.worldTurn++;
  recordStoryEventStructuredAction(save, first);
  const action = getCurrentStoryEventActions(save).find(a => a.eventId === first.eventId);
  assert.equal(action.stepIndex, 2);
  const text = '你收回真元，抬头看她。\n\n她开口，声音低得像从牙缝里挤出来的：\n\n"西门庆……当年把我从羽族旧部带出来，说是要教我剑道。"她顿了顿，"头几年确实是正经传授。"\n\n你听清她的旧事，仍未答应弑主。';
  const response = { text, mid_term_memory: '', tavern_commands: [], action_options: [] };
  useGameStateStore().loadFromSaveData(structuredClone(save));
  const processed = await AIBidirectionalSystem.processGmResponse(response, save, false, () => false, {
    eventAction: action, eventActionProvenance: 'selected', playerIntentText: action.playerLine, narrativeAuthority: 'local_contract',
  });
  assert.ok(processed.saveData.系统.历史.叙事.some(entry => String(entry.content || entry.内容 || entry.text || entry).includes('西门庆……当年')));
  assert.match(response.text, /西门庆……当年把我从羽族旧部带出来/);
  const historicalContext = mod.scenario.events.find(e => e.id === action.eventId).playerCompletionContract.actions[1].actionText;
  assert.ok(stripNarrativeUnintroducedCharacters('西门庆走进屋里，朝你开口。', [], historicalContext).conflicts.length > 0);
});


test('reported completed beats authorize their actual outcomes without demanding every present actor be named', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await loadPipeline('../src/stores/gameStateStore.ts');
  const { aiService } = await loadPipeline('../src/services/aiService.ts');
  const { createMinimalSaveDataV3 } = await loadPipeline('../src/utils/dataRepair.ts');
  const { buildStrictScenarioInitialization, applyStrictScenarioInitializationToSave } = await loadPipeline('../src/modules/scenarioMods/strictInitializer.ts');
  const { getCurrentStoryEventActions, advanceScenarioRuntime } = await loadPipeline('../src/modules/scenarioMods/runtime.ts');
  for (const [stageId, id, prose] of [
    ['03b_snake_flower_bridge', 's03b_snake_flower_bridge_02', '你搜查蛇彝长屋，发现鬼王峒笑脸的惨案痕迹和尸体，随后同云苍峰焚屋撤离。'],
    ['03b_snake_flower_bridge', 's03b_snake_flower_bridge_07', '你听苏荔说清送亲与贡物的安排：戴面纱的新娘、阿葭和阿夕要献给龙神和巫王，送亲队要到熊耳铺见使者。'],
    ['04', 's04_02', '你协助武二郎击退鬼王峒武士，凝羽身上的血是敌人的，苏荔与武二郎联手击杀九名武士，余敌看见死亡便退入浓雾。'],
  ]) {
    const mod = JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/lcq.stage_${stageId}.json`, import.meta.url), 'utf8'));
    let save = applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), buildStrictScenarioInitialization(mod));
    save.系统.扩展.清羽记开局 = { kind: 'qingyu-demo-v1' };
    const runtime = save.世界.状态.剧本模组;
    for (const e of runtime.events) if (e.id !== `lcq.event.${id}`) {
      runtime.completedEventIds.push(e.id);
      for (const c of e.completion || []) if (c.path.startsWith('flags.')) runtime.flags[c.path.slice(6)] = c.value;
    }
    save = advanceScenarioRuntime(save).saveData;
    const target = mod.scenario.events.find(e => e.id === `lcq.event.${id}`);
    const place = mod.canon.locations.find(l => l.id === target.locationId);
    if (place) save.角色.位置.描述 = `南荒·${place.name}`;
    const action = getCurrentStoryEventActions(save)[0];
    assert.equal(action.eventId, `lcq.event.${id}`);
    assert.equal(action.source, 'event_engine');
    let calls = 0;
    const restore = await withStubbedGenerate(aiService, async options => {
      calls++;
      const prompt = (options.injects || []).map(i => i.content).join('\n');
      const scene = JSON.parse(prompt.split('场景材料：')[1].split('\n历史摘录')[0]);
      assert.deepEqual(scene.mustAppear.present, []);
      assert.ok(scene.settledOutcome.includes(id === 's04_02' ? '凝羽身上沾的是别人的血' : id.endsWith('02') ? '惨案' : '贡物'), scene.settledOutcome);
      return prose;
    });
    try {
      const store = useGameStateStore(); store.loadFromSaveData(structuredClone(save));
      const result = await AIBidirectionalSystem.processPlayerAction(action.playerLine, TEST_PROFILE, { eventAction: structuredClone(action), eventActionProvenance: 'selected', playerIntentText: action.playerLine, shouldAbort: () => false });
      assert.equal(calls, 1, id);
      assert.equal(result.moduleReceipt?.path, 'modular', id);
      assert.equal(result.generationError, undefined);
      assert.equal(result.transactionCommitted, true);
    } finally { restore(); }
  }
});

test('seeded loot preview narrates only local rolls and commits once; transport failure never consumes attempts', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await loadPipeline('../src/stores/gameStateStore.ts');
  const { aiService } = await loadPipeline('../src/services/aiService.ts');
  const { QINGYU_LOOT_TABLE } = await loadPipeline('../src/modules/scenarioMods/locationLoot.ts');
  const { currentLocation } = await loadPipeline('../src/modules/scenarioMods/travel/travelLedger.ts');
  const { save } = await openingSave();
  const runtime = save.世界.状态.剧本模组;
  const id = currentLocation(save, runtime.canon.locations).locationId;
  const item = runtime.canon.items.find(item => !save.角色.背包?.物品?.[item.id]); assert.ok(item, 'fixture needs a registered item');
  const old = structuredClone(QINGYU_LOOT_TABLE.locations[id]);
  QINGYU_LOOT_TABLE.locations[id] = { name: '试玩搜刮点', status: 'ready', entries: [{id:'key',itemId:item.id,category:'key',quantity:[1,1]}] };
  let calls = 0;
  let restore = await withStubbedGenerate(aiService, async options => {
    calls++;
    const prompt = (options.injects || []).map(i => i.content).join('\n');
    assert.match(prompt,/搜刮回执/);assert.ok(prompt.includes(item.name));
    return `你仔细搜刮眼前的地方，找到${item.name}，收进背包。`;
  });
  try {
    const store = useGameStateStore();store.loadFromSaveData(structuredClone(save));
    const response = await AIBidirectionalSystem.processPlayerAction('我搜刮这里',TEST_PROFILE,{playerIntentText:'我搜刮这里',shouldAbort:()=>false});
    assert.equal(response.generationError,undefined);assert.equal(response.transactionCommitted,true);assert.equal(calls,1);
    const settled=store.toSaveData();assert.ok(settled.世界.状态.剧本模组.worldTurn > runtime.worldTurn, 'successful loot must advance the runtime turn so another search is possible');assert.equal(settled.角色.背包.物品[item.id].数量,1);assert.equal(settled.世界.状态.剧本模组.locationLoot.searches[id],1);
    restore();calls=0;restore=await withStubbedGenerate(aiService,async()=>{calls++;throw new Error('loot network down');});
    store.loadFromSaveData(structuredClone(save));
    const failed=await AIBidirectionalSystem.processPlayerAction('我搜刮这里',TEST_PROFILE,{playerIntentText:'我搜刮这里',shouldAbort:()=>false});
    assert.equal(calls,2);assert.ok(failed.generationError);assert.notEqual(failed.transactionCommitted,true);assert.equal(store.toSaveData().世界.状态.剧本模组.locationLoot,undefined);
  } finally {restore();if(old)QINGYU_LOOT_TABLE.locations[id]=old;else delete QINGYU_LOOT_TABLE.locations[id];}
});

test('accepted audit voice/state findings correct only the active slot next prompt, without writing world facts', async()=>{
  setActivePinia(createPinia());
  const {AIBidirectionalSystem}=await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
  const {useGameStateStore}=await loadPipeline('../src/stores/gameStateStore.ts');
  const {useCharacterStore}=await loadPipeline('./stubs/characterStoreForAbortTest.ts');
  const {aiService}=await loadPipeline('../src/services/aiService.ts');
  const {AUDIT_LOG_KEY}=await loadPipeline('../src/modules/scenarioMods/backgroundAuditCore.ts');
  const {save,action}=await openingSave();
  const old=localStorage.getItem(AUDIT_LOG_KEY);
  useCharacterStore().rootState.当前激活存档={角色ID:'audit-A',存档槽位:'one'};
  localStorage.setItem(AUDIT_LOG_KEY,JSON.stringify([
    {status:'accepted',slotKey:'audit-B:one',modId:save.世界.状态.剧本模组.modId,findings:[{category:'voice_drift',issue:'wrong slot correction'}]},
    {status:'accepted',slotKey:'audit-A:one',modId:save.世界.状态.剧本模组.modId,findings:[{category:'voice_drift',issue:'active voice correction'},{category:'state_mismatch',issue:'active state correction'}]},
  ]));
  const restore=await withStubbedGenerate(aiService,async options=>{
    const prompt=(options.injects||[]).map(i=>i.content).join('\n');
    assert.match(prompt,/active voice correction/);assert.match(prompt,/active state correction/);assert.doesNotMatch(prompt,/wrong slot correction/);
    return '你稳住呼吸，看清草原上眼前的处境。';
  });
  try {
    const store=useGameStateStore();store.loadFromSaveData(structuredClone(save));
    const result=await AIBidirectionalSystem.processPlayerAction(action.playerLine,TEST_PROFILE,{eventAction:structuredClone(action),eventActionProvenance:'selected',playerIntentText:action.playerLine,shouldAbort:()=>false});
    assert.equal(result.generationError,undefined);assert.equal(result.transactionCommitted,true);
    assert.doesNotMatch(JSON.stringify(store.toSaveData().世界),/active voice correction|active state correction/);
  } finally {restore();useCharacterStore().rootState.当前激活存档=null;if(old)localStorage.setItem(AUDIT_LOG_KEY,old);else localStorage.removeItem(AUDIT_LOG_KEY);}
});

test('r12 toSaveData migrates isolated relationships and matrix without invalidating Vue read effects', async () => {
  setActivePinia(createPinia());
  const { useGameStateStore } = await loadPipeline('../src/stores/gameStateStore.ts');
  const { computed, watch, watchEffect, nextTick } = await import('vue');
  const { save } = await openingSave();
  const store = useGameStateStore();
  store.loadFromSaveData(structuredClone(save));
  store.relationships = { 朱八八: { 名字: '朱八八', 好感度: 12 } };
  store.relationshipMatrix = { nodes: ['玩家', '朱八八'], edges: [{ from: '玩家', to: '朱八八', strength: 12 }] };
  const before = JSON.stringify({ relations: store.relationships, matrix: store.relationshipMatrix });
  let writes = 0;
  const stopWatch = watch(() => [store.relationships, store.relationshipMatrix], () => { writes++; }, { deep: true, flush: 'sync' });
  const snapshot = computed(() => store.toSaveData());
  let renderRuns = 0;
  const stopRender = watchEffect(() => { renderRuns++; void snapshot.value?.社交.关系矩阵; });
  try {
    for (let i = 0; i < 10; i++) {
      const exported = store.toSaveData();
      assert.notEqual(exported.社交.关系, store.relationships);
      assert.notEqual(exported.社交.关系矩阵, store.relationshipMatrix);
      assert.equal(exported.社交.关系['liuchao.character.shang_zhen_yu'].好感度, 12);
      assert.ok(exported.社交.关系矩阵.nodes.includes('liuchao.character.shang_zhen_yu'));
      exported.社交.关系['liuchao.character.shang_zhen_yu'].好感度 = 99;
      exported.社交.关系矩阵.edges[0].strength = 99;
    }
    await nextTick();
    assert.equal(writes, 0);
    assert.equal(renderRuns, 1);
    assert.equal(JSON.stringify({ relations: store.relationships, matrix: store.relationshipMatrix }), before);
  } finally { stopRender(); stopWatch(); }
});

test('r12 phase-two fresh opening first action reaches narrative and commits without browser patch', async () => {
  setActivePinia(createPinia());
  const { useGameStateStore } = await loadPipeline('../src/stores/gameStateStore.ts');
  const { AIBidirectionalSystem } = await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
  const { aiService } = await loadPipeline('../src/services/aiService.ts');
  const { createQingyuOpeningPlaytestSave } = await loadPipeline('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { getCurrentStoryEventActions } = await loadPipeline('../src/modules/scenarioMods/runtime.ts');
  const mod = JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url), 'utf8'));
  const save = createQingyuOpeningPlaytestSave(mod, '2026-10-05T00:00:00Z', 2);
  let calls = 0;
  const restore = await withStubbedGenerate(aiService, async () => {
    calls++;
    return JSON.stringify({ text: '你听见客舱骤然响起嘈杂声，扶住座椅，转头确认身旁的动静。段强就在旁边，你稳住脚步，先看清眼前的变化。', mid_term_memory: '', tavern_commands: [], action_options: [] });
  });
  try {
    const store = useGameStateStore();
    store.loadFromSaveData(save);
    const action = getCurrentStoryEventActions(store.toSaveData())[0];
    assert.equal(action.eventId, 'lcq.event.s01_01');
    const response = await AIBidirectionalSystem.processPlayerAction(action.playerLine, TEST_PROFILE, {
      eventAction: action, eventActionProvenance: 'selected', playerIntentText: action.playerLine, shouldAbort: () => false,
    });
    assert.ok(calls > 0, 'first action must reach the model boundary');
    assert.equal(response.generationError, undefined);
    assert.equal(response.transactionCommitted, true);
    assert.ok(store.toSaveData().世界.状态.剧本模组.worldTurn > save.世界.状态.剧本模组.worldTurn);
  } finally { restore(); }
});
