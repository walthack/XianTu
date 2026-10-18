// 夺元新口径的流程：先吸灵气、灵气吸空后再吸气血（气血最多吸到 drain.hpFloor）；再吸会致死时先弹确认卡（判定卡上写明“继续将致死”），
// 玩家确认才执行、不确认什么都不发生、必须活着的角色（总表 mustSurvive）直接拒绝；吸到的量补给玩家灵气并折成玩家修炼进度，进度满了按现有小阶段升级逻辑结算。
// 数值全在 game-numbers 的 drain 配置；测试按配置取值断言。吸取比例 Δa = Δp = 0 → lossRatio（0.08），凝羽灵气 / 气血池 100/100 → 每次吸 8 点（success 档、normal 轻重、未递减）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { NING_YU, WANG_ZHE, load, makeSave, mods, profileOf, runJudged, runtimeOf, ticket } from './freeActionFixture.mjs';

const { CONTENT_PACKS } = await load('../src/modules/contentPacks/index.ts');
const gates = await load('../src/modules/scenarioMods/freeAction/gates.ts');
const drain = () => mods.config.variantSpecOf('physical', 'drain_qi').drain;
const STEP = () => Math.round(100 * drain().lossRatio); // 8
const WEIGHTED = ['根骨', '心性', '悟性', '魅力'];
const rowsOf = (save, id) => mods.statusRead.actorStatusRecords(save, id).map(r => r.statusId);

/** 清羽存档：目标在场、昏迷，灵气 / 气血各 100/100；玩家 4 级初期、六司对齐目标（Δa = Δp = 0）。 */
function fixture({ target = NING_YU, qi = 100, hp = 100 } = {}) {
  const save = makeSave({ present: [target], favor: { [target]: 60 }, chapter: 40, realm: mods.realm.levelName(4) });
  const theirs = profileOf(save, target);
  for (const key of WEIGHTED) save.角色.身份.先天六司[key] = theirs.先天六司[key];
  Object.assign(save.角色.属性.境界, { 阶段: '初期', 当前进度: 0, 下一级所需: 100 });
  theirs.属性.灵气 = { 当前: qi, 上限: 100 };
  theirs.属性.气血 = { 当前: hp, 上限: 100 };
  assert.ok(mods.actorStatus.applyActorStatus(save, target, 'unconscious', { sourceId: 'test' }).ok);
  return save;
}
const pools = (save, id = NING_YU) => ({ qi: profileOf(save, id).属性.灵气.当前, hp: profileOf(save, id).属性.气血.当前 });
const drainTicket = (id = NING_YU, extra = {}) => ticket('physical', 'drain_qi', id, extra);
/** 昏迷 720 分钟会自己过期；连着夺的用例每次出手前重新挂上。 */
const knockOut = (save, id = NING_YU) => assert.ok(mods.actorStatus.applyActorStatus(save, id, 'unconscious', { sourceId: 'test' }).ok);
const next = save => { save.系统.历史.叙事.push({ role: 'assistant', content: '…' }); delete runtimeOf(save).pendingLineAffinityGrants; knockOut(save); };

test('F1 灵气→气血：灵气够就只吸灵气；灵气不够时吸空灵气、没吸满的比例折到气血；灵气空了才吸气血', () => {
  assert.equal(STEP(), 8);
  // 灵气 100：只吸灵气
  const a = fixture();
  assert.equal(runJudged(a, drainTicket(), 'success').result.ok, true);
  assert.deepEqual(pools(a), { qi: 92, hp: 100 });
  // 灵气 5（想吸 8）：吸空 5，缺口 3/8 折到气血 round(100 × 0.08 × 3/8) = 3
  const b = fixture({ qi: 5 });
  const plan = gates.drainPlan(b, NING_YU, mods.config.variantSpecOf('physical', 'drain_qi'));
  assert.deepEqual(plan, { qi: 5, hp: 3, lethal: false, empty: false });
  const out = runJudged(b, drainTicket(), 'success');
  assert.equal(out.result.ok, true);
  assert.deepEqual(pools(b), { qi: 0, hp: 97 });
  assert.ok(out.result.facts.some(f => f === CONTENT_PACKS.texts['free.fact.drain_qi.took_qi'].split('{player}').join(b.角色.身份.名字 || '你').split('{target}').join(profileOf(b, NING_YU).名字).split('{amount}').join('5')), '事实写明夺走灵气 5');
  assert.ok(out.result.facts.some(f => f.includes('气血3点')), '事实写明夺走气血 3');
  // 灵气已空：整份吸气血
  next(b);
  assert.equal(runJudged(b, drainTicket(), 'success').result.ok, true);
  assert.deepEqual(pools(b), { qi: 0, hp: 97 - Math.round(100 * drain().lossRatio * 0.6) }, '第二次吸取按递减系数 perUse 缩小');
});

test('F2 气血最多吸到 hpFloor（1 点）：吸到 1 点后不死，再吸才是致死', () => {
  const save = fixture({ qi: 0, hp: 5 });
  const out = runJudged(save, drainTicket(), 'success');
  assert.equal(out.result.ok, true, JSON.stringify(out.result));
  assert.deepEqual(pools(save), { qi: 0, hp: drain().hpFloor }, '5 点气血想吸 8，只吸到剩 1 点');
  assert.equal(rowsOf(save, NING_YU).includes('dying'), false, '没死');
  assert.equal(out.prepared.proposal.authorityReceipt.lethal, undefined, '这一下不是致死的一击，卡上没有致死标记');
  // 再吸：出确认卡
  next(save);
  const again = mods.plan.prepareFreeAction(save, drainTicket());
  assert.equal(again.kind, 'issued');
  assert.equal(again.proposal.authorityReceipt.lethal, true);
});

test('F3 致死确认卡：气血只剩 1 点且灵气已空 → 判定卡写明“继续将致死”，回执带 lethal；此时还什么都没发生', () => {
  const save = fixture({ qi: 0, hp: 1 });
  const before = { target: structuredClone(profileOf(save, NING_YU)), playerHp: save.角色.属性.气血.当前, rows: rowsOf(save, NING_YU) };
  const prepared = mods.plan.prepareFreeAction(save, drainTicket());
  assert.equal(prepared.kind, 'issued');
  assert.equal(prepared.proposal.authorityReceipt.lethal, true);
  assert.match(prepared.proposal.whyNow, /继续将致死/);
  assert.equal(mods.judgement.getJudgementState(save).pending.id, prepared.proposal.id, '卡挂在待确认判定上（现有判定卡机制）');
  assert.deepEqual(profileOf(save, NING_YU), before.target, '出卡不改对方');
  assert.equal(save.角色.属性.气血.当前, before.playerHp, '出卡不扣玩家气血');
  assert.deepEqual(rowsOf(save, NING_YU), before.rows);
});

test('F4 不确认什么都不发生：撤回 / 换一种做法（界面两个按钮都走 cancelPendingJudgement）→ 对方气血、状态、玩家气血与灵气都不变；也没有结算', () => {
  const save = fixture({ qi: 0, hp: 1 });
  const snapshot = { target: structuredClone(profileOf(save, NING_YU)), me: structuredClone(save.角色.属性), rows: rowsOf(save, NING_YU), settled: structuredClone(mods.state.readFreeActionState(save)) };
  const prepared = mods.plan.prepareFreeAction(save, drainTicket());
  assert.equal(prepared.kind, 'issued');
  const cancelled = mods.judgement.cancelPendingJudgement(save, prepared.proposal.id, 1);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(mods.settle.settleFromResolution(save, cancelled), null, '撤回的判定不结算');
  assert.equal(mods.judgement.getJudgementState(save).pending, undefined, '卡已收起');
  assert.deepEqual(profileOf(save, NING_YU), snapshot.target, '对方一点没动');
  assert.deepEqual(save.角色.属性, snapshot.me, '玩家气血、灵气、境界一点没动');
  assert.deepEqual(rowsOf(save, NING_YU), snapshot.rows);
  assert.deepEqual(mods.state.readFreeActionState(save), snapshot.settled);
});

test('F5 确认后执行：对方气血归零、挂濒死（现有 applyActorStatus），不写 dead；玩家得到补给；事实写明气绝', () => {
  const save = fixture({ qi: 0, hp: 1 });
  save.角色.属性.灵气.当前 = 10;
  const out = runJudged(save, drainTicket(), 'success');
  assert.equal(out.prepared.kind, 'issued');
  assert.equal(out.result.ok, true, JSON.stringify(out.result));
  assert.equal(out.result.resultKey, 'drained_lethal');
  assert.deepEqual(pools(save), { qi: 0, hp: 0 });
  assert.ok(rowsOf(save, NING_YU).includes(drain().lethalStatus), '挂濒死');
  assert.equal(drain().lethalStatus, 'dying');
  assert.notEqual(runtimeOf(save).sceneLedger?.actors?.[NING_YU]?.status, 'dead', '不写剧情合同的 dead（那是剧情合同的权限）');
  assert.match(out.result.facts[0], /气绝倒地/);
  assert.equal(save.角色.属性.灵气.当前, 10 + Math.round(1 * drain().gain.qiPerPoint), '最后 1 点气血也按 gain 补给');
  // 对方已气绝：再夺 → 灵气气血皆已竭
  next(save);
  assert.equal(mods.plan.prepareFreeAction(save, drainTicket()).reason, 'drain_empty');
});

test('F6 没有确认的致命一击不执行：直接结算（无回执 lethal）→ lethal_unconfirmed，零写入；失败档不致死', () => {
  const save = fixture({ qi: 0, hp: 1 });
  const target = structuredClone(profileOf(save, NING_YU)), mine = structuredClone(save.角色.属性);
  const direct = mods.settle.settleFreeAction(save, drainTicket(), { id: 'x', status: 'resolved', outcome: 'success' });
  assert.deepEqual([direct.ok, direct.reason], [false, 'lethal_unconfirmed']);
  assert.match(direct.facts[0], /没有确认/);
  assert.deepEqual(profileOf(save, NING_YU), target);
  assert.deepEqual(save.角色.属性, mine);
  assert.equal(rowsOf(save, NING_YU).includes('dying'), false);
  // 确认了但骰面失败：吸取系数 0，不致死
  const failed = fixture({ qi: 0, hp: 1 });
  const out = runJudged(failed, drainTicket(), 'failure');
  assert.equal(out.result.ok, true);
  assert.equal(out.result.resultKey, 'resisted');
  assert.deepEqual(pools(failed), { qi: 0, hp: 1 });
  assert.equal(rowsOf(failed, NING_YU).includes('dying'), false);
});

test('F7 回执只能由本地签发：模型的票带 lethalConfirmed 字段 → 整张票作废（TICKET_KEYS 不收）', () => {
  const save = fixture({ qi: 0, hp: 1 });
  const raw = { actionClass: 'physical', variant: 'drain_qi', targetId: NING_YU, degree: 'normal', performed: 'yes', evidence: '夺元', itemId: null, lethalConfirmed: true };
  const out = mods.ticket.validateFreeActionTickets([raw], '我对凝羽夺元', save);
  assert.deepEqual(out.tickets, []);
  assert.deepEqual(out.discards.map(d => d.reason), ['extra_fields']);
});

test('F8 必须活着的角色（总表 mustSurvive）：致死的一击直接拒绝并写明原因，零写入；灵气气血有余时照常吸', () => {
  assert.equal(mods.facts.gateText('drain_survivor', { player: 'a', target: 'b' }).includes('主线牵连甚深'), true);
  const save = fixture({ target: WANG_ZHE, qi: 0, hp: 1 });
  const before = structuredClone(save);
  const prepared = mods.plan.prepareFreeAction(save, drainTicket(WANG_ZHE));
  assert.deepEqual([prepared.kind, prepared.reason], ['refused', 'drain_survivor']);
  assert.match(prepared.facts[0], /主线牵连甚深.*不能再夺/);
  assert.deepEqual(save, before, '存档深比较不变（连判定卡也没出）');
  // 直接结算也拒绝，不论有没有 lethalConfirmed
  const direct = mods.settle.settleFreeAction(save, drainTicket(WANG_ZHE, { lethalConfirmed: true }), { id: 'x', status: 'resolved', outcome: 'success' });
  assert.deepEqual([direct.ok, direct.reason], [false, 'drain_survivor']);
  assert.deepEqual(save, before);
  // 灵气有余：照常吸（保护只管致死那一下）
  const alive = fixture({ target: WANG_ZHE, qi: 100, hp: 100 });
  assert.equal(mods.plan.prepareFreeAction(alive, drainTicket(WANG_ZHE)).kind, 'issued');
});

test('F9 玩家灵气按 gain.qiPerPoint 补给（封顶在上限）；玩家境界进度按 gain.progressPerPoint 折算', () => {
  const save = fixture();
  save.角色.属性.灵气 = { 当前: 20, 上限: 22 };
  save.角色.属性.境界.当前进度 = 10;
  const out = runJudged(save, drainTicket(), 'success');
  assert.equal(out.result.ok, true);
  assert.equal(save.角色.属性.灵气.当前, 22, '20 + 8 封顶在上限');
  assert.equal(save.角色.属性.境界.当前进度, 10 + Math.round(8 * drain().gain.progressPerPoint));
  // 配置改了跟着变
  const original = structuredClone(drain().gain);
  try {
    drain().gain.qiPerPoint = 0.25;
    drain().gain.progressPerPoint = 2;
    const other = fixture();
    other.角色.属性.灵气 = { 当前: 10, 上限: 50 };
    other.角色.属性.境界.当前进度 = 0;
    runJudged(other, drainTicket(), 'success');
    assert.equal(other.角色.属性.灵气.当前, 12, '10 + 8 × 0.25');
    assert.equal(other.角色.属性.境界.当前进度, 16, '8 × 2');
  } finally { Object.assign(drain().gain, original); }
});

test('F10 境界提升：进度满了按现有小阶段升级逻辑结算（初期→中期，进度清零）；后期满额停在满额、不自动突破；玩家境界名不变', () => {
  const save = fixture();
  save.角色.属性.境界.当前进度 = 97; // +4（8 × 0.5）→ 101 ≥ 100
  const out = runJudged(save, drainTicket(), 'success');
  assert.equal(out.result.ok, true);
  const realmOf = () => save.角色.属性.境界; // 结算整体换新境界对象，不能缓存引用
  assert.deepEqual([realmOf().名称, realmOf().阶段, realmOf().当前进度], [mods.realm.levelName(4), '中期', 0]);
  assert.ok(out.result.facts.some(f => f.includes('升入中期')), '事实告诉叙事升了小阶段');
  // 中期 → 后期
  next(save);
  realmOf().当前进度 = 99;
  runJudged(save, drainTicket(), 'success');
  assert.deepEqual([realmOf().名称, realmOf().阶段, realmOf().当前进度], [mods.realm.levelName(4), '后期', 0]);
  // 后期：满额封顶，名称不变（突破仍走现有“冲关”判定）
  next(save);
  realmOf().当前进度 = 98;
  const top = runJudged(save, drainTicket(), 'success');
  assert.deepEqual([realmOf().名称, realmOf().阶段, realmOf().当前进度, realmOf().下一级所需], [mods.realm.levelName(4), '后期', 100, 100]);
  assert.equal(top.result.facts.some(f => f.includes('升入')), false);
  // 后期满额之后的突破仍走现有“冲关”判定（trainingRealm / canBreakthrough），夺元不越过它。
});
