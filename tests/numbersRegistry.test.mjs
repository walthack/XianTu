// Numbers registry：四分包（战斗/成长/运行/助战）合并、冷启动 LCQ-NUM-007、热改 LCQ-NUM-008、与 applyGameNumbers 衔接。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const readJson = (rel) => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));

const COMBAT_KEYS = ['combat', 'difficulty', 'judgement', 'factors', 'weights', 'goalModifiers', 'sceneDefaults', 'historicalPrototype'];
const PROGRESS_KEYS = ['levels', 'training', 'techniques', 'status', 'currency', 'freeAction', 'affinity', 'reputation', 'lineBonds', 'npcCard', 'story', 'shop', 'crafting', 'loot'];
const RUNTIME_KEYS = ['version', 'tuning', 'diagnostics', 'saves', 'aiRetry', 'feedback', 'e2eSmoke', 'perf', 'ui'];
const ASSIST_KEYS = ['assist'];

test('权威四分包顶层键无重叠且并集盖住合并视图', () => {
  const combat = readJson('mod-kit/numbers-combat.json');
  const progress = readJson('mod-kit/numbers-progress.json');
  const runtime = readJson('mod-kit/numbers-runtime.json');
  const assist = readJson('mod-kit/numbers-assist.json');
  const merged = readJson('mod-kit/game-numbers.qingyu.json');
  assert.deepEqual(Object.keys(assist).sort(), [...ASSIST_KEYS].sort());
  assert.deepEqual(Object.keys(combat).sort(), [...COMBAT_KEYS].sort());
  assert.deepEqual(Object.keys(progress).sort(), [...PROGRESS_KEYS].sort());
  assert.deepEqual(Object.keys(runtime).sort(), [...RUNTIME_KEYS].sort());
  const union = new Set([...Object.keys(combat), ...Object.keys(progress), ...Object.keys(runtime), ...Object.keys(assist)]);
  assert.deepEqual([...union].sort(), Object.keys(merged).sort());
  for (const key of Object.keys(merged)) {
    const src = key in combat ? combat[key] : key in progress ? progress[key] : key in assist ? assist[key] : runtime[key];
    assert.deepEqual(merged[key], src, key);
  }
});

test('GAME_NUMBERS 冷启动合并形状与生成物一致，registry 通过', async () => {
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  const registry = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
  const merged = readJson('mod-kit/game-numbers.qingyu.json');
  assert.deepEqual(structuredClone(numbers.GAME_NUMBERS), merged);
  assert.deepEqual(registry.validateAgainstRegistry(numbers.GAME_NUMBERS, 'cold'), []);
});

test('本轮迁入的 6 条键已在配置且代码可读', async () => {
  const N = (await loadTs('../src/modules/sceneModule/numbers.ts')).GAME_NUMBERS;
  assert.equal(N.judgement.dice.sides, 20);
  assert.equal(N.affinity.range.min, -100);
  assert.equal(N.affinity.range.max, 100);
  assert.equal(N.status.permanentMinutesThreshold, 99999);
  assert.equal(N.sceneDefaults.brief.narrateMaxChars, 700);
  assert.equal(N.sceneDefaults.auditKeep, 200);
  assert.equal(N.status.freeText.minConfidence, 0.9);
  const dice = await loadTs('../src/modules/sceneModule/dice.ts');
  const face = dice.dieAt(1, 'action', 0);
  assert.ok(face >= 1 && face <= N.judgement.dice.sides);
});

test('冷启动缺段 → LCQ-NUM-007', async () => {
  const registry = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
  const tree = structuredClone(readJson('mod-kit/game-numbers.qingyu.json'));
  delete tree.judgement;
  const errors = registry.validateAgainstRegistry(tree, 'cold');
  assert.ok(errors.some(e => /缺段：judgement/.test(e)));
});

test('热改 registry 范围失败 → LCQ-NUM-008，且 GAME_NUMBERS 未改', async () => {
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  const before = numbers.GAME_NUMBERS.judgement.dice.sides;
  assert.throws(
    () => numbers.applyGameNumbers({ judgement: { dice: { sides: 1 } } }),
    err => err.code === 'LCQ-NUM-008' && /sides/.test(err.message),
  );
  assert.equal(numbers.GAME_NUMBERS.judgement.dice.sides, before);
});

test('热改未知键仍 LCQ-NUM-002；类型错仍 LCQ-NUM-003', async () => {
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  assert.throws(() => numbers.applyGameNumbers({ nope: 1 }), err => err.code === 'LCQ-NUM-002');
  assert.throws(() => numbers.applyGameNumbers({ judgement: { dice: { sides: 'x' } } }), err => err.code === 'LCQ-NUM-003');
});

test('场景骰 / 好感钳制读配置', async () => {
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  const affinity = await loadTs('../src/modules/scenarioMods/affinityLadder.ts');
  assert.equal(affinity.clampAffinity(-999), numbers.GAME_NUMBERS.affinity.range.min);
  assert.equal(affinity.clampAffinity(999), numbers.GAME_NUMBERS.affinity.range.max);
  const tiers = await loadTs('../src/modules/sceneModule/tiers.ts');
  const sides = numbers.GAME_NUMBERS.judgement.dice.sides;
  const hit = tiers.resolveCheck({ face: sides, modifier: -50, difficulty: 30, grounded: true }, tiers.resolveSettings());
  assert.equal(hit.tier, 'great_success');
  assert.equal(hit.natTriggered, 'nat20');
});

test('story.lineOutcome.tiers 必填非空', async () => {
  const registry = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  const tree = structuredClone(readJson('mod-kit/game-numbers.qingyu.json'));
  assert.deepEqual(tree.story.lineOutcome.tiers, ['resolved', 'unresolved']);
  assert.equal(tree.story.lineOutcome.writeOnce, true);
  assert.ok(tree.story.identity.kinds.length > 0);
  delete tree.story.lineOutcome.tiers;
  assert.ok(registry.validateAgainstRegistry(tree, 'cold').some(e => e === '缺字段：story.lineOutcome.tiers'));
  tree.story.lineOutcome.tiers = [];
  assert.ok(registry.validateAgainstRegistry(tree, 'cold').some(e => /story\.lineOutcome\.tiers 不能为空数组/.test(e)));
  delete tree.story.identity.kinds;
  assert.ok(registry.validateAgainstRegistry(tree, 'cold').some(e => e === '缺字段：story.identity.kinds'));
  const before = [...numbers.GAME_NUMBERS.story.lineOutcome.tiers];
  assert.throws(() => numbers.applyGameNumbers({ story: { lineOutcome: { tiers: [] } } }), err => err.code === 'LCQ-NUM-008');
  assert.deepEqual(numbers.GAME_NUMBERS.story.lineOutcome.tiers, before);
});

test('story.lineOutcome.failEndsGame 键正好是 judgedLines（太泉不判档）、值为 bool', async () => {
  const registry = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  const lineIds = new Set(readJson('mod-kit/entity-catalog/index.json').entries.filter(e => e.kind === 'line').map(e => e.id));
  for (const id of registry.NATION_LINE_IDS) assert.ok(lineIds.has(id), `实体索引缺国家线 ${id}`);
  const fresh = () => structuredClone(readJson('mod-kit/game-numbers.qingyu.json'));
  const base = fresh();
  const judged = registry.NATION_LINE_IDS.filter(id => id !== 'taiquan');
  assert.deepEqual([...base.story.lineOutcome.judgedLines].sort(), [...judged].sort());
  assert.deepEqual(Object.keys(base.story.lineOutcome.failEndsGame).sort(), [...base.story.lineOutcome.judgedLines].sort());
  assert.ok(Object.values(base.story.lineOutcome.failEndsGame).every(v => v === false));
  assert.deepEqual(registry.validateAgainstRegistry(base, 'cold'), []);
  // 缺线
  const missing = fresh();
  delete missing.story.lineOutcome.failEndsGame.qin;
  assert.ok(registry.validateAgainstRegistry(missing, 'cold').some(e => e === '缺字段：story.lineOutcome.failEndsGame.qin'));
  // 多线：非判档的太泉、未知线都拒
  const extra = fresh();
  extra.story.lineOutcome.failEndsGame.taiquan = false;
  extra.story.lineOutcome.failEndsGame.chu = true;
  const extraErrors = registry.validateAgainstRegistry(extra, 'cold');
  assert.ok(extraErrors.some(e => e.startsWith('非判档线：story.lineOutcome.failEndsGame.taiquan')));
  assert.ok(extraErrors.some(e => e.startsWith('非判档线：story.lineOutcome.failEndsGame.chu')));
  // 判档线集合走配置：把太泉加进 judgedLines 并补键即通过
  const withTaiquan = fresh();
  withTaiquan.story.lineOutcome.judgedLines.push('taiquan');
  withTaiquan.story.lineOutcome.failEndsGame.taiquan = false;
  assert.deepEqual(registry.validateAgainstRegistry(withTaiquan, 'cold'), []);
  // judgedLines：未知线、重复、空、缺失
  const badJudged = fresh();
  badJudged.story.lineOutcome.judgedLines.push('chu', 'jin');
  const badErrors = registry.validateAgainstRegistry(badJudged, 'cold');
  assert.ok(badErrors.some(e => e === '未知国家线：story.lineOutcome.judgedLines[6]=chu'));
  assert.ok(badErrors.some(e => e === '判档线重复：story.lineOutcome.judgedLines[7]=jin'));
  const emptyJudged = fresh();
  emptyJudged.story.lineOutcome.judgedLines = [];
  assert.ok(registry.validateAgainstRegistry(emptyJudged, 'cold').some(e => /judgedLines 不能为空数组/.test(e)));
  const noJudged = fresh();
  delete noJudged.story.lineOutcome.judgedLines;
  assert.ok(registry.validateAgainstRegistry(noJudged, 'cold').some(e => e === '缺字段：story.lineOutcome.judgedLines'));
  // 值不是 bool
  const wrong = fresh();
  wrong.story.lineOutcome.failEndsGame.song = 'yes';
  assert.ok(registry.validateAgainstRegistry(wrong, 'cold').some(e => /failEndsGame\.song 须为 bool/.test(e)));
  // 整段缺失
  const absent = fresh();
  delete absent.story.lineOutcome.failEndsGame;
  assert.ok(registry.validateAgainstRegistry(absent, 'cold').some(e => e === '缺字段：story.lineOutcome.failEndsGame'));
  // 热改加未知线被拒，原值不变
  assert.throws(() => numbers.applyGameNumbers({ story: { lineOutcome: { failEndsGame: { taiquan: false } } } }), err => err.code === 'LCQ-NUM-002');
  assert.equal('taiquan' in numbers.GAME_NUMBERS.story.lineOutcome.failEndsGame, false);
  // 热改缩判档线而不删键被拒，原值不变
  assert.throws(() => numbers.applyGameNumbers({ story: { lineOutcome: { judgedLines: ['jin'] } } }), err => err.code === 'LCQ-NUM-008');
  assert.equal(numbers.GAME_NUMBERS.story.lineOutcome.judgedLines.length, judged.length);
});

test('diagnostics.debug.categories 必填 object', async () => {
  const registry = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  const spec = registry.FIELD_SPECS.find(s => s.path === 'diagnostics.debug.categories');
  assert.deepEqual(spec, { path: 'diagnostics.debug.categories', kind: 'object', required: true, section: 'runtime' });
  const fresh = () => structuredClone(readJson('mod-kit/game-numbers.qingyu.json'));
  assert.deepEqual(registry.validateAgainstRegistry(fresh(), 'cold'), []);
  const absent = fresh();
  delete absent.diagnostics.debug.categories;
  assert.ok(registry.validateAgainstRegistry(absent, 'cold').some(e => e === '缺字段：diagnostics.debug.categories'));
  assert.ok(registry.validateAgainstRegistry(absent, 'patch').some(e => e === '缺字段：diagnostics.debug.categories'), '必填：热改合并后也查');
  for (const bad of [[], true, null]) {
    const tree = fresh();
    tree.diagnostics.debug.categories = bad;
    assert.ok(registry.validateAgainstRegistry(tree, 'cold').some(e => e === '字段类型无效：diagnostics.debug.categories 须为 object'), JSON.stringify(bad));
  }
  assert.throws(() => numbers.applyGameNumbers({ diagnostics: { debug: { categories: true } } }), err => err.code === 'LCQ-NUM-003');
  assert.equal(typeof numbers.GAME_NUMBERS.diagnostics.debug.categories, 'object');
});

test('story.itemProvenance.dedupeBy 必填且只能取 everObtained / currentlyHeld（补充设计稿 2026-10-26 §2.5）', async () => {
  const registry = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  const spec = registry.FIELD_SPECS.find(s => s.path === 'story.itemProvenance.dedupeBy');
  assert.deepEqual(spec, { path: 'story.itemProvenance.dedupeBy', kind: 'string', required: true, oneOf: ['everObtained', 'currentlyHeld'], section: 'progress' });
  const fresh = () => structuredClone(readJson('mod-kit/game-numbers.qingyu.json'));
  assert.equal(fresh().story.itemProvenance.dedupeBy, 'everObtained', '总策划 2026-10-26 审定取推荐值');
  for (const mode of ['everObtained', 'currentlyHeld']) {
    const tree = fresh();
    tree.story.itemProvenance.dedupeBy = mode;
    assert.deepEqual(registry.validateAgainstRegistry(tree, 'cold'), [], mode);
  }
  const absent = fresh();
  delete absent.story.itemProvenance.dedupeBy;
  assert.ok(registry.validateAgainstRegistry(absent, 'cold').some(e => e === '缺字段：story.itemProvenance.dedupeBy'));
  assert.ok(registry.validateAgainstRegistry(absent, 'patch').some(e => e === '缺字段：story.itemProvenance.dedupeBy'), '必填：热改合并后也查');
  const wrongKind = fresh();
  wrongKind.story.itemProvenance.dedupeBy = 1;
  assert.ok(registry.validateAgainstRegistry(wrongKind, 'cold').some(e => e === '字段类型无效：story.itemProvenance.dedupeBy 须为 string'));
  const wrongValue = fresh();
  wrongValue.story.itemProvenance.dedupeBy = 'byName';
  assert.ok(registry.validateAgainstRegistry(wrongValue, 'cold').some(e => /字段范围无效：story\.itemProvenance\.dedupeBy 须为 everObtained\/currentlyHeld 之一：byName/.test(e)));
  // 热改取第三值被拒，原值不变
  assert.throws(() => numbers.applyGameNumbers({ story: { itemProvenance: { dedupeBy: 'byName' } } }), err => err.code === 'LCQ-NUM-008');
  assert.equal(numbers.GAME_NUMBERS.story.itemProvenance.dedupeBy, 'everObtained');
});

test('story.progressDeadline.limits 必填、首版 {}、每项 due≥1 且 0≤urgentAt<due（补充设计稿 2026-10-26 §4.6）', async () => {
  const registry = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
  const spec = registry.FIELD_SPECS.find(s => s.path === 'story.progressDeadline.limits');
  assert.deepEqual(spec, { path: 'story.progressDeadline.limits', kind: 'object', required: true, section: 'progress' });
  const fresh = () => structuredClone(readJson('mod-kit/game-numbers.qingyu.json'));
  assert.deepEqual(fresh().story.progressDeadline.limits, {}, '首版留空，数值待总策划给');
  assert.deepEqual(readJson('mod-kit/numbers-progress.json').story.progressDeadline.limits, {}, '生成物与权威分包一致');
  const withLimits = (limits) => { const tree = fresh(); tree.story.progressDeadline.limits = limits; return registry.validateAgainstRegistry(tree, 'cold'); };
  assert.deepEqual(withLimits({ 'liuchao.deadline.a': { due: 3, urgentAt: 2 }, 'liuchao.deadline.b': { due: 1, urgentAt: 0 } }), []);
  const absent = fresh();
  delete absent.story.progressDeadline.limits;
  assert.ok(registry.validateAgainstRegistry(absent, 'patch').some(e => e === '缺字段：story.progressDeadline.limits'));
  assert.ok(withLimits([]).some(e => e === '字段类型无效：story.progressDeadline.limits 须为 object'));
  const at = 'story.progressDeadline.limits.liuchao.deadline.a';
  const cases = [
    [{ due: 0, urgentAt: 0 }, `字段范围无效：${at}.due < 1`, `字段范围无效：${at}.urgentAt 须小于 due`],
    [{ due: 2.5, urgentAt: 0 }, `字段类型无效：${at}.due 须为 int`],
    [{ urgentAt: 0 }, `字段类型无效：${at}.due 须为 int`],
    [{ due: 2 }, `字段类型无效：${at}.urgentAt 须为 int`],
    [{ due: 2, urgentAt: -1 }, `字段范围无效：${at}.urgentAt < 0`],
    [{ due: 2, urgentAt: 2 }, `字段范围无效：${at}.urgentAt 须小于 due`],
    [{ due: 2, urgentAt: 1, onDue: 'x' }, `未知字段：${at}.onDue（只有 due / urgentAt）`],
    [3, `字段类型无效：${at} 须为 object`],
  ];
  for (const [limit, ...messages] of cases) assert.deepEqual(withLimits({ 'liuchao.deadline.a': limit }), messages, JSON.stringify(limit));
});

test('story.identity.prompt.maxItems 必填 int≥1、首版 3（补充设计稿 2026-10-26 §5.4）', async () => {
  const registry = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  const spec = registry.FIELD_SPECS.find(s => s.path === 'story.identity.prompt.maxItems');
  assert.deepEqual(spec, { path: 'story.identity.prompt.maxItems', kind: 'int', required: true, min: 1, section: 'progress' });
  const fresh = () => structuredClone(readJson('mod-kit/game-numbers.qingyu.json'));
  assert.equal(fresh().story.identity.prompt.maxItems, 3);
  assert.deepEqual(readJson('mod-kit/numbers-progress.json').story.identity.prompt, { maxItems: 3 }, '生成物与权威分包一致');
  const withMax = (value) => { const tree = fresh(); tree.story.identity.prompt.maxItems = value; return registry.validateAgainstRegistry(tree, 'cold'); };
  assert.deepEqual(withMax(1), []);
  assert.ok(withMax(0).includes('字段范围无效：story.identity.prompt.maxItems < 1'));
  assert.ok(withMax(2.5).includes('字段类型无效：story.identity.prompt.maxItems 须为 int'));
  const absent = fresh();
  delete absent.story.identity.prompt.maxItems;
  assert.ok(registry.validateAgainstRegistry(absent, 'patch').includes('缺字段：story.identity.prompt.maxItems'), '必填：热改合并后也查');
  assert.throws(() => numbers.applyGameNumbers({ story: { identity: { prompt: { maxItems: 0 } } } }), err => err.code === 'LCQ-NUM-008');
  assert.equal(numbers.GAME_NUMBERS.story.identity.prompt.maxItems, 3);
});

test('story.lineUnlock.taiquan 四键取值、FIELD_SPECS 三条、交叉校验（太泉解锁设计稿 2026-10-27 §2 / §10-3）', async () => {
  const registry = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  const fresh = () => structuredClone(readJson('mod-kit/game-numbers.qingyu.json'));
  const expected = { minRealmLevel: 5, minClosedLines: 1, countTiers: ['resolved', 'unresolved'], requireDeadlinesCleared: ['liuchao.deadline.ice_gu'] };
  const { note, ...taiquan } = numbers.GAME_NUMBERS.story.lineUnlock.taiquan;
  assert.equal(note, undefined, '线内不放 note，说明写在 story.lineUnlock.note');
  assert.deepEqual(structuredClone(taiquan), expected, 'GAME_NUMBERS 四值等于设计稿 §2');
  assert.deepEqual(readJson('mod-kit/numbers-progress.json').story.lineUnlock.taiquan, expected, '权威分包与生成物一致');
  assert.equal('enforce' in taiquan, false, '不设 enforce 开关（总策划 2026-10-27 定 §14-3）');
  assert.deepEqual(registry.FIELD_SPECS.filter(s => s.path.startsWith('story.lineUnlock.')), [
    { path: 'story.lineUnlock.taiquan.minRealmLevel', kind: 'int', required: true, min: 0, section: 'progress' },
    { path: 'story.lineUnlock.taiquan.minClosedLines', kind: 'int', required: true, min: 0, section: 'progress' },
    { path: 'story.lineUnlock.taiquan.countTiers', kind: 'array', required: true, section: 'progress' },
  ], 'requireDeadlinesCleared 不进 FIELD_SPECS（空数组合法）');
  assert.deepEqual(registry.validateAgainstRegistry(fresh(), 'cold'), []);
  const errorsOf = (mutate, mode = 'cold') => { const tree = fresh(); mutate(tree.story.lineUnlock, tree); return registry.validateAgainstRegistry(tree, mode); };
  const at = 'story.lineUnlock.taiquan';
  // 缺三个 FIELD_SPEC 键：冷启动与热改合并后都报
  for (const key of ['minRealmLevel', 'minClosedLines', 'countTiers']) {
    for (const mode of ['cold', 'patch']) assert.deepEqual(errorsOf(u => { delete u.taiquan[key]; }, mode), [`缺字段：${at}.${key}`], `${key} ${mode}`);
  }
  assert.ok(errorsOf(u => { delete u.taiquan; }).includes(`缺字段：${at}.minRealmLevel`), '整线缺失同样拦下');
  // 形状
  assert.deepEqual(errorsOf(u => { u.taiquan.minRealmLevel = -1; }), [`字段范围无效：${at}.minRealmLevel < 0`]);
  assert.deepEqual(errorsOf(u => { u.taiquan.minClosedLines = 1.5; }), [`字段类型无效：${at}.minClosedLines 须为 int`]);
  assert.deepEqual(errorsOf(u => { u.taiquan.countTiers = []; }), [`字段范围无效：${at}.countTiers 不能为空数组`]);
  // 上限读配置，不写死 9 / 6
  assert.deepEqual(errorsOf(u => { u.taiquan.minRealmLevel = 9; }), []);
  assert.deepEqual(errorsOf(u => { u.taiquan.minRealmLevel = 10; }), [`字段范围无效：${at}.minRealmLevel > levels.max（9）`]);
  assert.deepEqual(errorsOf((u, t) => { t.levels.max = 4; }), [`字段范围无效：${at}.minRealmLevel > levels.max（4）`]);
  assert.deepEqual(errorsOf(u => { u.taiquan.minClosedLines = 6; }), []);
  assert.deepEqual(errorsOf(u => { u.taiquan.minClosedLines = 7; }), [`字段范围无效：${at}.minClosedLines > story.lineOutcome.judgedLines 条数（6），门永远打不开`]);
  assert.deepEqual(errorsOf(u => { u.taiquan.minClosedLines = 0; }), [], '0 合法（恒过）');
  // countTiers ⊆ tiers、不重复
  assert.deepEqual(errorsOf(u => { u.taiquan.countTiers = ['resolved']; }), []);
  assert.deepEqual(errorsOf(u => { u.taiquan.countTiers = ['resolved', 'absent']; }), [`字段范围无效：${at}.countTiers[1]=absent 不在 story.lineOutcome.tiers`]);
  assert.deepEqual(errorsOf(u => { u.taiquan.countTiers = ['resolved', 'resolved']; }), [`档位重复：${at}.countTiers[1]=resolved`]);
  // requireDeadlinesCleared：必有、数组、非空字符串、不重复；空数组合法
  assert.deepEqual(errorsOf(u => { u.taiquan.requireDeadlinesCleared = []; }), []);
  assert.deepEqual(errorsOf(u => { delete u.taiquan.requireDeadlinesCleared; }), [`缺字段：${at}.requireDeadlinesCleared`]);
  assert.deepEqual(errorsOf(u => { u.taiquan.requireDeadlinesCleared = 'liuchao.deadline.ice_gu'; }), [`字段类型无效：${at}.requireDeadlinesCleared 须为 array`]);
  assert.deepEqual(errorsOf(u => { u.taiquan.requireDeadlinesCleared = ['liuchao.deadline.ice_gu', 3, '']; }),
    [`字段类型无效：${at}.requireDeadlinesCleared[1] 须为非空字符串`, `字段类型无效：${at}.requireDeadlinesCleared[2] 须为非空字符串`]);
  assert.deepEqual(errorsOf(u => { u.taiquan.requireDeadlinesCleared.push('liuchao.deadline.ice_gu'); }), [`期限重复：${at}.requireDeadlinesCleared[1]=liuchao.deadline.ice_gu`]);
  // 未知线、未知字段、整段类型
  assert.deepEqual(errorsOf(u => { u.chu = structuredClone(u.taiquan); }), ['未知国家线：story.lineUnlock.chu']);
  assert.deepEqual(errorsOf(u => { u.taiquan.enforce = false; }), [`未知字段：${at}.enforce（只有 note / minRealmLevel / minClosedLines / countTiers / requireDeadlinesCleared）`]);
  assert.deepEqual(errorsOf(u => { u.note = 1; }), ['字段类型无效：story.lineUnlock.note 须为 string']);
  assert.deepEqual(errorsOf((u, t) => { t.story.lineUnlock = []; }).filter(e => e.startsWith('字段类型无效：story.lineUnlock ')), ['字段类型无效：story.lineUnlock 须为 object']);
  // 其它国家线也可配（不在 FIELD_SPECS 的线由交叉校验补形状）
  assert.deepEqual(errorsOf(u => { u.jin = { minRealmLevel: 3, minClosedLines: 0, countTiers: ['resolved'], requireDeadlinesCleared: [] }; }), []);
  assert.deepEqual(errorsOf(u => { u.jin = { minRealmLevel: 'x', countTiers: [] }; }), [
    '字段类型无效：story.lineUnlock.jin.minRealmLevel 须为 int', '缺字段：story.lineUnlock.jin.minClosedLines',
    '字段范围无效：story.lineUnlock.jin.countTiers 不能为空数组', '缺字段：story.lineUnlock.jin.requireDeadlinesCleared',
  ]);
  // 热改：越界 → NUM-008 原值不变；合法值即时生效后复原；未知线 → NUM-002
  assert.throws(() => numbers.applyGameNumbers({ story: { lineUnlock: { taiquan: { minClosedLines: 99 } } } }), err => err.code === 'LCQ-NUM-008' && /minClosedLines/.test(err.message));
  assert.equal(numbers.GAME_NUMBERS.story.lineUnlock.taiquan.minClosedLines, 1);
  assert.throws(() => numbers.applyGameNumbers({ story: { lineUnlock: { taiquan: { countTiers: ['resolved', 'x'] } } } }), err => err.code === 'LCQ-NUM-008');
  assert.throws(() => numbers.applyGameNumbers({ story: { lineUnlock: { jin: { minRealmLevel: 1 } } } }), err => err.code === 'LCQ-NUM-002');
  numbers.applyGameNumbers({ story: { lineUnlock: { taiquan: { minRealmLevel: 4, requireDeadlinesCleared: [] } } } });
  try {
    assert.equal(numbers.GAME_NUMBERS.story.lineUnlock.taiquan.minRealmLevel, 4);
    assert.deepEqual(numbers.GAME_NUMBERS.story.lineUnlock.taiquan.requireDeadlinesCleared, []);
  } finally {
    numbers.applyGameNumbers({ story: { lineUnlock: { taiquan: { minRealmLevel: 5, requireDeadlinesCleared: ['liuchao.deadline.ice_gu'] } } } });
  }
  assert.deepEqual(structuredClone(numbers.GAME_NUMBERS.story.lineUnlock.taiquan), expected);
});
