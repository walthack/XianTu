// 南荒随机遇敌／白尾豹几率覆盖（用户 2026-11-01 确认）：JSON 驱动、参数覆盖、URL/会话覆盖、夹 0..1、不传时原样。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const json = p => JSON.parse(read(p));
const E = await loadTs('../src/modules/scenarioMods/randomEncounter.ts');
const W = await loadTs('../src/modules/scenarioMods/whiteTailLeopard.ts');
const { GAME_NUMBERS: N } = await loadTs('../src/modules/sceneModule/numbers.ts');
const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const repair = await loadTs('../src/utils/dataRepair.ts');
const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const rt = s => s.世界.状态.剧本模组;
const names = N.e2eSmoke.nanhuangEncounters.overrideParams;

function withEnv({ search = '', hash = '', session = {} }, fn) {
  const prevLoc = globalThis.location, prevSs = globalThis.sessionStorage;
  const store = { ...session };
  globalThis.location = { search, hash };
  globalThis.sessionStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  try { return fn(store); } finally { globalThis.location = prevLoc; globalThis.sessionStorage = prevSs; }
}
function vineSave() {
  const s = R.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(repair.createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(json('src/modules/scenarioMods/builtins/data/lcq.stage_05b.json')))).saveData;
  s.角色.位置 = { locationId: 'lcq.location.giant_vine', 描述: '南荒·万古巨藤' };
  return s;
}
/** 走过预兆 → 演出 → 首次几率检，返回第一张掷骰回执。 */
function firstRoll(override) {
  const s = vineSave();
  for (let i = 0; i < 12 && !(rt(s).encounter?.receipts?.length); i++) { rt(s).worldTurn++; E.tickRandomEncounter(s, { narrated: true, override }); }
  return rt(s).encounter.receipts[0];
}

test('配置：几率仍在 JSON；overrideParams 三个 URL 参数名登记且两份数值文件一致、带 note', () => {
  const tiers = N.encounter.tiers;
  assert.deepEqual([...new Set(Object.values(tiers).map(t => t.chance))].sort(), [0, 0.08, 0.22, 0.35]);
  for (const f of ['mod-kit/game-numbers.qingyu.json', 'mod-kit/numbers-runtime.json']) {
    const o = json(f).e2eSmoke.nanhuangEncounters.overrideParams;
    assert.deepEqual({ chance: o.chance, chanceMul: o.chanceMul, leopardChance: o.leopardChance }, { chance: 'xiantu.test.encounterChance', chanceMul: 'xiantu.test.encounterChanceMul', leopardChance: 'xiantu.test.leopardChance' });
    assert.match(o.note, /夹在 0\.\.1/);
  }
  const reg = read('src/modules/sceneModule/numbersRegistry.ts');
  for (const k of ['chance', 'chanceMul', 'leopardChance']) assert.ok(reg.includes(`e2eSmoke.nanhuangEncounters.overrideParams.${k}`));
  // 代码里不写死遇敌/豹几率数值。
  for (const f of ['src/modules/scenarioMods/randomEncounter.ts', 'src/modules/scenarioMods/whiteTailLeopard.ts']) assert.doesNotMatch(read(f), /\b0\.(08|22|35)\b/);
});

test('applyChanceOverride：不传原样；定值替换；倍率相乘；先定值再乘；夹 0..1；非数忽略', () => {
  assert.equal(E.applyChanceOverride(0.22), 0.22);
  assert.equal(E.applyChanceOverride(0.22, undefined, undefined), 0.22);
  assert.equal(E.applyChanceOverride(0.22, 0.5), 0.5);
  assert.equal(E.applyChanceOverride(0.2, undefined, 2), 0.4);
  assert.equal(E.applyChanceOverride(0.2, 0.3, 2), 0.6);
  assert.equal(E.applyChanceOverride(0.35, undefined, 10), 1);
  assert.equal(E.applyChanceOverride(0.35, -1), 0);
  assert.equal(E.applyChanceOverride(0.35, NaN, NaN), 0.35);
});

test('tickRandomEncounter：不传覆盖与原几率一致；chance 定值、chanceMul 倍率写进回执；chance=0 不遇敌', () => {
  withEnv({}, () => {
    const base = firstRoll();
    assert.ok(base, '能走到几率检');
    const tier = N.encounter.tiers[base.tier], diff = N.encounter.difficulty[base.preset];
    assert.equal(base.chance, Math.min(1, tier.chance * diff.chanceMul), '不传覆盖＝原配置值');
    assert.equal(firstRoll({ chance: 1 }).chance, 1);
    assert.equal(firstRoll({ chance: 1 }).hit || firstRoll({ chance: 1 }).reason === 'empty_pool', true);
    const zero = firstRoll({ chance: 0 });
    assert.equal(zero.chance, 0); assert.equal(zero.hit, false);
    assert.equal(firstRoll({ chanceMul: 2 }).chance, Math.min(1, base.chance * 2));
    assert.equal(firstRoll({ chanceMul: 100 }).chance, 1);
  });
});

test('URL（? 或 #）覆盖：读 overrideParams 参数名，写入会话；off 清除；参数优先于 URL；非南荒/无参数时 undefined', () => {
  withEnv({ search: `?${names.chance}=0.5&${names.leopardChance}=0` }, store => {
    assert.deepEqual(E.nanhuangChanceOverride(), { chance: 0.5, leopardChance: 0 });
    assert.equal(store[names.chance], '0.5');
    assert.equal(firstRoll().chance, 0.5, 'URL 覆盖进南荒几率检');
    assert.equal(firstRoll({ chance: 0.1 }).chance, 0.1, '函数参数优先');
  });
  withEnv({ hash: `#/game?${names.chanceMul}=3` }, () => assert.deepEqual(E.nanhuangChanceOverride(), { chanceMul: 3 }));
  withEnv({ session: { [names.chance]: '0.7' } }, () => assert.deepEqual(E.nanhuangChanceOverride(), { chance: 0.7 }, '刷新后从会话取'));
  withEnv({ search: `?${names.chance}=off`, session: { [names.chance]: '0.7' } }, store => {
    assert.equal(E.nanhuangChanceOverride(), undefined); assert.equal(store[names.chance], undefined);
  });
  withEnv({ search: `?${names.chance}=abc` }, () => assert.equal(E.nanhuangChanceOverride(), undefined));
  withEnv({}, () => assert.equal(E.nanhuangChanceOverride(), undefined));
});

test('白尾豹：leopardChance 定值替换豹几率，chanceMul 不作用于豹；不传与原来一致', () => {
  const src = read('src/modules/scenarioMods/whiteTailLeopard.ts');
  assert.match(src, /applyChanceOverride\(nanhuangTestRates\(\)\?\.leopardChance \?\? cfg\.chance, ov\?\.leopardChance\)/);
  assert.equal(typeof W.tickWhiteTailLeopard, 'function');
  assert.equal(W.tickWhiteTailLeopard.length >= 1, true);
});
