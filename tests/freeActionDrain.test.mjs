// 自由行动「夺元」变体（physical.drain_qi，effect=drainProgress）：默认启用；只对“设防失效”的目标成立；
// 先吸对方灵气、吸空后再吸气血（气血最多吸到 drain.hpFloor），吸到的量补给玩家灵气并折成玩家修炼进度，不扣对方的境界进度；
// 每次施行先扣玩家气血（drain.selfCostHpRatio），无冷却，吸取量按目标记次数递减。吸倒对方（无确认卡）、灵气→气血顺序、境界提升见 freeActionDrainFlow.test.mjs。
// 数值全在 game-numbers 的 freeAction 配置；测试按配置取值断言，改配置的用例结束时还原。
import assert from 'node:assert/strict';
import test from 'node:test';
import { NING_YU, advanceTurn, itemEntry, load, makeSave, mods, profileOf, runJudged, runtimeOf, ticket } from './freeActionFixture.mjs';

const { CONTENT_PACKS } = await load('../src/modules/contentPacks/index.ts');
const defense = await load('../src/modules/scenarioMods/freeAction/defenseDown.ts');
const cfg = () => mods.config.freeActionConfig();
const row = () => cfg().classes.physical.variants.drain_qi;
const PILL = 'lyl.item.np053'; // 假死药：喂下后目标挂 unconscious

const drainTicket = (extra = {}) => ticket('physical', 'drain_qi', NING_YU, extra);
const realmOf = save => profileOf(save, NING_YU).境界;
const favorOf = save => profileOf(save, NING_YU).好感度;
const days = (save, n) => { save.元数据.时间.日 += n; };
const nameOf = save => profileOf(save, NING_YU).名字;
const resolvedDrain = () => mods.config.variantSpecOf('physical', 'drain_qi').drain;
const rowsOf = (save, id) => mods.statusRead.actorStatusRecords(save, id).map(r => r.statusId);

/** 清羽存档：宁瑜在场（灵气 / 气血各 100/100）、有 50 点进度（夺元不动它）；玩家灵气压低以便看回收；target 状态按 status 挂上。 */
function fixture({ status = 'unconscious', progress = 50 } = {}) {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 }, chapter: 40, realm: mods.realm.levelName(4) });
  realmOf(save).当前进度 = progress;
  // 吸取比例含六司差：玩家先天六司对齐凝羽（权重项），Δa=0；章 40 凝羽 4 级、玩家 4 级初期，Δp=0 → 比例就是 lossRatio，灵气池 100 → 吸 8 点。
  for (const key of Object.keys(resolvedDrain().amount.attrWeights)) save.角色.身份.先天六司[key] = profileOf(save, NING_YU).先天六司[key];
  save.角色.属性.灵气.当前 = 10;
  if (status) assert.ok(mods.actorStatus.applyActorStatus(save, NING_YU, status, { sourceId: 'test' }).ok);
  return save;
}

test('D1 默认启用：进提示词清单，票被收下（不再是 variant_disabled）；配置与文本体检通过', () => {
  assert.equal(row().enabled, true);
  const save = fixture();
  assert.equal(mods.config.enabledVariants().some(v => v.variant === 'drain_qi'), true, '进提示词清单');
  const out = mods.ticket.validateFreeActionTickets([{ actionClass: 'physical', variant: 'drain_qi', targetId: NING_YU, degree: 'normal', performed: 'yes', evidence: '夺元', itemId: null }], '我对宁瑜夺元', save);
  assert.deepEqual(out.tickets.map(t => t.variant), ['drain_qi']);
  assert.deepEqual(out.discards, []);
  assert.deepEqual(mods.config.validateFreeActionConfig(), []);
  assert.deepEqual(mods.facts.validateFreeActionTexts(), []);
});

test('提示词清单带 label 与 hint；校验与文本体检通过', () => {
  const save = fixture();
  const listed = mods.ticket.ticketPromptSection(save).payload.classes.find(c => c.actionClass === 'physical').variants.find(v => v.variant === 'drain_qi');
  assert.equal(listed.label, '夺元');
  assert.equal(listed.hint, row().hint);
  assert.ok(mods.ticket.ticketPromptSection(save).payload.classes.find(c => c.actionClass === 'physical').variants.every(v => ('hint' in v) === Boolean(mods.config.variantSpecOf('physical', v.variant).hint)), '只有配了 hint 的变体带 hint 字段，形状不变');
  assert.deepEqual(mods.config.validateFreeActionConfig(), []);
  assert.deepEqual(mods.facts.validateFreeActionTexts(), []);
});

test('门槛：目标没有设防失效状态 → guard_up，零写入；外伤、惊惧不算', () => {
  const clean = fixture({ status: null });
  const before = structuredClone(clean);
  const prepared = mods.plan.prepareFreeAction(clean, drainTicket());
  assert.deepEqual([prepared.kind, prepared.reason], ['refused', 'guard_up']);
  assert.deepEqual(clean, before, '存档深比较不变');
  assert.equal(prepared.facts[0], mods.facts.gateText('guard_up', { player: clean.角色.身份.名字 || '你', target: nameOf(clean) }));
  assert.deepEqual(rowOfDown().statusIds, ['unconscious', 'dying', 'acupoint.sealed', 'paralyzed', 'wound.severe']);
  assert.deepEqual(rowOfDown().effectKinds, ['downed']);
  for (const status of ['wound.external', 'wound.fright']) {
    const save = fixture({ status });
    assert.equal(mods.plan.prepareFreeAction(save, drainTicket()).reason, 'guard_up', status);
  }
  // 判据读状态记录，不读玩家原话：票里 evidence 写什么都不改变结果
  assert.equal(mods.plan.prepareFreeAction(fixture({ status: null }), drainTicket({ evidence: '他已昏迷，毫无防备' })).reason, 'guard_up');
});
const rowOfDown = () => row().requires.targetDefenseDown;

test('门槛：名单里的状态（昏迷、濒死、封穴、麻痹、重伤）放行；名单外但带 downed 效果种类的状态也放行（读结构化状态）', () => {
  for (const status of rowOfDown().statusIds) {
    const prepared = mods.plan.prepareFreeAction(fixture({ status }), drainTicket());
    assert.equal(prepared.kind, 'issued', status);
    assert.equal(prepared.proposal.kind, 'combat');
    assert.equal(prepared.proposal.factors.some(f => f.source === 'realm'), true, '带境界差');
    assert.equal(prepared.proposal.actionText.includes('夺元'), true);
  }
  const down = { statusIds: [], effectKinds: ['downed'] };
  const save = fixture();
  assert.equal(defense.defenseDownOf(save, NING_YU, down), true);
  assert.equal(defense.defenseDownOf(save, NING_YU, { statusIds: ['nope'] }), false);
  assert.equal(defense.defenseDownOf(fixture({ status: null }), NING_YU, down), false);
});

test('喂假死药（昏迷）→ 下一拍夺元可行', () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 }, chapter: 40, realm: mods.realm.levelName(4), items: { [PILL]: itemEntry(PILL) } });
  realmOf(save).当前进度 = 50;
  assert.equal(mods.plan.prepareFreeAction(save, drainTicket()).reason, 'guard_up', '喂药前不成立');
  const fed = mods.settle.settleFreeAction(save, ticket('give', 'feed_pill', NING_YU, { itemId: PILL }));
  assert.equal(fed.ok, true, JSON.stringify(fed));
  assert.ok(rowsOf(save, NING_YU).includes('unconscious'));
  advanceTurn(save);
  assert.equal(mods.plan.prepareFreeAction(save, drainTicket()).kind, 'issued');
});

test('成功：先吸灵气（气血不动）、好感 -12、升格大事、挂惊惧与真元亏损；玩家灵气按比例补给、先扣气血，玩家境界进度按比例涨；不改对方的境界', () => {
  const save = fixture();
  const realm = structuredClone(realmOf(save)), playerRealm = save.角色.属性.境界;
  const d = resolvedDrain(), taken = Math.round(100 * d.lossRatio);
  const hpBefore = save.角色.属性.气血.当前, selfCost = Math.round(save.角色.属性.气血.上限 * d.selfCostHpRatio);
  const playerProgress = Number(playerRealm.当前进度) || 0;
  const { prepared, result } = runJudged(save, drainTicket(), 'success');
  assert.equal(prepared.kind, 'issued');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.resultKey, 'drained');
  assert.ok(selfCost > 0 && taken > 0);
  assert.equal(save.角色.属性.气血.当前, hpBefore - selfCost, '先扣玩家气血');
  assert.equal(result.facts[1], CONTENT_PACKS.texts['free.fact.drain_qi.self_cost'].split('{player}').join(save.角色.身份.名字 || '你'), '事实里补上自损一句');
  assert.equal(result.facts[2], CONTENT_PACKS.texts['free.fact.drain_qi.took_qi'].split('{player}').join(save.角色.身份.名字 || '你').split('{target}').join(nameOf(save)).split('{amount}').join(String(taken)), '事实写明夺走灵气多少');
  assert.equal(poolOf(save, '灵气').当前, 100 - taken, '先吸灵气');
  assert.equal(poolOf(save, '气血').当前, 100, '灵气没吸空，气血不动');
  assert.deepEqual(realmOf(save), realm, '不再扣对方的境界进度');
  assert.equal(save.角色.属性.境界.当前进度, playerProgress + Math.round(taken * d.gain.progressPerPoint), '玩家境界进度按 gain.progressPerPoint 折算');
  assert.equal(save.角色.属性.灵气.当前, 10 + Math.round(taken * d.gain.qiPerPoint), '玩家灵气按 gain.qiPerPoint 补给');
  assert.equal(favorOf(save), 60 - 12);
  assert.equal(result.major, true);
  assert.ok(profileOf(save, NING_YU).记忆.length > 0);
  const episodes = runtimeOf(save).actorEngine.actorMemory[NING_YU].episodes;
  assert.ok(episodes.some(e => e.tags.includes('free:physical.drain_qi') && e.tags.includes('major_episode')), '大事 episode 带变体标签');
  const rows = rowsOf(save, NING_YU);
  for (const id of d.afterStatuses) assert.ok(rows.includes(id), id);
  assert.deepEqual([...d.afterStatuses].sort(), ['qi.drained', 'wound.fright']);
  const state = mods.state.readFreeActionState(save);
  assert.equal(state.drainLedger[NING_YU].count, 1);
  assert.equal(state.cooldowns[`drain_qi:${NING_YU}`], undefined, '夺元不记冷却');
  assert.match(result.facts[0], /心头发沉/, 'D6 负罪感只做文本');
  assert.equal(rowsOf(save, runtimeOf(save).opening.playerCharacterId).length, 0, 'D6 玩家不挂状态');
  // 重放不再写
  const replay = mods.settle.settleFromResolution(save, runJudgedLast(save));
  assert.equal(replay?.replay, true);
  assert.equal(poolOf(save, '灵气').当前, 100 - taken);
});
const poolOf = (save, key) => profileOf(save, NING_YU).属性[key];
const runJudgedLast = save => mods.judgement.getJudgementState(save).recent.at(-1);

test('结果档：大成/完美/部分/失败/大失败 → 吸取量与好感与反噬', () => {
  const d = resolvedDrain(), base = row().base;
  const cases = [
    ['partial', 'trace', 0.5, -12], ['great_success', 'drained', 1.5, -12], ['perfect', 'drained_deep', 2, -12],
    ['failure', 'resisted', 0, -15], ['critical_failure', 'recoil', 0, -15],
  ];
  for (const [outcome, key, factor, delta] of cases) {
    const save = fixture();
    const expected = Math.round(100 * Math.min(d.perUseCapRatio, d.lossRatio * factor));
    const { result } = runJudged(save, drainTicket(), outcome);
    assert.equal(result.resultKey, key, outcome);
    assert.equal(100 - poolOf(save, '灵气').当前, expected, outcome);
    assert.equal(poolOf(save, '气血').当前, 100, `${outcome} 气血不动`);
    assert.equal(favorOf(save), 60 + delta, `${outcome} 好感`);
    assert.equal(d.outcomeFactor[outcome], factor);
    assert.equal(rowsOf(save, NING_YU).includes('qi.drained'), expected > 0, `${outcome} 状态`);
    const playerId = runtimeOf(save).opening.playerCharacterId;
    assert.equal(rowsOf(save, playerId).includes('qi.disordered'), outcome === 'critical_failure', `${outcome} 反噬`);
    if (outcome === 'critical_failure') assert.match(result.facts.join(''), /反噬/);
  }
  assert.equal(base, -12);
});

test('好感：轻重度走同一条 beatClamp（±15）；light 不升格大事', () => {
  const light = fixture();
  const lightRun = runJudged(light, drainTicket({ degree: 'light' }), 'success');
  assert.equal(favorOf(light), 60 - 6);
  assert.equal(lightRun.result.major, false);
  const heavy = fixture();
  runJudged(heavy, drainTicket({ degree: 'heavy' }), 'success');
  assert.equal(favorOf(heavy), 60 - cfg().affinity.perBeatCap, '-18 被钳到 -15');
});

test('无冷却、递减与恢复：连着夺不被冷却拦；每次吸取量按 perUse 递减，下限 floor，满一个周期恢复一次', () => {
  const save = fixture();
  const d = resolvedDrain(), full = 100 * d.lossRatio;
  const losses = [];
  // 昏迷 720 分钟会自己过期（设防失效须在场）；每次出手前重新挂上，模拟目标一直无力设防。
  const down = () => mods.actorStatus.applyActorStatus(save, NING_YU, 'unconscious', { sourceId: 'test' });
  const run = () => { down(); const before = poolOf(save, '灵气').当前; const out = runJudged(save, drainTicket(), 'success'); assert.ok(out.result?.ok, JSON.stringify(out.prepared)); losses.push(before - poolOf(save, '灵气').当前); };
  run();
  down();
  assert.equal(row().cooldownMinutes, undefined);
  for (let i = 0; i < 4; i++) { advanceTurn(save); run(); } // 不隔时间，连着夺：没有冷却拦
  const expected = [0, 1, 2, 3, 4].map(n => Math.round(full * Math.max(d.diminish.floor, d.diminish.perUse ** n)));
  assert.deepEqual(losses, expected);
  assert.ok(expected[4] >= Math.round(full * d.diminish.floor) && expected[4] < expected[0], '递减且不低于下限');
  // 满一个恢复周期后少算一次
  days(save, d.diminish.recoverMinutes / 1440); advanceTurn(save);
  const before = poolOf(save, '灵气').当前;
  down();
  runJudged(save, drainTicket(), 'success');
  assert.equal(before - poolOf(save, '灵气').当前, Math.round(full * Math.max(d.diminish.floor, d.diminish.perUse ** 4)), '已夺 5 次，隔一个恢复周期少算 1 次 → 按 4 次递减');
  assert.equal(mods.state.readFreeActionState(save).drainLedger[NING_YU].count, 5);
});

test('drain_resisted：玩家功力远低于对方，吸取比例压到 0 → 闸门不过，零写入；文案是“夺不动”', () => {
  const save = fixture();
  save.角色.属性.境界.名称 = mods.realm.levelName(0); // 无修为对 4 级：Δp = −4
  const before = structuredClone(save);
  const prepared = mods.plan.prepareFreeAction(save, drainTicket());
  assert.deepEqual([prepared.kind, prepared.reason], ['refused', 'drain_resisted']);
  assert.deepEqual(save, before);
  assert.match(prepared.facts[0], /功力深厚.*夺不动其真元/);
});

test('drain_empty：对方灵气与气血都已竭 → 闸门不过，零写入；文案写明“灵气气血皆已竭”；只剩一点气血不算竭（照常出卡，见 freeActionDrainFlow）', () => {
  const save = fixture();
  poolOf(save, '灵气').当前 = 0;
  poolOf(save, '气血').当前 = 0;
  const before = structuredClone(save);
  const prepared = mods.plan.prepareFreeAction(save, drainTicket());
  assert.deepEqual([prepared.kind, prepared.reason], ['refused', 'drain_empty']);
  assert.deepEqual(save, before);
  assert.match(prepared.facts[0], /灵气气血皆已竭/);
  poolOf(save, '气血').当前 = 1;
  assert.equal(mods.plan.prepareFreeAction(save, drainTicket()).kind, 'issued', '气血还剩 1 点：照常出判定卡，不是 drain_empty');
});

test('同拍冲突：攻击 + 夺元报同一目标 → 留夺元（|base| 更大），攻击被丢并发“未发生”事实', () => {
  const save = fixture();
  const base = { targetId: NING_YU, degree: 'normal', performed: 'yes', evidence: '宁瑜', itemId: null };
  const out = mods.ticket.validateFreeActionTickets([{ ...base, actionClass: 'physical', variant: 'attack' }, { ...base, actionClass: 'physical', variant: 'drain_qi' }], '我对宁瑜出手并夺元', save);
  assert.deepEqual(out.tickets.map(t => t.variant), ['drain_qi']);
  assert.equal(out.refusals.length, 1);
  assert.equal(out.refusals[0], mods.facts.gateText('dropped', { player: save.角色.身份.名字 || '你', target: '' }));
});

test('配置体检：drainProgress 参数残缺 / 状态不在目录 / 自损比例越界都被拒绝', () => {
  const variant = row(), snapshot = structuredClone(variant);
  try {
    const patch = (mutate, needle) => {
      Object.keys(variant).forEach(k => delete variant[k]);
      Object.assign(variant, structuredClone(snapshot));
      mutate(variant);
      assert.ok(mods.config.validateFreeActionConfig().some(e => e.includes(needle)), needle);
    };
    patch(v => { delete v.drain; }, 'drainProgress 缺 drain');
    patch(v => { v.drain.lossRatio = 0; }, 'lossRatio');
    patch(v => { delete v.drain.amount; }, 'drain.amount 缺失');
    patch(v => { v.drain.amount.attrWeights = {}; }, 'attrWeights');
    patch(v => { v.drain.amount.attrWeights = { 根骨: 0 }; }, 'attrWeights');
    patch(v => { v.drain.amount.attrStep = 'x'; }, 'attrStep');
    patch(v => { v.drain.amount.levelStep = null; }, 'levelStep');
    patch(v => { v.drain.amount.phasesPerLevel = 0; }, 'phasesPerLevel');
    patch(v => { v.drain.amount.unknownTargetAttr = 'factors.nope'; }, 'unknownTargetAttr');
    patch(v => { v.drain.afterStatuses = ['nope.status']; }, 'afterStatuses');
    patch(v => { delete v.drain.statusMinutes['qi.drained']; }, 'statusMinutes');
    patch(v => { v.drain.diminish.perUse = 2; }, 'perUse');
    patch(v => { delete v.requires; }, 'targetDefenseDown');
    patch(v => { v.requires.targetDefenseDown.statusIds = ['nope.status']; }, 'targetDefenseDown.statusIds');
    patch(v => { delete v.drain.selfCostHpRatio; }, 'selfCostHpRatio');
  patch(v => { v.drain.selfCostHpRatio = -0.1; }, 'selfCostHpRatio');
  patch(v => { v.drain.selfCostHpRatio = 1; }, 'selfCostHpRatio');
    patch(v => { v.drain.hpFloor = -1; }, 'hpFloor');
    patch(v => { v.drain.lethalStatus = 'nope.status'; }, 'lethalStatus');
    patch(v => { delete v.drain.gain; }, 'drain.gain.qiPerPoint');
    patch(v => { v.drain.gain.progressPerPoint = -1; }, 'drain.gain.progressPerPoint');
    patch(v => { v.backlash = { critical_failure: 'nope.status' }; }, 'backlash');
    } finally {
    Object.keys(variant).forEach(k => delete variant[k]);
    Object.assign(variant, snapshot);
  }
  assert.deepEqual(mods.config.validateFreeActionConfig(), []);
});

test('夺元文本齐全：每个结果档、自损、反噬、气血不足都有文本；事实/记忆里没有残留的冷却专用文本', () => {
  const spec = mods.config.variantSpecOf('physical', 'drain_qi');
  for (const key of [...mods.config.resultKeysOf(spec), ...mods.facts.effectResultKeys(spec)]) {
    assert.ok(CONTENT_PACKS.texts[`free.fact.drain_qi.${key}`], `缺 free.fact.drain_qi.${key}`);
    if (!['backlash', 'self_cost', 'took_qi', 'took_hp', 'realm_up'].includes(key)) assert.ok(CONTENT_PACKS.texts[`free.memory.drain_qi.${key}`], `缺 free.memory.drain_qi.${key}`);
  }
  assert.ok(mods.facts.effectResultKeys(spec).includes('self_cost'));
  for (const key of ['drained_lethal', 'took_qi', 'took_hp', 'realm_up']) assert.ok(mods.facts.effectResultKeys(spec).includes(key), key);
  for (const reason of ['guard_up', 'drain_empty', 'drain_resisted', 'drain_survivor', 'hp_too_low']) assert.ok(CONTENT_PACKS.texts[`free.fact.gate.${reason}`], reason);
  assert.equal(CONTENT_PACKS.texts['free.fact.gate.cooldown.drain_qi'], undefined);
});

/** 分步跑：签发 → 确认判定（判定本身对失败的战斗类行动会先扣气血）→ 结算。返回结算前一刻的气血与结算结果。 */
function stepped(save, outcome) {
  const prepared = mods.plan.prepareFreeAction(save, drainTicket());
  assert.equal(prepared.kind, 'issued');
  const resolution = mods.judgement.resolvePendingJudgement(save, prepared.proposal.id, { currentTurn: 1, testOutcome: outcome });
  const hpMid = save.角色.属性.气血.当前;
  return { hpMid, result: mods.settle.settleFromResolution(save, resolution) };
}

test('自损气血：不论结果档都先扣（失败伤害由结算在自损之后另扣）；比例来自配置；比例改了扣量跟着变', () => {
  const ratio = row().drain.selfCostHpRatio;
  const { hpLoss } = cfg().aftermath;
  try {
    for (const outcome of ['critical_failure', 'failure', 'partial', 'success', 'perfect']) {
      const save = fixture();
      const hp = save.角色.属性.气血;
      const { hpMid, result } = stepped(save, outcome);
      assert.equal(result.ok, true, outcome);
      // 旧引擎不再对 free_action 回执扣失败伤害（hpMid 就是满血）；结算先自损、再按配置扣失败伤害（最低留 keepHp 点）。
      const afterSelf = hpMid - Math.round(hp.上限 * ratio);
      const failLoss = hpLoss.ratio[outcome] === undefined ? 0 : Math.min(afterSelf - hpLoss.keepHp, Math.max(hpLoss.minLoss, Math.round(hp.上限 * hpLoss.ratio[outcome])));
      assert.equal(hp.当前, afterSelf - failLoss, outcome);
      assert.equal(result.facts.includes(mods.facts.factText('drain_qi', 'self_cost', { player: save.角色.身份.名字 || '你', target: nameOf(save) })), true, `${outcome} 事实`);
    }
    row().drain.selfCostHpRatio = 0.2;
    const save = fixture();
    const hp = save.角色.属性.气血, before = hp.当前;
    stepped(save, 'success');
    assert.equal(hp.当前, before - Math.round(hp.上限 * 0.2));
    row().drain.selfCostHpRatio = 0;
    const free = fixture(), freeHp = free.角色.属性.气血.当前;
    assert.equal(runJudged(free, drainTicket(), 'success').result.ok, true);
    assert.equal(free.角色.属性.气血.当前, freeHp, '比例 0 不扣');
  } finally { row().drain.selfCostHpRatio = ratio; }
});

test('气血不够不能施行：当前气血 ≤ 自损量 → hp_too_low，“未发生”事实，零写入；多一点就行', () => {
  const save = fixture();
  const hp = save.角色.属性.气血, cost = Math.round(hp.上限 * row().drain.selfCostHpRatio);
  hp.当前 = cost;
  const before = structuredClone(save);
  const prepared = mods.plan.prepareFreeAction(save, drainTicket());
  assert.deepEqual([prepared.kind, prepared.reason], ['refused', 'hp_too_low']);
  assert.equal(prepared.facts[0], mods.facts.gateText('hp_too_low', { player: save.角色.身份.名字 || '你', target: nameOf(save) }));
  assert.deepEqual(save, before, '存档深比较不变');
  hp.当前 = cost + 1;
  assert.equal(mods.plan.prepareFreeAction(save, drainTicket()).kind, 'issued');
  delete save.角色.属性.气血;
  assert.equal(mods.plan.prepareFreeAction(save, drainTicket()).reason, 'hp_too_low', '没有气血记录的存档付不起');
});

test('签发后气血掉到不够：确认判定时闸门再跑一次 → hp_too_low，不写进度、好感、气血', () => {
  const save = fixture();
  const prepared = mods.plan.prepareFreeAction(save, drainTicket());
  assert.equal(prepared.kind, 'issued');
  const resolution = mods.judgement.resolvePendingJudgement(save, prepared.proposal.id, { currentTurn: 1, testOutcome: 'success' });
  save.角色.属性.气血.当前 = 1;
  const result = mods.settle.settleFromResolution(save, resolution);
  assert.deepEqual([result.ok, result.reason], [false, 'hp_too_low']);
  assert.equal(realmOf(save).当前进度, 50);
  assert.equal(favorOf(save), 60);
  assert.equal(save.角色.属性.气血.当前, 1);
});

test('后面的写入被状态拒绝：气血原样退回，对方灵气与好感都不动', () => {
  const afterStatuses = row().drain.afterStatuses;
  try {
    row().drain.afterStatuses = ['nope.status'];
    const save = fixture();
    const hp = save.角色.属性.气血.当前;
    const { result } = runJudged(save, drainTicket(), 'success');
    assert.deepEqual([result.ok, result.reason], [false, 'refused_by_state']);
    assert.equal(save.角色.属性.气血.当前, hp);
    assert.equal(poolOf(save, '灵气').当前, 100);
    assert.equal(favorOf(save), 60);
  } finally { row().drain.afterStatuses = afterStatuses; }
});

test('灵气还有时不致死：完美档也只吸灵气，不动气血、不写 dying', () => {
  const save = fixture();
  const { result } = runJudged(save, drainTicket(), 'perfect');
  assert.equal(result.ok, true);
  assert.equal(rowsOf(save, NING_YU).includes('dying'), false);
  assert.equal(poolOf(save, '气血').当前, 100);
});

test('确认判定时闸门再跑一次：签发后目标不再无力设防（状态过期）→ guard_up，不写进度、好感、气血', () => {
  const save = fixture();
  const prepared = mods.plan.prepareFreeAction(save, drainTicket());
  assert.equal(prepared.kind, 'issued');
  const resolution = mods.judgement.resolvePendingJudgement(save, prepared.proposal.id, { currentTurn: 1, testOutcome: 'success' });
  days(save, 2); // 昏迷 720 分钟，已过期
  const before = structuredClone(save);
  const result = mods.settle.settleFromResolution(save, resolution);
  assert.deepEqual([result.ok, result.reason], [false, 'guard_up']);
  assert.equal(realmOf(save).当前进度, 50);
  assert.equal(favorOf(save), 60);
  assert.equal(save.角色.属性.气血.当前, before.角色.属性.气血.当前);
});
