// 迁移第 3 步真机验收（2026-10-17）暴露的识别问题回归：solo / field / 传功 / 夺元的票绝大多数没出，双修长句被判成抓住/邀请，寒暄被记成调情。
// 根因在两处：模型常把变体名填进 actionId（票被整张不收），以及变体提示（hint）不够让模型认领。修在配置的 hint 和路由的 actionId 容错，不加拦截词，票据仍是 7 个 key。
// 这里用报告里的真实句子做意图输出模拟（mock 模型返回应有的变体），断言能出票、过闸门出判定卡、被正确归类，并断言 hint 含必要内容与体量。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { NING_YU, WANG_ZHE, makeSave, mods, profileOf, runJudged, ticket } from './freeActionFixture.mjs';

const router = mods.router;
const stub = reply => ({ generate: async () => reply });
const replyOf = (tickets, actionId = 'none') => JSON.stringify({ actionId, certainty: 'high', evidence: '', affinityDelta: 0, statusProposals: [], tickets });
const rawTicket = (actionClass, variant, targetId, evidence, extra = {}) => ({ actionClass, variant, targetId, degree: 'normal', performed: 'yes', evidence, itemId: null, ...extra });
const hintOf = (actionClass, variant) => mods.config.variantSpecOf(actionClass, variant).hint ?? '';
// 玩家内视初期；凝羽好感 100、王哲好感 53（报告里的乐明珠在夹具里没有关系记录，用王哲顶替，句子里只换名字）。
const base = (opts = {}) => makeSave({ realm: '内视', present: [NING_YU, WANG_ZHE], favor: { [NING_YU]: 100, [WANG_ZHE]: 53 }, ...opts });
const run = (save, text, reply) => router.resolveNaturalIntent({ saveData: save, playerText: text, selected: null, generate: stub(reply).generate });
const labelOf = t => `${t.actionClass}.${t.variant}`;

// 报告里的真实句子 → 模型应有的票。evidence 是原话里的连续片段。
const REAL = [
  ['solo 修炼①', '我盘膝坐下，运转九阳功修炼，吐纳天地灵气', rawTicket('solo', 'train', null, '运转九阳功修炼'), 'solo.train', null],
  ['solo 修炼②', '我静下心继续打坐修炼，积累修为', rawTicket('solo', 'train', null, '打坐修炼'), 'solo.train', null],
  ['solo 冲关①', '我感觉修为已满，尝试冲击下一境界，突破冲关', rawTicket('solo', 'breakthrough', null, '突破冲关'), 'solo.breakthrough', null],
  ['solo 冲关②', '我再次运功冲关，强行突破瓶颈', rawTicket('solo', 'breakthrough', null, '运功冲关'), 'solo.breakthrough', null],
  ['solo 调息①', '我调息吐纳，运功疗伤，调理身体', rawTicket('solo', 'recover', null, '调息吐纳'), 'solo.recover', null],
  ['solo 调息②', '我坐下来调息，缓缓平复气血', rawTicket('solo', 'recover', null, '调息'), 'solo.recover', null],
  ['field 逃跑①', '我拉着段强转身就跑，往反方向逃离', rawTicket('field', 'scene_act', null, '转身就跑'), 'field.scene_act', null],
  ['field 逃跑②', '我撒腿狂奔逃跑，甩开追兵', rawTicket('field', 'scene_act', null, '撒腿狂奔逃跑'), 'field.scene_act', null],
  ['field 潜行①', '我屏住呼吸，借着草丛的掩护悄悄潜行，躲开他们的视线', rawTicket('field', 'scene_act', null, '悄悄潜行'), 'field.scene_act', null],
  ['field 潜行②', '我放轻脚步，压低身子潜行绕到树影后面', rawTicket('field', 'scene_act', null, '潜行绕到树影后面'), 'field.scene_act', null],
  ['field 探索①', '我仔细探索四周，搜寻有没有线索或可用的东西', rawTicket('field', 'scene_act', null, '仔细探索四周'), 'field.scene_act', null],
  ['field 探索②', '我四处查看这片区域，探索周围的地形', rawTicket('field', 'scene_act', null, '探索周围的地形'), 'field.scene_act', null],
  ['传功①', '我向王哲传功', rawTicket('cast', 'transfer_qi', WANG_ZHE, '传功'), 'cast.transfer_qi', WANG_ZHE],
  ['传功②', '我给凝羽传功', rawTicket('cast', 'transfer_qi', NING_YU, '传功'), 'cast.transfer_qi', NING_YU],
  ['传功③', '我运功把自己的真气传给王哲，助她修炼', rawTicket('cast', 'transfer_qi', WANG_ZHE, '真气传给王哲'), 'cast.transfer_qi', WANG_ZHE],
  ['传功④', '我把真气传入凝羽体内，为她传功疗伤', rawTicket('cast', 'transfer_qi', NING_YU, '传功疗伤'), 'cast.transfer_qi', NING_YU],
  ['夺元·昏迷①', '我对昏迷的凝羽夺元，吸取她的真气修为', rawTicket('physical', 'drain_qi', NING_YU, '夺元'), 'physical.drain_qi', NING_YU],
  ['夺元·昏迷②', '我对昏迷不醒的凝羽使用夺元之法，单方面夺取她的元气', rawTicket('physical', 'drain_qi', NING_YU, '夺元之法'), 'physical.drain_qi', NING_YU],
  ['双修长句①', '我握住凝羽的手，邀请她与我双修，共同修炼', rawTicket('intimate', 'dual_cultivate', NING_YU, '邀请她与我双修'), 'intimate.dual_cultivate', NING_YU],
  ['双修长句②', '我与凝羽盘膝对坐，运转双修功法，请她与我双修', rawTicket('intimate', 'dual_cultivate', NING_YU, '请她与我双修'), 'intimate.dual_cultivate', NING_YU],
];
// 模型填 actionId 的三种写法：规范的 none、变体名、类.变体——后两种在真机上占约两成，修复前票会被整张丢掉。
const ACTION_ID_FORMS = [() => 'none', t => t.variant, t => `${t.actionClass}.${t.variant}`];

test('真实句子：模型无论把 actionId 填 none、变体名还是 类.变体，票都收下（票据仍是 7 个 key）', async () => {
  for (const [name, text, tk, label, target] of REAL) {
    for (const form of ACTION_ID_FORMS) {
      const save = base();
      const result = await run(save, text, replyOf([tk], form(tk)));
      assert.equal(result.kind, 'free', `${name} ${form(tk)}`);
      assert.equal(result.skipKeywordPreflight, true, name);
      assert.deepEqual(result.freeActionTickets?.map(labelOf), [label], `${name} actionId=${form(tk)}`);
      assert.equal(result.freeActionTickets[0].targetId, target, name);
      assert.deepEqual(Object.keys(result.freeActionTickets[0]).sort(), ['actionClass', 'degree', 'evidence', 'itemId', 'performed', 'targetId', 'variant'], name);
    }
  }
});

test('actionId 容错只认“不是任何候选的 id”：真候选 id 命中仍不收票；乱写 actionId 也只收过校验的票', async () => {
  const save = base();
  mods.diag.clearTicketDiscards();
  const text = '我盘膝坐下，运转九阳功修炼，吐纳天地灵气';
  const candidates = router.listNaturalIntentCandidates(save);
  const pick = candidates.find(c => c.eventId && c.source === 'event_engine');
  assert.ok(pick, '夹具里应有事件候选');
  const matched = await run(save, `我${pick.playerLine}`, JSON.stringify({ actionId: pick.actionId, source: pick.source, eventId: pick.eventId, contractHash: pick.contractHash, evidence: pick.playerLine.slice(0, 4), certainty: 'high', affinityDelta: 0, statusProposals: [], tickets: [rawTicket('solo', 'train', null, pick.playerLine.slice(0, 4))] }));
  assert.equal(matched.kind, 'matched');
  assert.equal(matched.freeActionTickets, undefined, '命中作者动作时不收票，避免同拍双结算');
  const bad = await run(save, text, replyOf([rawTicket('solo', 'train', null, '运转九阳功修炼', { power: 9 })], 'train'));
  assert.equal(bad.freeActionTickets, undefined);
  assert.ok(mods.diag.peekTicketDiscards().some(d => d.reason === 'extra_fields'), '票自己的校验照旧');
  const empty = await run(save, text, replyOf([], 'train'));
  assert.deepEqual([empty.kind, empty.freeActionTickets, empty.reason], ['free', undefined, 'unknown_action']);
});

test('闸门：自修（修炼、满血调息、气血 95 调息）与场面出判定卡；冲关时机未到被拦并给“未发生”事实', () => {
  for (const [label, tk] of [['修炼', ticket('solo', 'train', null)], ['调息', ticket('solo', 'recover', null)], ['场面', ticket('field', 'scene_act', null)]]) {
    const prepared = mods.plan.prepareFreeAction(base(), tk);
    assert.equal(prepared.kind, 'issued', label);
    assert.equal(prepared.proposal.target, undefined, label);
  }
  const hurt = base();
  hurt.角色.属性.气血 = { 当前: 95, 上限: 100 };
  assert.equal(mods.plan.prepareFreeAction(hurt, ticket('solo', 'recover', null)).kind, 'issued', '气血 95 也出卡');
  // 满血调息：闸门不拦；确认判定后旧引擎回血是空操作，气血不变也不报错
  const full = base();
  const { prepared, result } = runJudged(full, ticket('solo', 'recover', null), 'success');
  assert.equal(prepared.kind, 'issued');
  assert.equal(full.角色.属性.气血.当前, 100);
  assert.equal(result.ok, true);
  const early = mods.plan.prepareFreeAction(base(), ticket('solo', 'breakthrough', null));
  assert.deepEqual([early.kind, early.reason], ['refused', 'not_ready']);
  assert.match(early.facts[0], /境界进度还不到这一步/);
});

test('闸门：传功——好感 ≥ 20 且功力不低于对方才出判定卡；19 拒绝、没修为拒绝、对方不在场拒绝', () => {
  const tk = ticket('cast', 'transfer_qi', WANG_ZHE);
  assert.equal(mods.plan.prepareFreeAction(base(), tk).kind, 'issued');
  const low = base();
  profileOf(low, WANG_ZHE).好感度 = 19;
  assert.equal(mods.plan.prepareFreeAction(low, tk).reason, 'goodwill_below_min');
  profileOf(low, WANG_ZHE).好感度 = 20;
  assert.equal(mods.plan.prepareFreeAction(low, tk).kind, 'issued', '门槛是 20，不是 21');
  const fresh = base({ realm: undefined }); // 新档：无修为
  assert.equal(mods.plan.prepareFreeAction(fresh, tk).reason, 'level_too_low');
  const absent = makeSave({ realm: '内视', present: [NING_YU], favor: { [NING_YU]: 100 } });
  assert.equal(mods.plan.prepareFreeAction(absent, tk).reason, 'not_present');
});

test('闸门：夺元——目标昏迷且这一下夺得动才出判定卡；清醒 guard_up、功力差太大 drain_empty；目标进度条为 0 不再拦', () => {
  const tk = ticket('physical', 'drain_qi', NING_YU);
  const knocked = (progress, status = 'unconscious', opts = {}) => {
    const save = base(opts);
    profileOf(save, NING_YU).境界.当前进度 = progress;
    if (status) assert.ok(mods.actorStatus.applyActorStatus(save, NING_YU, status, { sourceId: 'test' }).ok);
    return save;
  };
  const issued = mods.plan.prepareFreeAction(knocked(50), tk);
  assert.equal(issued.kind, 'issued');
  assert.equal(issued.proposal.actionText, '对凝羽施行「夺元」（自由行动）');
  assert.equal(mods.plan.prepareFreeAction(knocked(50, null), tk).reason, 'guard_up');
  assert.equal(mods.plan.prepareFreeAction(knocked(0), tk).kind, 'issued', 'NPC 进度条为 0 也夺得动（可夺量不看对方现有进度）');
  // 第 40 章凝羽 4 级，玩家内视（1 级）：Δp = −3，比例压到 0 → 夺不动
  assert.equal(mods.plan.prepareFreeAction(knocked(50, 'unconscious', { chapter: 40 }), tk).reason, 'drain_empty');
});

test('双修长句：模型归 dual_cultivate 才出双修判定卡（kind=cultivate，不是抓住）；好感 59 被拒、60 出卡', async () => {
  for (const [name, text, tk] of REAL.filter(row => row[0].startsWith('双修长句'))) {
    const result = await run(base(), text, replyOf([tk]));
    const ticketOut = result.freeActionTickets[0];
    assert.equal(labelOf(ticketOut), 'intimate.dual_cultivate', name);
    const save = base();
    const prepared = mods.plan.prepareFreeAction(save, ticketOut);
    assert.equal(prepared.kind, 'issued', name);
    assert.equal(prepared.proposal.kind, 'cultivate', name);
    assert.equal(prepared.proposal.actionText, '对凝羽施行「双修」（自由行动）', name);
    const low = base();
    profileOf(low, NING_YU).好感度 = 59;
    assert.equal(mods.plan.prepareFreeAction(low, ticketOut).reason, 'goodwill_below_min', name);
    profileOf(low, NING_YU).好感度 = 60;
    assert.equal(mods.plan.prepareFreeAction(low, ticketOut).kind, 'issued', name);
  }
});

test('寒暄：模型不出票就什么都不结算——不记调情、不加好感；寒暄句和握手问候都不产生票', async () => {
  for (const text of ['我笑着对王哲说今晚月色真好', '我握住王哲的手，热情地寒暄几句', '我与王哲握手言和，约定明日再会']) {
    const save = base();
    const before = { favor: profileOf(save, WANG_ZHE).好感度, memory: structuredClone(profileOf(save, WANG_ZHE).记忆) };
    const result = await run(save, text, replyOf([]));
    assert.equal(result.freeActionTickets, undefined, text);
    assert.equal(profileOf(save, WANG_ZHE).好感度, before.favor, text);
    assert.deepEqual(profileOf(save, WANG_ZHE).记忆, before.memory, text);
  }
});

test('hint：每个出问题的变体都写明认领范围与边界，进入 intent 提示词的变体清单', () => {
  const section = mods.ticket.ticketPromptSection(base());
  const listed = Object.fromEntries(section.payload.classes.flatMap(c => c.variants.map(v => [`${c.actionClass}.${v.variant}`, v.hint ?? ''])));
  for (const [key, patterns] of Object.entries({
    'solo.train': [/不针对在场某人也出票/, /targetId填null/, /双修/, /传功/],
    'solo.breakthrough': [/不针对在场某人也出票/, /targetId填null/],
    'solo.recover': [/不针对在场某人也出票/, /targetId填null/, /满血也算/, /为他人疗伤不是本项/],
    'field.scene_act': [/不针对在场某人也出票/, /targetId填null/, /逃跑/, /潜行/, /探索/, /不算观察/],
    'cast.transfer_qi': [/传功/, /渡功/, /自愿/, /不是夺元/],
    'physical.drain_qi': [/昏迷/, /被制住/, /本地判定/, /传功/],
    'physical.grab': [/握手/, /牵手/, /亲近动作不算/],
    'intimate.flirt': [/明确/, /寒暄/, /月色/],
    'intimate.invite': [/双修属双修项/],
    'intimate.dual_cultivate': [/邀请对方双修/, /长句/, /必须有对象/, /独自修炼不是本项/],
  })) {
    assert.equal(listed[key], hintOf(...key.split('.')), `${key} 清单里的 hint 就是配置里的 hint`);
    for (const pattern of patterns) assert.match(listed[key], pattern, key);
  }
});

test('体量与格式：提示词主体一字不变（700 字）；变体清单比本次修复前增加不超过 200 字符；每条 hint ≤ 60 字；不加任何拦截词', () => {
  const section = mods.ticket.ticketPromptSection(base());
  assert.equal(section.system.length, 700, '不改提示词主体');
  const BEFORE_CLASSES_LENGTH = 1548; // 本次修复前（HEAD afaae50b）变体清单 JSON 的长度
  const grown = JSON.stringify(section.payload.classes).length - BEFORE_CLASSES_LENGTH;
  assert.ok(grown > 0 && grown <= 200, `变体清单增加 ${grown} 字符`);
  for (const row of mods.config.enabledVariants()) {
    const hint = hintOf(row.actionClass, row.variant);
    assert.ok(hint.length <= 60, `${row.actionClass}.${row.variant} hint ${hint.length} 字`);
  }
  const text = readFileSync(new URL('../mod-kit/game-numbers.qingyu.json', import.meta.url), 'utf8');
  assert.equal(text.includes('denyWords'), false, '没有 denyWords');
  const guarded = mods.config.enabledVariants().filter(row => mods.config.variantSpecOf(row.actionClass, row.variant).legacyGuardWords?.length);
  assert.deepEqual(guarded.map(row => `${row.actionClass}.${row.variant}`), ['cast.transfer_qi'], 'legacyGuardWords 仍只有传功');
  assert.deepEqual(mods.config.validateFreeActionConfig(), []);
  assert.deepEqual(mods.facts.validateFreeActionTexts(), []);
});

test('传功句仍归自由行动（不回落旧修炼预检）；出票后不再显示“没有识别出可结算的动作”', async () => {
  const text = '我给凝羽传功';
  assert.equal(router.freeActionOwnsText(base(), text), true);
  const result = await run(base(), text, replyOf([rawTicket('cast', 'transfer_qi', NING_YU, '传功')], 'transfer_qi'));
  assert.equal(result.freeActionTickets.length, 1);
  assert.equal(mods.plan.prepareFreeAction(base(), result.freeActionTickets[0]).kind, 'issued');
});
