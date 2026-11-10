import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { createPinia, setActivePinia } from 'pinia';

// 与 legacyJudgementReceiptBridge 相同：真实 AIBS 回合提交 + 真实 gameStateStore，characterStore 用落盘桩。
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: {
    '@': fileURLToPath(new URL('../src', import.meta.url)),
    '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
  },
});
const loadTs = p => jiti.import(new URL(p, import.meta.url).pathname);

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

const bundle = JSON.parse(readFileSync(new URL('./fixtures/checkpoints/c01-before-wuyuan-220.json', import.meta.url)));
const fresh = () => structuredClone(bundle.saves[0].存档数据);

async function setup() {
  setActivePinia(createPinia());
  globalThis.localStorage.setItem('narrative-state-reconcile', 'off');
  const { AIBidirectionalSystem } = await loadTs('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await loadTs('../src/stores/gameStateStore.ts');
  const { applyLoadRepairs } = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
  const { getWuyuanOpenWorldSelections } = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
  const { ageForSaveCard } = await loadTs('../src/utils/lifespanCalculator.ts');
  return { AIBidirectionalSystem, store: useGameStateStore(), applyLoadRepairs, getWuyuanOpenWorldSelections, ageForSaveCard };
}

// 读档 → 点「前往·五原露天市集」：store.toSaveData() 交给 processGmResponse（processPlayerAction 同款），由其写回 store。
async function walkToWuyuan(env, save) {
  const { AIBidirectionalSystem, store, applyLoadRepairs, getWuyuanOpenWorldSelections } = env;
  applyLoadRepairs(save);
  store.loadFromSaveData(save);
  assert.equal(store.attributes.寿命.当前, 20);
  const live = store.toSaveData();
  const openWorldAction = getWuyuanOpenWorldSelections(live).find(x => x.identityId === 'lcq.route.wuyuan.arrive_market');
  assert.ok(openWorldAction, '夹具必须走官方进城路线');
  await AIBidirectionalSystem.processGmResponse(
    { text: '你朝五原城走去。', mid_term_memory: '前往五原。', tavern_commands: [], action_options: [] },
    live,
    false,
    () => false,
    { openWorldAction: { ...openWorldAction }, userAction: openWorldAction.actionText },
  );
}

test('8092 四年跳当场：store、getCurrentSaveData()、存档卡 寿命.当前 都是 24（不读档）', async () => {
  const env = await setup();
  await walkToWuyuan(env, fresh());
  const { store, ageForSaveCard } = env;
  assert.equal(store.gameTime.年, 224);
  assert.equal(store.attributes.寿命.当前, 24, 'store 状态（游戏变量树）');
  const current = store.getCurrentSaveData();
  assert.equal(current.角色.属性.寿命.当前, 24, 'getCurrentSaveData()');
  assert.equal(ageForSaveCard(current), 24, '存档卡现算');
});

test('8092 跳后读档：寿命.当前 仍 24、年份仍 224，不再 +4', async () => {
  const env = await setup();
  await walkToWuyuan(env, fresh());
  const { store, applyLoadRepairs, ageForSaveCard } = env;
  for (let n = 0; n < 2; n++) {
    const reload = JSON.parse(JSON.stringify(store.getCurrentSaveData()));
    applyLoadRepairs(reload);
    store.loadFromSaveData(reload);
    assert.equal(store.gameTime.年, 224);
    assert.equal(store.attributes.寿命.当前, 24);
    assert.equal(store.getCurrentSaveData().角色.属性.寿命.当前, 24);
    assert.equal(ageForSaveCard(store.getCurrentSaveData()), 24);
  }
});

test('未启用寿命缓存的旧档进 store 不被改写 寿命.当前（迁移仍归读档修复）', async () => {
  const { store } = await setup();
  const save = fresh();
  delete save.系统.扩展.c01LifespanCacheVersion;
  save.角色.属性.寿命.当前 = 33;
  store.loadFromSaveData(save);
  assert.equal(store.attributes.寿命.当前, 33);
  assert.equal(save.角色.属性.寿命.当前, 33, '入参不被改动');
});
