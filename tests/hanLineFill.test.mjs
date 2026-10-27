// 汉线补全（剧情策划 2026-10-28 五线补全·汉 H1–H20；用户 2026-10-28 01:26 授权）：用真实关卡数据跑引擎，
// 证明默认路线上汉线五关（太泉余波、洛都、汉宫、定陶、秘境）每拍都会被激活、按 rail 原著序完成并收到 stage_ready；
// 汉宫新首章「宫变之夜」是 rail 章，洛都第二章「洛都风云」的拍单标章名；真空传闻／拥立选择两条条件拍只挂章不上 rail。
// 线卡逐步推进见 lineCompassAxisOrder.test.mjs。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
const { CANON_RAIL_PROFILES } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
const view = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
const stageOf = id => JSON.parse(fs.readFileSync(`src/modules/scenarioMods/builtins/data/${id}.json`, 'utf8'));
const railOf = id => CANON_RAIL_PROFILES.find(p => p.modId === id);

/** 跟着主线（rail 拍优先）逐拍完成，返回完成顺序与是否 stage_ready。 */
function playthrough(stageId) {
  const mod = stageOf(stageId);
  const rail = railOf(stageId).orderedEventIds;
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
    if (runtime.nextStageReadyId) return { ready: true, order };
    const active = [...(runtime.activeEventIds || [])];
    if (!active.length) break;
    const pick = active.find(id => rail.includes(id)) || active[0];
    const event = mod.scenario.events.find(e => e.id === pick);
    for (const c of event.completion) runtime.flags[c.path.slice('flags.'.length)] = c.value;
    order.push(pick);
    save = rtm.advanceScenarioRuntime(save).saveData;
  }
  return { ready: false, order };
}

const lyl = id => `lyl.event.${id}`;
const NIGHT = ['lvji_defiles_consort', 'emperor_death_spreads', 'arrange_escape_route', 'liujian_takes_nangong',
  'changqiu_palace_defense', 'bounty_and_hu_cavalry', 'han_jianyu_refused', 'lvfengxian_breaks_line'].map(lyl);
const FILLED = {
  'lyl.taiquan_afterfall': ['han_shouyang_gaoyanei', 'han_wudu_bingsi', 'jin_guangyuan_ledger', 'han_court_grain_blame'].map(lyl),
  'lyl.luoyang_cloud_secret': ['han_yuedan_ping', 'han_huo_villa', 'han_xingyue_framed', 'han_limit_field'].map(lyl),
  'lyl.han_palace_endgame': NIGHT,
  'lyg.dingtao_beijing': ['lyg.event.han_marquis_wuyang_enfeoff'],
  'lyg.mijing_rumen': ['lyg.event.mijing_superuser_roster'],
};

for (const [stageId, ids] of Object.entries(FILLED)) {
  test(`汉线补全：${stageId} 跟着主线走，补上的拍逐一激活、按 rail 序完成，最后 stage_ready`, () => {
    const out = playthrough(stageId);
    assert.equal(out.ready, true, `${stageId} 走不到 stage_ready（完成 ${out.order.length} 拍）`);
    // 定陶关开局 s01_01–s01_04 的完成旗即为 true（initialFlags），不经玩家手
    const mod = stageOf(stageId);
    const preset = id => mod.scenario.events.find(e => e.id === id).completion.every(c => mod.scenario.initialFlags[c.path.slice('flags.'.length)] === c.value);
    const rail = railOf(stageId).orderedEventIds.filter(id => !preset(id));
    assert.deepEqual(out.order.filter(id => rail.includes(id)), rail, 'rail 拍按 rail 序逐一完成');
    for (const id of ids) assert.ok(out.order.includes(id), `${id} 被激活并完成`);
  });
}

test('汉线补全：rail 插入位置按原著序——718 抵舞都先于云如瑶私奔、898 赏格先于回绝剑玉姬、舞阳侯（979）在 s01_08 与 s01_09 之间、冰冰验名单接 s02_09', () => {
  const short = stageId => railOf(stageId).orderedEventIds.map(id => id.split('.').pop());
  assert.deepEqual(short('lyl.taiquan_afterfall').slice(4, 14), [
    'taiquan_afterfall_05_beat', 'han_shouyang_gaoyanei', 'taiquan_afterfall_06_beat', 'taiquan_afterfall_07_beat',
    'han_wudu_bingsi', 'jin_guangyuan_ledger', 'taiquan_afterfall_08_beat', 'taiquan_afterfall_09_beat', 'han_court_grain_blame', 'taiquan_afterfall_10_beat',
  ]);
  assert.deepEqual(short('lyl.luoyang_cloud_secret').slice(8), ['s05_09', 'han_yuedan_ping', 'han_huo_villa', 'han_xingyue_framed', 'han_limit_field']);
  assert.deepEqual(railOf('lyl.han_palace_endgame').orderedEventIds.slice(0, 9), [...NIGHT, lyl('han_palace_endgame_01_beat')]);
  assert.deepEqual(short('lyg.dingtao_beijing').slice(7), ['s01_08', 'han_marquis_wuyang_enfeoff', 's01_09']);
  assert.deepEqual(short('lyg.mijing_rumen').slice(-2), ['s02_09', 'mijing_superuser_roster']);
});

test('汉线补全：汉宫首章「宫变之夜」是 rail 章，开关第一拍是藻井；汉宫突入章接在它之后；侧栏章名按拍分', () => {
  const mod = stageOf('lyl.han_palace_endgame');
  const [night, palace, endgame] = mod.scenario.chapters;
  assert.equal(night.id, 'lyl.chapter.han_palace_endgame_night');
  assert.equal(rtm.getInitialScenarioChapterId(mod), night.id);
  assert.equal(railOf(mod.manifest.id).chapterId, night.id, 'runtime 只在 rail 章里激活 rail 拍');
  assert.equal(playthrough(mod.manifest.id).order[0], lyl('lvji_defiles_consort'));
  assert.deepEqual(palace.activation, [{ path: 'flags.chapter.lyl.han_palace_endgame.night.done', operator: 'eq', value: true }]);
  assert.deepEqual([...view.HAN_PALACE_NIGHT_EVENT_IDS].sort(), [...night.eventIds].sort(), '章名表与关卡数据同步');
  for (const id of night.eventIds) assert.equal(view.storyChapterTitle(mod.manifest.id, id, night.title), '宫变之夜');
  for (const id of [...palace.eventIds, ...endgame.eventIds]) assert.equal(view.storyChapterTitle(mod.manifest.id, id, night.title), '汉宫突入');
});

test('汉线补全：真空传闻／拥立选择是「没亲历宫变之夜」的条件拍——挂汉宫突入章、不上 rail，默认路线不激活也不挡切关', () => {
  const mod = stageOf('lyl.han_palace_endgame');
  const palace = mod.scenario.chapters.find(c => c.id === 'lyl.chapter.han_palace_endgame_palace');
  const rail = railOf(mod.manifest.id).orderedEventIds;
  for (const [id, gate] of [['han_power_vacuum', 'lvji_defiles_consort'], ['han_sponsor_dingtao', 'arrange_escape_route']]) {
    assert.ok(palace.eventIds.includes(lyl(id)), `${id} 挂汉宫突入章`);
    assert.ok(!rail.includes(lyl(id)), `${id} 不上 rail`);
    assert.deepEqual(mod.scenario.events.find(e => e.id === lyl(id)).conditions, [{ path: `flags.event.${gate}.done`, operator: 'neq', value: true }]);
    assert.ok(rail.includes(lyl(gate)), `${gate} 在 rail 上，默认路线必先完成`);
  }
  const out = playthrough(mod.manifest.id);
  assert.equal(out.ready, true);
  assert.ok(!out.order.includes(lyl('han_power_vacuum')) && !out.order.includes(lyl('han_sponsor_dingtao')));
});

test('汉线补全：洛都 rail 章仍是首章，「洛都风云」第二章的拍单标章名；新章在首章完成后才开', () => {
  const mod = stageOf('lyl.luoyang_cloud_secret');
  const [first, court] = mod.scenario.chapters;
  assert.equal(railOf(mod.manifest.id).chapterId, first.id);
  assert.equal(court.id, 'lyl.chapter.luoyang_cloud_secret_court');
  assert.deepEqual(court.activation, first.completion);
  assert.deepEqual([...view.LUOYANG_COURT_EVENT_IDS].sort(), [...court.eventIds].sort(), '章名表与关卡数据同步');
  for (const id of court.eventIds) assert.equal(view.storyChapterTitle(mod.manifest.id, id, first.title), '洛都风云');
  for (const id of first.eventIds) assert.equal(view.storyChapterTitle(mod.manifest.id, id, first.title), first.title);
});

test('汉线补全：新建五拍 axisId 待补轴、critical、有地点与本地完成合同；下首阳边境版只在并行入点置旗时出', () => {
  const NEW = {
    'lyl.taiquan_afterfall': [['han_shouyang_gaoyanei', 718], ['han_wudu_bingsi', 730]],
    'lyl.luoyang_cloud_secret': [['han_yuedan_ping', 790], ['han_huo_villa', 800]],
    'lyg.dingtao_beijing': [['han_marquis_wuyang_enfeoff', 979]],
  };
  for (const [stageId, list] of Object.entries(NEW)) {
    const mod = stageOf(stageId);
    for (const [id, seq] of list) {
      const event = mod.scenario.events.find(e => e.id.endsWith(`.${id}`));
      assert.ok(event, id);
      assert.equal(event.axisId, null, `${id}：canon 轴待补，不猜造`);
      assert.equal(event.axisMethod, 'han-line-fill-axis-pending');
      assert.equal(event.axisSeq, seq, id);
      assert.equal(event.critical, true);
      assert.ok(event.locationId && mod.canon.locations.some(l => l.id === event.locationId), `${id} 地点在本关 canon`);
      for (const c of event.relatedCharacterIds) assert.ok(mod.canon.characters.some(x => x.id === c), `${id} 人物 ${c} 在本关 canon`);
      assert.equal(event.playerCompletionContract.kind, 'objective_action');
      assert.equal(mod.scenario.initialFlags[event.completion[0].path.slice('flags.'.length)], false, `${id} 完成旗有初值`);
    }
  }
  const h1 = stageOf('lyl.taiquan_afterfall').scenario.events.find(e => e.id === lyl('han_shouyang_gaoyanei'));
  assert.match(view.resolveScenarioEventNarrative(h1, { 'event.taiquan_afterfall_05.done': true }).description, /出了太泉古阵/);
  const border = view.resolveScenarioEventNarrative(h1, { 'branch.lyl.han_border_entry.active': true });
  assert.match(border.description, /由边境入汉/);
  assert.match(border.description, /不得写出太泉古阵/);
});
