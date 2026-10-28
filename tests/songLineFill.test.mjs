// 宋线补全（剧情策划 2026-10-28 五线补全·宋 S1–S30；用户 2026-10-28 01:26 授权）：用真实关卡数据跑引擎，
// 证明默认路线上宋线五关（江州两关、临安、小瀛洲、临安收束）每拍都会被激活、按 rail 原著序完成并收到 stage_ready；
// 新首章「初抵临安」是 rail 章，风波亭按谢艺生死／是否结识出对应文案。
// 原首章「临安疑线」不再成为当前章：其中 6 张登场卡与「薛延山遇害」随迁进首章，否则永远不激活（同唐线 83fa2107）。
// 线卡逐步推进见 lineCompassAxisOrder.test.mjs。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
const { CANON_RAIL_PROFILES } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
const view = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
const stageOf = id => JSON.parse(fs.readFileSync(`src/modules/scenarioMods/builtins/data/${id}.json`, 'utf8'));

/** 跟着主线（rail 拍优先）逐拍完成，返回完成顺序与是否 stage_ready。 */
function playthrough(stageId) {
  const mod = stageOf(stageId);
  const rail = CANON_RAIL_PROFILES.find(p => p.modId === stageId).orderedEventIds;
  const progress = rtm.createScenarioProgress(mod);
  progress.flags = { ...(mod.scenario.initialFlags || {}) };
  progress.worldTurn = 0;
  progress.modId = stageId;
  progress.currentChapterId = rtm.getInitialScenarioChapterId(mod);
  progress.nextStageId = 'NEXT';
  const order = [];
  let save = rtm.advanceScenarioRuntime({ 世界: { 状态: { 剧本模组: progress } } }).saveData;
  for (let turn = 1; turn <= 120; turn++) {
    const runtime = save.世界.状态.剧本模组;
    if (runtime.nextStageReadyId) return { ready: true, order, firstChapter: progress.currentChapterId };
    const active = [...(runtime.activeEventIds || [])];
    if (!active.length) break;
    const pick = active.find(id => rail.includes(id)) || active[0];
    const event = mod.scenario.events.find(e => e.id === pick);
    for (const c of event.completion) runtime.flags[c.path.slice('flags.'.length)] = c.value;
    order.push(pick);
    save = rtm.advanceScenarioRuntime(save).saveData;
  }
  return { ready: false, order, firstChapter: progress.currentChapterId };
}

const FILLED = {
  'lcq.stage_10_jiangzhou_shadow_war': ['lcq.event.yeying_seat_struggle'],
  'lcq.stage_12_jiangzhou_counterwar': ['lcq.event.jin_vacate_jiangzhou', 'lcq.event.tuntian_post', 'lcq.event.pengyi_takeover'],
  'lyl.lin_an_bridge': ['linan_arrive_fengbo', 'tail_li_shishi', 'survey_wumu_mansion', 'evade_huangchengsi', 'mingqingsi_lin_lu_meeting',
    'decode_bianmenwa_note', 'weiyuan_extortion', 'libu_registration', 'meet_xue_yanshan', 'blacksea_iron_puppet', 'identify_xue_cold_poison',
    'leifeng_pagoda_invite', 'leifeng_repel_gao', 'decide_chase_weiyuan', 'pass_kotian_stone', 'ivory_visit_weiyuan', 'siying_lane_saber_ambush']
    .map(id => `lyl.event.${id}`),
  'lyl.xiaoyingzhou_blacksea_trap': ['linjia_sees_ningyi', 'xihu_villa_eavesdrop', 'xiaoyingzhou_paper_plan', 'xiaoyingzhou_paper_mint',
    'xiaoyingzhou_lin_takes_seat', 'song_baochao_appointed', 'xiaoyingzhou_cement_truce'].map(id => `lyl.event.${id}`),
  'lyl.taiquan_sacred_fruit': ['lyl.event.sacred_against_lin', 'lyl.event.sacred_jin_drought'],
};

for (const [stageId, ids] of Object.entries(FILLED)) {
  test(`宋线补全：${stageId} 跟着主线走，补上的拍逐一激活、按 rail 序完成，最后 stage_ready`, () => {
    const out = playthrough(stageId);
    assert.equal(out.ready, true, `${stageId} 走不到 stage_ready（完成 ${out.order.length} 拍）`);
    const rail = CANON_RAIL_PROFILES.find(p => p.modId === stageId).orderedEventIds;
    assert.deepEqual(out.order.filter(id => rail.includes(id)), rail, 'rail 拍按 rail 序逐一完成');
    for (const id of ids) assert.ok(out.order.includes(id), `${id} 被激活并完成`);
  });
}

const LINAN_DEBUTS = ['debut_yundanliu', 'debut_yunruyao', 'debut_zhaohede', 'debut_yinfulan', 'debut_jingli', 'debut_jianyuji']
  .map(id => `lyl.event.${id}`);
const XUE_SLAIN = 'lyl.event.xue_yanshan_slain';
const LINAN_MIGRATED = [...LINAN_DEBUTS, XUE_SLAIN];

test('宋线补全：临安首章「初抵临安」是 rail 章，开关第一拍就是入钱塘门·风波亭；侧栏章名按拍分「初抵临安／临安疑线」', () => {
  const mod = stageOf('lyl.lin_an_bridge');
  const [arrival, intel] = mod.scenario.chapters;
  assert.equal(rtm.getInitialScenarioChapterId(mod), arrival.id);
  assert.equal(CANON_RAIL_PROFILES.find(p => p.modId === mod.manifest.id).chapterId, arrival.id);
  assert.equal(playthrough(mod.manifest.id).order[0], 'lyl.event.linan_arrive_fengbo');
  assert.deepEqual(intel.activation, [{ path: 'flags.chapter.lyl.lin_an_bridge.arrival.done', operator: 'eq', value: true }]);
  const arrivalRail = arrival.eventIds.filter(id => view.LIN_AN_ARRIVAL_EVENT_IDS.has(id));
  assert.deepEqual([...view.LIN_AN_ARRIVAL_EVENT_IDS].sort(), [...arrivalRail].sort(), '章名表与首章承重拍同步');
  for (const id of arrivalRail) assert.equal(view.storyChapterTitle(mod.manifest.id, id, arrival.title), '初抵临安');
  for (const id of arrival.eventIds) {
    if (!view.LIN_AN_ARRIVAL_EVENT_IDS.has(id)) assert.equal(view.storyChapterTitle(mod.manifest.id, id, arrival.title), '临安疑线');
  }
  for (const id of intel.eventIds) assert.equal(view.storyChapterTitle(mod.manifest.id, id, arrival.title), '临安疑线');
});

test('宋线临安：换首章后原首章 6 张登场卡与薛延山遇害随迁进 rail 章，新首章路径下可达', () => {
  const stageId = 'lyl.lin_an_bridge';
  const mod = stageOf(stageId);
  const [arrival, intel] = mod.scenario.chapters;
  const rail = CANON_RAIL_PROFILES.find(p => p.modId === stageId).orderedEventIds;
  assert.equal(arrival.id, 'lyl.chapter.lin_an_bridge_arrival');
  assert.equal(CANON_RAIL_PROFILES.find(p => p.modId === stageId).chapterId, arrival.id, 'runtime 只在 rail 章里激活非 rail 拍');
  for (const id of LINAN_MIGRATED) {
    assert.ok(arrival.eventIds.includes(id) && !intel.eventIds.includes(id), `${id} 随迁到初抵临安，不留在不再成为当前章的临安疑线`);
    assert.equal(view.storyChapterTitle(stageId, id, arrival.title), '临安疑线');
  }
  for (const id of LINAN_DEBUTS) {
    assert.deepEqual(mod.scenario.events.find(e => e.id === id).conditions, [], `${id}：debutCardGating 欠账，本次不加门`);
  }
  assert.deepEqual(mod.scenario.events.find(e => e.id === XUE_SLAIN).conditions, [
    { path: 'flags.event.blacksea_iron_puppet.done', operator: 'eq', value: true },
  ], '薛延山遇害的开放时点＝原临安疑线开章（首章承重拍走完，即江州铁傀儡场外拍完成）');

  /** preferMigrated：活跃的随迁拍优先完成，证明能落账；否则跟主线走，记下每拍完成前的活跃列表。 */
  function walk(preferMigrated) {
    const progress = rtm.createScenarioProgress(mod);
    progress.flags = { ...(mod.scenario.initialFlags || {}) };
    progress.worldTurn = 0;
    progress.modId = stageId;
    progress.currentChapterId = rtm.getInitialScenarioChapterId(mod);
    progress.nextStageId = 'NEXT';
    const order = [];
    const activeBefore = new Map();
    const settled = [];
    let save = rtm.advanceScenarioRuntime({ 世界: { 状态: { 剧本模组: progress } } }).saveData;
    for (let turn = 1; turn <= 80; turn++) {
      const runtime = save.世界.状态.剧本模组;
      if (runtime.nextStageReadyId) return { ready: true, order, activeBefore, settled, save };
      const active = [...(runtime.activeEventIds || [])];
      if (!active.length) return { ready: false, order, activeBefore, settled, save };
      const migrated = preferMigrated ? LINAN_MIGRATED.find(id => active.includes(id) && !settled.includes(id)) : undefined;
      const pick = migrated || active.find(id => rail.includes(id)) || active[0];
      activeBefore.set(pick, active);
      const event = mod.scenario.events.find(e => e.id === pick);
      for (const c of event.completion) runtime.flags[c.path.slice('flags.'.length)] = c.value;
      order.push(pick);
      if (LINAN_MIGRATED.includes(pick)) settled.push(pick);
      runtime.worldTurn += 1;
      save = rtm.advanceScenarioRuntime(save).saveData;
      if (LINAN_MIGRATED.includes(pick)) {
        const after = save.世界.状态.剧本模组;
        assert.ok(after.completedEventIds.includes(pick), `${pick} 落完成旗后进入 completedEventIds`);
        assert.ok(!after.activeEventIds.includes(pick), `${pick} 完成后离开活跃列表`);
      }
    }
    return { ready: false, order, activeBefore, settled, save };
  }

  const timed = walk(false);
  const first = 'lyl.event.linan_arrive_fengbo';
  for (const id of LINAN_DEBUTS) assert.ok(timed.activeBefore.get(first).includes(id), `${id} 关一开即开放（不随迁就永远不激活）`);
  for (const id of view.LIN_AN_ARRIVAL_EVENT_IDS) assert.ok(!timed.activeBefore.get(id).includes(XUE_SLAIN), `${id} 时薛延山遇害还没开放`);
  assert.ok(timed.activeBefore.get('lyl.event.identify_xue_cold_poison').includes(XUE_SLAIN), '江州铁傀儡场外拍完成（原临安疑线开章）后薛延山遇害开放');

  const done = walk(true);
  assert.deepEqual(done.settled, LINAN_MIGRATED, '7 个事件都在新首章路径上被激活并完成');
  assert.equal(done.ready, true, '随迁拍完成后主线仍能 stage_ready');
  assert.deepEqual(done.order.filter(id => rail.includes(id)), rail, 'rail 拍仍按 rail 序完成');
});

test('宋线补全：风波亭按谢艺生死与是否结识出文案——死亡线拜祭谢艺、长养线无谢艺墓、未识不出谢艺', () => {
  const event = stageOf('lyl.lin_an_bridge').scenario.events.find(e => e.id === 'lyl.event.linan_arrive_fengbo');
  const met = { acquaintances: { 'liuchao.character.xie_yi': { kind: 'encountered' } } };
  const dead = view.resolveScenarioEventNarrative(event, {}, undefined, met);
  assert.match(dead.description, /谢艺的墓/);
  const alive = view.resolveScenarioEventNarrative(event, { 'branch.lcq.if_xieyi_longrest.active': true }, undefined, met);
  assert.match(alive.description, /不得出现谢艺墓/);
  assert.equal(view.narrativeVariantReplacesCanonRail(event, { 'branch.lcq.if_xieyi_longrest.active': true }, undefined, met), true);
  const stranger = view.resolveScenarioEventNarrative(event, {}, undefined, { acquaintances: {} });
  assert.match(stranger.description, /不出谢艺的名字/);
  assert.equal(view.narrativeVariantReplacesCanonRail(event, {}, undefined, { acquaintances: {} }), false, '未识只是条件化文案，不关闭 Canon Rail');
});
