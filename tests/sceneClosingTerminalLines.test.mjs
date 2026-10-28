// fix86-5：赢局收束不把 preserveOnWin 的敌方轨道拼进 gm（「仍在抵抗」读起来像仗没打完）；
// 输局走 endingId，不经这条终态行。没有 preserveOnWin 的敌方轨道照旧输出「名字：终态」。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';
import { advanceToScene } from './advanceToScene.mjs';

const host = await loadTs('../src/modules/sceneModule/host/controller.ts');
const ext = await loadTs('../src/modules/sceneModule/host/ext.ts');
const registry = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const packs = await loadTs('../src/modules/contentPacks/index.ts');
const opening = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
const { resolveScenarioContent } = await loadTs('../src/modules/scenarioMods/entityCatalog.ts');
const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const repair = await loadTs('../src/utils/dataRepair.ts');
const runtime = await loadTs('../src/modules/scenarioMods/runtime.ts');
globalThis.location = { search: '?sceneModule=on', hostname: 'localhost' };

async function f01Save() {
  const mod = packs.applyContentPackOverlays(JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url), 'utf8')));
  return advanceToScene(opening.createQingyuOpeningPlaytestSave(mod, '2026-10-19T10:44:00.000Z', 2), { eventId: 'lcq.event.iron_bridge_ambush' });
}
function harness(save, goals) {
  const h = { save, asked: 0 };
  h.deps = {
    persist: async s => { h.save = structuredClone(s); },
    askIntent: async () => {
      h.asked++;
      const st = ext.activeScene(h.save).state;
      const c = registry.sceneContractById(st.contractId);
      const g = typeof goals === 'function' ? goals(st) : goals[st.beat - 1] || 'attack';
      const t = c.parties.find(p => p.side === 'opposed' && st.present[p.id] !== false)?.id;
      return JSON.stringify({ goal: g, claim: { magnitude: 1, scope: 'single', targets: g === 'attack' ? [t] : [] }, levers: [], inputClass: 'action' });
    },
  };
  return h;
}
async function playBeats(h, text, { forced, beats = 12 } = {}) {
  await host.submitSceneInput(h.save, text, h.deps);
  if (forced && ext.activeScene(h.save)) ext.activeScene(h.save).state.forced = forced;
  for (let n = 0; n < beats && ext.activeScene(h.save); n++) {
    if (!ext.activeScene(h.save).pending) await host.submitSceneInput(h.save, text, h.deps);
    await host.confirmSceneAction(h.save, h.deps);
  }
}
const lastGm = save => (save.系统?.历史?.叙事 || []).at(-1);

test('F01 撑满三拍取胜：收束 gm 有「战斗结束」，不残留「刺客斧手：仍在抵抗」', async () => {
  const h = harness(await f01Save(), ['defend', 'defend', 'defend']);
  await playBeats(h, '我稳住防守，护住要害撑过这一拍', { forced: { action: Array(20).fill(20), defense: Array(100).fill(20) } });
  assert.equal(ext.activeScene(h.save), null, '场面已收束，残留不在交锋卡');
  assert.equal(ext.readExt(h.save).history.at(-1).outcome, 'win');
  const text = lastGm(h.save).content;
  assert.equal(lastGm(h.save).type, 'gm');
  assert.match(text, /战斗结束/);
  assert.doesNotMatch(text, /刺客斧手：仍在抵抗/);
  assert.doesNotMatch(text, /：仍在抵抗/);
});

test('F01 显式骰加认输：走 endingId，终态行过滤不影响战败结局', async () => {
  const c = registry.sceneContractById('combat.f01.iron_bridge');
  const mod = resolveScenarioContent(JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_02.json', import.meta.url), 'utf8')));
  let save = init.applyStrictScenarioInitializationToSave(repair.createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(mod));
  const r = save.世界.状态.剧本模组;
  const index = r.events.findIndex(e => e.id === c.meta.hook.eventId);
  for (const e of r.events.slice(0, index)) {
    r.completedEventIds.push(e.id);
    for (const cond of e.completion || []) if (cond.path.startsWith('flags.')) r.flags[cond.path.slice(6)] = cond.value;
  }
  r.worldTurn = Number(r.worldTurn) || 0;
  r.activeEventIds = [c.meta.hook.eventId];
  const event = r.events[index];
  const loc = r.canon.locations.find(l => l.id === event.locationId);
  if (loc) save.角色.位置 = { 描述: loc.name, 地点ID: loc.id, x: loc.coordinates.x, y: loc.coordinates.y };
  const prior = runtime.getCurrentStoryEventActions(save).find(a => a.actionId === 'stabilize_wuerlang_on_route');
  assert.ok(prior);
  r.worldTurn++;
  assert.equal(runtime.recordStoryEventStructuredAction(save, prior).attempted, true);
  const deps = { persist: async next => { save = structuredClone(next); }, askIntent: async () => JSON.stringify({ goal: 'attack', claim: { magnitude: 3, scope: 'all', targets: [] }, levers: [], inputClass: 'action' }) };
  await host.submitSceneInput(save, '我张开双手不躲不挡', deps);
  assert.equal(ext.activeScene(save).pending.plan.goal, 'yield_guard');
  await assert.rejects(host.setSceneTestDice(save, deps, 1, false), /disabled/);
  await host.setSceneTestDice(save, deps, 1, true);
  assert.equal(ext.activeScene(save).pending, null);
  for (let i = 0; i < 4 && ext.activeScene(save); i++) {
    await host.submitSceneInput(save, '我张开双手不躲不挡', deps);
    assert.equal(ext.activeScene(save).pending.plan.goal, 'yield_guard');
    await host.confirmSceneAction(save, deps);
  }
  assert.equal(save.世界.状态.剧本模组.gameOver.endingId, 'lcq.ending.fail.combat');
  assert.equal(ext.activeScene(save), null);
  assert.equal(lastGm(save).content.trim(), '游戏结束');
  assert.doesNotMatch(lastGm(save).content, /刺客斧手/);
});

test('没有 preserveOnWin 的敌方 harm 轨，打赢仍输出「名字：终态」', async () => {
  const arrived = await f01Save();
  const idx = registry.SCENE_CONTRACTS.findIndex(c => c.meta.id === 'combat.f01.iron_bridge');
  const saved = registry.SCENE_CONTRACTS[idx];
  const [minimal] = registry.registerSceneContracts([{
    meta: { id: 'combat.f01.iron_bridge', version: 1, scene: { kind: 'combat' }, hook: { eventId: 'lcq.event.iron_bridge_ambush', actionId: 'break_iron_bridge_ambush', required: true, ambushAfterStall: 1 } },
    objective: { text: '打倒试炼刀手', win: { kind: 'beatAtLeast', beat: 2 } },
    parties: [
      { id: 'pc', side: 'player_side', ref: 'liuchao.character.cheng_zongyang', player: true },
      { id: 'foe', side: 'opposed', ref: '试炼刀手', tracks: [{ id: 'vit', kind: 'harm', scale: ['仍在抵抗', '倒下'], initial: 0, ending: { finalState: '倒下', ceiling: 1 } }] },
    ],
    goals: [{ id: 'defend', label: '防守撑住', type: 'support', baseDifficulty: 12, aliases: ['稳住防守', '护住要害'] }],
    enemyActions: [{ id: 'hit', party: 'foe', label: '试炼刀手劈来', target: 'player', attack: { dc: 3 }, onHit: { statuses: [] }, woundRule: 'default' }],
    defeat: { conditions: [{ kind: 'partyDowned', party: 'pc' }], outcome: { type: 'ending', endingId: 'lcq.ending.fail.combat' } },
    closing: { win: { text: '最小合同收束。', rewards: [] }, lose: { text: '游戏结束', rewards: [] } },
    clock: { beats: 1, onTimeout: { type: 'close', as: 'win' } },
  }]);
  registry.SCENE_CONTRACTS[idx] = minimal;
  try {
    const h = harness(arrived, ['defend']);
    await playBeats(h, '我稳住防守，护住要害撑过这一拍', { forced: { action: Array(10).fill(20), defense: Array(20).fill(20) }, beats: 3 });
    assert.equal(ext.activeScene(h.save), null);
    assert.equal(ext.readExt(h.save).history.at(-1).outcome, 'win');
    const text = lastGm(h.save).content;
    assert.match(text, /最小合同收束/);
    assert.match(text, /试炼刀手：倒下/);
    assert.doesNotMatch(text, /：仍在抵抗/);
  } finally {
    registry.SCENE_CONTRACTS[idx] = saved;
  }
});
