import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';

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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test('two save slots serialize and a slot only indexes its latest snapshot', async () => {
  const bg = await loadTs('../src/utils/backgroundMemoryWork.ts');
  bg.resetBackgroundMemoryWorkForTests();
  const log = [];
  let active = 0;
  let maxActive = 0;
  const runner = async task => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    log.push({ slot: task.saveSlot, revision: task.revision, note: task.snapshot.note, frozen: task.snapshot.note });
    await delay(25);
    active -= 1;
  };
  const first = { note: 'slotA-old', 社交: { 记忆: { 长期记忆: ['a1'] } } };
  const latestA = { note: 'slotA-new', 社交: { 记忆: { 长期记忆: ['a2'] } } };
  const slotB = { note: 'slotB', 社交: { 记忆: { 长期记忆: ['b'] } } };
  bg.scheduleBackgroundMemoryWork(first, 'slotA', runner);
  bg.scheduleBackgroundMemoryWork(latestA, 'slotA', runner);
  bg.scheduleBackgroundMemoryWork(slotB, 'slotB', runner);
  first.note = 'mutated-after-schedule';
  latestA.note = 'mutated-after-schedule';
  await bg.flushBackgroundMemoryWorkForTests();
  assert.equal(maxActive, 1);
  assert.deepEqual(log.map(item => `${item.slot}:${item.note}`), ['slotA:slotA-new', 'slotB:slotB']);
  assert.equal(log.every(item => item.note !== 'mutated-after-schedule'), true);
});

test('foreground turn delays background work until it finishes', async () => {
  const bg = await loadTs('../src/utils/backgroundMemoryWork.ts');
  bg.resetBackgroundMemoryWorkForTests();
  let started = 0;
  const runner = async task => {
    await task.waitIfForegroundBusy();
    if (task.isStale()) return;
    started += 1;
  };
  bg.beginForegroundAiTurn();
  bg.scheduleBackgroundMemoryWork({ note: 1 }, 'slotA', runner);
  await delay(30);
  assert.equal(started, 0);
  bg.endForegroundAiTurn();
  await bg.flushBackgroundMemoryWorkForTests();
  assert.equal(started, 1);
});

test('manual memory summary keeps toast feedback; background silent summary does not', async () => {
  setActivePinia(createPinia());
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
  const { AIBidirectionalSystem } = await loadTs('../src/utils/AIBidirectionalSystem.ts');
  const { toast, toastsReadonly } = await loadTs('../src/utils/toast.ts');
  const messages = () => toastsReadonly.value.map(item => `${item.type}:${item.message}`);
  const before = messages();

  await AIBidirectionalSystem.triggerMemorySummary({ silent: true });
  assert.deepEqual(messages(), before);

  await AIBidirectionalSystem.triggerMemorySummary();
  assert.ok(messages().some(item => item.includes('正在调用AI总结中期记忆') || item.includes('记忆总结失败') || item.includes('未达到触发阈值') || item.includes('无法获取')), messages());
  toast.hide('memory-summary');
});
