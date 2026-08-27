import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';

import { createPinia, setActivePinia } from 'pinia';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: {
    '@': fileURLToPath(new URL('../src', import.meta.url)),
    '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
  },
});

async function loadTs(relativePath) {
  return jiti.import(new URL(relativePath, import.meta.url).pathname);
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

const ON = { getItem: key => (key === 'xiantu.legacyNarrativePilot.s01_01.v1' ? 'true' : null) };
const OFF = { getItem: () => null };

async function openingFixture() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const raw = await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url), 'utf8');
  const save = createQingyuOpeningPlaytestSave(parseScenarioMod(JSON.parse(raw)));
  const selection = getCurrentStoryEventActions(save).find(item => item.eventId === 'lcq.event.s01_01');
  assert.ok(selection, 'opening structured action must exist');
  return { save, selection };
}

test('pilot accepts only an exact selected s01_01 action and fails closed otherwise', async () => {
  const pilot = await loadTs('../src/modules/scenarioMods/legacyNarrativePilot.ts');
  const { save, selection } = await openingFixture();

  assert.equal(pilot.isLegacyNarrativePilotEnabled(OFF), false);
  assert.equal(pilot.isLegacyNarrativePilotEnabled(ON), true);
  assert.equal(pilot.planLegacyNarrativePilot({ saveData: save, eventAction: selection, eventActionProvenance: 'selected', storage: OFF }), null);
  assert.equal(pilot.planLegacyNarrativePilot({ saveData: save, eventAction: selection, eventActionProvenance: 'resolved_text', storage: ON }), null);

  const plan = pilot.planLegacyNarrativePilot({
    saveData: save,
    eventAction: structuredClone(selection),
    eventActionProvenance: 'selected',
    storage: ON,
  });
  assert.ok(plan);
  assert.equal(plan.selection.eventId, 'lcq.event.s01_01');
  assert.equal(plan.playerLine, selection.playerLine);
  assert.equal(pilot.LEGACY_NARRATIVE_PILOT_GENERATE_OPTIONS.maxTokens, 2048);
  assert.equal(pilot.LEGACY_NARRATIVE_PILOT_GENERATE_OPTIONS.responseMode, 'text');
  assert.equal('requestMaxRetries' in pilot.LEGACY_NARRATIVE_PILOT_GENERATE_OPTIONS, false, 'global retry setting must remain active');

  const compact = JSON.stringify(plan.compactState);
  assert.doesNotMatch(compact, /背包|功法|技能|世界|关系|任务|事件/);

  const tampered = structuredClone(selection);
  tampered.outcomeText = '伪造结果';
  assert.equal(pilot.planLegacyNarrativePilot({ saveData: save, eventAction: tampered, eventActionProvenance: 'selected', storage: ON }), null);
});

test('local-contract response settles the real event once but rejects every model state channel', async () => {
  setActivePinia(createPinia());
  globalThis.localStorage.setItem('narrative-state-reconcile', 'on');
  const { save, selection } = await openingFixture();
  save.角色.属性.气血 = { 当前: 80, 上限: 100 };
  const beforeItemIds = Object.keys(save.角色.背包?.物品 || {}).sort();
  const { AIBidirectionalSystem } = await loadTs('../src/utils/AIBidirectionalSystem.ts');
  const result = await AIBidirectionalSystem.processGmResponse(
    {
      text: '〔战斗:失败,判定值:1,难度:40〕你被割伤，同时捡起一柄神兵。',
      mid_term_memory: '',
      tavern_commands: [
        { action: 'set', key: '角色.属性.气血.当前', value: 1 },
        { action: 'set', key: '角色.位置.描述', value: '伪造地点' },
      ],
      action_options: [],
    },
    save,
    false,
    () => false,
    {
      userAction: selection.playerLine,
      eventAction: selection,
      narrativeAuthority: 'local_contract',
    },
  );

  assert.equal(result.saveData.角色.属性.气血.当前, 80);
  assert.notEqual(result.saveData.角色.位置.描述, '伪造地点');
  assert.deepEqual(Object.keys(result.saveData.角色.背包?.物品 || {}).sort(), beforeItemIds);
  assert.equal(
    Object.values(result.saveData.角色.背包?.物品 || {}).some(item => item?.名称 === '神兵'),
    false,
  );
  assert.equal(result.saveData.世界.状态.剧本模组.flags['event.s01_01.done'], true);
  assert.equal(result.saveData.世界.状态.剧本模组.completedEventIds.includes('lcq.event.s01_01'), true);
});

test('production wiring preserves Legacy settings and bypasses RAG only inside the pilot', async () => {
  const source = await readFile(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url), 'utf8');
  const pilotStart = source.indexOf('private async tryLegacyNarrativePilot');
  const pilotEnd = source.indexOf('public async processPlayerAction', pilotStart);
  const pilotMethod = source.slice(pilotStart, pilotEnd);
  assert.ok(pilotStart > 0 && pilotEnd > pilotStart);
  assert.match(pilotMethod, /assembleNarrativeOnlySystemPrompt/);
  assert.match(pilotMethod, /LEGACY_NARRATIVE_PILOT_GENERATE_OPTIONS/);
  assert.match(pilotMethod, /aiService\.generate\(/);
  assert.equal((pilotMethod.match(/aiService\.generate\(/g) || []).length, 1);
  assert.equal(pilotMethod.includes('vectorMemoryService'), false);
  assert.equal(pilotMethod.includes('narrativeRagService'), false);
  assert.equal(pilotMethod.includes('characterRagService'), false);
  assert.equal(pilotMethod.includes('requestMaxRetries'), false);
  assert.match(source, /narrativeAuthority: usedLegacyNarrativePilot \? 'local_contract' : 'model'/);

  const panel = await readFile(new URL('../src/components/dashboard/MainGamePanel.vue', import.meta.url), 'utf8');
  assert.match(panel, /options\.eventActionProvenance = exactSelectedEventAction \? 'selected' : 'resolved_text'/);
  const settings = await readFile(new URL('../src/components/dashboard/SettingsPanel.vue', import.meta.url), 'utf8');
  assert.match(settings, /LEGACY_NARRATIVE_PILOT_STORAGE_KEY/);
  assert.match(settings, /Legacy 第一幕提速试验/);
});
