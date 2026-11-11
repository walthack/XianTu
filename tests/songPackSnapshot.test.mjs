// 宋线 S0「先钉」：宋线数据从框架 TS 搬进 packs/song 之前，把现行输出钉成快照（tests/fixtures/song-pack-snapshot.json）。
// 快照由基线 da0edee9 的现行实现导出一次写入，之后**不再重生**；本测试只读快照、按同一口径重算并逐项比对。
// 只钉宋的：rail 档（CANON_RAIL_PROFILES，加拍表合并后）、界面章名（fallback 哨兵，外加一个表外事件）、章/事件配乐、事件目标覆盖。
// 钉全部线的（共享表，后续各线搬迁都靠它）：SECONDARY_LINES（含顺序）与三个查询函数、37 内置关＋内容包关的隔离判定与称号奖励。
// 搬迁后只允许换读取来源（宋关 JSON 的位置、CONTENT_PACKS），期望一律不改。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';

// musicLibrary.ts 直接 import 曲目 .mp3（webpack 资源）；Node 下只把它当成 URL 字符串模块（同 tests/qinReplayFixtures.test.mjs）。
register('data:text/javascript,' + encodeURIComponent(
  "export async function load(url, context, next) { if (url.endsWith('.mp3')) return { format: 'module', source: 'export default ' + JSON.stringify(url), shortCircuit: true }; return next(url, context); }"));
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const { loadTs } = await import('./loadTs.mjs');
const quiet = fn => { const k = ['log', 'info', 'warn', 'error', 'debug'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };

const P = await loadTs('../src/modules/contentPacks/index.ts');
const CR = await loadTs('../src/modules/scenarioMods/canonRail.ts');
const NV = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
const MUSIC = await loadTs('../src/utils/musicLibrary.ts');
const FQ = await loadTs('../src/modules/scenarioMods/fixedQuestObjectives.ts');
const SL = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
const MR = await loadTs('../src/modules/scenarioMods/milestoneRewards.ts');

const snap = JSON.parse(readFileSync(new URL('./fixtures/song-pack-snapshot.json', import.meta.url), 'utf8'));
const SONG = ['lcq.stage_10_jiangzhou_shadow_war', 'lcq.stage_11_lieshan_battle', 'lcq.stage_12_jiangzhou_counterwar', 'lyl.jiangzhou_retreat',
  'lyl.lin_an_black_sea', 'lyl.lin_an_bridge', 'lyl.taiquan_expedition', 'lyl.xiaoyingzhou_blacksea_trap'];
const SONG_RAIL = SONG.filter(id => !['lyl.lin_an_black_sea', 'lyl.taiquan_expedition'].includes(id));
const FALLBACK = '<<FALLBACK>>';
const OFF_TABLE = 'lyl.event.__song_s0_not_in_catalog__';
// 宋关源：S0 时在 builtins/data（套内容包 overlay，同运行时）。搬迁后只换这里的读取来源。
const dataDir = new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url);
const stage = id => P.applyContentPackOverlays(JSON.parse(readFileSync(new URL(`${id}.json`, dataDir), 'utf8')));
const BUILTIN_IDS = readdirSync(dataDir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
const ALL_STAGE_IDS = [...BUILTIN_IDS, ...P.CONTENT_PACKS.stages.map(s => s.manifest.id)];
const PROBE_STAGE_IDS = [...ALL_STAGE_IDS, 'lyl.__unknown_stage__'];
const plain = v => JSON.parse(JSON.stringify(v));

test('快照覆盖面：宋 8 关、37 内置关＋秦包关', () => {
  assert.deepEqual(snap.songStageIds, SONG);
  assert.equal(BUILTIN_IDS.length, 37);
  assert.ok(SONG.every(id => BUILTIN_IDS.includes(id)));
  assert.deepEqual(Object.keys(snap.quarantine), PROBE_STAGE_IDS);
  assert.deepEqual(Object.keys(snap.milestoneRewardQuery), PROBE_STAGE_IDS);
});

test('宋 6 个 rail 档（CANON_RAIL_PROFILES，含加拍表合并）深快照；两个隔离关没有档', () => {
  const profiles = CR.CANON_RAIL_PROFILES.filter(p => SONG.includes(p.modId));
  assert.deepEqual(profiles.map(p => p.modId).sort(), [...SONG_RAIL].sort());
  assert.deepEqual(Object.keys(snap.rails).sort(), [...SONG_RAIL].sort());
  for (const profile of profiles) {
    assert.deepStrictEqual(profile, snap.rails[profile.modId], profile.modId);
    assert.deepStrictEqual(CR.getCanonRailProfile({ modId: profile.modId }), snap.rails[profile.modId], `getCanonRailProfile ${profile.modId}`);
  }
  for (const id of ['lyl.lin_an_black_sea', 'lyl.taiquan_expedition']) assert.equal(CR.getCanonRailProfile({ modId: id }), null, id);
});

test('宋 8 关全部事件的界面章名（fallback 哨兵）＋表外事件', () => {
  for (const id of SONG) {
    const ids = [...stage(id).scenario.events.map(e => e.id), OFF_TABLE];
    assert.deepEqual(Object.keys(snap.chapterTitles[id]), ids, `${id} 事件集合`);
    assert.deepEqual(Object.fromEntries(ids.map(e => [e, NV.storyChapterTitle(id, e, FALLBACK)])), snap.chapterTitles[id], id);
  }
  // 临安特判：首章 10 拍「初抵临安」，同关其余（含表外）一律「临安疑线」；其余宋关全回退。
  assert.equal(snap.chapterTitles['lyl.lin_an_bridge'][OFF_TABLE], '临安疑线');
  assert.equal(Object.values(snap.chapterTitles['lyl.lin_an_bridge']).filter(t => t === '初抵临安').length, 10);
  for (const id of SONG.filter(x => x !== 'lyl.lin_an_bridge')) assert.ok(Object.values(snap.chapterTitles[id]).every(t => t === FALLBACK), id);
});

test('宋全部章与事件的配乐解析（章解析、事件锚点、带事件全文）', () => {
  const chapterMusic = {}, eventMusic = {};
  for (const id of SONG) {
    const mod = stage(id), chapters = mod.scenario.chapters || [];
    for (const c of chapters) chapterMusic[c.id] = MUSIC.resolveMusicMoodForChapter(c.id);
    for (const e of mod.scenario.events) {
      const ch = chapters.find(c => (c.eventIds || []).includes(e.id))?.id ?? null;
      eventMusic[e.id] = { chapterId: ch, idOnly: MUSIC.resolveMusicMoodForScenario(ch, [{ id: e.id }]), full: MUSIC.resolveMusicMoodForScenario(ch, [e]),
        anchorOnly: MUSIC.resolveMusicMoodForScenario(null, [{ id: e.id }]) };
    }
  }
  assert.deepEqual(chapterMusic, snap.chapterMusic);
  assert.deepEqual(eventMusic, snap.eventMusic);
  assert.equal(Object.keys(snap.chapterMusic).length, 25);
  assert.equal(Object.keys(snap.eventMusic).length, 120);
  // 13 个宋事件有人工锚点（anchorOnly 不是空章默认的 theme）
  assert.equal(Object.values(snap.eventMusic).filter(m => m.anchorOnly !== 'theme').length, 13);
});

test('宋全部事件的目标覆盖（resolveFixedQuestObjective：只给 id／带事件全文）', () => {
  const objectives = {};
  for (const id of SONG) for (const e of stage(id).scenario.events) {
    objectives[e.id] = { idOnly: FQ.resolveFixedQuestObjective({ id: e.id }), full: FQ.resolveFixedQuestObjective(e) };
  }
  assert.deepEqual(objectives, snap.objectives);
  assert.equal(Object.values(snap.objectives).filter(o => o.idOnly).length, 15);
});

test('SECONDARY_LINES 全表深快照（含数组顺序）', () => {
  assert.deepStrictEqual(SL.SECONDARY_LINES, snap.secondaryLines);
  assert.deepEqual(SL.SECONDARY_LINES.map(l => l.id), ['commerce', 'taiquan', 'taiyi', 'xingyuehu', 'heimohai', 'zhaonan', 'jin', 'song', 'han', 'tang']);
});

test('二级线查询：secondaryLinesAtEvent／resolveAvailableLines／secondaryLineUnlockOptions（另附 secondaryLineDisplayName）', () => {
  const lines = SL.SECONDARY_LINES;
  const atEvent = Object.fromEntries(Object.keys(snap.secondaryLinesAtEvent).filter(k => k !== '<undefined>').map(e => [e, SL.secondaryLinesAtEvent(e).map(l => l.id)]));
  atEvent['<undefined>'] = SL.secondaryLinesAtEvent(undefined).map(l => l.id);
  assert.deepEqual(atEvent, snap.secondaryLinesAtEvent);
  // 探针覆盖所有节点事件与锚事件（搬迁后新增的节点会让这里变红，提醒补快照）
  const probe = new Set([...lines.flatMap(l => l.nodes.map(n => n.eventId).filter(Boolean)), ...lines.flatMap(l => l.anchorEventIds || []), OFF_TABLE]);
  assert.deepEqual([...probe].sort(), Object.keys(snap.secondaryLinesAtEvent).filter(k => k !== '<undefined>'));

  const avail = (loc, ledger, done) => SL.resolveAvailableLines(loc, ledger, done).map(l => l.id);
  const locs = [...new Set(lines.flatMap(l => l.anchorLocationIds || []))].sort();
  const chars = [...new Set(lines.flatMap(l => l.anchorCharacterIds || []))].sort();
  const anchors = [...new Set(lines.flatMap(l => l.anchorEventIds || []))].sort();
  assert.deepEqual({
    empty: avail(undefined, undefined, undefined),
    byLocation: Object.fromEntries([...locs, 'liuchao.location.__none__'].map(l => [l, avail(l, undefined, [])])),
    byCharacter: Object.fromEntries(chars.flatMap(c => ['rumored', 'introduced', 'encountered', 'joined'].map(k => [`${c}:${k}`, avail(undefined, { [c]: { kind: k } }, [])]))),
    byAnchorEvent: Object.fromEntries(anchors.map(e => [e, avail(undefined, undefined, [e])])),
    everything: avail(undefined, Object.fromEntries(chars.map(c => [c, { kind: 'joined' }])), anchors),
  }, snap.resolveAvailableLines);
  assert.deepEqual(snap.resolveAvailableLines.everything, snap.secondaryLines.map(l => l.id), 'resolveAvailableLines 按数组顺序输出');

  assert.deepEqual(Object.fromEntries(lines.map(l => [l.id, plain(SL.secondaryLineUnlockOptions(l) ?? null)])), snap.secondaryLineUnlockOptions);
  assert.deepEqual(Object.fromEntries(lines.flatMap(l => ['', '第1章', '第120章', '第121章', '第300章'].map(a =>
    [`${l.id}|${a}`, SL.secondaryLineDisplayName(l, a ? { axisAnchor: `六朝·${a}` } : undefined)]))), snap.secondaryLineDisplayName);
});

test('37 内置关＋内容包关的默认路线隔离判定', () => {
  assert.deepEqual(Object.fromEntries(PROBE_STAGE_IDS.map(id => [id, CR.isDefaultLineQuarantinedStageId(id)])), snap.quarantine);
  assert.deepEqual([null, undefined, 42, {}].map(v => CR.isDefaultLineQuarantinedStageId(v)), snap.quarantineNonString);
  assert.equal(Object.values(snap.quarantine).filter(Boolean).length, 8);
  assert.equal(snap.quarantine['lyl.lin_an_black_sea'], true);
  assert.equal(snap.quarantine['lyl.taiquan_expedition'], true);
});

test('37 内置关＋内容包关的称号奖励查询（MILESTONE_REWARDS＋applyMilestoneRewards）', () => {
  assert.deepStrictEqual(MR.MILESTONE_REWARDS, snap.milestoneRewards);
  const allTitles = [...new Set(MR.MILESTONE_REWARDS.flatMap(r => [...r.titles, ...(r.revokeTitles || [])]))];
  const reward = (id, held, type = 'stage_ready') => quiet(() => {
    const save = { 世界: { 状态: { 剧本模组: { modId: id } } }, 角色: { 身份: { 称号: [...held] } } };
    const notes = MR.applyMilestoneRewards(save, [{ type }]);
    return { notes, titles: save.角色.身份.称号 };
  });
  assert.deepEqual(Object.fromEntries(PROBE_STAGE_IDS.map(id => [id, { fresh: reward(id, []), allHeld: reward(id, allTitles), notReady: reward(id, [], 'chapter_completed') }])),
    snap.milestoneRewardQuery);
  assert.deepEqual(snap.milestoneRewardQuery['lcq.stage_12_jiangzhou_counterwar'].fresh.titles, ['宋国工部屯田司员外郎']);
});
