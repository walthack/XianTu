// 常驻整链测试：正式新档沿默认主链，只用结构化动作（合同动作 / 机会动作 / 本地选择 / 等待 + settleActionTime + advanceScenarioRuntime
// + transitionToNextScenarioStage）从 lcq.stage_01 推到终关 rail 走完，并能开始大祭。
// 推进循环在 tests/mainlineWalker.mjs（照抄 scripts/generate-qin-replay-fixtures.mjs，出处见该文件头）；不补写 completedEventIds/flags/activeEventIds。
// 期望关序列从数据推导（stage_01 沿 manifest.nextStageId，跳过 DEFAULT_LINE_QUARANTINED_STAGE_IDS），不手写关 id。
// 若以后某关走不下去：walker 停在那一关（outcome=stuck/error），本测试打印每关摘要并失败；修卡点前不要把期望改成现状以外的东西。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';
import { walkMainline, expectedMainline, unsettledRailBeats, rt } from './mainlineWalker.mjs';

const CR = await loadTs('../src/modules/scenarioMods/canonRail.ts');
const F = await loadTs('../src/modules/scenarioMods/heimohaiFestival.ts');
const { validateSaveDataV3 } = await loadTs('../src/utils/saveValidationV3.ts');
const { assertEntitySaveFormat } = await loadTs('../src/modules/scenarioMods/entitySaveFormat.ts');
const NUMBERS = JSON.parse(readFileSync(new URL('../mod-kit/numbers-progress.json', import.meta.url), 'utf8'));
const FINAL = F.FESTIVAL.finalStageId;
const START = 'lcq.stage_01';

const progress = save => {
  const s = rt(save);
  return { modId: s.modId, completed: s.completedEventIds, active: s.activeEventIds, offscreen: s.offscreenResolvedEventIds ?? [],
    flags: s.flags, nextStageReadyId: s.nextStageReadyId ?? null, gameOver: !!s.gameOver, chronicle: s.chronicle,
    festivalStarted: save.系统?.扩展?.festivalStarted ?? null, location: save.角色.位置 };
};
const valid = (save, label) => {
  const v = validateSaveDataV3(save);
  assert.equal(v.isValid, true, `${label}: ${JSON.stringify(v)}`);
  assert.doesNotThrow(() => assertEntitySaveFormat(save), label);
};

test('正式新档沿默认主链用结构化动作推进到终关 rail 走完，并能开始大祭', { timeout: 180000 }, async t => {
  const t0 = Date.now();
  const { save, mods, stages, stop } = await walkMainline({ finalStageId: FINAL });
  const report = () => JSON.stringify({ ms: Date.now() - t0, stop, stages: stages.map(s => ({ id: s.id, enterStep: s.enterStep, enterTurn: s.enterTurn,
    exitTurn: s.exitTurn, steps: s.steps, completed: s.completed, offscreen: s.offscreen, railLength: s.railLength, kinds: s.kinds,
    entryActionable: s.entryActionable, unsettledAtExit: s.unsettledAtExit, readyAtExit: s.readyAtExit })) }, null, 1);
  t.diagnostic(`walk ${Date.now() - t0}ms, ${stop.steps} steps, ${stages.length} stages, outcome=${stop.outcome}`);
  try {
    // 0：走完，不卡、不抛错、不 gameOver。
    assert.equal(stop.error, null, '推进抛错');
    assert.equal(stop.outcome, 'done', `walker 未走完：停在 ${stop.stage} 焦点 ${stop.focus}，未结算 ${JSON.stringify(stop.unsettled)}`);
    assert.equal(stop.gameOver, false);

    // a：途经关序列 = 数据推导的默认主链；途经关数 = 内置关数 − 链上隔离关数（链覆盖全部内置关时即 37 − 隔离关数）。
    const expected = expectedMainline(mods, START);
    assert.equal(expected.visited.at(-1), FINAL, '默认主链末关应是大祭终关');
    assert.deepEqual(stages.map(s => s.id), expected.visited);
    const chainIds = new Set([...expected.visited, ...expected.skipped]);
    assert.equal(chainIds.size, mods.length, '主链（含隔离关）应覆盖全部内置关');
    const quarantinedBuiltins = mods.filter(m => CR.isDefaultLineQuarantinedStageId(m.manifest.id)).map(m => m.manifest.id);
    assert.deepEqual([...expected.skipped].sort(), [...quarantinedBuiltins].sort(), '隔离集合里的内置关应全部在主链上被跳过');
    assert.equal(stages.length, mods.length - quarantinedBuiltins.length);

    // b：每关进入后有可执行动作；离关前 rail 全结算、nextStageReadyId 已就绪且等于本关 nextStageId；末关 rail 走完。
    for (const [i, s] of stages.entries()) {
      assert.ok(s.entryActionable.length > 0, `${s.id} 进入后没有可执行动作`);
      assert.ok(s.railLength > 0, `${s.id} 没有 rail`);
      if (i < stages.length - 1) {
        assert.deepEqual(s.unsettledAtExit, [], `${s.id} 切关前 rail 未结算`);
        assert.ok(s.readyAtExit, `${s.id} 切关前 nextStageReadyId 未就绪`);
        assert.equal(s.readyAtExit, s.nextStageIdAtExit, `${s.id} 就绪的不是本关 nextStageId`);
        assert.equal(s.kinds.stage, 1, `${s.id} 切关次数`);
      }
    }
    assert.deepEqual(unsettledRailBeats(rt(save)), []);
    assert.equal(rt(save).modId, FINAL);

    // c：终关 rail 走完后大祭可开始；tick 来源不能开。
    const view = F.festivalView(save);
    assert.equal(view.available, true, `大祭不可用：${JSON.stringify(view)}`);
    assert.equal(view.blocked, '');
    assert.equal(F.startHeimohaiFestival(structuredClone(save), { source: 'tick', actionId: F.FESTIVAL.actionId }).ok, false);
    valid(save, '终关走完');
    const started = F.startHeimohaiFestival(save, { source: 'player', actionId: F.FESTIVAL.actionId });
    assert.equal(started.ok, true, JSON.stringify(started));
    assert.equal(save.系统.扩展.festivalStarted, true);
    assert.ok(rt(save).completedEventIds.includes(F.FESTIVAL.eventId));
    assert.equal(F.festivalView(save).available, false);
    assert.equal(F.festivalView(save).transition, F.FESTIVAL.transition);

    // d：存档校验 + JSON 往返再读一致。
    valid(save, '大祭开始后');
    const reread = JSON.parse(JSON.stringify(save));
    valid(reread, 'JSON 往返');
    assert.deepEqual(progress(reread), progress(save));
    assert.deepEqual(rt(reread).events, rt(save).events);
    assert.deepEqual(F.festivalView(reread), F.festivalView(save));
  } catch (error) {
    console.error(`[mainline-walk] 摘要：\n${report()}`);
    throw error;
  }
});
