// REPORT-8091-ef573ece 复测修复回归。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { search: '', hostname: 'localhost' };
const quiet = fn => { const log = console.log, info = console.info, warn = console.warn; console.log = console.info = console.warn = () => {}; try { return fn(); } finally { Object.assign(console, { log, info, warn }); } };
const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const cp = await loadTs('../src/modules/contentPacks/index.ts');
const ec = await loadTs('../src/modules/scenarioMods/entityCatalog.ts');
const cr = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const NI = await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
const wuyuan = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const BP = await loadTs('../src/modules/scenarioMods/beatProgress.ts');
const { GAME_NUMBERS } = await loadTs('../src/modules/sceneModule/numbers.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const rt = s => s.世界.状态.剧本模组;

// ───────────── 1) P1 新档走完 s01_05 停在 stage_01，s02_01 不出 ─────────────
// 根因：s01_05 完成后本关收束（nextStageReadyId=stage_02），切关只挂在「收拾行装，继续旅程」按钮的点击上；手打／粘贴按钮文字只是普通叙事，
// 本关又已无待推进内容，runtime 每回合把 stallTurns 清零，停滞收束永远不触发。
// e174ed57 曾补「空转 N 回合自动启程」「主线拍停滞 N 回合代结算」；用户 2026-11-02 拍板改为剧情推进机制（beatProgress.ts）：
// 本拍动作表是唯一结算入口（按钮／原句／标签／作者短语，启程按钮＝本关最后一个动作，手打按钮文字＝点击）；手打对不上不推进、提示并记 miss；
// 停滞到点只认作者写明 deadline 的拍（回合数在 story.beatProgress.deadlineTurns）；启程空转只提示、不自动出发。
const STAGES = ['lcq.stage_01', 'lcq.stage_02', 'lcq.stage_03', 'lcq.stage_03b_snake_flower_bridge'];
const MODS = STAGES.map(id => {
  const mod = ec.resolveScenarioContent(cp.applyContentPackOverlays(JSON.parse(read(`src/modules/scenarioMods/builtins/data/${id}.json`))));
  cr.resolveScenarioCharacters(mod.canon?.characters, mod.manifest.id);
  return mod;
});
const S03_07 = 'lcq.event.iron_bridge_ambush'; // 默认路线上 s03_07 铁索桥（qingyu.32.2）由 stage_02 同轴拍承接（stage_03 隔离）
const newSave = () => quiet(() => R.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(MODS[0]))).saveData);
// 夹具化的模型回复：本地推进不读正文，每回合只把固定一段写进叙事历史（不调模型）。
const FIXTURE_REPLY = '风从草原尽头吹来，你在原地看了看四周。月霜的寒毒被真阳化解，王哲传你九阳神功。';
// 一回合＝MainGamePanel.sendMessage 的本地部分：发送前对齐到点配置 → 启程文字 → 本拍动作（按钮／原句／短语，对不上记 miss）→ 推进 → 回合收尾的空转提示。
function turn(save, input, clicked) {
  const trace = {};
  BP.applyBeatDeadlines(rt(save).events);
  BP.prepareBeatDeadlineTurn(save);
  const typed = clicked ? undefined : BP.resolveBeatText(save, input);
  if (typed?.action.kind === 'departure') {
    const t = quiet(() => init.transitionToNextScenarioStage(save, MODS));
    assert.ok(t.ok, t.reason);
    return { save: t.saveData, trace: { departed: 'text', via: typed.via } };
  }
  rt(save).worldTurn++;
  const action = clicked || (typed?.action.kind === 'event' ? typed.action.selection : undefined);
  trace.via = clicked ? 'button' : typed ? typed.via : BP.beatActionTable(save).actions.length ? 'miss' : 'none';
  if (trace.via === 'miss') trace.notice = BP.beatMissNotice(save);
  quiet(() => {
    if (action) {
      const receipt = R.recordStoryEventStructuredAction(save, action);
      // s02_04 主线按钮要先完成五原开放世界前置：玩家点开放世界按钮（同属本拍可做的动作）。
      if (receipt.reason === 'open_world_prerequisites') {
        const local = wuyuan.getWuyuanOpenWorldSelections(save);
        trace.openWorld = wuyuan.settleWuyuanOpenWorldSelection(save, local.find(a => a.kind === 'problem_action') || local.find(a => a.kind === 'travel')).settled;
      }
      trace.event = action.eventId;
    }
  });
  const before = structuredClone(save);
  save.系统.历史.叙事.push({ type: 'gm', content: FIXTURE_REPLY });
  save = quiet(() => R.advanceScenarioRuntime(save).saveData);
  wuyuan.ensureWuyuanOpenWorldSlice(save);
  trace.deadline = BP.deadlineResolvedThisTurn(before, save);
  trace.idleNotice = BP.noteStageDepartureIdleTurn(save);
  return { save, trace };
}
// 「点主线按钮」：当前主线拍的引擎按钮；启程按钮在场就点启程（真机驱动把按钮文字填进输入框发送，与点击同一结算）。
const clickInput = save => {
  const offer = R.getStageDepartureOffer(save);
  if (offer) return { input: offer.label };
  const focus = R.getScenarioFocusEvent(rt(save));
  const actions = R.getCurrentStoryEventActions(save).filter(a => a.eventId === focus?.id);
  const ids = new Set((focus?.playerCompletionContract?.actions || []).map(a => a.id));
  const a = actions.find(x => ids.has(x.actionId)) || actions.find(x => x.actionId.startsWith('travel:'));
  return { input: a?.playerLine || '我看看四周', clicked: a };
};
function walk(limit = 300) {
  let save = newSave();
  const log = [];
  for (let n = 0; n < limit; n++) {
    const r = rt(save);
    if (r.activeEventIds.includes(S03_07)) return { save, log, turns: n };
    const step = clickInput(save);
    const out = turn(save, step.input, step.clicked);
    save = out.save; log.push({ mod: r.modId, focus: R.getScenarioFocusEvent(r)?.id, ...out.trace });
  }
  assert.fail(`走不到 s03_07：停在 ${rt(save).modId} ${rt(save).activeEventIds}`);
}
const toStageReady = () => {
  let s = newSave();
  for (let i = 0; i < 12 && !rt(s).nextStageReadyId; i++) { const c = clickInput(s); s = turn(s, c.input, c.clicked).save; }
  return s;
};

test('1 复现：s01_05 完成后只剩启程按钮，空转回合 stallTurns 每拍清零、引擎本身从不切关', () => {
  const s = toStageReady();
  assert.equal(rt(s).modId, 'lcq.stage_01');
  assert.equal(rt(s).nextStageReadyId, 'lcq.stage_02');
  assert.deepEqual(rt(s).activeEventIds, []);
  assert.equal(R.getStageDepartureOffer(s)?.label, '收拾行装，继续旅程');
  for (let i = 0; i < 5; i++) { rt(s).worldTurn++; Object.assign(s, quiet(() => R.advanceScenarioRuntime(s).saveData)); }
  assert.equal(rt(s).modId, 'lcq.stage_01', '引擎本身从不自动切关');
  assert.equal(rt(s).stallTurns, 0, '本关已无待推进内容，停滞计数每拍清零——停滞收束轮不到');
});

test('1 启程按钮＝本关最后一个动作：粘贴／手打按钮文字＝点启程，s01_05 之后 s02_01 王哲传功接上', () => {
  const s = toStageReady();
  const table = BP.beatActionTable(s).actions;
  assert.deepEqual(table.map(a => a.kind), ['departure'], '收束后本拍动作表只剩启程');
  assert.equal(BP.resolveBeatText(s, '收拾行装，继续旅程')?.action.kind, 'departure');
  assert.equal(BP.resolveBeatText(s, ' 收拾行装 继续旅程。')?.action.kind, 'departure');
  assert.equal(BP.resolveBeatText(s, '我返回帅帐去见王哲。'), undefined, '别的句子不当启程');
  const out = turn(s, '收拾行装，继续旅程');
  assert.equal(out.trace.departed, 'text');
  assert.equal(rt(out.save).modId, 'lcq.stage_02');
  assert.deepEqual(rt(out.save).activeEventIds, ['lcq.event.s02_01'], 's02_01 王哲传功出现');
  assert.equal(R.getScenarioFocusEvent(rt(out.save))?.id, 'lcq.event.s02_01');
});

test('1 启程按钮空转 N 回合（N 读 mod-kit）只提示、不自动出发；提示后重新计数', () => {
  const N = GAME_NUMBERS.story.beatProgress.departureIdleTurns;
  assert.ok(N > 0);
  assert.equal(GAME_NUMBERS.story.stallAutoAdvance, undefined, '通用「主线停滞代结算／空转自动启程」配置已撤');
  let s = toStageReady();
  const notices = [];
  for (let i = 0; i < 2 * N + 2; i++) { const out = turn(s, '我在营地里四处走走。'); notices.push(out.trace.idleNotice); s = out.save; assert.equal(out.trace.departed, undefined); }
  assert.equal(rt(s).modId, 'lcq.stage_01', '从不自动启程');
  assert.equal(rt(s).nextStageReadyId, 'lcq.stage_02');
  const at = notices.map((n, i) => n ? i : -1).filter(i => i >= 0);
  // 启程按钮出现的那一回合记 0，再空转 N 回合提示一次；提示后重新计数。
  assert.deepEqual(at, [N - 1, 2 * N - 1], `空转满 N 回合提示一次，之后再满 N 回合再提示：${JSON.stringify(notices)}`);
  assert.ok(notices[N - 1].includes('收拾行装，继续旅程'));
});

test('1 自动化：新档逐拍点主线按钮一路推进到 s03_07（铁索桥），每拍都靠按钮结算', () => {
  const { save, log } = walk();
  assert.equal(rt(save).modId, 'lcq.stage_02');
  assert.ok(log.some(x => x.departed === 'text'), '经启程按钮切到 stage_02');
  assert.ok(!log.some(x => x.via === 'miss'), '点按钮从不落空');
  assert.ok(!log.some(x => x.deadline?.length), '点按钮的路线不靠到点收束');
  for (const id of ['lcq.event.s02_01', 'lcq.event.s02_04', 'lcq.event.free_ajiman', 'lcq.event.wuerlang_joins']) assert.ok(rt(save).completedEventIds.includes(id), id);
  const settled = log.map(x => x.event).filter(Boolean);
  for (const id of ['lcq.event.s01_01', 'lcq.event.s01_02', 'lcq.event.s01_03', 'lcq.event.s01_04', 'lcq.event.s01_05', 'lcq.event.s01_06']) assert.ok(settled.includes(id), `${id} 靠按钮结算`);
  const departed = log.findIndex(x => x.departed === 'text');
  assert.equal(log[departed + 1]?.focus, 'lcq.event.s02_01', '启程后第一拍就是 s02_01 王哲传功');
  assert.ok(settled.indexOf('lcq.event.s02_01') > settled.indexOf('lcq.event.s01_05'));
});

test('1 手打对不上不推进：只提示本拍可做的动作并记 beat.resolve miss；正文写了寒毒、真阳也不结算', () => {
  let s = newSave();
  const beat = R.getScenarioFocusEvent(rt(s))?.id;
  const done = [...rt(s).completedEventIds];
  const out = turn(s, '我在原地看看四周。');
  assert.equal(out.trace.via, 'miss');
  assert.match(out.trace.notice, /剧情没有推进/);
  const labels = BP.beatActionTable(s).actions.map(a => a.selection.label);
  assert.ok(labels.length && labels.every(label => out.trace.notice.includes(label)), `提示列出本拍动作：${out.trace.notice}`);
  assert.deepEqual(rt(out.save).completedEventIds, done, '没有结算');
  assert.equal(R.getScenarioFocusEvent(rt(out.save))?.id, beat);
  const entry = BP.logBeatResolve(out.save, 'miss');
  assert.equal(entry?.code, 'LCQ-SAV-054');
  assert.equal(entry?.detail?.beatId, beat);
  assert.equal(entry?.detail?.via, 'miss');
  assert.equal(BP.logBeatResolve(out.save, 'button', { eventId: beat, actionId: 'advance_declared_objective' })?.code, 'LCQ-SAV-053');
});

test('1 撤掉通用停滞代结算：没写 deadline 的主线拍空转 30 回合不推进；写了 deadline 的拍照常到点', () => {
  let s = newSave();
  const first = R.getScenarioFocusEvent(rt(s))?.id;
  assert.equal(first, 'lcq.event.s01_01');
  assert.equal(rt(s).events.find(e => e.id === first).offscreenResolution, undefined, 's01_01 作者没写到点');
  for (let i = 0; i < 30; i++) s = turn(s, '我在原地看看四周。').save;
  assert.equal(R.getScenarioFocusEvent(rt(s))?.id, first, '不再代玩家选主线动作');
  assert.ok(!rt(s).completedEventIds.includes(first));
});

test('1 s01_06 月霜寒毒到点回合数进配置（默认 5），每回合发送前写进拍；改配置即生效', () => {
  assert.equal(BP.beatDeadlineTurns('lcq.event.s01_06'), 5);
  assert.equal(BP.beatDeadlineTurns('lcq.event.s01_01'), undefined, '只给配置里列出的拍');
  const reach = () => {
    let s = newSave();
    for (let i = 0; i < 20 && !rt(s).activeEventIds.includes('lcq.event.s01_06'); i++) { const c = clickInput(s); s = turn(s, c.input, c.clicked).save; }
    assert.ok(rt(s).activeEventIds.includes('lcq.event.s01_06'));
    let turns = 0, out;
    do { out = turn(s, '我在原地看看四周。'); s = out.save; turns++; } while (!out.trace.deadline.includes('lcq.event.s01_06') && turns < 20);
    return { s, turns };
  };
  const base = reach();
  assert.equal(base.turns, 5, `默认配置到点：${base.turns} 回合`);
  const N = GAME_NUMBERS.story.beatProgress.deadlineTurns;
  const saved = N['lcq.event.s01_06'];
  try {
    N['lcq.event.s01_06'] = 2;
    const fast = reach();
    assert.equal(fast.turns, 2, `改成 2 回合后到点：${fast.turns} 回合`);
    assert.equal(rt(fast.s).events.find(e => e.id === 'lcq.event.s01_06').offscreenResolution.afterStallTurns, 2);
  } finally { N['lcq.event.s01_06'] = saved; }
});

test('1 deadline 到点当回合仍优先玩家按钮；准备到点不直接落账，失败快照可回退', () => {
  let save = newSave();
  while (!rt(save).activeEventIds.includes('lcq.event.s01_06')) { const c = clickInput(save); save = turn(save, c.input, c.clicked).save; }
  for (let i = 0; i < 4; i++) save = turn(save, '我看看四周。').save;
  assert.ok(!rt(save).offscreenResolvedEventIds.includes('lcq.event.s01_06'));
  const checkpoint = structuredClone(save);
  assert.equal(BP.prepareBeatDeadlineTurn(save), true);
  assert.ok(!rt(save).offscreenResolvedEventIds.includes('lcq.event.s01_06'), '准备阶段不结算');
  assert.ok(!rt(checkpoint).forcedWorldEventIds?.includes('lcq.event.s01_06'), '发送前快照没有预结算标记');
  const c = clickInput(save); save = turn(save, c.input, c.clicked).save;
  assert.ok(rt(save).completedEventIds.includes('lcq.event.s01_06'));
  assert.ok(!rt(save).offscreenResolvedEventIds.includes('lcq.event.s01_06'), '到点按钮仍按玩家动作完成');
});

test('1 Demo 档不提示启程空转', async () => {
  const opening = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const demo = quiet(() => opening.createQingyuOpeningPlaytestSave(MODS[0], '2026-11-02T00:00:00.000Z'));
  rt(demo).nextStageReadyId = rt(demo).nextStageId;
  assert.equal(BP.noteStageDepartureIdleTurn(demo), undefined);
});

test('1 跨国切关：启程改为打开地图点选，到了目标国再切关', async () => {
  const dir = 'src/modules/scenarioMods/builtins/data/';
  const ids = ['lyl.taiquan_afterfall', 'lyl.luoyang_cloud_secret'];
  const mods = ids.map(id => ec.resolveScenarioContent(cp.applyContentPackOverlays(JSON.parse(read(`${dir}${id}.json`)))));
  for (const mod of mods) cr.resolveScenarioCharacters(mod.canon?.characters, mod.manifest.id);
  const map = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
  const s = quiet(() => R.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(mods[0]))).saveData);
  rt(s).nextStageReadyId = rt(s).nextStageId;
  assert.equal(rt(s).nextStageId, 'lyl.luoyang_cloud_secret');
  s.角色.位置 = { ...s.角色.位置, locationId: 'liuchao.location.taiquan' }; // 本关最后几拍在太泉，下一关洛都在汉
  const target = BP.stageDepartureMapTarget(s, mods);
  assert.ok(target, '太泉→汉跨国，启程改走地图');
  assert.equal(map.countryOf(target.mapTargetId), '汉');
  assert.equal(BP.stageDepartureArrived(s), undefined, '人还没到汉，不切关');
  const selection = map.selectMapTravel(s, target.mapTargetId);
  assert.ok(selection && map.settleMapTravel(s, selection), '地图上点选目标落点');
  assert.equal(BP.stageDepartureArrived(s), 'lyl.luoyang_cloud_secret');
  assert.equal(s.系统.扩展.stageDepartureMap, undefined, '待启程标记清掉');
  const t = quiet(() => init.transitionToNextScenarioStage(s, mods));
  assert.ok(t.ok, t.reason);
  assert.equal(rt(t.saveData).modId, 'lyl.luoyang_cloud_secret');
  // 同国（清羽 stage_01→02）照常直接启程
  assert.equal(BP.stageDepartureMapTarget(toStageReady(), MODS), undefined);
});

test('1 MainGamePanel 接线：动作表结算、miss 提示与日志、到点对齐、空转只提示、跨国走地图；撤掉自动启程与停滞代结算', () => {
  const panel = read('src/components/dashboard/MainGamePanel.vue');
  for (const call of ['resolveBeatText(', 'beatMissNotice(', 'logBeatResolve(', 'applyBeatDeadlines(', 'noteStageDepartureIdleTurn(', 'stageDepartureMapTarget(', 'deadlineResolvedThisTurn(']) assert.ok(panel.includes(call), call);
  assert.doesNotMatch(panel, /stallAutoAdvance|idleDeparture\.nextStageId/);
  assert.match(read('src/components/dashboard/GameMapPanel.vue'), /stageDepartureArrived\(arrived\)/);
  assert.match(read('src/components/dashboard/RightSidebar.vue'), /stageDepartureMapTarget\(/);
});

// ───────────── 2) P1 南荒交锋气血 10→1 后卡片消失、看不到判负；之后自由交手 5 次气血一直 1、不掷骰 ─────────────
// 根因：随机战按合同（defeat.outcome=continue）判负收场、气血拉回 afterLossContinueHp=1，收场正文却只有合同的「你倒在地上……散入四野」，
// 「这一战败了」只在掷骰当拍气血打到倒下时才补；而场面每拍与收场只进叙事历史、不进短期记忆，叙事模型下一回合不知道已经败了、来袭者已散，
// 接着写乱战。玩家再「与来敌交手」，自由行动的对手是不在场名单里的无名来袭者（已散），交手票按 target_unavailable 拒掉——所以连掷骰都没有，气血也不动。
// （f2d02e3b 修的是「对在场者交手失手扣血不保底」，这里的票根本没到判定那一步。）
// 修：判负收场正文第一行写 combat.sceneClose.loseHeadline（mod-kit），掷骰当拍倒下的结果行同一句；收场正文（胜负都算）写进短期记忆，叙事接得上胜负。
const host = await loadTs('../src/modules/sceneModule/host/controller.ts');
const ext = await loadTs('../src/modules/sceneModule/host/ext.ts');
const E = await loadTs('../src/modules/scenarioMods/randomEncounter.ts');
const T = await loadTs('../src/modules/scenarioMods/freeAction/ticket.ts');
async function randomBattle(hp) {
  globalThis.location = { search: '?sceneModule=on', hostname: 'localhost', href: 'http://localhost/?sceneModule=on' };
  let save = quiet(() => R.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(JSON.parse(read('src/modules/scenarioMods/builtins/data/lcq.stage_05b.json'))))).saveData);
  const config = structuredClone(GAME_NUMBERS.encounter), loc = 'lcq.location.guiwang_inn';
  config.tiers.hostile = { chance: 1, cooldownTurns: 0 };
  config.regions.nanhuang.zones = [{ key: loc, tier: 'hostile' }];
  config.regions.nanhuang.pool = [{ enemyId: 'lcq.enemy.guiwang_warrior', level: 3, zones: [loc], weight: 1, count: [9, 9] }];
  config.regions.nanhuang.skipDuringEventIds = [];
  for (let i = 0; i < 4; i++) { rt(save).worldTurn++; E.tickRandomEncounter(save, { narrated: true, config }); }
  assert.ok(E.pendingRandomBattle(save));
  save.角色.属性.气血 = { 当前: hp, 上限: 100 };
  save.社交 = { ...(save.社交 || {}), 记忆: { 短期记忆: ['【仙道200年1月10日 22:00】鬼王峒武士围了上来。'], 中期记忆: [], 长期记忆: [] } };
  const h = { get save() { return save; }, deps: { persist: async next => { save = structuredClone(next); } } };
  await quiet(() => host.submitSceneInput(h.save, '与来敌交手', h.deps));
  return h;
}
const HEAD = () => GAME_NUMBERS.combat.sceneClose.loseHeadline;

test('2 随机战判负：收场正文第一行写明这一战败了，并写进短期记忆（复现：只进叙事历史，模型不知道已败）', async () => {
  assert.equal(HEAD(), '你伤重倒下，这一战败了。');
  const h = await randomBattle(10);
  ext.activeScene(h.save).state.forced = { action: Array(200).fill(1), defense: Array(400).fill(1) };
  for (let i = 0; i < 12 && ext.activeScene(h.save); i++) {
    if (!ext.activeScene(h.save).pending) await quiet(() => host.submitSceneInput(h.save, '与来敌交手', h.deps));
    await quiet(() => host.confirmSceneAction(h.save, h.deps));
  }
  assert.equal(ext.activeScene(h.save), null, '交锋卡片收场');
  assert.equal(ext.readExt(h.save).history.at(-1)?.outcome, 'lose');
  assert.equal(h.save.角色.属性.气血.当前, GAME_NUMBERS.combat.woundRules.hp.afterLossContinueHp, '按合同输局继续，拉回 1');
  assert.equal(rt(h.save).gameOver, undefined, '随机战合同 defeat=continue，不进结局');
  const closing = String(h.save.系统.历史.叙事.at(-1).content);
  assert.ok(closing.startsWith(HEAD()), `收场正文第一行写判负：${closing}`);
  assert.match(closing, /散入四野/, '合同的输局收场照常');
  const memory = h.save.社交.记忆.短期记忆.at(-1);
  assert.ok(memory.includes(HEAD()) && memory.includes('散入四野'), '短期记忆里有这一战的胜负与来袭者已散');
  assert.equal((closing.match(new RegExp(HEAD(), 'g')) || []).length, 1, '不重复');
});

test('2 随机战判胜：收场也写进短期记忆，不加判负行', async () => {
  const h = await randomBattle(100);
  ext.activeScene(h.save).state.forced = { action: Array(200).fill(20), defense: Array(400).fill(20) };
  for (let i = 0; i < 40 && ext.activeScene(h.save); i++) {
    if (!ext.activeScene(h.save).pending) await quiet(() => host.submitSceneInput(h.save, '与来敌交手', h.deps));
    await quiet(() => host.confirmSceneAction(h.save, h.deps));
  }
  assert.equal(ext.readExt(h.save).history.at(-1)?.outcome, 'win');
  const memory = h.save.社交.记忆.短期记忆.at(-1);
  assert.match(memory, /来袭者尽数倒下/);
  assert.ok(!memory.includes(HEAD()));
});

// REPORT-8091-98199e80 P1 起：这正是「自由交手不扣血」的根因——无名来袭者（敌人种类 id）不是任何已知人物，攻击票改按无名来敌收下、签发判定（freeAction.ticket.unlistedFoe）。
test('2 输局后「与来敌交手」：无名来袭者不在在场名单，攻击票按无名来敌收下（targetId 置空），不再按不在场拒', async () => {
  const h = await randomBattle(10);
  const raw = [{ actionClass: 'physical', variant: 'attack', targetId: 'lcq.enemy.guiwang_warrior', degree: 'normal', performed: 'yes', evidence: '与来敌交手', itemId: null }];
  const checked = quiet(() => T.validateFreeActionTickets(raw, '与来敌交手', h.save));
  assert.deepEqual(checked.tickets.map(t => [t.variant, t.targetId]), [['attack', null]]);
  assert.deepEqual(checked.discards, []);
  assert.deepEqual(checked.refusals, []);
});

test('2 controller：判负结果行与收场同一句配置文案，不再写死', () => {
  const src = read('src/modules/sceneModule/host/controller.ts');
  assert.doesNotMatch(src, /'你伤重倒下，这一战败了。'/);
  assert.match(src, /writeCombatResult\(save,\{\.\.\.result,memoryLine:body\}\)/, '场面收场与自由行动共用写回');
});

// ───────────── 3) P2 普通叙事没有总时长上限：B15 模型流卡死 300 秒才中止重试，粘贴标签回合 101.7 秒 ─────────────
// 根因：场面描写有 combat.narrationBudget（631f0936），普通叙事回合（processPlayerAction）只有流式空闲超时与重试，没有总时长上限；
// 流卡住时整拍停在 processing，回合账不结清。
// 修：story.narrativeTurnBudget.totalMs（mod-kit，90 秒）——MainGamePanel 用 raceTurnBudget 包住 processPlayerAction，到点掐断本回合在途请求、
// 不再等，按生成失败兜底（撤回本回合预结算、保留输入），弹配置里的提示；外层 finally 照常结清回合账、发完成信号。模型／API 配置不动。
const TS = await loadTs('../src/composables/turnSignal.ts');
test('3 raceTurnBudget：请求卡死到点即返回 expired、先调 onExpire；按时返回照常取值；失败照常抛；0＝不设上限', async () => {
  let expiredCalls = 0;
  const started = Date.now();
  const hung = await TS.raceTurnBudget(new Promise(() => {}), 30, () => { expiredCalls++; });
  assert.deepEqual(hung, { expired: true });
  assert.equal(expiredCalls, 1);
  assert.ok(Date.now() - started < 1000, '不再等卡死的请求');
  assert.deepEqual(await TS.raceTurnBudget(Promise.resolve('ok'), 1000, () => { expiredCalls++; }), { expired: false, value: 'ok' });
  await assert.rejects(TS.raceTurnBudget(Promise.reject(new Error('boom')), 1000, () => {}), /boom/);
  assert.deepEqual(await TS.raceTurnBudget(new Promise(r => setTimeout(() => r(7), 20)), 0, () => { expiredCalls++; }), { expired: false, value: 7 });
  assert.equal(expiredCalls, 1, '按时返回不触发超时');
  // 超时后被放弃的请求迟到失败，不成为未处理拒绝
  let late; const lateRun = new Promise((_, reject) => { late = reject; });
  assert.deepEqual(await TS.raceTurnBudget(lateRun, 10, () => {}), { expired: true });
  late(new Error('late')); await new Promise(r => setTimeout(r, 10));
});

test('3 超时后回合账照常结清：data-turn-state 回 ready、seq+1 发一次完成信号', async () => {
  const ledger = { inFlight: 0, seq: 0 };
  const events = [];
  const target = new EventTarget(); target.addEventListener(TS.TURN_COMPLETE_EVENT, e => events.push(e.detail));
  TS.beginTurn(ledger);
  try { assert.equal((await TS.raceTurnBudget(new Promise(() => {}), 10, () => {})).expired, true); }
  finally { TS.completeTurn(ledger, processing => ({ processing, ended: false, choiceOnly: false }), target); }
  assert.deepEqual(events, [{ seq: 1, state: 'ready' }]);
});

test('3 上限与提示在 mod-kit，低于驱动 300 秒，模型配置不动；MainGamePanel 接线', () => {
  const budget = GAME_NUMBERS.story.narrativeTurnBudget;
  assert.ok(budget.totalMs > GAME_NUMBERS.combat.narrationBudget.totalMs && budget.totalMs < 300000, String(budget.totalMs));
  assert.match(budget.notice, /\{seconds\}/);
  assert.match(budget.notice, /输入已保留/);
  const panel = read('src/components/dashboard/MainGamePanel.vue');
  assert.match(panel, /const captured = await captureAIResponseError\(\(\) => raceTurnBudget\(bidirectionalSystem\.processPlayerAction\(/);
  assert.match(panel, /narrativeBudgetExpired = true;\s*aiService\.abortQingyuTurnRequests\(qingyuTurnId\);/);
  assert.match(panel, /shouldAbort: \(\) => narrativeBudgetExpired \|\|/);
  assert.match(panel, /if \(captured\.response\.expired\) \{\s*hasError = true;\s*aiResponse = null;\s*return;/, '到点直接按失败兜底返回，被掐断的请求迟到的错误不再另弹「AI处理失败」');
});
