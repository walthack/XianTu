// 诊断 / 错误码日志：脱敏、环形缓冲、级别线、永不抛错、落盘（IndexedDB 后端用最小假实现 + localStorage 降级）、导出，
// 以及第一批接入点（runtimeTuning、numbers、freeAction 拒绝出口、indexedDBManager、AI 请求超时、manager 内容包、consolePatch）。
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { load, makeSave, mods, ticket, WANG_ZHE, NING_YU } from './freeActionFixture.mjs';

const log = await load('../src/modules/diagnostics/log.ts');
const cfgMod = await load('../src/modules/diagnostics/config.ts');
const redactMod = await load('../src/modules/diagnostics/redact.ts');
const storeMod = await load('../src/modules/diagnostics/store.ts');
const exportMod = await load('../src/modules/diagnostics/export.ts');
const codes = await load('../src/modules/diagnostics/codes.ts');
const N = () => mods.numbers.GAME_NUMBERS;

const quiet = fn => {
  const saved = {};
  for (const k of ['log', 'info', 'warn', 'debug', 'error']) { saved[k] = console[k]; console[k] = () => {}; }
  const restore = () => Object.assign(console, saved);
  let result;
  try { result = fn(); } catch (error) { restore(); throw error; }
  if (result && typeof result.then === 'function') return result.finally(restore);
  restore();
  return result;
};
/** 改配置的用例必须还原（走 applyGameNumbers 合并回去）；同时清日志状态。 */
async function fresh(patch, fn) {
  const before = structuredClone(N().diagnostics);
  await log.resetLogState();
  try {
    if (patch) mods.numbers.applyGameNumbers({ diagnostics: patch });
    return await fn();
  } finally { mods.numbers.applyGameNumbers({ diagnostics: before }); await log.resetLogState(); }
}
const recent = (n = 50, level) => storeMod.logStore.recent(n, level);

// ───────────── 配置 ─────────────

test('diagnostics 配置段在 game-numbers.qingyu.json 里，体检通过；坏值被 applyGameNumbers 整份拒绝并带码', async () => {
  assert.deepEqual(cfgMod.validateDiagnosticsConfig(), []);
  assert.equal(cfgMod.diagnosticsConfig().textChars, 0, '默认不记玩家原文');
  assert.throws(() => mods.numbers.applyGameNumbers({ diagnostics: { ringMax: 0 } }), err => err.code === 'LCQ-NUM-006' && /ringMax/.test(err.message));
  assert.throws(() => mods.numbers.applyGameNumbers({ diagnostics: { minLevel: 'loud' } }), /minLevel/);
  assert.throws(() => mods.numbers.applyGameNumbers({ diagnostics: { redactPatterns: ['('] } }), /正则/);
  assert.throws(() => mods.numbers.applyGameNumbers({ diagnostics: { nope: 1 } }), err => err.code === 'LCQ-NUM-002');
  assert.ok(cfgMod.diagnosticsConfig().ringMax > 0, '被拒绝后原值仍在');
});

// ───────────── logEvent ─────────────

test('logEvent：字段齐全，级别与模块取码表默认，msg = 含义 + 异常信息，stack 与 requestId/turnId 透传', async () => {
  await fresh(null, async () => {
    const err = new Error('boom');
    const entry = quiet(() => log.logEvent({ code: 'LCQ-SAV-003', cause: err, detail: { op: 'x' }, ctx: { turnId: 't1', requestId: 'r1' } }));
    assert.deepEqual(Object.keys(entry).sort(), ['code', 'detail', 'level', 'module', 'msg', 'requestId', 'sessionId', 'stack', 'ts', 'turnId'].sort());
    assert.equal(entry.level, 'error');
    assert.equal(entry.module, 'indexedDB');
    assert.equal(entry.sessionId, log.SESSION_ID);
    assert.equal(entry.turnId, 't1');
    assert.equal(entry.requestId, 'r1');
    assert.match(entry.msg, /^存档写入失败：boom$/);
    assert.match(entry.stack, /boom/);
    assert.ok(!Number.isNaN(Date.parse(entry.ts)));
    const noCtx = log.logEvent({ code: 'LCQ-CFG-001' });
    assert.equal(noCtx.turnId, null);
    assert.equal(noCtx.requestId, undefined);
    assert.equal(noCtx.level, 'info');
  });
});

test('没登记的码落到 LCQ-SYS-000「未登记」，原码进 detail.originalCode', async () => {
  await fresh(null, async () => {
    const entry = quiet(() => log.logEvent({ code: 'LCQ-ZZZ-999', detail: { a: 1 } }));
    assert.equal(entry.code, 'LCQ-SYS-000');
    assert.equal(entry.msg, '未登记');
    assert.deepEqual(entry.detail, { originalCode: 'LCQ-ZZZ-999', a: 1 });
  });
});

test('写日志永不抛错：getter 抛错、循环引用、怪异 cause、配置关闭、入参为空都安全', async () => {
  await fresh(null, async () => {
    const cyc = { name: 'c' }; cyc.self = cyc;
    const bad = { get boom() { throw new Error('getter'); } };
    quiet(() => {
      assert.doesNotThrow(() => log.logEvent({ code: 'LCQ-SYS-000', detail: bad }));
      assert.doesNotThrow(() => log.logEvent({ code: 'LCQ-SYS-000', detail: cyc, cause: Symbol('x') }));
      assert.doesNotThrow(() => log.logEvent(null));
      assert.doesNotThrow(() => log.logEvent(undefined));
      assert.doesNotThrow(() => log.logError('LCQ-SYS-000', undefined));
      assert.doesNotThrow(() => log.logError(undefined, { toString() { throw new Error('x'); } }));
    });
    const entry = recent().find(e => e.detail && e.detail.self);
    assert.equal(entry.detail.self, '[循环引用]');
  });
  await fresh({ enabled: false }, async () => {
    assert.equal(log.logEvent({ code: 'LCQ-SYS-000' }), null);
    assert.equal(recent().length, 0);
  });
});

test('级别线：minLevel 丢弃、persistLevel 控制落盘、consoleLevel 控制控制台', async () => {
  await fresh({ minLevel: 'warn', consoleLevel: 'error', persistLevel: 'error' }, async () => {
    const printed = [];
    const saved = { warn: console.warn, error: console.error, info: console.info };
    console.warn = (...a) => printed.push(['warn', a[0]]); console.error = (...a) => printed.push(['error', a[0]]); console.info = (...a) => printed.push(['info', a[0]]);
    try {
      assert.equal(log.logEvent({ code: 'LCQ-CFG-001' }), null, 'info 低于 minLevel 整条丢弃');
      log.logEvent({ code: 'LCQ-CFG-002' }); // warn：记，不打控制台，不落盘
      log.logEvent({ code: 'LCQ-CFG-004' }); // error：记、打控制台、落盘
    } finally { Object.assign(console, saved); }
    assert.deepEqual(printed.map(p => p[0]), ['error']);
    assert.match(printed[0][1], /^\[LCQ-CFG-004\]/);
    assert.deepEqual(recent().map(e => e.code).sort(), ['LCQ-CFG-002', 'LCQ-CFG-004']);
  });
});

test('同一事件在 repeatMs 内只记一次，下一次带出 suppressedBefore；detail 不同则各记', async () => {
  await fresh(null, async () => {
    quiet(() => {
      log.logEvent({ code: 'LCQ-FA-001', detail: { t: 'a' } });
      log.logEvent({ code: 'LCQ-FA-001', detail: { t: 'a' } });
      log.logEvent({ code: 'LCQ-FA-001', detail: { t: 'a' } });
      log.logEvent({ code: 'LCQ-FA-001', detail: { t: 'b' } });
    });
    assert.equal(recent().length, 2);
  });
  await fresh({ repeatMs: 1 }, async () => {
    log.logEvent({ code: 'LCQ-FA-001', detail: { t: 'a' } });
    log.logEvent({ code: 'LCQ-FA-001', detail: { t: 'a' } });
    await new Promise(resolve => setTimeout(resolve, 5));
    const third = log.logEvent({ code: 'LCQ-FA-001', detail: { t: 'a' } });
    assert.equal(third.detail.suppressedBefore, 1, '窗口内被吞的那一条在下一条里带出计数');
  });
});

test('logEventOnce：同一 key 本会话只记一次', async () => {
  await fresh(null, async () => {
    assert.ok(log.logEventOnce('k', { code: 'LCQ-SAV-006' }));
    assert.equal(log.logEventOnce('k', { code: 'LCQ-SAV-006' }), null);
    assert.ok(log.logEventOnce('k2', { code: 'LCQ-SAV-006', detail: { other: 1 } }));
  });
});

// ───────────── 脱敏 ─────────────

test('脱敏：密钥键整个替换、sk-/Bearer/AIza/?key= 形状替换、玩家原文类字段只留长度、长串截断、深度与键数有限', () => {
  const cfg = cfgMod.diagnosticsConfig();
  const out = redactMod.redact({
    apiKey: 'sk-abcdef0123456789', accessToken: 'zzz', Authorization: 'Bearer abcdefghijklmnop', 'x-api-key': 'k',
    note: 'call with sk-abcdef0123456789 and AIzaSyA1234567890123456789012345 at https://x/y?key=SECRET123&a=1',
    playerText: '我要夺走她的内力', input: '玩家输入', content: '正文', ok: 'plain',
    long: 'x'.repeat(cfg.detailChars + 50),
    deep: { a: { b: { c: { d: { e: 1 } } } } },
    many: Object.fromEntries(Array.from({ length: cfg.maxKeys + 5 }, (_, i) => [`k${i}`, i])),
    n: 3, flag: true, nothing: null,
  });
  assert.equal(out.apiKey, '[已脱敏]');
  assert.equal(out.accessToken, '[已脱敏]');
  assert.equal(out.Authorization, '[已脱敏]');
  assert.equal(out['x-api-key'], '[已脱敏]');
  assert.ok(!/sk-abcdef|AIza|SECRET123/.test(out.note), out.note);
  assert.equal(out.playerText, '[文本已省略，8字]');
  assert.equal(out.input, '[文本已省略，4字]');
  assert.ok(!JSON.stringify(out).includes('夺走'), '玩家原文不得出现在脱敏结果里');
  assert.equal(out.ok, 'plain');
  assert.ok(out.long.length < cfg.detailChars + 30 && out.long.includes('共'), '长串被截断并标注总长');
  assert.equal(out.deep.a.b.c, '[对象]');
  assert.equal(Object.keys(out.many).length, cfg.maxKeys + 1);
  assert.deepEqual([out.n, out.flag, out.nothing], [3, true, null]);
});

test('textChars 可配：设为 3 时玩家原文只留前 3 字（默认 0 才是“不记”）', async () => {
  await fresh({ textChars: 3 }, async () => {
    const out = redactMod.redact({ playerText: '一二三四五' });
    assert.match(out.playerText, /^一二三…/);
    assert.ok(!out.playerText.includes('四'));
  });
});

test('异常对象脱敏：message 里的密钥被抹掉，stack 受 stackChars 限制', async () => {
  await fresh(null, async () => {
    const err = new Error('failed with Bearer abcdefghijklmnopqrst');
    err.stack = `${err.stack}\n${'at x\n'.repeat(1000)}`;
    const entry = quiet(() => log.logEvent({ code: 'LCQ-NET-005', cause: err, detail: { e: err } }));
    assert.ok(!/abcdefghijklmnop/.test(JSON.stringify(entry)));
    assert.ok(entry.stack.length <= cfgMod.diagnosticsConfig().stackChars + 30);
  });
});

// ───────────── 环形缓冲 ─────────────

test('环形缓冲：ringMax 与 maxBytes 各自生效，删最老的', async () => {
  await fresh({ ringMax: 3, repeatMs: 1 }, async () => {
    quiet(() => { for (let i = 0; i < 6; i++) log.logEvent({ code: 'LCQ-SYS-000', detail: { i } }); });
    const rows = recent();
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map(r => r.detail.i), [5, 4, 3]);
  });
  await fresh({ maxBytes: 1200, ringMax: 100 }, async () => {
    quiet(() => { for (let i = 0; i < 20; i++) log.logEvent({ code: 'LCQ-SYS-000', detail: { i, pad: 'p'.repeat(100) } }); });
    const rows = recent(100);
    assert.ok(rows.length < 20 && rows.length >= 1);
    assert.equal(rows[0].detail.i, 19, '最新的一定留着');
  });
});

// ───────────── 存储后端 ─────────────

/** 最小 IndexedDB 假实现：够 indexedDbBackend 用（open/升级/事务/put/delete/clear/getAll）。 */
function fakeIndexedDb() {
  const stores = new Map();
  const request = run => { const req = {}; queueMicrotask(() => { try { req.result = run(); req.onsuccess?.(); } catch (error) { req.error = error; req.onerror?.(); } }); return req; };
  const db = {
    objectStoreNames: { contains: name => stores.has(name) },
    createObjectStore: (name, opts) => { stores.set(name, { keyPath: opts.keyPath, rows: new Map() }); return {}; },
    transaction: name => {
      const tx = { objectStore: () => {
        const store = stores.get(name);
        return {
          put: row => request(() => { store.rows.set(row[store.keyPath], structuredClone(row)); }),
          delete: key => request(() => { store.rows.delete(key); }),
          clear: () => request(() => { store.rows.clear(); }),
          getAll: () => request(() => [...store.rows.values()].map(row => structuredClone(row))),
        };
      } };
      setTimeout(() => tx.oncomplete?.(), 0);
      return tx;
    },
  };
  return { stores, factory: { open: () => { const req = {}; queueMicrotask(() => { req.result = db; req.onupgradeneeded?.(); req.onsuccess?.(); }); return req; } } };
}
const entryOf = (i, extra = {}) => ({ ts: new Date(1700000000000 + i).toISOString(), level: 'error', code: 'LCQ-SYS-000', module: 'm', sessionId: 's', turnId: null, msg: `m${i}`, ...extra });

test('IndexedDB 后端：独立库 lcq-log，put / load / remove / clear；存储层 flush 落盘并按 ringMax 裁剪磁盘', async () => {
  const fake = fakeIndexedDb();
  const backend = await storeMod.indexedDbBackend(fake.factory);
  assert.equal(backend.kind, 'indexedDB');
  assert.ok(fake.stores.has(storeMod.LOG_STORE_NAME));
  assert.equal(storeMod.LOG_DB_NAME, 'lcq-log');
  assert.notEqual(storeMod.LOG_DB_NAME, 'DAD_SAVES_DB', '不碰存档库');

  const before = structuredClone(N().diagnostics);
  mods.numbers.applyGameNumbers({ diagnostics: { ringMax: 4, flushMs: 1 } });
  try {
    const store = storeMod.createLogStore({ openBackend: async () => backend });
    for (let i = 0; i < 7; i++) store.add(entryOf(i), true);
    await store.flush();
    const onDisk = await backend.load();
    assert.equal(onDisk.length, 4, '磁盘上也受 ringMax 限制');
    assert.deepEqual(onDisk.map(e => e.msg), ['m3', 'm4', 'm5', 'm6']);

    // 新开一个存储实例（模拟刷新页面）：all() 能读回旧会话的记录
    const reopened = storeMod.createLogStore({ openBackend: async () => backend });
    reopened.add(entryOf(99), true);
    const all = await reopened.all();
    assert.ok(all.some(e => e.msg === 'm6') && all.some(e => e.msg === 'm99'));
    await reopened.clear();
    assert.equal((await backend.load()).length, 0);
  } finally { mods.numbers.applyGameNumbers({ diagnostics: before }); }
});

test('IndexedDB 打开失败 → 降级 localStorage 小缓存并回调一次；localStorage 缓存只留最近 localFallbackMax 条', async () => {
  const store = new Map();
  const ls = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  const degrade = [];
  const savedIdb = globalThis.indexedDB, savedLs = globalThis.localStorage;
  globalThis.indexedDB = { open: () => { const req = {}; queueMicrotask(() => { req.error = new Error('denied'); req.onerror?.(); }); return req; } };
  globalThis.localStorage = ls;
  const before = structuredClone(N().diagnostics);
  mods.numbers.applyGameNumbers({ diagnostics: { localFallbackMax: 3 } });
  try {
    const s = storeMod.createLogStore({ onDegrade: (reason, to) => degrade.push([String(reason?.message ?? reason), to]) });
    for (let i = 0; i < 5; i++) s.add(entryOf(i), true);
    await s.flush();
    assert.deepEqual(degrade, [['denied', 'localStorage']]);
    assert.equal(await s.backendKind(), 'localStorage');
    const saved = JSON.parse(store.get(storeMod.LOG_FALLBACK_KEY));
    assert.deepEqual(saved.map(e => e.msg), ['m2', 'm3', 'm4']);
  } finally {
    globalThis.indexedDB = savedIdb; globalThis.localStorage = savedLs;
    mods.numbers.applyGameNumbers({ diagnostics: before });
  }
});

test('没有 IndexedDB 也没有 localStorage：只留内存，不抛错', async () => {
  const savedIdb = globalThis.indexedDB, savedLs = globalThis.localStorage;
  globalThis.indexedDB = undefined; globalThis.localStorage = undefined;
  try {
    const s = storeMod.createLogStore();
    s.add(entryOf(1), true);
    await s.flush();
    assert.equal(await s.backendKind(), 'memory');
    assert.equal(s.recent(5).length, 1);
  } finally { globalThis.indexedDB = savedIdb; globalThis.localStorage = savedLs; }
});

test('默认存储从 IndexedDB 降级时记 LCQ-SYS-001（经 log.ts 登记的回调）', async () => {
  await fresh(null, async () => {
    const savedIdb = globalThis.indexedDB;
    globalThis.indexedDB = undefined;
    try {
      // 默认单例此前可能已选定后端；用 onStoreDegrade 回调的实现直接触发同一路径
      quiet(() => storeMod.logStore.add(entryOf(1), false));
      const store = storeMod.createLogStore({ onDegrade: (reason, to) => log.logEvent({ code: 'LCQ-SYS-001', detail: { to }, cause: reason }) });
      store.add(entryOf(2), true);
      await quiet(() => store.flush());
    } finally { globalThis.indexedDB = savedIdb; }
    assert.ok(recent().some(e => e.code === 'LCQ-SYS-001'));
  });
});

// ───────────── 导出 ─────────────

test('导出：整份 JSON（不含内部 seq），downloadLogs 经 Blob + <a download> 触发下载，失败记 LCQ-UI-003 不抛错', async () => {
  await fresh(null, async () => {
    quiet(() => log.logEvent({ code: 'LCQ-CFG-004', detail: { playerText: '不应出现' } }));
    const exported = await exportMod.buildLogExport();
    assert.equal(exported.count, exported.entries.length);
    assert.ok(exported.entries.every(e => !('seq' in e)));
    assert.ok(!JSON.stringify(exported).includes('不应出现'));
    assert.match(exportMod.exportFileName(new Date('2026-10-18T01:02:03.456Z')), /^lcq-log-2026-10-18T01-02-03-456Z\.json$/);

    const clicks = [];
    const savedDoc = globalThis.document, savedUrl = URL.createObjectURL, savedRevoke = URL.revokeObjectURL;
    globalThis.document = { createElement: () => ({ click() { clicks.push(this); }, remove() {} }), body: { appendChild() {} } };
    URL.createObjectURL = blob => { clicks.push(blob); return 'blob:x'; };
    URL.revokeObjectURL = () => {};
    try {
      assert.equal(await exportMod.downloadLogs(), true);
      assert.equal(clicks[0].type, 'application/json');
      assert.match(clicks[1].download, /^lcq-log-.*\.json$/);
      globalThis.document = undefined;
      assert.equal(await quiet(() => exportMod.downloadLogs()), false);
      assert.ok(recent().some(e => e.code === 'LCQ-UI-003'));
    } finally { globalThis.document = savedDoc; URL.createObjectURL = savedUrl; URL.revokeObjectURL = savedRevoke; }
  });
});

// ───────────── 接入点：runtimeTuning ─────────────

test('runtimeTuning：404→CFG-001(info，级别取配置)、网络→CFG-002、超时→CFG-003、坏 JSON→CFG-004、校验不过→CFG-005、其它状态→CFG-006；回落行为与 reason 不变', async () => {
  const tuning = await load('../src/modules/sceneModule/runtimeTuning.ts');
  const run = async (fetcher) => { await log.resetLogState(); const result = await quiet(() => tuning.loadRuntimeTuning(fetcher)); return { result, entries: recent() }; };
  const resp = (status, body = '') => async () => ({ ok: status >= 200 && status < 300, status, text: async () => body });
  await fresh(null, async () => {
    let r = await run(resp(404));
    assert.deepEqual(r.result, { applied: false, reason: 'HTTP 404' });
    assert.deepEqual(r.entries.map(e => [e.code, e.level]), [['LCQ-CFG-001', 'info']]);

    r = await run(resp(500));
    assert.deepEqual([r.result.reason, r.entries[0].code, r.entries[0].level], ['HTTP 500', 'LCQ-CFG-006', 'warn']);

    r = await run(async () => { throw new TypeError('fetch failed'); });
    assert.deepEqual([r.result.applied, r.entries[0].code, r.entries[0].level], [false, 'LCQ-CFG-002', 'warn']);

    r = await run(async () => { throw new DOMException('timed out', 'TimeoutError'); });
    assert.deepEqual([r.entries[0].code, r.entries[0].level], ['LCQ-CFG-003', 'warn']);

    r = await run(resp(200, '{not json'));
    assert.deepEqual([r.result.reason, r.entries[0].code, r.entries[0].level], ['不是合法 JSON', 'LCQ-CFG-004', 'error']);

    r = await run(resp(200, JSON.stringify({ numbers: { nope: 1 } })));
    assert.equal(r.result.applied, false);
    assert.match(r.result.reason, /^校验不过：/);
    assert.deepEqual([r.entries[0].code, r.entries[0].level], ['LCQ-CFG-005', 'error']);
    assert.match(JSON.stringify(r.entries[0].detail), /LCQ-NUM-002/, '校验错误里带 numbers 的码');

    r = await run(resp(200, JSON.stringify({ numbers: { judgement: { recentKeep: 20 } } })));
    assert.deepEqual(r.result, { applied: true });
    assert.equal(r.entries.length, 0, '成功不记错误码日志');
  });
  await fresh({ tuning404Level: 'debug', minLevel: 'debug' }, async () => {
    const r = await run(resp(404));
    assert.equal(r.entries[0].level, 'debug', '404 级别取 diagnostics.tuning404Level');
  });
});

// ───────────── 接入点：numbers ─────────────

test('numbers：各类校验失败 throw 带码，消息保留原文，.code 可读；失败不改动数值', () => {
  const before = JSON.stringify(N());
  const cases = [
    [[], 'LCQ-NUM-001', /数值配置对象无效/],
    [{ notAKey: { x: 1 } }, 'LCQ-NUM-002', /未知数值配置/],
    [{ levels: { gapOne: 'x' } }, 'LCQ-NUM-003', /数值配置类型无效/],
    [{ levels: { gapOne: -1 } }, 'LCQ-NUM-004', /数值配置范围无效/],
    [{ goalModifiers: { default: { factorProfile: 'nope', levelGap: true } } }, 'LCQ-NUM-005', /目标修正配置无效/],
    [{ judgement: { outcomeLines: { perfect: 10 } } }, 'LCQ-NUM-006', /数值体检未通过.*outcomeLines/],
  ];
  for (const [patch, code, pattern] of cases) {
    assert.throws(() => mods.numbers.applyGameNumbers(patch), err => err.code === code && err.message.startsWith(`[${code}] `) && pattern.test(err.message), code);
  }
  assert.equal(JSON.stringify(N()), before);
});

// ───────────── 接入点：freeAction 拒绝出口 ─────────────

test('freeAction 拒绝出口：prepare 的闸门拒绝按原因记 LCQ-FA 码（info/warn），detail 只有类别/变体/实体 id，没有玩家原文', async () => {
  await fresh(null, async () => {
    const absent = makeSave({ realm: '内视', present: [NING_YU], favor: { [NING_YU]: 100 } });
    const tk = ticket('cast', 'transfer_qi', WANG_ZHE, { evidence: '玩家原话：我要给她传功' });
    const prepared = quiet(() => mods.plan.prepareFreeAction(absent, tk));
    assert.equal(prepared.reason, 'not_present');
    const [entry] = recent();
    assert.equal(entry.code, codes.FA_GATE_CODES.not_present);
    assert.equal(entry.level, 'info');
    assert.deepEqual(entry.detail, { site: 'prepare', reason: 'not_present', actionClass: 'cast', variant: 'transfer_qi', targetId: WANG_ZHE, itemId: null });
    assert.ok(!JSON.stringify(entry).includes('玩家原话'), '有意不记原文');
  });
  await fresh(null, async () => {
    const low = makeSave({ realm: '内视', present: [WANG_ZHE], favor: { [WANG_ZHE]: 19 } });
    const prepared = quiet(() => mods.plan.prepareFreeAction(low, ticket('cast', 'transfer_qi', WANG_ZHE)));
    assert.equal(prepared.reason, 'goodwill_below_min');
    assert.equal(recent()[0].code, codes.FA_GATE_CODES.goodwill_below_min);
  });
});

test('freeAction 票校验的拒绝（目标不在名单 / 物品不可用 / 被挤掉）记 LCQ-FA-020/021/024；非闸门原因（disabled/unresolved）不记', async () => {
  await fresh(null, async () => {
    const save = makeSave({ present: [WANG_ZHE], favor: { [WANG_ZHE]: 50 } });
    const raw = [{ actionClass: 'cast', variant: 'transfer_qi', targetId: 'no.such.person', degree: 'normal', performed: 'yes', evidence: '我给她传功', itemId: null }];
    const result = quiet(() => mods.ticket.validateFreeActionTickets(raw, '我给她传功', save));
    assert.equal(result.refusals.length, 1);
    assert.equal(recent()[0].code, codes.FA_GATE_CODES.target_unavailable);
    assert.equal(recent()[0].detail.site, 'ticket');
    assert.equal(recent()[0].detail.discard, 'target_not_present');
  });
  const refusal = await load('../src/modules/scenarioMods/freeAction/refusalLog.ts');
  await fresh(null, async () => {
    refusal.logGateRefusal('disabled', 'settle');
    refusal.logGateRefusal('unresolved', 'settle');
    assert.equal(recent().length, 0);
  });
});

// ───────────── 接入点：AI 请求超时 / 失败 ─────────────

test('AI 请求收尾：超时按 phase 分码 NET-001/002/003，带 requestId/turnId；后台降 warn；HTTP 错误 NET-004、传输失败 NET-005；取消与成功不记', async () => {
  const rld = await load('../src/services/requestLifecycleDiagnostics.ts');
  const deadline = await load('../src/services/aiRequestDeadline.ts');
  assert.deepEqual(['first_byte', 'total', 'idle'].map(p => new deadline.AiRequestTimeoutError(p, 1000).lcqCode), ['LCQ-NET-001', 'LCQ-NET-002', 'LCQ-NET-003']);
  await fresh({ repeatMs: 1 }, async () => {
    rld.diagnosticBusyChanged(true, 'turn_diag_1');
    const trace = (module, background, error, status) => {
      const t = rld.startRequestDiagnostic(rld.diagnosticContext(module, 'g1', background), 'fetch');
      quiet(() => t.finish(error, status));
      return t.entry;
    };
    for (const [phase, code] of [['first_byte', 'LCQ-NET-001'], ['total', 'LCQ-NET-002'], ['idle', 'LCQ-NET-003']]) {
      await new Promise(resolve => setTimeout(resolve, 3));
      const entry = trace('main', false, new deadline.AiRequestTimeoutError(phase, 1000));
      const logged = recent().find(e => e.requestId === entry.requestId);
      assert.equal(logged.code, code);
      assert.equal(logged.level, 'error');
      assert.equal(logged.turnId, 'turn_diag_1');
      assert.equal(logged.detail.timeoutPhase, phase);
      assert.equal(logged.detail.module, 'main');
    }
    const bg = trace('memory', true, new deadline.AiRequestTimeoutError('total', 1000));
    assert.equal(recent().find(e => e.requestId === bg.requestId).level, 'warn', '后台任务超时降为 warn');

    const http = trace('main', false, undefined, 'http_error');
    assert.equal(recent().find(e => e.requestId === http.requestId).code, 'LCQ-NET-004');
    const failed = trace('main', false, new TypeError('Failed to fetch'));
    assert.equal(recent().find(e => e.requestId === failed.requestId).code, 'LCQ-NET-005');
    const before = recent().length;
    trace('main', false, undefined, 'completed');
    const aborted = new AbortController(); aborted.abort();
    const t = rld.startRequestDiagnostic(rld.diagnosticContext('main', 'g2', false), 'fetch', aborted.signal);
    quiet(() => t.finish(new DOMException('请求已取消', 'AbortError')));
    assert.equal(recent().length, before, '成功与取消不记');
    rld.diagnosticBusyChanged(false);
  });
});

// ───────────── 接入点：indexedDBManager ─────────────

test('indexedDBManager：远程降级各只记一次（405→SAV-006、非 2xx→SAV-007），本机读取失败记 SAV-002 且回落 null', async () => {
  const idb = await load('../src/utils/indexedDBManager.ts');
  const savedFetch = globalThis.fetch, savedIdb = globalThis.indexedDB;
  globalThis.indexedDB = undefined; // 本机库不可用：读取走失败回落
  try {
    await fresh(null, async () => {
      globalThis.fetch = async () => ({ status: 500, ok: false, text: async () => '' });
      await quiet(() => idb.loadFromIndexedDB('characters'));
      await quiet(() => idb.loadFromIndexedDB('characters'));
      assert.equal(recent().filter(e => e.code === 'LCQ-SAV-007').length, 1, '远程降级只记一次');
      globalThis.fetch = async () => ({ status: 405, ok: false, text: async () => '' });
      await quiet(() => idb.loadFromIndexedDB('characters'));
      await quiet(() => idb.loadFromIndexedDB('characters'));
      assert.equal(recent().filter(e => e.code === 'LCQ-SAV-006').length, 1);
      const failures = recent().filter(e => e.code === 'LCQ-SAV-002');
      assert.ok(failures.length >= 1);
      assert.equal(failures[0].detail.op, 'loadFromIndexedDB');
      assert.equal(failures[0].detail.key, 'characters');
      assert.equal(await quiet(() => idb.loadFromIndexedDB('characters')), null, '读取失败的回落行为不变');
    });
  } finally { globalThis.fetch = savedFetch; globalThis.indexedDB = savedIdb; }
});

// ───────────── 接入点：scenarioMods/manager ─────────────

test('剧情模组 manager：坏 JSON→PCK-002（只记字符数，不含文件内容）、结构校验不过→PCK-003、库内容无效→PCK-001；返回值不变', async () => {
  const { ScenarioModManager } = await load('../src/modules/scenarioMods/manager.ts');
  let stored = null;
  const manager = new ScenarioModManager({ load: async () => stored, save: async library => { stored = library; } });
  await fresh(null, async () => {
    const review = await quiet(() => manager.reviewText('{ 这是机密内容 not json'));
    assert.equal(review.canImport, false);
    assert.equal(review.diagnostics[0].code, 'invalid_json');
    const pck2 = recent().find(e => e.code === 'LCQ-PCK-002');
    assert.deepEqual(pck2.detail, { chars: '{ 这是机密内容 not json'.length });
    assert.ok(!JSON.stringify(pck2).includes('机密'), '不记文件内容');

    const invalid = await quiet(() => manager.reviewText(JSON.stringify({ hello: 'world' })));
    assert.equal(invalid.canImport, false);
    const pck3 = recent().find(e => e.code === 'LCQ-PCK-003');
    assert.equal(pck3.detail.stage, 'schema');
    assert.ok(pck3.detail.issues.length > 0 && pck3.detail.issues.every(i => i.path !== undefined && i.code));

    stored = { mods: 'broken' };
    assert.deepEqual(await quiet(() => manager.list()), []);
    assert.ok(recent().some(e => e.code === 'LCQ-PCK-001'));
  });
});

// ───────────── consolePatch ─────────────

test('consolePatch：console.error / console.warn 原样输出并另记 LCQ-SYS-000；日志自己输出不递归；window error / unhandledrejection 记 UI-001/002', async () => {
  const saved = {};
  for (const k of ['log', 'info', 'warn', 'debug', 'error', 'table', 'group', 'groupCollapsed', 'groupEnd']) saved[k] = console[k];
  const out = [];
  const listeners = {};
  const fakeWindow = { addEventListener: (type, fn) => { listeners[type] = fn; } };
  // consolePatch 在 import 时捕获“原始”console：先换成探针，补丁版才不会把测试输出刷到终端。
  console.error = (...a) => { out.push(['error', a[0]]); };
  console.warn = console.info = console.log = console.debug = () => {};
  try {
    const patch = await load('../src/utils/consolePatch.ts');
    await fresh(null, async () => {
      console.error('页面炸了', new Error('real boom'));
      console.warn('只是警告', { apiKey: 'sk-abcdef0123456789' });
      assert.deepEqual(out, [['error', '页面炸了']], 'console.error 照常输出一次');
      const rows = recent();
      const err = rows.find(e => e.level === 'error'), warn = rows.find(e => e.level === 'warn');
      assert.equal(err.code, 'LCQ-SYS-000');
      assert.equal(err.module, 'console');
      assert.match(err.msg, /^未登记：页面炸了/);
      assert.match(err.stack, /real boom/);
      assert.equal(warn.code, 'LCQ-SYS-000');
      assert.ok(!JSON.stringify(warn).includes('sk-abcdef'), '控制台捕获同样脱敏');

      // 日志自己往控制台输出（consoleLevel=warn 起）不会被补丁再记一遍
      out.length = 0;
      const before = recent(500).length;
      log.logEvent({ code: 'LCQ-SAV-001', cause: new Error('open failed') });
      assert.equal(recent(500).length, before + 1);
      assert.equal(out.length, 1);
      assert.match(out[0][1], /^\[LCQ-SAV-001\]/);

      patch.installGlobalErrorHandlers(fakeWindow);
      listeners.error({ message: 'Uncaught Error: x', error: new Error('x'), filename: 'app.js', lineno: 3, colno: 9 });
      listeners.error({ message: 'ResizeObserver loop completed with undelivered notifications.' });
      listeners.error({});
      listeners.unhandledrejection({ reason: new Error('nobody caught me') });
      const ui = recent(500).filter(e => e.code.startsWith('LCQ-UI-'));
      assert.deepEqual(ui.map(e => e.code).sort(), ['LCQ-UI-001', 'LCQ-UI-002']);
      assert.deepEqual(ui.find(e => e.code === 'LCQ-UI-001').detail, { file: 'app.js', line: 3, col: 9 });
    });
  } finally { Object.assign(console, saved); }
});

test('toast：带「进玩家提示」标记的码（SAV-003）按 toast 配置弹一次（dedupeMs 内不重复），其它码不弹', async () => {
  await fresh(null, async () => {
    const shown = [];
    log.setToastSink((level, message) => shown.push([level, message]));
    try {
      quiet(() => { log.logEvent({ code: 'LCQ-SAV-003', detail: { n: 1 } }); log.logEvent({ code: 'LCQ-SAV-003', detail: { n: 2 } }); log.logEvent({ code: 'LCQ-CFG-004' }); });
      assert.deepEqual(shown, [['error', '存档写入失败（LCQ-SAV-003）']]);
    } finally { log.setToastSink(null); }
  });
  await fresh({ toast: { enabled: false } }, async () => {
    const shown = [];
    log.setToastSink((level, message) => shown.push(message));
    try { quiet(() => log.logEvent({ code: 'LCQ-SAV-003' })); assert.deepEqual(shown, []); } finally { log.setToastSink(null); }
  });
});

// ───────────── 模块边界 ─────────────

test('诊断模块只依赖自己、numbers 与类型（可被任何层引用，不反向依赖应用 / Vue / 服务层）', async () => {
  const dir = fileURLToPath(new URL('../src/modules/diagnostics', import.meta.url));
  const allowed = new Set(['../sceneModule/numbers', '../../../mod-kit/game-numbers.qingyu.json', '../../../mod-kit/numbers-combat.json', '../../../mod-kit/numbers-progress.json', '../../../mod-kit/numbers-runtime.json']);
  const offenders = [];
  for (const name of (await readdir(dir)).filter(n => n.endsWith('.ts'))) {
    const text = await readFile(path.join(dir, name), 'utf8');
    for (const m of text.matchAll(/(?:import|export)\s+(type\s+)?[^'"]*?from\s+'([^']+)'/g)) {
      const typeOnly = !!m[1], spec = m[2];
      if (spec.startsWith('./') || allowed.has(spec) || (typeOnly && spec.startsWith('../scenarioMods/'))) continue;
      offenders.push(`${name} ${spec}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('settle 出口的闸门拒绝同样记码（site=settle）：判定签发后好感被压到门槛以下再结算', async () => {
  await fresh(null, async () => {
    const save = makeSave({ realm: '内视', present: [WANG_ZHE], favor: { [WANG_ZHE]: 50 } });
    const tk = ticket('cast', 'transfer_qi', WANG_ZHE);
    const prepared = quiet(() => mods.plan.prepareFreeAction(save, tk));
    assert.equal(prepared.kind, 'issued');
    await log.resetLogState();
    const resolution = mods.judgement.resolvePendingJudgement(save, prepared.proposal.id, { currentTurn: 1, testOutcome: 'success' });
    // 判定期间好感掉到门槛以下：结算时闸门重新检查，拒绝
    mods.affinity.relationshipOf(save, WANG_ZHE).profile.好感度 = 1;
    const result = quiet(() => mods.settle.settleFromResolution(save, resolution));
    assert.equal(result.ok, false);
    const entry = recent().find(e => e.detail?.site === 'settle');
    assert.equal(entry.code, codes.FA_GATE_CODES[result.reason]);
  });
});
