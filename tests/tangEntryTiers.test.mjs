// 唐 Q1 入场四档骨架（05-唐 §1；用户 2026-11-26 19:56、11-27 03:51 定；总策划 11-27 04:58 代定先搭骨架）：
// 汉使（identity han.tang_envoy，写在 han_succession_10_beat）→ 默认文案＋Canon Rail；
// 有舞阳侯、无汉使（done s02_09）→ 宋职（song.yuanwailang / song.baochao_zhushi）→ 两样都没有，这三档是变体位，正文仍是占位。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const view = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
const ledger = await loadTs('../src/modules/scenarioMods/identityLedger.ts');
const rules = await loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');
const compass = await loadTs('../src/modules/scenarioMods/lineCompass.ts');
const cond = await loadTs('../src/modules/scenarioMods/ledgerConditions.ts');
const packs = await loadTs('../src/modules/contentPacks/index.ts');

const CI = JSON.parse(fs.readFileSync('src/modules/scenarioMods/builtins/data/lyg.changgan_interlude.json', 'utf8'));
const lyg = id => `lyg.event.${id}`;
const ENVOY = 'liuchao.identity.han.tang_envoy';
const [YW, BC] = ['liuchao.identity.song.yuanwailang', 'liuchao.identity.song.baochao_zhushi'];
const EDICT = lyg('han_succession_10_beat');
const MIJING = ['lyg.mijing_rumen', lyg('s02_09')];
const active = id => ({ [id]: { identityId: id, status: 'active', acquiredAtEventId: 'e', history: [] } });
const rt = (done, playerIdentities = {}) => ({
  playerIdentities,
  chronicle: done.map(([stageId, id], i) => ({ id: `chronicle.${stageId}.${id}`, type: 'event', stageId, sequence: i + 1 })),
});
const PLACEHOLDER = /^【占位·待剧情策划】/;

test('汉使身份写在出使诏那一拍（han_succession_10_beat），记进身份账 playerIdentities', () => {
  assert.deepEqual(rules.playerLedgerRules().identityGrants, [{ eventId: EDICT, identityId: ENVOY }]);
  assert.deepEqual(rules.playerIdentityDefs().find(d => d.id === ENVOY), { id: ENVOY, name: '汉使', kind: 'office', lineId: 'han' });
  const before = rt([MIJING]);
  assert.equal(ledger.syncPlayerIdentities(before), 0);
  assert.deepEqual(before.playerIdentities, {}, '只完成武帝秘境：不是汉使');
  const after = rt([MIJING, ['lyg.han_succession', EDICT]]);
  assert.equal(ledger.syncPlayerIdentities(after), 1);
  assert.equal(after.playerIdentities[ENVOY].status, 'active');
  assert.equal(after.playerIdentities[ENVOY].acquiredAtEventId, EDICT);
  assert.equal(ledger.syncPlayerIdentities(after), 0, '幂等');
  // 旧档回填：读档修复走同一函数，带 backfilled
  const old = rt([MIJING, ['lyg.han_succession', EDICT]]);
  ledger.syncPlayerIdentities(old, { backfilled: true });
  assert.equal(old.playerIdentities[ENVOY].backfilled, true);
});

for (const id of ['honglusi_amends', 'yuanzheng_globe']) {
  test(`${id}：四档分档判定——汉使照默认文案，其余三档各取自己的变体位`, () => {
    const event = CI.scenario.events.find(e => e.id === lyg(id));
    assert.equal(event.narrativeVariants.length, 4);
    for (const v of event.narrativeVariants) {
      assert.deepEqual(v.when[0], { path: `identity.${ENVOY}`, operator: 'neq', value: true }, '每条变体都先排除汉使');
      assert.equal(v.replacesCanonRail, true, '非汉使档不再注入按汉使写的 Canon Rail');
      for (const k of ['description', 'axisBeat', 'objective']) assert.match(v[k], PLACEHOLDER, `${k} 仍是占位`);
    }
    const tier = runtime => {
      const out = view.resolveScenarioEventNarrative(event, {}, undefined, runtime);
      const replaced = view.narrativeVariantReplacesCanonRail(event, {}, undefined, runtime);
      if (out.description === event.description) { assert.equal(replaced, false); return 'envoy'; }
      assert.equal(replaced, true);
      return out.description.match(/^【占位·待剧情策划】(.+?)档/)[1];
    };
    const envoy = active(ENVOY);
    // 汉使：照原著（默认文案），有没有宋职都一样
    assert.equal(tier(rt([MIJING, ['lyg.han_succession', EDICT]], envoy)), 'envoy');
    assert.equal(tier(rt([MIJING], { ...envoy, ...active(YW) })), 'envoy', '同时有汉使与宋职＝原著状态');
    // 有舞阳侯、无汉使：优先于宋职档与「都没有」档
    assert.equal(tier(rt([MIJING])), '有舞阳侯、无汉使');
    assert.equal(tier(rt([MIJING], active(BC))), '有舞阳侯、无汉使');
    assert.equal(tier(rt([MIJING], { [ENVOY]: { ...envoy[ENVOY], status: 'revoked' } })), '有舞阳侯、无汉使', '汉使被撤销后不算持有');
    // 宋职：无汉使、没完成武帝秘境，员外郎或宝钞局主事任一
    assert.equal(tier(rt([], active(YW))), '宋职');
    assert.equal(tier(rt([], active(BC))), '宋职');
    // 两样都没有
    assert.equal(tier(rt([])), '两样都没有');
    assert.equal(tier(rt([['lyg.han_succession', EDICT]])), '两样都没有', '身份账没记汉使时不靠事件完成与否判汉使');
  });
}

test('线卡：两样都没有档出「元日去大明宫外看看」，其余三档沿用「去大明宫赴元正朝会」那一步', () => {
  const steps = compass.lineCompassTable().lines.find(l => l.lineId === 'tang').steps;
  const i = steps.findIndex(s => s.id === 'tang_envoys_reunion_outside');
  assert.equal(steps[i + 1].id, 'tang_envoys_reunion');
  assert.equal(steps[i].eventId, steps[i + 1].eventId);
  assert.equal(packs.CONTENT_PACKS.texts[steps[i].hintKey], '元日去大明宫外看看');
  const AMENDS = ['lyg.changgan_interlude', lyg('honglusi_amends')];
  const pick = runtime => steps.slice(i, i + 2).find(s => compass.lineCompassConditionsHold(s.when, c => cond.evaluateLedgerCondition(c, runtime) === true))?.id;
  assert.equal(pick(rt([AMENDS])), 'tang_envoys_reunion_outside');
  assert.equal(pick(rt([AMENDS], active(ENVOY))), 'tang_envoys_reunion');
  assert.equal(pick(rt([MIJING, AMENDS])), 'tang_envoys_reunion');
  assert.equal(pick(rt([AMENDS], active(YW))), 'tang_envoys_reunion');
  assert.equal(pick(rt([AMENDS], active(BC))), 'tang_envoys_reunion');
  assert.equal(pick(rt([])), undefined, '鸿胪寺一拍没完成：两步都还没轮到');
});

test('两拍的行动按钮是各档通用的说法：不写汉使、致歉、恢复，也不写人在殿上（总策划 2026-11-27 05:35 代定）', () => {
  for (const id of ['honglusi_amends', 'yuanzheng_globe']) {
    const { actions } = CI.scenario.events.find(e => e.id === lyg(id)).playerCompletionContract;
    for (const a of actions) {
      for (const text of [a.label, a.actionText, a.outcomeText.success]) {
        assert.doesNotMatch(text, /汉使|致歉|恢复|资格|在元正朝会/, `${id}:${a.id}「${text}」`);
      }
    }
  }
});
