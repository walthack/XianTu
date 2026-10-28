// 随机遇敌 第2张（encounter-2；用户 2026-10-28 13:48 第3条；总策划定）：开战、模板合同、输了就地重伤继续、战利品走搜刮池。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';

const host = await loadTs('../src/modules/sceneModule/host/controller.ts');
const ext = await loadTs('../src/modules/sceneModule/host/ext.ts');
const mod = await loadTs('../src/modules/sceneModule/index.ts');
const registry = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const RC = await loadTs('../src/modules/sceneModule/contracts/randomContract.ts');
const { snapshotLevels } = await loadTs('../src/modules/sceneModule/host/factors.ts');
const { enemyKindLevel } = await loadTs('../src/modules/scenarioMods/actorLevels.ts');
const N = await loadTs('../src/modules/sceneModule/numbers.ts');
const E = await loadTs('../src/modules/scenarioMods/randomEncounter.ts');
const { settleLocationLoot } = await loadTs('../src/modules/scenarioMods/locationLoot.ts');
const { logStore } = await loadTs('../src/modules/diagnostics/store.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
const trial = await loadTs('../src/dev/combatTrial/overlay.ts');

const rt = s => s.世界.状态.剧本模组;
const INN = 'lcq.location.guiwang_inn';
const WARRIOR = 'lcq.enemy.guiwang_warrior';
const stageJson = async id => JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`, import.meta.url), 'utf8'));
function enable() { globalThis.location = { search: '?sceneModule=on', hostname: 'localhost', href: 'http://localhost/?sceneModule=on' }; }
let opened;
async function open05b() {
  if (!opened) {
    opened = advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(await stageJson('lcq.stage_05b')))).saveData;
    opened.元数据.创建时间 = '2026-10-28T06:00:00.000Z'; // 固定种子
  }
  return structuredClone(opened);
}
/** 用第1张单的引擎跑到 stage 'battle'（驿馆 hostile、几率 1、单条敌池）。 */
function toBattle(s, { enemyId = WARRIOR, level = 3, levelOffset, count = [2, 2] } = {}) {
  const c = structuredClone(N.GAME_NUMBERS.encounter);
  c.tiers.hostile = { chance: 1, cooldownTurns: 0 };
  c.regions.nanhuang.zones = [{ key: INN, tier: 'hostile' }];
  c.regions.nanhuang.pool = [{ enemyId, level, ...(levelOffset !== undefined ? { levelOffset } : {}), zones: [INN], weight: 1, count }];
  c.regions.nanhuang.skipDuringEventIds = [];
  E.tickRandomEncounter(s, { narrated: true, config: c });
  for (let i = 0; i < 3; i++) { rt(s).worldTurn++; E.tickRandomEncounter(s, { narrated: true, config: c }); }
  const p = E.pendingRandomBattle(s);
  assert.ok(p, 'pending battle');
  return p;
}
function harness(save) { let current = save; return { get save() { return current; }, deps: { persist: async s => { current = structuredClone(s); } } }; }
function force(save, action, defense) { const a = ext.activeScene(save); a.state.forced = { action: Array(200).fill(action), defense: Array(400).fill(defense) }; }
async function fight(h, action, defense) {
  await host.submitSceneInput(h.save, '我挥刀攻击对手', h.deps);
  assert.ok(ext.activeScene(h.save), 'random scene opened');
  force(h.save, action, defense);
  for (let n = 0; n < 40 && ext.activeScene(h.save); n++) {
    if (!ext.activeScene(h.save).pending) await host.submitSceneInput(h.save, '我挥刀攻击对手', h.deps);
    await host.confirmSceneAction(h.save, h.deps);
  }
  assert.equal(ext.activeScene(h.save), null, 'scene closed');
}
/** 随机战不得碰的剧情状态。身份账＝playerIdentities；personIdentities 是挂伤记账（injuries.actorKey）顺手缓存的人名表，不算身份账。 */
const storyState = s => structuredClone({
  flags: rt(s).flags, completed: rt(s).completedEventIds, active: rt(s).activeEventIds,
  worldFacts: rt(s).sceneLedger?.worldFacts || [], identities: rt(s).playerIdentities,
  transfers: rt(s).inventoryTransferReceipts, bag: s.角色.背包,
});
const HEAVY = JSON.parse(await readFile(new URL('../src/modules/sceneModule/contracts/statuses.json', import.meta.url), 'utf8')).find(d => d.id === 'wound.external.heavy').label;
const heavy = s => (s.角色.效果 || []).filter(e => e.状态名称 === HEAVY);

test('① 无剧情候选、pending=battle：sceneCandidate 给随机合同，hostNeeded 为真；有剧情候选时剧情优先', async () => {
  enable();
  const s = await open05b();
  assert.equal(host.sceneCandidate(s), undefined);
  assert.equal(host.hostNeeded(s), false);
  const p = toBattle(s);
  const got = host.sceneCandidate(s);
  assert.equal(got.contract.meta.id, RC.randomContractId(p));
  assert.ok(RC.isRandomContract(got.contract));
  assert.equal(got.selection.eventId, `encounter:${p.id}`);
  assert.equal(got.selection.actionId, 'random_encounter');
  assert.equal(host.hostNeeded(s), true);
  // 玩家点了别的剧情事件：不接随机战。
  assert.equal(host.sceneCandidate(s, { eventId: 'lcq.event.other' }), undefined);
  // 剧情必经战优先（F03 试玩档 + 手写待开战）。
  const story = await trial.createSceneCombatTrialSave(await stageJson('lcq.stage_04'), { mode: 'B' });
  rt(story).encounter = structuredClone(rt(s).encounter);
  assert.equal(host.sceneCandidate(story).contract.meta.id, 'combat.f03.mountain_stream_fog');
});

test('② 按 id 重建：count=2 有 foe_1/foe_2，fixedLevel=p.level，同 id 同实例；不进 SCENE_CONTRACTS', async () => {
  const p = { id: 'enc:x:7', enemyId: WARRIOR, count: 2, level: 3 };
  const id = RC.randomContractId(p);
  const c = registry.sceneContractById(id);
  assert.deepEqual(c.parties.filter(x => x.side === 'opposed').map(x => [x.id, x.fixedLevel, x.enemyId]), [['foe_1', 3, WARRIOR], ['foe_2', 3, WARRIOR]]);
  assert.equal(c.enemyActions.length, 2);
  assert.equal(registry.sceneContractById(id), c);
  assert.deepEqual(mod.lintContract(c).errors, []);
  assert.equal(c.closing.win.text, '来袭者尽数倒下，四下重归寂静。');
  assert.equal(c.defeat.outcome.type, 'continue');
  assert.ok(!registry.SCENE_CONTRACTS.some(x => RC.isRandomContract(x)));
  assert.equal(registry.sceneContractForEvent('', {}), undefined);
  // 显示名用敌人表的名字。
  const s = await open05b();
  const a = ext.newActive({ contractId: id, eventId: 'encounter:enc:x:7', actionId: 'random_encounter', playerLine: '', state: mod.beginScene(c).state, narrativeIndex: 0 });
  ext.writeExt(s, { ...ext.readExt(s), active: a });
  const brief = host.sceneBrief(s);
  assert.equal((brief.match(/鬼王峒武士/g) || []).length, 2);
});

test('③ 赢：剧情状态全不变；待开战清掉、回执 win；当地留战后搜尸，搜刮走 spoils 不占次数', async () => {
  enable();
  const s = await open05b(), p = toBattle(s), before = storyState(s);
  const h = harness(s);
  await fight(h, 20, 20);
  const after = h.save;
  assert.equal(rt(after).gameOver, undefined);
  assert.deepEqual(storyState(after), before);
  assert.equal(rt(after).encounter.pending, null);
  assert.equal(rt(after).encounter.receipts.find(r => r.id === p.id).outcome, 'win');
  // 冷却从收场回合重算（战中每拍推进 worldTurn）。
  assert.ok(rt(after).encounter.lastCheckTurn[INN] > p.setTurn);
  assert.deepEqual(rt(after).locationLoot.spoils[INN].sourceId, `encounter:${p.id}`);
  assert.equal(ext.readExt(after).history.at(-1).outcome, 'win');
  assert.equal(ext.readExt(after).stall[RC.randomContractId(p)], undefined);
  assert.ok(Object.keys(rt(after).flags).every(k => !k.startsWith('scene.combat.random')));
  assert.match(after.系统.历史.叙事.at(-1).content, /来袭者尽数倒下/);
  const searches = structuredClone(rt(after).locationLoot.searches);
  rt(after).worldTurn++;
  const loot = settleLocationLoot(after);
  assert.equal(loot.status, 'settled');
  assert.equal(loot.receipt.kind, 'spoils');
  assert.deepEqual(rt(after).locationLoot.searches, searches);
});

test('④ 输：pc 气血打到 0 → 不结束游戏，带外伤重伤，气血=afterLossContinueHp；回执 lose、无搜尸；剧情状态不变', async () => {
  enable();
  const s = await open05b(), p = toBattle(s);
  s.角色.属性.气血 = { 当前: 1, 上限: 100 };
  const before = storyState(s);
  const h = harness(s);
  await fight(h, 1, 1);
  const after = h.save;
  assert.equal(rt(after).gameOver, undefined);
  assert.equal(ext.readExt(after).history.at(-1).outcome, 'lose');
  assert.equal(heavy(after).length, 1);
  assert.equal(after.角色.属性.气血.当前, N.GAME_NUMBERS.combat.woundRules.hp.afterLossContinueHp);
  assert.equal(rt(after).encounter.pending, null);
  assert.equal(rt(after).encounter.receipts.find(r => r.id === p.id).outcome, 'lose');
  assert.equal(rt(after).locationLoot?.spoils?.[INN], undefined);
  assert.deepEqual(storyState(after), before);
  assert.match(after.系统.历史.叙事.at(-1).content, /散入四野/);
});

test('⑤ 输之前已有外伤重伤：输后仍只有一条，不升级', async () => {
  enable();
  const first = harness(await open05b());
  toBattle(first.save); first.save.角色.属性.气血 = { 当前: 1, 上限: 100 };
  await fight(first, 1, 1);
  assert.equal(heavy(first.save).length, 1);
  const label = heavy(first.save)[0].状态名称;
  // 第二场：同一存档再遇一次、再输一次。
  const s = first.save;
  rt(s).encounter.foreshadowed = {}; rt(s).encounter.lastCheckTurn = {};
  toBattle(s); s.角色.属性.气血.当前 = 1;
  const h = harness(s);
  await fight(h, 1, 1);
  assert.equal(heavy(h.save).length, 1);
  assert.equal(heavy(h.save)[0].状态名称, label);
});

test('⑥ level 为 null：按 enemyPresets 定级再加 levelShift；levelOffset 覆盖预设偏移；levelGap:false（阴煞）不加级', async () => {
  const s = await open05b(), shiftOf = N.GAME_NUMBERS.encounter.difficulty, saved = structuredClone(shiftOf);
  const levelsOf = (enemyId, level = 'p') => {
    const c = registry.sceneContractById(`${RC.RANDOM_CONTRACT_PREFIX}enc:lv:${enemyId}:${level}~${enemyId}~1~${level}`);
    const state = mod.beginScene(c).state; snapshotLevels(s, c, state); return state;
  };
  try {
    const base = levelsOf(WARRIOR);
    const preset = enemyKindLevel(WARRIOR, base.levelChapter, undefined, rt(s), s).level;
    assert.equal(typeof preset, 'number');
    assert.equal(base.levels.foe_1, preset);
    for (const k of Object.keys(shiftOf)) shiftOf[k].levelShift = 2;
    assert.equal(levelsOf(WARRIOR).levels.foe_1, preset + 2);
    const raw = enemyKindLevel(WARRIOR, base.levelChapter, undefined, rt(s), s).preset;
    assert.equal(levelsOf(WARRIOR, 'p-1').levels.foe_1, Math.max(0, raw.baseLevel - 1 + 2));
    assert.equal(levelsOf('lcq.enemy.yinsha').levels.foe_1, undefined);
    // 池条目给定等级（已含 levelShift）：直接用，不再加。
    assert.equal(levelsOf(WARRIOR, '5').levels.foe_1, 5);
  } finally { Object.assign(shiftOf, saved); }
  // 合同 id 编码：null + levelOffset → p<offset>。
  assert.match(RC.randomContractId({ id: 'e', enemyId: WARRIOR, count: 1, level: null, levelOffset: -1 }), /~p-1$/);
  assert.match(RC.randomContractId({ id: 'e', enemyId: WARRIOR, count: 1, level: null }), /~p$/);
});

test('⑦ 实例化失败（有名敌 dan_chen）：sceneCandidate 返回空，LCQ-SAV-034 记一次，待开战作废', async () => {
  enable();
  const s = await open05b(), p = toBattle(s);
  rt(s).encounter.pending.enemyId = 'lcq.enemy.dan_chen';
  const count = () => logStore.recent(2000).filter(e => e.code === 'LCQ-SAV-034').length;
  const n0 = count();
  assert.equal(host.sceneCandidate(s), undefined);
  assert.equal(count(), n0 + 1);
  assert.equal(rt(s).encounter.pending, null);
  assert.equal(rt(s).encounter.receipts.find(r => r.id === p.id).outcome, 'void');
  assert.equal(host.hostNeeded(s), false);
  // 同一 id 再查一次不重复记。
  assert.equal(registry.sceneContractById(RC.randomContractId({ ...p, enemyId: 'lcq.enemy.dan_chen' })), undefined);
  assert.equal(count(), n0 + 1);
});

test('⑧ lint：剧情合同写 fixedLevel / levelOffset 报错；随机模板不在 content packs 合同里', () => {
  const story = structuredClone(registry.sceneContractById('combat.f04.crow_man'));
  assert.deepEqual(mod.lintContract(story).errors, []);
  story.parties.find(p => p.id === 'crow_man').fixedLevel = 3;
  assert.ok(mod.lintContract(story).errors.some(e => /fixedLevel/.test(e)));
  delete story.parties.find(p => p.id === 'crow_man').fixedLevel;
  story.parties.find(p => p.id === 'crow_man').levelOffset = 1;
  assert.ok(mod.lintContract(story).errors.some(e => /levelOffset/.test(e)));
  assert.ok(!registry.SCENE_CONTRACTS.some(c => c.meta.id.startsWith('combat.random')));
  assert.ok(!registry.SCENE_CONTRACT_DRAFTS.some(c => c.meta.id.startsWith('combat.random')));
});
