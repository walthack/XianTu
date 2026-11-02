// REPORT-8091-1892cfb6 复测修复回归。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const json = p => JSON.parse(read(p));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: {
  '@': fileURLToPath(new URL('../src', import.meta.url)),
  './characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
  '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const load = p => jiti.import(new URL('../src/' + p, import.meta.url).pathname);
const R = await load('modules/scenarioMods/runtime.ts');
const NI = await load('modules/scenarioMods/naturalIntentRouter.ts');
const { parseScenarioMod } = await load('modules/scenarioMods/validator.ts');
const init = await load('modules/scenarioMods/strictInitializer.ts');
const { createMinimalSaveDataV3 } = await load('utils/dataRepair.ts');
const rt = s => s.世界.状态.剧本模组;
const quiet = fn => { const log = console.log; console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const STAGE_01 = 'src/modules/scenarioMods/builtins/data/lcq.stage_01.json';
const S0106 = 'lcq.event.s01_06';
const newGameAt = (eventId, stage = json(STAGE_01)) => quiet(() => {
  const mod = parseScenarioMod(stage);
  let s = R.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(mod))).saveData;
  for (let i = 0; i < 20 && !rt(s).activeEventIds.includes(eventId); i++) {
    const [a] = R.getCurrentStoryEventActions(s);
    if (a?.source === 'event_engine') R.recordStoryEventStructuredAction(s, a);
    s = R.advanceScenarioRuntime(s).saveData;
  }
  assert.ok(rt(s).activeEventIds.includes(eventId), eventId);
  return s;
});

// ───────────── 1) P1 新档主线卡在 s01_06（月霜寒毒）约 35 回合不结算 ─────────────
// 根因：s01_06 的作者短语只有「帮月霜压住寒毒／救治月霜的寒毒／设法缓解月霜寒毒」三条（Demo 再加五条），真机说法「亲手替月霜引出寒毒」
// 一条都对不上，只能指望意图模型；叙事写成「寒毒已经退了」也救不回来——事件对账要求 rail 锚点「月霜、寒毒、真阳」全在正文里，
// 玩家版本的救治不会写「真阳」；而 s01_06 又是 s01 里唯一既没有场外到点（offscreenResolution）、又没有作者后补短语的主线拍，停滞没有尽头。
// 修：s01_06 并入真机说法（与 Demo 合并成 ≤8 条写进内置关，overlay 同步；短语变短后补「不救月霜／不替月霜」等否定 rejectIf），补场外到点合同（停滞 5 轮按正典收束，文案不写过程）；旧档读档补齐。
const TYPED_CURE = '我按卓云君的指点，亲手替月霜引出寒毒…';
const OLD_ANY = ['帮月霜压住寒毒', '救治月霜的寒毒', '设法缓解月霜寒毒'];
const OLD_DEMO = ['见月霜', '应对眼前危局', '压住寒毒', '替月霜疗伤', '救月霜'];
const OLD_REJECT = ['不管月霜', '丢下月霜', '任由寒毒发作', '转身离开'];
const oldStage01 = () => {
  const stage = json(STAGE_01);
  const event = stage.scenario.events.find(e => e.id === S0106);
  delete event.offscreenResolution;
  event.playerCompletionContract.actions[0].intentMatch = { matchAny: OLD_ANY, rejectIf: OLD_REJECT };
  return stage;
};

test('1 s01_06：真机手打的救治说法直接落到主线（复现：旧短语对不上）', () => {
  const old = newGameAt(S0106, oldStage01());
  assert.equal(NI.resolveStoryEventActionFromText(structuredClone(old), TYPED_CURE), undefined, '复现：旧短语对不上真机原话');
  const s = newGameAt(S0106);
  const hit = NI.resolveStoryEventActionFromText(structuredClone(s), TYPED_CURE);
  assert.equal(hit?.eventId, S0106);
  assert.equal(quiet(() => R.recordStoryEventStructuredAction(structuredClone(s), hit)).completed, true);
  assert.equal(NI.resolveStoryEventActionFromText(structuredClone(s), '我运功替她化解寒毒')?.eventId, S0106);
  assert.equal(NI.resolveStoryEventActionFromText(structuredClone(s), '我应对眼前危局。')?.eventId, S0106, '建议原句');
  assert.equal(NI.resolveStoryEventActionFromText(structuredClone(s), '我转身离开，不管月霜'), undefined, '否定优先');
  for (const refuse of ['我不救月霜', '我不想救治月霜', '我不替月霜疗伤']) {
    assert.equal(NI.resolveStoryEventActionFromText(structuredClone(s), refuse), undefined, `否定不落账：${refuse}`);
  }
  assert.equal(NI.resolveStoryEventActionFromText(structuredClone(s), '我去见月霜')?.eventId, S0106, 'Demo A 线「见人能推进」并进内置关后照旧');
});

test('1 s01_06：停滞 5 轮场外到点收束，主线接到 s01_05（复现：旧档永远停住）', () => {
  const stall = s => { for (let i = 0; i < 6 && rt(s).activeEventIds.includes(S0106); i++) s = quiet(() => R.advanceScenarioRuntime(s, {}).saveData); return s; };
  assert.ok(rt(stall(newGameAt(S0106, oldStage01()))).activeEventIds.includes(S0106), '复现：没有场外合同的旧数据 6 轮仍停在 s01_06');
  const s = stall(newGameAt(S0106));
  assert.ok(!rt(s).activeEventIds.includes(S0106));
  assert.ok(rt(s).activeEventIds.includes('lcq.event.s01_05'));
  const off = json(STAGE_01).scenario.events.find(e => e.id === S0106).offscreenResolution;
  assert.equal(off.afterStallTurns, 5);
  assert.doesNotMatch(off.worldDelta, /真阳|交合|发生关系|强行/, '场外收束只写结果，不写过程');
});

test('1 s01_06：builtins 与 overlay 同步、Demo 不再追加、短语 ≤8', async () => {
  const stage = json(STAGE_01);
  const action = stage.scenario.events.find(e => e.id === S0106).playerCompletionContract.actions[0];
  assert.ok(action.intentMatch.matchAny.length <= 8);
  const { applyCanonAuthorityOverlay } = await import('../scripts/canon-authority-overlay.mjs');
  const overlay = json('mod-kit/canon-authority-overlays/lcq.stage_01.json');
  const ops = overlay.ops.filter(o => o.path.startsWith(`scenario.events[id=${S0106}]`));
  assert.equal(ops.length, 3);
  const replay = oldStage01();
  applyCanonAuthorityOverlay(replay, { ...overlay, ops });
  assert.equal(JSON.stringify(replay), JSON.stringify(stage), 'overlay op 套在改前 builtins 上得到现 builtins');
  const playtest = read('src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  assert.doesNotMatch(playtest, /event\('lcq\.event\.s01_06'/, 'Demo 不再给 s01_06 追加（会超 8 条）');
  const manifest = json('src/modules/scenarioMods/builtins/manifest.json');
  const { builtinManifestVersion } = await import('../scripts/dev/apply-s01-demo-intent-match.mjs');
  assert.equal(manifest.version, builtinManifestVersion(manifest));
});

test('1 s01_06：旧档读档补短语与场外合同，只补缺失、幂等', async () => {
  const L = await load('modules/scenarioMods/loadRepairs.ts');
  const demoOld = newGameAt(S0106, oldStage01());
  const event = rt(demoOld).events.find(e => e.id === S0106);
  event.playerCompletionContract.actions[0].intentMatch = { matchAny: [...OLD_ANY, ...OLD_DEMO], rejectIf: OLD_REJECT };
  assert.equal(L.backfillMissingIntentMatch(rt(demoOld)) >= 1, true);
  assert.equal(L.backfillMissingOffscreenResolution(rt(demoOld)), 1);
  assert.equal(NI.resolveStoryEventActionFromText(structuredClone(demoOld), TYPED_CURE)?.eventId, S0106);
  assert.equal(rt(demoOld).events.find(e => e.id === S0106).offscreenResolution.afterStallTurns, 5);
  assert.equal(L.backfillMissingOffscreenResolution(rt(demoOld)), 0, '幂等');
  const done = newGameAt('lcq.event.s01_05');
  delete rt(done).events.find(e => e.id === S0106).offscreenResolution;
  rt(done).completedEventIds.push(S0106);
  assert.equal(L.backfillMissingOffscreenResolution(rt(done)), 0, '已结算的拍不补');
});

// ───────────── 2) P1 南荒战斗气血 6→1 后交锋卡片消失、不判负，后续 7 回合停在 1 ─────────────
// 根因：场面里那一下确实把气血打到 0、当拍判负（卡片消失＝随机战按输局收场），输局剧情继续时按 combat.woundRules.hp.afterLossContinueHp 拉回 1；
// 之后「与来敌交手」打的是模型写出来的拦路人（没有待开战），走 freeAction combat 判定，失手扣血按 freeAction.aftermath.hpLoss.keepHp 保底——
// 气血 1 时一点不扣、也不判负，于是一直停在 1。用户定的规则是 keepHp 只给中毒等状态掉血，战斗伤害不保底、打到 0 当拍判负。
// 修：freeAction combat 失手与场面同一口径——不保底，打到 ≤ combatDownedAt 即当拍判负（事实行写明这一战败了），拉回 afterLossContinueHp。
const host = await load('modules/sceneModule/host/controller.ts');
const ext = await load('modules/sceneModule/host/ext.ts');
const { GAME_NUMBERS: N } = await load('modules/sceneModule/numbers.ts');
const E = await load('modules/scenarioMods/randomEncounter.ts');
async function randomBattle(hp = 6) {
  globalThis.location = { search: '?sceneModule=on', hostname: 'localhost', href: 'http://localhost/?sceneModule=on' };
  let save = quiet(() => R.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(json('src/modules/scenarioMods/builtins/data/lcq.stage_05b.json')))).saveData);
  const config = structuredClone(N.encounter), loc = 'lcq.location.guiwang_inn';
  config.tiers.hostile = { chance: 1, cooldownTurns: 0 };
  config.regions.nanhuang.zones = [{ key: loc, tier: 'hostile' }];
  config.regions.nanhuang.pool = [{ enemyId: 'lcq.enemy.guiwang_warrior', level: 3, zones: [loc], weight: 1, count: [1, 1] }];
  config.regions.nanhuang.skipDuringEventIds = [];
  for (let i = 0; i < 4; i++) { rt(save).worldTurn++; E.tickRandomEncounter(save, { narrated: true, config }); }
  assert.ok(E.pendingRandomBattle(save));
  save.角色.属性.气血 = { 当前: hp, 上限: 100 };
  const snapshots = [];
  const h = { get save() { return save; }, snapshots, deps: { persist: async next => { save = structuredClone(next); snapshots.push(structuredClone(next)); } } };
  await quiet(() => host.submitSceneInput(h.save, '与来敌交手', h.deps));
  ext.activeScene(h.save).state.forced = { action: Array(200).fill(1), defense: Array(400).fill(1) };
  return h;
}

test('2 随机战：气血 6 挨一下当拍打到 0 判负、卡片收场，输局继续拉回 afterLossContinueHp（不是 keepHp 保底）', async () => {
  const h = await randomBattle();
  await quiet(() => host.confirmSceneAction(h.save, h.deps));
  assert.equal(ext.readExt(h.save).history.at(-1)?.outcome, 'lose');
  assert.equal(ext.activeScene(h.save), null, '输局收场，交锋卡片消失');
  assert.ok(h.snapshots.some(s => s.角色.属性.气血.当前 === 0), '当拍先打到 0');
  assert.equal(h.save.角色.属性.气血.当前, N.combat.woundRules.hp.afterLossContinueHp);
  assert.ok(h.save.系统.历史.叙事.slice(-3).some(e => String(e.content).includes('这一战败了')), '正文写明判负');
});

test('2 自由行动交手失手：战斗伤害不保底，气血 6／1 都当拍判负、拉回 afterLossContinueHp（复现：原先停在 1 不判负）', async () => {
  const F = await import('./freeActionFixture.mjs');
  const back = F.mods.numbers.GAME_NUMBERS.combat.woundRules.hp.afterLossContinueHp;
  assert.equal('keepHp' in F.mods.config.freeActionConfig().aftermath.hpLoss, false);
  for (const hp of [6, 1]) {
    const save = F.makeSave({ present: [F.WANG_ZHE], favor: { [F.WANG_ZHE]: 55 } });
    save.角色.属性.气血 = { 当前: hp, 上限: 100 };
    const { result } = quiet(() => F.runJudged(save, F.ticket('physical', 'attack', F.WANG_ZHE), 'critical_failure'));
    assert.equal(result.ok, true, `气血 ${hp}`);
    assert.equal(save.角色.属性.气血.当前, back, `气血 ${hp}`);
    assert.ok(result.facts.some(f => f.includes('这一战败了')), `气血 ${hp}：当拍判负`);
  }
  const save = F.makeSave({ present: [F.WANG_ZHE], favor: { [F.WANG_ZHE]: 55 } });
  save.角色.属性.气血 = { 当前: 50, 上限: 100 };
  const { result } = quiet(() => F.runJudged(save, F.ticket('physical', 'attack', F.WANG_ZHE), 'failure'));
  assert.equal(save.角色.属性.气血.当前, 35, '没打到 0 照常扣、不判负');
  assert.ok(!result.facts.some(f => f.includes('这一战败了')));
});
