// 插入事件拨钟时各计时器的到期口径（设计稿 2026-11-11「四年跳计时器口径」§2、§4；用户 00:35 定，总策划 00:43 审定）。
// 夹具：220 年、插入事件前（c01-before-wuyuan-220）。四年跳当下夹具里没有麻古、救援窗口等状态，一律先挂上再拨钟。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';

globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const quiet = async fn => { const k = ['log', 'info', 'warn', 'error'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };
const N = await loadTs('../src/modules/sceneModule/numbers.ts');
const TL = await loadTs('../src/modules/scenarioMods/timelineInserts.ts');
const TT = await loadTs('../src/modules/scenarioMods/timelineInsertTimers.ts');
const LEDGER = await loadTs('../src/modules/scenarioMods/travel/travelLedger.ts');
const INJ = await loadTs('../src/modules/sceneModule/host/injuries.ts');
const AS = await loadTs('../src/modules/scenarioMods/freeAction/actorStatus.ts');
const MG = await loadTs('../src/modules/scenarioMods/freeAction/maigu.ts');
const SW = await loadTs('../src/modules/scenarioMods/shiweimoRescue.ts');
const SE = await loadTs('../src/utils/statusEffectManager.ts');
const AL = await loadTs('../src/modules/scenarioMods/affinityLadder.ts');
const FC = await loadTs('../src/modules/scenarioMods/freeAction/config.ts');
const LR = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
const PID = await loadTs('../src/modules/scenarioMods/playerIdentity.ts');
const P = await loadTs('../src/modules/contentPacks/index.ts');

const GN = N.GAME_NUMBERS;
const bundle = JSON.parse(readFileSync(new URL('./fixtures/checkpoints/c01-before-wuyuan-220.json', import.meta.url)));
const fresh = () => structuredClone(bundle.saves[0].存档数据);
const rt = s => s.世界.状态.剧本模组;
const now = s => INJ.sceneTime(s);
const YUE = 'lcq.character.yue_shuang';
const INSERT = P.CONTENT_PACKS.timeline.inserts[0];
const yearMinutes = () => { const c = GN.story.actionTime.calendar; return c.daysPerMonth * c.monthsPerYear * 1440; };
const MG_CFG = () => MG.maiguConfig();
const player = s => PID.scenarioPlayerId(s);
const rows = (s, id) => INJ.injuryStore(s).actors[id] || [];
const row = (s, id, statusId) => rows(s, id).find(r => r.statusId === statusId);
const effect = (s, name) => (s.角色.效果 || []).find(e => e.状态名称 === name);
const withdrawalRow = (s, id) => rows(s, id).find(r => r.statusId === MG_CFG().withdrawalStatus && r.sourceScene === 'free:maigu.withdrawal');
/** 插入事件拨钟（正式入口 applyTimelineInserts，挂点在轴序 31 前）。years 缺省＝配置 prologueYears。 */
const jump = (s, opts = {}) => quiet(() => TL.applyTimelineInserts(s, { reachedAxisSeq: INSERT.anchor.beforeAxisSeq, ...opts }));
/** 同样分钟的普通推进（无插入标记）。 */
const plain = (s, minutes, cause = 'cultivation') => quiet(() => LEDGER.advanceClock(s, { minutes }, cause));
const withPolicy = async (category, policy, fn) => {
  const before = GN.story.timeline.insertTimers.categories[category].policy;
  N.applyGameNumbers({ story: { timeline: { insertTimers: { categories: { [category]: { policy } } } } } });
  try { return await fn(); } finally { N.applyGameNumbers({ story: { timeline: { insertTimers: { categories: { [category]: { policy: before } } } } } }); }
};
/** 渴求中：给药后未到渴求期。 */
const addictCraving = (s, id) => { MG.afterItemFed(s, id, MG_CFG().itemId); };
/** 戒断中：给药后普通推进过渴求期再 60 分钟，挂上戒断「神志不清」。 */
const addictWithdrawal = async (s, id) => { MG.afterItemFed(s, id, MG_CFG().itemId); await plain(s, MG_CFG().addiction.cravingMinutes + 60, 'beat'); };

test('默认开关（审定锁死）：natural＝伤势/临时状态/冷却/滞回/重复窗口/夺元递减/搜刮回刷；freeze＝麻古成瘾戒断、剧情限时窗口', () => {
  const c = TT.insertTimersConfig().categories;
  const policy = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.policy]));
  assert.deepEqual(policy, {
    injuries: 'natural', statusEffects: 'natural', freeActionCooldowns: 'natural', affinityHysteresis: 'natural',
    affinityRepeat: 'natural', drainRecovery: 'natural', lootRespawn: 'natural', maiguAddiction: 'freeze', storyWindows: 'freeze',
  });
  assert.ok(!JSON.stringify(c.maiguAddiction).includes(MG_CFG().heightenedStatus), '感官亢奋不在冻结类');
  assert.throws(() => N.applyGameNumbers({ story: { timeline: { insertTimers: { categories: { maiguAddiction: { policy: 'oops' } } } } } }), /LCQ-NUM-006/);
  assert.equal(c.maiguAddiction.policy, 'freeze', '体检不过整份退回');
});

test('§4-1 插入事件拨 prologueYears：限时伤势、限时 角色.效果 按已过时间到期（伤势缩短剩余）；永久伤残、永久状态仍在', async () => {
  const s = fresh(), pid = player(s), years = GN.story.actionTime.prologueYears, skipped = years * yearMinutes();
  const long = skipped + 5000;
  AS.applyActorStatus(s, pid, 'wound.burn', { sourceId: 't.short', minutes: 600 });
  AS.applyActorStatus(s, YUE, 'wound.blood_loss', { sourceId: 't.long', minutes: long });
  AS.applyActorStatus(s, YUE, 'wound.fright', { sourceId: 't.forever', minutes: null });
  const store = INJ.injuryStore(s);
  (store.disabilities ||= {})[YUE] = [{ statusId: 'test.disability', label: '断臂', sourceScene: 'test', cause: 'injury', appliedAt: now(s), expiresAt: null, effects: [], remove: [] }];
  const t0 = structuredClone(s.元数据.时间);
  s.角色.效果.push(
    { 状态名称: '测试短效', 类型: 'buff', 生成时间: t0, 持续时间分钟: 60, 状态描述: '' },
    { 状态名称: '测试永久', 类型: 'buff', 生成时间: t0, 持续时间分钟: GN.status.permanentMinutesThreshold, 状态描述: '' },
  );
  const longExpires = row(s, YUE, 'wound.blood_loss').expiresAt;
  const res = await jump(s);
  assert.equal(res[0].years, years);
  assert.equal(s.元数据.时间.年, 220 + years);
  assert.equal(row(s, pid, 'wound.burn'), undefined, '短伤到期');
  assert.ok(!(s.角色.效果 || []).some(e => e.来源 === 'free:t.short'), '主角短伤的 角色.效果 一并摘除');
  assert.equal(row(s, YUE, 'wound.blood_loss').expiresAt, longExpires, '长伤不平移');
  assert.equal(longExpires - now(s), 5000, '长伤剩余缩短为 原时长−跳过分钟');
  assert.ok(row(s, YUE, 'wound.fright'), '不过期的伤势仍在');
  assert.equal(INJ.injuryStore(s).disabilities[YUE].length, 1, '永久伤残仍在');
  // 角色.效果 时长 ≥ status.permanentMinutesThreshold 即永久，限时项都短于一年，整年跳必然到期；「缩短剩余」由上面的长伤行验证。
  assert.equal(effect(s, '测试短效'), undefined);
  assert.ok(effect(s, '测试永久'), '永久状态仍在');
  assert.deepEqual(effect(s, '测试永久').生成时间, t0, '永久状态不动');
});

test('§4-2 麻古成瘾（渴求中、戒断中）：跳后仍成瘾、时钟已平移、神志不清仍在且剩余不变、不因这一跳戒除', async () => {
  const cfg = MG_CFG();
  // 渴求中（主角与 NPC 各一）
  const s = fresh(), pid = player(s);
  await plain(s, 30, 'beat');
  addictCraving(s, pid); addictCraving(s, YUE);
  await plain(s, 120, 'beat');
  const clock = structuredClone(rt(s).maiguClock), sinceDose = now(s) - clock[pid].lastDoseAt;
  const res = await jump(s);
  const skipped = res[0].years * yearMinutes();
  for (const id of [pid, YUE]) {
    assert.ok(row(s, id, cfg.addictionStatus), `${id} 仍成瘾`);
    assert.equal(rt(s).maiguClock[id].lastDoseAt, clock[id].lastDoseAt + skipped, 'lastDoseAt 平移');
    assert.equal(now(s) - rt(s).maiguClock[id].lastDoseAt, sinceDose, '渴求进度不变');
    assert.equal(withdrawalRow(s, id), undefined, '没有因这一跳进入戒断');
  }
  // 戒断中（主角）
  const w = fresh(), wid = player(w);
  await addictWithdrawal(w, wid);
  const wrow = withdrawalRow(w, wid), weff = effect(w, wrow.label);
  assert.ok(wrow && weff, '戒断已挂（伤势行与 角色.效果 两处）');
  const before = { clock: structuredClone(rt(w).maiguClock[wid]), left: wrow.expiresAt - now(w), effLeft: SE.calculateRemainingMinutes(weff, w.元数据.时间), sinceW: now(w) - rt(w).maiguClock[wid].withdrawalAt };
  const wres = await jump(w);
  const wskip = wres[0].years * yearMinutes();
  assert.ok(row(w, wid, cfg.addictionStatus), '仍成瘾，未戒除');
  assert.equal(rt(w).maiguClock[wid].withdrawal, true);
  assert.equal(rt(w).maiguClock[wid].lastDoseAt, before.clock.lastDoseAt + wskip);
  assert.equal(rt(w).maiguClock[wid].withdrawalAt, before.clock.withdrawalAt + wskip, 'withdrawalAt 平移');
  assert.equal(now(w) - rt(w).maiguClock[wid].withdrawalAt, before.sinceW, '戒断进度不变');
  const after = withdrawalRow(w, wid);
  assert.ok(after, '神志不清仍在');
  assert.equal(after.expiresAt - now(w), before.left, '神志不清剩余与跳前相同');
  const aeff = effect(w, after.label);
  assert.ok(aeff, '主角 角色.效果 里的神志不清也在（两处一起移）');
  assert.equal(SE.calculateRemainingMinutes(aeff, w.元数据.时间), before.effLeft);
  // 跳后自然推进：仍按原剩余时长走完戒断期并戒除
  await plain(w, cfg.addiction.quitMinutes - before.sinceW, 'beat');
  assert.equal(row(w, wid, cfg.addictionStatus), undefined, '跳后照原剩余时长撑过戒断期才戒除');
});

test('§4-3 麻古「感官亢奋」按自然到期摘除（不随成瘾冻结）', async () => {
  const s = fresh(), pid = player(s), cfg = MG_CFG();
  addictCraving(s, pid);
  const label = row(s, pid, cfg.heightenedStatus).label;
  assert.ok(effect(s, label));
  await jump(s);
  assert.equal(row(s, pid, cfg.heightenedStatus), undefined);
  assert.equal(effect(s, label), undefined);
  assert.ok(row(s, pid, cfg.addictionStatus), '成瘾仍在');
});

test('§4-4 自由行动冷却：跳后下次施行不再挡', async () => {
  // 闸门判式同 freeAction/gates.ts（sceneTime − cooldowns[变体:目标] < cooldownMinutes ⇒ cooldown）；
  // 真闸门在冷却前还要过在场/好感/修为/真气等检查，夹具 NPC 过不了，故按同一判式与配置断言。
  const s = fresh();
  const spec = FC.variantSpecOf('cast', 'transfer_qi');
  const key = `transfer_qi:${YUE}`, blocked = x => now(x) - rt(x).freeAction.cooldowns[key] < spec.cooldownMinutes;
  rt(s).freeAction = { ...(rt(s).freeAction || {}), cooldowns: { [key]: now(s) } };
  const at = now(s);
  assert.equal(blocked(s), true, '跳前在冷却中');
  await jump(s);
  assert.equal(rt(s).freeAction.cooldowns[key], at, '冷却锚点不平移');
  assert.equal(blocked(s), false, '跳后下次施行不再挡');
});

test('§4-5（审定新增）施微沫救援窗口跳前已打开：跳后 rescueWindowOpen 仍为真、剩余小时不变，不判死、不标 dead', async () => {
  const s = fresh();
  SW.recordShiweimoEnding(s, '被制住');
  await plain(s, 120, 'beat');
  const rec = () => SW.shiweimoRecord(s);
  const hours = () => (now(s) - rec().endedAt) / 60;
  const before = hours(), left = GN.story.shiweimo.rescueWindowHours - before;
  assert.equal(rec().status, 'pending');
  assert.equal(SW.rescueWindowOpen(rec().ending, before), true, '跳前窗口已打开');
  await jump(s);
  assert.equal(s.元数据.时间.年, 224);
  assert.equal(hours(), before);
  assert.equal(GN.story.shiweimo.rescueWindowHours - hours(), left, '剩余小时与跳前相同');
  assert.equal(SW.rescueWindowOpen(rec().ending, hours()), true, '跳后窗口仍开');
  const out = SW.settleShiweimoAction(s, { targetId: SW.SHIWEIMO_ID, itemId: null }, { skillLevel: 0, roll: 0 });
  assert.equal(out.handled, true);
  assert.doesNotMatch(out.facts.join(''), /天已亮/, '下次施救不判死');
  assert.equal(rec().status, 'pending', '不被标 dead');
});

test('§4-6 回合限时、进度期限、稀有遇见增益：跳前跳后状态一致；worldTurn 不因拨钟增加', async () => {
  const s = fresh(), r = rt(s);
  r.flags = { ...(r.flags || {}), 'deadline.test_binggu.state': 'urgent' };
  r.events[0].timeline = { ...(r.events[0].timeline || {}), deadlineTurns: 5 };
  r.rareEncounters = { test: { lastTickTurn: r.worldTurn, buffUntilTurn: r.worldTurn + 3, sightings: [] } };
  AS.applyActorStatus(s, player(s), 'wound.fright', { sourceId: 'rare.test', minutes: null });
  const pick = () => structuredClone({ worldTurn: rt(s).worldTurn, flags: rt(s).flags, events: rt(s).events.map(e => [e.id, e.timeline, e.deadlineTurns, e.beatProgress]), beatProgress: rt(s).beatProgress, rare: rt(s).rareEncounters, buff: row(s, player(s), 'wound.fright') });
  const before = pick();
  await jump(s);
  assert.equal(s.元数据.时间.年, 224);
  assert.deepEqual(pick(), before);
});

test('§4-7 同样分钟的普通 advanceClock（无插入标记）：麻古自然推进（等价直接戒除），救援窗口自然关闭', async () => {
  const minutes = GN.story.actionTime.prologueYears * yearMinutes();
  for (const [name, setup] of [['渴求中', addictCraving], ['戒断中', addictWithdrawal]]) {
    const s = fresh(), pid = player(s);
    await setup(s, pid);
    await plain(s, minutes);
    assert.equal(row(s, pid, MG_CFG().addictionStatus), undefined, `${name}：普通推进四年直接戒除`);
    assert.equal(withdrawalRow(s, pid), undefined);
  }
  const s = fresh();
  SW.recordShiweimoEnding(s, '松口退开');
  const endedAt = SW.shiweimoRecord(s).endedAt;
  await plain(s, minutes, 'travel');
  assert.equal(SW.shiweimoRecord(s).endedAt, endedAt, '普通推进不平移');
  assert.equal(SW.rescueWindowOpen('松口退开', (now(s) - endedAt) / 60), false);
  const out = SW.settleShiweimoAction(s, { targetId: SW.SHIWEIMO_ID, itemId: null }, { skillLevel: 0, roll: 0 });
  assert.match(out.facts.join(''), /天已亮/);
  assert.equal(SW.shiweimoRecord(s).status, 'dead');
  // 直接调钩子也不会被三参数调用打开
  const x = fresh(); addictCraving(x, player(x));
  await quiet(() => LEDGER.advanceClock(x, { minutes }, 'author'));
  assert.equal(row(x, player(x), MG_CFG().addictionStatus), undefined, "cause==='author' 本身不打开冻结");
});

test('§4-8 只改配置即可切换：freeze→natural 后麻古/救援窗口随跳到期；natural→freeze 后伤势与 角色.效果 平移', async () => {
  await withPolicy('maiguAddiction', 'natural', async () => {
    const s = fresh(), pid = player(s);
    addictCraving(s, pid);
    await jump(s);
    assert.equal(row(s, pid, MG_CFG().addictionStatus), undefined, '改 natural 后四年跳直接戒除');
  });
  await withPolicy('storyWindows', 'natural', async () => {
    const s = fresh();
    SW.recordShiweimoEnding(s, '被制住');
    await jump(s);
    assert.equal(SW.rescueWindowOpen('被制住', (now(s) - SW.shiweimoRecord(s).endedAt) / 60), false);
  });
  await withPolicy('injuries', 'freeze', async () => {
    const s = fresh(), pid = player(s);
    AS.applyActorStatus(s, pid, 'wound.burn', { sourceId: 't.short', minutes: 600 });
    const r0 = row(s, pid, 'wound.burn'), left = r0.expiresAt - now(s), eff = effect(s, r0.label);
    assert.ok(eff);
    await jump(s);
    const r1 = row(s, pid, 'wound.burn');
    assert.ok(r1, '改 freeze 后短伤不随跳到期');
    assert.equal(r1.expiresAt - now(s), left);
    assert.ok(effect(s, r1.label), '主角 角色.效果 同步平移');
  });
  await withPolicy('statusEffects', 'freeze', async () => {
    const s = fresh();
    s.角色.效果.push({ 状态名称: '测试短效', 类型: 'buff', 生成时间: structuredClone(s.元数据.时间), 持续时间分钟: 60, 状态描述: '' });
    await jump(s);
    assert.equal(SE.calculateRemainingMinutes(effect(s, '测试短效'), s.元数据.时间), 60);
  });
  await withPolicy('affinityHysteresis', 'freeze', async () => {
    const s = fresh();
    rt(s).stanceStates = { [YUE]: { stance: 'low', pending: { stance: 'mid', sinceDay: AL.gameDayOf(s.元数据.时间) } } };
    await jump(s);
    assert.equal(rt(s).stanceStates[YUE].pending.sinceDay, AL.gameDayOf(s.元数据.时间), '日序锚点按日序差平移');
  });
});

test('§4-9 按裁定自然到期：好感滞回维持期、好感重复窗口、夺元递减恢复、地点搜刮回刷', async () => {
  const s = fresh(), r = rt(s), t = now(s), day = AL.gameDayOf(s.元数据.时间);
  r.stanceStates = { [YUE]: { stance: 'low', pending: { stance: 'mid', sinceDay: day } } };
  r.freeAction = { ...(r.freeAction || {}), repeatLedger: { [`${YUE}:social`]: { count: 2, since: t } }, drainLedger: { [YUE]: { count: 3, lastAt: t } } };
  r.locationLoot = { ...(r.locationLoot || {}), windows: { 'test.loc': { cycle: 0, startDay: day } } };
  const before = structuredClone({ stance: r.stanceStates, repeat: r.freeAction.repeatLedger, drain: r.freeAction.drainLedger, loot: r.locationLoot.windows });
  await jump(s);
  const a = rt(s);
  assert.deepEqual({ stance: a.stanceStates, repeat: a.freeAction.repeatLedger, drain: a.freeAction.drainLedger, loot: a.locationLoot.windows }, before, '锚点都不平移');
  const today = AL.gameDayOf(s.元数据.时间), n = now(s);
  // 滞回：跳完下一回合未坐实的姿态立刻坐实（projectStance 即 runtime 每回合推进所用）
  // 越过低档阈值且超出滞回余量、落在中档的好感（取自配置，不写死数值）
  const fav = Array.from({ length: 201 }, (_, i) => i - 100).find(f => AL.stanceOf(f) === 'mid' && AL.projectStance(f, { stance: 'low' }, day).pending);
  assert.equal(AL.projectStance(fav, a.stanceStates[YUE], day).stance, 'low', '跳前同日不坐实');
  assert.equal(AL.projectStance(fav, a.stanceStates[YUE], today).stance, AL.stanceOf(fav), '跳后坐实');
  assert.ok(n - a.freeAction.repeatLedger[`${YUE}:social`].since >= GN.freeAction.affinity.repeat.windowMinutes, '重复窗口已过');
  const drain = FC.variantSpecOf('physical', 'drain_qi').drain;
  assert.ok(Math.floor((n - a.freeAction.drainLedger[YUE].lastAt) / drain.diminish.recoverMinutes) >= 3, '夺元递减已恢复');
  assert.ok(today - a.locationLoot.windows['test.loc'].startDay >= GN.loot.respawn.intervalDays, '搜刮已满回刷间隔');
});

test('§4-10 读档静默补拨（applyLoadRepairs → applyTimelineInserts silent）同样遵守冻结；补差额年数也走同一钩子', async () => {
  const s = fresh(), pid = player(s);
  await addictWithdrawal(s, pid);
  SW.recordShiweimoEnding(s, '被制住');
  await plain(s, 60, 'beat');
  const before = { left: withdrawalRow(s, pid).expiresAt - now(s), sinceW: now(s) - rt(s).maiguClock[pid].withdrawalAt, hours: (now(s) - SW.shiweimoRecord(s).endedAt) / 60 };
  // 旧档已过挂点但没拨过：进五原城路线已走（passedWhen 的 trigger/sliceEntered 之一成立）
  rt(s).completedEventIds = [...rt(s).completedEventIds, ...INSERT.passedWhen.anyEventDone];
  await quiet(() => LR.applyLoadRepairs(s));
  assert.equal(s.元数据.时间.年, 220 + GN.story.actionTime.prologueYears, '读档补拨了年数');
  assert.equal(rt(s).timeSkipInterlude, undefined, '静默：不排过场');
  assert.ok(row(s, pid, MG_CFG().addictionStatus), '仍成瘾');
  assert.equal(withdrawalRow(s, pid).expiresAt - now(s), before.left);
  assert.equal(now(s) - rt(s).maiguClock[pid].withdrawalAt, before.sinceW);
  assert.ok(effect(s, withdrawalRow(s, pid).label));
  assert.equal((now(s) - SW.shiweimoRecord(s).endedAt) / 60, before.hours);
  assert.equal(SW.shiweimoRecord(s).status, 'pending');
  assert.equal(SW.rescueWindowOpen('被制住', before.hours), true);
  // 改年数补差额（4→6）：同样冻结
  const timeline = { ...P.CONTENT_PACKS.timeline, inserts: P.CONTENT_PACKS.timeline.inserts.map(x => ({ ...x, years: x.years + 2 })) };
  await jump(s, { silent: true, timeline });
  assert.equal(s.元数据.时间.年, 220 + GN.story.actionTime.prologueYears + 2);
  assert.equal(withdrawalRow(s, pid).expiresAt - now(s), before.left);
  assert.equal((now(s) - SW.shiweimoRecord(s).endedAt) / 60, before.hours);
  // 再读一次：幂等，不再拨钟也不再平移
  const snap = structuredClone({ t: s.元数据.时间, c: rt(s).maiguClock, e: SW.shiweimoRecord(s).endedAt });
  await quiet(() => LR.applyLoadRepairs(s));
  await jump(s, { silent: true, timeline });
  assert.deepEqual({ t: s.元数据.时间, c: rt(s).maiguClock, e: SW.shiweimoRecord(s).endedAt }, snap);
});
