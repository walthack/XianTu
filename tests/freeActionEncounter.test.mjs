// 10-16 第7条：在场的原著(正典)人物没有关系记录时，自由行动在 prepare/settle 写入阶段懒登记（初识：好感0、「相识」、记忆空）。
// 名单与校验只读；闸门不过、判定只是签发、重放都不留记录；已有记录的人不被改。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DUAN_QIANG, NING_YU, XIE_YI, advanceTurn, itemEntry, load, makeSave, mods, profileOf, runJudged, runtimeOf, ticket } from './freeActionFixture.mjs';

const GIFT = 'test.item.gift';
const CHENG = 'liuchao.character.cheng_zongyang'; // 夹具的正典里有、没关系记录、也不在场
const stage03 = JSON.parse(readFileSync(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_03.json', import.meta.url), 'utf8'));
const xieCard = stage03.canon.characters.find(c => c.id === XIE_YI);

/** 清羽记开局存档，再把谢艺（取自 stage_03 的正典条目）放进正典并让他在场；他没有关系记录。 */
function saveWithXie({ favorGift = true } = {}) {
  const save = makeSave({ items: favorGift ? { [GIFT]: itemEntry(GIFT, { 数量: 3 }) } : {} });
  const runtime = runtimeOf(save);
  runtime.canon.characters.push(structuredClone(xieCard));
  runtime.events.find(e => e.id === 'lcq.event.s01_02').relatedCharacterIds.push(XIE_YI);
  return save;
}
const recordsOf = (save, id) => Object.values(save.社交.关系).filter(p => p && p.角色ID === id);
const hasRecord = (save, id) => recordsOf(save, id).length > 0;
const rosterIds = save => mods.ticket.freeActionRosterOf(save).map(e => e.id);
const gift = (id = XIE_YI) => ticket('give', 'gift', id, { itemId: GIFT });

test('夹具前提：谢艺在场、在正典、无关系记录', () => {
  const save = saveWithXie();
  assert.equal(hasRecord(save, XIE_YI), false);
  assert.ok(mods.ticket.canonCharacterOf(save, XIE_YI));
  assert.ok(mods.packet.readLocalMemoryCapsule(save, undefined, []).presentActors.some(a => a.characterId === XIE_YI));
});

test('名单放宽为“有正典记录”，且只读：谢艺进名单，校验收票，都不写关系记录', () => {
  const save = saveWithXie();
  const before = JSON.stringify(save.社交.关系);
  assert.ok(rosterIds(save).includes(XIE_YI));
  const raw = [{ actionClass: 'give', variant: 'gift', targetId: XIE_YI, degree: 'normal', performed: 'yes', evidence: '递给谢艺', itemId: GIFT }];
  const out = mods.ticket.validateFreeActionTickets(raw, '我把东西递给谢艺', save);
  assert.equal(out.tickets.length, 1);
  assert.deepEqual(out.refusals, []);
  assert.equal(JSON.stringify(save.社交.关系), before);
  assert.equal(hasRecord(save, XIE_YI), false);
});

test('不是正典（或不在场）的人：不进名单、校验给 target_unavailable，prepare 拒绝且不登记', () => {
  const save = saveWithXie();
  const FAKE = 'liuchao.character.not_in_canon';
  assert.equal(mods.ticket.canonCharacterOf(save, FAKE), undefined);
  assert.equal(rosterIds(save).includes(FAKE), false);
  assert.equal(rosterIds(save).includes(CHENG), false, '正典里有但不在场');
  const out = mods.ticket.validateFreeActionTickets([{ actionClass: 'give', variant: 'gift', targetId: FAKE, degree: 'normal', performed: 'yes', evidence: '递给他', itemId: GIFT }], '我把东西递给他', save);
  assert.equal(out.tickets.length, 0);
  assert.equal(out.refusals.length, 1);
  const before = JSON.stringify(save.社交.关系);
  for (const id of [FAKE, CHENG]) {
    const prepared = mods.plan.prepareFreeAction(save, gift(id));
    assert.deepEqual([prepared.kind, prepared.reason], ['refused', 'not_present'], id);
    assert.equal(hasRecord(save, id), false, id);
  }
  assert.equal(JSON.stringify(save.社交.关系), before);
});

test('不掷骰的票：prepare 结算成功 → 谢艺被登记：「相识」、好感从 0 起算、名字与 id 对、只有结算写下的那一条记忆', () => {
  const save = saveWithXie();
  const prepared = mods.plan.prepareFreeAction(save, gift());
  assert.equal(prepared.kind, 'settled');
  assert.equal(prepared.result.ok, true);
  assert.equal(prepared.result.affinity.from, 0);
  const records = recordsOf(save, XIE_YI);
  assert.equal(records.length, 1);
  assert.equal(records[0].名字, '谢艺');
  assert.equal(records[0].与玩家关系, '相识');
  assert.equal(records[0].好感度, prepared.result.affinity.to);
  assert.equal(records[0].记忆.length, 1, '登记时记忆为空，只有这次结算追加的轻记忆');
  assert.equal(save.角色.背包.物品[GIFT].数量, 2);
  assert.equal(profileOf(save, XIE_YI).背包.物品[GIFT].数量, 1);
});

test('判定类票：签发时不留记录；玩家确认后结算才登记', () => {
  const save = saveWithXie();
  const prepared = mods.plan.prepareFreeAction(save, ticket('physical', 'attack', XIE_YI));
  assert.equal(prepared.kind, 'issued');
  assert.equal(hasRecord(save, XIE_YI), false, '只是签发待确认判定，什么都还没发生');
  const resolution = mods.judgement.resolvePendingJudgement(save, prepared.proposal.id, { currentTurn: 1, testOutcome: 'success' });
  const result = mods.settle.settleFromResolution(save, resolution);
  assert.equal(result.ok, true);
  assert.equal(recordsOf(save, XIE_YI).length, 1);
  assert.equal(profileOf(save, XIE_YI).与玩家关系, '相识');
  assert.equal(profileOf(save, XIE_YI).名字, '谢艺');
});

test('被拒的票不登记：传功（谢艺境界未知 → level_unknown）、没有手段物品（no_item）、已有待确认判定（blocked）', () => {
  const save = saveWithXie({ favorGift: false });
  const before = JSON.stringify(save.社交.关系);
  const qi = mods.plan.prepareFreeAction(save, ticket('cast', 'transfer_qi', XIE_YI));
  assert.deepEqual([qi.kind, qi.reason], ['refused', 'level_unknown']);
  const noItem = mods.plan.prepareFreeAction(save, gift());
  assert.deepEqual([noItem.kind, noItem.reason], ['refused', 'no_item']);
  assert.equal(JSON.stringify(save.社交.关系), before);
  assert.equal(hasRecord(save, XIE_YI), false);
  // 直接走结算入口也一样
  const direct = mods.settle.settleFreeAction(save, gift());
  assert.deepEqual([direct.ok, direct.reason], [false, 'no_item']);
  assert.equal(hasRecord(save, XIE_YI), false);

  // 已有待确认判定时，第二张判定票 blocked，同样不留记录
  const other = saveWithXie();
  assert.equal(mods.plan.prepareFreeAction(other, ticket('physical', 'attack', DUAN_QIANG)).kind, 'issued');
  assert.equal(mods.plan.prepareFreeAction(other, ticket('physical', 'attack', XIE_YI)).kind, 'blocked');
  assert.equal(hasRecord(other, XIE_YI), false);
});

test('重复不重复登记：再结算（同回合重放 / 下一回合）只剩一条记录，不被重置', () => {
  const save = saveWithXie();
  assert.equal(mods.plan.prepareFreeAction(save, gift()).kind, 'settled');
  const record = recordsOf(save, XIE_YI)[0];
  const favorAfterFirst = record.好感度;
  const replay = mods.settle.settleFreeAction(save, gift());
  assert.equal(replay.replay, true);
  assert.equal(recordsOf(save, XIE_YI).length, 1);
  assert.equal(recordsOf(save, XIE_YI)[0], record, '同一个对象，没有重建');
  assert.equal(record.好感度, favorAfterFirst);

  advanceTurn(save);
  const second = mods.plan.prepareFreeAction(save, gift());
  assert.equal(second.kind, 'settled');
  assert.equal(recordsOf(save, XIE_YI).length, 1);
  assert.equal(recordsOf(save, XIE_YI)[0], record, '下一回合沿用原记录');
  assert.equal(record.记忆.length, 2, '记忆在原记录上继续追加');
  assert.equal(second.result.affinity.from, favorAfterFirst);
});

test('已有关系记录的人不被登记函数碰：凝羽的好感、关系、记忆原样（只有结算本身的改动）', () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 30 }, items: { [GIFT]: itemEntry(GIFT, { 数量: 2 }) } });
  const profile = profileOf(save, NING_YU), relation = profile.与玩家关系, memory = [...profile.记忆];
  const prepared = mods.plan.prepareFreeAction(save, gift(NING_YU));
  assert.equal(prepared.kind, 'settled');
  assert.equal(profileOf(save, NING_YU), profile);
  assert.equal(profile.与玩家关系, relation);
  assert.deepEqual(profile.记忆.slice(0, memory.length), memory);
  assert.equal(recordsOf(save, NING_YU).length, 1);
});

test('玩家本人不会被登记', () => {
  const save = saveWithXie();
  const playerId = runtimeOf(save).opening.playerCharacterId;
  const prepared = mods.plan.prepareFreeAction(save, gift(playerId));
  assert.equal(prepared.kind, 'refused');
  assert.equal(hasRecord(save, playerId), false);
});

test('闸门目标双保险：关系表或总表在场原著角色任一命中即过；两者都不中仍是 not_present（闸门只读，不登记）', async () => {
  const { checkGates } = await load('../src/modules/scenarioMods/freeAction/gates.ts');
  const save = saveWithXie();
  const before = JSON.stringify(save.社交.关系);
  assert.equal(hasRecord(save, XIE_YI), false);
  const canonOnly = checkGates(save, gift());
  assert.equal(canonOnly.ok, true, '无关系记录、仅总表在场原著角色：直接过闸');
  assert.equal(JSON.stringify(save.社交.关系), before);
  const relationOnly = checkGates(makeSave({ items: { [GIFT]: itemEntry(GIFT, { 数量: 3 }) }, present: [DUAN_QIANG] }), gift(DUAN_QIANG));
  assert.equal(relationOnly.ok, true, '有关系记录：照常过闸');
  const none = checkGates(save, gift('liuchao.character.not_in_canon'));
  assert.deepEqual([none.ok, none.reason], [false, 'not_present']);
});
