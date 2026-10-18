// 读档前校验（迁移之后）：合法旧档不被误杀（缺字段只告警 LCQ-SAV-015）、结构损坏回退滚动备份（LCQ-SAV-016）、
// 无可用备份时拒绝加载并给玩家可读错误（LCQ-SAV-017）。回退候选与读档回退同口径（isUsableSave），旧结构备份在内存迁移。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const migration = await loadTs('../src/utils/saveMigration.ts');
const fallback = await loadTs('../src/utils/saveLoadFallback.ts');
const dataValidation = await loadTs('../src/utils/dataValidation.ts');
const logMod = await loadTs('../src/modules/diagnostics/log.ts');
const storeMod = await loadTs('../src/modules/diagnostics/store.ts');
const codes = await loadTs('../src/modules/diagnostics/codes.ts');
const toastMod = await loadTs('../src/utils/toast.ts');

const legacySave = () => ({
  存档名: '旧档',
  游戏版本: '0.0.1',
  角色基础信息: { 名字: '旧人', 性别: '男' },
  游戏时间: { 年: 16, 月: 1, 日: 1, 小时: 8, 分钟: 0 },
  状态: { 境界: '炼气', 声望: 7 },
  叙事历史: ['第一句'],
});
const v3Save = (meta = {}) => ({
  元数据: { 版本号: 3, 存档ID: 'v3-id', 存档名: 'V3 档', 创建时间: '2026-06-22T00:00:00.000Z', 更新时间: '2026-06-22T00:00:00.000Z', 游戏时长秒: 5, 时间: { 年: 16, 月: 1, 日: 1, 小时: 8, 分钟: 0 }, ...meta },
  角色: { 身份: { 名字: '甲' }, 属性: {}, 位置: { 描述: '某地' }, 效果: [], 背包: { 物品: {} }, 装备: {} },
  社交: { 关系: {}, 事件: {}, 记忆: { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] } },
  世界: { 信息: {} },
  系统: { 联机: { 模式: '单机', 只读路径: ['世界'] } },
});
/** 结构损坏：认不出是 V3，也没有任何旧字段。 */
const brokenSave = () => ({ 元数据: { 版本号: 3 }, 角色: {} });
const quiet = async fn => {
  const saved = {};
  for (const k of ['log', 'info', 'warn', 'debug', 'error']) { saved[k] = console[k]; console[k] = () => {}; }
  try { return await fn(); } finally { Object.assign(console, saved); }
};
const clearToasts = () => { for (const item of [...toastMod.toastsReadonly.value]) toastMod.toast.hide(item.id); };
async function reset() {
  await logMod.resetLogState();
  fallback.resetSaveFallbackNotices();
  clearToasts();
}
/** 只看存档相关码（测试环境没有 IndexedDB，日志层会另记一条 LCQ-SYS-001 降级）。 */
const logCodes = () => storeMod.logStore.recent(50).map(entry => entry.code).filter(code => code.startsWith('LCQ-SAV-'));
const toastsOf = code => toastMod.toastsReadonly.value.filter(item => item.message.includes(code));
/** 按下标给备份的假读取；记录被读过的下标。 */
const backups = (table) => {
  const reads = [];
  return { reads, readBackup: async index => { reads.push(index); const v = table[index]; if (v instanceof Error) throw v; return v ?? null; } };
};
const validate = (save, opts, slot = 'A') => quiet(() => fallback.validateLoadedSave('c1', slot, save, opts));

// ───────────── 合法旧档不被误杀 ─────────────

test('合法旧档（迁移后）通过：ok、原对象原样返回、不读备份、不弹提示、不记 015', async () => {
  await reset();
  const { migrated } = migration.migrateSaveDataToLatest(legacySave());
  const { reads, readBackup } = backups({});
  const outcome = await validate(migrated, { keep: 3, readBackup });
  assert.equal(outcome.status, 'ok');
  assert.equal(outcome.data, migrated);
  assert.deepEqual(reads, []);
  assert.equal(toastMod.toastsReadonly.value.length, 0);
  assert.deepEqual(logCodes(), []);
});

test('V3 档缺字段 / 版本号旧 / 装备引用丢失：只记 LCQ-SAV-015 告警，照常 ok；同一份档 validateGameData 会拒绝（评估里的误杀点）', async () => {
  await reset();
  const partial = v3Save({ 版本号: 2 });
  delete partial.角色.效果;
  delete partial.社交.记忆;
  partial.角色.装备 = { 装备1: '不存在的物品' };
  assert.equal(dataValidation.validateGameData(partial).isValid, false, '旧的完整校验会把它挡在门外');
  const { reads, readBackup } = backups({ 1: v3Save() });
  const outcome = await validate(partial, { keep: 3, readBackup });
  assert.equal(outcome.status, 'ok');
  assert.equal(outcome.data, partial, '不改写、不替换成备份');
  assert.deepEqual(reads, [], '非致命不去翻备份');
  assert.equal(toastMod.toastsReadonly.value.length, 0, '非致命不打扰玩家');
  const entry = storeMod.logStore.recent(50).find(e => e.code === 'LCQ-SAV-015');
  assert.ok(entry, '应记 LCQ-SAV-015');
  assert.equal(entry.detail.count, entry.detail.problems.length);
  assert.ok(entry.detail.problems.some(p => /角色\.效果/.test(p)));
});

test('checkLoadedSave：致命只来自 criticalErrors；校验器抛错按致命；errors/warnings 全进 minor', () => {
  assert.deepEqual(fallback.checkLoadedSave(v3Save()), { fatal: [], minor: [] });
  const partial = v3Save({ 版本号: 2 });
  const res = fallback.checkLoadedSave(partial);
  assert.deepEqual(res.fatal, []);
  assert.ok(res.minor.length > 0);
  assert.ok(fallback.checkLoadedSave(brokenSave()).fatal.length > 0);
  const hostile = new Proxy({}, { get() { throw new Error('boom'); } });
  const thrown = fallback.checkLoadedSave(hostile);
  assert.equal(thrown.fatal.length, 1);
  assert.match(thrown.fatal[0], /校验器抛错：boom/);
});

// ───────────── 损坏档触发回退 ─────────────

test('结构损坏 → 回退到最近一份可用备份：recovered、记 016、弹一次提示；坏备份 / 读取抛错 / 未来版本备份被跳过', async () => {
  await reset();
  const good = v3Save({ 存档名: '备份3' });
  const { reads, readBackup } = backups({ 1: brokenSave(), 2: new Error('读失败'), 3: good });
  const outcome = await validate(brokenSave(), { keep: 3, readBackup });
  assert.equal(outcome.status, 'recovered');
  assert.equal(outcome.backupIndex, 3);
  assert.equal(outcome.data, good);
  assert.deepEqual(reads, [1, 2, 3]);
  assert.ok(logCodes().includes('LCQ-SAV-016'));
  assert.ok(!logCodes().includes('LCQ-SAV-017'));
  const toasts = toastsOf('LCQ-SAV-016');
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].message, /存档【A】/);
  assert.match(toasts[0].message, /第 3 份/);

  // 同会话同槽第二次：仍回退、仍记日志，但不再弹
  await validate(brokenSave(), { keep: 3, readBackup });
  assert.equal(toastsOf('LCQ-SAV-016').length, 1);
  // 换一个槽会再弹
  await validate(brokenSave(), { keep: 3, readBackup }, 'B');
  assert.equal(toastsOf('LCQ-SAV-016').length, 2);
});

test('回退取第一份可用的就停；旧结构的备份在内存里迁移成 V3 后使用（不写回）', async () => {
  await reset();
  const legacyBackup = legacySave();
  const snapshot = JSON.stringify(legacyBackup);
  const { reads, readBackup } = backups({ 1: legacyBackup, 2: v3Save() });
  const outcome = await validate(brokenSave(), { keep: 3, readBackup });
  assert.equal(outcome.status, 'recovered');
  assert.equal(outcome.backupIndex, 1);
  assert.deepEqual(reads, [1]);
  assert.equal(migration.isSaveDataV3(outcome.data), true);
  assert.equal(outcome.data.角色.身份.名字, '旧人');
  assert.equal(JSON.stringify(legacyBackup), snapshot, '备份原对象未被改动');
});

test('来自更新版本的备份不用于回退（避免悄悄丢进度 / 降级覆盖）；回退份数受 keep 限制', async () => {
  await reset();
  const { reads, readBackup } = backups({ 1: v3Save({ 版本号: 4 }), 2: v3Save() });
  const outcome = await validate(brokenSave(), { keep: 1, readBackup });
  assert.equal(outcome.status, 'rejected', 'keep=1 时只看第 1 份，且它是未来版本');
  assert.deepEqual(reads, [1]);
});

// ───────────── 无备份：玩家可读错误 ─────────────

test('损坏且无任何可用备份 → rejected、记 017、弹出带槽名与错误码的玩家可读错误，不记 016', async () => {
  await reset();
  const { reads, readBackup } = backups({});
  const outcome = await validate(brokenSave(), { keep: 3, readBackup }, '主线存档');
  assert.deepEqual(outcome, { status: 'rejected' });
  assert.deepEqual(reads, [1, 2, 3]);
  assert.ok(logCodes().includes('LCQ-SAV-017'));
  assert.ok(!logCodes().includes('LCQ-SAV-016'));
  const toasts = toastsOf('LCQ-SAV-017');
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].message, /主线存档/);
  assert.match(toasts[0].message, /没有可用的备份/);
  assert.match(toasts[0].message, /不要覆盖/);
});

test('滚动备份关闭（keep=0，如“上次对话”槽）：损坏档直接 rejected，不读备份', async () => {
  await reset();
  const { reads, readBackup } = backups({ 1: v3Save() });
  const outcome = await validate(brokenSave(), { keep: 0, readBackup });
  assert.equal(outcome.status, 'rejected');
  assert.deepEqual(reads, []);
  // 不传 keep 时按槽取：排除槽为 0
  const excluded = await validate(brokenSave(), { readBackup }, '上次对话');
  assert.equal(excluded.status, 'rejected');
  assert.deepEqual(reads, []);
});

// ───────────── 接线与码表 ─────────────

test('characterStore.loadGame：校验在迁移块之后、开始加载之前；rejected 即 return false；旧的注释块已清掉', async () => {
  const src = await readFile(new URL('../src/stores/characterStore.ts', import.meta.url), 'utf8');
  const migrate = src.indexOf('detectLegacySaveData(targetSlot.存档数据)');
  const call = src.indexOf('validateLoadedSave(charId, slotKey, targetSlot.存档数据)');
  const start = src.indexOf("uiStore.startLoading('开始加载存档...')");
  assert.ok(migrate > 0 && call > migrate && start > call);
  assert.match(src.slice(call, call + 200), /outcome\.status === 'rejected'\) return false;/);
  assert.ok(!src.includes('// const validationResult = validateGameData'));
});

test('错误码 015/016/017 已登记：级别 / 模块 / 是否进玩家提示；文档各有一行（互校由 errorCodeGuard 负责）', async () => {
  const expected = { 'LCQ-SAV-015': ['warn', false], 'LCQ-SAV-016': ['warn', true], 'LCQ-SAV-017': ['warn', true] };
  const doc = await readFile(new URL('../docs/ERROR-CODES.md', import.meta.url), 'utf8');
  for (const [code, [level, toast]] of Object.entries(expected)) {
    const spec = codes.ERROR_CODES[code];
    assert.deepEqual([spec.level, spec.module, spec.toast], [level, 'saveValidation', toast], code);
    assert.ok(doc.split('\n').some(line => line.startsWith(`| ${code} |`)), code);
  }
});
