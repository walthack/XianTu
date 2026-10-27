// 自由行动的无对象大类：solo（自修：修炼 / 冲关 / 调息疗伤）与 field（场面：逃跑·潜行·探索合一）。
// 迁移第 3 步起默认启用（配置 classes.<类>.defaults.enabled=true）；关掉开关即回到第 2 步的旧流程。票仍是 7 个 key，targetId 为 null，
// 境界进度、自修回血由旧判定引擎按 kind 在确认判定时落账，失败余波（气血、行动门控）由 settle.ts 落账，freeAction 这边签发判定卡、出既定事实行。
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { WANG_ZHE, load, makeSave, mods, profileOf, runJudged, runtimeOf, ticket } from './freeActionFixture.mjs';

const preflight = await load('../src/utils/judgementPreflight.ts');

const cfg = () => mods.config.freeActionConfig();
const N = () => mods.numbers.GAME_NUMBERS;
const NEW_CLASSES = ['solo', 'field'];
const OUTCOMES = ['critical_failure', 'failure', 'partial', 'success', 'great_success', 'perfect'];

/** 临时打开 / 关掉 solo / field（测试进程内改配置对象，用完还原）。 */
function switched(enabled, fn) {
  const c = cfg(), prior = NEW_CLASSES.map(k => c.classes[k].defaults.enabled);
  NEW_CLASSES.forEach(k => { c.classes[k].defaults.enabled = enabled; });
  try { return fn(); } finally { NEW_CLASSES.forEach((k, i) => { c.classes[k].defaults.enabled = prior[i]; }); }
}
const switchedOn = fn => switched(true, fn);
const switchedOff = fn => switched(false, fn);
const solo = (variant, extra = {}) => ticket('solo', variant, null, extra);
const field = (extra = {}) => ticket('field', 'scene_act', null, extra);

function readySave({ stage = '中期', progress = 30, cap, hp, present = [] } = {}) {
  const save = makeSave({ present, favor: { [WANG_ZHE]: 55 } });
  save.角色.属性.境界 = { 名称: mods.realm.levelName(1), 阶段: stage, 当前进度: progress, 下一级所需: 100 };
  if (hp !== undefined) save.角色.属性.气血 = { 当前: hp, 上限: 100 };
  if (cap) save.系统.难度设置 = { autoRaiseLevel: true, trainingCap: cap };
  return save;
}
const gateRows = save => save.系统?.扩展?.行动门控?.recent ?? [];
const validate = (raw, text, save) => mods.ticket.validateFreeActionTickets(raw, text, save);
const rawTicket = (actionClass, variant, targetId, evidence, extra = {}) => ({ actionClass, variant, targetId, degree: 'normal', performed: 'yes', evidence, itemId: null, ...extra });

// ───────────── 默认关闭 = 旧流程零变化 ─────────────

test('默认启用：solo / field 进提示词、收票；关掉开关回到迁移前（不进提示词、票被丢弃 variant_disabled），配置与文本体检仍通过', () => {
  for (const name of NEW_CLASSES) {
    assert.equal(cfg().classes[name].defaults.enabled, true, name);
    assert.equal(cfg().classes[name].defaults.target, 'none', name);
  }
  const save = makeSave({ present: [WANG_ZHE] });
  assert.deepEqual(mods.ticket.ticketPromptSection(save).payload.classes.map(row => row.actionClass), ['physical', 'verbal', 'intimate', 'give', 'cast', 'solo', 'field']);
  assert.equal(validate([rawTicket('solo', 'train', null, '修炼')], '我闭关修炼', save).tickets.length, 1);
  assert.deepEqual(mods.config.validateFreeActionConfig(), []);
  assert.deepEqual(mods.facts.validateFreeActionTexts(), []);
  switchedOff(() => {
    assert.ok(!mods.config.enabledVariants().some(row => NEW_CLASSES.includes(row.actionClass)));
    const section = mods.ticket.ticketPromptSection(save);
    assert.deepEqual(section.payload.classes.map(row => row.actionClass), ['physical', 'verbal', 'intimate', 'give', 'cast']);
    assert.equal(section.system.length, 700, '提示词主体长度 700（与迁移前逐字一致）');
    const checked = validate([rawTicket('solo', 'train', null, '修炼')], '我闭关修炼', save);
    assert.deepEqual([checked.tickets, checked.discards], [[], [{ reason: 'variant_disabled', key: 'solo.train' }]]);
    assert.deepEqual(mods.config.validateFreeActionConfig(), []);
    assert.deepEqual(mods.facts.validateFreeActionTexts(), []);
  });
});

test('配置：数值与口径全在 game-numbers 里——solo 难度 = 旧 cultivate 预检难度，field 难度 20，两类都无对象', () => {
  const spec = (cls, variant) => mods.config.variantSpecOf(cls, variant);
  for (const variant of ['train', 'breakthrough', 'recover']) {
    const row = spec('solo', variant);
    assert.deepEqual([row.target, row.route, row.kind, row.difficulty], ['none', 'judge', 'cultivate', N().combat.baselineDc], variant);
  }
  const act = spec('field', 'scene_act');
  assert.deepEqual([act.target, act.route, act.kind, act.difficulty], ['none', 'judge', 'escape', 20]);
  assert.deepEqual(Object.keys(cfg().classes.field.variants), ['scene_act'], 'field 只有一行配置');
  // 只有调息疗伤放开旧引擎的回血结算；修炼与冲关要求按修炼结算试算境界会动
  assert.deepEqual(['train', 'breakthrough', 'recover'].map(v => spec('solo', v).applyRecovery === true), [false, false, true]);
  assert.deepEqual(['train', 'breakthrough', 'recover'].map(v => spec('solo', v).requires?.realmMoves === true), [true, true, false]);
});

test('代码里不出现 solo / field 字面量（只认配置的 target 与 requires），也没有拦截词表', () => {
  const dir = fileURLToPath(new URL('../src/modules/scenarioMods/freeAction/', import.meta.url));
  for (const f of readdirSync(dir).filter(name => name.endsWith('.ts') && name !== 'config.ts')) {
    const code = readFileSync(`${dir}${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /['"`](solo|field)['"`]/, f);
  }
  for (const name of NEW_CLASSES) {
    for (const row of Object.values(cfg().classes[name].variants)) assert.equal(row.legacyGuardWords, undefined, '不加拦截词');
  }
});

// ───────────── 打开后：票、提示词 ─────────────

test('打开后：配置与文本体检通过；每个变体 6 档事实齐全，没有 memory 文本也不需要', () => {
  switchedOn(() => {
    assert.deepEqual(mods.config.validateFreeActionConfig(), []);
    assert.deepEqual(mods.facts.validateFreeActionTexts(), []);
    for (const [cls, variant] of [['solo', 'train'], ['solo', 'breakthrough'], ['solo', 'recover'], ['field', 'scene_act']]) {
      const keys = mods.config.resultKeysOf(mods.config.variantSpecOf(cls, variant));
      assert.deepEqual([...keys].sort(), [...OUTCOMES].sort(), variant);
    }
  });
});

test('配置负向（无对象的类即使关着也体检）：非 judge 路由、带物品/好感参数、target 取值不对 → 报错', () => {
  const clone = () => structuredClone(cfg());
  const expectErrors = (mutate, pattern) => {
    const c = clone();
    mutate(c);
    assert.ok(mods.config.validateFreeActionConfig(c).some(e => pattern.test(e)), String(pattern));
  };
  expectErrors(c => { c.classes.solo.defaults.route = 'table'; }, /solo\.train.*只能走 judge/);
  expectErrors(c => { c.classes.field.variants.scene_act.needsItem = true; }, /field\.scene_act.*不能带物品/);
  expectErrors(c => { c.classes.solo.variants.train.target = 'self'; }, /solo\.train.*target 只能是 none/);
  expectErrors(c => { delete c.classes.field.defaults.difficulty; }, /field\.scene_act.*缺 difficulty/);
});

test('打开后：票仍是 7 个 key；targetId 一律置空（模型报了名单里的人或乱写的 id 也不看）；不需要在场名单', () => {
  switchedOn(() => {
    const save = makeSave({}); // 无人在场
    for (const reported of [null, 'null', '', WANG_ZHE, 'no.such.person']) {
      const checked = validate([rawTicket('solo', 'train', reported, '修炼')], '我闭关修炼', save);
      assert.deepEqual(checked.discards, [], String(reported));
      assert.deepEqual(checked.refusals, []);
      assert.equal(checked.tickets.length, 1);
      assert.equal(checked.tickets[0].targetId, null);
      assert.deepEqual(Object.keys(checked.tickets[0]).sort(), ['actionClass', 'degree', 'evidence', 'itemId', 'performed', 'targetId', 'variant']);
    }
    // 票格式不变：多一个字段照旧作废；证据不在原话里照旧作废；没出 performed=yes 照旧不收
    assert.equal(validate([rawTicket('solo', 'train', null, '修炼', { power: 9 })], '我闭关修炼', save).discards[0].reason, 'extra_fields');
    assert.equal(validate([rawTicket('solo', 'train', null, '打坐')], '我闭关修炼', save).discards[0].reason, 'bad_evidence');
    assert.equal(validate([rawTicket('field', 'scene_act', null, '逃跑', { performed: 'no' })], '我逃跑', save).discards[0].reason, 'not_performed');
    // 无对象的票不吃好感浮动位
    assert.equal('affinityDelta' in validate([rawTicket('field', 'scene_act', null, '逃跑', { affinityDelta: 9 })], '我逃跑', save).tickets[0], false);
  });
});

test('打开后：去重按类，不按目标——同类两张只留一张并留一行“未发生”；与对人的票互不挤占', () => {
  switchedOn(() => {
    const save = makeSave({ present: [WANG_ZHE] });
    const twice = validate([rawTicket('solo', 'train', null, '修炼'), rawTicket('solo', 'recover', null, '疗伤')], '我修炼，再疗伤', save);
    assert.deepEqual(twice.tickets.map(t => t.variant), ['train']);
    assert.equal(twice.refusals.length, 1);
    const mixed = validate([rawTicket('physical', 'attack', WANG_ZHE, '攻击'), rawTicket('field', 'scene_act', null, '逃跑')], '我攻击他然后逃跑', save);
    assert.deepEqual(mixed.tickets.map(t => `${t.actionClass}.${t.variant}`), ['physical.attack', 'field.scene_act']);
    assert.equal(validate([...Array(3)].map(() => rawTicket('field', 'scene_act', null, '逃跑')), '我逃跑', save).discards[0].reason, 'too_many');
  });
});

test('提示词：主体一字不变，solo / field 只多出每个变体一行 hint（≤ 40 字），名单不变；自修的 hint 明说双修、传功不是本项', () => {
  const save = makeSave({ present: [WANG_ZHE] });
  const off = switchedOff(() => mods.ticket.ticketPromptSection(save));
  const on = mods.ticket.ticketPromptSection(save);
  assert.equal(on.system, off.system, '不增加提示词主体');
  assert.deepEqual(on.payload.roster, off.payload.roster);
  assert.deepEqual(on.payload.items, off.payload.items);
  const added = on.payload.classes.filter(row => NEW_CLASSES.includes(row.actionClass));
  assert.deepEqual(added.map(row => row.actionClass), ['solo', 'field']);
  const rows = added.flatMap(row => row.variants);
  assert.deepEqual(rows.map(row => row.variant), ['train', 'breakthrough', 'recover', 'scene_act']);
  for (const row of rows) assert.ok(row.hint.length <= 60, `${row.variant} hint ${row.hint.length} 字`);
  assert.ok(JSON.stringify(on.payload).length - JSON.stringify(off.payload).length < 700, '新增负担小于 700 字符');
  assert.match(rows.find(row => row.variant === 'train').hint, /双修/);
  assert.match(rows.find(row => row.variant === 'recover').hint, /双修/);
});

// ───────────── 打开后：签发 → 确认 → 结算 ─────────────

test('修炼：判定卡无对象、模板文本、难度承接旧 cultivate；确认后由旧引擎写境界，结算只出事实、不写好感/记忆', () => {
  switchedOn(() => {
    const save = readySave({ present: [WANG_ZHE] });
    const before = { favor: profileOf(save, WANG_ZHE).好感度, memory: structuredClone(profileOf(save, WANG_ZHE).记忆) };
    const { prepared, resolution, result } = runJudged(save, solo('train'), 'success');
    const card = prepared.proposal;
    assert.deepEqual([card.kind, card.difficulty.value, card.difficulty.band, card.target], ['cultivate', N().combat.baselineDc, 'normal', undefined]);
    assert.equal(card.actionText, '自行「修炼」（自由行动）');
    assert.match(card.whyNow, /修炼/);
    assert.ok(!card.whyNow.includes('{'));
    assert.deepEqual(card.stakes.success, '有所进益。');
    assert.ok(card.factors.every(f => f.source !== 'realm'), '无对象，不算境界差');
    assert.deepEqual(card.authorityReceipt, { kind: 'free_action_judgement', ticketId: card.authorityReceipt.ticketId, actionClass: 'solo', variant: 'train', targetId: null, degree: 'normal', itemId: null });
    assert.match(card.authorityReceipt.ticketId, /\.solo\.train$/);
    assert.equal(mods.judgement.getJudgementState(save).recent.at(-1).authorityReceipt.targetId, null, '回执经账本往返后 targetId 仍为 null');
    // 旧引擎在确认时写境界（trainingRealm，成功档 +successProgress）
    assert.equal(save.角色.属性.境界.当前进度, 30 + N().training.successProgress);
    assert.equal(resolution.appliedEffects.length, 1);
    assert.equal(result.ok, true);
    assert.match(result.facts[0], /功力略有精进/);
    assert.ok(!result.facts[0].includes('{'));
    // 结算不再动境界，也不写 NPC
    assert.equal(save.角色.属性.境界.当前进度, 40);
    assert.equal(profileOf(save, WANG_ZHE).好感度, before.favor);
    assert.deepEqual(profileOf(save, WANG_ZHE).记忆, before.memory);
    const state = runtimeOf(save).freeAction;
    assert.equal(runtimeOf(save).pendingLineAffinityGrants, undefined);
    assert.equal(state.focus, undefined);
    assert.deepEqual(state.repeatLedger, {});
    assert.deepEqual(state.log.map(row => [row.actionClass, row.variant, row.targetId, row.resultKey]), [['solo', 'train', null, 'success']]);
    // 重放幂等：同一判定再结算，同样的事实、不重复记账
    const again = mods.settle.settleFromResolution(save, resolution);
    assert.deepEqual([again.ok, again.replay, again.facts], [true, true, result.facts]);
    assert.equal(runtimeOf(save).freeAction.log.length, 1);
    assert.equal(save.角色.属性.境界.当前进度, 40);
  });
});

test('修炼各结果档：与旧引擎同一套（成功 +10、大成功与完美 +20、其余档不涨且留行动余波）；回合块里是 solo 的事实', () => {
  switchedOn(() => {
    for (const [outcome, progress] of [['success', 40], ['great_success', 50], ['perfect', 50], ['partial', 30], ['failure', 30], ['critical_failure', 30]]) {
      const save = readySave();
      const { result } = runJudged(save, solo('train'), outcome);
      assert.equal(save.角色.属性.境界.当前进度, progress, outcome);
      assert.equal(result.ok, true);
      assert.equal(result.resultKey, outcome);
      assert.deepEqual(gateRows(save).map(row => row.scope), progress === 30 ? ['scene'] : [], outcome);
    }
    const save = readySave();
    const issue = mods.turn.issueFreeActionJudgement(save, [solo('train')]);
    const resolution = mods.judgement.resolvePendingJudgement(save, issue.issued.id, { currentTurn: 1, testOutcome: 'success' });
    const settled = mods.turn.settleFreeActionTurn(save, [], resolution);
    assert.equal(settled.changed, true);
    assert.match(settled.block, /本地自由行动已结算.*功力略有精进/s);
    assert.deepEqual(settled.refusedFacts, []);
  });
});

test('冲关：时机未到 / 已满进度修炼 → 出判定卡之前就被拦（未发生事实，零写入）；时机到了成功升级，失败折损', () => {
  switchedOn(() => {
    for (const [tk, save] of [[solo('breakthrough'), readySave({ stage: '中期', progress: 30, cap: 'none' })], [solo('train'), readySave({ stage: '后期', progress: 100, cap: 'none' })]]) {
      const snapshot = structuredClone(save);
      const prepared = mods.plan.prepareFreeAction(save, tk);
      assert.deepEqual([prepared.kind, prepared.reason], ['refused', 'not_ready'], tk.variant);
      assert.match(prepared.facts[0], /境界进度还不到这一步/);
      assert.deepEqual(save, snapshot, '零写入');
      assert.match(mods.turn.issueFreeActionJudgement(save, [tk]).refusalBlock, /本地自由行动未发生/);
    }
    // 用户 2026-10-27 13:40 定取消练功章节上限：默认难度（trainingCap=none）满进度可冲关；到境界最高级才被拦
    assert.equal(mods.plan.prepareFreeAction(readySave({ stage: '后期', progress: 100 }), solo('breakthrough')).kind, 'issued');
    const top = readySave({ stage: '后期', progress: 100 });
    top.角色.属性.境界.名称 = mods.realm.levelName(N().levels.max);
    assert.equal(mods.plan.prepareFreeAction(top, solo('breakthrough')).reason, 'not_ready');

    const win = readySave({ stage: '后期', progress: 100, cap: 'none' });
    const oldName = win.角色.属性.境界.名称;
    const won = runJudged(win, solo('breakthrough'), 'success');
    assert.equal(won.prepared.proposal.actionText, '自行「冲关」（自由行动）');
    assert.notEqual(win.角色.属性.境界.名称, oldName, '旧引擎在确认时升了一级');
    assert.equal(win.角色.属性.境界.阶段, '初期');
    assert.equal(won.result.ok, true, '落账后境界已变，结算不能回头把它判成“没发生”');
    assert.match(won.result.facts[0], /冲破关隘/);

    for (const outcome of ['partial', 'failure', 'critical_failure']) {
      const lose = readySave({ stage: '后期', progress: 100, cap: 'none' });
      const lost = runJudged(lose, solo('breakthrough'), outcome);
      assert.equal(lose.角色.属性.境界.当前进度, Math.floor(100 * N().training.failureRetention), outcome);
      assert.match(lost.result.facts[0], /折损/);
    }
  });
});

test('冲关部分成功（真机 1f9f24127b4e）：数值按设计折损（同失败，保留 failureRetention）；给模型的结果文案用冲关专属句、与数值一致，不写成见效／增长；其余档与修炼仍用自修通用句', () => {
  switchedOn(() => {
    const save = readySave({ stage: '后期', progress: 100, cap: 'none' });
    const { prepared, resolution, result } = runJudged(save, solo('breakthrough'), 'partial');
    assert.equal(save.角色.属性.境界.当前进度, Math.floor(100 * N().training.failureRetention), '部分成功按失败折损（设计口径，数值不改）');
    assert.equal(prepared.proposal.stakes.partial, '冲关未成，已积累的修为折损一部分。');
    const outcomeText = mods.judgement.describeJudgementOutcomeText(resolution);
    assert.equal(outcomeText, prepared.proposal.stakes.partial);
    assert.match(mods.judgement.formatVerifiedJudgementReceiptForPrompt(resolution), /结果文案=冲关未成，已积累的修为折损一部分。/);
    assert.ok(!/见效|增长|进益|精进/.test(outcomeText), outcomeText);
    assert.match(result.facts[0], /冲关未成.*折损/, '事实句与结果文案同口径');
    // 冲关其余档、修炼各档仍用自修通用句（没有专属句就回落类的通用句）
    assert.equal(prepared.proposal.stakes.success, '有所进益。');
    assert.equal(prepared.proposal.stakes.failure, '不得要领，白费工夫。');
    assert.equal(mods.plan.prepareFreeAction(readySave(), solo('train')).proposal.stakes.partial, '勉强见效，不尽如人意。');
  });
});

test('调息疗伤：只有它放开旧引擎的回血结算（partial 5% / success 15%），不碰境界；双修不会从这里溜进去', () => {
  switchedOn(() => {
    for (const [outcome, hp] of [['partial', 55], ['success', 65], ['failure', 50], ['perfect', 90]]) {
      const save = readySave({ hp: 50 });
      const { prepared, result } = runJudged(save, solo('recover', { evidence: '双修采补' }), outcome);
      assert.equal(prepared.proposal.actionText, '自行「调息疗伤」（自由行动）');
      assert.ok(!prepared.proposal.actionText.includes('双修'), '玩家原话不进判定卡');
      assert.equal(save.角色.属性.气血.当前, hp, outcome);
      assert.deepEqual(save.角色.属性.境界, { 名称: mods.realm.levelName(1), 阶段: '中期', 当前进度: 30, 下一级所需: 100 });
      assert.ok(!(save.角色.效果 || []).some(e => e.状态名称 === '阴阳调和'), '不会触发双修专属收益');
      assert.equal(result.ok, true);
    }
    // 修炼卡不回血
    const save = readySave({ hp: 50 });
    runJudged(save, solo('train'), 'success');
    assert.equal(save.角色.属性.气血.当前, 50);
  });
});

test('场面：难度 20、escape 权重；成败只由旧引擎的余波落账（失败写 combat 余波、不扣血、不动境界）；事实按档取', () => {
  switchedOn(() => {
    const save = readySave({ hp: 100 });
    save.角色.身份.先天六司 = { 悟性: 0, 灵性: 20, 心性: 0, 根骨: 0, 气运: 0, 魅力: 0 }; // 拉开权重差别：灵性高，悟性低
    const { prepared, result } = runJudged(save, field(), 'failure');
    const card = prepared.proposal;
    assert.deepEqual([card.kind, card.difficulty.value, card.difficulty.band, card.target], ['escape', 20, 'hard', undefined]);
    assert.equal(card.actionText, '自行「逃跑潜行探索」（自由行动）');
    const stat = card.factors.find(f => f.label === '六司').value;
    assert.ok(stat === preflight.stateFactors('escape', save)[0].value, '六司权重取旧 escape 那一行'); // 不用 Object.is：账本往返会把 -0 存成 0
    assert.notEqual(stat, preflight.stateFactors('cultivate', save)[0].value, '这组六司下 escape 与 cultivate 权重结果不同，断言才有区分力');
    assert.deepEqual(gateRows(save).map(row => [row.scope, row.outcome]), [['combat', 'failure']]);
    assert.equal(save.角色.属性.气血.当前, 100, 'escape 类失败不扣血');
    assert.deepEqual(save.角色.属性.境界, { 名称: mods.realm.levelName(1), 阶段: '中期', 当前进度: 30, 下一级所需: 100 });
    assert.match(result.facts[0], /受阻/);

    const win = readySave();
    const won = runJudged(win, field(), 'great_success');
    assert.deepEqual(gateRows(win), []);
    assert.match(won.result.facts[0], /额外收获/);
    for (const outcome of OUTCOMES) {
      const each = runJudged(readySave(), field(), outcome);
      assert.equal(each.result.resultKey, outcome);
      assert.ok(each.result.facts[0] && !each.result.facts[0].includes('{'), outcome);
    }
  });
});

test('场面进行中：自修与场面都不出判定卡（scene_active），零写入', () => {
  switchedOn(() => {
    for (const tk of [solo('train'), field()]) {
      const save = readySave();
      save.系统.扩展 = { 场面模块: { version: 1, active: { phase: 'fighting' }, history: [], stall: {} } };
      const snapshot = structuredClone(save);
      const prepared = mods.plan.prepareFreeAction(save, tk);
      assert.deepEqual([prepared.kind, prepared.reason], ['refused', 'scene_active']);
      assert.deepEqual(save, snapshot);
    }
  });
});

test('有对象的变体缺 targetId（回执被剥）：不出卡、不结算——无对象只认配置声明了 target:none 的变体', () => {
  const save = makeSave({ present: [WANG_ZHE], favor: { [WANG_ZHE]: 55 } });
  const bare = ticket('physical', 'attack', null);
  assert.equal(mods.plan.prepareFreeAction(save, bare).kind, 'blocked');
  const resolved = { id: 'j.fake', status: 'resolved', outcome: 'success' };
  assert.deepEqual(mods.settle.settleFreeAction(save, bare, resolved), { ok: false, reason: 'disabled', facts: [] });
  assert.equal(profileOf(save, WANG_ZHE).好感度, 55);
});

// ───────────── 失败余波的最终存档（第 2 步基线；第 3 步起由 settle.ts 按配置落账，最终结果不变，逐项见 freeActionMigration3.test.mjs） ─────────────

test('基线：有对象判定卡走完“确认 + 结算”后的存档——combat 类失败扣气血，所有非成功档写行动余波（第 3 步由旧引擎改为结算落账，结果与第 2 步一致）', () => {
  const run = (cls, variant, outcome, target = WANG_ZHE) => {
    const save = makeSave({ present: [target], favor: { [target]: 55 } });
    save.角色.属性.气血 = { 当前: 100, 上限: 100 };
    const { result } = runJudged(save, ticket(cls, variant, target), outcome);
    return { save, result, hp: save.角色.属性.气血.当前, gates: gateRows(save).map(row => [row.scope, row.outcome]) };
  };
  // physical（kind=combat）：partial / failure / critical_failure 扣 5% / 15% / 40%，另写余波
  assert.deepEqual([run('physical', 'attack', 'partial').hp, run('physical', 'attack', 'failure').hp, run('physical', 'attack', 'critical_failure').hp], [95, 85, 60]);
  assert.deepEqual(run('physical', 'attack', 'failure').gates, [['combat', 'failure']]);
  assert.deepEqual(run('physical', 'grab', 'failure').hp, 85);
  assert.deepEqual([run('physical', 'attack', 'success').hp, run('physical', 'attack', 'success').gates], [100, []]);
  // verbal.taunt（social）/ deceive（scheme）：不扣血，只写 social 余波
  assert.deepEqual([run('verbal', 'taunt', 'failure').hp, run('verbal', 'taunt', 'failure').gates], [100, [['social', 'failure']]]);
  assert.deepEqual(run('verbal', 'deceive', 'critical_failure').gates, [['social', 'failure']]);
});
