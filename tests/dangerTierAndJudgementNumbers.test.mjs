// 地点危险档（dangerTier）+ 判定数值进配置（judgement 段）+ 主入口 tuning.json 热改：
// 无标档 / 缺省时行为与原来完全一致；标档按配置加难度；配置体检挡住坏值；tuning 任何失败都静默回落。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { load, makeSave, mods, ticket } from './freeActionFixture.mjs';

const tier = await load('../src/modules/scenarioMods/freeAction/dangerTier.ts');
const judgementCfg = await load('../src/utils/judgementConfig.ts');
const engine = mods.judgement;
const dice = await load('../src/utils/diceRoller.ts');
const preflight = await load('../src/utils/judgementPreflight.ts');
const rules = await load('../src/utils/judgementRules.ts');
const tuning = await load('../src/modules/sceneModule/runtimeTuning.ts');
const skillMatch = await load('../src/modules/scenarioMods/freeAction/skillMatch.ts');
const narrated = await load('../src/utils/narratedDamage.ts');
const vital = await load('../src/utils/playerVitalGuard.ts');

const N = () => mods.numbers.GAME_NUMBERS;
const cfg = () => mods.config.freeActionConfig();
const field = ticket('field', 'scene_act', null);
const readJson = rel => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));

/** 改完用例必须还原 GAME_NUMBERS（整份快照走 applyGameNumbers 合并回去）。 */
async function restoring(fn) {
  const before = structuredClone(N());
  try { return await fn(); } finally { mods.numbers.applyGameNumbers(before); }
}
const quiet = async fn => {
  const saved = { debug: console.debug, info: console.info };
  console.debug = console.info = () => {};
  try { return await fn(); } finally { Object.assign(console, saved); }
};
const fieldDifficulty = (locationId, extra) => {
  const save = makeSave();
  if (locationId) save.角色.位置.locationId = locationId;
  extra?.(save);
  const prepared = mods.plan.prepareFreeAction(save, field, {});
  assert.equal(prepared.kind, 'issued');
  return prepared.proposal.difficulty;
};

// ───────────── 地点危险档 ─────────────

test('无标档的地点 / 没有位置 id：场面潜行仍是 DC20、hard，与原来一致', () => {
  assert.deepEqual(fieldDifficulty(undefined), { band: 'hard', value: 20 });
  assert.deepEqual(fieldDifficulty('liuchao.location.wuyuan'), { band: 'hard', value: 20 });
  assert.deepEqual(fieldDifficulty('不存在的地点'), { band: 'hard', value: 20 });
});

test('标了档的地点按 field.dangerTierShift 加难度：皇宫 fortress +6、鬼王宫 hostile +4', () => {
  assert.deepEqual(fieldDifficulty('lyg.location.daming_palace'), { band: 'severe', value: 26 });
  assert.deepEqual(fieldDifficulty('liuchao.location.gui_wang_gong'), { band: 'severe', value: 24 });
  assert.equal(tier.dangerTierOf(Object.assign(makeSave(), {})), cfg().defaultDangerTier);
});

test('档位加值来自配置：改 fortress 的值难度跟着变，删掉整张表回到不加', async () => {
  await restoring(async () => {
    mods.numbers.applyGameNumbers({ freeAction: { classes: { field: { dangerTierShift: { fortress: 9 } } } } });
    assert.equal(fieldDifficulty('lyg.location.daming_palace').value, 29);
  });
  const c = cfg(), saved = c.classes.field.dangerTierShift;
  try {
    delete c.classes.field.dangerTierShift;
    assert.equal(fieldDifficulty('lyg.location.daming_palace').value, 20);
  } finally { c.classes.field.dangerTierShift = saved; }
});

test('地点总表标的 dangerTier 不在词表里时按默认档处理（不加难度）', () => {
  const save = makeSave();
  save.角色.位置.locationId = 'lyg.location.daming_palace';
  const c = cfg(), saved = c.dangerTiers;
  try {
    c.dangerTiers = ['safe'];
    assert.equal(tier.dangerTierOf(save), 'safe');
  } finally { c.dangerTiers = saved; }
});

test('难度修正挂点默认恒为 0', () => {
  assert.equal(tier.difficultyModifiers({ save: makeSave(), spec: {}, ticket: field, tier: 'safe' }), 0);
});

test('地点总表：已标的 tier 都在词表里，已标的 id 就是约定的这几个', () => {
  const tiers = N().freeAction.dangerTiers;
  const tagged = readJson('../mod-kit/entity-catalog/locations.json').entries.filter(e => e.definition.dangerTier !== undefined);
  for (const entry of tagged) assert.ok(tiers.includes(entry.definition.dangerTier), entry.id);
  assert.deepEqual(Object.fromEntries(tagged.map(e => [e.id, e.definition.dangerTier])), {
    'lyg.location.daming_palace': 'fortress', 'lyl.location.nangong': 'fortress', 'lyl.location.zhaoyang_palace': 'fortress', 'lyl.location.changqiu_palace': 'fortress',
    'liuchao.location.gui_wang_gong': 'hostile', 'liuchao.location.gui_wang_gong.jingshen_tai': 'hostile',
  });
});

test('validateFreeActionConfig：未知档 id、非数 shift、默认档不在词表都报错；默认配置通过', () => {
  assert.deepEqual(mods.config.validateFreeActionConfig(), []);
  const broken = patch => { const c = structuredClone(cfg()); patch(c); return mods.config.validateFreeActionConfig(c); };
  assert.match(broken(c => { c.classes.field.dangerTierShift.lair = 3; }).join('\n'), /field\.dangerTierShift 的 lair 不是已知危险档/);
  assert.match(broken(c => { c.classes.field.dangerTierShift.hostile = '4'; }).join('\n'), /field\.dangerTierShift\.hostile 须为数/);
  assert.match(broken(c => { c.classes.field.dangerTierShift.hostile = NaN; }).join('\n'), /field\.dangerTierShift\.hostile 须为数/);
  assert.match(broken(c => { c.defaultDangerTier = 'nowhere'; }).join('\n'), /defaultDangerTier nowhere 不在 dangerTiers 里/);
  assert.match(broken(c => { c.dangerTiers = ['safe', 'safe']; }).join('\n'), /dangerTiers 须为不重复的非空字符串数组/);
});

test('热改写进未知档 id 会被体检整份拒绝并退回', async () => {
  await restoring(() => {
    assert.throws(() => mods.numbers.applyGameNumbers({ freeAction: { classes: { field: { dangerTierShift: { fortress: 'x' } } } } }), /数值配置类型无效|数值体检未通过/);
    assert.equal(N().freeAction.classes.field.dangerTierShift.fortress, 6);
    assert.throws(() => mods.numbers.applyGameNumbers({ freeAction: { defaultDangerTier: 'nowhere' } }), /数值体检未通过.*defaultDangerTier/);
    assert.equal(N().freeAction.defaultDangerTier, 'safe');
  });
});

// ───────────── escape 标签词表 ─────────────

test('escape 技能 / 天赋标签补了 潜行 / 隐匿 / 敛息，场面潜行的天赋加成命中', () => {
  for (const word of ['潜行', '隐匿', '敛息']) assert.ok(N().freeAction.skillMatch.tags.escape.includes(word), word);
  const spec = mods.config.variantSpecOf('field', 'scene_act');
  const save = makeSave();
  save.角色.身份.天赋 = [{ 名称: '敛息之体', 描述: '' }];
  const factors = skillMatch.skillTalentFactors(save, spec);
  assert.deepEqual(factors.map(f => [f.source, f.value]), [['talent', N().freeAction.skillMatch.talentBonus]]);
});

// ───────────── 判定数值进配置：默认行为不变 ─────────────

const legacyOutcome = (total, d) => total >= d + 30 ? 'perfect' : total >= d + 15 ? 'great_success' : total >= d ? 'success' : total >= d - 5 ? 'partial' : total >= d - 15 ? 'failure' : 'critical_failure';

test('outcomeForTotal 默认五条线与原硬编码逐点一致', () => {
  for (const d of [5, 11, 20, 25]) for (let total = -60; total <= 100; total++) assert.equal(engine.outcomeForTotal(total, d), legacyOutcome(total, d), `${total} vs DC${d}`);
});

test('配置覆盖 outcome 线：success 线上移 2，原来刚好成功的总值变成代价成功', async () => {
  await restoring(() => {
    assert.equal(engine.outcomeForTotal(20, 20), 'success');
    mods.numbers.applyGameNumbers({ judgement: { outcomeLines: { success: 2 } } });
    assert.equal(engine.outcomeForTotal(20, 20), 'partial');
    assert.equal(engine.outcomeForTotal(22, 20), 'success');
  });
  assert.equal(engine.outcomeForTotal(20, 20), 'success');
});

test('outcome 线不是严格递减时体检拒绝并退回', async () => {
  await restoring(() => {
    assert.throws(() => mods.numbers.applyGameNumbers({ judgement: { outcomeLines: { perfect: 10 } } }), /数值体检未通过.*outcomeLines/);
    assert.equal(N().judgement.outcomeLines.perfect, 30);
    assert.deepEqual(judgementCfg.validateJudgementNumbers(), []);
  });
});

test('judgement 配置体检：各项坏值逐个报错', () => {
  const broken = patch => { const c = structuredClone(judgementCfg.judgementNumbers()); patch(c); return judgementCfg.validateJudgementNumbers(c).join('\n'); };
  assert.match(broken(c => { c.dice.rerollOnOneChance = 1.5; }), /rerollOnOneChance/);
  assert.match(broken(c => { c.dice.sides = 1; }), /dice\.sides/);
  assert.match(broken(c => { c.injury.hpRatioBelow = -1; }), /judgement\.injury/);
  assert.match(broken(c => { c.environment.divisor.craft = 0; }), /divisor\.craft/);
  assert.match(broken(c => { c.preflight.difficulty.byKind.combat.band = 'brutal'; }), /difficulty\.combat/);
  assert.match(broken(c => { c.preflight.difficulty.byKind.cultivate.value = 'no.such.key'; }), /difficulty\.cultivate/);
  assert.match(broken(c => { c.preflight.difficulty.byKind.dance = { band: 'easy', value: 1 }; }), /dance 不是判定类型/);
  assert.match(broken(c => { c.recentKeep = 0; }), /recentKeep/);
  assert.match(broken(c => { c.cultivationRecovery.perfect = -1; }), /cultivationRecovery\.perfect/);
  assert.match(broken(c => { c.injury.narrated.majorRatio = 1; }), /injury\.narrated/);
  assert.match(broken(c => { c.injury.zeroHealthRecoveryRatio = 0; }), /zeroHealthRecoveryRatio/);
});

const withRandom = (values, fn) => {
  const original = Math.random, queue = [...values];
  Math.random = () => queue.shift() ?? 0.99;
  try { return fn(); } finally { Math.random = original; }
};

test('rollD20：骰到 1 默认 50% 重投；概率走配置', async () => {
  assert.equal(withRandom([0, 0.4, 0.5], () => dice.rollD20()), 11); // 1 → 0.4<0.5 重投 → floor(.5*20)+1
  assert.equal(withRandom([0, 0.6], () => dice.rollD20()), 1);        // 0.6≥0.5 不重投
  assert.equal(withRandom([0.5], () => dice.rollD20()), 11);           // 非 1 不看重投
  await restoring(() => {
    mods.numbers.applyGameNumbers({ judgement: { dice: { rerollOnOneChance: 0 } } });
    assert.equal(withRandom([0, 0.0, 0.5], () => dice.rollD20()), 1);
    mods.numbers.applyGameNumbers({ judgement: { dice: { rerollOnOneChance: 1 } } });
    assert.equal(withRandom([0, 0.99, 0.5], () => dice.rollD20()), 11);
  });
});

test('重伤：默认气血 <25% 扣 15，阈值与扣值走配置', async () => {
  const save = (current, max = 100) => ({ 角色: { 身份: {}, 属性: { 气血: { 当前: current, 上限: max } } } });
  const injury = s => preflight.stateFactors('combat', s).filter(f => f.label === '重伤');
  assert.deepEqual(injury(save(24)).map(f => f.value), [-15]);
  assert.deepEqual(injury(save(25)), []);
  await restoring(() => {
    mods.numbers.applyGameNumbers({ judgement: { injury: { hpRatioBelow: 0.5, penalty: -9 } } });
    assert.deepEqual(injury(save(40)).map(f => f.value), [-9]);
  });
});

test('环境修正与幸运点：默认值不变，除数 / 基准 / 默认灵气浓度走配置', async () => {
  const at = density => rules.calculateTurnJudgementData({ 气运: 5 }, {}, { 灵气浓度: density }, () => 0).环境;
  assert.deepEqual(at(80), { 灵气浓度: 80, 修炼修正: 3, 炼制修正: 2, 战斗修正: 2 });
  assert.equal(rules.calculateTurnJudgementData({}, {}, {}, () => 0).环境.灵气浓度, 50);
  await restoring(() => {
    mods.numbers.applyGameNumbers({ judgement: { environment: { divisor: { cultivate: 5 }, defaultSpiritDensity: 70, neutralSpiritDensity: 60 } } });
    assert.equal(at(80).修炼修正, 4);
    assert.equal(rules.calculateTurnJudgementData({}, {}, {}, () => 0).环境.修炼修正, 2);
    mods.numbers.applyGameNumbers({ judgement: { luck: { randomOffset: -4 } } });
    assert.equal(rules.calculateTurnJudgementData({ 气运: 5 }, {}, {}, () => 0).幸运点, -4 + 0 + 3);
  });
});

test('预检难度：默认五种取值不变，cultivate 跟着 combat.baselineDc，配置可改', async () => {
  const save = makeSave();
  const difficulty = text => preflight.buildLocalJudgementPreflight(text, save, 1)?.difficulty;
  assert.deepEqual(difficulty('我要逃跑'), { band: 'hard', value: 20 });
  assert.deepEqual(difficulty('我要潜入'), { band: 'hard', value: 20 });
  assert.deepEqual(difficulty('我要攻击他'), { band: 'hard', value: 20 });
  assert.deepEqual(difficulty('我要炼丹'), { band: 'severe', value: 25 });
  assert.deepEqual(difficulty('我要闭关修炼'), { band: 'normal', value: N().combat.baselineDc });
  assert.deepEqual(difficulty('我要探索四周'), { band: 'normal', value: 15 });
  await restoring(() => {
    // physical 默认难度直接引用 combat.baselineDc，改一处即可。
    mods.numbers.applyGameNumbers({ combat: { baselineDc: 13 }, judgement: { preflight: { difficulty: { default: { value: 17 }, byKind: { escape: { value: 22 } } } } } });
    assert.deepEqual(difficulty('我要闭关修炼'), { band: 'normal', value: 13 });
    assert.deepEqual(difficulty('我要探索四周'), { band: 'normal', value: 17 });
    assert.deepEqual(difficulty('我要逃跑'), { band: 'hard', value: 22 });
  });
});

test('叙事补账伤势与气血归零保底：比例走配置，默认不变', async () => {
  const save = { 角色: { 属性: { 气血: { 当前: 0, 上限: 200 } }, 身份: { 名字: '无名' } } };
  const recovered = vital.recoverUnmarkedPlayerZeroHealth(structuredClone(save), '风过无痕');
  assert.equal(recovered.newValue, 2);
  await restoring(() => {
    mods.numbers.applyGameNumbers({ judgement: { injury: { zeroHealthRecoveryRatio: 0.1 } } });
    assert.equal(vital.recoverUnmarkedPlayerZeroHealth(structuredClone(save), '风过无痕').newValue, 20);
  });
  assert.equal(typeof narrated.detectNarratedPlayerDamage, 'function');
});

// ───────────── 主入口 tuning.json 热改 ─────────────

const reply = (body, init = {}) => async () => ({ ok: init.ok ?? true, status: init.status ?? 200, text: async () => body });

test('tuning：404 / 网络错 / 超时 / 非 JSON / HTML 回退页 / 校验不过 都静默回落，数值不变', async () => {
  const before = JSON.stringify(N());
  const cases = {
    '404': reply('', { ok: false, status: 404 }),
    '网络错': async () => { throw new TypeError('Failed to fetch'); },
    '超时': async () => { throw new DOMException('timeout', 'TimeoutError'); },
    '非JSON': reply('{numbers:'),
    'HTML回退页': reply('<!doctype html><title>XianTu</title>'),
    '校验不过（线不递减）': reply(JSON.stringify({ numbers: { judgement: { outcomeLines: { perfect: 1 } } } })),
    '未知数值键': reply(JSON.stringify({ numbers: { judgement: { nope: 1 } } })),
    '顶层不是对象': reply('[1,2]'),
    '未知合同 id': reply(JSON.stringify({ 'no.such.contract': { clock: { beats: 3 } } })),
  };
  await quiet(async () => {
    for (const [name, fetcher] of Object.entries(cases)) {
      const result = await tuning.loadRuntimeTuning(fetcher);
      assert.equal(result.applied, false, name);
      assert.ok(result.reason, name);
      assert.equal(JSON.stringify(N()), before, name);
    }
  });
});

test('tuning：合法的 numbers 段（含 judgement / freeAction）刷新后生效；空 numbers 无变化', async () => {
  await restoring(async () => {
    const seen = [];
    const result = await quiet(() => tuning.loadRuntimeTuning(async (url, init) => { seen.push([url, init.cache]); return reply(JSON.stringify({ numbers: { judgement: { outcomeLines: { success: 3 } }, freeAction: { classes: { field: { dangerTierShift: { guarded: 5 } } } } } }))(); }));
    assert.equal(result.applied, true);
    assert.deepEqual(seen, [[N().tuning.file, 'no-store']]);
    assert.equal(engine.outcomeForTotal(20, 20), 'partial');
    assert.equal(N().freeAction.classes.field.dangerTierShift.guarded, 5);
  });
  const before = JSON.stringify(N());
  assert.equal((await quiet(() => tuning.loadRuntimeTuning(reply('{"numbers":{}}')))).applied, true);
  assert.equal((await quiet(() => tuning.loadRuntimeTuning(reply('{}')))).applied, true);
  assert.equal(JSON.stringify(N()), before);
});

test('tuning：statuses / 合同段也走同一入口，写错整份拒绝', async () => {
  const before = JSON.stringify(N());
  const result = await quiet(() => tuning.loadRuntimeTuning(reply(JSON.stringify({ numbers: { judgement: { dice: { rerollOnOneChance: 0.1 } } }, statuses: { 'no.such.status': { action: -1 } } }))));
  assert.equal(result.applied, false);
  assert.equal(N().judgement.dice.rerollOnOneChance, 0.5); // numbers 段已合并过也会被退回
  assert.equal(JSON.stringify(N()), before);
});

test('入口接线：src/main.ts 先 await loadRuntimeTuning 再挂载；打包不会清掉 dist/tuning.json', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.ok(main.indexOf('await loadRuntimeTuning()') > 0 && main.indexOf('await loadRuntimeTuning()') < main.indexOf('app.mount'));
  assert.match(readFileSync(new URL('../webpack.config.js', import.meta.url), 'utf8'), /clean: \{ keep: [^}]*tuning\\\.json/);
});

test('physical 默认难度引用 combat.baselineDc：只改 baselineDc 即生效；写死不同的数仍被体检拒绝', async () => {
  assert.equal(mods.config.freeActionConfig().classes.physical.defaults.difficulty, 'combat.baselineDc');
  assert.equal(mods.config.variantSpecOf('physical', 'attack').difficulty, N().combat.baselineDc);
  await restoring(() => {
    const r = mods.numbers.applyGameNumbers({ combat: { baselineDc: 14 } });
    assert.ok(r === undefined || r.ok !== false, '只改 baselineDc 不应被拒');
    assert.equal(N().combat.baselineDc, 14);
    assert.equal(mods.config.variantSpecOf('physical', 'attack').difficulty, 14);
    assert.deepEqual(mods.config.validateFreeActionConfig(), []);
  });
});
