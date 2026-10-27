// 旧档练功上限迁移（总策划裁定，接用户 2026-10-27 13:40 取消练功章节上限）：读档时把 系统.难度设置.trainingCap 的
// 'canon' / 'canon+1' 改成 'none'，只迁一次（系统.扩展.读档迁移.练功不设限 = 迁移版本号），失败记 LCQ-SAV-030。
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

// 顺序加载：log.ts / store.ts 要与 loadRepairs.ts 用同一份实例
const log = await loadTs('../src/modules/diagnostics/log.ts');
const store = await loadTs('../src/modules/diagnostics/store.ts');
const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const dbg = await loadTs('../src/modules/diagnostics/debugLog.ts');
const levels = await loadTs('../src/modules/scenarioMods/levelProgression.ts');
const repairs = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');

const { LOAD_MIGRATIONS_KEY: KEY, TRAINING_CAP_NONE_MIGRATION: NAME } = repairs;
const save = (preset, cap, 扩展) => {
  const 难度设置 = { ...levels.DIFFICULTY_PRESETS[preset] };
  if (cap !== undefined) 难度设置.trainingCap = cap;
  return { 系统: { 难度设置, ...(扩展 ? { 扩展 } : {}) } };
};
const marked = s => s.系统.扩展?.[KEY]?.[NAME];

test('旧档 canon / canon+1 → none：只改 trainingCap，autoRaiseLevel 与 系统.扩展 原有键保留，打迁移标记', () => {
  for (const [preset, cap] of [['标准', 'canon'], ['严苛', 'canon'], ['标准', 'canon+1'], ['严苛', 'canon+1']]) {
    const s = save(preset, cap, { 任务追踪: { 即兴目标: [] } });
    assert.equal(repairs.migrateTrainingCapNone(s), cap, `${preset}/${cap}`);
    assert.deepEqual(s.系统.难度设置, { autoRaiseLevel: levels.DIFFICULTY_PRESETS[preset].autoRaiseLevel, trainingCap: 'none' }, `${preset}/${cap}`);
    assert.deepEqual(s.系统.扩展.任务追踪, { 即兴目标: [] }, '扩展原有键不动');
    assert.equal(marked(s), 1);
    assert.equal(levels.difficultySettings(s).trainingCap, 'none');
  }
});

test('读档入口 applyLoadRepairs 走迁移；没有剧本模组的档也迁', () => {
  const s = save('严苛', 'canon');
  repairs.applyLoadRepairs(s);
  assert.equal(s.系统.难度设置.trainingCap, 'none');
  assert.equal(s.系统.难度设置.autoRaiseLevel, false);
  assert.equal(marked(s), 1);
});

test('只迁一次：已打标记后玩家在设置里改回 canon，再读档不冲掉', () => {
  const s = save('标准', 'canon');
  repairs.applyLoadRepairs(s);
  s.系统.难度设置.trainingCap = 'canon';
  assert.equal(repairs.migrateTrainingCapNone(s), null);
  repairs.applyLoadRepairs(s);
  assert.equal(s.系统.难度设置.trainingCap, 'canon');
  assert.equal(marked(s), 1);
});

test('已是 none 不变：难度设置原样，只打标记；再读一次也不变', () => {
  const s = save('标准', 'none');
  const before = structuredClone(s.系统.难度设置);
  assert.equal(repairs.migrateTrainingCapNone(s), null);
  assert.deepEqual(s.系统.难度设置, before);
  assert.equal(marked(s), 1);
  repairs.applyLoadRepairs(s);
  assert.deepEqual(s.系统.难度设置, before);
});

test('宽松档不受影响：autoRaiseLevel=true / none 原样', () => {
  const s = save('宽松');
  assert.deepEqual(s.系统.难度设置, { autoRaiseLevel: true, trainingCap: 'none' });
  repairs.applyLoadRepairs(s);
  assert.deepEqual(s.系统.难度设置, { autoRaiseLevel: true, trainingCap: 'none' });
  assert.equal(marked(s), 1);
});

test('没存难度设置只打标记不补字段；没有 系统 的档不动', () => {
  const s = { 系统: {} };
  assert.equal(repairs.migrateTrainingCapNone(s), null);
  assert.equal(s.系统.难度设置, undefined);
  assert.equal(marked(s), 1);
  const empty = {};
  assert.equal(repairs.migrateTrainingCapNone(empty), null);
  assert.deepEqual(empty, {});
});

test('迁移失败记 LCQ-SAV-030，不抛、不打标记，难度设置不写半截', async () => {
  await log.resetLogState();
  const s = save('标准', 'canon');
  Object.freeze(s.系统);
  assert.doesNotThrow(() => repairs.applyLoadRepairs(s));
  assert.equal(s.系统.难度设置.trainingCap, 'canon');
  assert.equal(s.系统.扩展, undefined);
  const hits = store.logStore.recent(100).filter(e => e.code === 'LCQ-SAV-030');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].detail?.reason, 'migrate_failed');
});

test('调试日志挂存档大类：save 开着才打，关着不打', () => {
  const before = structuredClone(numbers.GAME_NUMBERS.diagnostics);
  const out = [];
  dbg.setDebugConsole((...args) => out.push(args));
  try {
    repairs.migrateTrainingCapNone(save('标准', 'canon'));
    assert.equal(out.length, 0, '默认关');
    numbers.applyGameNumbers({ diagnostics: { debug: { categories: { save: true } } } });
    repairs.migrateTrainingCapNone(save('标准', 'canon+1'));
    assert.equal(out.length, 1);
    assert.match(String(out[0][0]), /^\[dbg:save\] 读档迁移：练功上限 canon\+1 → none/);
  } finally {
    numbers.applyGameNumbers({ diagnostics: before });
    dbg.setDebugConsole(null);
  }
});
