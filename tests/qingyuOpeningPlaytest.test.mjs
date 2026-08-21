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

test('开场已呈现的穿越事实直接落账，第一屏进入段强遇袭压力', async () => {
  // 真机实测发现的缺口：不预跑的话第一屏任务栏只有「章节：第1章·穿越」，
  // 没有 objective 也没有完成合同按钮——因为激活发生在 advanceScenarioRuntime 内部。
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const mod = await loadStage();
  const runtime = createQingyuOpeningPlaytestSave(mod).世界.状态.剧本模组;
  assert.equal(runtime.flags['event.s01_01.done'], true, '开场正文已经呈现的穿越事实应直接落账');
  assert.ok(runtime.completedEventIds.includes('lcq.event.s01_01'), '穿越拍应进入完成账本');
  assert.deepEqual(runtime.activeEventIds, ['lcq.event.s01_02'], '第一屏应直接进入会自行推进的段强遇袭压力');
  assert.equal(runtime.storyMode, undefined, 'demo 必须留在 canon_companion，否则完成合同按钮不出现');
});

test('Demo 五拍自然行动词保持保守，世界压力与场外结算时钟不变', async () => {
  const mod = await loadStage();
  const events = new Map(mod.scenario.events.map(event => [event.id, event]));
  for (const id of ['lcq.event.s01_02', 'lcq.event.s01_03', 'lcq.event.s01_04', 'lcq.event.s01_05', 'lcq.event.s01_06']) {
    const action = events.get(id)?.playerCompletionContract?.actions?.[0];
    assert.ok(action?.intentMatch?.matchAny?.length, `${id} 应声明自然行动正向短语`);
    assert.ok(action?.intentMatch?.rejectIf?.length, `${id} 应声明否定优先短语`);
  }
  assert.equal(events.get('lcq.event.s01_02')?.pressure?.afterTurns, 1);
  assert.equal(events.get('lcq.event.s01_02')?.offscreenResolution?.afterStallTurns, 4);
  assert.equal(events.get('lcq.event.s01_04')?.pressure?.afterTurns, 1);
  assert.equal(events.get('lcq.event.s01_04')?.offscreenResolution?.afterStallTurns, 5);
  assert.equal(events.get('lcq.event.s01_03')?.offscreenResolution, undefined);
  assert.equal(events.get('lcq.event.s01_05')?.offscreenResolution, undefined);
  assert.equal(events.get('lcq.event.s01_06')?.offscreenResolution, undefined);
});

test('开场正文不得剧透后续拍，也不得出现机制术语', async () => {
  // 2026-08-19：初版开场把十八拍全列了出来（段强之死、王哲传功、五原城落为奴隶…），
  // 还写了「Canon Rail 钉死」「任务栏会给出当前合同」「两处绝路会直接结束本局」——
  // 制作人一进游戏就看到了。这些话属于**入口卡片**，不属于叙事面。
  // 与本项目清理 objective 的规矩同源：玩家看到的东西里不许有开发者语言与剧透。
  const mod = await loadStage();
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const save = createQingyuOpeningPlaytestSave(mod);
  const opening = (save.系统?.历史?.叙事 || []).map(entry => [entry?.content, ...(entry?.actionOptions || [])].join(' ')).join('\n');
  assert.ok(opening.length > 40, '开场正文不应为空');

  // 机制术语：玩家不该在正文里读到系统怎么运作
  for (const term of ['Canon Rail', '合同', '按钮', '任务栏', '回合', '拍', '本局']) {
    assert.ok(!opening.includes(term), `开场正文出现机制术语「${term}」`);
  }
  // 后续拍的剧透：这些人和事在第一拍都还没发生
  for (const term of ['段强之死', '王哲', '月霜', '太乙', '五原城', '苏妲己', '炮烙', '奴隶', '自爆']) {
    assert.ok(!opening.includes(term), `开场正文剧透了后续内容「${term}」`);
  }
});
