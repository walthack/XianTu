// 存档滚动备份与损坏回退：纯逻辑（命名/挪动计划/可用性/回退选择）+ IndexedDB 层集成（最小内存版假 IndexedDB）+ 数值段与错误码登记。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

// ───────────── 最小内存版 IndexedDB（只实现 indexedDBManager / 日志落盘用到的那部分） ─────────────
const stores = new Map(); // `${库名}/${仓名}` → Map<key, record>
const failPutWhen = { match: null }; // 设了就让匹配键的 put 抛错（模拟配额满）
const failGetWhen = { match: null }; // 设了就让匹配键的 get 抛错（模拟读事务失败）
if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  const values = new Map();
  globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k), clear: () => values.clear() };
}
const clone = value => (value === undefined ? undefined : structuredClone(value));
function makeRequest(run, tx) {
  const req = { result: undefined, error: null, onsuccess: null, onerror: null };
  tx.pending++;
  setTimeout(() => {
    try { req.result = run(); req.onsuccess?.({ target: req }); } catch (error) { req.error = error; req.onerror?.({ target: req }); tx.error = error; tx.onabort?.(); return; }
    if (--tx.pending === 0) setTimeout(() => { if (tx.pending === 0) tx.oncomplete?.(); }, 0);
  }, 0);
  return req;
}
function fakeStore(map, keyPath, tx) {
  return {
    get: key => makeRequest(() => {
      if (failGetWhen.match?.(key)) throw new Error('read transaction failed');
      return clone(map.get(key));
    }, tx),
    put: value => makeRequest(() => {
      const key = value[keyPath];
      if (failPutWhen.match && typeof key === 'string' && failPutWhen.match(key)) throw new Error('QuotaExceededError');
      map.set(key, clone(value)); return key;
    }, tx),
    delete: key => makeRequest(() => { map.delete(key); }, tx),
    clear: () => makeRequest(() => { map.clear(); }, tx),
    count: () => makeRequest(() => map.size, tx),
    getAll: () => makeRequest(() => [...map.values()].map(clone), tx),
    getAllKeys: () => makeRequest(() => [...map.keys()], tx),
  };
}
const fakeIndexedDB = {
  open(name) {
    const req = { result: null, error: null };
    setTimeout(() => {
      const defs = fakeIndexedDB.defs.get(name) ?? new Map();
      const isNew = !fakeIndexedDB.defs.has(name);
      fakeIndexedDB.defs.set(name, defs);
      const db = {
        objectStoreNames: { contains: store => defs.has(store) },
        createObjectStore: (store, options) => { defs.set(store, options?.keyPath ?? 'id'); stores.set(`${name}/${store}`, new Map()); },
        transaction: (names) => {
          const tx = { pending: 0, error: null, oncomplete: null, onerror: null, onabort: null };
          tx.objectStore = store => {
            const key = `${name}/${store}`;
            if (!stores.has(key)) stores.set(key, new Map());
            return fakeStore(stores.get(key), defs.get(store) ?? 'id', tx);
          };
          void names;
          return tx;
        },
      };
      req.result = db;
      if (isNew) req.onupgradeneeded?.({ target: req });
      req.onsuccess?.({ target: req });
    }, 0);
    return req;
  },
  defs: new Map(),
};
globalThis.indexedDB = fakeIndexedDB;

const rot = await loadTs('../src/utils/saveRotation.ts');
const idb = await loadTs('../src/utils/indexedDBManager.ts');
const fallback = await loadTs('../src/utils/saveLoadFallback.ts');
const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const logMod = await loadTs('../src/modules/diagnostics/log.ts');
const storeMod = await loadTs('../src/modules/diagnostics/store.ts');
const codes = await loadTs('../src/modules/diagnostics/codes.ts');
const toastMod = await loadTs('../src/utils/toast.ts');

const SAVES = 'DAD_SAVES_DB/saves';
const keyOf = (char, slot) => `savedata_${char}_${slot}`;
const savedKeys = () => [...(stores.get(SAVES)?.keys() ?? [])].sort();
const rawData = (char, slot) => stores.get(SAVES)?.get(keyOf(char, slot))?.data;
const mkSave = n => ({ 元数据: { 存档名: 'A', 版本号: 3, n }, 角色: {}, 社交: {}, 世界: {}, 系统: {} });
const versionOf = data => data?.元数据?.n;
const quiet = async fn => {
  const saved = {};
  for (const k of ['log', 'info', 'warn', 'debug', 'error']) { saved[k] = console[k]; console[k] = () => {}; }
  try { return await fn(); } finally { Object.assign(console, saved); }
};
const clearToasts = () => { for (const item of [...toastMod.toastsReadonly.value]) toastMod.toast.hide(item.id); };
/** 每个用例开头：清库、清日志、清“已提示”记录、清 toast 列表。 */
async function reset() {
  stores.get(SAVES)?.clear();
  failPutWhen.match = null;
  failGetWhen.match = null;
  await logMod.resetLogState();
  fallback.resetSaveFallbackNotices();
  clearToasts();
}
const logCodes = () => storeMod.logStore.recent(50).map(entry => entry.code);
const rotToasts = () => toastMod.toastsReadonly.value.filter(item => /LCQ-SAV-012/.test(item.message));
const writeVersions = async (char, slot, versions) => { for (const n of versions) await idb.saveSaveData(char, slot, mkSave(n), { localOnly: true }); };

// ───────────── 数值段与体检 ─────────────

test('saves.rotationKeep 默认 3，在 game-numbers.qingyu.json 里；坏值被 applyGameNumbers 整份拒绝', async () => {
  const json = JSON.parse(await readFile(new URL('../mod-kit/game-numbers.qingyu.json', import.meta.url), 'utf8'));
  assert.equal(json.saves.rotationKeep, 3);
  assert.equal(rot.rotationKeep(), 3);
  assert.deepEqual(rot.validateSavesConfig(), []);
  for (const bad of [-1, 21, 1.5]) {
    assert.throws(() => numbers.applyGameNumbers({ saves: { rotationKeep: bad } }), err => err.code === 'LCQ-NUM-006' && /rotationKeep/.test(err.message), String(bad));
  }
  assert.throws(() => numbers.applyGameNumbers({ saves: { rotationKeep: '3' } }), err => err.code === 'LCQ-NUM-003');
  assert.throws(() => numbers.applyGameNumbers({ saves: { rotationExcludeSlots: 'x' } }), err => err.code === 'LCQ-NUM-003', '排除列表须为数组（类型不符直接拒）');
  assert.throws(() => numbers.applyGameNumbers({ saves: { rotationExcludeSlots: [''] } }), err => err.code === 'LCQ-NUM-006' && /rotationExcludeSlots/.test(err.message), '槽名不能为空串');
  assert.throws(() => numbers.applyGameNumbers({ saves: { rotationExcludeSlots: [1] } }), err => err.code === 'LCQ-NUM-006', '槽名须为字符串');
  assert.deepEqual(rot.rotationExcludeSlots(), ['上次对话'], '被拒绝后原值仍在');
  assert.throws(() => numbers.applyGameNumbers({ saves: { nope: 1 } }), err => err.code === 'LCQ-NUM-002');
  assert.equal(rot.rotationKeep(), 3, '被拒绝后原值仍在');
  numbers.applyGameNumbers({ saves: { rotationKeep: 5 } });
  assert.equal(rot.planRotation('A').length, 5, '热改后调用时再读');
  numbers.applyGameNumbers({ saves: { rotationKeep: 3 } });
});

// ───────────── 纯逻辑 ─────────────

test('planRotation：最老的先挪，最后是当前槽→_1；__rot__ / __backup__ 槽与 keep=0 不滚动', () => {
  assert.deepEqual(rot.planRotation('A', 3), [
    { from: '__rot__A_2', to: '__rot__A_3' },
    { from: '__rot__A_1', to: '__rot__A_2' },
    { from: 'A', to: '__rot__A_1' },
  ]);
  assert.deepEqual(rot.planRotation('A', 1), [{ from: 'A', to: '__rot__A_1' }]);
  assert.deepEqual(rot.planRotation('A', 0), []);
  assert.deepEqual(rot.planRotation('__rot__A_1', 3), []);
  assert.deepEqual(rot.planRotation('__backup__A__2026-10-18', 3), []);
});

test('内部备份槽识别：槽名、IndexedDB 键、x 与 x_1 的备份互不混淆', () => {
  assert.ok(rot.isInternalBackupSlot('__rot__A_1') && rot.isInternalBackupSlot('__backup__A__t'));
  assert.ok(!rot.isInternalBackupSlot('A') && !rot.isInternalBackupSlot('上次对话'));
  assert.ok(rot.isInternalBackupKey('savedata_char_1___rot__A_2') && rot.isInternalBackupKey('savedata_char_1___backup__A__t'));
  assert.ok(!rot.isInternalBackupKey('savedata_char_1_A') && !rot.isInternalBackupKey('characters'));
  assert.ok(rot.isRotationSlotOf('__rot__x_1', 'x') && rot.isRotationSlotOf('__rot__x_12', 'x'));
  assert.ok(!rot.isRotationSlotOf('__rot__x_1_1', 'x'), 'x_1 的备份不算 x 的');
  assert.ok(rot.isRotationSlotOf('__rot__x_1_1', 'x_1'));
  assert.ok(!rot.isRotationSlotOf('x_1', 'x'));
});

test('isUsableSave：对象且过致命校验；旧结构（待迁移）算可用；字符串/数组/null/不认识的对象不可用', () => {
  assert.ok(rot.isUsableSave(mkSave(1)));
  assert.ok(rot.isUsableSave({ 属性: {}, 位置: {} }), '旧结构交给迁移流程，不能当损坏');
  for (const bad of [null, undefined, '存档', 42, [], {}, { foo: 1 }, { 元数据: {}, 角色: [] }]) assert.ok(!rot.isUsableSave(bad), JSON.stringify(bad));
});

test('readWithRotationFallback：主槽可用/不存在/损坏/抛错、取最近可用、全部损坏', async () => {
  const backups = { 1: mkSave(11), 2: mkSave(12), 3: mkSave(13) };
  const run = (primary, bks = backups) => rot.readWithRotationFallback({
    keep: 3,
    readPrimary: async () => { if (primary instanceof Error) throw primary; return primary; },
    readBackup: async i => { if (bks[i] instanceof Error) throw bks[i]; return bks[i] ?? null; },
  });
  assert.equal((await run(mkSave(1))).status, 'ok');
  assert.equal((await run(null)).status, 'absent', '不存在不是损坏，不回退');
  const corrupt = await run('乱码');
  assert.equal(corrupt.status, 'fallback');
  assert.equal(corrupt.backupIndex, 1);
  assert.equal(versionOf(corrupt.data), 11);
  const thrown = await run(new Error('read failed'));
  assert.equal(thrown.status, 'fallback');
  assert.match(thrown.primaryProblem, /read failed/);
  const skip = await run({ 坏: 1 }, { 1: '坏', 2: new Error('x'), 3: mkSave(13) });
  assert.equal(skip.backupIndex, 3, '跳过损坏与读不出的备份，取最近的可用');
  const all = await run('乱码', { 1: '坏', 2: null, 3: {} });
  assert.equal(all.status, 'exhausted');
  assert.equal(all.primary, '乱码');
  assert.equal((await run(new Error('boom'), {})).primary, null);
});

// ───────────── IndexedDB 层集成 ─────────────

test('滚动保留 N 份，超过丢最旧；首次写入不产生备份', async () => {
  await reset();
  await quiet(async () => {
    await writeVersions('c1', 'A', [1]);
    assert.deepEqual(savedKeys(), [keyOf('c1', 'A')], '新槽没有旧值可备份');
    await writeVersions('c1', 'A', [2, 3]);
    assert.deepEqual([rawData('c1', 'A'), rawData('c1', '__rot__A_1'), rawData('c1', '__rot__A_2')].map(versionOf), [3, 2, 1]);
    await writeVersions('c1', 'A', [4, 5]);
    assert.deepEqual(['A', '__rot__A_1', '__rot__A_2', '__rot__A_3'].map(slot => versionOf(rawData('c1', slot))), [5, 4, 3, 2], 'v1 被挤出');
    assert.equal(rawData('c1', '__rot__A_4'), undefined, '只留 3 份');
  });
});

test('份数热改为 1 / 0：只留 1 份 / 不再产生备份', async () => {
  await reset();
  await quiet(async () => {
    numbers.applyGameNumbers({ saves: { rotationKeep: 1 } });
    try {
      await writeVersions('c1', 'A', [1, 2, 3]);
      assert.deepEqual(['A', '__rot__A_1'].map(slot => versionOf(rawData('c1', slot))), [3, 2]);
      assert.equal(rawData('c1', '__rot__A_2'), undefined);
      stores.get(SAVES).clear();
      numbers.applyGameNumbers({ saves: { rotationKeep: 0 } });
      await writeVersions('c1', 'A', [1, 2]);
      assert.deepEqual(savedKeys(), [keyOf('c1', 'A')]);
    } finally { numbers.applyGameNumbers({ saves: { rotationKeep: 3 } }); }
  });
});

test('排除槽（默认“上次对话”）：多次覆盖写不产生 __rot__ 备份，普通槽照常产生', async () => {
  await reset();
  await quiet(async () => {
    const json = JSON.parse(await readFile(new URL('../mod-kit/game-numbers.qingyu.json', import.meta.url), 'utf8'));
    assert.deepEqual(json.saves.rotationExcludeSlots, ['上次对话'], '排除列表在 game-numbers 的 saves 段');
    assert.deepEqual(rot.planRotation('上次对话', 3), []);
    await writeVersions('c1', '上次对话', [1, 2, 3, 4]);
    await writeVersions('c1', 'A', [1, 2, 3]);
    assert.equal(versionOf(rawData('c1', '上次对话')), 4);
    assert.deepEqual(savedKeys().filter(key => key.includes('上次对话')), [keyOf('c1', '上次对话')], '上次对话没有任何 __rot__ 键');
    assert.deepEqual(['A', '__rot__A_1', '__rot__A_2'].map(slot => versionOf(rawData('c1', slot))), [3, 2, 1], '普通槽仍滚动');
  });
});

test('排除列表热改：加进去的槽停止滚动，清空后“上次对话”也滚动；排除槽的读档回退不翻旧备份', async () => {
  await reset();
  await quiet(async () => {
    try {
      numbers.applyGameNumbers({ saves: { rotationExcludeSlots: ['A'] } });
      await writeVersions('c1', 'A', [1, 2]);
      await writeVersions('c1', 'B', [1, 2]);
      assert.equal(rawData('c1', '__rot__A_1'), undefined, 'A 已被排除');
      assert.equal(versionOf(rawData('c1', '__rot__B_1')), 1);
      numbers.applyGameNumbers({ saves: { rotationExcludeSlots: [] } });
      await writeVersions('c1', '上次对话', [1, 2]);
      assert.equal(versionOf(rawData('c1', '__rot__上次对话_1')), 1, '清空排除列表后“上次对话”也滚动');
      // 早年遗留的旧备份：槽重新被排除后，主槽损坏也不拿陈年备份顶替
      numbers.applyGameNumbers({ saves: { rotationExcludeSlots: ['上次对话'] } });
      stores.get(SAVES).get(keyOf('c1', '上次对话')).data = '坏';
      assert.equal(rot.rotationKeepFor('上次对话'), 0);
      assert.equal(await fallback.loadSaveWithFallback('c1', '上次对话', { localOnly: true }), '坏');
      assert.ok(logCodes().includes('LCQ-SAV-013'));
      assert.ok(!logCodes().includes('LCQ-SAV-012'));
    } finally { numbers.applyGameNumbers({ saves: { rotationExcludeSlots: ['上次对话'] } }); }
  });
});

test('备份槽本身不再滚动：写 __backup__ / __rot__ 槽不产生 __rot__ 套娃', async () => {
  await reset();
  await quiet(async () => {
    await writeVersions('c1', '__backup__A__t', [1, 2]);
    await writeVersions('c1', '__rot__A_1', [1, 2]);
    assert.deepEqual(savedKeys(), [keyOf('c1', '__backup__A__t'), keyOf('c1', '__rot__A_1')].sort());
  });
});

test('各槽、各角色的备份互不串；旧值损坏时不滚动（不拿坏数据挤掉好备份）', async () => {
  await reset();
  await quiet(async () => {
    await writeVersions('c1', 'A', [1, 2]);
    await writeVersions('c1', 'B', [10, 11]);
    await writeVersions('c2', 'A', [20, 21]);
    assert.deepEqual([rawData('c1', '__rot__A_1'), rawData('c1', '__rot__B_1'), rawData('c2', '__rot__A_1')].map(versionOf), [1, 10, 20]);
    stores.get(SAVES).get(keyOf('c1', 'A')).data = '乱码';
    await writeVersions('c1', 'A', [3]);
    assert.equal(versionOf(rawData('c1', 'A')), 3);
    assert.equal(versionOf(rawData('c1', '__rot__A_1')), 1, '损坏的旧值没有被挪进 _1');
  });
});

test('滚动备份写入失败：记 LCQ-SAV-011（warn），主写入照常完成，不抛错', async () => {
  await reset();
  await quiet(async () => {
    await writeVersions('c1', 'A', [1]);
    failPutWhen.match = key => key.includes('___rot__');
    await idb.saveSaveData('c1', 'A', mkSave(2), { localOnly: true });
    failPutWhen.match = null;
    assert.equal(versionOf(rawData('c1', 'A')), 2);
    assert.equal(rawData('c1', '__rot__A_1'), undefined);
    const entry = storeMod.logStore.recent(50).find(item => item.code === 'LCQ-SAV-011');
    assert.ok(entry, '应记 LCQ-SAV-011');
    assert.equal(entry.level, 'warn');
  });
});

test('备份槽不进普通统计；删槽位连带清它的备份，不动别的槽（含名字相近的 A_1）', async () => {
  await reset();
  await quiet(async () => {
    await writeVersions('c1', 'A', [1, 2, 3]);
    await writeVersions('c1', 'A_1', [1, 2]);
    await writeVersions('c1', '__backup__A__t', [1]);
    assert.ok(savedKeys().length > 3);
    const stats = await idb.getStorageStats();
    assert.equal(stats.itemCount, 2, '只数 A 与 A_1 两个普通存档');
    await idb.deleteSaveData('c1', 'A', { localOnly: true });
    assert.deepEqual(savedKeys(), [keyOf('c1', 'A_1'), keyOf('c1', '__backup__A__t'), keyOf('c1', '__rot__A_1_1')].sort(), 'A 及其备份没了，A_1 的备份和迁移备份还在');
  });
});

test('整角色删除连带删光它的全部备份', async () => {
  await reset();
  await quiet(async () => {
    await writeVersions('c1', 'A', [1, 2, 3]);
    await writeVersions('c2', 'A', [1, 2]);
    await idb.deleteAllSaveDataForCharacter('c1', { localOnly: true });
    assert.deepEqual(savedKeys(), [keyOf('c2', 'A'), keyOf('c2', '__rot__A_1')].sort());
  });
});

// ───────────── 读档回退 ─────────────

test('主槽正常：直接返回，不提示；槽位不存在：返回 null，不当损坏', async () => {
  await reset();
  await quiet(async () => {
    await writeVersions('c1', 'A', [1, 2]);
    assert.equal(versionOf(await fallback.loadSaveWithFallback('c1', 'A', { localOnly: true })), 2);
    assert.equal(await fallback.loadSaveWithFallback('c1', '没有的槽', { localOnly: true }), null);
    assert.deepEqual(logCodes(), []);
    assert.equal(toastMod.toastsReadonly.value.length, 0);
  });
});

test('主槽损坏：回退到最近可用的备份，记 LCQ-SAV-012，同会话同槽只提示一次', async () => {
  await reset();
  await quiet(async () => {
    await writeVersions('c1', 'A', [1, 2, 3, 4]);
    stores.get(SAVES).get(keyOf('c1', 'A')).data = '乱码';
    stores.get(SAVES).get(keyOf('c1', '__rot__A_1')).data = { 半截: true };
    const first = await fallback.loadSaveWithFallback('c1', 'A', { localOnly: true });
    assert.equal(versionOf(first), 2, '_1 也坏了，取 _2（v2）');
    assert.equal(rotToasts().length, 1);
    assert.match(rotToasts()[0].message, /第 2 份/);
    const entry = storeMod.logStore.recent(50).find(item => item.code === 'LCQ-SAV-012');
    assert.ok(entry);
    assert.equal(entry.level, 'warn');
    assert.equal(entry.detail.backupIndex, 2);
    assert.equal(entry.detail.slotId, 'A');
    // 同一会话再读同一槽：照样回退，但不再弹提示
    clearToasts();
    assert.equal(versionOf(await fallback.loadSaveWithFallback('c1', 'A', { localOnly: true })), 2);
    assert.equal(rotToasts().length, 0);
    // 换一个槽，各自提示一次
    await writeVersions('c1', 'B', [1, 2]);
    stores.get(SAVES).get(keyOf('c1', 'B')).data = 7;
    assert.equal(versionOf(await fallback.loadSaveWithFallback('c1', 'B', { localOnly: true })), 1);
    assert.equal(rotToasts().length, 1);
  });
});

test('主槽读取抛错：同样回退到备份', async () => {
  await reset();
  await quiet(async () => {
    await writeVersions('c1', 'A', [1, 2]);
    failGetWhen.match = key => key === keyOf('c1', 'A');
    const loaded = await fallback.loadSaveWithFallback('c1', 'A', { localOnly: true });
    failGetWhen.match = null;
    assert.equal(versionOf(loaded), 1);
    const entry = storeMod.logStore.recent(50).find(item => item.code === 'LCQ-SAV-012');
    assert.match(entry.detail.problem, /读取抛错/);
  });
});

test('主槽和全部备份都不可用：记 LCQ-SAV-013（error，进玩家提示），返回主槽原值（沿用旧行为）', async () => {
  await reset();
  const seen = [];
  logMod.setToastSink((level, message) => seen.push({ level, message }));
  try {
    await quiet(async () => {
      await writeVersions('c1', 'A', [1, 2, 3, 4]);
      for (const slot of ['A', '__rot__A_1', '__rot__A_2', '__rot__A_3']) stores.get(SAVES).get(keyOf('c1', slot)).data = '坏';
      const result = await fallback.loadSaveWithFallback('c1', 'A', { localOnly: true });
      assert.equal(result, '坏');
      const entry = storeMod.logStore.recent(50).find(item => item.code === 'LCQ-SAV-013');
      assert.ok(entry);
      assert.equal(entry.level, 'error');
      assert.equal(rotToasts().length, 0, '全坏不走“已回退”提示');
      assert.equal(seen.length, 1);
      assert.equal(seen[0].level, 'error');
      assert.match(seen[0].message, /LCQ-SAV-013/);
    });
  } finally { logMod.setToastSink(null); }
});

test('没有任何备份的损坏主槽（老存档）：LCQ-SAV-013，不崩', async () => {
  await reset();
  await quiet(async () => {
    await writeVersions('c1', 'A', [1]);
    stores.get(SAVES).get(keyOf('c1', 'A')).data = '坏';
    assert.equal(await fallback.loadSaveWithFallback('c1', 'A', { localOnly: true }), '坏');
    assert.ok(logCodes().includes('LCQ-SAV-013'));
  });
});

test('旧结构存档（待迁移）不被当成损坏：不回退、不记码', async () => {
  await reset();
  await quiet(async () => {
    await idb.saveSaveData('c1', 'A', { 属性: { 气血: 1 }, 位置: {} }, { localOnly: true });
    const loaded = await fallback.loadSaveWithFallback('c1', 'A', { localOnly: true });
    assert.deepEqual(loaded.属性, { 气血: 1 });
    assert.deepEqual(logCodes(), []);
  });
});

// ───────────── 错误码登记 ─────────────

test('LCQ-SAV-011/012/013 登记：级别、模块、是否进玩家提示', () => {
  const { ERROR_CODES } = codes;
  assert.deepEqual([ERROR_CODES['LCQ-SAV-011'].level, ERROR_CODES['LCQ-SAV-011'].toast], ['warn', false]);
  assert.deepEqual([ERROR_CODES['LCQ-SAV-012'].level, ERROR_CODES['LCQ-SAV-012'].toast], ['warn', true]);
  assert.deepEqual([ERROR_CODES['LCQ-SAV-013'].level, ERROR_CODES['LCQ-SAV-013'].toast], ['error', true]);
  for (const code of ['LCQ-SAV-011', 'LCQ-SAV-012', 'LCQ-SAV-013']) assert.equal(ERROR_CODES[code].module, 'indexedDB');
});

test('characterStore 的读档路径（loadGame 与激活存档同步）走带回退的入口', async () => {
  const source = await readFile(new URL('../src/stores/characterStore.ts', import.meta.url), 'utf8');
  assert.equal((source.match(/loadSaveWithFallback\(/g) ?? []).length, 2);
});
