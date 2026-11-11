// 宋线 S4：宋线数据从框架 TS 搬进 packs/song 之后的结构断言（逐项内容相等由 songPackSnapshot／songReplayFixtures／qinReplayFixtures 兜住）。
// - CANON_RAIL_PROFILES 的数组顺序与搬迁前相同（期望是搬迁前在 ea724c15 上导出的 modId 顺序）、modId 不重复；
// - 宋 8 关的关／事件／章 id 不再写在 canonRail.ts、eventNarrativeView.ts、musicLibrary.ts、fixedQuestObjectives.ts、milestoneRewards.ts 里；
// - secondaryLines.ts 不再有 id 为 song 的那条线。
// musicLibrary.ts 的章 id 正则兜底（PATTERN_MOOD_RULES）里只有宋关名片段（lin_an、stage_10_jiangzhou_shadow_war 等），没有完整 id，本测试按完整 id 查，不受影响。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';

const { CANON_RAIL_PROFILES } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
const src = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const SONG = ['lcq.stage_10_jiangzhou_shadow_war', 'lcq.stage_11_lieshan_battle', 'lcq.stage_12_jiangzhou_counterwar', 'lyl.jiangzhou_retreat',
  'lyl.lin_an_black_sea', 'lyl.lin_an_bridge', 'lyl.taiquan_expedition', 'lyl.xiaoyingzhou_blacksea_trap'];

const BEFORE_ORDER = ['lcq.stage_01', 'lcq.stage_02', 'lyg.qin_xianyang', 'lcq.stage_03b_snake_flower_bridge', 'lcq.stage_04',
  'lcq.stage_04b_lingfei_baiyi_crisis', 'lcq.stage_05b', 'lcq.stage_07_qingyuan_jiankang', 'lcq.stage_08_jiankang_coup',
  'lcq.stage_09_trade_and_escape', 'lcq.stage_10_jiangzhou_shadow_war', 'lcq.stage_11_lieshan_battle', 'lcq.stage_12_jiangzhou_counterwar',
  'lyg.buddhist_conspiracy', 'lyg.changgan_begins', 'lyg.changgan_interlude', 'lyg.dingtao_beijing', 'lyg.ganlu_aftershock',
  'lyg.han_succession', 'lyg.liangzhou_league', 'lyg.mijing_rumen', 'lyg.shituolin_endgame', 'lyl.han_palace_endgame',
  'lyl.jiangzhou_retreat', 'lyl.lin_an_bridge', 'lyl.luoyang_cloud_secret', 'lyl.taiquan_afterfall', 'lyl.taiquan_core_conflict',
  'lyl.taiquan_sacred_fruit', 'lyl.xiaoyingzhou_blacksea_trap'];

test('CANON_RAIL_PROFILES：数组顺序与搬迁前相同，modId 不重复', () => {
  assert.deepEqual(CANON_RAIL_PROFILES.map(p => p.modId), BEFORE_ORDER);
  assert.equal(CANON_RAIL_PROFILES.length, new Set(CANON_RAIL_PROFILES.map(p => p.modId)).size);
});

test('宋 8 关的关／事件／章 id 不再写在五个框架 TS 文件里；secondaryLines.ts 没有 song 线', () => {
  const ids = new Set(SONG);
  for (const id of SONG) {
    const mod = JSON.parse(src(`src/modules/scenarioMods/builtins/data/${id}.json`));
    for (const e of mod.scenario.events) ids.add(e.id);
    for (const c of mod.scenario.chapters) ids.add(c.id);
  }
  assert.equal(ids.size, 8 + 120 + 25);
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const token = new RegExp(`(?<![\\w.])(?:${[...ids].map(escape).join('|')})(?![\\w])`, 'g');
  for (const file of ['src/modules/scenarioMods/canonRail.ts', 'src/modules/scenarioMods/eventNarrativeView.ts', 'src/utils/musicLibrary.ts',
    'src/modules/scenarioMods/fixedQuestObjectives.ts', 'src/modules/scenarioMods/milestoneRewards.ts']) {
    assert.deepEqual(src(file).match(token) || [], [], file);
  }
  assert.doesNotMatch(src('src/modules/scenarioMods/secondaryLines.ts'), /id: 'song'/);
});
