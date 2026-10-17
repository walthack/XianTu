// 迁移第 3 步：启用 solo/field、旧预检让位、旧引擎未声明效果（失败扣血 / 行动余波）并入配置与 settle.ts、
// 双修走 intimate 并带对象（好感门槛读配置）、技能/天赋按行动类匹配。
// 数值按配置取值断言；改配置的用例结束时还原。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { NING_YU, WANG_ZHE, load, makeSave, mods, profileOf, runJudged, runtimeOf, ticket } from './freeActionFixture.mjs';

const preflight = await load('../src/utils/judgementPreflight.ts');
const { CONTENT_PACKS } = await load('../src/modules/contentPacks/index.ts');
const skillMatch = await load('../src/modules/scenarioMods/freeAction/skillMatch.ts');

const cfg = () => mods.config.freeActionConfig();
const N = () => mods.numbers.GAME_NUMBERS;
const patch = (patchValue, fn, restoreValue) => {
  mods.numbers.applyGameNumbers(patchValue);
  try { return fn(); } finally { mods.numbers.applyGameNumbers(restoreValue); }
};
const gateRows = save => save.系统?.扩展?.行动门控?.recent ?? [];
const effectNames = save => (save.角色.效果 || []).map(e => e.状态名称);
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const stripComments = code => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function hpSave({ target = WANG_ZHE, hp = 100, favor = 55 } = {}) {
  const save = makeSave({ present: [target], favor: { [target]: favor } });
  save.角色.属性.气血 = { 当前: hp, 上限: 100 };
  return save;
}
const issue = (save, tk) => mods.plan.prepareFreeAction(save, tk);
const confirm = (save, id, outcome) => mods.judgement.resolvePendingJudgement(save, id, { currentTurn: 1, testOutcome: outcome });

// ───────────── 1) 启用 solo / field ─────────────

test('1 启用：solo / field 配置里 enabled=true，进提示词；无拦截词（denyWords 不存在，legacyGuardWords 只留传功那一处）', () => {
  for (const name of ['solo', 'field']) {
    assert.equal(cfg().classes[name].defaults.enabled, true, name);
    for (const row of Object.values(cfg().classes[name].variants)) assert.equal(row.legacyGuardWords, undefined, `${name} 不加拦截词`);
  }
  const guards = [], deny = [];
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'legacyGuardWords') guards.push(path);
      if (/denyWords/i.test(key)) deny.push(`${path}.${key}`);
      walk(value, `${path}.${key}`);
    }
  };
  walk(cfg(), 'freeAction');
  assert.deepEqual(guards, ['freeAction.classes.cast.variants.transfer_qi']);
  assert.deepEqual(deny, []);
  const classes = mods.ticket.ticketPromptSection(makeSave({ present: [WANG_ZHE] })).payload.classes.map(row => row.actionClass);
  assert.ok(classes.includes('solo') && classes.includes('field'));
});

// ───────────── 2) 让位规则 ─────────────

test('2 界面：修炼词例外已删——意图模型返回结果（含空票）就跳过旧预检；识别失败回落旧预检但仍告诉叙事“未发生”', async () => {
  const source = await read('../src/components/dashboard/MainGamePanel.vue');
  const line = source.split('\n').find(row => /skipPreflight: execution\?\.skipPreflight/.test(row));
  assert.ok(line, '找到跳过旧预检的判断行');
  assert.match(line, /freeActionHandled \|\| ownedByFreeAction \|\| skipKeywordPreflightFromIntent,/);
  assert.doesNotMatch(line, /练功|修炼|闭关|冲关/, '修炼词不再是例外');
  assert.match(source, /let intentFailedOpen = false;/);
  assert.match(source, /freeActionHandled = routedFreeActionTickets\.length > 0 \|\| \(freeActionRefusalBlock !== '' && !intentFailedOpen\)/);
});

test('2 路由：修炼句识别成功（含空票）skip=true；非试玩存档 / 自由行动关闭 / 没有模型才保持旧预检（不调模型）', async () => {
  const router = mods.router;
  const reply = tickets => JSON.stringify({ actionId: 'none', certainty: 'high', evidence: '', statusProposals: [], tickets });
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 } });
  for (const text of ['我闭关修炼', '我独自练功', '我准备冲关，冲击境界']) {
    const calls = [];
    const result = await router.resolveNaturalIntent({ saveData: save, playerText: text, selected: null, generate: async input => { calls.push(input); return reply([]); } });
    assert.deepEqual([result.kind, result.skipKeywordPreflight, result.usedModel, calls.length], ['free', true, true, 1], text);
  }
  // 非试玩存档：旧预检是唯一判定来源，修炼句不调模型、不让位
  const plain = makeSave({ present: [NING_YU] });
  for (const p of CONTENT_PACKS.playtests) delete plain.系统.扩展?.[p.extensionKey];
  const calls = [];
  const legacy = await router.resolveNaturalIntent({ saveData: plain, playerText: '我闭关修炼', selected: null, generate: async () => { calls.push(1); return reply([]); } });
  assert.deepEqual([legacy.kind, legacy.skipKeywordPreflight, legacy.usedModel, calls.length], ['free', false, false, 0]);
  // 识别失败（无合同候选的降级）：回落旧预检，除非原话归自由行动变体
  const failed = router.onClassifierFailure('classifier_error', [{ source: 'open_world_engine', actionId: 'walk', label: '去点心铺' }]);
  assert.deepEqual([failed.skipKeywordPreflight, failed.unsettled], [false, true]);
  assert.equal(router.onClassifierFailure('classifier_error', [{ source: 'open_world_engine', actionId: 'walk', label: '去点心铺' }], true).skipKeywordPreflight, true);
  // 路由里没有给 solo / field 加词
  const code = stripComments(await read('../src/modules/scenarioMods/naturalIntentRouter.ts'));
  assert.doesNotMatch(code, /isTrainingText|modelTicketsTraining/);
});

// ───────────── 3) 失败余波：气血 + 行动门控 ─────────────

test('3 配置：余波数值、范围、条数全在 game-numbers.freeAction.aftermath；引擎与结算代码里没有写死', async () => {
  const { hpLoss, gate } = cfg().aftermath;
  assert.deepEqual(hpLoss, { kinds: ['combat'], ratio: { partial: 0.05, failure: 0.15, critical_failure: 0.4 }, minLoss: 1, keepHp: 1 });
  assert.deepEqual(gate, {
    ttlTurns: 3, labelChars: 48, defaultScope: 'scene',
    scopeByKind: { combat: 'combat', escape: 'combat', social: 'social', scheme: 'social' },
    outcomeByResult: { partial: 'partial', failure: 'failure', critical_failure: 'failure' },
  });
  assert.deepEqual(mods.config.validateFreeActionConfig(), []);
  assert.deepEqual(mods.facts.validateFreeActionTexts(), []);
  const engine = stripComments(await read('../src/utils/judgementEngine.ts'));
  assert.doesNotMatch(engine, /gateScopeFor|ttlTurns|\.4 : outcome|局势明显恶化|行动受阻/, '引擎不再写死余波');
  const effects = stripComments(await read('../src/modules/scenarioMods/freeAction/outcomeEffects.ts'));
  assert.doesNotMatch(effects, /局势明显恶化|行动受阻|\b0?\.(05|15|4)\b|ttl\w*: *3/);
});

test('3 physical 失败：结算扣一次气血、写一次余波；旧引擎对 free_action 回执什么都不写；重放不重复', () => {
  for (const [outcome, hp] of [['partial', 95], ['failure', 85], ['critical_failure', 60]]) {
    const save = hpSave();
    const prepared = issue(save, ticket('physical', 'attack', WANG_ZHE));
    assert.equal(prepared.kind, 'issued');
    const resolution = confirm(save, prepared.proposal.id, outcome);
    assert.deepEqual(resolution.appliedEffects.filter(e => e.key === '角色.属性.气血.当前' || e.key.startsWith('系统.扩展.行动门控')), [], `${outcome}：引擎不写`);
    assert.equal(save.角色.属性.气血.当前, 100, `${outcome}：确认判定时没扣`);
    assert.deepEqual(gateRows(save), []);
    const settled = mods.settle.settleFromResolution(save, resolution);
    assert.equal(settled.ok, true);
    assert.equal(save.角色.属性.气血.当前, hp, outcome);
    assert.equal(gateRows(save).length, 1, outcome);
    assert.deepEqual([gateRows(save)[0].scope, gateRows(save)[0].outcome, gateRows(save)[0].ttlTurns, gateRows(save)[0].target], ['combat', outcome === 'partial' ? 'partial' : 'failure', 3, WANG_ZHE]);
    assert.ok(settled.facts.some(f => f.includes(String(100 - hp))), '事实行里有扣血数额');
    // 重放：同一判定再结算 / 回合编排再跑一遍 / 引擎再确认一次，都不再写
    const again = mods.settle.settleFromResolution(save, resolution);
    assert.deepEqual([again.ok, again.replay], [true, true]);
    const turn = mods.turn.settleFreeActionTurn(save, [], resolution);
    assert.equal(turn.changed, false);
    confirm(save, prepared.proposal.id, outcome);
    assert.equal(save.角色.属性.气血.当前, hp, `${outcome}：只扣一次`);
    assert.equal(gateRows(save).length, 1, `${outcome}：余波只写一次`);
  }
});

test('3 成功档没有余波；最低留 keepHp 点（气血 2 → 1，气血 1 不再扣但仍写余波）；别的 kind 不扣血', () => {
  const ok = hpSave();
  runJudged(ok, ticket('physical', 'attack', WANG_ZHE), 'success');
  assert.deepEqual([ok.角色.属性.气血.当前, gateRows(ok).length], [100, 0]);
  for (const outcome of ['great_success', 'perfect']) {
    const save = hpSave();
    runJudged(save, ticket('physical', 'attack', WANG_ZHE), outcome);
    assert.deepEqual([save.角色.属性.气血.当前, gateRows(save).length], [100, 0], outcome);
  }
  const low = hpSave({ hp: 2 });
  runJudged(low, ticket('physical', 'attack', WANG_ZHE), 'critical_failure');
  assert.equal(low.角色.属性.气血.当前, cfg().aftermath.hpLoss.keepHp);
  const one = hpSave({ hp: 1 });
  runJudged(one, ticket('physical', 'attack', WANG_ZHE), 'failure');
  assert.deepEqual([one.角色.属性.气血.当前, gateRows(one).length], [1, 1]);
  // verbal（social / scheme）：只写 social 余波，不扣血
  for (const variant of ['taunt', 'deceive']) {
    const save = hpSave();
    runJudged(save, ticket('verbal', variant, WANG_ZHE), 'failure');
    assert.deepEqual([save.角色.属性.气血.当前, gateRows(save).map(r => r.scope)], [100, ['social']], variant);
  }
});

test('3 余波的比例 / 范围 / 条数 / 留血都读配置：改配置，结算跟着变', () => {
  const run = (cls, variant, outcome, extra = {}) => {
    const save = hpSave(extra);
    runJudged(save, ticket(cls, variant, WANG_ZHE), outcome);
    return save;
  };
  const restore = { freeAction: { aftermath: { hpLoss: { ratio: { failure: 0.15 }, keepHp: 1 }, gate: { ttlTurns: 3, scopeByKind: { combat: 'combat' }, defaultScope: 'scene' } } } };
  patch({ freeAction: { aftermath: { hpLoss: { ratio: { failure: 0.5 } } } } }, () => assert.equal(run('physical', 'attack', 'failure').角色.属性.气血.当前, 50), restore);
  patch({ freeAction: { aftermath: { hpLoss: { keepHp: 90 } } } }, () => assert.equal(run('physical', 'attack', 'failure').角色.属性.气血.当前, 90), restore);
  patch({ freeAction: { aftermath: { gate: { ttlTurns: 7 } } } }, () => assert.equal(gateRows(run('physical', 'attack', 'failure'))[0].ttlTurns, 7), restore);
  patch({ freeAction: { aftermath: { gate: { scopeByKind: { combat: 'social' } } } } }, () => assert.equal(gateRows(run('physical', 'attack', 'failure'))[0].scope, 'social'), restore);
  patch({ freeAction: { aftermath: { hpLoss: { kinds: [] } } } }, () => assert.equal(run('physical', 'attack', 'failure').角色.属性.气血.当前, 100), { freeAction: { aftermath: { hpLoss: { kinds: ['combat'] } } } });
  assert.equal(run('physical', 'attack', 'failure').角色.属性.气血.当前, 85, '已还原');
});

test('3 无对象的票（自修 / 场面）失败：余波由结算写一次，范围按 kind（cultivate→scene，escape→combat），旧引擎不写', () => {
  for (const [tk, scope] of [[ticket('solo', 'train', null), 'scene'], [ticket('field', 'scene_act', null), 'combat']]) {
    const save = hpSave();
    save.角色.属性.境界 = { 名称: mods.realm.levelName(1), 阶段: '中期', 当前进度: 30, 下一级所需: 100 };
    const prepared = issue(save, tk);
    assert.equal(prepared.kind, 'issued', tk.variant);
    const resolution = confirm(save, prepared.proposal.id, 'failure');
    assert.deepEqual(resolution.appliedEffects.filter(e => e.key.startsWith('系统.扩展.行动门控')), [], tk.variant);
    assert.deepEqual(gateRows(save), []);
    mods.settle.settleFromResolution(save, resolution);
    mods.settle.settleFromResolution(save, resolution);
    assert.deepEqual(gateRows(save).map(r => [r.scope, r.outcome, r.target]), [[scope, 'failure', undefined]], tk.variant);
    assert.equal(save.角色.属性.气血.当前, 100, '非 combat 不扣血');
  }
});

test('3 结算没成（确认后闸门不过）就不写余波：目标已不在场 → 零写入', () => {
  const save = hpSave();
  const prepared = issue(save, ticket('physical', 'attack', WANG_ZHE));
  const resolution = confirm(save, prepared.proposal.id, 'failure');
  const event = runtimeOf(save).events.find(e => e.id === 'lcq.event.s01_02');
  event.relatedCharacterIds = event.relatedCharacterIds.filter(id => id !== WANG_ZHE);
  const result = mods.settle.settleFromResolution(save, resolution);
  assert.deepEqual([result.ok, result.reason], [false, 'not_present']);
  assert.deepEqual([save.角色.属性.气血.当前, gateRows(save).length], [100, 0]);
});

test('3 旧预检 / 事件判定（非 free_action 回执）仍由引擎按同一份配置落账：数值与第 1 步基线一致，改配置同样生效', () => {
  const run = outcome => {
    const save = { 角色: { 身份: { 先天六司: {}, 后天六司: {} }, 位置: { 灵气浓度: 50 }, 属性: { 气血: { 当前: 100, 上限: 100 } } }, 世界: { 状态: { 剧本模组: {} } } };
    const proposal = preflight.buildLocalJudgementPreflight('我出手攻击他', save, 1);
    assert.equal(proposal.kind, 'combat');
    mods.judgement.persistPendingJudgement(save, proposal);
    const resolution = mods.judgement.resolvePendingJudgement(save, proposal.id, { currentTurn: 1, testOutcome: outcome });
    return { save, resolution };
  };
  for (const [outcome, hp] of [['partial', 95], ['failure', 85], ['critical_failure', 60]]) {
    const { save, resolution } = run(outcome);
    assert.equal(save.角色.属性.气血.当前, hp, outcome);
    assert.deepEqual(resolution.appliedEffects.map(e => e.key), ['角色.属性.气血.当前', '系统.扩展.行动门控.recent'], outcome);
    assert.equal(gateRows(save).length, 1);
  }
  patch({ freeAction: { aftermath: { hpLoss: { ratio: { failure: 0.3 } } } } }, () => assert.equal(run('failure').save.角色.属性.气血.当前, 70), { freeAction: { aftermath: { hpLoss: { ratio: { failure: 0.15 } } } } });
});

// ───────────── 4) 双修：intimate 类、带对象、好感门槛读配置 ─────────────

const dual = (target = WANG_ZHE, extra = {}) => ticket('intimate', 'dual_cultivate', target, extra);
const dualSave = ({ favor = 60, hp = 50 } = {}) => hpSave({ favor, hp });

test('4 配置：双修是 intimate 类的 judge 变体，kind=cultivate，门槛引用 dualCultivation.requires.minGoodwill（60），提示 ≤ 40 字', () => {
  const spec = mods.config.variantSpecOf('intimate', 'dual_cultivate');
  assert.deepEqual([spec.enabled, spec.route, spec.kind, spec.target, spec.effect, spec.applyRecovery], [true, 'judge', 'cultivate', undefined, 'selfBuff', true]);
  assert.equal(N().freeAction.dualCultivation.requires.minGoodwill, 60);
  assert.equal(spec.requires.minGoodwill, 60, '门槛读配置引用，不是另写一个 60');
  assert.equal(cfg().classes.intimate.variants.dual_cultivate.requires.minGoodwill, 'freeAction.dualCultivation.requires.minGoodwill');
  assert.ok(spec.hint.length <= 40);
  const listed = mods.ticket.ticketPromptSection(makeSave({ present: [WANG_ZHE] })).payload.classes.find(c => c.actionClass === 'intimate').variants.map(v => v.variant);
  assert.deepEqual(listed, ['flirt', 'kiss', 'invite', 'dual_cultivate']);
  assert.deepEqual(mods.config.validateFreeActionConfig(), []);
  assert.deepEqual(mods.facts.validateFreeActionTexts(), []);
});

test('4 门槛 60：好感 59 → goodwill_below_min（双修专用文案，零写入）；60 → 出判定卡；门槛改配置，闸门跟着变', () => {
  const low = dualSave({ favor: 59 });
  const snapshot = structuredClone(low);
  const refused = issue(low, dual());
  assert.deepEqual([refused.kind, refused.reason], ['refused', 'goodwill_below_min']);
  assert.match(refused.facts[0], /合练功法/);
  assert.deepEqual(low, snapshot, '零写入');
  const edge = dualSave({ favor: 60 });
  const prepared = issue(edge, dual());
  assert.equal(prepared.kind, 'issued');
  assert.equal(prepared.proposal.kind, 'cultivate');
  assert.equal(prepared.proposal.target, WANG_ZHE);
  assert.equal(prepared.proposal.actionText, `对${profileOf(edge, WANG_ZHE).名字}施行「双修」（自由行动）`);
  assert.ok(prepared.proposal.factors.every(f => f.source !== 'realm'), '合练不算境界差');
  const restore = { freeAction: { dualCultivation: { requires: { minGoodwill: 60 } } } };
  patch({ freeAction: { dualCultivation: { requires: { minGoodwill: 40 } } } }, () => {
    assert.equal(issue(dualSave({ favor: 40 }), dual()).kind, 'issued');
    assert.equal(issue(dualSave({ favor: 39 }), dual()).reason, 'goodwill_below_min');
  }, restore);
  assert.equal(issue(dualSave({ favor: 59 }), dual()).reason, 'goodwill_below_min', '已还原');
});

test('4 双修必须带对象：没有目标 / 目标不在场的票收不下；票校验阶段给“未发生”事实', () => {
  const save = dualSave();
  const checked = mods.ticket.validateFreeActionTickets([{ actionClass: 'intimate', variant: 'dual_cultivate', targetId: null, degree: 'normal', performed: 'yes', evidence: '双修', itemId: null }], '我与她双修', save);
  assert.deepEqual(checked.tickets, []);
  assert.equal(checked.refusals.length, 1);
  assert.equal(mods.plan.prepareFreeAction(save, dual(null)).kind, 'blocked');
  const away = mods.ticket.validateFreeActionTickets([{ actionClass: 'intimate', variant: 'dual_cultivate', targetId: NING_YU, degree: 'normal', performed: 'yes', evidence: '双修', itemId: null }], '我与她双修', save);
  assert.deepEqual(away.tickets, []);
});

test('4 双修成功：旧引擎只回血（不看文本关键词、不给增益），阴阳调和由结算按配置时长写一次；重放不重复；好感不动', () => {
  for (const [outcome, minutes] of [['partial', 120], ['success', 240], ['great_success', 360], ['perfect', 480]]) {
    const save = dualSave();
    const favor = profileOf(save, WANG_ZHE).好感度;
    const prepared = issue(save, dual());
    const resolution = confirm(save, prepared.proposal.id, outcome);
    assert.deepEqual(effectNames(save), [], `${outcome}：确认判定时引擎不发增益`);
    assert.ok(save.角色.属性.气血.当前 > 50, `${outcome}：自由行动声明的回血仍由引擎做`);
    const result = mods.settle.settleFromResolution(save, resolution);
    assert.equal(result.ok, true);
    assert.deepEqual(effectNames(save), ['阴阳调和'], outcome);
    const buff = save.角色.效果[0];
    assert.deepEqual([buff.持续时间分钟, buff.类型, buff.强度, buff.来源], [minutes, 'buff', 1, '本地判定'], outcome);
    assert.equal(buff.持续时间分钟, N().freeAction.dualCultivation.buff.minutesByOutcome[outcome]);
    assert.match(buff.状态描述, /双修/);
    assert.ok(result.facts.some(f => f.includes('阴阳调和')));
    assert.equal(profileOf(save, WANG_ZHE).好感度, favor, '双修基础好感为 0');
    mods.settle.settleFromResolution(save, resolution);
    mods.turn.settleFreeActionTurn(save, [], resolution);
    assert.equal(save.角色.效果.length, 1, `${outcome}：重放不重复`);
  }
});

test('4 双修失败：无增益、无回血，只写行动余波（scene）；事实按“未合上”取', () => {
  for (const outcome of ['failure', 'critical_failure']) {
    const save = dualSave();
    const { result } = runJudged(save, dual(), outcome);
    assert.equal(result.ok, true);
    assert.equal(result.resultKey, 'unsynced');
    assert.deepEqual([effectNames(save), save.角色.属性.气血.当前, gateRows(save).map(r => r.scope)], [[], 50, ['scene']], outcome);
  }
  const partial = dualSave();
  assert.equal(runJudged(partial, dual(), 'partial').result.resultKey, 'shallow');
});

test('4 solo 不承接双修：自修票不带对象，原话里写双修也得不到阴阳调和；双修的增益只出自 intimate 变体', async () => {
  const save = dualSave();
  save.角色.属性.境界 = { 名称: mods.realm.levelName(1), 阶段: '中期', 当前进度: 30, 下一级所需: 100 };
  for (const variant of ['train', 'recover']) {
    const fresh = dualSave();
    fresh.角色.属性.境界 = structuredClone(save.角色.属性.境界);
    const checked = mods.ticket.validateFreeActionTickets([{ actionClass: 'solo', variant, targetId: WANG_ZHE, degree: 'normal', performed: 'yes', evidence: '双修', itemId: null }], '我和王哲双修', fresh);
    assert.equal(checked.tickets[0].targetId, null, '模型把对象报进自修票也被置空');
    const { prepared } = runJudged(fresh, checked.tickets[0], 'perfect');
    assert.ok(!prepared.proposal.actionText.includes('双修') && prepared.proposal.target === undefined);
    assert.deepEqual(effectNames(fresh), [], `${variant}：没有阴阳调和`);
  }
  // 配置：只有带对象的 intimate 变体声明了 selfBuff；solo 全是 target:none，且没有 buff 引用
  for (const [cls, body] of Object.entries(cfg().classes)) for (const [name, row] of Object.entries(body.variants)) {
    const spec = mods.config.variantSpecOf(cls, name);
    if (spec.effect === 'selfBuff') assert.deepEqual([cls, name, spec.target], ['intimate', 'dual_cultivate', undefined]);
  }
  assert.ok(Object.keys(cfg().classes.solo.variants).every(name => mods.config.variantSpecOf('solo', name).target === 'none'));
  // 代码里 solo / field / 双修都不是字面量
  const dir = new URL('../src/modules/scenarioMods/freeAction/', import.meta.url);
  for (const f of ['outcomeEffects.ts', 'skillMatch.ts', 'settle.ts', 'gates.ts', 'plan.ts', 'judgement.ts']) {
    const code = stripComments(await readFile(new URL(f, dir), 'utf8'));
    assert.doesNotMatch(code, /双修|dual_cultivate|['"`](solo|field)['"`]/, f);
  }
});

test('4 旧关键词路径（识别失败的回落）里的双修收益保持原样：门槛同读配置；自由行动回执不吃这条', () => {
  const run = favor => {
    const save = hpSave({ favor, hp: 50 });
    const proposal = preflight.buildLocalJudgementPreflight('我与她双修疗伤', save, 1);
    assert.equal(proposal.kind, 'cultivate');
    mods.judgement.persistPendingJudgement(save, { ...proposal, target: WANG_ZHE });
    confirm(save, proposal.id, 'success');
    return save;
  };
  assert.deepEqual(effectNames(run(60)), ['阴阳调和']);
  assert.deepEqual(effectNames(run(59)), []);
});

// ───────────── 5) 技能 / 天赋按行动类匹配 ─────────────

function skillSave({ mastered = ['九阳神功', '五虎断门刀', '口才三寸'], talents = [], skills } = {}) {
  const save = hpSave({ favor: 60 }); // 双修要好感 ≥ 门槛
  save.角色.技能 = { 掌握技能: mastered.map(name => ({ 技能名称: name, 熟练度: 40 })) };
  runtimeOf(save).canon.skills = skills ?? [
    { id: 's.nineyang', name: '九阳神功', description: '太乙真宗核心功法，用于修炼真气。' },
    { id: 's.wuhu', name: '五虎断门刀', description: '武二郎的刀法，未传授给程宗扬。' },
    { id: 's.blade', name: '追风刀法', description: '快刀，攻势凌厉。' },
    { id: 's.talk', name: '口才三寸', description: '擅长交涉与说服。' },
  ];
  if (talents.length) save.角色.身份.天赋 = talents;
  save.角色.属性.境界 = { 名称: mods.realm.levelName(1), 阶段: '中期', 当前进度: 30, 下一级所需: 100 }; // solo.train 要求境界进度会动
  return save;
}
const cardOf = (save, cls, variant, target = WANG_ZHE) => issue(save, ticket(cls, variant, cls === 'solo' || cls === 'field' ? null : target)).proposal;
const bySource = (card, source) => card.factors.filter(f => f.source === source).map(f => `${f.label}:${f.value}`);
const skillCap = () => N().factors.skillCap;

test('5 技能：按行动类（kind）匹配已学正典技能，命中给 skillCap（配置值）；原话不参与', () => {
  // cultivate 类（solo.train / intimate.dual_cultivate）：九阳神功描述含“功法/修炼/真气”
  assert.deepEqual(bySource(cardOf(skillSave(), 'solo', 'train'), 'skill'), [`正典技能·九阳神功:${skillCap()}`]);
  assert.deepEqual(bySource(cardOf(skillSave(), 'intimate', 'dual_cultivate'), 'skill'), [`正典技能·九阳神功:${skillCap()}`]);
  // 玩家原话（证据）换什么都一样
  const named = issue(skillSave(), ticket('solo', 'train', null, { evidence: '运转九阳神功' })).proposal;
  assert.deepEqual(bySource(named, 'skill'), bySource(cardOf(skillSave(), 'solo', 'train'), 'skill'));
  const none = skillSave({ mastered: [] });
  assert.deepEqual(bySource(cardOf(none, 'intimate', 'dual_cultivate'), 'skill'), ['未掌握相关技能或天赋（无加成）:0']);
});

test('5 技能：不命中 / 未学会 / 描述写明不能用 / 存档自造 / 类不对 → 无加成，只在卡上放一行“未掌握”提示（值 0）', () => {
  const hint = '未掌握相关技能或天赋（无加成）:0';
  // 五虎断门刀：已学但描述“未传授”→ 不给
  assert.deepEqual(bySource(cardOf(skillSave({ mastered: ['五虎断门刀'] }), 'physical', 'attack'), 'skill'), [hint]);
  // 追风刀法在正典里但没学
  assert.deepEqual(bySource(cardOf(skillSave({ mastered: [] }), 'physical', 'attack'), 'skill'), [hint]);
  // 存档里学了、正典里没有
  assert.deepEqual(bySource(cardOf(skillSave({ mastered: ['模型自造神功'] }), 'physical', 'attack'), 'skill'), [hint]);
  // 类不对：九阳神功（功法/真气…）对 verbal（social：口才/交涉/说服…）不匹配
  assert.deepEqual(bySource(cardOf(skillSave({ mastered: ['九阳神功'] }), 'verbal', 'taunt'), 'skill'), [hint]);
  // 命中：physical（combat：刀/攻…）+ 追风刀法
  assert.deepEqual(bySource(cardOf(skillSave({ mastered: ['追风刀法'] }), 'physical', 'attack'), 'skill'), [`正典技能·追风刀法:${skillCap()}`]);
  // social：口才三寸
  assert.deepEqual(bySource(cardOf(skillSave({ mastered: ['口才三寸'] }), 'verbal', 'threaten'), 'skill'), [`正典技能·口才三寸:${skillCap()}`]);
  // 提示因子不改总值
  const card = cardOf(skillSave({ mastered: [] }), 'physical', 'attack');
  assert.equal(card.factors.find(f => f.source === 'skill').value, 0);
});

test('5 天赋：名称或描述含该类标签词给 talentBonus（配置值）；不含只提示；最多一条', () => {
  const talents = [{ name: '听风辨位', description: '擅长感应、追踪与侦察细微声息' }, '刀锋入骨', { name: '剑意通明', description: '' }, { name: '遁地之术', description: '' }];
  assert.deepEqual(bySource(cardOf(skillSave({ mastered: [], talents }), 'field', 'scene_act'), 'talent'), [`天赋·遁地之术:${N().freeAction.skillMatch.talentBonus}`], 'field=escape：身法/遁/逃…');
  assert.equal(N().freeAction.skillMatch.talentBonus, 4);
  assert.deepEqual(bySource(cardOf(skillSave({ mastered: [], talents }), 'physical', 'attack'), 'talent'), ['天赋·刀锋入骨:4'], '先中先用、最多一条');
  const miss = cardOf(skillSave({ mastered: [], talents: [{ name: '过目不忘', description: '记忆力强' }] }), 'physical', 'attack');
  assert.deepEqual([bySource(miss, 'talent'), bySource(miss, 'skill')], [[], ['未掌握相关技能或天赋（无加成）:0']]);
});

test('5 匹配规则与加成数值全在配置：改标签词 / 加成 / 上限，命中结果跟着变；旧预检的技能因子不受影响', () => {
  const save = () => skillSave({ mastered: ['追风刀法'] });
  assert.deepEqual(bySource(cardOf(save(), 'physical', 'attack'), 'skill'), [`正典技能·追风刀法:${skillCap()}`]);
  const combatTags = cfg().skillMatch.tags.combat.slice(), restoreTags = { freeAction: { skillMatch: { tags: { combat: combatTags } } } };
  patch({ freeAction: { skillMatch: { tags: { combat: ['枪'] } } } }, () => assert.equal(bySource(cardOf(save(), 'physical', 'attack'), 'skill')[0], '未掌握相关技能或天赋（无加成）:0'), restoreTags);
  const restoreCap = { factors: { skillCap: skillCap() } };
  patch({ factors: { skillCap: 5 } }, () => assert.deepEqual(bySource(cardOf(save(), 'physical', 'attack'), 'skill'), ['正典技能·追风刀法:5']), restoreCap);
  patch({ freeAction: { skillMatch: { maxSkill: 0 } } }, () => assert.equal(bySource(cardOf(save(), 'physical', 'attack'), 'skill')[0], '未掌握相关技能或天赋（无加成）:0'), { freeAction: { skillMatch: { maxSkill: 1 } } });
  // 键取 类.变体 / 类 / kind，先中先用：给 physical 类单配标签就优先于 combat
  const tags = cfg().skillMatch.tags;
  try {
    tags.physical = ['枪'];
    assert.equal(bySource(cardOf(save(), 'physical', 'attack'), 'skill')[0], '未掌握相关技能或天赋（无加成）:0');
    tags['physical.attack'] = ['快刀'];
    assert.deepEqual(bySource(cardOf(save(), 'physical', 'attack'), 'skill'), [`正典技能·追风刀法:${skillCap()}`]);
  } finally { delete tags.physical; delete tags['physical.attack']; }
  assert.deepEqual(bySource(cardOf(save(), 'physical', 'attack'), 'skill'), [`正典技能·追风刀法:${skillCap()}`], '已还原');
  // 旧预检仍按玩家原话点名（语义不变）
  const legacy = preflight.buildLocalJudgementPreflight('我施展追风刀法迎战', save(), 1);
  assert.ok(legacy.factors.some(f => f.source === 'skill'));
  assert.deepEqual(mods.config.validateFreeActionConfig(), []);
});

test('5 技能因子进判定总值：确认判定的 total 包含加成', () => {
  const withSkill = skillSave({ mastered: ['追风刀法'] }), without = skillSave({ mastered: [] });
  const total = save => {
    const prepared = issue(save, ticket('physical', 'attack', WANG_ZHE));
    return mods.judgement.resolvePendingJudgement(save, prepared.proposal.id, { currentTurn: 1, roll: () => 10 }).total;
  };
  assert.equal(total(withSkill) - total(without), skillCap());
  assert.ok(typeof skillMatch.skillTalentFactors === 'function');
});
