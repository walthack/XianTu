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

test('a slot only indexes its latest snapshot; all slots share one write queue', async () => {
  const bg = await loadTs('../src/utils/backgroundMemoryWork.ts');
  bg.resetBackgroundMemoryWorkForTests();
  const log = [];
  let active = 0;
  let maxActive = 0;
  const runner = async task => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    log.push({ slot: task.saveSlot, note: task.snapshot.note });
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

test('singleton RAG slot identity is preserved because writes never overlap', async () => {
  const bg = await loadTs('../src/utils/backgroundMemoryWork.ts');
  bg.resetBackgroundMemoryWorkForTests();
  let singletonSlot = null;
  const writes = [];
  const runner = async task => {
    singletonSlot = task.saveSlot;
    await delay(20);
    writes.push({ requested: task.saveSlot, actual: singletonSlot });
  };
  bg.scheduleBackgroundMemoryWork({ note: 'A' }, 'slotA', runner);
  bg.scheduleBackgroundMemoryWork({ note: 'B' }, 'slotB', runner);
  await bg.flushBackgroundMemoryWorkForTests();
  assert.deepEqual(writes, [
    { requested: 'slotA', actual: 'slotA' },
    { requested: 'slotB', actual: 'slotB' },
  ]);
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

test('empty save slot skips the index write and never overlaps another slot', async () => {
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
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(' '));
  let indexEntered;
  const indexStarted = new Promise(resolve => { indexEntered = resolve; });
  try {
    bg.scheduleBackgroundMemoryWork({ note: 'slotA' }, 'slotA', async () => {
      indexEntered();
      await mark('slotA', 40);
    });
    await indexStarted;
    await bg.commitMemorySummaryIndex({
      saveSlot: '',
      write: () => mark('empty', 40),
    });
    await bg.flushBackgroundMemoryWorkForTests();
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(maxInWrite, 1, 'empty slot must not write beside another slot');
  assert.equal(events.includes('empty:start'), false);
  assert.deepEqual(events, ['slotA:start', 'slotA:end']);
  assert.ok(warnings.some(line => /无存档槽/.test(line)), warnings.join('\n'));
});

test('empty save slot skips index write even when no other slot is running', async () => {
  const bg = await loadTs('../src/utils/backgroundMemoryWork.ts');
  bg.resetBackgroundMemoryWorkForTests();
  let wrote = false;
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(' '));
  try {
    await bg.commitMemorySummaryIndex({
      saveSlot: '',
      write: async () => { wrote = true; },
    });
    await bg.runExclusive('', async () => { wrote = true; });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(wrote, false);
  assert.ok(warnings.some(line => /无存档槽/.test(line)), warnings.join('\n'));
});

test('production wiring sends summary vector writes through the exclusive queue', async () => {
  const { readFile } = await import('node:fs/promises');
  const system = await readFile(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url), 'utf8');
  assert.match(system, /commitMemorySummaryIndex\(/);
  assert.match(system, /beginForegroundAiTurn\(\);/);
  const pilotStart = system.indexOf('private async tryLegacyNarrativePilot');
  const pilotSlice = system.slice(pilotStart, system.indexOf('public async processPlayerAction', pilotStart));
  assert.match(pilotSlice, /noteBufferedFullResponse\(true\)/);
  assert.match(pilotSlice, /should_stream: false/);
  assert.match(pilotSlice, /bufferedFullResponse: true/);
  assert.equal(/noteBufferedFullResponse\(false\)/.test(pilotSlice), false);
  assert.equal(/bufferedFullResponse: false/.test(pilotSlice), false);
  assert.match(system, /public async generateInitialMessage/);
  const initStart = system.indexOf('public async generateInitialMessage');
  const initSlice = system.slice(initStart, system.indexOf('private _getMinutes', initStart));
  assert.match(initSlice, /beginForegroundAiTurn\(\)/);
  assert.match(initSlice, /endForegroundAiTurn\(\)/);
  const tavern = await readFile(new URL('../src/utils/tavernCore.ts', import.meta.url), 'utf8');
  assert.match(tavern, /beginForegroundAiTurn\(\)/);
  assert.match(tavern, /endForegroundAiTurn\(\)/);
});
