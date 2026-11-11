// 唐线 S4：唐线数据从框架 TS 搬进 packs/tang 之后的结构断言（逐项内容相等由 songPackSnapshot／linesPackSnapshot／各回放夹具兜住）。
// - CANON_RAIL_PROFILES 的数组顺序与搬迁前相同（期望是搬迁前在 30c1bd43 上导出的 modId 顺序）、modId 不重复；
//   唐没有手审档，6 个生成档进包后照宋 S4 的拼装（挂内置关的包 rail 与生成档合在一起按 modId 排）回到原位；
// - 唐 8 关的关／事件／章 id 不再写在 canonRail.ts、musicLibrary.ts、fixedQuestObjectives.ts、milestoneRewards.ts 里；
// - eventNarrativeView.ts 只允许残留 2 行：LIUXIANPING_EVENT_IDS、CHANGGAN_INTERLUDE_CHAPTER_EVENT_IDS 两个导出（快照钉住导出名）
//   改为从唐包 stageMeta 派生，派生时要写关 id（留仙坪还要写章 id）；
// - secondaryLines.ts 不再有 id 为 tang 的那条线；残留的唐 id 只在别的线挂在唐事件上的节点里，以及 LINE_CRITICAL_EVENTS 整张表（按任务范围不动）。
// musicLibrary.ts 的章 id 正则兜底（PATTERN_MOOD_RULES）里只有不带前缀的关名片段，本测试按完整 id 查，不受影响。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';

const { CANON_RAIL_PROFILES } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
const { TS_SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
const src = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const TANG = ['lyg.changgan_begins', 'lyg.shixiang_ambush', 'lyg.changgan_interlude', 'lyg.ganlu_bian',
  'lyg.liangzhou_league', 'lyg.buddhist_conspiracy', 'lyg.ganlu_aftershock', 'lyg.shituolin_endgame'];

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

test('唐 8 关的关／事件／章 id 不再写在框架 TS 文件里（允许的残留见文件头）；secondaryLines.ts 没有 tang 线', () => {
  const ids = new Set(TANG);
  for (const id of TANG) {
    const mod = JSON.parse(src(`src/modules/scenarioMods/builtins/data/${id}.json`));
    for (const e of mod.scenario.events) ids.add(e.id);
    for (const c of mod.scenario.chapters) ids.add(c.id);
  }
  assert.equal(ids.size, 8 + 116 + 23);
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const token = new RegExp(`(?<![\\w.])(?:${[...ids].map(escape).join('|')})(?![\\w])`, 'g');
  for (const file of ['src/modules/scenarioMods/canonRail.ts', 'src/utils/musicLibrary.ts',
    'src/modules/scenarioMods/fixedQuestObjectives.ts', 'src/modules/scenarioMods/milestoneRewards.ts']) {
    assert.deepEqual(src(file).match(token) || [], [], file);
  }
  const view = src('src/modules/scenarioMods/eventNarrativeView.ts').split('\n').filter(line => line.match(token));
  assert.deepEqual(view.map(line => line.match(token)), [
    ['lyg.changgan_begins', 'lyg.chapter.changgan_begins_liuxianping'],
    ['lyg.changgan_interlude'],
  ]);
  assert.match(view[0], /^export const LIUXIANPING_EVENT_IDS: ReadonlySet<string> = stageMetaUiChapterEventIds\(/);
  assert.match(view[1], /^export const CHANGGAN_INTERLUDE_CHAPTER_EVENT_IDS: ReadonlyArray<readonly \[string, ReadonlySet<string>\]> = stageMetaUiChapterGroups\(/);
  // 原来两个集合用 `lyg.event.${id}` 模板拼 id（棘轮「前缀模板行」），搬后不再有
  assert.doesNotMatch(src('src/modules/scenarioMods/eventNarrativeView.ts'), /`lyg\.event\.\$\{/);
  assert.equal(TS_SECONDARY_LINES.some(line => line.id === 'tang'), false);
  assert.doesNotMatch(src('src/modules/scenarioMods/secondaryLines.ts'), /id: 'tang'/);
  // 残留只在别的线的节点行（`{ reviewSummary: …, stageId, eventId }`）与 LINE_CRITICAL_EVENTS 表内
  const lines = src('src/modules/scenarioMods/secondaryLines.ts').split('\n');
  const critStart = lines.indexOf('export const LINE_CRITICAL_EVENTS: Record<string, string> = {');
  const critEnd = lines.indexOf('};', critStart);
  // B1：四条非国家线进核心包、LINE_CRITICAL_EVENTS 条目进汉包后，TS 表只剩声明行与 `};`，本线 id 残留为 0
  assert.ok(critStart > 0 && critEnd === critStart + 1);
  const hits = lines.filter(line => line.match(token));
  assert.deepEqual(hits, []);
});
