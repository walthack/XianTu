// B0「补钉快照」：框架 TS 里剩下的写死剧情数据表（姿态档案、好感上限、IF 分歧、玩家动作展示、分支锁、叙事兼容变体、结局、
// 行旅定义、地点别名、runtime.ts 三张表）搬进内容包之前，把现行**可观察输出**钉成快照（tests/fixtures/residual-tables-snapshot.json）。
// 快照由基线 048ca74a 的现行实现导出一次写入，**只导出一次、以后不重生；搬迁 PR（B1–B8、BZ）不得改这份快照**。
// 计算口径在 tests/residualTablesSnapshot.export.mjs（导出与本测试同一段代码）；本测试只读快照、按同一口径重算并逐项比对。
// 已由 linesPackSnapshot／songPackSnapshot 钉住的（storyRouteLocation、characterQuests、mainQuestAxis、LINE_CRITICAL_EVENTS／lineCriticalFrozen、
//   persistentLineEntries 常量与 sync、SECONDARY_LINES 等）这里不重复；只补 persistentLineEntries.algaeCollected 这一处缺口。
// 搬迁后只允许换读取来源，期望一律不改；探针集合变了（新增／少了事件、动作、结局）会变红，须人工确认后单独补快照。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeResidualSnapshot, FIXTURE_URL } from './residualTablesSnapshot.export.mjs';

const snap = JSON.parse(readFileSync(FIXTURE_URL, 'utf8'));
const now = computeResidualSnapshot();
const count = o => Object.keys(o).length;

test('快照覆盖面：基线、关数与全书事件数', () => {
  assert.equal(snap.baseline, '048ca74a');
  assert.equal(now.stageCount, snap.stageCount);
  assert.equal(now.eventCount, snap.eventCount);
  assert.equal(snap.stageCount, 38);
  assert.equal(snap.eventCount, 585);
});

test('stanceProfiles：STANCE_PROFILES 深快照（含顺序）＋全部名字 × 三档 formatStanceProfile／hasStanceProfile', () => {
  assert.deepStrictEqual(now.stanceProfiles, snap.stanceProfiles);
  assert.equal(snap.stanceProfiles.STANCE_PROFILES.length, 49);
  assert.equal(snap.stanceProfiles.formatProbeCount, snap.stanceProfiles.nameProbeCount * 3);
  assert.equal(snap.stanceProfiles.hasStanceProfile['__b0_无档案者__'], false);
});

test('affinityCaps：AFFINITY_CAPS 深快照（cap 已解析成数值）＋每个名字／id × 关系标签的 affinityCapFor／formatAffinityCap', () => {
  assert.deepStrictEqual(now.affinityCaps, snap.affinityCaps);
  assert.equal(snap.affinityCaps.AFFINITY_CAPS.length, 13);
  assert.ok(snap.affinityCaps.AFFINITY_CAPS.every(c => typeof c.cap === 'number'));
  assert.equal(snap.affinityCaps.capFor['liuchao.character.__b0_none__|<undefined>'], null, '表外实体无上限');
});

test('divergenceLedger：五条分支规则＋一条后果规则的命中／不命中、落账 flags、幂等、提示词各分支', () => {
  assert.deepStrictEqual(now.divergenceLedger, snap.divergenceLedger);
  const hits = Object.values(snap.divergenceLedger.branch).filter(Boolean);
  assert.deepEqual([...new Set(hits)].sort(), ['lcq.if_sudaji_slain_mochou', 'lcq.if_xiaozi_spares_mother', 'lcq.if_xieyi_longrest', 'lyg.if_dongzhuo_longrest', 'lyg.if_guojie_longrest']);
  assert.equal(snap.divergenceLedger.record['lcq.event.s06_03|liuchao.character.xie_yi|"missing"|void'].flags['world.xieyi_absence.active'], true, '谢艺失踪后果');
});

test('playerActionPresentation：全书事件 × 全部动作＋表外动作的 resolveScopedPlayerLine／playerActionDisplayOverride（只记非空）', () => {
  assert.deepStrictEqual(now.playerActionPresentation, snap.playerActionPresentation);
  assert.equal(count(snap.playerActionPresentation.override), 7);
  assert.ok(snap.playerActionPresentation.override[`lcq.stage_04b_lingfei_baiyi_crisis|lcq.event.huamiao_coop_boundary::__b0_not_in_contract__`], 'huamiao 是事件级：表外动作同样命中');
});

test('branchDecision：LOCKED_DECISIONS 深快照（含键顺序）＋全书事件的 detectBranchDecision／isDormantLockedOption', () => {
  assert.deepStrictEqual(now.branchDecision, snap.branchDecision);
  assert.equal(snap.branchDecision.lockedOrder.length, 6);
});

test('eventNarrativeView：兼容变体三事件＋shanghou_revealed 在各 flag 组合 × 新旧事件快照下；s02_04 罗盘；寿阳下舞都展示', () => {
  assert.deepStrictEqual(now.eventNarrativeView, snap.eventNarrativeView);
  assert.equal(snap.eventNarrativeView.comboCount, 96);
  assert.equal(count(snap.eventNarrativeView.results), 4 * 2 * 96);
  const c = snap.eventNarrativeView.compass;
  assert.notEqual(c['s02_04|withCanon|<undefined>'], c['contrast|withCanon|<undefined>'], 's02_04 罗盘只显示目标（对照事件会带「去X」）');
  assert.notEqual(snap.eventNarrativeView.actionPresentation.atWudu.label, '原label');
  assert.equal(snap.eventNarrativeView.actionPresentation.elsewhere.label, '原label');
});

test('结局：全部 endingId（含旧档别名与表外 id）× 来源事件的 canonicalEndingId／endingKey／endingPresentation／fixedEndingNarrative／旧 E01 迁移', () => {
  assert.deepStrictEqual(now.endings, snap.endings);
  const e = snap.endings.byPair;
  assert.equal(e['lcq.ending.death.paolao|lcq.event.ningyu_enters_gamble'].key, 'E01', '旧 E01 别名');
  assert.equal(e['lcq.ending.death.paolao|lcq.event.sudaji_south_pact'].key, 'E03');
  assert.notEqual(e['lcq.ending.death.ajiman_bond|lcq.event.wuerlang_joins'].narrative, e['lcq.ending.death.ajiman_bond|lcq.event.__b0_not_in_catalog__'].narrative, 'ENDING_PATH_TEXTS 阿姬曼路分支句');
});

test('行旅定义：南荒、五原两份 OpenWorldSliceDefinition 及其常量深快照', () => {
  assert.deepStrictEqual(now.travelDefs, snap.travelDefs);
  assert.equal(snap.travelDefs.nanhuang.NANHUANG_ROUTES.length, 29);
  assert.equal(snap.travelDefs.wuyuan.WUYUAN_OPEN_WORLD_DEFINITION.routes.length, 8);
});

test('travel/locationIds：别名／父子／规范名表＋全部地点 id 的规范化、祖先链、国别描述与名字反查', () => {
  assert.deepStrictEqual(now.locationIds, snap.locationIds);
  assert.equal(snap.locationIds.byName['白夷族'], 'liuchao.location.baiyi');
});

test('runtime.ts 三张表（未导出，钉公开入口）：migrateBatch6TextContracts、wuyuanS0204Guidance、advanceScenarioRuntime 的同伴补登记', () => {
  assert.deepStrictEqual(now.runtimeTables, snap.runtimeTables);
  const hits = snap.runtimeTables.contractRevisions.hits;
  assert.equal(hits['lcq.event.geluo_summons_biji'].withFromHash.stateHash, 'f0f6dac7');
  // 现状钉点：表里 s02_04、silent_sheyi_village 两条的 to 哈希已不等于现行合同哈希，迁移对它们不生效
  assert.ok(!hits['lcq.event.s02_04'] && !hits['lcq.event.silent_sheyi_village']);
  // 地图合同：只有「点心铺 × 玩家走两条路线之一 × 做两个本地动作之一」4 种满足（另有未激活／无运行时两种无提示）
  const met = Object.entries(snap.runtimeTables.s0204MapContract.guidance).filter(([, v]) => v === null).map(([k]) => k);
  assert.equal(met.length, 6);
  assert.ok(met.filter(k => k.includes('|')).every(k => k.startsWith('lcq.zone.wuyuan.pastry_shop|') && k.includes('|player|')));
  // 同伴补登记：现状三人性别都落成「其他」（表里性别列被别名展开挤位，见 b0-summary）
  assert.deepEqual(snap.runtimeTables.earlyEncounters.results.all.map(r => r.gender), ['其他', '其他', '其他']);
});

test('persistentLineEntries 缺口：algaeCollected 各依据（拍回执／路径回执／发物回执／背包）', () => {
  assert.deepStrictEqual(now.persistentLineEntriesGap, snap.persistentLineEntriesGap);
});

// ───────────── 反例自测：改内存里的拷贝，证明比对会红（不改 src）─────────────
test('反例：改动一条姿态档案文案／好感上限数值／一条锁文案，比对必须红', () => {
  const mutate = fn => { const copy = structuredClone(now); fn(copy); return copy; };
  assert.throws(() => assert.deepStrictEqual(mutate(c => { c.stanceProfiles.STANCE_PROFILES[0].constant[0] += '·'; }).stanceProfiles, snap.stanceProfiles));
  assert.throws(() => assert.deepStrictEqual(mutate(c => { c.affinityCaps.AFFINITY_CAPS[0].cap += 1; }).affinityCaps, snap.affinityCaps));
  assert.throws(() => assert.deepStrictEqual(mutate(c => { const k = c.branchDecision.lockedOrder[0]; c.branchDecision.LOCKED_DECISIONS[k][0][1] = '改过'; }).branchDecision, snap.branchDecision));
});

test('反例：表顺序变化（姿态档案两条互换、锁键顺序互换）也必须红', () => {
  const copy = structuredClone(now);
  const p = copy.stanceProfiles.STANCE_PROFILES; [p[0], p[1]] = [p[1], p[0]];
  assert.throws(() => assert.deepStrictEqual(copy.stanceProfiles, snap.stanceProfiles));
  const l = copy.branchDecision.lockedOrder; [l[0], l[1]] = [l[1], l[0]];
  assert.throws(() => assert.deepStrictEqual(copy.branchDecision, snap.branchDecision));
});

test('反例：多出／少了一个探针（结局表多一个 id、哈希迁移少一条命中）必须红', () => {
  const copy = structuredClone(now);
  copy.endings.byPair['lcq.ending.__b0_extra__|x'] = { canonical: 'x', key: '', image: null, narrative: null };
  assert.throws(() => assert.deepStrictEqual(copy.endings, snap.endings));
  delete copy.runtimeTables.contractRevisions.hits['lcq.event.geluo_summons_biji'];
  assert.throws(() => assert.deepStrictEqual(copy.runtimeTables, snap.runtimeTables));
});
