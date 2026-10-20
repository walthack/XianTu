// r4：① 本期结束后「继续到下一期」要真的可用（同一份进度，只挪终点标记）；② 自动存档不覆盖读过的手动存档位。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const stage01 = async () => {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  return parseScenarioMod(JSON.parse(await read('src/modules/scenarioMods/builtins/data/lcq.stage_01.json')));
};
const PHASE1_END = ['lcq.stage_04b_lingfei_baiyi_crisis', 'lcq.event.enter_dong_with_migu'];
const PHASE2_END = ['lcq.stage_05b', 'lcq.event.shanghou_cures_ice_gu'];
const PHASE3_END = ['lcq.stage_07_qingyuan_jiankang', 'lcq.event.s07_00c_arrive_jiankang'];
async function endedSave(phase, [modId, eventId]) {
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const save = createQingyuOpeningPlaytestSave(await stage01(), '2026-10-14T00:00:00.000Z', phase);
  const runtime = save.世界.状态.剧本模组;
  runtime.modId = modId;
  runtime.completedEventIds.push(eventId);
  runtime.nextStageId = 'lcq.stage_next';
  runtime.nextStageReadyId = 'lcq.stage_next';
  return save;
}

test('phase 1 finished: continuing moves only the end marker to phase 2 and unblocks the stage transition', async () => {
  const q = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { getStageDepartureOffer } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { transitionToNextScenarioStage } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const save = await endedSave(1, PHASE1_END);
  assert.equal(q.isNanhuangDemoFinished(save), true);
  assert.equal(q.nextNanhuangPhase(save)?.id, 'nanhuang-2');
  assert.equal(getStageDepartureOffer(save), null);
  assert.equal(transitionToNextScenarioStage(save, []).reason, '本期南荒试玩已结束');

  const next = q.withNextNanhuangPhase(save);
  const marker = next.系统.扩展.清羽记开局;
  assert.deepEqual([marker.endModId, marker.endEventId], PHASE2_END);
  assert.equal(marker.kind, save.系统.扩展.清羽记开局.kind);
  assert.deepEqual(marker.eventIds, save.系统.扩展.清羽记开局.eventIds);
  assert.equal(q.isNanhuangDemoFinished(next), false, '继续后不再判为本期结束');
  assert.ok(getStageDepartureOffer(next), '继续后可以启程去下一关');
  assert.notEqual(transitionToNextScenarioStage(next, []).reason, '本期南荒试玩已结束');
  assert.equal(next.世界.状态.剧本模组, save.世界.状态.剧本模组, '玩家进度原样保留');
  assert.equal(q.isNanhuangDemoFinished(save), true, '不改入参');
  assert.equal(q.nextNanhuangPhase(next)?.id, 'nanhuang-3', '2026-10-20 加第三期：二期之后接返程入建康');
});

test('the last phase and non-phase saves have nothing to continue to', async () => {
  const q = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const last = await endedSave(3, PHASE3_END);
  assert.equal(q.isNanhuangDemoFinished(last), true);
  assert.equal(q.nextNanhuangPhase(last), undefined);
  assert.equal(q.withNextNanhuangPhase(last), null);
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  assert.equal(q.withNextNanhuangPhase(createQingyuOpeningPlaytestSave(await stage01())), null);
});

test('the finished card offers the continue button only when a next phase exists, and the entry page applies a chosen phase 2', async () => {
  const panel = await read('src/components/dashboard/MainGamePanel.vue');
  assert.match(panel, /v-if="nextPlaytestPhase"[^>]*@click="continueToNextPhase"/);
  assert.doesNotMatch(panel, /进度已保留，可返回入口选择下一期重新试玩/);
  const view = await read('src/views/QingyuOpeningPlaytestStartView.vue');
  assert.match(view, /nanhuangPhaseNumber\(gameStateStore\.toSaveData\(\)\) < nanhuangPhase\.value\)[\s\S]*continueToNextPlaytestPhase\(\)/);
  assert.match(view, /<option :value="3">三期/);
  assert.match(await read('src/stores/gameStateStore.ts'), /async continueToNextPlaytestPhase\(\)/);
});

test('pack playtest: loading a manual slot re-attaches the working copy to the fixed playtest slot; the manual slot is not the autosave target', async () => {
  const persist = await loadTs('../src/utils/isolatedPlaytestPersist.ts');
  const { QINGYU_OPENING_PLAYTEST_KIND, QINGYU_OPENING_PLAYTEST_SLOT } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const profile = { 模式: '单机', 隔离试玩信息: { kind: QINGYU_OPENING_PLAYTEST_KIND, localOnly: true }, 存档列表: {} };
  assert.equal(persist.packPlaytestWorkingSlot(profile, 'r4-鬼巫王战'), QINGYU_OPENING_PLAYTEST_SLOT);
  assert.equal(persist.packPlaytestWorkingSlot(profile, QINGYU_OPENING_PLAYTEST_SLOT), null, '读固定试玩槽本身：不用接回');
  assert.equal(persist.packPlaytestWorkingSlot({ 模式: '单机' }, '手动档'), null, '正式角色不受影响');
  assert.equal(persist.packPlaytestWorkingSlot({ 隔离试玩信息: { kind: QINGYU_OPENING_PLAYTEST_KIND } }, '手动档'), null, '不是本地隔离档不受影响');
  const landing = await loadTs('../src/modules/scenarioMods/xingyuehuLandingPlaytest.ts');
  assert.equal(persist.packPlaytestWorkingSlot({ 隔离试玩信息: { kind: landing.XINGYUEHU_LANDING_PLAYTEST_KIND, localOnly: true } }, 'R3-检查点A'), null, '落地试玩走它自己的接回逻辑');
  const checkpoint = { 系统: { 扩展: { 战斗检查点来源: { newSceneReady: true } } } };
  assert.equal(persist.packPlaytestWorkingSlot(profile, 'F10-before', checkpoint), null, '战斗检查点走它自己的保护');
  assert.equal(persist.packPlaytestWorkingSlot(profile, 'r4-鬼巫王战', { 系统: { 扩展: {} } }), QINGYU_OPENING_PLAYTEST_SLOT);
});

test('loadGame uses the pack working slot as the active (autosave) slot', async () => {
  const store = await read('src/stores/characterStore.ts');
  assert.match(store, /packPlaytestWorkingSlot\(profile, slotKey, targetSlot\.存档数据\)/);
  assert.match(store, /const workingKey = reattachKey;[\s\S]{0,900}activeSlotKey = workingKey;/);
});
