// 2026-10-17 一批：玩家原文调试通道、传功让位旧关键词预检（词表走配置）、level_unknown 配置开关、
// 持久回执 / 背包事实 / “未发生”文案、护卫（shield）最小版。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DUAN_QIANG, NING_YU, WANG_ZHE, XIE_YI, itemEntry, load, makeSave, mods, profileOf, runJudged, runtimeOf, ticket } from './freeActionFixture.mjs';

const N = mods.numbers;
const router = mods.router;
const debug = await load('../src/modules/scenarioMods/freeAction/playerTextDebug.ts');
const guard = await load('../src/modules/scenarioMods/freeAction/legacyGuard.ts');
const preflight = await load('../src/utils/judgementPreflight.ts');
const { CONTENT_PACKS } = await load('../src/modules/contentPacks/index.ts');

const stub = reply => { const calls = []; return { calls, generate: async input => { calls.push(input); return typeof reply === 'function' ? reply(input) : reply; } }; };
const reply = (tickets, extra = {}) => JSON.stringify({ actionId: 'none', certainty: 'high', evidence: '', statusProposals: [], ...(tickets === undefined ? {} : { tickets }), ...extra });
const run = (saveData, playerText, generate) => router.resolveNaturalIntent({ saveData, playerText, selected: null, generate });
const patched = async (patch, restore, fn) => { N.applyGameNumbers(patch); try { return await fn(); } finally { N.applyGameNumbers(restore); } };
const debugOn = fn => patched({ freeAction: { debug: { playerTextLog: true } } }, { freeAction: { debug: { playerTextLog: false } } }, async () => { debug.clearPlayerTextDebug(); return fn(); });
const quiet = async fn => { const saved = console.info; console.info = () => {}; try { return await fn(); } finally { console.info = saved; } };
const TRANSFER_TEXT = '我向她传功，把自己的真气输送给她，助她修炼';

// ───────── 1 玩家原文调试通道 ─────────
test('D1 调试通道默认关闭：没出票的句子不留任何记录', async () => {
  debug.clearPlayerTextDebug();
  assert.equal(debug.playerTextDebugEnabled(), false);
  assert.equal(N.GAME_NUMBERS.freeAction.debug.playerTextLog, false, '默认值在配置里');
  await run(makeSave({ present: [WANG_ZHE] }), '我四下看看', stub(reply([])).generate);
  debug.notePlayerText(makeSave(), { site: 'ui_unhandled', text: '随便', reported: null, reasons: [] });
  assert.deepEqual(debug.peekPlayerTextDebug(), []);
});

test('D2 开关打开：没出票/归入其他的句子记下原文、模型报的类别、丢弃原因、当前场景；出了票不记', async () => {
  const save = makeSave({ present: [WANG_ZHE], favor: { [WANG_ZHE]: 55 } });
  await debugOn(async () => {
    await quiet(async () => {
      await run(save, '我四下看看', stub(reply([])).generate);
      await run(save, '我替王哲挡下这一刀', stub(reply([{ actionClass: 'other', variant: 'none', targetId: WANG_ZHE, degree: 'normal', performed: 'yes', evidence: '挡下这一刀', itemId: null }])).generate);
      await run(save, '我一刀砍向王哲', stub(reply([{ actionClass: 'physical', variant: 'attack', targetId: WANG_ZHE, degree: 'normal', performed: 'yes', evidence: '一刀砍向王哲', itemId: null }])).generate);
      await run(save, '我随口说句话', stub(reply(undefined)).generate);
    });
    const rows = debug.peekPlayerTextDebug();
    assert.deepEqual(rows.map(r => [r.site, r.text]), [
      ['ticket_validation', '我四下看看'], ['ticket_validation', '我替王哲挡下这一刀'], ['ticket_validation', '我随口说句话'],
    ], '出了票的第三句不记');
    assert.deepEqual([rows[0].reported, rows[0].reasons], [[], []]);
    assert.deepEqual([rows[1].reported, rows[1].reasons], [['other.none'], ['other_class']]);
    assert.deepEqual([rows[2].reported, rows[2].reasons], [null, ['tickets_field_missing']]);
    assert.deepEqual(rows[0].scene, { sceneActive: false, sceneId: null, activeEventIds: ['lcq.event.s01_02'] });
  });
});

test('D3 候选被否决时模型报的票按设计不收：只在调试通道留 tickets_not_collected，行为不变', async () => {
  const save = makeSave({ present: [WANG_ZHE] });
  // 报一个真实存在的候选 id，但证据对不上原话：候选被否决（不是乱写的 actionId——乱写的 id 等于没命中作者动作，票照收，见 freeActionIntentHints.test.mjs）
  const pick = router.listNaturalIntentCandidates(save).find(c => c.eventId && c.source === 'event_engine');
  assert.ok(pick, '夹具里应有事件候选');
  const bad = reply([{ actionClass: 'physical', variant: 'attack', targetId: WANG_ZHE, degree: 'normal', performed: 'yes', evidence: '一刀砍向王哲', itemId: null }], { actionId: pick.actionId, source: pick.source, eventId: pick.eventId, evidence: '对不上的话' });
  const withLog = await debugOn(() => quiet(async () => {
    const result = await run(save, '我一刀砍向王哲', stub(bad).generate);
    const rows = debug.peekPlayerTextDebug();
    assert.deepEqual(rows.map(r => [r.site, r.reported, r.reasons]), [['tickets_not_collected', ['physical.attack'], ['bad_evidence']]]);
    return result;
  }));
  const without = await quiet(() => run(save, '我一刀砍向王哲', stub(bad).generate));
  assert.deepEqual(withLog, without, '开不开日志，路由结果逐字相同');
  assert.equal(withLog.freeActionTickets, undefined);
});

test('D4 调试通道与 noteTicketDiscard 互相独立：票丢弃日志仍不含原文；环形缓冲条数与截取字数走配置', async () => {
  mods.diag.clearTicketDiscards();
  await debugOn(async () => {
    await quiet(() => run(makeSave({ present: [WANG_ZHE] }), '我四下看看', stub(reply([])).generate));
    assert.equal(debug.peekPlayerTextDebug().length, 1);
    assert.equal(JSON.stringify(mods.diag.peekTicketDiscards()).includes('四下'), false);
    await patched({ freeAction: { debug: { keep: 2, textChars: 3 } } }, { freeAction: { debug: { keep: 50, textChars: 200 } } }, async () => {
      for (const text of ['一二三四五', '甲乙丙丁戊', '子丑寅卯辰']) debug.notePlayerText(null, { site: 'ui_unhandled', text, reported: null, reasons: [] });
      assert.deepEqual(debug.peekPlayerTextDebug().map(r => r.text), ['甲乙丙', '子丑寅']);
    });
  });
});

test('D5 界面接线：自由输入没被自由行动接管时记 ui_unhandled（覆盖不调模型的分支）', async () => {
  const source = await readFile(new URL('../src/components/dashboard/MainGamePanel.vue', import.meta.url), 'utf8');
  assert.match(source, /!freeActionHandled && intentRoute\) \{\s*notePlayerText\(saveData, \{ site: 'ui_unhandled'/);
  // 不调模型的分支（试玩范围外 / 修炼句无 generate）返回 free，界面据此记录。
  const outside = await run({}, '我随口一说', undefined);
  assert.equal(outside.kind, 'free');
  assert.equal(outside.usedModel, false);
});

// ───────── 2 传功不回落旧 cultivate 预检（词表走配置）─────────
test('L1 词表在配置里：含词即归传功变体；改配置词表就改判定，代码里没有词', async () => {
  assert.deepEqual(guard.freeActionOwnerOf(TRANSFER_TEXT), { actionClass: 'cast', variant: 'transfer_qi' });
  assert.equal(guard.freeActionOwnerOf('我闭关修炼'), undefined);
  assert.equal(guard.freeActionOwnerOf('我运功疗伤'), undefined);
  await patched(
    { freeAction: { classes: { cast: { variants: { transfer_qi: { legacyGuardWords: ['甲乙'] } } } } } },
    { freeAction: { classes: { cast: { variants: { transfer_qi: { legacyGuardWords: N.GAME_NUMBERS.freeAction.classes.cast.variants.transfer_qi.legacyGuardWords.slice() } } } } } },
    () => { assert.equal(guard.freeActionOwnerOf('我传功'), undefined); assert.ok(guard.freeActionOwnerOf('我甲乙')); },
  );
  assert.ok(guard.freeActionOwnerOf('我传功'), '已还原');
  const source = await readFile(new URL('../src/modules/scenarioMods/freeAction/legacyGuard.ts', import.meta.url), 'utf8');
  assert.equal(/传功|渡功|真气/.test(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), false, '代码里没有硬编码的传功词');
});

test('L2 对照：旧关键词预检确实会把“传功…修炼”判成玩家自己的 cultivate（所以必须让位）', () => {
  const save = makeSave({ present: [NING_YU] });
  const proposal = preflight.buildLocalJudgementPreflight(TRANSFER_TEXT, save, 1);
  assert.equal(proposal?.kind, 'cultivate');
});

test('L3 路由：试玩范围内含传功词的句子——无票 / 识别失败 / 无 generate 都不回落旧预检；修炼句识别成功就不落旧预检，没有模型才保持旧行为', async () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 } });
  await quiet(async () => {
    const none = await run(save, TRANSFER_TEXT, stub(reply([])).generate);
    assert.deepEqual([none.kind, none.skipKeywordPreflight, none.freeActionTickets], ['free', true, undefined]);
    // 识别失败：固定事件链上和其它句子一样 hold（输入保留，不叙事、不结算），不回落旧预检
    const bad = await run(save, TRANSFER_TEXT, stub('不是 JSON').generate);
    assert.deepEqual([bad.kind, bad.hold, bad.skipKeywordPreflight], ['failed', true, true]);
    const boom = await run(save, TRANSFER_TEXT, async () => { throw new Error('x'); });
    assert.deepEqual([boom.kind, boom.hold, boom.skipKeywordPreflight], ['failed', true, true]);
    // 没有合同候选时的降级：原话归传功变体 → 不回落（旧预检会把它判成自修）；不归任何变体 → 回落旧预检
    const gone = [{ source: 'open_world_engine', actionId: 'walk', label: '去点心铺' }];
    const ownedDegraded = router.onClassifierFailure('malformed', gone, true);
    assert.deepEqual([ownedDegraded.skipKeywordPreflight, ownedDegraded.unsettled], [true, true]);
    const noModel = await router.resolveNaturalIntent({ saveData: save, playerText: TRANSFER_TEXT, selected: null });
    assert.deepEqual([noModel.usedModel, noModel.skipKeywordPreflight], [false, true]);
    // 不含传功词的修炼句：识别成功（含空票）不再落旧预检；没有模型时仍是旧行为
    const self = await run(save, '我闭关修炼', stub(reply([])).generate);
    assert.deepEqual([self.skipKeywordPreflight, self.usedModel], [true, true]);
    const selfNoModel = await router.resolveNaturalIntent({ saveData: save, playerText: '我闭关修炼', selected: null });
    assert.equal(selfNoModel.skipKeywordPreflight, false);
  });
});

test('L4 范围：自由行动关闭或存档不在试玩范围时不让位（旧行为原样）', async () => {
  const save = makeSave({ present: [NING_YU] });
  assert.equal(router.freeActionOwnsText(save, TRANSFER_TEXT), true);
  assert.equal(router.freeActionOwnsText({}, TRANSFER_TEXT), false);
  assert.equal(router.freeActionOwnsText(null, TRANSFER_TEXT), false);
  await patched({ freeAction: { enabled: false } }, { freeAction: { enabled: true } }, () => assert.equal(router.freeActionOwnsText(save, TRANSFER_TEXT), false));
});

test('L5 界面：传功语义句即使带修炼词也跳过旧预检；有票走自己的结算，不改玩家境界', async () => {
  const source = await readFile(new URL('../src/components/dashboard/MainGamePanel.vue', import.meta.url), 'utf8');
  assert.match(source, /skipPreflight: [^\n]*freeActionHandled \|\| ownedByFreeAction \|\|/);
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 }, chapter: 40, realm: mods.realm.levelName(4) });
  const mine = JSON.stringify(save.角色.属性.境界);
  const { prepared, result } = runJudged(save, ticket('cast', 'transfer_qi', NING_YU), 'success');
  assert.notEqual(prepared.proposal.kind, 'cultivate');
  assert.equal(prepared.proposal.actionText.includes('修炼'), false);
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(save.角色.属性.境界), mine, '玩家自己的境界一个字没动');
});

// ───────── level_unknown ─────────
test('U1 level_unknown：默认放行（assume_equal，只看好感）；改成 deny 回到拒绝；功力为零仍拒，没进度条的目标由预算检查兜底', async () => {
  const save = () => makeSave({ present: [NING_YU], favor: { [DUAN_QIANG]: 60 }, chapter: 40, realm: mods.realm.levelName(4) });
  assert.equal(mods.config.variantSpecOf('cast', 'transfer_qi').requires.onLevelUnknown, 'assume_equal', '默认值在配置里');
  assert.equal(mods.plan.prepareFreeAction(save(), ticket('cast', 'transfer_qi', DUAN_QIANG)).kind, 'issued');
  const noTrack = save();
  profileOf(noTrack, DUAN_QIANG).境界.下一级所需 = 0;
  assert.equal(mods.plan.prepareFreeAction(noTrack, ticket('cast', 'transfer_qi', DUAN_QIANG)).reason, 'budget_full', '没处落地：不是 level_unknown');
  const weak = makeSave({ favor: { [DUAN_QIANG]: 60 }, realm: '无修为' });
  assert.equal(mods.plan.prepareFreeAction(weak, ticket('cast', 'transfer_qi', DUAN_QIANG)).reason, 'level_too_low');
  const set = value => ({ freeAction: { classes: { cast: { variants: { transfer_qi: { requires: { onLevelUnknown: value } } } } } } });
  await patched(set('deny'), set('assume_equal'), () => {
    assert.equal(mods.plan.prepareFreeAction(save(), ticket('cast', 'transfer_qi', DUAN_QIANG)).reason, 'level_unknown');
    const noTrackDeny = save();
    profileOf(noTrackDeny, DUAN_QIANG).境界.下一级所需 = 0;
    assert.equal(mods.plan.prepareFreeAction(noTrackDeny, ticket('cast', 'transfer_qi', DUAN_QIANG)).reason, 'level_unknown');
  });
  assert.equal(mods.plan.prepareFreeAction(save(), ticket('cast', 'transfer_qi', DUAN_QIANG)).kind, 'issued', '已还原');
  assert.deepEqual(mods.config.validateFreeActionConfig(), []);
});

test('U1b 传功好感门槛：低于 requires.minGoodwill 拒绝（先于级数检查，含级数不明的目标），恰好等于放行；门槛是配置', async () => {
  const spec = mods.config.variantSpecOf('cast', 'transfer_qi');
  assert.equal(spec.requires.minGoodwill, 20, '默认门槛在配置里');
  const build = (favor, id = NING_YU) => makeSave({ present: [NING_YU], favor: { [id]: favor }, chapter: 40, realm: mods.realm.levelName(4) });
  for (const id of [NING_YU, DUAN_QIANG]) {
    const low = build(spec.requires.minGoodwill - 1, id), before = structuredClone(low);
    const refused = mods.plan.prepareFreeAction(low, ticket('cast', 'transfer_qi', id));
    assert.deepEqual([refused.kind, refused.reason], ['refused', 'goodwill_below_min'], id);
    assert.match(refused.facts[0], /交情未到/);
    assert.deepEqual(low, before, '零写入');
    assert.equal(mods.plan.prepareFreeAction(build(spec.requires.minGoodwill, id), ticket('cast', 'transfer_qi', id)).kind, 'issued', `${id} 恰好等于门槛放行`);
  }
  const set = value => ({ freeAction: { classes: { cast: { variants: { transfer_qi: { requires: { minGoodwill: value } } } } } } });
  await patched(set(5), set(spec.requires.minGoodwill), () => {
    assert.equal(mods.plan.prepareFreeAction(build(10), ticket('cast', 'transfer_qi', NING_YU)).kind, 'issued');
    assert.equal(mods.plan.prepareFreeAction(build(4), ticket('cast', 'transfer_qi', NING_YU)).reason, 'goodwill_below_min');
  });
  assert.equal(mods.plan.prepareFreeAction(build(spec.requires.minGoodwill - 1), ticket('cast', 'transfer_qi', NING_YU)).reason, 'goodwill_below_min', '已还原');
});

test('U1c 传功级别：目标级别已知且高于玩家 → 拒绝（level_too_low）；同级或更低按原规则放行', () => {
  const at = realmName => makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 }, chapter: 40, realm: realmName }); // 凝羽此时第 4 级
  const higher = at(mods.realm.levelName(3)), before = structuredClone(higher);
  const refused = mods.plan.prepareFreeAction(higher, ticket('cast', 'transfer_qi', NING_YU));
  assert.deepEqual([refused.kind, refused.reason], ['refused', 'level_too_low']);
  assert.deepEqual(higher, before, '零写入');
  assert.equal(mods.plan.prepareFreeAction(at(mods.realm.levelName(4)), ticket('cast', 'transfer_qi', NING_YU)).kind, 'issued', '同级');
  assert.equal(mods.plan.prepareFreeAction(at(mods.realm.levelName(5)), ticket('cast', 'transfer_qi', NING_YU)).kind, 'issued', '更低');
});

test('U2 配置体检：onLevelUnknown / minGoodwill / legacyGuardWords / applyStatus 缺项 / debug 无效值都点名', () => {
  const cfg = structuredClone(mods.config.freeActionConfig());
  cfg.classes.cast.variants.transfer_qi.requires.onLevelUnknown = 'sometimes';
  cfg.classes.cast.variants.transfer_qi.legacyGuardWords = ['传功', ''];
  cfg.classes.cast.variants.transfer_qi.requires.minGoodwill = 'high';
  cfg.classes.guard.variants.shield.enabled = true; // 默认关闭；开着才查 applyStatus 缺项
  cfg.classes.guard.variants.shield.statusId = 'no.such.status';
  cfg.classes.guard.variants.shield.maxStatusMinutes = 0;
  cfg.debug.keep = 0;
  const errors = mods.config.validateFreeActionConfig(cfg).join('\n');
  for (const part of ['onLevelUnknown 无效', 'minGoodwill', 'legacyGuardWords', 'statusId 不在状态目录', 'maxStatusMinutes', 'debug 配置无效']) assert.ok(errors.includes(part), part);
  cfg.classes.cast.variants.transfer_qi.requires.minGoodwill = 101;
  assert.ok(mods.config.validateFreeActionConfig(cfg).some(e => e.includes('minGoodwill')), '越界也点名');
});

// ───────── 回执 / 背包事实 / 文案 ─────────
test('R1 回执：被拒 / 给予成功 / 到顶轻回执 / 其他 各一条持久文案，来自 texts；无内容不出', () => {
  const lines = mods.facts.renderReceipts({ refused: ['甲没成', '甲没成', '乙没成'], given: ['丙收下了'], others: 2, affinity: ['已到顶', '已到顶'] });
  assert.deepEqual(lines, [
    CONTENT_PACKS.texts['free.receipt.refused'].replace('{facts}', '甲没成 乙没成'),
    CONTENT_PACKS.texts['free.receipt.given'].replace('{facts}', '丙收下了'),
    CONTENT_PACKS.texts['free.receipt.affinity'].replace('{facts}', '已到顶'),
    CONTENT_PACKS.texts['free.receipt.other'],
  ]);
  assert.deepEqual(mods.facts.renderReceipts({ refused: [], given: [], others: 0 }), []);
});

test('R2 界面：回执是持久元素而不是 toast（被拒事实不再走 toast.info）；到顶轻回执走 affinity.lightReceipt', async () => {
  const source = await readFile(new URL('../src/components/dashboard/MainGamePanel.vue', import.meta.url), 'utf8');
  assert.match(source, /data-testid="free-action-receipt"/);
  assert.match(source, /freeActionReceipts\.value = renderReceipts\(/);
  assert.match(source, /affinity\.lightReceipt/);
  assert.match(source, /affinityNotes/);
  assert.equal(/toast\.\w+\([^)]*freeActionRefusedFacts/.test(source), false);
});

test('R3 给予成功的回执来自配置的类归类（classes.give.receipt），被拒的赠物进 refusedFacts；回合结算返回 givenFacts', () => {
  const ITEM = 'test.item.gift';
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 30 }, items: { [ITEM]: itemEntry(ITEM, { 数量: 2 }) } });
  const ok = mods.turn.settleFreeActionTurn(save, [ticket('give', 'gift', NING_YU, { itemId: ITEM })], undefined);
  assert.equal(ok.givenFacts.length, 1);
  assert.match(ok.givenFacts[0], /送给/);
  assert.deepEqual(ok.refusedFacts, []);
  const none = mods.turn.settleFreeActionTurn(save, [ticket('give', 'gift', NING_YU, { itemId: null })], undefined);
  assert.deepEqual(none.givenFacts, []);
  assert.equal(none.refusedFacts.length, 1);
  const replay = mods.turn.settleFreeActionTurn(save, [ticket('give', 'gift', NING_YU, { itemId: ITEM })], undefined);
  assert.deepEqual(replay.givenFacts, [], '同键重放不再报“已给出”');
});

test('R4 other：模型明确报“其他”（performed=yes）计数，路由带出 freeActionOthers；no/unclear 与普通无票不计', async () => {
  const save = makeSave({ present: [WANG_ZHE] });
  const other = (performed = 'yes') => ({ actionClass: 'other', variant: 'none', targetId: null, degree: 'normal', performed, evidence: '挡下这一刀', itemId: null });
  assert.equal(mods.ticket.validateFreeActionTickets([other()], '我替他挡下这一刀', save).others, 1);
  assert.equal(mods.ticket.validateFreeActionTickets([other('no')], '我替他挡下这一刀', save).others, 0);
  const result = await run(save, '我替他挡下这一刀', stub(reply([other()])).generate);
  assert.equal(result.freeActionOthers, 1);
  assert.equal((await run(save, '我四下看看', stub(reply([])).generate)).freeActionOthers, undefined);
});

test('R5 背包事实：增减对照结算前快照；无增减时明说没有易手；列出的种数走配置', () => {
  const A = 'test.item.a', B = 'test.item.b';
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 30 }, items: { [A]: itemEntry(A, { 数量: 2, 名称: '甲丹' }), [B]: itemEntry(B, { 名称: '乙符' }) } });
  const before = mods.facts.inventoryCounts(save);
  const unchanged = mods.facts.renderInventoryBlock(before, save);
  assert.match(unchanged, /背包事实/);
  assert.match(unchanged, /没有让背包物品增减/);
  assert.match(unchanged, /甲丹×2、乙符×1/);
  mods.settle.settleFreeAction(save, ticket('give', 'gift', NING_YU, { itemId: A }));
  const changed = mods.facts.renderInventoryBlock(before, save);
  assert.match(changed, /失去甲丹×1/);
  assert.match(changed, /甲丹×1、乙符×1/);
  return patched({ freeAction: { narration: { inventoryListMax: 1 } } }, { freeAction: { narration: { inventoryListMax: 8 } } }, () => {
    assert.equal(mods.facts.renderInventoryBlock(before, save).includes('乙符×1'), false, '只列配置允许的种数');
  });
});

test('R6 文案：被拒块带“不得写成已成”，已结算块逐字不变；新增文案齐全，体检为空', () => {
  assert.equal(mods.facts.renderSettledBlock(['甲', '乙']), '\n【本地自由行动已结算】甲；乙。好感与记忆已由本地写入，只演出这些既定事实，不得另行增减好感、写入记忆或杜撰额外后果。\n');
  const refused = mods.facts.renderRefusedBlock(['甲']);
  assert.match(refused, /^\n【本地自由行动未发生】甲。/);
  assert.match(refused, /不得写成对方已经收下、已经生效或已经成功/);
  assert.deepEqual(mods.facts.validateFreeActionTexts(), []);
  for (const reason of ['unrecognized', 'dropped']) assert.ok(mods.facts.GATE_REASONS.includes(reason) && CONTENT_PACKS.texts[`free.fact.gate.${reason}`]);
});

test('R7 同目标被挤掉的第二张票：留一行“未发生”事实（以前只丢弃，叙事会照写成功）', () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 } });
  const kiss = { actionClass: 'intimate', variant: 'kiss', targetId: NING_YU, degree: 'normal', performed: 'yes', evidence: '吻了她', itemId: null };
  const flirt = { ...kiss, variant: 'flirt', evidence: '逗她' };
  const out = mods.ticket.validateFreeActionTickets([flirt, kiss], '我逗她，又吻了她', save);
  assert.equal(out.tickets.length, 1);
  assert.deepEqual(out.discards.map(d => d.reason), ['duplicate_target']);
  assert.equal(out.refusals.length, 1);
  assert.match(out.refusals[0], /另一个动作没能落实/);
});

// ───────── 护卫（shield）最小版（默认关闭：配置 enabled:false；代码、文案、状态保留，这些用例临时打开它）─────────
const shieldOn = fn => patched({ freeAction: { classes: { guard: { variants: { shield: { enabled: true } } } } } }, { freeAction: { classes: { guard: { variants: { shield: { enabled: false } } } } } }, fn);
const withNing = (extra = {}) => makeSave({ present: [NING_YU], favor: { [NING_YU]: 30 }, ...extra });
const guarded = (save, id) => mods.statusRead.actorStatusRecords(save, id).filter(row => row.statusId === 'guarded');

test('G1 护卫：在场者被挂“受护卫”限时状态（时长走配置），不掷骰、不耗物、好感按配置、事实与记忆来自 texts', async () => {
  await shieldOn(async () => {
    const save = withNing();
    const now = mods.injuries.sceneTime(save);
    const spec = mods.config.variantSpecOf('guard', 'shield');
    assert.equal(spec.route, 'table');
    const prepared = mods.plan.prepareFreeAction(save, ticket('guard', 'shield', NING_YU));
    assert.equal(prepared.kind, 'settled');
    assert.equal(prepared.result.resultKey, 'done');
    const rows = guarded(save, NING_YU);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].expiresAt, now + spec.maxStatusMinutes, '时长取 maxStatusMinutes 配置');
    assert.equal(rows[0].sourceScene.startsWith('free:'), true);
    assert.match(prepared.result.facts[0], /护在.*身侧/);
    assert.equal(profileOf(save, NING_YU).好感度, 30 + spec.base);
    assert.equal(mods.state.readFreeActionState(save).log.at(-1).variant, 'shield');
  });
});

test('G2 护卫的时长是配置：改配置就改状态时长；再护一次是刷新而不是叠加', async () => {
  const set = minutes => ({ freeAction: { classes: { guard: { variants: { shield: { maxStatusMinutes: minutes } } } } } });
  await shieldOn(async () => {
    const save = withNing();
    const now = mods.injuries.sceneTime(save);
    await patched(set(30), set(120), () => {
      mods.plan.prepareFreeAction(save, ticket('guard', 'shield', NING_YU));
      assert.equal(guarded(save, NING_YU)[0].expiresAt, now + 30);
    });
    mods.state.writableFreeActionState(save).settled = {};
    mods.settle.settleFreeAction(save, ticket('guard', 'shield', NING_YU), undefined);
    assert.equal(guarded(save, NING_YU).length, 1);
  });
});

test('G3 护卫要求对象在场：不在场、是玩家自己、场面进行中 → 拒绝，零写入', async () => {
  await shieldOn(async () => {
    const absent = makeSave({ favor: { [NING_YU]: 30 } });
    const before = JSON.stringify(absent);
    const refused = mods.plan.prepareFreeAction(absent, ticket('guard', 'shield', NING_YU));
    assert.deepEqual([refused.kind, refused.reason], ['refused', 'not_present']);
    assert.equal(JSON.stringify(absent), before);
    const save = withNing();
    const self = mods.plan.prepareFreeAction(save, ticket('guard', 'shield', runtimeOf(save).opening.playerCharacterId));
    assert.deepEqual([self.kind, self.reason], ['refused', 'not_present']);
  });
});

test('G4 护卫不是必活保护：两套机制各管各的——shield 行没有 protectedCap/protectedForbid，必活目标照样能被护，且攻击钳制仍只看总表', async () => {
  await shieldOn(async () => {
    const spec = mods.config.variantSpecOf('guard', 'shield');
    assert.equal(spec.protectedCap, undefined);
    assert.equal(spec.protectedForbid, undefined);
    const save = makeSave({ present: [WANG_ZHE], favor: { [WANG_ZHE]: 55 } });
    assert.equal(mods.plan.prepareFreeAction(save, ticket('guard', 'shield', WANG_ZHE)).kind, 'settled');
    assert.equal(guarded(save, WANG_ZHE).length, 1);
    const { result } = runJudged(save, ticket('physical', 'attack', WANG_ZHE), 'perfect');
    assert.equal(result.resultKey, 'wound', '必活钳制（subdue→wound）不受“受护卫”状态影响');
    const status = CONTENT_PACKS.statuses.find(def => def.id === 'guarded');
    assert.ok(status && status.effects.every(effect => effect.kind === 'note'), '状态只记，不带任何数值效果');
  });
});

test('G5 护卫默认关闭：配置 enabled:false，提示词里不列护卫类/变体，模型报票被丢弃（variant_disabled）；代码、文案、状态仍在', () => {
  const spec = mods.config.variantSpecOf('guard', 'shield');
  assert.equal(N.GAME_NUMBERS.freeAction.classes.guard.variants.shield.enabled, false, '默认值在配置里');
  assert.equal(spec.enabled, false);
  assert.deepEqual(mods.config.enabledVariants().filter(row => row.actionClass === 'guard'), []);
  const save = withNing();
  const section = mods.ticket.ticketPromptSection(save);
  assert.equal(section.payload.classes.some(c => c.actionClass === 'guard'), false);
  assert.equal(/shield|guard|护住|护卫/.test(JSON.stringify(section)), false, '提示词里不再出现护卫');
  const raw = [{ actionClass: 'guard', variant: 'shield', targetId: NING_YU, degree: 'normal', performed: 'yes', evidence: '护住宁羽', itemId: null }];
  const out = mods.ticket.validateFreeActionTickets(raw, '我护住宁羽', save);
  assert.equal(out.tickets.length, 0);
  assert.deepEqual(out.discards.map(d => d.reason), ['variant_disabled']);
  assert.ok(CONTENT_PACKS.texts['free.fact.shield.done'] && CONTENT_PACKS.texts['free.memory.shield.done'], '文案保留');
  assert.ok(CONTENT_PACKS.statuses.some(def => def.id === 'guarded'), '状态保留');
  assert.deepEqual(mods.config.validateFreeActionConfig(), []);
  assert.deepEqual(mods.facts.validateFreeActionTexts(), []);
});

test('G6 打开护卫后提示词列出它；体检（配置 + 文本）为空，缺文案点名', async () => {
  await shieldOn(async () => {
    const section = mods.ticket.ticketPromptSection(withNing());
    const guardClass = section.payload.classes.find(c => c.actionClass === 'guard');
    assert.deepEqual(guardClass.variants.map(v => v.variant), ['shield']);
    assert.deepEqual(mods.config.validateFreeActionConfig(), []);
    assert.deepEqual(mods.facts.validateFreeActionTexts(), []);
    const texts = { ...CONTENT_PACKS.texts };
    delete texts['free.memory.shield.done'];
    assert.ok(mods.facts.validateFreeActionTexts(texts).some(e => e.includes('free.memory.shield.done')), '缺文案体检点名');
  });
});
