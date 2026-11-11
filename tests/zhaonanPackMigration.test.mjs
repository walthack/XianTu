// 昭南（南荒）线 S4：昭南数据从框架 TS 搬进 packs/zhaonan 之后的结构断言（逐项内容相等由 songPackSnapshot／linesPackSnapshot／各回放夹具兜住）。
// - CANON_RAIL_PROFILES 的数组顺序与搬迁前相同（期望是搬迁前在 048ca74a 上导出的 modId 顺序）、modId 不重复；本线没有手审档，4 个生成档进包后按 modId 归位；
// - 包二级线文案可写 {{entity:…}}：运行时解析成名字（与搬前 entityText 的结果逐字相等由快照兜住），编译器校验实体存在；
// - 昭南 6 关的关／事件／章 id 不再写在 canonRail.ts、musicLibrary.ts、milestoneRewards.ts 里；
// - fixedQuestObjectives.ts 只残留两条用 entityText 的目标（stageMeta 的 objective 不解析模板）与 huamiao_coop_boundary 特判；
// - eventNarrativeView.ts 只残留 stage_04／04b 的写死章名特判（返回的字符串不是该关已有章的标题，stageMeta 表达不了）与 shanghou_revealed 的条件改写；
// - secondaryLines.ts 不再有 id 为 zhaonan 的那条线；残留的昭南 id 只在别的线挂在昭南事件上的节点与锚事件里（按任务范围不动）。
// musicLibrary.ts 的章 id 正则兜底（PATTERN_MOOD_RULES）里只有不带前缀的关名片段，本测试按完整 id 查，不受影响。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { compileContentPacks } from '../scripts/content-packs.mjs';
import { loadTs } from './loadTs.mjs';

const { CANON_RAIL_PROFILES } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
const { TS_SECONDARY_LINES, SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
const { CONTENT_PACKS, applyContentPackOverlays } = await loadTs('../src/modules/contentPacks/index.ts');
const { entityName } = await loadTs('../src/modules/scenarioMods/namedEntities.ts');
const src = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const root = resolve(import.meta.dirname, '..');

const ZHAONAN = ['lcq.stage_03b_snake_flower_bridge', 'lcq.stage_04', 'lcq.stage_04b_lingfei_baiyi_crisis', 'lcq.stage_05', 'lcq.stage_05b', 'lcq.stage_06'];

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

test('包二级线的 {{entity:…}}：catalog 里是模板，SECONDARY_LINES 里是名字；编译器拒绝不存在的实体', async () => {
  const raw = (CONTENT_PACKS.secondaryLines || []).find(line => line.id === 'zhaonan');
  const live = SECONDARY_LINES.find(line => line.id === 'zhaonan');
  const tpl = '{{entity:character:lcq.character.nanhuang_dagu}}';
  const node = i => raw.nodes.findIndex(n => n.eventId === i);
  const at = node('lcq.event.wuerlang_slays_dagu');
  assert.ok(raw.nodes[at].reviewSummary.includes(tpl));
  assert.ok(!live.nodes[at].reviewSummary.includes('{{'));
  assert.ok(live.nodes[at].reviewSummary.includes(entityName('character', 'lcq.character.nanhuang_dagu')));
  assert.ok(!JSON.stringify(SECONDARY_LINES).includes('{{entity'));
  const dir = await mkdtemp(join(root, '_newbot_tmp/zhaonan-s4-'));
  try {
    for (const p of ['qingyu', 'zhaonan']) await cp(join(root, 'src/modules/contentPacks/packs', p), join(dir, p), { recursive: true });
    const path = join(dir, 'zhaonan', 'secondary-lines.json');
    const text = await readFile(path, 'utf8');
    await writeFile(path, text.replace(tpl, '{{entity:character:lcq.character.no_such_person}}'));
    await assert.rejects(compileContentPacks({ packsDir: dir }), /entity \{\{entity:character:lcq\.character\.no_such_person\}\}: unknown character/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('昭南 6 关的关／事件／章 id 不再写在框架 TS 文件里（允许的残留见文件头）；secondaryLines.ts 没有 zhaonan 线', () => {
  const ids = new Set(ZHAONAN);
  for (const id of ZHAONAN) {
    const mod = applyContentPackOverlays(JSON.parse(src(`src/modules/scenarioMods/builtins/data/${id}.json`)));
    for (const e of mod.scenario.events) ids.add(e.id);
    for (const c of mod.scenario.chapters) ids.add(c.id);
  }
  assert.equal(ids.size, 6 + 120 + 11);
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const token = new RegExp(`(?<![\\w.])(?:${[...ids].map(escape).join('|')})(?![\\w])`, 'g');
  for (const file of ['src/modules/scenarioMods/canonRail.ts', 'src/utils/musicLibrary.ts', 'src/modules/scenarioMods/milestoneRewards.ts']) {
    assert.deepEqual(src(file).match(token) || [], [], file);
  }
  const objectives = src('src/modules/scenarioMods/fixedQuestObjectives.ts').split('\n').filter(line => line.match(token));
  assert.deepEqual(objectives.map(line => line.match(token)), [['lcq.event.wuerlang_slays_dagu'], ['lcq.event.s05b_02_xiaozi_exposed'], ['lcq.event.huamiao_coop_boundary']]);
  assert.match(objectives[0], /: entityText\(/);
  assert.match(objectives[1], /: entityText\(/);
  assert.match(objectives[2], /^\s*if \(eventId === 'lcq\.event\.huamiao_coop_boundary'\) return /);
  assert.deepEqual(src('src/modules/scenarioMods/eventNarrativeView.ts').match(token) || [], [
    'lcq.event.shanghou_revealed',
    'lcq.stage_04', 'lcq.event.s04_02', 'lcq.event.s04_03', 'lcq.event.s04_01', 'lcq.event.s04_04', 'lcq.event.s04_05', 'lcq.event.s04_06', 'lcq.event.s04_07',
    'lcq.stage_04b_lingfei_baiyi_crisis', 'lcq.event.enter_dong_with_migu', 'lcq.event.huamiao_coop_boundary', 'lcq.event.guiwangdong_coop_pact',
    'lcq.event.yiyang_repels_yinsha', 'lcq.event.wuerlang_slays_dagu', 'lcq.event.ruins_ghost_warriors', 'lcq.event.biling_bay_stance',
    'lcq.event.haishen_hall_merfolk', 'lcq.event.pull_harpoon_lemingzhu',
    'lcq.event.regroup_caravan_envoy', 'lcq.event.weapon_deal_with_geluo', 'lcq.event.spot_dong_informant',
  ]);
  assert.equal(TS_SECONDARY_LINES.some(line => line.id === 'zhaonan'), false);
  assert.doesNotMatch(src('src/modules/scenarioMods/secondaryLines.ts'), /id: 'zhaonan'/);
  // 残留只在别的线的节点行（`{ reviewSummary: …, stageId[, eventId] }`）与锚事件行里
  const hits = src('src/modules/scenarioMods/secondaryLines.ts').split('\n').filter(line => line.match(token));
  assert.ok(hits.length > 0);
  for (const line of hits) assert.match(line, /^\s*(\{ reviewSummary: .*stageId: '[^']+'(, eventId: '[^']+')? \},?|anchorEventIds: \['[^']+'\],)$/, line);
});
