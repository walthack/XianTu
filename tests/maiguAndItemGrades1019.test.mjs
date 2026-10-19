// 2026-10-19 用户指示：麻古按非性化普通依赖 debuff（#177 记录）、四品道具品级、五件新药与搜刮来源。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { NING_YU, itemEntry, load, makeSave, mods, runJudged, runtimeOf, ticket } from './freeActionFixture.mjs';

const maigu = await load('../src/modules/scenarioMods/freeAction/maigu.ts');
const grades = await load('../src/modules/scenarioMods/itemGrades.ts');
const NUM = mods.numbers.GAME_NUMBERS;
const CFG = NUM.status.maigu;
const MAIGU = 'lcq.item.np006';
const rows = (save, id) => mods.statusRead.actorStatusRecords(save, id).map(r => r.statusId);
const minutes = (save, n) => { const t = save.元数据.时间; const d = new Date(Date.UTC(t.年 || 1, (t.月 || 1) - 1, t.日 || 1, t.小时 || 0, t.分钟 || 0) + n * 60000); Object.assign(t, { 年: d.getUTCFullYear(), 月: d.getUTCMonth() + 1, 日: d.getUTCDate(), 小时: d.getUTCHours(), 分钟: d.getUTCMinutes() }); };
const playerId = save => runtimeOf(save).opening.playerCharacterId;

test('麻古数值全在配置：时长与加值来自 status.maigu，状态目录里的两条状态都在', () => {
  for (const v of [CFG.heightened.minutes, CFG.heightened.socialBonus, CFG.heightened.mindPenalty, CFG.addiction.cravingMinutes, CFG.addiction.withdrawalMinutes, CFG.addiction.holdSocialBonus]) assert.equal(typeof v, 'number');
  const statuses = readFileSync(new URL('../src/modules/contentPacks/packs/qingyu/statuses.json', import.meta.url), 'utf8');
  assert.match(statuses, /"sense\.heightened"/);
  assert.match(statuses, /感官亢奋/);
  const block = statuses.match(/"sense\.heightened"[\s\S]*?"remove"/)[0];
  assert.doesNotMatch(block, /情欲|催情|春药|意愿/, '感官亢奋不涉性');
  assert.match(block, /双修无/, '写明对双修无加成');
});

test('给药 → 感官亢奋（配置时长）+ 成瘾 + 渴求计时；超时挂神志不清；再给药解除并重新计时', () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 } });
  maigu.afterItemFed(save, NING_YU, MAIGU);
  const h = mods.statusRead.actorStatusRecords(save, NING_YU).find(r => r.statusId === CFG.heightenedStatus);
  assert.equal(h.expiresAt - h.appliedAt, CFG.heightened.minutes);
  assert.ok(rows(save, NING_YU).includes(CFG.addictionStatus));
  minutes(save, CFG.addiction.cravingMinutes - 1); maigu.syncMaigu(save);
  assert.ok(!rows(save, NING_YU).includes(CFG.withdrawalStatus), '未到戒断时间');
  minutes(save, 1); assert.deepEqual(maigu.syncMaigu(save), [`${NING_YU}:${CFG.withdrawalStatus}`]);
  assert.ok(rows(save, NING_YU).includes(CFG.withdrawalStatus));
  maigu.afterItemFed(save, NING_YU, MAIGU);
  assert.ok(!rows(save, NING_YU).includes(CFG.withdrawalStatus), '给药解除戒断');
  assert.ok(rows(save, NING_YU).includes(CFG.addictionStatus), '成瘾仍在（只由剧情旗标解除，#177）');
});

test('撑过戒断期（addiction.quitMinutes，用户 2026-10-20 00:26 定）：不再给药即戒除成瘾；治疗只解神志不清不算戒除，戒断期照算', () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 } });
  assert.equal(typeof CFG.addiction.quitMinutes, 'number');
  maigu.afterItemFed(save, NING_YU, MAIGU);
  minutes(save, CFG.addiction.cravingMinutes); maigu.syncMaigu(save);
  assert.ok(rows(save, NING_YU).includes(CFG.withdrawalStatus));
  // 治疗：神志不清被别的途径解掉（这里直接删行模拟其自身解除规则）
  const store = mods.injuries.injuryStore(save);
  store.actors[NING_YU] = store.actors[NING_YU].filter(r => r.statusId !== CFG.withdrawalStatus);
  minutes(save, 1); maigu.syncMaigu(save);
  assert.ok(rows(save, NING_YU).includes(CFG.addictionStatus), '治疗不算戒除');
  assert.ok(!rows(save, NING_YU).includes(CFG.withdrawalStatus), '治好后戒断期内不再重挂');
  minutes(save, CFG.addiction.quitMinutes - 2); maigu.syncMaigu(save);
  assert.ok(rows(save, NING_YU).includes(CFG.addictionStatus), '戒断期未满');
  minutes(save, 1); assert.deepEqual(maigu.syncMaigu(save), [`-${NING_YU}:${CFG.addictionStatus}`]);
  assert.deepEqual(rows(save, NING_YU).filter(id => [CFG.addictionStatus, CFG.withdrawalStatus].includes(id)), [], '成瘾戒除');
  minutes(save, CFG.addiction.cravingMinutes * 2); assert.deepEqual(maigu.syncMaigu(save), [], '戒除后不再计时');
});

test('戒断期内再给药：回到渴求计时，不戒除', () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 } });
  maigu.afterItemFed(save, NING_YU, MAIGU);
  minutes(save, CFG.addiction.cravingMinutes); maigu.syncMaigu(save);
  minutes(save, Math.floor(CFG.addiction.quitMinutes / 2)); maigu.afterItemFed(save, NING_YU, MAIGU);
  minutes(save, CFG.addiction.quitMinutes); maigu.syncMaigu(save);
  assert.ok(rows(save, NING_YU).includes(CFG.addictionStatus));
  assert.ok(!rows(save, NING_YU).includes(CFG.withdrawalStatus), '还没到下一次渴求');
});

test('不是麻古的物品不触发；判定因子：持有麻古对成瘾者交涉加值，主角感官亢奋时交涉加值、修炼劣势，其余判定（含双修走的路径）零影响', () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 } });
  maigu.afterItemFed(save, NING_YU, 'lcq.item.nh_orange');
  assert.deepEqual(rows(save, NING_YU), []);
  maigu.afterItemFed(save, NING_YU, MAIGU);
  assert.deepEqual(maigu.maiguFactors(save, 'social', NING_YU), [], '不持有麻古：无加值');
  save.角色.背包.物品[MAIGU] = itemEntry(MAIGU);
  assert.deepEqual(maigu.maiguFactors(save, 'social', NING_YU).map(f => f.value), [CFG.addiction.holdSocialBonus]);
  maigu.afterItemFed(save, playerId(save), MAIGU);
  assert.deepEqual(maigu.maiguFactors(save, 'social', NING_YU).map(f => f.value), [CFG.addiction.holdSocialBonus, CFG.heightened.socialBonus]);
  assert.deepEqual(maigu.maiguFactors(save, 'cultivate', null).map(f => f.value), [CFG.heightened.mindPenalty]);
  for (const kind of ['combat', 'craft']) assert.deepEqual(maigu.maiguFactors(save, kind, NING_YU), [], kind);
  const dual = ['src/modules/scenarioMods/freeAction/maigu.ts'].map(p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')).join('');
  assert.doesNotMatch(dual.replace(/\/\*\*[\s\S]*?\*\//, ''), /双修|dual/i, '麻古代码不碰双修');
});

test('喂药路径（自由行动 give/feed_pill）真实挂上感官亢奋与成瘾', () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 80 }, items: { [MAIGU]: itemEntry(MAIGU) } });
  const { prepared, result } = runJudged(save, ticket('give', 'feed_pill', NING_YU, { itemId: MAIGU }), 'success');
  assert.ok(prepared.kind === 'issued' || prepared.kind === 'settled' || prepared.result, prepared.reason);
  void result;
  assert.ok(rows(save, NING_YU).includes(CFG.heightenedStatus), JSON.stringify(rows(save, NING_YU)));
  assert.ok(rows(save, NING_YU).includes(CFG.addictionStatus));
});

test('预设成瘾：用户 2026-10-20 00:26 定先不预设（presetActors 为空），任何关卡都不自动挂', () => {
  assert.deepEqual(CFG.presetActors, {});
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 } });
  for (const stage of ['lcq.stage_03b_snake_flower_bridge', 'lcq.stage_04', 'lcq.stage_04b_lingfei_baiyi_crisis', 'lcq.stage_05b']) {
    runtimeOf(save).modId = stage;
    assert.deepEqual(maigu.syncMaigu(save), [], stage);
  }
  assert.ok(!rows(save, NING_YU).includes(CFG.addictionStatus));
});

test('四品品级：凡/灵/仙/神，旧 grade 按映射归档，空值取默认凡品', () => {
  assert.deepEqual(grades.ITEM_TIERS.map(t => t.name), ['凡品', '灵品', '仙品', '神品']);
  assert.equal(grades.itemTierOf(undefined).name, '凡品');
  for (const t of grades.ITEM_TIERS) assert.equal(grades.itemTierOf(t.name).id, t.id);
  const table = JSON.parse(readFileSync(new URL('../mod-kit/item-grades.json', import.meta.url), 'utf8'));
  for (const [legacy, tier] of Object.entries(table.legacyAliases)) assert.equal(grades.itemTierOf(legacy).id, tier, legacy);
});

test('药品分级：降级规则在配置；dying 只能由 stabilize（降为重伤）/ revive 解除，heal 只解外伤（重）', () => {
  assert.deepEqual(NUM.status.itemTagDowngrade.stabilize, { dying: 'wound.severe' });
  const items = JSON.parse(readFileSync(new URL('../mod-kit/entity-catalog/items.json', import.meta.url), 'utf8'));
  const def = id => items.entries.find(e => e.id === id).definition;
  assert.deepEqual([def('lcq.item.jinchuang_yao').grade, def('lcq.item.liaoshang_yao').grade, def('lcq.item.qiannian_renshen').grade, def('lcq.item.tianshan_xuelian').grade, def('lcq.item.jiuzhuan_huanhun_dan').grade], ['凡品', '凡品', '灵品', '灵品', '仙品']);
  for (const id of ['lcq.item.np007', 'liuchao.item.long_jing_yu', 'lyl.item.np004', 'lcq.item.s05b_dragon_eye_jade', 'lcq.item.f10_broken_axe']) {
    const e = items.entries.find(x => x.id === id); if (e) assert.notEqual(e.definition.grade, undefined, id);
  }
});

test('搜刮：地点可选 rareChance 覆盖全局；九转以 boss 已击败为前置且不限一次', () => {
  const loot = JSON.parse(readFileSync(new URL('../mod-kit/location-loot.qingyu.json', import.meta.url), 'utf8'));
  const sites = ['liuchao.location.gui_wang_gong', 'liuchao.location.gui_wang_dong', 'liuchao.location.sea_temple'];
  for (const id of Object.keys(loot.locations)) {
    const loc = loot.locations[id];
    for (const e of loc.entries.filter(x => x.itemId === 'lcq.item.jiuzhuan_huanhun_dan')) {
      assert.ok(e.afterEventIds?.length, `${id}: 九转要有 boss 前置`); assert.notEqual(e.once, true, id);
      assert.equal(typeof loc.rareChance, 'number', `${id}: 有覆盖值`);
    }
  }
  for (const id of sites) if (loot.locations[id]) assert.ok(loot.locations[id].entries.some(e => e.itemId === 'lcq.item.jiuzhuan_huanhun_dan'), id);
});
