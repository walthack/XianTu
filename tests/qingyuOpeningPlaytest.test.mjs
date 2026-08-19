import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url);

async function loadStage() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  return parseScenarioMod(JSON.parse(await readFile(stageUrl, 'utf8')));
}

test('qingyu opening playtest save is isolated canon_companion with player completion contracts', async () => {
  const mod = await loadStage();
  const {
    createQingyuOpeningPlaytestSave,
    isQingyuOpeningPlaytestSave,
    QINGYU_OPENING_PLAYTEST_EVENT_IDS,
    QINGYU_OPENING_PLAYTEST_KIND,
    QINGYU_OPENING_PLAYTEST_MOD_ID,
  } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { advanceScenarioRuntime, getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');

  const save = createQingyuOpeningPlaytestSave(mod, '2026-08-19T00:00:00.000Z');
  const runtime = save.世界.状态.剧本模组;

  assert.equal(isQingyuOpeningPlaytestSave(save), true);
  assert.equal(save.系统.扩展.清羽记开局.kind, QINGYU_OPENING_PLAYTEST_KIND);
  assert.equal(save.系统.扩展.六朝世界试玩, undefined);
  assert.equal(runtime.modId, QINGYU_OPENING_PLAYTEST_MOD_ID);
  assert.notEqual(runtime.storyMode, 'world_sim');
  assert.equal(save.系统.扩展.剧本模组.storyMode, undefined);
  assert.equal(save.角色.身份.名字, '程宗扬');
  assert.equal(QINGYU_OPENING_PLAYTEST_EVENT_IDS.length, 18);
  assert.equal(save.系统.扩展.清羽记开局.eventIds.at(-1), 'lcq.event.baihu_shangguan_escape');

  const advanced = advanceScenarioRuntime(save).saveData;
  const actions = getCurrentStoryEventActions(advanced);
  assert.ok(actions.length > 0, 'canon_companion 开局应出现完成合同按钮');
});

test('开局第一屏就有目标：建档时已预跑激活，不必等玩家先发一轮', async () => {
  // 真机实测发现的缺口：不预跑的话第一屏任务栏只有「章节：第1章·穿越」，
  // 没有 objective 也没有完成合同按钮——因为激活发生在 advanceScenarioRuntime 内部。
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const mod = await loadStage();
  const runtime = createQingyuOpeningPlaytestSave(mod).世界.状态.剧本模组;
  assert.deepEqual(runtime.activeEventIds, ['lcq.event.s01_01'], '建档后首拍必须已经激活');
  assert.equal(runtime.storyMode, undefined, 'demo 必须留在 canon_companion，否则完成合同按钮不出现');
});

