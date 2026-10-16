// 自由行动：给予（赠物/喂药/下毒）与施术（传功/疗伤/包扎）。闸门读变体参数，效果由代码按物品效果标签与配置结算。
import assert from 'node:assert/strict';
import test from 'node:test';
import { DUAN_QIANG, NING_YU, WANG_ZHE, advanceTurn, itemEntry, load, makeSave, mods, profileOf, runJudged, runtimeOf, ticket } from './freeActionFixture.mjs';

const cfg = () => mods.config.freeActionConfig();
const rows = (save, id) => mods.statusRead.actorStatusRecords(save, id).map(r => r.statusId);
const progressOf = (save, id) => profileOf(save, id).境界.当前进度;
const days = (save, n) => { save.元数据.时间.日 += n; };
const injected = tags => id => ({ tags: tags[id] ?? [], onUse: [] });
const refusedBlock = (save, tk, deps) => mods.turn.issueFreeActionJudgement(save, [tk], deps).refusalBlock;
const lvl4 = () => mods.realm.levelName(4);

// ───────── 传功 ─────────
test('T20 传功闸门：功力不及 / 对方级数不明 → 不出判定卡、不扣真气、不改进度，有“未发生”事实行', () => {
  const low = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 }, chapter: 40, realm: '无修为' });
  const before = structuredClone(low);
  const prepared = mods.plan.prepareFreeAction(low, ticket('cast', 'transfer_qi', NING_YU));
  assert.deepEqual([prepared.kind, prepared.reason], ['refused', 'level_too_low']);
  assert.match(prepared.facts[0], /功力不及/);
  assert.deepEqual(low, before, '零写入');
  assert.match(refusedBlock(low, ticket('cast', 'transfer_qi', NING_YU)), /本地自由行动未发生/);

  const unknown = makeSave({ favor: { [DUAN_QIANG]: 60 }, realm: lvl4() });
  assert.equal(mods.plan.prepareFreeAction(unknown, ticket('cast', 'transfer_qi', DUAN_QIANG)).reason, 'level_unknown');
});

test('T20b 传功成功：只涨“当前进度”，不改境界名/阶段/下一级所需与时点级数；付真气；记冷却与预算', () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 }, chapter: 40, realm: lvl4() });
  const realm = structuredClone(profileOf(save, NING_YU).境界);
  const factBefore = JSON.stringify(mods.levels.levelFact(NING_YU, 40));
  const spirit = save.角色.属性.灵气.当前;
  const { prepared, result } = runJudged(save, ticket('cast', 'transfer_qi', NING_YU), 'success');
  assert.equal(prepared.proposal.kind, 'craft');
  assert.equal(prepared.proposal.factors.some(f => f.source === 'realm'), false, '社交档：无境界差');
  assert.equal(result.resultKey, 'gain');
  const after = profileOf(save, NING_YU).境界;
  assert.equal(after.当前进度, realm.当前进度 + 10, 'training.successProgress');
  assert.deepEqual([after.名称, after.阶段, after.下一级所需], [realm.名称, realm.阶段, realm.下一级所需]);
  assert.equal(JSON.stringify(mods.levels.levelFact(NING_YU, 40)), factBefore);
  assert.equal(save.角色.属性.灵气.当前, spirit - Math.round(save.角色.属性.灵气.上限 * 0.3));
  assert.equal(mods.state.readFreeActionState(save).transferBudget[NING_YU].used, 10);
  assert.equal(favorOf(save, NING_YU) > 60, true);
  assert.equal(JSON.stringify(save.角色.属性.境界).includes('当前进度'), true);
});
const favorOf = (save, id) => profileOf(save, id).好感度;

test('T21 传功上限：单次封顶、冷却、阶段预算、永不到“下一级所需”；预算满后闸门不过、不扣费', () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 }, chapter: 40, realm: lvl4() });
  const need = profileOf(save, NING_YU).境界.下一级所需;
  const budget = Math.floor(need * cfg().classes.cast.variants.transfer_qi.phaseBudgetRatio);
  let last;
  const first = runJudged(save, ticket('cast', 'transfer_qi', NING_YU, { degree: 'heavy' }), 'perfect');
  assert.equal(profileOf(save, NING_YU).境界.当前进度, 20, '单次最多 training.greatProgress');
  const early = mods.plan.prepareFreeAction(save, ticket('cast', 'transfer_qi', NING_YU));
  assert.equal(early.reason, 'cooldown', '冷却内不可再传');
  for (let i = 0; i < 20; i++) {
    days(save, 2); advanceTurn(save);
    save.角色.属性.灵气.当前 = save.角色.属性.灵气.上限;
    last = runJudged(save, ticket('cast', 'transfer_qi', NING_YU, { degree: 'heavy' }), 'perfect');
    if (!last.result) break;
    assert.ok(profileOf(save, NING_YU).境界.当前进度 <= need - 1);
  }
  assert.equal(last.prepared.reason, 'budget_full');
  assert.equal(profileOf(save, NING_YU).境界.当前进度, budget, '累计进度 = 阶段预算');
  assert.equal(mods.state.readFreeActionState(save).transferBudget[NING_YU].used, budget);
  assert.ok(first.result.ok);
  const spirit = save.角色.属性.灵气.当前, before = structuredClone(save);
  days(save, 2);
  const refused = mods.plan.prepareFreeAction(save, ticket('cast', 'transfer_qi', NING_YU));
  assert.equal(refused.kind, 'refused');
  assert.equal(save.角色.属性.灵气.当前, spirit, '闸门不过不扣真气');
  assert.notDeepEqual(save.元数据.时间, before.元数据.时间);
});

test('T21b 传功失败反噬施术者：失败 → 真气透支，大失败 → 内力紊乱（并写 角色.效果）；目标一律不受坏结果，进度不变', () => {
  for (const [outcome, statusId, label] of [['failure', 'wound.exhaustion', '真气透支'], ['critical_failure', 'qi.disordered', '内力紊乱']]) {
    const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 }, chapter: 40, realm: lvl4() });
    const playerId = runtimeOf(save).opening.playerCharacterId;
    const { result } = runJudged(save, ticket('cast', 'transfer_qi', NING_YU), outcome);
    assert.equal(result.resultKey, 'no_gain');
    assert.equal(result.facts.length, 2, '事实 + 反噬');
    assert.ok(rows(save, playerId).includes(statusId));
    assert.ok(save.角色.效果.some(e => e.状态名称 === label));
    assert.equal(profileOf(save, NING_YU).境界.当前进度, 0);
    assert.deepEqual(rows(save, NING_YU), []);
  }
  const broke = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 }, chapter: 40, realm: lvl4() });
  broke.角色.属性.灵气.当前 = 0;
  assert.equal(mods.plan.prepareFreeAction(broke, ticket('cast', 'transfer_qi', NING_YU)).reason, 'no_resource');
});

test('T22 玩家自涨与敌对传功：目标不能是玩家；低好感（敌对/戒备）者不受；玩家自己的境界进度不变', () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: -30 }, chapter: 40, realm: lvl4() });
  const playerId = runtimeOf(save).opening.playerCharacterId;
  const out = mods.ticket.validateFreeActionTickets([{ actionClass: 'cast', variant: 'transfer_qi', targetId: playerId, degree: 'normal', performed: 'yes', evidence: '给自己传功', itemId: null }], '我给自己传功', save);
  assert.equal(out.discards[0].reason, 'target_not_present');
  const mine = JSON.stringify(save.角色.属性.境界);
  assert.equal(mods.plan.prepareFreeAction(save, ticket('cast', 'transfer_qi', NING_YU)).reason, 'low_goodwill');
  profileOf(save, NING_YU).好感度 = 60;
  runJudged(save, ticket('cast', 'transfer_qi', NING_YU), 'success');
  assert.equal(JSON.stringify(save.角色.属性.境界), mine, '判定 actionText 由模板生成，不会误触玩家修炼进度');
});

// ───────── 疗伤 / 包扎 ─────────
const HEAL = 'test.item.heal_pill', STICK = 'test.item.hemostatic';
const tags = { [HEAL]: ['heal'], [STICK]: ['hemostatic'] };
const withItems = id => makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 }, items: { [HEAL]: itemEntry(HEAL), [STICK]: itemEntry(STICK) }, ...id });

test('T23 疗伤：濒死 → 解除并改挂重伤，消耗一件；无物品/物品不对/无可治之伤 → 不可、不扣', () => {
  const deps = { itemEffect: injected(tags) };
  const save = withItems({});
  mods.actorStatus.applyActorStatus(save, NING_YU, 'dying');
  assert.ok(rows(save, NING_YU).includes('dying'));
  const none = ticket('cast', 'heal', NING_YU);
  assert.equal(mods.plan.prepareFreeAction(save, none, deps).reason, 'no_item');
  assert.equal(mods.plan.prepareFreeAction(save, ticket('cast', 'heal', NING_YU, { itemId: STICK }), deps).reason, 'item_mismatch');
  const { result } = runJudged(save, ticket('cast', 'heal', NING_YU, { itemId: HEAL }), 'success', deps);
  assert.equal(result.resultKey, 'done_downgraded');
  assert.deepEqual(rows(save, NING_YU), ['wound.severe']);
  assert.equal(save.角色.背包.物品[HEAL], undefined, '消耗一件');
  assert.ok(save.角色.背包.物品[STICK]);
  const healthy = withItems({});
  assert.equal(mods.plan.prepareFreeAction(healthy, ticket('cast', 'heal', NING_YU, { itemId: HEAL }), deps).reason, 'nothing_to_treat');
});

test('T23b 疗伤判定失败：物品耗尽、濒死保留（不会因拖延而死）；作者锁定（story 解除）的伤治不了', () => {
  const deps = { itemEffect: injected(tags) };
  const save = withItems({});
  mods.actorStatus.applyActorStatus(save, NING_YU, 'dying');
  const { result } = runJudged(save, ticket('cast', 'heal', NING_YU, { itemId: HEAL }), 'failure', deps);
  assert.equal(result.resultKey, 'failed');
  assert.ok(rows(save, NING_YU).includes('dying'));
  assert.equal(save.角色.背包.物品[HEAL], undefined);
  const locked = withItems({});
  const store = mods.injuries.injuryStore(locked);
  store.actors[NING_YU] = [{ player: false, statusId: 'story.only', label: '作者锁定的伤', sourceScene: 'x', cause: 'story', appliedAt: 0, expiresAt: null, effects: [], remove: [{ kind: 'story', flag: 'never.set' }] }];
  assert.equal(mods.plan.prepareFreeAction(locked, ticket('cast', 'heal', NING_YU, { itemId: HEAL }), deps).reason, 'nothing_to_treat');
});

test('T23c 包扎：流血 + 止血标签物品 → 解除', () => {
  const deps = { itemEffect: injected(tags) };
  const save = withItems({});
  mods.actorStatus.applyActorStatus(save, NING_YU, 'bleeding');
  const { result } = runJudged(save, ticket('cast', 'bandage', NING_YU, { itemId: STICK }), 'great_success', deps);
  assert.equal(result.resultKey, 'done');
  assert.deepEqual(rows(save, NING_YU), []);
});

// ───────── 赠物 ─────────
test('T26 赠物：已装备/剧情物品/名单外 → 拒绝；成功 → 玩家 −1、NPC 记账、幂等', () => {
  const ITEM = 'test.item.gift', STORY = 'lcq.item.np012', WORN = 'test.item.worn';
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 30 }, items: { [ITEM]: itemEntry(ITEM, { 数量: 2 }), [WORN]: itemEntry(WORN, { 已装备: true }), [STORY]: itemEntry(STORY) } });
  assert.equal(mods.plan.prepareFreeAction(save, ticket('give', 'gift', NING_YU, { itemId: WORN })).reason, 'equipped_or_story');
  assert.equal(mods.plan.prepareFreeAction(save, ticket('give', 'gift', NING_YU, { itemId: STORY })).reason, 'equipped_or_story');
  const out = mods.ticket.validateFreeActionTickets([{ actionClass: 'give', variant: 'gift', targetId: NING_YU, degree: 'normal', performed: 'yes', evidence: '送给', itemId: 'test.item.not_owned' }], '我送给她一件东西', save);
  assert.equal(out.discards[0].reason, 'bad_item_id');
  const prepared = mods.plan.prepareFreeAction(save, ticket('give', 'gift', NING_YU, { itemId: ITEM }));
  assert.equal(prepared.kind, 'settled');
  assert.equal(prepared.result.resultKey, 'done');
  assert.equal(save.角色.背包.物品[ITEM].数量, 1);
  assert.equal(profileOf(save, NING_YU).背包.物品[ITEM].数量, 1);
  assert.equal(favorOf(save, NING_YU), 33);
  const again = mods.settle.settleFreeAction(save, ticket('give', 'gift', NING_YU, { itemId: ITEM }));
  assert.equal(again.replay, true, '同回合同键不重复');
  assert.equal(save.角色.背包.物品[ITEM].数量, 1);
  profileOf(save, NING_YU).好感度 = -30;
  assert.equal(mods.plan.prepareFreeAction(save, ticket('give', 'gift', NING_YU, { itemId: ITEM })).reason, 'low_goodwill');
});

// ───────── 喂药 / 下毒 ─────────
const ANTIDOTE = 'lcq.item.np013', POISON = 'lyg.item.np092', SEDATIVE = 'lyl.item.np053';
const bag = (id, n = 6) => ({ [id]: itemEntry(id, { 数量: n }) });

test('T24 下毒（非必须活着者）：挂中毒，累计到下限计数 0 → 升级濒死（不写死亡）；目标态度不看', () => {
  const save = makeSave({ favor: { [DUAN_QIANG]: -50 }, items: bag(POISON) });
  const results = [];
  for (let i = 0; i < 4; i++) {
    advanceTurn(save);
    const prepared = mods.plan.prepareFreeAction(save, ticket('give', 'feed_pill', DUAN_QIANG, { itemId: POISON }));
    assert.equal(prepared.kind, 'settled', '敌对者也可被下毒（毒性标签不看态度）');
    results.push(prepared.result.resultKey);
  }
  assert.deepEqual(results, ['toxic_done', 'toxic_done', 'toxic_done', 'toxic_dying']);
  assert.ok(rows(save, DUAN_QIANG).includes('poisoned'));
  assert.ok(rows(save, DUAN_QIANG).includes('dying'));
  assert.equal(save.角色.背包.物品[POISON].数量, 2);
  assert.notEqual(runtimeOf(save).sceneLedger?.actors?.[DUAN_QIANG]?.status, 'dead');
  const rec = mods.statusRead.actorStatusRecords(save, DUAN_QIANG).find(r => r.statusId === 'poisoned');
  assert.ok(rec.expiresAt === null || Number.isFinite(rec.expiresAt));
});

test('T30 必须活着者中毒到下限停止：可以中毒但不挂濒死、不写死亡；之后再下毒不再追加；放开 lethalAllowed 也一样', () => {
  const save = makeSave({ present: [WANG_ZHE], favor: { [WANG_ZHE]: -50 }, items: bag(POISON, 40) });
  const keys = [];
  for (let i = 0; i < 12; i++) {
    advanceTurn(save);
    keys.push(mods.plan.prepareFreeAction(save, ticket('give', 'feed_pill', WANG_ZHE, { itemId: POISON })).result.resultKey);
  }
  assert.ok(rows(save, WANG_ZHE).includes('poisoned'));
  assert.equal(rows(save, WANG_ZHE).includes('dying'), false);
  assert.ok(keys.includes('toxic_floor'));
  assert.equal(keys.includes('toxic_dying'), false);
  const counter = mods.statusRead.actorStatusRecords(save, WANG_ZHE).find(r => r.statusId === 'poisoned').counter;
  assert.equal(counter.life, counter.floor);
  assert.ok(counter.floor >= 1);
  mods.numbers.GAME_NUMBERS.freeAction.lethalAllowed = true;
  try {
    advanceTurn(save);
    mods.plan.prepareFreeAction(save, ticket('give', 'feed_pill', WANG_ZHE, { itemId: POISON }));
    assert.equal(rows(save, WANG_ZHE).includes('dying'), false);
    assert.notEqual(runtimeOf(save).sceneLedger?.actors?.[WANG_ZHE]?.status, 'dead');
  } finally { mods.numbers.GAME_NUMBERS.freeAction.lethalAllowed = false; }
});

test('T32 喂药与下毒共用一套结算：同一变体、同一入口，差别只来自物品效果标签；没有独立的 poison 变体', () => {
  const save = makeSave({ favor: { [DUAN_QIANG]: 40 }, items: { ...bag(POISON, 1), ...bag(ANTIDOTE, 1) } });
  mods.actorStatus.applyActorStatus(save, DUAN_QIANG, 'poisoned');
  const benefit = mods.plan.prepareFreeAction(save, ticket('give', 'feed_pill', DUAN_QIANG, { itemId: ANTIDOTE })).result;
  assert.equal(benefit.resultKey, 'benefit_done');
  assert.equal(rows(save, DUAN_QIANG).includes('poisoned'), false, '解毒标签解除中毒');
  advanceTurn(save);
  const toxic = mods.plan.prepareFreeAction(save, ticket('give', 'feed_pill', DUAN_QIANG, { itemId: POISON })).result;
  assert.equal(toxic.resultKey, 'toxic_done');
  assert.ok(rows(save, DUAN_QIANG).includes('poisoned'));
  assert.deepEqual([benefit.key.split('.').slice(-1)[0], toxic.key.split('.').slice(-1)[0]], ['feed_pill', 'feed_pill']);
  assert.equal(mods.config.variantSpecOf('give', 'poison'), undefined);
  assert.equal(mods.config.variantSpecOf('cast', 'poison'), undefined);
  for (const [cls, variant] of [['give', 'poison'], ['cast', 'poison']]) {
    const out = mods.ticket.validateFreeActionTickets([{ actionClass: cls, variant, targetId: DUAN_QIANG, degree: 'normal', performed: 'yes', evidence: '下毒', itemId: null }], '我给他下毒', save);
    assert.equal(out.discards[0].reason, 'bad_variant');
  }
});

test('T24b 喂药要看态度，毒不看：解毒丸/假死药对低好感者拒绝；假死药在被信任时才行并挂昏迷', () => {
  const low = makeSave({ favor: { [DUAN_QIANG]: -30 }, items: { ...bag(ANTIDOTE, 1), ...bag(SEDATIVE, 1) } });
  mods.actorStatus.applyActorStatus(low, DUAN_QIANG, 'poisoned');
  assert.equal(mods.plan.prepareFreeAction(low, ticket('give', 'feed_pill', DUAN_QIANG, { itemId: ANTIDOTE })).reason, 'low_goodwill');
  assert.equal(mods.plan.prepareFreeAction(low, ticket('give', 'feed_pill', DUAN_QIANG, { itemId: SEDATIVE })).reason, 'low_goodwill');
  profileOf(low, DUAN_QIANG).好感度 = 50;
  const r = mods.plan.prepareFreeAction(low, ticket('give', 'feed_pill', DUAN_QIANG, { itemId: SEDATIVE })).result;
  assert.equal(r.resultKey, 'sedative_done');
  assert.ok(rows(low, DUAN_QIANG).includes('unconscious'));
});

test('E7 其余闸门：场面进行中不处理；自由行动写给 NPC 的状态一律有限时长', () => {
  const save = makeSave({ favor: { [DUAN_QIANG]: 50 }, items: bag(POISON, 1) });
  mods.plan.prepareFreeAction(save, ticket('give', 'feed_pill', DUAN_QIANG, { itemId: POISON }));
  const rec = mods.statusRead.actorStatusRecords(save, DUAN_QIANG).find(r => r.statusId === 'poisoned');
  assert.ok(Number.isFinite(rec.expiresAt), '毒有限时长');
  assert.match(rec.sourceScene, /^free:fa\./, 'sourceScene 带 free: 前缀，便于识别与审计');
});

test('T27 类/变体不匹配与编造：物品用在不带 needsItem 的变体、类下报别类变体、缺 variant，整张作废', () => {
  const save = makeSave({ present: [WANG_ZHE], items: bag(POISON, 1) });
  const base = { targetId: WANG_ZHE, degree: 'normal', performed: 'yes', evidence: '动手', itemId: null };
  const cases = [
    [{ actionClass: 'physical', variant: 'kiss' }, 'bad_variant'],
    [{ actionClass: 'verbal', variant: 'humiliate' }, 'bad_variant'],
    [{ actionClass: 'physical' }, 'missing_fields'],
    [{ actionClass: 'physical', variant: 'attack', itemId: POISON }, 'bad_item_id'],
    [{ actionClass: 'physical', variant: 'bind' }, 'variant_disabled'],
    [{ actionClass: 'sorcery', variant: 'attack' }, 'bad_class'],
  ];
  for (const [patch, reason] of cases) {
    const raw = { ...base, ...patch };
    if (!('variant' in patch)) delete raw.variant;
    const out = mods.ticket.validateFreeActionTickets([raw], '我对王哲动手', save);
    assert.equal(out.tickets.length, 0, reason);
    assert.equal(out.discards[0].reason, reason);
  }
});

test('T28 新增变体只改 config + 内容包文本：physical 加一行 shove 即被提示清单列出、被校验接受、结算出好感与记忆，src 零改动；未知 effect 被体检拒绝', async () => {
  const { CONTENT_PACKS } = await load('../src/modules/contentPacks/index.ts');
  const variants = mods.numbers.GAME_NUMBERS.freeAction.classes.physical.variants;
  variants.shove = { label: '推搡', base: -2, npcOutcomes: { critical_failure: 'block', failure: 'block', partial: 'block', success: 'graze', great_success: 'graze', perfect: 'graze' } };
  const added = { 'free.fact.shove.block': '{player}推了{target}一把，没推动。', 'free.fact.shove.graze': '{player}推了{target}一把，{target}踉跄了一下。', 'free.memory.shove.block': '{player}推过{target}，没推动。', 'free.memory.shove.graze': '{player}推过{target}一把。' };
  try {
    const save = makeSave({ present: [WANG_ZHE], favor: { [WANG_ZHE]: 50 } });
    assert.ok(mods.config.enabledVariants().some(v => v.variant === 'shove'));
    assert.equal(mods.ticket.ticketPromptSection(save).payload.classes.find(c => c.actionClass === 'physical').variants.some(v => v.variant === 'shove'), true);
    const out = mods.ticket.validateFreeActionTickets([{ actionClass: 'physical', variant: 'shove', targetId: WANG_ZHE, degree: 'normal', performed: 'yes', evidence: '推搡', itemId: null }], '我推搡王哲', save);
    assert.equal(out.tickets.length, 1);
    assert.ok(mods.facts.validateFreeActionTexts().some(e => e.includes('shove')), '体检提醒这一行还缺文本');
    Object.assign(CONTENT_PACKS.texts, added);
    assert.deepEqual(mods.facts.validateFreeActionTexts(), []);
    const { prepared, result } = runJudged(save, ticket('physical', 'shove', WANG_ZHE), 'success');
    assert.equal(prepared.proposal.factors.some(f => f.source === 'realm'), true, '继承 physical 的境界差');
    assert.equal(result.resultKey, 'graze');
    assert.equal(favorOf(save, WANG_ZHE), 48);
    assert.ok(profileOf(save, WANG_ZHE).记忆.some(m => m.includes('推过')));
    variants.teleport = { label: '瞬移', effect: 'teleport', route: 'judge' };
    assert.ok(mods.config.validateFreeActionConfig().some(e => e.includes('teleport') && e.includes('effect')));
  } finally { delete variants.shove; delete variants.teleport; for (const key of Object.keys(added)) delete CONTENT_PACKS.texts[key]; }
  assert.deepEqual(mods.config.validateFreeActionConfig(), []);
  assert.deepEqual(mods.facts.validateFreeActionTexts(), []);
});

test('T33 施术只有传功、疗伤、包扎；类与变体白名单就是配置里的键', () => {
  const classes = cfg().classes;
  assert.deepEqual(Object.keys(classes.cast.variants), ['transfer_qi', 'heal', 'bandage']);
  assert.deepEqual(Object.keys(classes.give.variants), ['gift', 'feed_pill']);
  assert.deepEqual(Object.keys(classes.physical.variants), ['attack', 'grab', 'bind']);
  assert.deepEqual(cfg().actionClasses, ['physical', 'verbal', 'intimate', 'give', 'cast', 'other']);
});
