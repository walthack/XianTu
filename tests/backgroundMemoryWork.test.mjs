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

test('a slot only indexes its latest snapshot; different slots may run in parallel', async () => {
  const bg = await loadTs('../src/utils/backgroundMemoryWork.ts');
  bg.resetBackgroundMemoryWorkForTests();
  const log = [];
  const activeBySlot = new Map();
  let maxSameSlot = 0;
  const runner = async task => {
    const current = (activeBySlot.get(task.saveSlot) || 0) + 1;
    activeBySlot.set(task.saveSlot, current);
    maxSameSlot = Math.max(maxSameSlot, current);
    log.push({ slot: task.saveSlot, note: task.snapshot.note });
    await delay(25);
    activeBySlot.set(task.saveSlot, (activeBySlot.get(task.saveSlot) || 1) - 1);
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
  assert.equal(maxSameSlot, 1);
  assert.deepEqual(log.filter(item => item.slot === 'slotA').map(item => item.note), ['slotA-new']);
  assert.equal(log.some(item => item.slot === 'slotB' && item.note === 'slotB'), true);
  assert.equal(log.every(item => item.note !== 'mutated-after-schedule'), true);
});

test('summary index write and snapshot index sync on the same slot never overlap', async () => {
  const bg = await loadTs('../src/utils/backgroundMemoryWork.ts');
  bg.resetBackgroundMemoryWorkForTests();
  const events = [];
  let inWrite = 0;
  let maxInWrite = 0;
  const mark = async (label, ms) => {
    inWrite += 1;
    maxInWrite = Math.max(maxInWrite, inWrite);
    events.push(`${label}:start`);
    await delay(ms);
    events.push(`${label}:end`);
    inWrite -= 1;
  };
  let indexEntered;
  const indexStarted = new Promise(resolve => { indexEntered = resolve; });
  bg.scheduleBackgroundMemoryWork({ note: 'snapshot' }, 'slotA', async () => {
    indexEntered();
    await mark('index', 40);
  });
  await indexStarted;
  const summaryText = await delay(10).then(() => 'summary-text');
  await bg.commitMemorySummaryIndex({
    saveSlot: 'slotA',
    write: () => mark(`addMemory:${summaryText}`, 40),
  });
  await bg.flushBackgroundMemoryWorkForTests();
  assert.equal(maxInWrite, 1, 'index sync and addMemory must serialize through runExclusive');
  assert.deepEqual(events, [
    'index:start',
    'index:end',
    'addMemory:summary-text:start',
    'addMemory:summary-text:end',
  ]);
});

test('bumping revision after summary makes an unstarted snapshot index stale', async () => {
  const bg = await loadTs('../src/utils/backgroundMemoryWork.ts');
  bg.resetBackgroundMemoryWorkForTests();
  const ran = [];
  bg.beginForegroundAiTurn();
  bg.scheduleBackgroundMemoryWork({ note: 'old' }, 'slotA', async task => {
    await task.waitIfForegroundBusy();
    if (task.isStale()) return;
    ran.push('index');
  });
  await delay(15);
  await bg.commitMemorySummaryIndex({
    saveSlot: 'slotA',
    write: async () => { ran.push('addMemory'); },
  });
  bg.endForegroundAiTurn();
  await bg.flushBackgroundMemoryWorkForTests();
  assert.deepEqual(ran, ['addMemory']);
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

test('production wiring sends summary vector writes through the exclusive queue', async () => {
  const { readFile } = await import('node:fs/promises');
  const system = await readFile(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url), 'utf8');
  assert.match(system, /commitMemorySummaryIndex\(/);
  assert.match(system, /beginForegroundAiTurn\(\);/);
  assert.match(system, /public async generateInitialMessage/);
  const initStart = system.indexOf('public async generateInitialMessage');
  const initSlice = system.slice(initStart, system.indexOf('private _getMinutes', initStart));
  assert.match(initSlice, /beginForegroundAiTurn\(\)/);
  assert.match(initSlice, /endForegroundAiTurn\(\)/);
  const tavern = await readFile(new URL('../src/utils/tavernCore.ts', import.meta.url), 'utf8');
  assert.match(tavern, /beginForegroundAiTurn\(\)/);
  assert.match(tavern, /endForegroundAiTurn\(\)/);
});
