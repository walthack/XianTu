// 2026-10-20 08:27 用户指示并入：A 搜刮仙/神品队友评价信号；B 谢艺救治失败叙事锁；C 谢艺三选项读档（只查）；E RNG 游标在存档外。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { load } from './freeActionFixture.mjs';

const loot = await load('../src/modules/scenarioMods/locationLoot.ts');
const J = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const LOC = 'test.location.vault';
const table = (grade, chance) => ({ rules: { maxSearches: 3, commonSlots: [1], rareChance: 0, largeCurrencyChance: 0, maxCopperPerSearch: 80, bossChance: 0, companionRemarkChance: chance },
  locations: { [LOC]: { name: '库房', status: 'ready', entries: [{ id: 'g', category: 'common', itemId: 'test.item.g', quantity: [1, 1] }] } } });
function save(grade, mates) {
  return { 元数据: { 创建时间: 'x' }, 角色: { 身份: { 名字: '程宗扬' }, 位置: { 描述: '库房' }, 背包: { 物品: {}, 货币: {} } },
    世界: { 状态: { 剧本模组: { modId: 't', worldTurn: 1, completedEventIds: [], activeEventIds: ['e1'],
      events: [{ id: 'e1', relatedCharacterIds: ['liuchao.character.cheng_zongyang', ...mates] }],
      canon: { locations: [{ id: LOC, name: '库房' }], characters: [{ id: 'liuchao.character.cheng_zongyang', name: '程宗扬', isProtagonist: true }],
        items: [{ id: 'test.item.g', name: '宝物', grade, type: 'material' }] } } } } };
}

test('A 配置：队友评价触发概率是数值配置里的一个值', () => {
  const r = J('../mod-kit/location-loot.qingyu.json').rules;
  assert.equal(typeof r.companionRemarkChance, 'number'); assert.ok(r.companionRemarkChance >= 0 && r.companionRemarkChance <= 1);
});
test('A 仙品/神品 + 有在场队友 → 给信号（品级 + 队友 id），不写台词', () => {
  for (const grade of ['仙品', '神品']) {
    const s = save(grade, ['liuchao.character.xiao_zi']);
    const r = loot.settleLocationLoot(s, table(grade, 1));
    assert.equal(r.status, "settled"); assert.equal(r.receipt.drops.length, 1);
    assert.deepEqual(r.receipt.companionRemark, { itemId: 'test.item.g', grade, companionIds: ['liuchao.character.xiao_zi'] });
    assert.deepEqual(r.receipt.drops[0].队友评价, { 品级: grade, 在场队友: ['liuchao.character.xiao_zi'] });
    assert.doesNotMatch(r.text, /评价|说/);
  }
});
test('A 不触发：无队友 / 凡品 / 珍品 / 概率 0', () => {
  const cases = [['仙品', [], 1], ['凡品', ['liuchao.character.xiao_zi'], 1], ['珍品', ['liuchao.character.xiao_zi'], 1], ['仙品', ['liuchao.character.xiao_zi'], 0]];
  for (const [g, m, c] of cases) { const r = loot.settleLocationLoot(save(g, m), table(g, c)); assert.equal(r.receipt?.companionRemark, undefined, `${g}/${m.length}/${c}`); }
});

test('B 谢艺救治部分成功/失败：正文锁成合同该档 outcomeText（不再写成救活）；AIBS 只此一处改动并更新冻结基线', () => {
  const src = readFileSync(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url), 'utf8');
  assert.match(src, /eventProgress\.eventId === 'lcq\.event\.xieyi_entrustment' && eventProgress\.actionId === 'rescue_xieyi'/);
  assert.match(src, /eventProgress\.outcome === 'partial' \|\| eventProgress\.outcome === 'failure'/);
  const stage = JSON.stringify(J('../src/modules/scenarioMods/builtins/data/lcq.stage_05b.json'));
  assert.match(stage, /抢救失败，谢艺伤重辞世。/); assert.match(stage, /谢艺仍伤重辞世/);
  const base = J('./frozen-baseline.json');
  assert.equal(base.files['src/utils/AIBidirectionalSystem.ts'], createHash('sha256').update(src).digest('hex'));
});

test('C CP-1aae-07：三选项不是读档丢的——存档里那拍已选（support_xieyi_counterstrike，第 29 回合），读回如实', () => {
  const p = '/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/playtest-2026-09-28/checkpoints-1aae9ec5c97a/CP-1aae-07-F14后-谢艺抉择前.json';
  let raw; try { raw = JSON.parse(readFileSync(p, 'utf8')); } catch { return; }
  const m = raw.payload.saves[0].存档数据.世界.状态.剧本模组;
  const st = m.eventActionStates['lcq.event.s05b_09_temporary_pact_with_xiaozi'];
  assert.deepEqual(st.attempts.map(a => [a.actionId, a.attemptedAtTurn]), [['advance_declared_objective', 28], ['support_xieyi_counterstrike', 29]]);
  assert.equal(m.lastSettledBeat.settledAtTurn, 30);
  assert.ok(m.completedEventIds.includes('lcq.event.s05b_09_temporary_pact_with_xiaozi'));
});

test('E RNG 游标在存档外：同一存档读两次，进行中场面的种子不同；存档本身不带游标', async () => {
  const salt = await load('../src/modules/sceneModule/host/rngSalt.ts');
  const ext = await load('../src/modules/sceneModule/host/ext.ts');
  const mem = new Map(); const ls = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const mk = () => { const s = { 系统: {} }; const e = ext.readExt(s); e.active = { contractId: 'x', state: { seed: 12345, cursors: {} } }; ext.writeExt(s, e); return s; };
  const a = mk(), b = mk();
  assert.equal(salt.reseedActiveSceneAfterLoad(a, ls), true); assert.equal(salt.reseedActiveSceneAfterLoad(b, ls), true);
  const sa = ext.readExt(a).active.state.seed, sb = ext.readExt(b).active.state.seed;
  assert.notEqual(sa, 12345); assert.notEqual(sa, sb, '两次读档骰序不同');
  assert.ok(mem.has(salt.RNG_SALT_STORAGE_KEY)); assert.doesNotMatch(JSON.stringify(a), /sceneRngSalt/);
  assert.equal(salt.reseedActiveSceneAfterLoad({ 系统: {} }, ls), false, '没有进行中场面不改');
  const store = readFileSync(new URL('../src/stores/characterStore.ts', import.meta.url), 'utf8');
  assert.equal((store.match(/reseedActiveSceneAfterLoad\(/g) || []).length, 2, '读档与回滚两处都换种子');
});
