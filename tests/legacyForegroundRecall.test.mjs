import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
  };
}

function fakeVector({ enabled = true, total = 2, results = [{ content: '旧日承诺' }] } = {}) {
  const calls = { init: [], search: 0, sync: 0 };
  return {
    calls,
    service: {
      async init(slot) { calls.init.push(slot); },
      isEnabled: () => enabled,
      async syncFromLongTermMemories() { calls.sync += 1; },
      async getStats() { return { total }; },
      async searchMemories(query, context) {
        calls.search += 1;
        calls.query = query;
        calls.context = context;
        return results;
      },
      formatForAI(items) {
        return items.length ? `# 【长期记忆检索结果】\n${items.map(item => item.content).join('\n')}` : '';
      },
    },
  };
}

test('ordinary Legacy still runs real RAG and does not silently drop long-term memory when recall is off', async () => {
  const { resolveLegacyForegroundRecall } = await loadTs('../src/utils/legacyForegroundRecall.ts');
  const enabled = fakeVector({ enabled: true, total: 3, results: [{ content: '与段强同行的旧事' }] });
  const stateForAI = {
    角色: { 位置: { 描述: '中州·草原' } },
    社交: { 记忆: { 长期记忆: ['全量长期记忆不应整包发送'] } },
  };
  const v3 = { 社交: { 记忆: { 短期记忆: ['你刚从草里撑起来。'] } } };
  const recalled = await resolveLegacyForegroundRecall(
    { userMessage: '稳住自己', v3, stateForAI, saveSlot: 'hero_slot1' },
    {
      vectorMemoryService: enabled.service,
      narrativeRagService: {
        async init() {},
        isEnabled: () => true,
        async buildSectionForPrompt(query) { return `# 叙事RAG ${query.slice(0, 4)}`; },
        async getStats() { return { total: 4 }; },
      },
      characterRagService: {
        async init() {},
        isEnabled: () => true,
        async ensureIndexed() {},
        async buildSectionForPrompt() { return '# 角色RAG 段强'; },
        async getStats() { return { total: 8 }; },
      },
    },
  );
  assert.equal(enabled.calls.init[0], 'hero_slot1');
  assert.equal(enabled.calls.search, 1);
  assert.match(recalled.vectorMemorySection, /长期记忆检索结果/);
  assert.match(recalled.narrativeRagSection, /叙事RAG/);
  assert.match(recalled.characterRagSection, /角色RAG/);
  assert.deepEqual(stateForAI.社交.记忆.长期记忆, []);

  const disabledState = {
    角色: { 位置: { 描述: '中州·草原' } },
    社交: { 记忆: { 长期记忆: ['应保留的全量长期记忆'] } },
  };
  const disabled = fakeVector({ enabled: false });
  const skipped = await resolveLegacyForegroundRecall(
    { userMessage: '稳住自己', v3, stateForAI: disabledState, saveSlot: 'hero_slot1' },
    {
      vectorMemoryService: disabled.service,
      narrativeRagService: { async init() {}, isEnabled: () => false, async buildSectionForPrompt() { return 'should-not'; }, async getStats() { return { total: 0 }; } },
      characterRagService: { async init() {}, isEnabled: () => false, async ensureIndexed() {}, async buildSectionForPrompt() { return 'should-not'; }, async getStats() { return { total: 0 }; } },
    },
  );
  assert.equal(disabled.calls.search, 0);
  assert.deepEqual(disabledState.社交.记忆.长期记忆, ['应保留的全量长期记忆']);
  assert.equal(skipped.vectorMemorySection, '');
  assert.equal(skipped.narrativeRagSection, '');
  assert.equal(skipped.characterRagSection, '');
});
