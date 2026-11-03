// 双模型第2步（设计稿 2026-11-03-双模型分工 ⑧，用户 22:26 定稿）：consistency 模块卡＋配置存取，不接线后台调度。
// 钉住：模块卡合同、请求带玩家档位、档位存取往返、默认 max、正式版不拦只确认一次（N1-B）、开关任一关即关（N3-A）、默认关（N5-A）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
const memory = new Map();
globalThis.localStorage = { getItem: k => memory.has(k) ? memory.get(k) : null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) };
globalThis.window ||= globalThis;
globalThis.window.location ||= { hostname: 'localhost', href: 'http://localhost/' };
const { createPinia, setActivePinia } = await import('pinia');
const jiti = createJiti(import.meta.url, { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } });
const dual = await jiti.import('../src/services/dualModelConfig.ts');
const { GAME_MODEL_MODULES, createModuleModelRuntime, validateModuleDefinition } = await jiti.import('../src/services/moduleModelRuntime.ts');
const { isGameModuleEnabled, resolveGameModuleRoute, runGameModelModule } = await jiti.import('../src/services/gameModelModules.ts');
const { aiService } = await jiti.import('../src/services/aiService.ts');
const policy = await jiti.import('../src/services/aiReasoningModelPolicy.ts');

const MODULE_ID = dual.DUAL_MODEL_CONFIG.dualModel.backend.moduleId;
const card = GAME_MODEL_MODULES.find(m => m.id === MODULE_ID);
const conn = (id, model) => ({ id, name: id, provider: 'custom', url: 'https://api.minimaxi.com/v1', apiKey: `fixture-${id}`, model, temperature: .5, maxTokens: 64000, enabled: true });
const input = { system: 'contract', input: 'summaries', generationId: 'dual-settings' };
const withDualEnabled = async (value, fn) => {
  const cfg = dual.DUAL_MODEL_CONFIG.dualModel; const before = cfg.enabled;
  cfg.enabled = value;
  try { return await fn(); } finally { cfg.enabled = before; }
};
async function freshStore() {
  setActivePinia(createPinia());
  const { useAPIManagementStore } = await jiti.import('../src/stores/apiManagementStore.ts');
  const store = useAPIManagementStore();
  store.apiConfigs.splice(0, store.apiConfigs.length, conn('default', 'MiniMax-M3.1-Flash'), conn('paid', 'Some-Paid-Model'));
  store.assignAPI('main', 'default');
  return store;
}
async function reloadStore() {
  setActivePinia(createPinia());
  const { useAPIManagementStore } = await jiti.import('../src/stores/apiManagementStore.ts');
  const store = useAPIManagementStore();
  await store.loadFromStorage();
  return store;
}

test('模块卡：consistency 为 derive、非阻塞、迟到下回合落账、失败丢弃、继承 memory_summary、带后端档位而非 none', () => {
  assert.ok(card, '已注册');
  assert.equal(MODULE_ID, 'consistency');
  assert.equal(card.phase, 'derive');
  assert.equal(card.blocking, false);
  assert.equal(card.onLate, 'apply_next_turn');
  assert.equal(card.onFail, 'drop');
  assert.equal(card.inheritUsageType, 'memory_summary');
  assert.equal(card.policy.backendReasoning, true);
  assert.equal(card.policy.reasoningEffort, undefined, '不得用 none 关思考（M3.1-Flash 无效）');
  assert.equal(card.policy.maxTokens, dual.DUAL_MODEL_CONFIG.dualModel.backend.maxTokens);
  assert.equal(card.policy.timeoutMs, dual.DUAL_MODEL_CONFIG.dualModel.backend.timeoutMs);
  assert.deepEqual(validateModuleDefinition(card), []);
  assert.match(validateModuleDefinition({ ...card, policy: { ...card.policy, reasoningEffort: 'none' } }).join(), /恰好声明一个/);
  assert.match(validateModuleDefinition({ ...card, policy: { ...card.policy, backendReasoning: undefined } }).join(), /恰好声明一个/);
});

test('运行时：后端请求带调用方给的玩家档位，缺省为 default；其他模块不带', async () => {
  const calls = [];
  let effort = 'high';
  const runtime = createModuleModelRuntime({
    definitions: GAME_MODEL_MODULES, resolveRoute: () => ({ config: conn('b', 'MiniMax-M3.1-Flash'), inherited: false }),
    isEnabled: () => true, generate: async o => { calls.push(o); return 'ok'; }, backendReasoningEffort: () => effort,
  });
  await runtime.run(MODULE_ID, input);
  assert.equal(calls.at(-1).backendReasoningEffort, 'high');
  assert.equal(calls.at(-1).reasoningEffort, undefined);
  assert.equal(calls.at(-1).background, true);
  assert.equal(calls.at(-1).usageType, 'memory_summary');
  for (const id of ['intent', 'narrative', 'memory', 'audit']) {
    await runtime.run(id, input);
    assert.equal('backendReasoningEffort' in calls.at(-1), false, id);
  }
  const bare = createModuleModelRuntime({ definitions: GAME_MODEL_MODULES, resolveRoute: () => ({ config: conn('b', 'm'), inherited: false }), isEnabled: () => true, generate: async o => { calls.push(o); return 'ok'; } });
  await bare.run(MODULE_ID, input);
  assert.equal(calls.at(-1).backendReasoningEffort, 'default');
});

test('档位存取往返：未设＝default→回落配置 max；改档落盘、重载还原；default 清除；坏值丢弃', async () => {
  memory.clear();
  const store = await freshStore();
  assert.equal(store.getModuleReasoningEffort(MODULE_ID), 'default');
  assert.equal(dual.DUAL_MODEL_CONFIG.dualModel.backend.reasoningEffort, 'max');
  assert.deepEqual(policy.backendReasoningParam('https://api.minimaxi.com/v1', 'MiniMax-M3.1-Flash', true, store.getModuleReasoningEffort(MODULE_ID)), { reasoning_effort: 'max' });
  store.setModuleReasoningEffort(MODULE_ID, 'medium');
  assert.deepEqual(JSON.parse(memory.get('api_management_config')).moduleReasoningEffort, { [MODULE_ID]: 'medium' });
  let reloaded = await reloadStore();
  assert.equal(reloaded.getModuleReasoningEffort(MODULE_ID), 'medium');
  reloaded.setModuleReasoningEffort(MODULE_ID, 'off');
  assert.equal(reloaded.getModuleReasoningEffort(MODULE_ID), 'medium', 'off 不在玩家可选范围');
  reloaded.setModuleReasoningEffort(MODULE_ID, 'default');
  assert.deepEqual(JSON.parse(memory.get('api_management_config')).moduleReasoningEffort, {});
  const saved = JSON.parse(memory.get('api_management_config'));
  memory.set('api_management_config', JSON.stringify({ ...saved, moduleReasoningEffort: { [MODULE_ID]: 'none', other: 'xhigh' } }));
  memory.delete('api_management_cloud_pending_v1'); // 手改的本地配置不被未送达的云端待写覆盖
  reloaded = await reloadStore();
  assert.equal(reloaded.getModuleReasoningEffort(MODULE_ID), 'default');
  assert.equal(reloaded.getModuleReasoningEffort('other'), 'xhigh');
  const exported = reloaded.exportConfig();
  const imported = await freshStore();
  imported.importConfig(exported);
  assert.equal(imported.getModuleReasoningEffort('other'), 'xhigh');
  assert.deepEqual(dual.BACKEND_REASONING_EFFORTS, ['default', 'low', 'medium', 'high', 'xhigh', 'max']);
});

test('请求经 store 带玩家档位（dualModel.enabled 与玩家开关都开时）', async () => {
  memory.clear();
  const store = await freshStore();
  store.setModuleEnabled(MODULE_ID, true);
  store.setModuleReasoningEffort(MODULE_ID, 'xhigh');
  const original = aiService.generate; let captured;
  aiService.generate = async o => { captured = o; return 'ok'; };
  try {
    await withDualEnabled(true, () => runGameModelModule(MODULE_ID, input));
    assert.equal(captured.backendReasoningEffort, 'xhigh');
  } finally { aiService.generate = original; }
});

test('开关：dualModel.enabled 与 moduleEnabled.consistency 任一关即关；正式版默认关（N5-A）', async () => {
  memory.clear();
  const store = await freshStore();
  assert.equal(store.isModuleEnabled(MODULE_ID), false, '测试不带开发构建标记＝正式版口径');
  const cfg = structuredClone(dual.DUAL_MODEL_CONFIG);
  for (const [master, player, expected] of [[true, true, true], [true, false, false], [false, true, false], [false, false, false]]) {
    cfg.dualModel.enabled = master;
    assert.equal(dual.consistencyEnabled(player, cfg), expected, `${master}/${player}`);
  }
  store.setModuleEnabled(MODULE_ID, true);
  assert.equal(JSON.parse(memory.get('api_management_config')).moduleEnabled[MODULE_ID], true);
  await withDualEnabled(false, async () => {
    assert.equal(isGameModuleEnabled(card), false);
    await assert.rejects(runGameModelModule(MODULE_ID, input), /未启用/);
  });
  await withDualEnabled(true, async () => {
    assert.equal(isGameModuleEnabled(card), true);
    store.setModuleEnabled(MODULE_ID, false);
    assert.equal(isGameModuleEnabled(card), false);
  });
});

test('白名单：大小写不敏感、全名锚定，空名不算', () => {
  assert.equal(dual.isModelAllowed('MiniMax-M3.1-Flash'), true);
  assert.equal(dual.isModelAllowed('minimax-m3.1-flash'), true);
  for (const model of ['', 'MiniMax-M3.1-Flash-Pro', 'MiniMax-M3', 'Some-Paid-Model']) assert.equal(dual.isModelAllowed(model), false, model);
});

test('按量付费确认（N1-B）：开发构建不弹；正式版名单内不问、名单外按连接＋模型只确认一次，记录落盘', async () => {
  memory.clear();
  assert.equal(dual.needsPaidConfirm('Some-Paid-Model', true, false), false, '开发／测试构建由白名单约束默认值，不弹确认');
  assert.equal(dual.needsPaidConfirm('MiniMax-M3.1-Flash', false, false), false, '正式版名单内不问');
  const store = await freshStore();
  const ask = (apiId, model) => dual.needsPaidConfirm(model, false, store.isPaidModelConfirmed(apiId, model));
  assert.equal(ask('paid', 'Some-Paid-Model'), true, '正式版不拦，只要求确认');
  store.confirmPaidModel('paid', 'Some-Paid-Model');
  assert.equal(ask('paid', 'Some-Paid-Model'), false, '确认后不再问');
  store.confirmPaidModel('paid', 'Some-Paid-Model');
  assert.deepEqual(JSON.parse(memory.get('api_management_config')).paidModelConfirmations, [{ apiId: 'paid', model: 'Some-Paid-Model' }], '不重复记');
  assert.equal(ask('paid', 'Other-Paid-Model'), true, '同连接换模型要重新确认');
  assert.equal(ask('other', 'Some-Paid-Model'), true, '换连接要重新确认');
  const reloaded = await reloadStore();
  assert.equal(dual.needsPaidConfirm('Some-Paid-Model', false, reloaded.isPaidModelConfirmed('paid', 'Some-Paid-Model')), false, '重载后仍记得');
  const imported = await freshStore();
  imported.importConfig(reloaded.exportConfig());
  assert.equal(imported.isPaidModelConfirmed('paid', 'Some-Paid-Model'), true);
});

test('连接解析（N6-A，第4步）：consistency 用玩家单独选的连接，未分配继承 memory_summary，不走主叙事；其他模块仍走主叙事', async () => {
  memory.clear();
  const store = await freshStore();
  store.apiConfigs.push(conn('summary', 'Summary-Model'), conn('backend', 'MiniMax-M3.1-Flash'));
  store.assignAPI('memory_summary', 'summary');
  let route = resolveGameModuleRoute(card);
  assert.equal(route.config.id, 'summary', '未单独分配＝继承 memory_summary');
  assert.equal(route.inherited, true);
  assert.equal(route.viaHost, undefined);
  store.assignModuleAPI(MODULE_ID, 'backend');
  route = resolveGameModuleRoute(card);
  assert.equal(route.config.id, 'backend', '玩家单独选的连接优先');
  assert.equal(route.inherited, false);
  store.apiConfigs.find(c => c.id === 'backend').enabled = false;
  assert.equal(resolveGameModuleRoute(card).config.id, 'summary', '单独连接停用＝回到继承，不回落主叙事');
  for (const d of GAME_MODEL_MODULES.filter(m => m.id !== MODULE_ID)) {
    store.assignModuleAPI(d.id, 'backend');
    assert.equal(resolveGameModuleRoute(d).config.id, 'default', `${d.id} 现有行为不变：统一走主叙事连接`);
  }
  // 经 runGameModelModule 实际发出的请求也用这条连接。
  store.apiConfigs.find(c => c.id === 'backend').enabled = true;
  store.setModuleEnabled(MODULE_ID, true);
  const original = aiService.generate; let captured;
  aiService.generate = async o => { captured = o; return 'ok'; };
  try {
    const result = await withDualEnabled(true, () => runGameModelModule(MODULE_ID, input));
    assert.equal(captured.apiConfigOverride.id, 'backend');
    assert.equal(result.route.configId, 'backend');
  } finally { aiService.generate = original; }
});
