// 夺元新口径的流程：先吸灵气、灵气吸空后再吸气血（气血最多吸到 drain.hpFloor）；气血吸到 1 点后再吸不弹确认卡，照常出判定卡、直接结算（对方挂 dying，不写死亡），
// 叙事只暗示油尽灯枯、不渲染血腥；必须活着的角色（总表 mustSurvive）直接拒绝；吸到的量补给玩家灵气并折成玩家修炼进度，进度满了按现有小阶段升级逻辑结算；
// 每次结算成功记一条后台日志（freeAction.debug.drainLog，见 F10）。
// 数值全在 game-numbers 的 drain 配置；测试按配置取值断言。吸取比例 Δa = Δp = 0 → lossRatio（0.08），凝羽灵气 / 气血池 100/100 → 每次吸 8 点（success 档、normal 轻重、未递减）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { NING_YU, WANG_ZHE, load, makeSave, mods, profileOf, runJudged, runtimeOf, ticket } from './freeActionFixture.mjs';

const { CONTENT_PACKS } = await load('../src/modules/contentPacks/index.ts');
const gates = await load('../src/modules/scenarioMods/freeAction/gates.ts');
const debug = await load('../src/modules/scenarioMods/freeAction/playerTextDebug.ts');
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

test('F2 气血最多吸到 hpFloor（1 点）：吸到 1 点后不倒，再吸才把对方吸倒', () => {
  const save = fixture({ qi: 0, hp: 5 });
  const out = runJudged(save, drainTicket(), 'success');
  assert.equal(out.result.ok, true, JSON.stringify(out.result));
  assert.deepEqual(pools(save), { qi: 0, hp: drain().hpFloor }, '5 点气血想吸 8，只吸到剩 1 点');
  assert.equal(rowsOf(save, NING_YU).includes('dying'), false, '没死');
  // 再吸：照常出判定卡（没有确认卡）
  next(save);
  const again = mods.plan.prepareFreeAction(save, drainTicket());
  assert.equal(again.kind, 'issued');
  assert.equal('lethal' in again.proposal.authorityReceipt, false);
});

test('F3 没有致死确认卡：气血只剩 1 点且灵气已空 → 判定卡与普通夺元同款（不写“致死”、回执无 lethal）；出卡时还什么都没发生', () => {
  const save = fixture({ qi: 0, hp: 1 });
  const before = { target: structuredClone(profileOf(save, NING_YU)), playerHp: save.角色.属性.气血.当前, rows: rowsOf(save, NING_YU) };
  const prepared = mods.plan.prepareFreeAction(save, drainTicket());
  assert.equal(prepared.kind, 'issued');
  assert.equal('lethal' in prepared.proposal.authorityReceipt, false);
  assert.equal(/致死/.test(prepared.proposal.whyNow), false);
  assert.equal(CONTENT_PACKS.texts['free.why.lethal'], undefined);
  assert.equal(CONTENT_PACKS.texts['free.confirm.lethal.button'], undefined);
  assert.equal(mods.judgement.getJudgementState(save).pending.id, prepared.proposal.id, '卡挂在待确认判定上（现有判定卡机制）');
  assert.deepEqual(profileOf(save, NING_YU), before.target, '出卡不改对方');
  assert.equal(save.角色.属性.气血.当前, before.playerHp, '出卡不扣玩家气血');
  assert.deepEqual(rowsOf(save, NING_YU), before.rows);
});

test('F4 撤回 / 换一种做法（界面两个按钮都走 cancelPendingJudgement）→ 对方气血、状态、玩家气血与灵气都不变；也没有结算', () => {
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

test('F5 直接结算：对方气血归零、挂濒死（现有 applyActorStatus），不写 dead；玩家得到补给；事实只暗示油尽灯枯', () => {
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
  assert.match(out.result.facts[0], /油尽的灯/);
  assert.equal(/气绝|倒地|不救即亡|血/.test(out.result.facts[0].replace('气血', '')), false, '不写硬性死亡 / 血腥表述');
  assert.equal(/气绝|不救即亡/.test(CONTENT_PACKS.texts['free.memory.drain_qi.drained_lethal']), false);
  assert.equal(save.角色.属性.灵气.当前, 10 + Math.round(1 * drain().gain.qiPerPoint), '最后 1 点气血也按 gain 补给');
  // 对方气血已空：再夺 → 灵气气血皆已竭
  next(save);
  assert.equal(mods.plan.prepareFreeAction(save, drainTicket()).reason, 'drain_empty');
});

test('F6 没有确认环节：不经判定回执直接结算也照常执行；失败档吸取系数 0，不倒', () => {
  const save = fixture({ qi: 0, hp: 1 });
  const direct = mods.settle.settleFreeAction(save, drainTicket(), { id: 'x', status: 'resolved', outcome: 'success' });
  assert.equal(direct.ok, true, JSON.stringify(direct));
  assert.equal(direct.resultKey, 'drained_lethal');
  assert.deepEqual(pools(save), { qi: 0, hp: 0 });
  assert.ok(rowsOf(save, NING_YU).includes('dying'));
  const failed = fixture({ qi: 0, hp: 1 });
  const out = runJudged(failed, drainTicket(), 'failure');
  assert.equal(out.result.ok, true);
  assert.equal(out.result.resultKey, 'resisted');
  assert.deepEqual(pools(failed), { qi: 0, hp: 1 });
  assert.equal(rowsOf(failed, NING_YU).includes('dying'), false);
});

test('F7 模型的票不能带 lethal / lethalConfirmed 之类多余字段：整张票作废（TICKET_KEYS 不收）', () => {
  const save = fixture({ qi: 0, hp: 1 });
  for (const extra of [{ lethalConfirmed: true }, { lethal: true }]) {
    const raw = { actionClass: 'physical', variant: 'drain_qi', targetId: NING_YU, degree: 'normal', performed: 'yes', evidence: '夺元', itemId: null, ...extra };
    const out = mods.ticket.validateFreeActionTickets([raw], '我对凝羽夺元', save);
    assert.deepEqual(out.tickets, []);
    assert.deepEqual(out.discards.map(d => d.reason), ['extra_fields']);
  }
});

test('F8 必须活着的角色（总表 mustSurvive）：吸倒对方的一击直接拒绝并写明原因，零写入；灵气气血有余时照常吸', () => {
  assert.equal(mods.facts.gateText('drain_survivor', { player: 'a', target: 'b' }).includes('主线牵连甚深'), true);
  const save = fixture({ target: WANG_ZHE, qi: 0, hp: 1 });
  const before = structuredClone(save);
  const prepared = mods.plan.prepareFreeAction(save, drainTicket(WANG_ZHE));
  assert.deepEqual([prepared.kind, prepared.reason], ['refused', 'drain_survivor']);
  assert.match(prepared.facts[0], /主线牵连甚深.*不能再夺/);
  assert.deepEqual(save, before, '存档深比较不变（连判定卡也没出）');
  // 直接结算也拒绝
  const direct = mods.settle.settleFreeAction(save, drainTicket(WANG_ZHE), { id: 'x', status: 'resolved', outcome: 'success' });
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

// ---- 后台日志（freeAction.debug.drainLog；机制同 playerTextDebug：console.info + 内存环形缓冲，不落盘、不进存档、不进界面）----
const patched = (patch, restore, fn) => { mods.numbers.applyGameNumbers(patch); try { return fn(); } finally { mods.numbers.applyGameNumbers(restore); } };
const ALL_FIELDS = ['actor', 'target', 'qi', 'hp', 'dying'];
const withInfo = fn => { const saved = console.info, lines = []; console.info = (...args) => lines.push(args); try { return fn(lines); } finally { console.info = saved; } };

test('F10 夺元后台日志：默认开、五个字段齐；普通夺元记吸到的灵气 / 气血、dying=false；吸倒对方记 dying=true；同时写 console.info', () => {
  assert.deepEqual(mods.numbers.GAME_NUMBERS.freeAction.debug.drainLog, { enabled: true, fields: ALL_FIELDS }, '默认值在配置里');
  debug.clearDrainLog();
  const save = fixture({ qi: 5, hp: 100 });
  const me = save.角色.身份.名字 || '你', them = profileOf(save, NING_YU).名字;
  withInfo(lines => {
    assert.equal(runJudged(save, drainTicket(), 'success').result.ok, true);
    assert.deepEqual(lines.map(args => args[0]), ['[夺元]']);
    assert.equal(lines[0][1].qi, 5);
  });
  const [first] = debug.peekDrainLog();
  assert.deepEqual({ ...first, at: undefined }, { at: undefined, actor: me, target: them, qi: 5, hp: 3, dying: false });
  assert.equal(typeof first.at, 'number');
  // 吸到 1 点后再吸
  const last = fixture({ qi: 0, hp: 1 });
  assert.equal(runJudged(last, drainTicket(), 'success').result.resultKey, 'drained_lethal');
  assert.deepEqual({ ...debug.peekDrainLog().at(-1), at: undefined }, { at: undefined, actor: me, target: them, qi: 0, hp: 1, dying: true });
  assert.equal(debug.peekDrainLog().length, 2);
  // 不进存档
  assert.equal(JSON.stringify(last).includes('[夺元]'), false);
});

test('F11 夺元日志：只记 fields 里列出的字段；enabled=false 不记也不输出；没结算成功（被拒 / 撤回）不记；环形缓冲按 debug.keep 截断', () => {
  const restore = { freeAction: { debug: { keep: 50, drainLog: { enabled: true, fields: ALL_FIELDS } } } };
  const fresh = () => { debug.clearDrainLog(); return fixture(); };
  patched({ freeAction: { debug: { drainLog: { fields: ['target', 'dying'] } } } }, restore, () => {
    const save = fresh();
    runJudged(save, drainTicket(), 'success');
    const [row] = debug.peekDrainLog();
    assert.deepEqual(Object.keys(row).sort(), ['at', 'dying', 'target']);
  });
  patched({ freeAction: { debug: { drainLog: { enabled: false } } } }, restore, () => withInfo(lines => {
    const save = fresh();
    assert.equal(runJudged(save, drainTicket(), 'success').result.ok, true);
    assert.deepEqual(debug.peekDrainLog(), []);
    assert.equal(lines.length, 0);
  }));
  const refused = fixture({ target: WANG_ZHE, qi: 0, hp: 1 });
  debug.clearDrainLog();
  assert.equal(mods.plan.prepareFreeAction(refused, drainTicket(WANG_ZHE)).reason, 'drain_survivor');
  const cancelled = fresh();
  const prepared = mods.plan.prepareFreeAction(cancelled, drainTicket());
  mods.judgement.cancelPendingJudgement(cancelled, prepared.proposal.id, 1);
  assert.deepEqual(debug.peekDrainLog(), []);
  patched({ freeAction: { debug: { keep: 2 } } }, restore, () => {
    debug.clearDrainLog();
    for (let i = 0; i < 3; i++) runJudged(fixture(), drainTicket(), 'success');
    assert.equal(debug.peekDrainLog().length, 2);
  });
});

test('F12 配置体检：drainLog 缺失 / 类型错 / 字段名未知 / fields 为空都点名 debug.drainLog', () => {
  const base = () => structuredClone(mods.config.freeActionConfig());
  assert.deepEqual(mods.config.validateFreeActionConfig(base()).filter(e => e.includes('drainLog')), []);
  for (const mutate of [c => { delete c.debug.drainLog; }, c => { c.debug.drainLog.enabled = 'yes'; }, c => { c.debug.drainLog.fields = ['actor', 'nope']; }, c => { c.debug.drainLog.fields = []; }]) {
    const cfg = base();
    mutate(cfg);
    assert.ok(mods.config.validateFreeActionConfig(cfg).some(e => e.includes('debug.drainLog')), JSON.stringify(cfg.debug.drainLog));
  }
});
