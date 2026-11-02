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
const SA = await loadTs('../src/modules/scenarioMods/stallAutoAdvance.ts');
const { GAME_NUMBERS } = await loadTs('../src/modules/sceneModule/numbers.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const rt = s => s.世界.状态.剧本模组;

// ───────────── 1) P1 新档走完 s01_05 停在 stage_01，s02_01 不出 ─────────────
// 根因：s01_05 完成后本关收束（nextStageReadyId=stage_02），切关只挂在「收拾行装，继续旅程」按钮的点击上；手打／粘贴按钮文字只是普通叙事，
// 本关又已无待推进内容，runtime 每回合把 stallTurns 清零，停滞收束永远不触发。新档（入六朝）也没有 Demo 那套到点合同，主线拍空转从不收束。
// 修：stallAutoAdvance.ts（数值与提示在 mod-kit story.stallAutoAdvance）——启程按钮文字＝点按钮；启程按钮出现后空转 N 回合自动启程；
// 主线拍停滞 N 回合（无场外合同、非场面战）按主线动作结算。MainGamePanel 发送前／回合收尾各接一处。
const STAGES = ['lcq.stage_01', 'lcq.stage_02', 'lcq.stage_03', 'lcq.stage_03b_snake_flower_bridge'];
const MODS = STAGES.map(id => {
  const mod = ec.resolveScenarioContent(cp.applyContentPackOverlays(JSON.parse(read(`src/modules/scenarioMods/builtins/data/${id}.json`))));
  cr.resolveScenarioCharacters(mod.canon?.characters, mod.manifest.id);
  return mod;
});
const S03_07 = 'lcq.event.iron_bridge_ambush'; // 默认路线上 s03_07 铁索桥（qingyu.32.2）由 stage_02 同轴拍承接（stage_03 隔离）
const newSave = () => quiet(() => R.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(MODS[0]))).saveData);
// 夹具化的模型回复：本地推进不读正文，每回合只把固定一段写进叙事历史（不调模型）。
const FIXTURE_REPLY = '风从草原尽头吹来，你在原地看了看四周。';
// 一回合＝MainGamePanel.sendMessage 的本地部分：启程文字 → 主线动作（按钮／原句／停滞到点）→ 推进 → 回合收尾的空转启程。
function turn(save, input, clicked) {
  const trace = {};
  if (SA.stageDepartureFromText(save, input)) {
    const t = quiet(() => init.transitionToNextScenarioStage(save, MODS));
    assert.ok(t.ok, t.reason);
    return { save: t.saveData, trace: { departed: 'text' } };
  }
  rt(save).worldTurn++;
  const auto = clicked ? undefined : SA.stallAutoAdvance(save);
  const action = clicked || NI.resolveStoryEventActionFromText(structuredClone(save), input) || (auto?.kind === 'event' ? auto.action : undefined);
  quiet(() => {
    if (auto?.kind === 'open_world') { trace.openWorld = wuyuan.settleWuyuanOpenWorldSelection(save, auto.selection).settled; }
    else if (action) {
      const receipt = R.recordStoryEventStructuredAction(save, action);
      if (receipt.reason === 'open_world_prerequisites') {
        const local = wuyuan.getWuyuanOpenWorldSelections(save);
        wuyuan.settleWuyuanOpenWorldSelection(save, local.find(a => a.kind === 'problem_action') || local.find(a => a.kind === 'travel'));
      }
      trace.event = action.eventId; trace.auto = Boolean(auto && !clicked);
    }
  });
  save.系统.历史.叙事.push({ type: 'gm', content: FIXTURE_REPLY });
  save = quiet(() => R.advanceScenarioRuntime(save).saveData);
  wuyuan.ensureWuyuanOpenWorldSlice(save);
  if (SA.noteStageDepartureIdleTurn(save)) {
    const t = quiet(() => init.transitionToNextScenarioStage(save, MODS));
    assert.ok(t.ok, t.reason);
    return { save: t.saveData, trace: { ...trace, departed: 'idle' } };
  }
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
  return { input: a?.label || '我看看四周', clicked: a };
};
function walk(mode, limit = 300) {
  let save = newSave();
  const log = [];
  for (let n = 0; n < limit; n++) {
    const r = rt(save);
    if (r.activeEventIds.includes(S03_07)) return { save, log, turns: n };
    const step = mode === 'click' ? clickInput(save) : { input: '我在原地看看四周。' };
    const out = turn(save, step.input, step.clicked);
    save = out.save; log.push({ mod: r.modId, focus: R.getScenarioFocusEvent(r)?.id, ...out.trace });
  }
  assert.fail(`${mode} 走不到 s03_07：停在 ${rt(save).modId} ${rt(save).activeEventIds}`);
}

test('1 复现：旧逻辑下 s01_05 完成后只剩启程按钮，空转回合 stallTurns 每拍清零、不切关', () => {
  let s = walk('click').save; // 先确认整条路能走通，再单独造 s01_05 后的状态
  s = newSave();
  for (let i = 0; i < 12 && !rt(s).nextStageReadyId; i++) s = turn(s, clickInput(s).input, clickInput(s).clicked).save;
  assert.equal(rt(s).modId, 'lcq.stage_01');
  assert.equal(rt(s).nextStageReadyId, 'lcq.stage_02');
  assert.deepEqual(rt(s).activeEventIds, []);
  assert.equal(R.getStageDepartureOffer(s)?.label, '收拾行装，继续旅程');
  for (let i = 0; i < 5; i++) { rt(s).worldTurn++; s = quiet(() => R.advanceScenarioRuntime(s).saveData); }
  assert.equal(rt(s).modId, 'lcq.stage_01', '引擎本身从不自动切关');
  assert.equal(rt(s).stallTurns, 0, '本关已无待推进内容，停滞计数每拍清零——停滞收束轮不到');
});

test('1 粘贴／手打启程按钮文字＝点启程按钮，s02_01 王哲传功接上', () => {
  let s = newSave();
  for (let i = 0; i < 12 && !rt(s).nextStageReadyId; i++) { const c = clickInput(s); s = turn(s, c.input, c.clicked).save; }
  assert.ok(SA.stageDepartureFromText(s, '收拾行装，继续旅程'));
  assert.ok(SA.stageDepartureFromText(s, ' 收拾行装 继续旅程。'));
  assert.equal(SA.stageDepartureFromText(s, '我返回帅帐去见王哲。'), null, '别的句子不当启程');
  const out = turn(s, '收拾行装，继续旅程');
  assert.equal(out.trace.departed, 'text');
  assert.equal(rt(out.save).modId, 'lcq.stage_02');
  assert.deepEqual(rt(out.save).activeEventIds, ['lcq.event.s02_01']);
});

test('1 启程按钮出现后空转 N 回合自动启程（N 读 mod-kit）', () => {
  const N = GAME_NUMBERS.story.stallAutoAdvance.stageDepartureIdleTurns;
  assert.ok(N > 0);
  let s = newSave();
  for (let i = 0; i < 12 && !rt(s).nextStageReadyId; i++) { const c = clickInput(s); s = turn(s, c.input, c.clicked).save; }
  const results = [];
  for (let i = 0; i < N; i++) { const out = turn(s, '我返回帅帐去见王哲。'); results.push(out.trace.departed); s = out.save; }
  assert.deepEqual(results, [...Array(N - 1).fill(undefined), 'idle']);
  assert.equal(rt(s).modId, 'lcq.stage_02');
  assert.ok(rt(s).activeEventIds.includes('lcq.event.s02_01'));
  assert.equal(s.系统.扩展.stageDepartureIdle, undefined, '切关后空转计数作废');
});

test('1 自动化：新档「点主线按钮」一路推进到 s03_07（铁索桥）', () => {
  const { save, log } = walk('click');
  assert.equal(rt(save).modId, 'lcq.stage_02');
  assert.ok(log.some(x => x.departed === 'text'), '经启程按钮切到 stage_02');
  assert.ok(!log.some(x => x.auto), '点按钮的路线不靠停滞到点');
  for (const id of ['lcq.event.s02_01', 'lcq.event.s02_04', 'lcq.event.free_ajiman', 'lcq.event.wuerlang_joins']) assert.ok(rt(save).completedEventIds.includes(id), id);
});

test('1 自动化：新档「空转」（停滞自动收束）一路推进到 s03_07（铁索桥）', () => {
  const { save, log, turns } = walk('idle');
  assert.equal(rt(save).modId, 'lcq.stage_02');
  assert.ok(log.some(x => x.departed === 'idle'), '启程靠空转到点');
  assert.ok(log.filter(x => x.auto).length >= 10, '主线拍靠停滞到点结算');
  assert.ok(log.some(x => x.openWorld), 's02_04 开放世界前置也能到点代走');
  assert.ok((rt(save).offscreenResolvedEventIds || []).includes('lcq.event.s02_02'), 's02_02 场外收束后五原切片照样打开（旧逻辑只认 completedEventIds，s02_04 永远完成不了）');
  for (const id of ['lcq.event.s01_05', 'lcq.event.s02_01', 'lcq.event.s02_04', 'lcq.event.free_ajiman', 'lcq.event.wuerlang_joins']) assert.ok([...rt(save).completedEventIds, ...(rt(save).offscreenResolvedEventIds || [])].includes(id) || id.startsWith('lcq.event.s01'), id);
  assert.ok(turns < 200, `空转回合数 ${turns}`);
});

test('1 有场外到点合同的拍不抢跑；Demo 档不套用', async () => {
  let s = newSave();
  for (let i = 0; i < 12 && !rt(s).activeEventIds.includes('lcq.event.s01_02'); i++) { const c = clickInput(s); s = turn(s, c.input, c.clicked).save; }
  rt(s).stallTurns = 9;
  assert.equal(SA.stallAutoAdvance(s), undefined, 's01_02 段强之死有 offscreenResolution，由它自己收');
  const opening = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const demo = quiet(() => opening.createQingyuOpeningPlaytestSave(MODS[0], '2026-11-02T00:00:00.000Z'));
  rt(demo).stallTurns = 9;
  assert.equal(SA.stallAutoAdvance(demo), undefined, 'Demo 只认自己的到点合同');
});

test('1 MainGamePanel 接线：发送前认启程文字、停滞到点补主线动作、回合收尾数空转', () => {
  const panel = read('src/components/dashboard/MainGamePanel.vue');
  assert.match(panel, /stageDepartureFromText\(/);
  assert.match(panel, /stallAutoAdvance\(/);
  assert.match(panel, /noteStageDepartureIdleTurn\(/);
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

test('2 输局后「与来敌交手」：无名来袭者已散、不在在场名单，交手票按不在场拒掉（不掷骰的原因）', async () => {
  const h = await randomBattle(10);
  const raw = [{ actionClass: 'physical', variant: 'attack', targetId: 'lcq.enemy.guiwang_warrior', degree: 'normal', performed: 'yes', evidence: '与来敌交手', itemId: null }];
  const checked = quiet(() => T.validateFreeActionTickets(raw, '与来敌交手', h.save));
  assert.equal(checked.tickets.length, 0);
  assert.deepEqual(checked.discards.map(d => d.reason), ['target_not_present']);
  assert.equal(checked.refusals.length, 1, '只留一行「人不在身边、落了空」的未发生事实');
});

test('2 controller：判负结果行与收场同一句配置文案，不再写死', () => {
  const src = read('src/modules/sceneModule/host/controller.ts');
  assert.doesNotMatch(src, /'你伤重倒下，这一战败了。'/);
  assert.equal((src.match(/rememberSceneClose\(save,body\)/g) || []).length, 2, '随机战与剧情战两个收场分支都写记忆');
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
