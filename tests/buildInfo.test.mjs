// 版本号与构建号：scripts/buildInfo.cjs 生成函数、webpack 注入（只加载配置，不打包）、运行期读取与显示串、
// 日志导出 app 信息、存档写档盖章（游戏版本 / 内容包版本）与旧档缺字段容错。
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { loadTs } from './loadTs.mjs';

const require = createRequire(import.meta.url);
const buildInfo = require('../scripts/buildInfo.cjs');
const root = new URL('..', import.meta.url).pathname;
const catalogPath = path.join(root, 'src/modules/contentPacks/generated/catalog.json');

const GLOBALS = ['APP_VERSION', 'BUILD_ID', 'GIT_SHA', 'CONTENT_PACK_VERSION'];
async function withGlobals(values, fn) {
  const saved = Object.fromEntries(GLOBALS.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const k of GLOBALS) delete globalThis[k];
  Object.assign(globalThis, values);
  try { return await fn(); } finally {
    for (const k of GLOBALS) { delete globalThis[k]; if (saved[k]) Object.defineProperty(globalThis, k, saved[k]); }
  }
}

// ───────────── scripts/buildInfo.cjs ─────────────

test('formatBuildId：哈希-日期；脏工作区加 -dirty；无 git 回退 nogit-日期（脏标记不生效）', () => {
  assert.equal(buildInfo.formatBuildId({ sha: 'a1b2c3d', date: '20261018' }), 'a1b2c3d-20261018');
  assert.equal(buildInfo.formatBuildId({ sha: 'a1b2c3d', date: '20261018', dirty: true }), 'a1b2c3d-20261018-dirty');
  assert.equal(buildInfo.formatBuildId({ sha: '', date: '20261018' }), 'nogit-20261018');
  assert.equal(buildInfo.formatBuildId({ sha: '', date: '20261018', dirty: true }), 'nogit-20261018');
});

test('getBuildInfo：干净 / 脏 / git 抛错 / 非仓库空输出；日期按传入的 now 补零', () => {
  const now = new Date(2026, 0, 5, 12); // 本地时间 2026-01-05
  const runner = (porcelain) => (args) => (args[0] === 'rev-parse' ? 'a1b2c3d' : porcelain);
  assert.deepEqual(buildInfo.getBuildInfo({ now, run: runner('') }), { buildId: 'a1b2c3d-20260105', gitSha: 'a1b2c3d' });
  assert.deepEqual(buildInfo.getBuildInfo({ now, run: runner(' M src/a.ts') }), { buildId: 'a1b2c3d-20260105-dirty', gitSha: 'a1b2c3d' });
  const calls = [];
  buildInfo.getBuildInfo({ now, run: (args) => { calls.push(args); return args[0] === 'rev-parse' ? 'abc' : ''; } });
  assert.ok(calls.some(args => args[0] === 'status' && args.includes('--untracked-files=no')), '脏判定忽略未跟踪临时物');
  const throwing = () => { throw new Error('git: not found'); };
  assert.deepEqual(buildInfo.getBuildInfo({ now, run: throwing }), { buildId: 'nogit-20260105', gitSha: 'nogit' });
  assert.deepEqual(buildInfo.getBuildInfo({ now, run: () => '' }), { buildId: 'nogit-20260105', gitSha: 'nogit' });
});

test('getBuildInfo 真跑一次 git：形如 <短哈希>-YYYYMMDD[-dirty] 或 nogit-YYYYMMDD', () => {
  assert.match(buildInfo.getBuildInfo().buildId, /^(?:[0-9a-f]{7,}-\d{8}(?:-dirty)?|nogit-\d{8})$/);
});

test('readContentPackVersion：读 catalog.json 的 version；缺文件 / 坏 JSON / 无 version / 非字符串 / 空串 → unknown', () => {
  const real = JSON.parse(readFileSync(catalogPath, 'utf8')).version;
  assert.ok(typeof real === 'string' && real.length > 0);
  assert.equal(buildInfo.readContentPackVersion(), real);
  const dir = mkdtempSync(path.join(tmpdir(), 'buildinfo-'));
  const write = (name, text) => { const p = path.join(dir, name); writeFileSync(p, text); return p; };
  assert.equal(buildInfo.readContentPackVersion(path.join(dir, 'missing.json')), 'unknown');
  assert.equal(buildInfo.readContentPackVersion(write('bad.json', '{oops')), 'unknown');
  assert.equal(buildInfo.readContentPackVersion(write('nover.json', '{}')), 'unknown');
  assert.equal(buildInfo.readContentPackVersion(write('num.json', '{"version":3}')), 'unknown');
  assert.equal(buildInfo.readContentPackVersion(write('empty.json', '{"version":""}')), 'unknown');
  assert.equal(buildInfo.readContentPackVersion(write('ok.json', '{"version":"v9"}')), 'v9');
});

test('buildDefines：三个键，值是 JSON.stringify 后的字符串', () => {
  const defines = buildInfo.buildDefines({ now: new Date(2026, 9, 18), run: (args) => (args[0] === 'rev-parse' ? 'a1b2c3d' : '') });
  assert.deepEqual(Object.keys(defines).sort(), ['BUILD_ID', 'CONTENT_PACK_VERSION', 'GIT_SHA']);
  assert.equal(defines.BUILD_ID, '"a1b2c3d-20261018"');
  assert.equal(defines.GIT_SHA, '"a1b2c3d"');
  assert.equal(defines.CONTENT_PACK_VERSION, JSON.stringify(buildInfo.readContentPackVersion()));
});

// ───────────── 版本号与 webpack 注入（只实例化配置，不打包） ─────────────

test('package.json version 是 0.1.0', () => {
  assert.equal(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version, '0.1.0');
});

test('主配置与 8097 战斗试玩配置都注入 APP_VERSION / BUILD_ID / GIT_SHA / CONTENT_PACK_VERSION', async () => {
  const envBefore = { r: process.env.REMOTE_SAVE_STORAGE_ENABLED, b: process.env.BACKEND_BASE_URL };
  try {
    const main = (await import('../webpack.config.js')).default({}, { mode: 'production' });
    const trial = (await import('../webpack.combat-trial.config.js')).default({}, {});
    for (const [name, config] of [['主配置', main], ['战斗试玩', trial]]) {
      const defs = config.plugins.filter(p => p?.constructor?.name === 'DefinePlugin').map(p => p.definitions);
      const merged = Object.assign({}, ...defs);
      assert.equal(merged.APP_VERSION, '"0.1.0"', name);
      assert.match(JSON.parse(merged.BUILD_ID), /^(?:[0-9a-f]{7,}-\d{8}(?:-dirty)?|nogit-\d{8})$/, name);
      assert.ok(JSON.parse(merged.GIT_SHA).length > 0, name);
      assert.equal(merged.CONTENT_PACK_VERSION, JSON.stringify(buildInfo.readContentPackVersion()), name);
    }
  } finally {
    for (const [key, value] of [['REMOTE_SAVE_STORAGE_ENABLED', envBefore.r], ['BACKEND_BASE_URL', envBefore.b]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('env.d.ts 声明了新增的三个全局常量', () => {
  const text = readFileSync(path.join(root, 'src/env.d.ts'), 'utf8');
  for (const name of ['BUILD_ID', 'GIT_SHA', 'CONTENT_PACK_VERSION']) assert.match(text, new RegExp(`declare const ${name}: string;`));
});

// ───────────── 运行期读取 / 显示串 ─────────────

test('getBuildInfo（运行期）：未注入回退 unknown；注入后原样返回；显示串 v版本 (构建号) + 内容包版本', async () => {
  const mod = await loadTs('../src/modules/diagnostics/buildInfo.ts');
  await withGlobals({}, () => {
    assert.deepEqual(mod.getBuildInfo(), { version: 'unknown', buildId: 'unknown', gitSha: 'unknown', contentPackVersion: 'unknown' });
  });
  await withGlobals({ APP_VERSION: '0.1.0', BUILD_ID: 'a1b2c3d-20261018', GIT_SHA: 'a1b2c3d', CONTENT_PACK_VERSION: '990e8d35' }, () => {
    const info = mod.getBuildInfo();
    assert.deepEqual(info, { version: '0.1.0', buildId: 'a1b2c3d-20261018', gitSha: 'a1b2c3d', contentPackVersion: '990e8d35' });
    assert.equal(mod.formatVersionLabel(info), 'v0.1.0 (a1b2c3d-20261018)');
    assert.equal(mod.formatVersionDetail(info), 'v0.1.0 (a1b2c3d-20261018) · 内容包 990e8d35');
  });
});

test('三处版本显示（App / ModeSelection / LeftSidebar）统一走 formatVersionLabel，不再直接用 APP_VERSION', () => {
  for (const file of ['src/App.vue', 'src/views/ModeSelection.vue', 'src/components/dashboard/LeftSidebar.vue']) {
    const text = readFileSync(path.join(root, file), 'utf8');
    assert.match(text, /formatVersionLabel\(/, file);
    assert.doesNotMatch(text, /displayVersion|APP_VERSION/, file);
  }
});

// ───────────── 日志导出 ─────────────

test('buildLogExport：app 信息含 version / buildId / contentPackVersion', async () => {
  const exportMod = await loadTs('../src/modules/diagnostics/export.ts');
  await withGlobals({ APP_VERSION: '0.1.0', BUILD_ID: 'a1b2c3d-20261018', GIT_SHA: 'a1b2c3d', CONTENT_PACK_VERSION: '990e8d35' }, async () => {
    const exported = await exportMod.buildLogExport();
    assert.equal(exported.app, 'XianTu');
    assert.equal(exported.version, '0.1.0');
    assert.equal(exported.buildId, 'a1b2c3d-20261018');
    assert.equal(exported.contentPackVersion, '990e8d35');
    assert.equal(exported.count, exported.entries.length);
  });
});

// ───────────── 存档：写档盖章 + 旧档缺字段容错 ─────────────

const baseSave = (meta) => ({
  元数据: {
    版本号: 3, 存档ID: 'ver-test', 存档名: 'Ver Test',
    创建时间: '2026-06-22T00:00:00.000Z', 更新时间: '2026-06-22T00:00:00.000Z', 游戏时长秒: 0,
    时间: { 年: 16, 月: 1, 日: 1, 小时: 0, 分钟: 0 },
    ...meta,
  },
  角色: {
    身份: { 名字: '测试角色', 性别: '男', 种族: '人族' }, 属性: {},
    位置: { 描述: '六朝诸国·月牙平原山丘', x: 5000, y: 5000 }, 效果: [],
    背包: { 灵石: { 下品: 0, 中品: 0, 上品: 0, 极品: 0 }, 物品: {} },
    装备: {}, 功法: {}, 修炼: {}, 大道: { 大道列表: {} }, 技能: { 掌握技能: [], 装备栏: [], 冷却: {} },
  },
  社交: { 关系: {}, 宗门: null, 事件: {}, 记忆: { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] } },
  世界: { 信息: { 世界名称: '六朝并置世界' }, 状态: {} },
  系统: { 配置: {}, 设置: {}, 缓存: {}, 历史: { 叙事: [] }, 扩展: {}, 联机: { 模式: '单机', 房间ID: null, 玩家ID: null, 只读路径: ['世界'] } },
});

async function freshStore() {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key), clear: () => storage.clear(),
  };
  setActivePinia(createPinia());
  const { useGameStateStore } = await loadTs('../src/stores/gameStateStore.ts');
  return useGameStateStore();
}

test('写档盖章：旧档缺 游戏版本 / 内容包版本 → 写出当前值；旧值（如 0.0.0）被覆盖；其余元数据不变', async () => {
  const validation = await loadTs('../src/utils/saveValidationV3.ts');
  await withGlobals({ APP_VERSION: '0.1.0', CONTENT_PACK_VERSION: '990e8d35' }, async () => {
    for (const meta of [{}, { 游戏版本: '0.0.0' }, { 游戏版本: '9.9.9', 内容包版本: 'old' }]) {
      const store = await freshStore();
      store.loadFromSaveData(baseSave(meta));
      const out = store.toSaveData();
      assert.equal(out.元数据.游戏版本, '0.1.0');
      assert.equal(out.元数据.内容包版本, '990e8d35');
      assert.equal(out.元数据.存档ID, 'ver-test');
      assert.equal(out.元数据.创建时间, '2026-06-22T00:00:00.000Z');
      assert.equal(validation.validateSaveDataV3(out).isValid, true);
    }
  });
});

test('旧档缺字段容错：validateSaveDataV3 不因缺 游戏版本 / 内容包版本 报错或拒载；带字段同样通过', async () => {
  const validation = await loadTs('../src/utils/saveValidationV3.ts');
  const missing = validation.validateSaveDataV3(baseSave({}));
  assert.deepEqual(missing.criticalErrors, []);
  assert.equal(missing.isValid, true);
  assert.ok(![...missing.errors, ...missing.warnings].some(m => /游戏版本|内容包版本/.test(m)));
  const withBoth = validation.validateSaveDataV3(baseSave({ 游戏版本: '0.1.0', 内容包版本: '990e8d35' }));
  assert.equal(withBoth.isValid, true);
});

test('旧档缺字段容错：迁移后的元数据不带 内容包版本 也能过校验，迁移不新增也不丢弃已有 游戏版本', async () => {
  const migration = await loadTs('../src/utils/saveMigration.ts');
  const validation = await loadTs('../src/utils/saveValidationV3.ts');
  const legacy = { 存档名: '旧档', 游戏版本: '0.0.1', 角色基础信息: { 名字: '旧人', 性别: '男' }, 游戏时间: { 年: 16, 月: 1, 日: 1, 小时: 8, 分钟: 0 } };
  const { migrated } = migration.migrateSaveDataToLatest(legacy);
  assert.equal(migrated.元数据.游戏版本, '0.0.1');
  assert.equal('内容包版本' in migrated.元数据, false);
  assert.deepEqual(validation.validateSaveDataV3(migrated).criticalErrors, []);
  const bare = migration.migrateSaveDataToLatest({ 存档名: '无版本旧档', 角色基础信息: { 名字: '旧人', 性别: '男' } }).migrated;
  assert.equal(bare.元数据.游戏版本, undefined);
  assert.deepEqual(validation.validateSaveDataV3(bare).criticalErrors, []);
});

test('SaveMetaV3 类型新增可选 内容包版本；SAVE-CONTRACT.json 只冻结关卡/事件 ID，不含元数据字段，无需同步', () => {
  assert.match(readFileSync(path.join(root, 'src/types/saveSchemaV3.ts'), 'utf8'), /内容包版本\?: string;/);
  const contract = readFileSync(path.join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon/SAVE-CONTRACT.json'), 'utf8');
  assert.ok(!/游戏版本|内容包版本|元数据/.test(contract));
});
