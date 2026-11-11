// 塞外线 S4：塞外（开局与五原）数据从框架 TS 搬进 packs/saiwai 之后的结构断言（逐项内容相等由 linesPackSnapshot／linesReplayFixtures／songPackSnapshot 兜住）。
// - CANON_RAIL_PROFILES 的数组顺序与搬迁前相同：两个手审档搬进包后靠 rails.json 的 handReviewed: true 仍排在最前（期望是搬迁前在 7e71f44b 上导出的 modId 顺序）、modId 不重复；
// - handReviewed 标记不漏进运行时档；编译器拒绝非 true 的 handReviewed、拒绝挂包内关的 handReviewed；
// - 塞外 3 关的关／事件／章 id 不再写在 canonRail.ts、musicLibrary.ts、milestoneRewards.ts 里；
// - fixedQuestObjectives.ts 只残留 s02_04 的目标特判；eventNarrativeView.ts 只残留 legacyNarrativeVariants 的两条条件改写、stage_02 按地点分段的章名算法（含 storyRouteLocation 表）与 formatQuestCompass 的 s02_04 特判（都不是表，未搬）；
// - secondaryLines.ts 没有塞外线（本来就没有）；残留的塞外 id 只在别的线的节点、锚事件与 basis 文字里（按任务范围不动）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { compileContentPacks } from '../scripts/content-packs.mjs';
import { loadTs } from './loadTs.mjs';

const { CANON_RAIL_PROFILES } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
const { TS_SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
const src = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const root = resolve(import.meta.dirname, '..');

const SAIWAI = ['lcq.stage_01', 'lcq.stage_02', 'lcq.stage_03'];

const BEFORE_ORDER = ['lcq.stage_01', 'lcq.stage_02', 'lyg.qin_xianyang', 'lcq.stage_03b_snake_flower_bridge', 'lcq.stage_04',
  'lcq.stage_04b_lingfei_baiyi_crisis', 'lcq.stage_05b', 'lcq.stage_07_qingyuan_jiankang', 'lcq.stage_08_jiankang_coup',
  'lcq.stage_09_trade_and_escape', 'lcq.stage_10_jiangzhou_shadow_war', 'lcq.stage_11_lieshan_battle', 'lcq.stage_12_jiangzhou_counterwar',
  'lyg.buddhist_conspiracy', 'lyg.changgan_begins', 'lyg.changgan_interlude', 'lyg.dingtao_beijing', 'lyg.ganlu_aftershock',
  'lyg.han_succession', 'lyg.liangzhou_league', 'lyg.mijing_rumen', 'lyg.shituolin_endgame', 'lyl.han_palace_endgame',
  'lyl.jiangzhou_retreat', 'lyl.lin_an_bridge', 'lyl.luoyang_cloud_secret', 'lyl.taiquan_afterfall', 'lyl.taiquan_core_conflict',
  'lyl.taiquan_sacred_fruit', 'lyl.xiaoyingzhou_blacksea_trap'];

test('CANON_RAIL_PROFILES：数组顺序与搬迁前相同（塞外手审档仍在最前），modId 不重复，handReviewed 标记不进运行时档', () => {
  assert.deepEqual(CANON_RAIL_PROFILES.map(p => p.modId), BEFORE_ORDER);
  assert.equal(CANON_RAIL_PROFILES.length, new Set(CANON_RAIL_PROFILES.map(p => p.modId)).size);
  assert.ok(CANON_RAIL_PROFILES.every(p => !('handReviewed' in p)));
  const packRails = JSON.parse(src('src/modules/contentPacks/packs/saiwai/rails.json'));
  assert.deepEqual(packRails.map(r => [r.modId, r.handReviewed]), [['lcq.stage_01', true], ['lcq.stage_02', true]]);
});

test('编译器：handReviewed 只收 true，且不能挂包内关', async () => {
  const dir = await mkdtemp(join(root, '_newbot_tmp/saiwai-s4-'));
  try {
    await cp(join(root, 'src/modules/contentPacks/packs/qin'), join(dir, 'qin'), { recursive: true });
    await cp(join(root, 'src/modules/contentPacks/packs/qingyu'), join(dir, 'qingyu'), { recursive: true });
    const railsPath = join(dir, 'qin', 'rails.json');
    const qinRails = JSON.parse(await readFile(railsPath, 'utf8'));
    await writeFile(railsPath, JSON.stringify(qinRails.map(r => ({ ...r, handReviewed: true }))));
    await assert.rejects(compileContentPacks({ packsDir: dir }), /rail lyg\.qin_xianyang: handReviewed is only for built-in stages/);
    await writeFile(railsPath, JSON.stringify(qinRails.map(r => ({ ...r, handReviewed: 'yes' }))));
    await assert.rejects(compileContentPacks({ packsDir: dir }), /rail lyg\.qin_xianyang: invalid fields/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('塞外 3 关的关／事件／章 id 不再写在框架 TS 文件里（允许的残留见文件头）；secondaryLines.ts 没有塞外线', async () => {
  const { applyContentPackOverlays } = await loadTs('../src/modules/contentPacks/index.ts');
  const ids = new Set(SAIWAI);
  for (const id of SAIWAI) {
    const mod = applyContentPackOverlays(JSON.parse(src(`src/modules/scenarioMods/builtins/data/${id}.json`)));
    for (const e of mod.scenario.events) ids.add(e.id);
    for (const c of mod.scenario.chapters) ids.add(c.id);
  }
  assert.equal(ids.size, 3 + 41 + 3);
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const token = new RegExp(`(?<![\\w.])(?:${[...ids].map(escape).join('|')})(?![\\w])`, 'g');
  for (const file of ['src/modules/scenarioMods/canonRail.ts', 'src/utils/musicLibrary.ts', 'src/modules/scenarioMods/milestoneRewards.ts']) {
    assert.deepEqual(src(file).match(token) || [], [], file);
  }
  assert.deepEqual(src('src/modules/scenarioMods/fixedQuestObjectives.ts').match(token) || [], ['lcq.event.s02_04']);
  assert.deepEqual(src('src/modules/scenarioMods/eventNarrativeView.ts').match(token) || [], [
    'lcq.event.gamble_bond_signed', 'lcq.event.ningyu_enters_gamble',
    'lcq.stage_02', 'lcq.event.s02_01', 'lcq.event.s02_03', 'lcq.event.s02_02',
    'lcq.event.iron_bridge_ambush', 'lcq.event.ningyu_regicide_offer', 'lcq.event.zixi_taiyi_intercept',
    'lcq.event.rainforest_black_shoal', 'lcq.event.silent_sheyi_village',
    'lcq.event.s02_04',
  ]);
  assert.equal(TS_SECONDARY_LINES.some(line => /saiwai|wuyuan/.test(line.id)), false);
  // 残留只在别的线的节点行、锚事件行与 basis 文字行里
  const hits = src('src/modules/scenarioMods/secondaryLines.ts').split('\n').filter(line => line.match(token));
  // B1：四条非国家线进核心包后 secondaryLines.ts 已没有任何线与节点，本线 id 残留为 0
  assert.deepEqual(hits, []);
});
