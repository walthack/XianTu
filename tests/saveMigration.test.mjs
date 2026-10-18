// 存档版本迁移链：显式 schema 版本常量、升级链注册表（0→3 内置，可注册后续版本）、
// 旧档/缺字段/缺版本号按旧档处理、未来版本拒载（LCQ-SAV-014）、幂等、链式多步。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const migration = await loadTs('../src/utils/saveMigration.ts');
const validation = await loadTs('../src/utils/saveValidationV3.ts');
const rot = await loadTs('../src/utils/saveRotation.ts');
const fallback = await loadTs('../src/utils/saveLoadFallback.ts');
const logMod = await loadTs('../src/modules/diagnostics/log.ts');
const storeMod = await loadTs('../src/modules/diagnostics/store.ts');
const codes = await loadTs('../src/modules/diagnostics/codes.ts');
const toastMod = await loadTs('../src/utils/toast.ts');

const { CURRENT_SAVE_SCHEMA_VERSION, migrateSaveData, migrateSaveDataToLatest, registerSaveMigrationStep } = migration;

const legacySave = () => ({
  存档名: '旧档',
  游戏版本: '0.0.1',
  角色基础信息: { 名字: '旧人', 性别: '男' },
  游戏时间: { 年: 16, 月: 1, 日: 1, 小时: 8, 分钟: 0 },
  状态: { 境界: '炼气', 声望: 7 },
  叙事历史: ['第一句'],
  _AI说明: '应被剥离',
});
const v3Save = (meta = {}) => ({
  元数据: { 版本号: 3, 存档ID: 'v3-id', 存档名: 'V3 档', 创建时间: '2026-06-22T00:00:00.000Z', 更新时间: '2026-06-22T00:00:00.000Z', 游戏时长秒: 5, 时间: { 年: 16, 月: 1, 日: 1, 小时: 8, 分钟: 0 }, ...meta },
  角色: { 身份: { 名字: '甲' }, 属性: {}, 位置: { 描述: '某地' }, 效果: [], 背包: { 物品: {} }, 装备: {} },
  社交: { 关系: {}, 事件: {}, 记忆: { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] } },
  世界: { 信息: {} },
  系统: { 联机: { 模式: '单机', 只读路径: ['世界'] } },
});
const quiet = async fn => {
  const saved = {};
  for (const k of ['log', 'info', 'warn', 'debug', 'error']) { saved[k] = console[k]; console[k] = () => {}; }
  try { return await fn(); } finally { Object.assign(console, saved); }
};
const clearToasts = () => { for (const item of [...toastMod.toastsReadonly.value]) toastMod.toast.hide(item.id); };
/** 抹掉每次迁移新盖的时间戳 / 存档ID，并经 JSON 往返丢掉 undefined 键（迁移内部也走 JSON 深拷贝），便于比较两次结果。 */
const stable = save => { const c = JSON.parse(JSON.stringify(save)); delete c.元数据.更新时间; delete c.元数据.存档ID; return c; };

// ───────────── 版本常量与注册表 ─────────────

test('CURRENT_SAVE_SCHEMA_VERSION 是显式常量 3，与类型字面量、校验器一致；内置链只有 0→3', async () => {
  assert.equal(CURRENT_SAVE_SCHEMA_VERSION, 3);
  assert.match(await readFile(new URL('../src/types/saveSchemaV3.ts', import.meta.url), 'utf8'), /版本号: 3;/);
  assert.deepEqual(migration.listSaveMigrationSteps().map(({ from, to }) => ({ from, to })), [{ from: 0, to: 3 }]);
  assert.equal(validation.validateSaveDataV3(v3Save()).isValid, true);
});

test('registerSaveMigrationStep：拒绝非法版本号与重复 from；返回的注销函数能撤掉', () => {
  assert.throws(() => registerSaveMigrationStep({ from: 3, to: 3, fn: s => s }), /无效/);
  assert.throws(() => registerSaveMigrationStep({ from: 4, to: 3, fn: s => s }), /无效/);
  assert.throws(() => registerSaveMigrationStep({ from: 1.5, to: 3, fn: s => s }), /无效/);
  assert.throws(() => registerSaveMigrationStep({ from: 0, to: 4, fn: s => s }), /重复/);
  const unregister = registerSaveMigrationStep({ from: 3, to: 4, fn: s => s });
  assert.equal(migration.listSaveMigrationSteps().length, 2);
  unregister();
  unregister(); // 重复注销无副作用
  assert.equal(migration.listSaveMigrationSteps().length, 1);
});

// ───────────── 版本判定 ─────────────

test('detectSaveSchemaVersion：V3 档=3；缺版本号 / 非法 / 低版本 / 盖 3 却不是 V3 形状 / 非对象 → 0（旧档）；高版本照实返回', () => {
  const detect = migration.detectSaveSchemaVersion;
  assert.equal(detect(v3Save()), 3);
  assert.equal(detect(v3Save({ 版本号: undefined })), 0, 'V3 形状缺版本号按旧档');
  assert.equal(detect(v3Save({ 版本号: 'x' })), 0);
  assert.equal(detect(v3Save({ 版本号: 2 })), 0);
  assert.equal(detect(legacySave()), 0);
  assert.equal(detect({ 元数据: { 版本号: 3 } }), 0, '盖了 3 但缺角色/社交/世界/系统');
  for (const bad of [null, undefined, 'str', 7, []]) assert.equal(detect(bad), 0);
  assert.equal(detect(v3Save({ 版本号: 4 })), 4);
  assert.equal(detect({ 元数据: { 版本号: 9 } }), 9, '高版本不看形状，一律先拒');
});

// ───────────── 旧档 → 当前版本 ─────────────

test('旧档 → 当前版本：版本号=3、字段按旧映射落位、旧键清掉、AI 字段剥离、校验通过；不改入参', () => {
  const input = legacySave();
  const snapshot = structuredClone(input);
  const { migrated, report, fromVersion, toVersion } = migrateSaveDataToLatest(input) && migrateSaveData(input);
  assert.deepEqual(input, snapshot, '入参不被修改');
  assert.equal(fromVersion, 0);
  assert.equal(toVersion, 3);
  assert.equal(migrated.元数据.版本号, 3);
  assert.equal(migrated.元数据.游戏版本, '0.0.1');
  assert.equal(migrated.元数据.存档名, '旧档');
  assert.equal(migrated.角色.身份.名字, '旧人');
  assert.equal(migrated.角色.属性.境界, '炼气');
  assert.deepEqual(migrated.系统.历史.叙事, ['第一句']);
  assert.deepEqual(migrated.元数据.时间, { 年: 16, 月: 1, 日: 1, 小时: 8, 分钟: 0 });
  for (const key of ['角色基础信息', '游戏时间', '状态', '叙事历史', '_AI说明']) assert.equal(key in migrated, false, key);
  assert.deepEqual(report.removedLegacyKeys.sort(), ['叙事历史', '状态', '游戏时间', '角色基础信息'].sort());
  assert.deepEqual(validation.validateSaveDataV3(migrated).criticalErrors, []);
  assert.equal(validation.validateSaveDataV3(migrated).isValid, true);
});

test('migrateSaveDataToLatest 与 migrateSaveData 默认目标等价；V3 档兜底补全记忆四段，且保持原样其余字段', () => {
  const save = v3Save();
  delete save.社交.记忆;
  const { migrated, report } = migrateSaveDataToLatest(save);
  assert.deepEqual(migrated.社交.记忆, { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] });
  assert.deepEqual(report, { legacyKeysFound: [], removedLegacyKeys: [], warnings: [] });
  assert.equal(migrated.元数据.存档ID, 'v3-id');
  assert.equal(migrated.元数据.更新时间, '2026-06-22T00:00:00.000Z', 'V3 档不动更新时间');
  assert.deepEqual(migrateSaveData(save).migrated, migrated);
});

// ───────────── 缺字段 / 缺版本号 ─────────────

test('缺字段：空对象、null、只有一个旧键，都能迁成可通过致命校验的 V3', () => {
  for (const raw of [{}, null, undefined, { 存档名: '只有名字' }, { 角色基础信息: { 名字: '甲' } }]) {
    const { migrated, fromVersion } = migrateSaveData(raw);
    assert.equal(fromVersion, 0);
    assert.equal(migrated.元数据.版本号, 3);
    assert.deepEqual(validation.validateSaveDataV3(migrated).criticalErrors, [], JSON.stringify(raw));
    assert.ok(migrated.角色.身份, '缺身份时补默认身份');
  }
});

test('缺版本号：V3 形状但没盖版本号 → 按旧档走 0→3，补盖 3 且内容不丢', () => {
  const save = v3Save({ 版本号: undefined });
  const { migrated, fromVersion } = migrateSaveData(save);
  assert.equal(fromVersion, 0);
  assert.equal(migrated.元数据.版本号, 3);
  assert.equal(migrated.元数据.存档ID, 'v3-id');
  assert.equal(migrated.角色.身份.名字, '甲');
  assert.equal(validation.validateSaveDataV3(migrated).isValid, true);
});

// ───────────── 未来版本拒绝 ─────────────

test('未来版本：checkSaveSchemaVersion 判不支持；迁移函数抛 SaveVersionTooNewError（码 LCQ-SAV-014）且不改入参', () => {
  const future = v3Save({ 版本号: 4 });
  const snapshot = structuredClone(future);
  const check = migration.checkSaveSchemaVersion(future);
  assert.deepEqual(check, { supported: false, saveVersion: 4, currentVersion: 3 });
  assert.equal(migration.checkSaveSchemaVersion(v3Save()).supported, true);
  assert.equal(migration.checkSaveSchemaVersion(legacySave()).supported, true);
  for (const fn of [() => migrateSaveDataToLatest(future), () => migrateSaveData(future)]) {
    assert.throws(fn, err => err instanceof migration.SaveVersionTooNewError && err.code === 'LCQ-SAV-014' && err.saveVersion === 4 && err.currentVersion === 3);
  }
  assert.deepEqual(future, snapshot);
  // 非 V3 形状的高版本档也不会被当旧档“重建”
  assert.throws(() => migrateSaveDataToLatest({ 元数据: { 版本号: 5 }, 新结构: {} }), err => err.code === 'LCQ-SAV-014');
});

test('未来版本提示是玩家可读的中文：含存档版本、当前最高版本、码；校验器把它当非致命错误并给出专门文案', () => {
  const message = migration.futureSaveMessage('自动存档', { supported: false, saveVersion: 4, currentVersion: 3 });
  assert.match(message, /自动存档/);
  assert.match(message, /更新版本/);
  assert.match(message, /4/);
  assert.match(message, /3/);
  assert.match(message, /升级游戏/);
  assert.match(message, /LCQ-SAV-014/);
  const result = validation.validateSaveDataV3(v3Save({ 版本号: 4 }));
  assert.deepEqual(result.criticalErrors, []);
  assert.ok(result.errors.some(e => /高于当前游戏支持/.test(e)));
  assert.ok(!result.errors.some(e => /必须为 3/.test(e)));
  assert.ok(validation.validateSaveDataV3(v3Save({ 版本号: 2 })).errors.some(e => /必须为 3/.test(e)));
});

test('读档守卫 rejectFutureSaveVersion：未来版本 → 返回 true、记 LCQ-SAV-014、弹玩家提示；当前版 / 旧档 / 空 → false 且无提示', async () => {
  await logMod.resetLogState();
  clearToasts();
  await quiet(async () => {
    assert.equal(fallback.rejectFutureSaveVersion('c1', 's1', v3Save()), false);
    assert.equal(fallback.rejectFutureSaveVersion('c1', 's1', legacySave()), false);
    assert.equal(fallback.rejectFutureSaveVersion('c1', 's1', null), false);
    assert.equal(toastMod.toastsReadonly.value.length, 0);
    assert.equal(fallback.rejectFutureSaveVersion('c1', '主线存档', v3Save({ 版本号: 4 })), true);
  });
  const entry = storeMod.logStore.recent(20).find(e => e.code === 'LCQ-SAV-014');
  assert.ok(entry, '应记 LCQ-SAV-014');
  assert.equal(entry.detail.saveVersion, 4);
  assert.equal(entry.detail.currentVersion, 3);
  assert.equal(entry.detail.slotId, '主线存档');
  const toasts = toastMod.toastsReadonly.value.filter(t => /LCQ-SAV-014/.test(t.message));
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].message, /主线存档/);
  clearToasts();
});

test('未来版本的档不算损坏：isUsableSave 为 true，不会触发滚动备份回退而悄悄回档', () => {
  assert.equal(rot.isUsableSave(v3Save({ 版本号: 4 })), true);
  assert.equal(rot.isUsableSave({ 元数据: { 版本号: 7 }, 新结构: {} }), true);
  assert.equal(rot.isUsableSave({ 元数据: { 版本号: 3 } }), false, '当前版本号但结构残缺仍是损坏');
  assert.equal(rot.isUsableSave(v3Save()), true);
  assert.equal(rot.isUsableSave(null), false);
});

test('characterStore.loadGame 在旧结构检测之前调用版本守卫，守卫命中即 return false', async () => {
  const src = await readFile(new URL('../src/stores/characterStore.ts', import.meta.url), 'utf8');
  const guard = src.indexOf('rejectFutureSaveVersion(charId, slotKey, targetSlot.存档数据)');
  const detect = src.indexOf('detectLegacySaveData(targetSlot.存档数据)');
  assert.ok(guard > 0 && detect > 0 && guard < detect);
  assert.match(src.slice(guard, guard + 120), /\) return false;/);
});

test('错误码 LCQ-SAV-014 已登记：warn / saveMigration / 进玩家提示；文档同名一行（互校由 errorCodeGuard 负责）', async () => {
  const spec = codes.ERROR_CODES['LCQ-SAV-014'];
  assert.deepEqual([spec.level, spec.module, spec.toast], ['warn', 'saveMigration', true]);
  const doc = await readFile(new URL('../docs/ERROR-CODES.md', import.meta.url), 'utf8');
  assert.ok(doc.split('\n').some(line => line.startsWith('| LCQ-SAV-014 |')));
});

// ───────────── 幂等 ─────────────

test('幂等：旧档迁一次后再迁，结果不变（除迁移时才盖的 存档ID / 更新时间）；V3 档反复迁移完全不变', () => {
  const once = migrateSaveDataToLatest(legacySave()).migrated;
  const twice = migrateSaveDataToLatest(once).migrated;
  const thrice = migrateSaveDataToLatest(twice).migrated;
  assert.deepEqual(stable(twice), stable(once));
  assert.deepEqual(stable(thrice), stable(twice));
  assert.deepEqual(thrice.元数据, twice.元数据, '第二次起元数据（含时间戳）完全不变');
  assert.equal(twice.元数据.存档ID, once.元数据.存档ID, '二次迁移不再重新生成存档ID');
  assert.equal(migrateSaveData(once).fromVersion, 3);
  const v3 = v3Save();
  assert.deepEqual(JSON.parse(JSON.stringify(migrateSaveDataToLatest(migrateSaveDataToLatest(v3).migrated).migrated)), JSON.parse(JSON.stringify(migrateSaveDataToLatest(v3).migrated)));
});

// ───────────── 链式多步 ─────────────

test('链式多步：临时注册 v3→v4（再 v4→v5），旧档一路 0→3→4→5；V3 档 3→4；已到目标的档不再走步骤；注销后恢复', () => {
  const calls = [];
  const un4 = registerSaveMigrationStep({ from: 3, to: 4, fn: (save, report) => { calls.push('3→4'); save.元数据.版本号 = 4; save.系统.扩展 = { ...save.系统.扩展, 四版标记: true }; report.warnings.push('升到4'); return save; } });
  try {
    const legacy = migrateSaveData(legacySave(), 4);
    assert.deepEqual(calls, ['3→4']);
    assert.equal(legacy.fromVersion, 0);
    assert.equal(legacy.toVersion, 4);
    assert.equal(legacy.migrated.元数据.版本号, 4);
    assert.equal(legacy.migrated.系统.扩展.四版标记, true);
    assert.equal(legacy.migrated.角色.身份.名字, '旧人', '先走完内置 0→3 再走 3→4');
    assert.deepEqual(legacy.report.warnings, ['升到4']);

    calls.length = 0;
    const un5 = registerSaveMigrationStep({ from: 4, to: 5, fn: save => { calls.push('4→5'); save.元数据.版本号 = 5; return save; } });
    const chained = migrateSaveData(v3Save(), 5);
    assert.deepEqual(calls, ['3→4', '4→5']);
    assert.equal(chained.fromVersion, 3);
    assert.equal(chained.toVersion, 5);
    assert.equal(chained.migrated.元数据.版本号, 5);

    // 幂等：已在 v5 的档再迁到 5，不再触发任何步骤
    calls.length = 0;
    const again = migrateSaveData(chained.migrated, 5);
    assert.deepEqual(calls, []);
    assert.deepEqual(again.migrated, chained.migrated);
    assert.equal(again.fromVersion, 5);

    // 低目标不会多走：目标 4 只走到 4
    assert.equal(migrateSaveData(v3Save(), 4).toVersion, 4);
    // 目标低于存档版本 → 拒
    assert.throws(() => migrateSaveData(chained.migrated, 4), err => err.code === 'LCQ-SAV-014' && err.saveVersion === 5 && err.currentVersion === 4);
    un5();
  } finally {
    un4();
  }
  // 注销后：默认目标仍是 3，v4 档重新被拒，链上缺步骤时报错
  assert.throws(() => migrateSaveDataToLatest(v3Save({ 版本号: 4 })), err => err.code === 'LCQ-SAV-014');
  assert.throws(() => migrateSaveData(v3Save(), 4), /缺少从版本 3 出发的步骤/);
});

test('链式多步：步骤抛错原样上抛，不吞；入参不被步骤污染', () => {
  const un = registerSaveMigrationStep({ from: 3, to: 4, fn: () => { throw new Error('步骤坏了'); } });
  try {
    const save = v3Save();
    const snapshot = structuredClone(save);
    assert.throws(() => migrateSaveData(save, 4), /步骤坏了/);
    assert.deepEqual(save, snapshot);
  } finally {
    un();
  }
});
