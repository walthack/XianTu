import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
const jiti = createJiti(import.meta.url, { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } });
const memory = new Map();
const storage = { getItem: k => memory.has(k) ? memory.get(k) : null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) };
globalThis.localStorage = storage;
globalThis.window ||= globalThis;
globalThis.window.location ||= { hostname: 'localhost', href: 'http://localhost/' };
const { createPinia, setActivePinia } = await import('pinia');
const audit = await jiti.import('../src/modules/scenarioMods/backgroundAuditCore.ts');
const conn = (id, model, enabled = true) => ({ id, name: id, provider: 'openai', url: 'https://example.invalid/v1', apiKey: `key-${id}`, model, temperature: .5, maxTokens: 8000, enabled });

async function freshStore() {
  setActivePinia(createPinia());
  const mod = await jiti.import('../src/stores/apiManagementStore.ts');
  const store = mod.useAPIManagementStore();
  store.apiConfigs.splice(0, store.apiConfigs.length, conn('default', 'default-model'), conn('mainApi', 'main-model'), conn('auditApi', 'audit-model'));
  store.assignAPI('main', 'mainApi');
  return { store, MODULE_INHERIT: mod.MODULE_INHERIT };
}

test('unassigned modules inherit their declared function; assignment is independent of function assignment', async () => {
  const { store, MODULE_INHERIT } = await freshStore();
  assert.equal(store.getModuleAssignment('audit'), MODULE_INHERIT);
  let route = store.getAPIForModule('audit', 'main');
  assert.equal(route.inherited, true); assert.equal(route.config.model, 'main-model');
  store.assignModuleAPI('audit', 'auditApi');
  route = store.getAPIForModule('audit', 'main');
  assert.equal(route.inherited, false); assert.equal(route.config.apiKey, 'key-auditApi');
  assert.equal(store.getAPIForType('main').model, 'main-model', 'module assignment must not move the main function');
  store.assignModuleAPI('audit', MODULE_INHERIT);
  assert.equal(store.getModuleAssignment('audit'), MODULE_INHERIT);
});

test('a disabled or deleted module connection falls back to inheritance, never to the default connection', async () => {
  const { store, MODULE_INHERIT } = await freshStore();
  store.assignModuleAPI('narrative', 'auditApi');
  store.toggleAPI('auditApi');
  assert.equal(store.getAPIForModule('narrative', 'main').config.model, 'main-model');
  store.toggleAPI('auditApi');
  store.deleteAPI('auditApi');
  assert.equal(store.getModuleAssignment('narrative'), MODULE_INHERIT);
});

test('module assignments and the audit switch persist; audit is off by default outside dev builds', async () => {
  memory.clear();
  const first = await freshStore();
  assert.equal(first.store.isModuleEnabled('audit'), false, 'tests run without the dev-build flag');
  first.store.setModuleEnabled('audit', true);
  first.store.assignModuleAPI('intent', 'mainApi');
  const saved = JSON.parse(memory.get('api_management_config'));
  assert.deepEqual(saved.moduleAssignments, [{ moduleId: 'intent', apiId: 'mainApi' }]);
  assert.equal(saved.moduleEnabled.audit, true);
  setActivePinia(createPinia());
  const { useAPIManagementStore } = await jiti.import('../src/stores/apiManagementStore.ts');
  const second = useAPIManagementStore();
  await second.loadFromStorage();
  assert.equal(second.isModuleEnabled('audit'), true);
  assert.equal(second.getModuleAssignment('intent'), 'mainApi');
});

test('audit checkpoints: every N new turns, or a stage change with at least one new turn', () => {
  assert.equal(audit.isAuditCheckpoint({ auditedTurns: 10, modId: 'a' }, 14, 'a'), false);
  assert.equal(audit.isAuditCheckpoint({ auditedTurns: 10, modId: 'a' }, 15, 'a'), true);
  assert.equal(audit.isAuditCheckpoint({ auditedTurns: 10, modId: 'a' }, 11, 'b'), true);
  assert.equal(audit.isAuditCheckpoint({ auditedTurns: 10, modId: 'a' }, 10, 'b'), false);
});

test('audit budget caps calls per hour and input size per run', () => {
  const now = 10_000_000;
  assert.equal(audit.withinHourlyBudget(Array(12).fill(now - 1000), now), false);
  assert.equal(audit.withinHourlyBudget(Array(12).fill(now - 3_700_000), now), true);
  const turns = audit.selectAuditTurns(Array.from({ length: 20 }, (_, i) => `第${i + 1}回合` + '字'.repeat(3000)), 5);
  assert.equal(turns.length, 8);
  assert.equal(turns[0].turn, 13);
  assert.ok(turns.every(t => t.text.length <= audit.AUDIT_MAX_ENTRY_CHARS));
  assert.ok(turns.reduce((n, t) => n + t.text.length, 0) <= audit.AUDIT_MAX_INPUT_CHARS);
});

test('audit findings must quote the cited turn verbatim and use a known category', () => {
  const turns = [{ turn: 6, text: '“三个月。”她没有答应。你收起铁匣。' }, { turn: 7, text: '你把铁匣交给凝羽。' }];
  const raw = JSON.stringify({ findings: [
    { category: 'state_mismatch', turn: 7, quote: '你把铁匣交给凝羽', issue: '背包仍有铁匣' },
    { category: 'fact_drift', turn: 6, quote: '三个月。她没有答应', issue: '标点容错仍取原文' },
    { category: 'made_up', turn: 7, quote: '你把铁匣交给凝羽', issue: '未知类别' },
    { category: 'fact_drift', turn: 7, quote: '她已经答应了', issue: '编造引文' },
    { category: 'fact_drift', turn: 9, quote: '你把铁匣交给凝羽', issue: '回合不在范围' },
  ] });
  const { findings, rejected } = audit.validateAuditFindings(raw, turns);
  assert.equal(findings.length, 2); assert.equal(rejected, 3);
  assert.equal(findings[1].quote, '三个月。”她没有答应');
  assert.throws(() => audit.validateAuditFindings('{"notes":[]}', turns), /findings/);
});

test('audit log is local, capped, and never contains credentials', () => {
  memory.clear();
  for (let i = 0; i < 205; i++) audit.appendAuditLog(storage, { id: `a${i}`, at: '', slotKey: 'c:s', turns: [1, 2], status: 'accepted', route: { configId: 'x', provider: 'openai', model: 'm' }, findings: [], rejectedFindings: 0, elapsedMs: 1 });
  const log = audit.readAuditLog(storage);
  assert.equal(log.length, audit.AUDIT_LOG_LIMIT); assert.equal(log.at(-1).id, 'a204');
  assert.equal(JSON.stringify(log).includes('key-'), false);
});
