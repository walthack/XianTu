import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: {
  '@': fileURLToPath(new URL('../src', import.meta.url)),
  '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
} });
const load = path => jiti.import(fileURLToPath(new URL(`../src/${path}`, import.meta.url)));
const values = new Map();
globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,String(v)), removeItem: k => values.delete(k) };
globalThis.window ??= globalThis;
globalThis.window.location ??= { hostname: 'localhost', href: 'http://localhost/' };
const plan = { pacing: 'slow_orient', sensory: 'grass_iron', companion: 'dazed', closing: 'hold_ground' };
const sanitize = options => Array.isArray(options) ? options.filter(v => typeof v === 'string').map(v => v.trim()).filter(Boolean) : [];
async function fixture() {
  const { parseScenarioMod } = await load('modules/scenarioMods/validator.ts');
  const { createQingyuOpeningPlaytestSave } = await load('modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { getCurrentStoryEventActions } = await load('modules/scenarioMods/runtime.ts');
  const raw = JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url), 'utf8'));
  const save = createQingyuOpeningPlaytestSave(parseScenarioMod(raw));
  const selection = getCurrentStoryEventActions(save).find(a => a.eventId === 'lcq.event.s01_01');
  const { planLegacyNarrativePilot } = await load('modules/scenarioMods/legacyNarrativePilot.ts');
  const pilot = planLegacyNarrativePilot({ saveData: save, eventAction: selection, eventActionProvenance: 'selected', storage: { getItem: () => 'true' } });
  const { buildLegacyNarratorPrompt } = await load('modules/scenarioMods/legacyNarratorPacket.ts');
  return { save, selection, pilot, compiled: await buildLegacyNarratorPrompt(save, pilot) };
}

test('pilot options: real same-call parser, body isolation, no extra generation', async () => {
  setActivePinia(createPinia());
  const { compiled } = await fixture();
  const { AIBidirectionalSystem: ai } = await load('utils/AIBidirectionalSystem.ts');
  const { generateLegacyPilotNarrative } = await load('modules/scenarioMods/legacyNarrativePilotGenerate.ts');
  const { composeLegacyNarrativeFromPlan } = await load('modules/scenarioMods/legacyRenderPlan.ts');
  let calls = 0;
  const result = await generateLegacyPilotNarrative({ packet: compiled.packet, playerLine: '', storyPrompt: compiled.storyPrompt,
    maxRetries: 0, useStreaming: false, generationId: 'offline',
    parseOptions: options => ai.parseAIResponse(JSON.stringify({ action_options: options })).action_options,
    generate: async () => { calls++; return JSON.stringify({ ...plan, action_options: ['检查随身物品', '观察脚下的地面'] }); },
  });
  assert.equal(calls, 1);
  assert.equal(result.usedFallback, false);
  assert.deepEqual(result.actionOptions, ['检查随身物品', '观察脚下的地面']);
  assert.equal(result.text, composeLegacyNarrativeFromPlan(compiled.packet, plan));
  assert.doesNotMatch(result.text, /action_options|检查随身物品|观察脚下的地面/);
});

test('pilot options: missing, malformed, parser failure and failed 422 fallback keep local body and local options', async () => {
  const { compiled, save, pilot } = await fixture();
  const { generateLegacyPilotNarrative } = await load('modules/scenarioMods/legacyNarrativePilotGenerate.ts');
  const { pilotOptionContext, selectPilotOptions } = await load('modules/scenarioMods/legacyPilotActionOptions.ts');
  const ctx = pilotOptionContext(save, pilot, compiled.packet);
  for (const kind of ['missing', 'malformed', 'parse_failed', '422']) {
    let calls = 0;
    const result = await generateLegacyPilotNarrative({ packet: compiled.packet, playerLine: '', storyPrompt: compiled.storyPrompt,
      maxRetries: 0, useStreaming: false, generationId: 'offline',
      parseOptions: options => { if (kind === 'parse_failed') throw Error('offline parser failure'); return sanitize(options); },
      generate: async () => { calls++; if (kind === '422') throw Error('422 fallback failed'); return kind === 'malformed' ? '{"action_options": [' : JSON.stringify({ ...plan, ...(kind === 'parse_failed' ? { action_options: ['甲', '乙'] } : {}) }); },
    });
    assert.equal(calls, 1);
    assert.ok(result.text.length > 0);
    assert.deepEqual(result.actionOptions, []);
    const chosen = selectPilotOptions(result.actionOptions, ctx.local, ctx.engine, sanitize);
    assert.equal(chosen.source, 'local_fallback');
    assert.ok(chosen.options.length >= 2 && chosen.options.length <= 4);
    assert.ok(chosen.options.every(option => !ctx.engine.includes(option)));
  }
});

test('pilot options: engine alias/punctuation dedupe, limits and model shortage supplementation', async () => {
  const { selectPilotOptions } = await load('modules/scenarioMods/legacyPilotActionOptions.ts');
  const local = ['去市集', '检查随身物品', '留意身体状况', '观察脚下地面', '整理已知线索'];
  const result = selectPilotOptions(['你去市集。', ' 检查随身物品 ', '检查随身物品'], local, ['去市集'], sanitize);
  assert.equal(result.source, 'local_fallback');
  assert.equal(result.options.length, 4);
  assert.equal(new Set(result.options).size, 4);
  assert.ok(!result.options.includes('你去市集。'));
  assert.equal(selectPilotOptions(['一', '二', '三', '四', '五'], local, [], sanitize).options.length, 4);
});

test('pilot options: same-call prompt uses managed actionOptions and configured range', async () => {
  const { pilotOptionsPrompt } = await load('modules/scenarioMods/legacyPilotActionOptions.ts');
  const prompt = await pilotOptionsPrompt('只写简短行动');
  assert.match(prompt, /action_options/);
  assert.match(prompt, /2–4/);
  assert.match(prompt, /只写简短行动/);
});

test('pilot options: config registry rejects reversed, fractional and out-of-range counts', async () => {
  const { applyGameNumbers, GAME_NUMBERS } = await load('modules/sceneModule/numbers.ts');
  await load('modules/scenarioMods/legacyPilotActionOptions.ts');
  for (const patch of [{ min: 4, max: 2 }, { min: 2.5 }, { max: 5 }, { min: 1 }]) {
    assert.throws(() => applyGameNumbers({ ui: { legacyPilotActionOptions: patch } }));
    assert.deepEqual(GAME_NUMBERS.ui.legacyPilotActionOptions, { min: 2, max: 4 });
  }
});

test('pilot options: context previews settlement without mutating the source save', async () => {
  const { save, pilot, compiled } = await fixture();
  const before = JSON.stringify(save);
  const { pilotOptionContext } = await load('modules/scenarioMods/legacyPilotActionOptions.ts');
  const ctx = pilotOptionContext(save, pilot, compiled.packet);
  assert.equal(JSON.stringify(save), before);
  assert.ok(ctx.local.length >= 2);
  assert.ok(!ctx.engine.includes(pilot.selection.actionText));
});

test('pilot options: diagnostic observes published count and existing clears', async () => {
  const { pilotOptionsDiagnostic, tagPilotOptions } = await load('modules/scenarioMods/legacyPilotActionOptions.ts');
  const response = tagPilotOptions({}, 'local_fallback');
  const save = { 系统: { 历史: { 叙事: [{ actionOptions: ['甲', '乙'] }] } }, 世界: { 状态: { 剧本模组: {} } } };
  assert.deepEqual(pilotOptionsDiagnostic(save, response), { actionOptionsCount: 2, optionsSource: 'local_fallback', legacyPilot: true });
  save.系统.历史.叙事[0].actionOptions = [];
  save.世界.状态.剧本模组.gameOver = {};
  assert.equal(pilotOptionsDiagnostic(save, response).optionsSource, 'cleared_ending');
  delete save.世界.状态.剧本模组.gameOver;
  assert.equal(pilotOptionsDiagnostic(save, tagPilotOptions({}, 'disabled')).optionsSource, 'disabled');
});

test('pilot options: incomplete scene contract returns local options without transport', async () => {
  setActivePinia(createPinia());
  localStorage.setItem('xiantu.legacyNarrativePilot.s01_01.v1', 'true');
  const { save, selection: original } = await fixture();
  const card = save.世界.状态.剧本模组.events.find(e => e.id === original.eventId)
    .playerCompletionContract.actions.find(a => a.id === original.actionId);
  card.cast = { present: [] };
  const { getCurrentStoryEventActions } = await load('modules/scenarioMods/runtime.ts');
  const selection = getCurrentStoryEventActions(save).find(a => a.eventId === original.eventId);
  const { AIBidirectionalSystem: ai } = await load('utils/AIBidirectionalSystem.ts');
  const { aiService } = await load('services/aiService.ts');
  const generate = aiService.generate;
  let calls = 0;
  aiService.generate = async () => { calls++; throw Error('must not call'); };
  try {
    const response = await ai.tryLegacyNarrativePilot(save, { eventAction: selection, eventActionProvenance: 'selected' }, 'offline-incomplete', () => false, selection.playerLine);
    assert.ok(response?.text);
    assert.ok(response.action_options.length >= 2 && response.action_options.length <= 4);
    assert.equal(calls, 0);
  } finally {
    aiService.generate = generate;
    localStorage.removeItem('xiantu.legacyNarrativePilot.s01_01.v1');
  }
});

test('pilot options: AIBS successful and failed calls return 2–4 options using mocked transport only', async () => {
  setActivePinia(createPinia());
  localStorage.setItem('xiantu.legacyNarrativePilot.s01_01.v1', 'true');
  const { save, selection } = await fixture();
  const { AIBidirectionalSystem: ai } = await load('utils/AIBidirectionalSystem.ts');
  const { aiService } = await load('services/aiService.ts');
  const originalGenerate = aiService.generate, originalConfig = aiService.getConfig;
  let calls = 0, prompt = '';
  aiService.getConfig = () => ({ maxRetries: 0 });
  try {
    for (const fail of [false, true]) {
      aiService.generate = async input => {
        calls++; prompt = input.injects[0].content;
        if (fail) throw Error('422 fallback failed (offline stub)');
        return JSON.stringify({ ...plan, action_options: ['检查随身物品', '观察脚下的地面'] });
      };
      const response = await ai.tryLegacyNarrativePilot(save, { eventAction: selection, eventActionProvenance: 'selected' }, 'offline', () => false, selection.playerLine);
      assert.ok(response);
      assert.ok(response.action_options.length >= 2 && response.action_options.length <= 4);
      assert.equal(response.tavern_commands.length, 0);
      assert.doesNotMatch(response.text, /action_options|检查随身物品/);
    }
    assert.equal(calls, 2);
    assert.match(prompt, /action_options/);
    assert.match(prompt, /2–4/);
  } finally {
    aiService.generate = originalGenerate; aiService.getConfig = originalConfig;
    localStorage.removeItem('xiantu.legacyNarrativePilot.s01_01.v1');
  }
});

test('pilot options: LCQ-NAR-001 includes local-only count and source without a model request', async () => {
  const { recordTurnNarrative } = await load('modules/diagnostics/narrativeSource.ts');
  const { logStore } = await load('modules/diagnostics/store.ts');
  const { resetLogState } = await load('modules/diagnostics/log.ts');
  await resetLogState();
  assert.equal(recordTurnNarrative({ text: '你留意眼前的动静。', startedAt: Date.now(), legacyPilot: true,
    actionOptionsCount: 2, optionsSource: 'local_fallback' }), true);
  const entry = logStore.recent(20).find(e => e.code === 'LCQ-NAR-001');
  assert.equal(entry.detail.actionOptionsCount, 2);
  assert.equal(entry.detail.optionsSource, 'local_fallback');
  assert.equal(entry.detail.path, 'legacy_pilot');
  await resetLogState();
});

test('pilot options: over-budget local exit never invokes transport', async () => {
  setActivePinia(createPinia());
  localStorage.setItem('xiantu.legacyNarrativePilot.s01_01.v1', 'true');
  const { save, selection } = await fixture();
  const { useUIStore } = await load('stores/uiStore.ts');
  const ui = useUIStore();
  const originalPrompt = ui.actionOptionsPrompt;
  ui.actionOptionsPrompt = '保持当前场景。'.repeat(3000);
  const { AIBidirectionalSystem: ai } = await load('utils/AIBidirectionalSystem.ts');
  const { aiService } = await load('services/aiService.ts');
  const originalGenerate = aiService.generate;
  let calls = 0;
  aiService.generate = async () => { calls++; throw Error('must not call'); };
  try {
    const response = await ai.tryLegacyNarrativePilot(save, { eventAction: selection, eventActionProvenance: 'selected' }, 'offline-budget', () => false, selection.playerLine);
    assert.ok(response?.text);
    assert.ok(response.action_options.length >= 2 && response.action_options.length <= 4);
    assert.equal(calls, 0);
  } finally {
    aiService.generate = originalGenerate;
    ui.actionOptionsPrompt = originalPrompt;
    localStorage.removeItem('xiantu.legacyNarrativePilot.s01_01.v1');
  }
});

test('legacy parseAIResponse preserves action_time through standardize', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem: ai } = await load('utils/AIBidirectionalSystem.ts');
  for (const action_time of [{ tier: '一瞬' }, { tier: '数日', days: 7 }]) {
    for (const forceJson of [false, true]) {
      const parsed = ai.parseAIResponse(JSON.stringify({ text: '离线解析夹具', action_time, tavern_commands: [] }), forceJson, false);
      assert.deepEqual(parsed.action_time, action_time);
      assert.equal(parsed.text, '离线解析夹具');
    }
  }
  assert.equal(ai.parseAIResponse('{"text":"旧响应"}', false, false).action_time, undefined);
});
