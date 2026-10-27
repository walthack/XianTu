// 取消练功章节上限（用户 2026-10-27 13:40 定；太泉解锁设计稿 §6.3 的 T4 作废）：三档难度 trainingCap 默认 'none'，
// 练功／冲关只受境界最高级（levels.max）限制；查不到原著级时也不再把上限退成当前级。南荒已录级数照旧自动抬级。
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const realm = await loadTs('../src/utils/realmUtils.ts');
const levels = await loadTs('../src/modules/scenarioMods/levelProgression.ts');
const unlock = await loadTs('../src/modules/scenarioMods/lineUnlock.ts');

const N = () => numbers.GAME_NUMBERS;
const HERO = 'liuchao.character.cheng_zongyang';
const NANHUANG = 'lcq.stage_06'; // 开关章 112，主角原著 3 级
const AFTER_NANHUANG = 'lcq.stage_07_qingyuan_jiankang'; // 开关章 125，级数表查不到

const save = (preset, modId, level) => ({
  系统: { 难度设置: { ...levels.DIFFICULTY_PRESETS[preset] } },
  角色: { 属性: { 境界: level === undefined ? undefined : levels.realmAt(level) } },
  世界: { 状态: { 剧本模组: { modId, opening: { playerCharacterId: HERO }, canon: { characters: [] }, events: [], completedEventIds: [], flags: {} } } },
});
const levelNow = s => realm.levelOf(s.角色.属性.境界);

/** 只走练功／冲关回执（成功档）一路练到 target；冲不动就停，返回最终级数。 */
function practiseTo(s, target) {
  for (let guard = 0; guard < 500 && levelNow(s) < target; guard++) {
    const r = s.角色.属性.境界;
    const full = r.阶段 === '后期' && r.当前进度 >= r.下一级所需;
    if (full) assert.equal(levels.canBreakthrough(s), levelNow(s) < N().levels.max, '冲关按钮与冲关回执同口径');
    const next = levels.trainingRealm(s, full ? '我冲关' : '我练功', 'success');
    if (!next) break;
    s.角色.属性.境界 = next;
  }
  return levelNow(s);
}

test('三档难度预设与默认档的 trainingCap 都是 none；canon / canon+1 枚举仍可读', () => {
  for (const [name, preset] of Object.entries(levels.DIFFICULTY_PRESETS)) assert.equal(preset.trainingCap, 'none', name);
  assert.equal(levels.difficultySettings(null).trainingCap, 'none');
  for (const cap of ['canon', 'canon+1']) {
    const s = save('标准', NANHUANG, 1); s.系统.难度设置.trainingCap = cap;
    assert.equal(levels.difficultySettings(s).trainingCap, cap, '旧档里存的枚举值照常认');
  }
});

test('标准／严苛：南荒照旧抬级或自练到 3，离开南荒后能练到 5，太泉修为项随之满足', () => {
  for (const preset of ['标准', '严苛']) {
    const s = save(preset, NANHUANG, 1);
    levels.initializeLevel(s);
    assert.equal(levelNow(s), preset === '标准' ? 3 : 1, `${preset}：南荒已录级数照旧（autoRaiseLevel 行为不变）`);
    assert.equal(practiseTo(s, 3), 3);
    s.世界.状态.剧本模组.modId = AFTER_NANHUANG;
    assert.equal(levels.stageCanonLevel(s), null, '离开南荒后查不到原著级');
    levels.initializeLevel(s);
    assert.equal(levelNow(s), 3, '查不到原著级不抬也不降');
    const before = unlock.lineUnlockStatus(s, 'taiquan');
    assert.ok(before.missing.includes('realm'), `${preset}：3 级时太泉缺修为`);
    assert.equal(practiseTo(s, 5), 5, `${preset}：离开南荒 3 级后可练到 5`);
    const after = unlock.lineUnlockStatus(s, 'taiquan');
    assert.equal(after.realm.need, N().story.lineUnlock.taiquan.minRealmLevel);
    assert.ok(!after.missing.includes('realm'), `${preset}：练到 5 后太泉修为项满足`);
  }
});

test('冲关闸门 level<cap 在 cap=最高级时：可冲到最高级，到顶即停', () => {
  const max = N().levels.max;
  const s = save('标准', AFTER_NANHUANG, max - 1);
  assert.equal(levels.trainingCapLevel(s), max);
  assert.equal(practiseTo(s, max), max);
  s.角色.属性.境界 = { ...levels.realmAt(max), 阶段: '后期', 当前进度: N().training.progressPerLevel };
  assert.equal(levels.canBreakthrough(s), false, '到顶后冲关按钮不出');
  assert.equal(levels.trainingRealm(s, '我冲关', 'success'), null, '到顶后冲关回执为空');
  assert.equal(levels.trainingRealm(s, '我冲关', 'failure'), null, '到顶后失败也不折损');
});

test('旧档仍存 canon / canon+1：查不到原著级时上限按最高级（不再退成当前级），查得到时照旧按原著级卡', () => {
  const max = N().levels.max;
  for (const cap of ['canon', 'canon+1']) {
    const off = save('标准', AFTER_NANHUANG, 3); off.系统.难度设置.trainingCap = cap;
    assert.equal(levels.trainingCapLevel(off), max, cap);
    off.角色.属性.境界 = { ...levels.realmAt(3), 阶段: '后期', 当前进度: N().training.progressPerLevel };
    assert.equal(levels.canBreakthrough(off), true, cap);
    assert.equal(levelNow({ 角色: { 属性: { 境界: levels.trainingRealm(off, '我冲关', 'success') } } }), 4, cap);
  }
  const on = save('标准', NANHUANG, 3); on.系统.难度设置.trainingCap = 'canon';
  assert.equal(levels.trainingCapLevel(on), 3);
  on.系统.难度设置.trainingCap = 'canon+1';
  assert.equal(levels.trainingCapLevel(on), 3 + N().training.canonExtra);
  on.系统.难度设置.trainingCap = 'none';
  assert.equal(levels.trainingCapLevel(on), max);
});
