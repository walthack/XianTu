// 其余各线 S0「先钉」：塞外／昭南／晋国／太泉／汉国／唐国（共 29 关，按 mod-kit/entity-ledger/overrides.json 的 stageRegions）
// 从框架 TS 搬进内容包之前，把现行输出钉成快照（tests/fixtures/lines-pack-snapshot.json）。
// 快照由基线 cdbe3e23 的现行实现导出一次写入，之后**不再重生**；本测试只读快照、按同一口径重算并逐项比对（口径代码与一次性导出脚本同一段）。
// 钉 29 关的：rail 档（CANON_RAIL_PROFILES，含手审档 entityName 解析后的字符串、加拍合并）＋全表 modId 顺序与长度、界面章名（fallback 哨兵，外加表外事件与地图入口口信拍）、
//   章／事件配乐、事件目标覆盖。
// 钉共享表（各线搬迁会动到、宋 S4 快照没覆盖的）：eventNarrativeView 的章名集合与 storyRouteLocation、characterQuests、mainQuestAxis、
//   secondaryLines 的 LINE_CRITICAL_EVENTS／lineCriticalFrozen、lineUnlock、persistentLineEntries。
// SECONDARY_LINES、隔离判定、称号奖励的全线快照在 song-pack-snapshot.json，这里不重复。
// 搬迁后只允许换读取来源（关 JSON 的位置、CONTENT_PACKS），期望一律不改；探针集合变了（新增／少了事件）会变红，须人工确认后再补快照。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';

// musicLibrary.ts 直接 import 曲目 .mp3（webpack 资源）；Node 下只把它当成 URL 字符串模块（同 tests/songPackSnapshot.test.mjs）。
register('data:text/javascript,' + encodeURIComponent(
  "export async function load(url, context, next) { if (url.endsWith('.mp3')) return { format: 'module', source: 'export default ' + JSON.stringify(url), shortCircuit: true }; return next(url, context); }"));
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const ROOT = new URL('../', import.meta.url);
const { loadTs } = await import('./loadTs.mjs');
const quiet = fn => { const k = ['log', 'info', 'warn', 'error', 'debug'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };

// ───────────── 计算口径（测试与一次性导出脚本 /tmp/lines-s0/export-snapshot.mjs 用的是同一段代码）─────────────
const P = await loadTs('../src/modules/contentPacks/index.ts');
const CR = await loadTs('../src/modules/scenarioMods/canonRail.ts');
const NV = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
const MUSIC = await loadTs('../src/utils/musicLibrary.ts');
const FQ = await loadTs('../src/modules/scenarioMods/fixedQuestObjectives.ts');
const SL = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
const CQ = await loadTs('../src/modules/scenarioMods/characterQuests.ts');
const MQ = await loadTs('../src/modules/scenarioMods/mainQuestAxis.ts');
const LU = await loadTs('../src/modules/scenarioMods/lineUnlock.ts');
const PE = await loadTs('../src/modules/scenarioMods/persistentLineEntries.ts');
const SR = await loadTs('../src/modules/scenarioMods/stayRejoin.ts');

const FALLBACK = '<<FALLBACK>>';
const offTable = id => `${id.split('.')[0]}.event.__lines_s0_not_in_catalog__`;
// 线与关的归属：mod-kit/entity-ledger/overrides.json 的 stageRegions（宋、秦已有自己的快照，不重复）
const REGIONS = JSON.parse(readFileSync(new URL('mod-kit/entity-ledger/overrides.json', ROOT), 'utf8')).stageRegions;
const LINE_NAMES = ['塞外', '昭南', '晋国', '太泉', '汉国', '唐国'];
const LINES = Object.fromEntries(LINE_NAMES.map(l => [l, Object.keys(REGIONS).filter(id => REGIONS[id] === l)]));
const LINE_STAGES = LINE_NAMES.flatMap(l => LINES[l]);
// 关源：S0 时在 builtins/data（套内容包 overlay，同运行时）。搬迁后只换这里的读取来源。
const dataDir = new URL('src/modules/scenarioMods/builtins/data/', ROOT);
const BUILTIN_IDS = readdirSync(dataDir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
const stageCache = new Map();
const stage = id => {
  if (!stageCache.has(id)) {
    const pack = P.CONTENT_PACKS.stages.find(s => s.manifest.id === id);
    stageCache.set(id, pack || P.applyContentPackOverlays(JSON.parse(readFileSync(new URL(`${id}.json`, dataDir), 'utf8'))));
  }
  return stageCache.get(id);
};
const ALL_STAGE_IDS = [...BUILTIN_IDS, ...P.CONTENT_PACKS.stages.map(s => s.manifest.id)];
const PROBE_STAGE_IDS = [...ALL_STAGE_IDS, 'lyl.__unknown_stage__'];
const MAP_ENTRY_EVENT_IDS = [...new Set((P.CONTENT_PACKS.mapEntries || []).map(e => e.eventId).filter(Boolean))];
const plain = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
const uniq = xs => [...new Set(xs)];
// 全书事件探针：全部内置关＋包关的事件（共享表不按线分，整体钉）
const ALL_EVENTS = ALL_STAGE_IDS.flatMap(id => stage(id).scenario.events.map(e => ({ stageId: id, event: e })));
const eventById = id => ALL_EVENTS.find(x => x.event.id === id);

function computeRails() {
  const profiles = CR.CANON_RAIL_PROFILES.filter(p => LINE_STAGES.includes(p.modId));
  return {
    railProfileOrder: CR.CANON_RAIL_PROFILES.map(p => p.modId),
    rails: Object.fromEntries(profiles.map(p => [p.modId, plain(p)])),
    noRail: LINE_STAGES.filter(id => !CR.getCanonRailProfile({ modId: id })),
  };
}

function computeChapterTitles() {
  return Object.fromEntries(LINE_STAGES.map(id => {
    const ids = uniq([...stage(id).scenario.events.map(e => e.id), offTable(id), ...MAP_ENTRY_EVENT_IDS]);
    return [id, Object.fromEntries(ids.map(e => [e, NV.storyChapterTitle(id, e, FALLBACK)]))];
  }));
}

function computeMusic() {
  const chapterMusic = {}, eventMusic = {};
  for (const id of LINE_STAGES) {
    const mod = stage(id), chapters = mod.scenario.chapters || [];
    for (const c of chapters) chapterMusic[c.id] = MUSIC.resolveMusicMoodForChapter(c.id);
    for (const e of mod.scenario.events) {
      const ch = chapters.find(c => (c.eventIds || []).includes(e.id))?.id ?? null;
      eventMusic[e.id] = { chapterId: ch, idOnly: MUSIC.resolveMusicMoodForScenario(ch, [{ id: e.id }]), full: MUSIC.resolveMusicMoodForScenario(ch, [e]),
        anchorOnly: MUSIC.resolveMusicMoodForScenario(null, [{ id: e.id }]) };
    }
  }
  return { chapterMusic, eventMusic };
}

function computeObjectives() {
  const objectives = {};
  for (const id of LINE_STAGES) for (const e of stage(id).scenario.events) {
    objectives[e.id] = { idOnly: FQ.resolveFixedQuestObjective({ id: e.id }), full: FQ.resolveFixedQuestObjective(e) };
  }
  return objectives;
}

/** eventNarrativeView 里按关／事件写死的章名集合与路线地点表。 */
function computeNarrativeTables() {
  const sets = {
    HAN_PALACE_NIGHT_EVENT_IDS: [...NV.HAN_PALACE_NIGHT_EVENT_IDS],
    LUOYANG_COURT_EVENT_IDS: [...NV.LUOYANG_COURT_EVENT_IDS],
    LIUXIANPING_EVENT_IDS: [...NV.LIUXIANPING_EVENT_IDS],
    CHANGGAN_INTERLUDE_CHAPTER_EVENT_IDS: NV.CHANGGAN_INTERLUDE_CHAPTER_EVENT_IDS.map(([title, ids]) => [title, [...ids]]),
  };
  // storyRouteLocation：全书事件＋各事件的 _ins_ 姿态拍变体＋表外 id；只记有结果的，其余隐含为 undefined
  const probes = uniq([...ALL_EVENTS.map(x => x.event.id), ...ALL_EVENTS.map(x => `${x.event.id.split('_ins_')[0]}_ins_lines_s0`), 'lcq.event.__lines_s0_not_in_catalog__']);
  const storyRouteLocation = Object.fromEntries(probes.map(id => [id, NV.storyRouteLocation(id)]).filter(([, v]) => v !== undefined));
  return { sets, storyRouteLocationProbeCount: probes.length, storyRouteLocation };
}

function computeCharacterQuests() {
  const tableIds = [...CQ.CHARACTER_QUESTS.flatMap(q => q.beats.flatMap(b => b.eventIds)), ...CQ.CHARACTER_HIGHLIGHTS.flatMap(h => h.eventIds)];
  const probes = uniq([...ALL_EVENTS.map(x => x.event.id), ...tableIds, 'lcq.event.__lines_s0_not_in_catalog__']);
  const beatsAt = Object.fromEntries(probes.map(id => [id, CQ.characterBeatsAt(id)]).filter(([, v]) => v.length));
  const doneOf = ids => CQ.characterQuestProgress(ids);
  const progress = {
    empty: doneOf(undefined),
    ...Object.fromEntries(LINE_NAMES.map(l => [l, doneOf(LINES[l].flatMap(id => stage(id).scenario.events.map(e => e.id)))])),
    allBooks: doneOf(ALL_EVENTS.map(x => x.event.id)),
    allTableIds: doneOf(tableIds),
  };
  return { CHARACTER_QUESTS: plain(CQ.CHARACTER_QUESTS), CHARACTER_HIGHLIGHTS: plain(CQ.CHARACTER_HIGHLIGHTS),
    beatsAtUndefined: CQ.characterBeatsAt(undefined), beatsAtProbeCount: probes.length, beatsAt, progress };
}

function computeMainQuestAxis() {
  const nodeIndex = n => (n ? MQ.MAIN_QUEST_NODES.indexOf(n) : null);
  const locs = uniq(MQ.MAIN_QUEST_NODES.map(n => n.locationId).filter(Boolean));
  const currentNode = {};
  for (const { stageId, event } of ALL_EVENTS) {
    const hit = MQ.resolveCurrentMainQuestNode(stageId, undefined, event.id);
    if (hit) (currentNode[stageId] ||= {})[event.id] = nodeIndex(hit);
  }
  return {
    STAGE_ORDER: [...MQ.STAGE_ORDER], MAIN_QUEST_STAGES: plain(MQ.MAIN_QUEST_STAGES), MAIN_QUEST_NODES: plain(MQ.MAIN_QUEST_NODES),
    MAIN_QUEST_LAYERS: plain(MQ.MAIN_QUEST_LAYERS), MAIN_QUEST_REQUIREMENTS: plain(MQ.MAIN_QUEST_REQUIREMENTS),
    nodesByStage: Object.fromEntries([...PROBE_STAGE_IDS, '<undefined>'].map(id => [id, MQ.resolveMainQuestNodes(id === '<undefined>' ? undefined : id).map(nodeIndex)])),
    nodesByLocation: Object.fromEntries([...locs, 'liuchao.location.__none__'].map(l => [l, MQ.resolveMainQuestNodes(undefined, l).map(nodeIndex)])),
    currentNode,
    currentNodeUndefinedEvent: nodeIndex(MQ.resolveCurrentMainQuestNode('lcq.stage_01', undefined, undefined) ?? null),
    layer: Object.fromEntries([...PROBE_STAGE_IDS, '<undefined>'].map(id => [id, MQ.resolveMainQuestLayer(id === '<undefined>' ? undefined : id)?.layer ?? null])),
  };
}

function computeLineCritical() {
  const frozen = {};
  for (const id of [...Object.keys(SL.LINE_CRITICAL_EVENTS), 'lcq.event.s01_01']) {
    const hit = eventById(id), event = { id, ...(hit?.event.locationId ? { locationId: hit.event.locationId } : {}) };
    frozen[id] = {
      stageId: hit?.stageId ?? null, locationId: event.locationId ?? null,
      atSite: SL.lineCriticalFrozen(event, hit?.stageId, event.locationId),
      elsewhere: SL.lineCriticalFrozen(event, hit?.stageId, 'liuchao.location.__none__'),
      noStage: SL.lineCriticalFrozen(event, undefined, undefined),
      noLocationData: SL.lineCriticalFrozen(event, hit?.stageId, 'liuchao.location.__none__', false),
    };
  }
  return { LINE_CRITICAL_EVENTS: { ...SL.LINE_CRITICAL_EVENTS }, frozen };
}

function computeLineUnlock() {
  const ids = [...SL.SECONDARY_LINES.map(l => l.id), 'note', '__unknown_line__'];
  const freshSave = () => ({ 角色: { 属性: { 境界: { 名称: '凡人' } } }, 世界: { 状态: { 剧本模组: { completedEventIds: [] } } } });
  return {
    TAIQUAN_SONG_VARIANT_EVENT_ID: LU.TAIQUAN_SONG_VARIANT_EVENT_ID, LINE_UNLOCK_GAPS: [...LU.LINE_UNLOCK_GAPS],
    config: Object.fromEntries(ids.map(id => [id, plain(LU.lineUnlockConfig(id))])),
    statusFresh: Object.fromEntries(ids.map(id => [id, plain(quiet(() => LU.lineUnlockStatus(freshSave(), id)))])),
    statusRequired: Object.fromEntries(ids.map(id => [id, plain(quiet(() => LU.lineUnlockStatus(freshSave(), id, { required: true })))])),
    variant: {
      none: quiet(() => LU.taiquanEntryVariant(null)),
      empty: quiet(() => LU.taiquanEntryVariant({ completedEventIds: [] })),
      song: quiet(() => LU.taiquanEntryVariant({ completedEventIds: [LU.TAIQUAN_SONG_VARIANT_EVENT_ID] })),
    },
  };
}

/** persistentLineEntries：按关写死的藻丝入口（04b 之前不补）与驿馆会合（05b）。最小存档逐关探：人在／不在碧鲮 × 是否等会合。 */
function computePersistentEntries() {
  const sync = {};
  for (const id of PROBE_STAGE_IDS) for (const atBiling of [true, false]) for (const awaiting of [true, false]) {
    const save = { 角色: { 位置: { locationId: atBiling ? PE.ALGAE_ENTRY.locationId : 'liuchao.location.__none__' } },
      世界: { 状态: { 剧本模组: { modId: id, events: [], canon: {}, flags: awaiting ? { [SR.STAY_FLAG]: 'stay' } : {} } } } };
    const added = quiet(() => PE.syncPersistentLineEntries(save));
    const r = save.世界.状态.剧本模组;
    sync[`${id}|${atBiling ? 'biling' : 'elsewhere'}|${awaiting ? 'awaitRejoin' : 'noRejoin'}`] = { added, events: r.events.map(e => e.id),
      characters: (r.canon.characters || []).map(c => c.id), items: (r.canon.items || []).map(x => x.id) };
  }
  return { ALGAE_ENTRY: { ...PE.ALGAE_ENTRY }, REJOIN_ENTRY: { ...PE.REJOIN_ENTRY }, VISIT_ONLY_MAP_LOCATION_IDS: [...PE.VISIT_ONLY_MAP_LOCATION_IDS], sync };
}

function computeLinesSnapshot() {
  return {
    lines: LINES,
    ...computeRails(),
    chapterTitles: computeChapterTitles(),
    ...computeMusic(),
    objectives: computeObjectives(),
    narrativeTables: computeNarrativeTables(),
    characterQuests: computeCharacterQuests(),
    mainQuestAxis: computeMainQuestAxis(),
    lineCritical: computeLineCritical(),
    lineUnlock: computeLineUnlock(),
    persistentLineEntries: computePersistentEntries(),
  };
}
// ───────────── 计算口径结束 ─────────────

const snap = JSON.parse(readFileSync(new URL('./fixtures/lines-pack-snapshot.json', import.meta.url), 'utf8'));
const count = o => Object.keys(o).length;

test('快照覆盖面：六条线 29 关（stageRegions），不含宋、秦', () => {
  assert.deepEqual(LINES, snap.lines);
  assert.deepEqual(Object.fromEntries(LINE_NAMES.map(l => [l, snap.lines[l].length])), { 塞外: 3, 昭南: 6, 晋国: 3, 太泉: 3, 汉国: 6, 唐国: 8 });
  assert.equal(LINE_STAGES.length, 29);
  assert.ok(LINE_STAGES.every(id => BUILTIN_IDS.includes(id)), '29 关都还在 builtins/data');
  assert.equal(BUILTIN_IDS.length, 37);
});

test('rail：CANON_RAIL_PROFILES 全表 modId 顺序与长度；23 关 rail 档深快照（getCanonRailProfile 同值），6 个隔离关没有档', () => {
  const { railProfileOrder, rails, noRail } = computeRails();
  assert.deepEqual(railProfileOrder, snap.railProfileOrder);
  assert.equal(CR.CANON_RAIL_PROFILES.length, 30);
  assert.deepEqual(Object.keys(rails), Object.keys(snap.rails));
  for (const id of Object.keys(snap.rails)) {
    assert.deepStrictEqual(CR.getCanonRailProfile({ modId: id }), snap.rails[id], id);
    assert.deepStrictEqual(rails[id], snap.rails[id], id);
  }
  assert.deepEqual(noRail, snap.noRail);
  assert.deepEqual(noRail, ['lcq.stage_03', 'lcq.stage_05', 'lcq.stage_06', 'lyl.luoyang_coup', 'lyg.shixiang_ambush', 'lyg.ganlu_bian']);
  // 手审档里 entityName 动态名字已解析成最终字符串
  assert.equal(snap.rails['lcq.stage_01'].contracts[0].completionEvidence[0], '程宗扬');
  assert.ok(!JSON.stringify(snap.rails).includes('{{entity'), '快照里没有未解析的 {{entity…}} 模板');
});

test('29 关全部事件的界面章名（fallback 哨兵）＋每关表外事件＋地图入口口信拍', () => {
  const titles = computeChapterTitles();
  for (const id of LINE_STAGES) {
    assert.deepEqual(Object.keys(titles[id]), Object.keys(snap.chapterTitles[id]), `${id} 事件集合`);
    assert.deepEqual(titles[id], snap.chapterTitles[id], id);
  }
  assert.equal(Object.values(snap.chapterTitles).reduce((a, o) => a + count(o), 0), 505);
  // 现状钉点：各特判表
  assert.equal(snap.chapterTitles['lcq.stage_04']['lcq.event.s04_02'], '第46章·袭击');
  assert.equal(snap.chapterTitles['lcq.stage_04b_lingfei_baiyi_crisis']['lcq.event.enter_dong_with_migu'], '第86章·随弥骨入峒');
  assert.equal(snap.chapterTitles['lyl.han_palace_endgame'][offTable('lyl.han_palace_endgame')], '汉宫突入');
  assert.equal(snap.chapterTitles['lyg.changgan_begins'][offTable('lyg.changgan_begins')], '抵达长安灞桥');
  assert.equal(snap.chapterTitles['lyg.changgan_interlude'][offTable('lyg.changgan_interlude')], FALLBACK);
  assert.equal(snap.chapterTitles['lcq.stage_02'][offTable('lcq.stage_02')], '五原');
});

test('29 关全部章与事件的配乐解析（章解析、事件 idOnly／full／anchorOnly）', () => {
  const { chapterMusic, eventMusic } = computeMusic();
  assert.deepEqual(chapterMusic, snap.chapterMusic);
  assert.deepEqual(eventMusic, snap.eventMusic);
  assert.equal(count(snap.chapterMusic), 65);
  assert.equal(count(snap.eventMusic), 447);
  assert.equal(Object.values(snap.eventMusic).filter(m => m.anchorOnly !== 'theme').length, 46);
});

test('29 关全部事件的目标覆盖（resolveFixedQuestObjective：只给 id／带事件全文）', () => {
  assert.deepEqual(computeObjectives(), snap.objectives);
  assert.equal(count(snap.objectives), 447);
  assert.equal(Object.values(snap.objectives).filter(o => o.idOnly).length, 49);
});

test('eventNarrativeView：章名集合（汉宫／洛都／留仙坪／长安插曲）与 storyRouteLocation（全书事件＋_ins_ 变体）', () => {
  assert.deepEqual(computeNarrativeTables(), snap.narrativeTables);
  assert.equal(count(snap.narrativeTables.storyRouteLocation), 12);
});

test('characterQuests：CHARACTER_QUESTS／CHARACTER_HIGHLIGHTS 深快照，characterBeatsAt（全书事件＋表内 id）与 characterQuestProgress', () => {
  assert.deepStrictEqual(computeCharacterQuests(), snap.characterQuests);
  assert.equal(snap.characterQuests.CHARACTER_QUESTS.length, 8);
  assert.equal(snap.characterQuests.CHARACTER_HIGHLIGHTS.length, 63);
});

test('mainQuestAxis：STAGE_ORDER／MAIN_QUEST_STAGES／MAIN_QUEST_NODES 等深快照与三个查询函数', () => {
  assert.deepStrictEqual(computeMainQuestAxis(), snap.mainQuestAxis);
  assert.equal(snap.mainQuestAxis.STAGE_ORDER.length, 37);
  assert.deepEqual([...snap.mainQuestAxis.STAGE_ORDER].sort(), BUILTIN_IDS);
});

test('secondaryLines：LINE_CRITICAL_EVENTS 与 lineCriticalFrozen（到场／别处／无关卡／无地点数据）', () => {
  assert.deepStrictEqual(computeLineCritical(), snap.lineCritical);
  assert.equal(count(snap.lineCritical.LINE_CRITICAL_EVENTS), 10);
});

test('lineUnlock：各线配置、最小存档判定（含 required）、太泉进入说法', () => {
  assert.deepStrictEqual(computeLineUnlock(), snap.lineUnlock);
  assert.equal(snap.lineUnlock.TAIQUAN_SONG_VARIANT_EVENT_ID, 'lcq.event.s12_10_rescue_xiao');
  assert.deepEqual(snap.lineUnlock.variant, { none: 'wangzhe', empty: 'wangzhe', song: 'song' });
});

test('persistentLineEntries：藻丝入口／驿馆会合常量与逐关补入结果', () => {
  assert.deepStrictEqual(computePersistentEntries(), snap.persistentLineEntries);
  assert.equal(count(snap.persistentLineEntries.sync), PROBE_STAGE_IDS.length * 4);
  assert.equal(snap.persistentLineEntries.sync['lcq.stage_04|biling|noRejoin'].added, 0, '04b 之前不补藻丝');
  assert.equal(snap.persistentLineEntries.sync['lcq.stage_05b|elsewhere|awaitRejoin'].added, 1, '05b 等会合补会合拍');
});
