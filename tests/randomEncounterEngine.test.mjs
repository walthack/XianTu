// 随机遇敌引擎 第1张（用户 2026-10-28 13:48 第1、2、4、6条；10-19 三步；总策划技术决定）：配置、种子掷骰、①危区 ②几率检 ③遇敌 → 待开战。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';

const N = await loadTs('../src/modules/sceneModule/numbers.ts');
const registry = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
const E = await loadTs('../src/modules/scenarioMods/randomEncounter.ts');
const { sceneLedgerSummary } = await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
const { activeScene, writeExt, emptyExt } = await loadTs('../src/modules/sceneModule/host/ext.ts');
const { canonicalLocationId } = await loadTs('../src/modules/scenarioMods/travel/locationIds.ts');
const { canonicalEntityId } = await loadTs('../src/modules/scenarioMods/namedEntities.ts');
const { NANHUANG_ZONES, NANHUANG_STAGE_IDS } = await loadTs('../src/modules/scenarioMods/travel/defs/qingyuNanhuang.ts');
const { logStore } = await loadTs('../src/modules/diagnostics/store.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const { buildStrictScenarioInitialization, applyStrictScenarioInitializationToSave } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');

const rt = s => s.世界.状态.剧本模组;
const INN = 'lcq.location.guiwang_inn';
const WARRIOR = 'lcq.enemy.guiwang_warrior';
const stageJson = async id => JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`, import.meta.url), 'utf8'));
const opened = {};
async function open(id) {
  if (!opened[id]) {
    opened[id] = advanceScenarioRuntime(applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), buildStrictScenarioInitialization(await stageJson(id)))).saveData;
    opened[id].元数据.创建时间 = '2026-10-28T06:00:00.000Z'; // 固定种子：开局写的是当前时刻
  }
  return structuredClone(opened[id]);
}
/** 05b 开局：人在鬼王峒驿馆（行旅账写的规范 id），当前事件无必经合同。 */
const open05b = () => open('lcq.stage_05b');
const moveTo = (s, locationId, 描述) => { s.角色.位置 = { ...s.角色.位置, locationId, 描述 }; };
/** 测试配置：驿馆 hostile、几率 1、冷却 0、单条敌池（鬼王峒武士 [2,2] 3 级）。 */
function config({ tier = 'hostile', chance = 1, cooldown = 0, zones, pool, difficulty, skip = [] } = {}) {
  const c = structuredClone(N.GAME_NUMBERS.encounter);
  c.tiers[tier] = { chance, cooldownTurns: cooldown };
  if (difficulty) Object.assign(c.difficulty, difficulty);
  c.regions.nanhuang.zones = zones ?? [{ key: INN, tier }];
  c.regions.nanhuang.pool = pool ?? [{ enemyId: WARRIOR, level: 3, zones: [INN], weight: 1, count: [2, 2] }];
  c.regions.nanhuang.skipDuringEventIds = skip;
  return c;
}
const tick = (s, c, narrated = true) => E.tickRandomEncounter(s, { narrated, config: c });
const next = (s, c, narrated = true) => { rt(s).worldTurn++; return tick(s, c, narrated); };
/** 走到 ③ 已掷中（pending reveal）。 */
function toReveal(s, c) { tick(s, c); next(s, c); next(s, c); assert.equal(rt(s).encounter.pending.stage, 'reveal'); }

test('① 真实配置：encounter 段已登记；南荒 zones/pool 照剧情策划草案填入；非危险地点 no_zone 且不建状态', async () => {
  const cfg = N.GAME_NUMBERS.encounter;
  assert.ok(cfg && cfg.enabled === true);
  assert.ok(registry.REQUIRED_TOP.some(t => t.key === 'encounter' && t.section === 'combat'));
  assert.ok(registry.SECTION_KEYS.combat.includes('encounter'));
  assert.deepEqual(E.validateEncounterConfig(cfg), []);
  assert.deepEqual(Object.keys(cfg.tiers), N.GAME_NUMBERS.freeAction.dangerTiers);
  const nh = cfg.regions.nanhuang;
  assert.deepEqual(nh.zones.map(z => z.key), ['liuchao.location.shan_jian', 'liuchao.location.sea_temple', 'liuchao.location.gui_wang_dong', INN, 'liuchao.location.gui_wang_gong', 'liuchao.location.gui_wang_gong.jingshen_tai',
    // 2026-11-01 南荒敌池稿 §4 补的区（含花苗寨一带密林）。
    'lcq.location.huamiao_village', 'lcq.location.giant_vine', 'lcq.location.nanhuang_route', 'nh.black_shoal', 'liuchao.location.baiyi', 'liuchao.location.south_wild_valley', 'lcq.location.turtle_road_ruins', 'lcq.location.guiwang_outer_post']);
  // 精英不进池（用户 2026-11-01）；稿 R1–R10 去掉白尾豹共 10 种。
  assert.deepEqual(nh.pool.map(p => `${p.enemyId}:${p.variant}:${p.level}`), [`${WARRIOR}:normal:3`, 'lcq.enemy.yin_spider:normal:2', 'lcq.enemy.ghostface_wasp:normal:1', 'lcq.enemy.venom_bat:normal:2',
    'lcq.enemy.swamp_crocodile:normal:3', 'lcq.enemy.crow_man:normal:3', 'lcq.enemy.merfolk:normal:4', 'lcq.enemy.altar_corpse:normal:null', 'lcq.enemy.wild_boar:normal:2', 'lcq.enemy.nh_venom_snake:normal:1']);
  assert.deepEqual(nh.skipDuringEventIds, ['lcq.event.s05b_06_breakout_and_reunion', 'lcq.event.s05b_08b_altar_corpse_fight_and_danchen']);
  // 南荒判定：行旅账管理的南荒关（02 是五原，不算）全部命中。
  const re = new RegExp(nh.modIdPattern);
  for (const id of NANHUANG_STAGE_IDS) assert.equal(re.test(id), id !== 'lcq.stage_02', id);
  assert.equal(re.test('lcq.stage_05'), false);
  // 开局在驿馆，s05b_02 未完成 → 窗口未开。
  const s = await open05b();
  const r = E.tickRandomEncounter(s, { narrated: true });
  assert.equal(r.reason, 'no_zone');
  assert.equal(r.changed, false);
  assert.equal(rt(s).encounter, undefined);
});

test('① 地点 key 与读取代码一致：配置 key 都是规范 id，且各对应一个行旅 zone（鬼王峒行旅写 guiwang_dong → 规范 gui_wang_dong）', async () => {
  const zones = N.GAME_NUMBERS.encounter.regions.nanhuang.zones;
  const travelKeys = new Set(NANHUANG_ZONES.filter(z => z.worldLocationId).map(z => canonicalLocationId(canonicalEntityId('location', canonicalLocationId(z.worldLocationId)))));
  const zoneIds = new Set(NANHUANG_ZONES.map(z => z.id));
  // 2026-11-01 起区也可以是总表里国别为南荒的地点（按国别算进南荒，跨国落点不切关）或没有总表地点的行旅 zone（雨林黑石滩）。
  const southLocations = new Set(JSON.parse(await readFile(new URL('../mod-kit/entity-catalog/locations.json', import.meta.url), 'utf8')).entries.filter(e => e.definition.country === '南荒').map(e => e.id));
  for (const z of zones) {
    assert.equal(canonicalLocationId(z.key), z.key, z.key);
    assert.ok(travelKeys.has(z.key) || zoneIds.has(z.key) || southLocations.has(z.key), `${z.key} 既不是行旅 zone 也不是南荒地点`);
  }
  for (const p of N.GAME_NUMBERS.encounter.regions.nanhuang.pool) for (const k of p.zones) assert.ok(zones.some(z => z.key === k), k);
  const s = await open05b();
  moveTo(s, 'liuchao.location.guiwang_dong', '南荒·鬼王峒');
  assert.equal(E.encounterLocKey(s), 'liuchao.location.gui_wang_dong');
  rt(s).completedEventIds.push('lcq.event.s05b_02_xiaozi_exposed');
  assert.equal(E.encounterGate(s), null);
  assert.equal(E.tickRandomEncounter(s, { narrated: true }).changed, true);
  assert.deepEqual(rt(s).encounter.pending, { stage: 'foreshadow', locKey: 'liuchao.location.gui_wang_dong', tier: 'hostile', setTurn: rt(s).worldTurn });
  // 平定之后窗口关闭。
  const after = await open05b();
  moveTo(after, 'liuchao.location.guiwang_dong', '南荒·鬼王峒');
  rt(after).completedEventIds.push('lcq.event.s05b_02_xiaozi_exposed', 'lcq.event.s05b_10_slave_revolt_and_phoenix_change');
  assert.equal(E.encounterGate(after), 'no_zone');
});

test('② 三步顺序：到达只设 ①；演出后记 foreshadowed；再留一回合掷中 ③；③ 演出后待开战；全程不建场面', async () => {
  const s = await open05b(), c = config();
  assert.deepEqual(tick(s, c), { changed: true });
  assert.equal(rt(s).encounter.pending.stage, 'foreshadow');
  assert.deepEqual(rt(s).encounter.receipts, []);
  let facts = E.encounterPromptFacts(s, c);
  assert.equal(facts.危区.地点, '鬼王峒驿馆');
  assert.equal(facts.危区.要求, c.prompt.foreshadow);
  assert.equal(facts.遇敌, undefined);
  assert.match(buildScenarioStoryPrompt(s, ''), /【遇敌事实（程序已定）】鬼王峒驿馆是危险地带。/);
  assert.equal(activeScene(s), null);

  next(s, c);
  assert.equal(rt(s).encounter.pending, null);
  assert.deepEqual(rt(s).encounter.foreshadowed[INN], { tier: 'hostile', atTurn: rt(s).worldTurn });
  assert.deepEqual(rt(s).encounter.receipts, []);
  assert.deepEqual(E.encounterPromptFacts(s, c), {});

  next(s, c);
  const p = rt(s).encounter.pending;
  assert.equal(p.stage, 'reveal');
  // 一打一（用户 2026-11-01）：maxCount=1，池条目写 [2,2] 也只来一个。
  assert.deepEqual({ enemyId: p.enemyId, variant: p.variant, count: p.count, level: p.level }, { enemyId: WARRIOR, variant: 'normal', count: 1, level: 3 });
  assert.equal(p.id, `enc:${INN}:${rt(s).worldTurn}`);
  assert.equal(rt(s).encounter.receipts.length, 1);
  assert.equal(rt(s).encounter.receipts[0].hit, true);
  facts = E.encounterPromptFacts(s, c);
  assert.deepEqual(facts, { 遇敌: { 对手: '鬼王峒武士', 数量: 1, 要求: c.prompt.reveal } });
  assert.doesNotMatch(JSON.stringify(facts), /chance|roll|几率|骰|level|等级|hostile|档/);
  const prompt = buildScenarioStoryPrompt(s, '');
  assert.match(prompt, /【遇敌事实（程序已定）】对手：鬼王峒武士，共1名。/);
  assert.equal(E.pendingRandomBattle(s), null);
  assert.equal(activeScene(s), null);

  next(s, c);
  assert.equal(rt(s).encounter.pending.stage, 'battle');
  assert.deepEqual(E.pendingRandomBattle(s), rt(s).encounter.pending);
  assert.deepEqual(E.encounterPromptFacts(s, c), {});
  assert.equal(activeScene(s), null);
  // 待开战期间不再掷骰。
  next(s, c); next(s, c);
  assert.equal(rt(s).encounter.receipts.length, 1);
});

test('③ ① 之后离开：无回执、foreshadowed 清掉，回来重走 ①；③ 阶段离开记 left', async () => {
  const s = await open05b(), c = config();
  tick(s, c); next(s, c);
  assert.ok(rt(s).encounter.foreshadowed[INN]);
  moveTo(s, 'liuchao.location.guiwang_dong', '南荒·鬼王峒');
  assert.equal(next(s, c).reason, 'no_zone');
  assert.deepEqual(rt(s).encounter.foreshadowed, {});
  assert.deepEqual(rt(s).encounter.receipts, []);
  moveTo(s, INN, '南荒·鬼王峒驿馆');
  next(s, c);
  assert.equal(rt(s).encounter.pending.stage, 'foreshadow');

  const r = await open05b();
  toReveal(r, c);
  const id = rt(r).encounter.pending.id;
  moveTo(r, 'liuchao.location.guiwang_dong', '南荒·鬼王峒');
  next(r, c);
  assert.equal(rt(r).encounter.pending, null);
  assert.equal(rt(r).encounter.receipts.find(x => x.id === id).outcome, 'left');
});

test('④ chance 0 的档位从不命中；cooldownTurns=2 时两次检查间隔 ≥2 回合', async () => {
  const s = await open05b(), zero = config({ chance: 0 });
  for (let i = 0; i < 20; i++) assert.equal(next(s, zero).reason, 'safe_tier');
  assert.equal(rt(s).encounter, undefined);

  const t = await open05b(), c = config({ chance: 1e-12, cooldown: 2 });
  tick(t, c);
  for (let i = 0; i < 20; i++) next(t, c);
  const turns = rt(t).encounter.receipts.map(r => r.turn);
  assert.ok(turns.length >= 8);
  assert.ok(rt(t).encounter.receipts.every(r => r.hit === false));
  for (let i = 1; i < turns.length; i++) assert.ok(turns[i] - turns[i - 1] >= 2, JSON.stringify(turns));
});

test('⑤ 确定性：克隆两份 20 回合回执逐字相同；改创建时间后命中序列不同', async () => {
  const c = config({ chance: 0.5 });
  const run = s => { tick(s, c); for (let i = 0; i < 20; i++) { next(s, c); if (rt(s).encounter.pending?.stage === 'battle') rt(s).encounter.pending = null; } return rt(s).encounter.receipts; };
  const a = await open05b(), b = structuredClone(a), d = structuredClone(a);
  d.元数据.创建时间 = '2026-01-01T00:00:00.000Z';
  const ra = run(a), rb = run(b), rd = run(d);
  assert.deepEqual(ra, rb);
  assert.ok(ra.length >= 5);
  assert.ok(ra.some(r => r.hit) && ra.some(r => !r.hit));
  assert.notDeepEqual(ra.map(r => [r.turn, r.hit]), rd.map(r => [r.turn, r.hit]));
  assert.notEqual(rt(a).encounter.seed, rt(d).encounter.seed);
});

test('⑥ 难度：宽松 ×0 从不命中；严苛 ×1、加 1 级；receipt.chance 为乘积；旧档按两项反查档位', async () => {
  const c = config({ chance: 0.6, difficulty: { 宽松: { chanceMul: 0, levelShift: 0 }, 严苛: { chanceMul: 1.5, levelShift: 1 } } });
  const easy = await open05b();
  easy.系统.难度设置 = { autoRaiseLevel: true, trainingCap: 'none', preset: '宽松' };
  tick(easy, c);
  for (let i = 0; i < 20; i++) next(easy, c);
  assert.ok(rt(easy).encounter.receipts.length > 0);
  assert.ok(rt(easy).encounter.receipts.every(r => !r.hit && r.chance === 0 && r.preset === '宽松'));

  const hard = await open05b();
  hard.系统.难度设置 = { autoRaiseLevel: false, trainingCap: 'none', preset: '严苛' };
  toReveal(hard, c);
  assert.equal(rt(hard).encounter.pending.level, 4);
  const receipt = rt(hard).encounter.receipts.at(-1);
  assert.equal(receipt.chance, Math.min(1, 0.6 * 1.5));
  assert.equal(receipt.preset, '严苛');
  assert.equal(receipt.level, 4);

  const preset = d => E.encounterPresetOf({ 系统: { 难度设置: d } });
  assert.equal(preset({ autoRaiseLevel: false, trainingCap: 'none' }), '严苛');
  assert.equal(preset({ autoRaiseLevel: true, trainingCap: 'none' }), '标准'); // 宽松与标准两项相同，旧档分不出，按默认档
  assert.equal(preset({ autoRaiseLevel: true, trainingCap: 'none', preset: '宽松' }), '宽松');
  assert.equal(preset({ autoRaiseLevel: true, trainingCap: 'none', preset: '不存在' }), '标准');
  assert.equal(preset(undefined), N.GAME_NUMBERS.difficulty.defaultPreset);
});

test('⑦ 门禁：场面进行中不动；必经合同（F04）不掷骰并撤掉已有待定；窗口排除表；gameOver 不动', async () => {
  const c = config();
  const scene = await open05b();
  toReveal(scene, c);
  const before = structuredClone(rt(scene).encounter);
  writeExt(scene, { ...emptyExt(), active: { contractId: 'combat.test', eventId: 'lcq.event.test' } });
  assert.equal(next(scene, c).reason, 'active_scene');
  assert.deepEqual(rt(scene).encounter.pending, before.pending);
  assert.deepEqual(rt(scene).encounter.receipts, before.receipts);

  // F04 鸦人（必经合同）当前事件：白夷设为测试危险地点。
  const f04 = await open('lcq.stage_04b_lingfei_baiyi_crisis');
  const BAIYI = 'liuchao.location.baiyi', c4 = config({ zones: [{ key: BAIYI, tier: 'hostile' }], pool: [{ enemyId: WARRIOR, level: 3, zones: [BAIYI], weight: 1, count: [2, 2] }] });
  toReveal(f04, c4);
  const id = rt(f04).encounter.pending.id;
  const eventId = 'lcq.event.s04b_lingfei_baiyi_crisis_03';
  rt(f04).activeEventIds = [eventId];
  rt(f04).currentChapterId = rt(f04).chapters.find(ch => ch.eventIds.includes(eventId)).id;
  assert.equal(E.encounterGate(f04, c4), 'story_contract');
  const receipts = rt(f04).encounter.receipts.length;
  assert.equal(next(f04, c4).reason, 'story_contract');
  assert.equal(rt(f04).encounter.pending, null);
  assert.equal(rt(f04).encounter.receipts.find(r => r.id === id).outcome, 'preempted');
  for (let i = 0; i < 5; i++) next(f04, c4);
  assert.equal(rt(f04).encounter.receipts.length, receipts);

  // 无合同的剧情拍落在窗口排除表里：按当前事件进行中跳过。
  const skip = await open05b(), cs = config({ skip: ['lcq.event.blank_letter_and_dagu'] });
  assert.equal(E.encounterGate(skip, cs), 'story_event');
  assert.equal(tick(skip, cs).reason, 'story_event');
  assert.equal(rt(skip).encounter, undefined);

  const over = await open05b();
  tick(over, c);
  const snap = structuredClone(rt(over).encounter);
  rt(over).gameOver = { endingId: 'x', title: 'x', facts: [], sourceEventId: 'x', atTurn: 1 };
  assert.equal(next(over, c).reason, 'game_over');
  assert.deepEqual(rt(over).encounter.pending, snap.pending);
});

test('⑦ 原地窗口被剧情关掉：未开战的待定撤掉（记 preempted），不让下一轮事实包继续写敌人现身', async () => {
  const c = config({ zones: [{ key: INN, tier: 'hostile', activeWhen: { untilEventIds: ['lcq.event.ghost_king_swallowed'] } }] });
  const s = await open05b();
  toReveal(s, c);
  const id = rt(s).encounter.pending.id;
  rt(s).completedEventIds.push('lcq.event.ghost_king_swallowed');
  assert.equal(next(s, c).reason, 'no_zone');
  assert.equal(rt(s).encounter.pending, null);
  assert.equal(rt(s).encounter.receipts.find(r => r.id === id).outcome, 'preempted');
  assert.deepEqual(E.encounterPromptFacts(s, c), {});
});

test('⑧ 不写剧情状态：完整命中流程前后只有 runtime.encounter 变化', async () => {
  const s = await open05b(), c = config();
  const before = structuredClone(s);
  tick(s, c); next(s, c); next(s, c); next(s, c);
  assert.equal(rt(s).encounter.pending.stage, 'battle');
  const after = structuredClone(s);
  delete rt(after).encounter;
  rt(before).worldTurn = rt(after).worldTurn;
  assert.deepEqual(after, before);
  for (const key of ['flags', 'completedEventIds', 'activeEventIds', 'sceneLedger', 'identityLedger']) assert.deepEqual(rt(s)[key], rt(before)[key], key);
  assert.deepEqual(s.角色, before.角色);
});

test('⑨ 幂等：同一 worldTurn 调两次，第二次 changed=false 且不改状态', async () => {
  const s = await open05b(), c = config();
  tick(s, c); next(s, c);
  rt(s).worldTurn++;
  assert.equal(tick(s, c).changed, true);
  const snap = structuredClone(rt(s).encounter);
  assert.deepEqual(tick(s, c), { changed: false, reason: 'same_turn' });
  assert.deepEqual(rt(s).encounter, snap);
});

test('⑩ narrated=false 的回合不确认 ① 与 ③', async () => {
  const s = await open05b(), c = config();
  tick(s, c);
  for (let i = 0; i < 3; i++) next(s, c, false);
  assert.equal(rt(s).encounter.pending.stage, 'foreshadow');
  assert.deepEqual(rt(s).encounter.foreshadowed, {});
  next(s, c); next(s, c);
  assert.equal(rt(s).encounter.pending.stage, 'reveal');
  for (let i = 0; i < 3; i++) next(s, c, false);
  assert.equal(rt(s).encounter.pending.stage, 'reveal');
  next(s, c);
  assert.equal(rt(s).encounter.pending.stage, 'battle');
  // 叙事路径口径：固定文本不算；模块路径只有逐拍演出关卡带事实包；原链路算。
  assert.equal(E.encounterNarratedBy(s, 'local'), false);
  assert.equal(E.encounterNarratedBy(s, 'modular'), false); // 05b 模块路径不带「账本摘要」
  assert.equal(E.encounterNarratedBy(s, undefined), true);
  assert.equal(E.encounterNarratedBy({ 世界: { 状态: { 剧本模组: { modId: 'lcq.stage_04b_lingfei_baiyi_crisis' } } } }, 'modular'), true);
});

test('⑪ 坏条目跳过、LCQ-SAV-033 按条目只记一次，有效条目照常抽中；精英变体是独立条目', async () => {
  const pool = [
    { enemyId: 'lcq.enemy.no_such_enemy', level: 3, zones: [INN], weight: 50, count: [1, 1] },
    { enemyId: WARRIOR, level: 3, zones: [INN], weight: 50, count: [3, 1] },
    { enemyId: WARRIOR, variant: 'elite', level: 4, zones: [INN], weight: 1, count: [1, 1] },
  ];
  const c = config({ pool });
  const logged = () => logStore.recent(2000).filter(e => e.code === 'LCQ-SAV-033' && /no_such_enemy|^1:/.test(String(e.detail?.key)));
  const runs = [];
  for (let k = 0; k < 3; k++) {
    const s = await open05b();
    toReveal(s, c);
    runs.push(rt(s).encounter.pending);
  }
  for (const p of runs) assert.deepEqual({ enemyId: p.enemyId, variant: p.variant, level: p.level, count: p.count }, { enemyId: WARRIOR, variant: 'elite', level: 4, count: 1 });
  const entries = logged();
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map(e => e.detail.reason).sort(), ['bad_count', 'unknown_enemy']);
  assert.ok(entries.every(e => e.level === 'warn' && e.module === 'randomEncounter'));
  // 池子全坏：按未命中记 empty_pool。
  const empty = await open05b(), ce = config({ pool: [pool[0]] });
  tick(empty, ce); next(empty, ce); next(empty, ce);
  assert.equal(rt(empty).encounter.pending, null);
  assert.deepEqual(rt(empty).encounter.receipts.map(r => [r.hit, r.reason]), [[false, 'empty_pool']]);
  // 有名敌不进池。
  const named = config({ pool: [{ enemyId: 'lcq.enemy.ge_luo', level: 3, zones: [INN], weight: 1, count: [1, 1] }] });
  const n = await open05b();
  tick(n, named); next(n, named); next(n, named);
  assert.equal(rt(n).encounter.receipts.at(-1).reason, 'empty_pool');
});

test('⑫ sceneLedgerSummary：① 待演出时带 危区；无待定时与改前一致', async () => {
  const s = await open05b(), c = config();
  const plain = sceneLedgerSummary(s);
  assert.equal('危区' in plain || '遇敌' in plain, false);
  tick(s, c);
  const withFacts = sceneLedgerSummary(s);
  assert.equal(withFacts.危区.地点, '鬼王峒驿馆');
  const { 危区: _drop, ...rest } = withFacts;
  assert.deepEqual(rest, plain);
  rt(s).encounter.pending = null;
  assert.deepEqual(sceneLedgerSummary(s), plain);
});

test('配置深层校验：档位键、几率区间、难度键、正则；热改不过整份拒绝', () => {
  const bad = structuredClone(N.GAME_NUMBERS.encounter);
  bad.tiers.hostile.chance = 1.5;
  bad.tiers.guarded.cooldownTurns = 0.5;
  delete bad.difficulty.宽松;
  bad.regions.nanhuang.modIdPattern = '(';
  const problems = E.validateEncounterConfig(bad);
  assert.equal(problems.length, 4, problems.join('\n'));
  assert.throws(() => E.tickRandomEncounter({}, { narrated: true, config: bad }), /LCQ-NUM-007/);
  assert.throws(() => N.applyGameNumbers({ encounter: { tiers: { hostile: { chance: 2 } } } }), /LCQ-NUM-00[68]/);
  assert.equal(N.GAME_NUMBERS.encounter.tiers.hostile.chance, 0.22);
  assert.throws(() => N.applyGameNumbers({ encounter: { regions: { nanhuang: { modIdPattern: '(' } } } }), /LCQ-NUM-006/);
  assert.equal(N.GAME_NUMBERS.encounter.regions.nanhuang.modIdPattern, '^lcq\\.stage_0(?:3b|4|4b|5b)');
});
