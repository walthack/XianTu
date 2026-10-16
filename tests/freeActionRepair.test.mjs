// 10-16 真机问题修复：含修炼词的句子在试玩范围里交给模型出票；目标/物品无效的票给“未发生”事实；
// 需要物品的变体没物品也出票；状态写入被拒也有事实行；物品功能来自物品标签，代码不认具体物品。
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DUAN_QIANG, NING_YU, WANG_ZHE, itemEntry, makeSave, mods, profileOf, runJudged, ticket } from './freeActionFixture.mjs';

const router = mods.router, N = mods.numbers;
const validate = (raw, text, save) => mods.ticket.validateFreeActionTickets(raw, text, save);
const raw = (actionClass, variant, targetId, evidence, extra = {}) => ({ actionClass, variant, targetId, degree: 'normal', performed: 'yes', evidence, itemId: null, ...extra });
const stub = reply => { const calls = []; return { calls, generate: async input => { calls.push(input); return reply; } }; };
const reply = tickets => JSON.stringify({ actionId: 'none', certainty: 'high', evidence: '', statusProposals: [], tickets });
const run = (save, text, generate) => router.resolveNaturalIntent({ saveData: save, playerText: text, selected: null, generate });
const bag = (id, n = 3, extra = {}) => ({ [id]: itemEntry(id, { 数量: n, ...extra }) });
const PLAIN_ITEM = 'lcq.item.np_repair_plain'; // 夹具里自造的无标签物品；不在总表，所以没有任何效果标签

// ───────── 第 1 条：修炼词不再短路 ─────────
const trainingTexts = ['我独自修炼了一会儿', '我闭关三天，冲击境界', '和凝羽一起修炼', '我在营地练功'];

test('试玩范围 + 有模型：含修炼词的句子也调用 intent 模型；自我修炼句模型返回空票 → 不出票、不出拒绝', async () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 } });
  for (const text of trainingTexts) {
    const { generate, calls } = stub(reply([]));
    const result = await run(save, text, generate);
    assert.equal(calls.length, 1, `${text} 应交给模型`);
    assert.equal(result.usedModel, true, text);
    assert.equal(result.kind, 'free', text);
    assert.equal(result.freeActionTickets, undefined, text);
    assert.equal(result.freeActionRefusals, undefined, text);
  }
});

test('“和凝羽一起修炼”模型若报了对人的票：照常过校验收票（路由不再替模型否决）', async () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 } });
  const text = '我替凝羽疗伤，运功助她修炼';
  const result = await run(save, text, stub(reply([raw('cast', 'heal', NING_YU, '运功助她修炼')])).generate);
  assert.equal(result.freeActionTickets?.length, 1);
  assert.equal(result.freeActionTickets[0].itemId, null);
});

test('修炼句识别失败（坏 JSON / 报错）：回到旧的本地修炼判定，不被固定事件链 hold 住；普通自由句失败仍照旧 hold', async () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 } });
  assert.ok(router.listNaturalIntentCandidates(save).length > 0, '夹具里应有合同候选，否则 hold 分支不会触发');
  for (const generate of [stub('这不是 JSON').generate, async () => { throw new Error('timeout'); }]) {
    const training = await run(save, '我独自修炼了一会儿', generate);
    assert.deepEqual([training.kind, training.skipKeywordPreflight, training.hold], ['free', false, undefined]);
    const plain = await run(save, '我拔刀，一刀砍向王哲！', generate);
    assert.deepEqual([plain.kind, plain.hold], ['failed', true]);
  }
});

test('回滚口径：freeAction 关闭 / 没有 generate 时，修炼词句子仍走旧路径（不调模型、不跳过旧预检）', async () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 } });
  const legacy = { kind: 'free', skipKeywordPreflight: false, usedModel: false };
  const noModel = await run(save, '我独自修炼了一会儿', undefined);
  assert.deepEqual(noModel, legacy);
  N.applyGameNumbers({ freeAction: { enabled: false } });
  try {
    const { generate, calls } = stub(reply([]));
    assert.deepEqual(await run(save, '和凝羽一起修炼', generate), legacy);
    assert.equal(calls.length, 0);
  } finally { N.applyGameNumbers({ freeAction: { enabled: true } }); }
});

// ───────── 第 2 条：不需要物品的变体带 itemId ─────────
test('不需要物品的变体带了 itemId（背包里的、背包外的、乱写的）：置 null，票照收', () => {
  const save = makeSave({ present: [WANG_ZHE], items: bag(PLAIN_ITEM) });
  for (const itemId of [PLAIN_ITEM, 'lcq.item.not_mine', 12345]) {
    const out = validate([raw('physical', 'attack', WANG_ZHE, '一刀砍向王哲', { itemId })], '我拔刀，一刀砍向王哲！', save);
    assert.equal(out.tickets.length, 1, String(itemId));
    assert.equal(out.tickets[0].itemId, null);
    assert.deepEqual(out.refusals, []);
  }
});

// ───────── 第 2、3 条：目标/物品无效 → refusals ─────────
test('证据通过但目标无效：返回 target_unavailable 文本（不含玩家原话），丢弃日志仍记原因码；证据不过则连拒绝也不发', () => {
  const save = makeSave({ present: [WANG_ZHE] });
  const text = '我一刀砍向苏妲己';
  const expected = mods.facts.gateText('target_unavailable', { player: save.角色.身份.名字 || '你', target: '' });
  for (const targetId of ['liuchao.character.su_daji', 'lcq.character.not_a_real_one', 123, null, 'null']) {
    const out = validate([raw('physical', 'attack', targetId, '一刀砍向')], text, save);
    assert.deepEqual(out.tickets, []);
    assert.deepEqual(out.discards.map(d => d.reason), ['target_not_present']);
    assert.deepEqual(out.refusals, [expected]);
    assert.equal(out.refusals[0].includes('苏妲己'), false);
    assert.equal(out.refusals[0].includes('{'), false, '没有残留的槽位');
  }
  const forged = validate([raw('physical', 'attack', 'lcq.character.not_a_real_one', '玩家根本没说过')], text, save);
  assert.deepEqual(forged.refusals, []);
  assert.equal(forged.discards[0].reason, 'bad_evidence');
  const notPerformed = validate([{ ...raw('physical', 'attack', 'lcq.character.not_a_real_one', '一刀砍向'), performed: 'no' }], text, save);
  assert.deepEqual(notPerformed.refusals, [], '问句/假设类不发“没成事”');
});

test('没有关系记录的人：不在名单，同样给 target_unavailable', () => {
  const save = makeSave({ present: [WANG_ZHE] });
  const out = validate([raw('verbal', 'taunt', 'liuchao.character.xie_yi', '嘲讽谢艺')], '我当众嘲讽谢艺', save);
  assert.equal(out.tickets.length, 0);
  assert.equal(out.refusals.length, 1);
});

test('需要物品的变体报了背包里没有的物品 id：item_unavailable 事实；报 null 则收票（由闸门判 no_item）', () => {
  const save = makeSave({ present: [WANG_ZHE], favor: { [WANG_ZHE]: 40 }, items: bag(PLAIN_ITEM) });
  const text = '我把一颗丹药塞给王哲';
  const bad = validate([raw('give', 'feed_pill', WANG_ZHE, '丹药塞给王哲', { itemId: 'lcq.item.not_mine' })], text, save);
  assert.deepEqual(bad.tickets, []);
  assert.deepEqual(bad.discards.map(d => d.reason), ['bad_item_id']);
  assert.deepEqual(bad.refusals, [mods.facts.gateText('item_unavailable', { player: save.角色.身份.名字 || '你', target: '' })]);
  const none = validate([raw('give', 'feed_pill', WANG_ZHE, '丹药塞给王哲')], text, save);
  assert.equal(none.tickets.length, 1);
  assert.equal(none.tickets[0].itemId, null);
  assert.deepEqual(none.refusals, []);
});

test('路由把 refusals 透传（没有可结算的票时也带）；两条拒绝文本相同只留一条', async () => {
  const save = makeSave({ present: [WANG_ZHE] });
  const text = '我一刀砍向苏妲己，又一刀砍向李四';
  const result = await run(save, text, stub(reply([
    raw('physical', 'attack', 'liuchao.character.su_daji', '一刀砍向苏妲己'),
    raw('physical', 'attack', 'lcq.character.li_si', '一刀砍向李四'),
  ])).generate);
  assert.equal(result.freeActionTickets, undefined);
  assert.equal(result.freeActionRefusals.length, 1);
});

// ───────── 第 3 条：提示词与 classes 载荷 ─────────
test('提示词写明“需要物品的变体没物品也出票、itemId 填 null”，classes 载荷带 needsItem（与配置一致）', () => {
  const { system, payload } = mods.ticket.ticketPromptSection(makeSave({ present: [WANG_ZHE] }));
  assert.match(system, /needsItem为true/);
  assert.match(system, /itemId填null/);
  const flat = payload.classes.flatMap(c => c.variants.map(v => ({ ...v, actionClass: c.actionClass })));
  assert.ok(flat.length >= 12);
  for (const row of flat) {
    assert.equal(typeof row.needsItem, 'boolean', row.variant);
    assert.equal(row.needsItem, mods.config.variantSpecOf(row.actionClass, row.variant).needsItem === true, row.variant);
  }
  assert.ok(flat.some(v => v.needsItem) && flat.some(v => !v.needsItem));
});

// ───────── 第 3 条：没物品 / 无标签物品 → “未发生” ─────────
test('疗伤/包扎没有物品或物品没有功能标签：闸门拒绝，有“未发生”事实块与回执事实行，零写入', () => {
  const dying = id => { const r = makeSave({ present: [WANG_ZHE], favor: { [WANG_ZHE]: 60 }, items: id ? bag(id) : {} }); return r; };
  for (const [save, reason] of [[dying(null), 'no_item'], [dying(PLAIN_ITEM), 'item_mismatch']]) {
    const before = structuredClone(save);
    const tk = { ...raw('cast', 'heal', WANG_ZHE, '替王哲疗伤', { itemId: reason === 'no_item' ? null : PLAIN_ITEM }) };
    const issue = mods.turn.issueFreeActionJudgement(save, [tk]);
    assert.equal(issue.issued, undefined, reason);
    assert.match(issue.refusalBlock, /本地自由行动未发生/);
    assert.equal(issue.refusedFacts.length, 1, '界面回执用的事实行');
    assert.deepEqual(save, before, '零写入');
    assert.equal(mods.plan.prepareFreeAction(save, tk).reason, reason);
  }
});

test('feed_pill 用没有标签也没有 onUse 的物品：item_mismatch，不扣物品；物品功能只看物品属性（注入标签才有效果）', () => {
  const save = makeSave({ favor: { [DUAN_QIANG]: 40 }, items: bag(PLAIN_ITEM, 1) });
  const tk = raw('give', 'feed_pill', DUAN_QIANG, '喂他一颗', { itemId: PLAIN_ITEM });
  const refused = mods.plan.prepareFreeAction(save, tk);
  assert.deepEqual([refused.kind, refused.reason], ['refused', 'item_mismatch']);
  assert.equal(save.角色.背包.物品[PLAIN_ITEM].数量, 1);
  const tagged = mods.plan.prepareFreeAction(save, tk, { itemEffect: () => ({ tags: [], onUse: [{ statusId: 'poisoned' }] }) });
  assert.equal(tagged.kind, 'settled', '同一件物品，物品属性里有 onUse 才结算');
});

// ───────── 第 3 条：refused_by_state 有事实行 ─────────
test('结算时状态写入被拒（refused_by_state）：facts 不为空，回合块里是“未发生”，不涨进度不付真气', () => {
  const variant = N.GAME_NUMBERS.freeAction.classes.cast.variants.transfer_qi;
  const original = variant.backlash.failure;
  variant.backlash.failure = 'no_such_status'; // 反噬状态写不进去 → 状态拒写
  try {
    const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 }, chapter: 40, realm: mods.realm.levelName(4) });
    const progress = profileOf(save, NING_YU).境界.当前进度, spirit = save.角色.属性.灵气.当前;
    const { result, resolution } = runJudged(save, ticket('cast', 'transfer_qi', NING_YU), 'failure');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'refused_by_state');
    assert.equal(result.facts.length, 1);
    assert.equal(result.facts[0], mods.facts.gateText('state_refused', { player: save.角色.身份.名字 || '你', target: '' }));
    const turn = mods.turn.settleFreeActionTurn(save, [], resolution);
    assert.equal(turn.changed, false);
    assert.match(turn.block, /本地自由行动未发生/);
    assert.equal(turn.refusedFacts.length, 1);
    assert.equal(profileOf(save, NING_YU).境界.当前进度, progress);
    assert.equal(save.角色.属性.灵气.当前, spirit);
  } finally { variant.backlash.failure = original; }
});

// ───────── 文本与静态守则 ─────────
test('新增拒绝文本在包 texts 里（经编译器进 catalog），GATE_REASONS 登记，文本体检为空，槽位只有 player', () => {
  for (const reason of ['target_unavailable', 'item_unavailable', 'state_refused']) {
    assert.ok(mods.facts.GATE_REASONS.includes(reason), reason);
    const text = mods.facts.gateText(reason, { player: '甲', target: '' });
    assert.ok(text && !text.includes('{') && text.includes('甲'), reason);
  }
  assert.deepEqual(mods.facts.validateFreeActionTexts(), []);
  const compiled = JSON.parse(readFileSync(fileURLToPath(new URL('../src/modules/contentPacks/generated/catalog.json', import.meta.url)), 'utf8'));
  for (const reason of ['target_unavailable', 'item_unavailable', 'state_refused']) assert.ok(compiled.texts[`free.fact.gate.${reason}`], `catalog.json 缺 ${reason}（先跑 node scripts/content-packs.mjs）`);
});

test('代码不认具体物品：freeAction/** 里没有物品 id 字面量，也没有读总表里的物品名', () => {
  const dir = fileURLToPath(new URL('../src/modules/scenarioMods/freeAction/', import.meta.url));
  const strip = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const itemIds = JSON.parse(readFileSync(fileURLToPath(new URL('../mod-kit/entity-catalog/items.json', import.meta.url)), 'utf8'));
  const list = Array.isArray(itemIds) ? itemIds : (itemIds.items || itemIds.entries || Object.values(itemIds).find(Array.isArray) || []);
  assert.ok(list.length > 100, '物品总表应能读到');
  const ids = new Set(list.map(row => row.id).filter(Boolean));
  for (const f of readdirSync(dir).filter(name => name.endsWith('.ts'))) {
    const code = strip(readFileSync(`${dir}${f}`, 'utf8'));
    assert.doesNotMatch(code, /['"`][a-z]{2,4}\.item\.[a-z0-9_]+['"`]/, `${f} 含物品 id 字面量`);
    for (const id of ids) assert.equal(code.includes(`'${id}'`) || code.includes(`"${id}"`), false, `${f} 认了物品 ${id}`);
  }
});
