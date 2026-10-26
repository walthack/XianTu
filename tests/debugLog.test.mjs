// 调试日志大类开关（debugLog / debugEnabled）：默认全关、热改即时生效、脱敏、永不抛错；
// 错误码与持久日志（logEvent / logError）不受大类开关影响；大类表与 docs/DEBUG-LOG.md 互相校验。
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), clear: () => values.clear(),
  };
}
const { loadTs } = await import('./loadTs.mjs');

const root = fileURLToPath(new URL('..', import.meta.url));
const readJson = rel => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));
const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const cfgMod = await loadTs('../src/modules/diagnostics/config.ts');
const cats = await loadTs('../src/modules/diagnostics/debugCategories.ts');
const dbg = await loadTs('../src/modules/diagnostics/debugLog.ts');
const log = await loadTs('../src/modules/diagnostics/log.ts');
const storeMod = await loadTs('../src/modules/diagnostics/store.ts');

const IDS = ['identity', 'story', 'narrative', 'freeAction', 'combat', 'npc', 'growth', 'world', 'init', 'ai', 'memory', 'save', 'content', 'ui', 'perf'];
const allCategories = value => Object.fromEntries(IDS.map(id => [id, value]));
const categories = () => numbers.GAME_NUMBERS.diagnostics.debug.categories;

/** 改大类开关的用例必须还原（整段 diagnostics 走 applyGameNumbers 合并回去），并清日志状态与登记出口。 */
async function withCategories(patch, fn) {
  const before = structuredClone(numbers.GAME_NUMBERS.diagnostics);
  await log.resetLogState();
  try {
    if (patch) numbers.applyGameNumbers({ diagnostics: { debug: { categories: patch } } });
    return await fn();
  } finally {
    numbers.applyGameNumbers({ diagnostics: before });
    dbg.setDebugConsole(null);
    await log.resetLogState();
  }
}
const sink = () => { const out = []; const fn = (...args) => out.push(args); fn.out = out; return fn; };
const quietConsole = async fn => {
  const saved = {};
  for (const k of ['log', 'info', 'warn', 'debug', 'error']) { saved[k] = console[k]; console[k] = () => {}; }
  try { return await fn(); } finally { Object.assign(console, saved); }
};

test('大类默认全关且键集合等于 DEBUG_CATEGORY_IDS', () => {
  assert.deepEqual([...cats.DEBUG_CATEGORY_IDS], IDS, '大类定稿 15 个，增删须用户拍板');
  assert.deepEqual([...dbg.DEBUG_CATEGORY_IDS], IDS);
  for (const tree of [readJson('mod-kit/numbers-runtime.json'), readJson('mod-kit/game-numbers.qingyu.json'), structuredClone(numbers.GAME_NUMBERS)]) {
    assert.deepEqual(Object.keys(tree.diagnostics.debug.categories), IDS);
    assert.ok(Object.values(tree.diagnostics.debug.categories).every(v => v === false), '默认全关');
    assert.deepEqual(Object.keys(tree.diagnostics.debug).sort(), ['categories', 'note'], '不加总开关、级别等其它键');
  }
  assert.deepEqual(cfgMod.validateDiagnosticsConfig(), []);
  for (const id of IDS) assert.equal(dbg.debugEnabled(id), false);
});

test('大类关时不输出且不求值 data 回调', async () => {
  await withCategories(null, async () => {
    const out = sink(); let called = false;
    dbg.setDebugConsole(out);
    const savedDebug = console.debug, direct = [];
    console.debug = (...a) => direct.push(a);
    try {
      dbg.debugLog('identity', '关着', () => { called = true; return { a: 1 }; });
      dbg.debugLog('identity', '关着', { a: 1 });
    } finally { console.debug = savedDebug; }
    assert.equal(called, false, '关着时不求值');
    assert.deepEqual(out.out, []);
    assert.deepEqual(direct, []);
  });
});

test('大类开时经登记出口输出 [dbg:<id>] 前缀且 data 已脱敏', async () => {
  await withCategories({ identity: true }, async () => {
    const out = sink();
    dbg.setDebugConsole(out);
    const savedDebug = console.debug, direct = [];
    console.debug = (...a) => direct.push(a);
    try {
      dbg.debugLog('identity', '账本写入', () => ({ apiKey: 'sk-abcdef0123456789', note: '带 Bearer abcdefgh12345678 的串', n: 3 }));
      dbg.debugLog('identity', '只有一行');
    } finally { console.debug = savedDebug; }
    assert.deepEqual(direct, [], '登记了出口就不走 console.debug');
    assert.equal(out.out.length, 2);
    assert.equal(out.out[0][0], '[dbg:identity] 账本写入');
    assert.deepEqual(out.out[0][1], { apiKey: '[已脱敏]', note: '带 [已脱敏] 的串', n: 3 });
    assert.deepEqual(out.out[1], ['[dbg:identity] 只有一行'], '没有 data 时只打一行');

    // 没登记出口（node 测试、试玩页没加载 consolePatch）退回调用当时的 console.debug
    dbg.setDebugConsole(null);
    console.debug = (...a) => direct.push(a);
    try { dbg.debugLog('identity', '退回', { x: 1 }); } finally { console.debug = savedDebug; }
    assert.deepEqual(direct, [['[dbg:identity] 退回', { x: 1 }]]);
  });
});

test('玩家原文类字段只留长度', async () => {
  await withCategories({ freeAction: true }, async () => {
    const out = sink();
    dbg.setDebugConsole(out);
    dbg.debugLog('freeAction', '玩家输入', { playerText: '我要拜师学艺', input: '先去渡口', nested: { content: '一二三' }, kind: 'cast' });
    assert.deepEqual(out.out[0][1], { playerText: '[文本已省略，6字]', input: '[文本已省略，4字]', nested: { content: '[文本已省略，3字]' }, kind: 'cast' });
    assert.ok(!JSON.stringify(out.out).includes('拜师'), '原文不出现在调试输出里');
  });
});

test('热改单类开启即时生效其它类不变', async () => {
  await withCategories(null, async () => {
    const out = sink();
    dbg.setDebugConsole(out);
    dbg.debugLog('story', '改前');
    numbers.applyGameNumbers({ diagnostics: { debug: { categories: { story: true } } } });
    assert.equal(dbg.debugEnabled('story'), true);
    for (const id of IDS.filter(id => id !== 'story')) assert.equal(dbg.debugEnabled(id), false, id);
    dbg.debugLog('story', '改后');
    dbg.debugLog('ai', '别的类');
    assert.deepEqual(out.out, [['[dbg:story] 改后']]);
    numbers.applyGameNumbers({ diagnostics: { debug: { categories: { story: false } } } });
    dbg.debugLog('story', '再关');
    assert.equal(out.out.length, 1);
  });
});

test('未知大类/缺类/非布尔值体检拒绝并整份退回', async () => {
  const base = structuredClone(cfgMod.diagnosticsConfig());
  const withCats = c => ({ ...structuredClone(base), debug: { ...base.debug, categories: c } });
  const extra = cfgMod.validateDiagnosticsConfig(withCats({ ...allCategories(false), quest: false }));
  assert.ok(extra.some(e => /未知大类：quest/.test(e) && /增类须用户拍板/.test(e)), extra.join('；'));
  const { perf, ...noPerf } = allCategories(false);
  const missing = cfgMod.validateDiagnosticsConfig(withCats(noPerf));
  assert.ok(missing.some(e => /缺大类：perf/.test(e) && /增类须用户拍板/.test(e)), missing.join('；'));
  assert.ok(cfgMod.validateDiagnosticsConfig(withCats({ ...allCategories(false), ui: 'yes' })).some(e => /须为布尔：ui/.test(e)));
  assert.ok(cfgMod.validateDiagnosticsConfig(withCats(null)).some(e => /须为对象/.test(e)));
  assert.ok(cfgMod.validateDiagnosticsConfig({ ...structuredClone(base), debug: undefined }).some(e => /须为对象/.test(e)));
  assert.ok(cfgMod.validateDiagnosticsConfig({ ...structuredClone(base), enabled: false }).some(e => /enabled 须为 true/.test(e)), 'diagnostics.enabled 锁死 true');

  // 热改：未知大类 / 非布尔值在合并时就拒绝；体检不过（enabled=false）整份退回，同一份里的大类开关也不生效
  const snapshot = structuredClone(numbers.GAME_NUMBERS.diagnostics);
  assert.throws(() => numbers.applyGameNumbers({ diagnostics: { debug: { categories: { quest: true } } } }), err => err.code === 'LCQ-NUM-002');
  assert.throws(() => numbers.applyGameNumbers({ diagnostics: { debug: { categories: { ui: 'yes' } } } }), err => err.code === 'LCQ-NUM-003');
  assert.throws(() => numbers.applyGameNumbers({ diagnostics: { enabled: false, debug: { categories: { identity: true } } } }), err => err.code === 'LCQ-NUM-006' && /enabled/.test(err.message));
  assert.deepEqual(structuredClone(numbers.GAME_NUMBERS.diagnostics), snapshot, '整份退回');
  assert.equal(dbg.debugEnabled('identity'), false);

  // 缺类走同一条 LCQ-NUM-006 链路（冷数据被改坏后任何热改都过不了体检）
  delete categories().perf;
  try {
    assert.throws(() => numbers.applyGameNumbers({ diagnostics: { debug: { categories: { identity: true } } } }), err => err.code === 'LCQ-NUM-006' && /缺大类：perf/.test(err.message));
    assert.equal(categories().identity, false);
  } finally { categories().perf = false; }
  assert.deepEqual(cfgMod.validateDiagnosticsConfig(), []);
});

test('大类全关时 logError 照样进 store 落盘打控制台', async () => {
  await withCategories(allCategories(false), async () => {
    const printed = [], saved = console.error;
    console.error = (...a) => printed.push(a[0]);
    let entry;
    try { entry = log.logError('LCQ-SAV-003', new Error('disk full'), { detail: { op: 'put' } }); } finally { console.error = saved; }
    assert.ok(entry, 'logError 不读大类开关');
    assert.equal(entry.code, 'LCQ-SAV-003');
    assert.ok(storeMod.logStore.recent(50).some(e => e.code === 'LCQ-SAV-003'), '进内存环形缓冲');
    assert.deepEqual(printed, ['[LCQ-SAV-003] 存档写入失败：disk full'], '打控制台');
    await storeMod.logStore.flush();
    const disk = JSON.parse(globalThis.localStorage.getItem(storeMod.LOG_FALLBACK_KEY) || '[]');
    assert.ok(disk.some(e => e.code === 'LCQ-SAV-003'), '落盘（node 下降级到 localStorage 后端）');
  });
});

test('大类全开时 logEvent 条目与级别线不变', async () => {
  const strip = ({ ts, seq, sessionId, ...rest }) => rest;
  const run = async () => {
    const printed = [];
    const saved = { error: console.error, warn: console.warn, info: console.info, debug: console.debug };
    console.error = (...a) => printed.push(['error', a[0]]); console.warn = (...a) => printed.push(['warn', a[0]]);
    console.info = (...a) => printed.push(['info', a[0]]); console.debug = (...a) => printed.push(['debug', a[0]]);
    let entries;
    try {
      entries = [
        log.logEvent({ code: 'LCQ-CFG-001' }),
        log.logEvent({ code: 'LCQ-CFG-002', detail: { apiKey: 'sk-abcdef0123456789' } }),
        log.logError('LCQ-SAV-003', new Error('boom')),
        log.logEvent({ code: 'LCQ-SAV-003', level: 'debug' }),
      ].map(e => e && strip(e));
    } finally { Object.assign(console, saved); }
    const stored = storeMod.logStore.recent(50).filter(e => e.code !== 'LCQ-SYS-001').map(strip);
    return { entries, printed, stored };
  };
  const off = await withCategories(allCategories(false), run);
  const on = await withCategories(allCategories(true), run);
  for (const r of [off, on]) for (const e of r.entries.filter(Boolean)) delete e.stack;
  for (const r of [off, on]) for (const e of r.stored) delete e.stack;
  assert.deepEqual(on.entries, off.entries);
  assert.deepEqual(on.printed, off.printed);
  assert.deepEqual(on.stored, off.stored);
  assert.equal(off.entries[3], null, 'debug 低于 minLevel 照旧丢弃');
  assert.deepEqual(off.printed.map(p => p[0]), ['warn', 'error'], 'consoleLevel 照旧');
});

test('debugLog 不写 logStore 不弹 toast 不产生 LCQ-SYS-000', async () => {
  await withCategories(allCategories(true), async () => {
    const toasts = [];
    log.setToastSink((level, message) => toasts.push([level, message]));
    try {
      const before = storeMod.logStore.recent(500).length;
      const out = sink();
      dbg.setDebugConsole(out);
      for (const id of IDS) dbg.debugLog(id, `大类 ${id}`, { id });
      // 没登记出口时退回 console.debug；consolePatch 改写过的 debug 不记 SYS-000，这里同样只打不记
      dbg.setDebugConsole(null);
      await quietConsole(() => dbg.debugLog('ui', '退回出口'));
      await storeMod.logStore.flush();
      assert.equal(out.out.length, IDS.length);
      assert.equal(storeMod.logStore.recent(500).length, before, '不进环形缓冲');
      assert.ok(!storeMod.logStore.recent(500).some(e => e.code === 'LCQ-SYS-000'));
      assert.deepEqual(toasts, []);
      const disk = JSON.parse(globalThis.localStorage.getItem(storeMod.LOG_FALLBACK_KEY) || '[]');
      assert.ok(!disk.some(e => /\[dbg:/.test(e.msg ?? '')), '不落盘');
    } finally { log.setToastSink(null); }
  });
});

test('debugLog 永不抛错（回调抛错/循环引用/出口抛错）', async () => {
  await withCategories({ combat: true }, async () => {
    const out = sink();
    dbg.setDebugConsole(out);
    const cyc = { name: 'c' }; cyc.self = cyc;
    assert.doesNotThrow(() => dbg.debugLog('combat', '回调抛错', () => { throw new Error('bad data'); }));
    assert.doesNotThrow(() => dbg.debugLog('combat', '循环引用', cyc));
    assert.doesNotThrow(() => dbg.debugLog('combat', '取值抛错', { get boom() { throw new Error('getter'); } }));
    assert.doesNotThrow(() => dbg.debugLog('combat', { toString() { throw new Error('msg'); } }));
    assert.deepEqual(out.out[0], ['[dbg:combat] 回调抛错', '[调试数据求值失败：bad data]']);
    assert.equal(out.out[1][1].self, '[循环引用]');
    dbg.setDebugConsole(() => { throw new Error('sink down'); });
    assert.doesNotThrow(() => dbg.debugLog('combat', '出口抛错', { a: 1 }));
    dbg.setDebugConsole(null);
    const savedDebug = console.debug;
    console.debug = undefined;
    try { assert.doesNotThrow(() => dbg.debugLog('combat', '没有 console.debug')); } finally { console.debug = savedDebug; }
    assert.doesNotThrow(() => dbg.debugEnabled('nope'));
    assert.equal(dbg.debugEnabled('nope'), false);
  });
});

test('categoryOfFile 按最长前缀归类', () => {
  const cases = {
    'src/modules/scenarioMods/identityLedger.ts': 'identity',
    'src/modules/scenarioMods/ledger/affinityIdentity.ts': 'identity',
    'src/modules/scenarioMods/runtime.ts': 'story',
    'src/modules/scenarioMods/storyContext.ts': 'narrative',
    'src/modules/scenarioMods/farewellReplyGuard.ts': 'narrative',
    'src/modules/scenarioMods/canonGuard.ts': 'content',
    'src/modules/scenarioMods/freeAction/plan.ts': 'freeAction',
    'src/modules/sceneModule/host/controller.ts': 'combat',
    'src/modules/sceneModule/numbers.ts': 'content',
    'src/modules/sceneModule/numbersRegistry.ts': 'content',
    'src/modules/sceneModule/runtimeTuning.ts': 'content',
    'src/data/specialNpcs.ts': 'npc',
    'src/data/itemQuality.ts': 'growth',
    'src/components/character-creation/LegacySaveMigrationModal.vue': 'save',
    'src/components/character-creation/CharacterManagement.vue': 'init',
    'src/components/dashboard/SavePanel.vue': 'save',
    'src/components/dashboard/SettingsPanel.vue': 'ui',
    'src/views/CharacterCreation.vue': 'init',
    'src/views/GameView.vue': 'ui',
    'src/utils/AIBidirectionalSystem.ts': 'ai',
    'src/services/aiService.ts': 'ai',
    'src/modules/diagnostics/feedback.ts': 'ui',
    'src/modules/diagnostics/log.ts': 'perf',
    'src/utils/turnTelemetry.ts': 'perf',
  };
  for (const [file, id] of Object.entries(cases)) assert.equal(cats.categoryOfFile(file), id, file);
  assert.equal(cats.categoryOfFile('modules/sceneModule/numbers.ts'), 'content', '不带 src/ 前缀也认');
  assert.equal(cats.categoryOfFile('.\\src\\modules\\sceneModule\\numbers.ts'), 'content', 'Windows 路径也认');
  assert.equal(cats.categoryOfFile('src/nowhere/x.ts'), null);
  assert.equal(cats.categoryOfFile('src/modules/scenarioModsX/runtime.ts'), null, '目录前缀按整段目录匹配');

  // 现有源码全部有归属、没有并列最长；路径表每一条都至少命中一个文件（防止写错或过期）
  const files = execSync('git ls-files --cached --others --exclude-standard src', { cwd: root, encoding: 'utf8' }).split('\n')
    .filter(f => /\.(ts|tsx|vue|js|mjs)$/.test(f) && !/(\.test\.|\.spec\.|__tests__)/.test(f));
  const uncovered = [], ties = [], hit = new Set();
  for (const file of files) {
    const matches = cats.categoryMatches(file);
    for (const m of matches) hit.add(m.pattern);
    if (!matches.length) uncovered.push(file);
    else if (matches[1] && matches[1].weight === matches[0].weight && matches[1].id !== matches[0].id) ties.push(`${file}：${matches[0].pattern} / ${matches[1].pattern}`);
  }
  assert.deepEqual(uncovered, [], '没归类的文件：按调用方的大类补进 debugCategories.ts 路径表，不新开类');
  assert.deepEqual(ties, [], '并列最长前缀：写出更具体的文件模式');
  const stale = cats.DEBUG_CATEGORIES.flatMap(c => c.paths.filter(p => !hit.has(p)).map(p => `${c.id} ${p}`));
  assert.deepEqual(stale, [], '路径表里没命中任何文件的条目');
});

test('docs/DEBUG-LOG.md 大类表与 debugCategories.ts 一致', () => {
  const text = readFileSync(path.join(root, 'docs/DEBUG-LOG.md'), 'utf8');
  const section = text.split('## 大类表')[1].split('\n## ')[0];
  const rows = section.split('\n').filter(line => /^\| `[^`]+` \|/.test(line)).map(line => {
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    return { id: cells[0].replace(/`/g, ''), label: cells[1], paths: [...cells[2].matchAll(/`([^`]+)`/g)].map(m => m[1]), module: cells[3] };
  });
  assert.deepEqual(rows.map(r => r.id), IDS, '大类 id 与顺序一致');
  for (const c of cats.DEBUG_CATEGORIES) {
    const row = rows.find(r => r.id === c.id);
    assert.equal(row.label, c.label, `${c.id} 名称`);
    assert.deepEqual(row.paths, [...c.paths], `${c.id} 路径`);
    assert.ok(row.module, `${c.id} 对照码表 module 列不得为空（没有写 —）`);
  }
});
