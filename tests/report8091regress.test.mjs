import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadTs } from './loadTs.mjs';
import { applyCanonAuthorityOverlay, loadTrackedCanonAuthorityOverlays } from '../scripts/canon-authority-overlay.mjs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const json = p => JSON.parse(read(p));
const stage = id => json(`src/modules/scenarioMods/builtins/data/${id}.json`);
const oldStage = id => JSON.parse(execFileSync('git', ['show', `67275ed1:src/modules/scenarioMods/builtins/data/${id}.json`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
const I = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const M = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
const L = await loadTs('../src/modules/scenarioMods/locationLoot.ts');
const P = await loadTs('../src/utils/judgementPreflight.ts');
const repairs = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const { refreshSaveEntityReferences } = await loadTs('../src/modules/scenarioMods/entitySaveRefs.ts');
const { CONTENT_PACKS } = await loadTs('../src/modules/contentPacks/index.ts');
const rt = s => s.世界.状态.剧本模组;
const open = (id, old = false) => I.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), I.buildStrictScenarioInitialization(old ? oldStage(id) : stage(id)));
const advance = s => R.advanceScenarioRuntime(s).saveData;
function act(s, input) {
  const selection = R.resolveStoryEventActionFromPlayerText(s, input);
  assert.ok(selection, `可解析 ${input}`);
  const result = R.recordStoryEventStructuredAction(s, selection);
  assert.equal(result.attempted, true, result.reason);
  return result;
}
for (const old of [false, true]) test(`I-1 晋线完整文字路径不往返（${old ? '67275ed1旧档' : '新档'}）`, () => {
  let s = advance(open('lyl.jiangzhou_retreat', old));
  if (old) repairs.applyLoadRepairs(s);
  assert.equal(R.getCurrentStoryEventActions(s)[0].actionId, 'advance_declared_objective');
  assert.equal(act(s, '前往江州协助撤退').completed, true);
  s = advance(s);
  assert.equal(R.getCurrentStoryEventActions(s)[0].actionId, 'travel:liuchao.location.linan');
  const before = structuredClone(s);
  assert.equal(M.mapPreparation(s, '乘船前往临安'), undefined);
  assert.deepEqual(s, before, '提示预览不修改存档');
  assert.equal(act(s, '乘船前往临安').completed, false, '到达不等于完成');
  assert.equal(s.角色.位置.locationId, 'liuchao.location.lin_an');
  s = advance(s);
  assert.ok(R.getCurrentStoryEventActions(s).every(a => !a.actionId.startsWith('travel:')), '临安不再被送回江州');
  assert.equal(act(s, '抵达临安，结束舟行').completed, true);
  s = advance(s);
  assert.ok(rt(s).completedEventIds.includes('lyl.event.s01_02'));
  assert.deepEqual(rt(s).questArrivalReceipts.map(r => r.locationId), ['liuchao.location.linan']);
  assert.match(s.角色.位置.描述, /^宋·/);
  assert.ok(M.mapPreparation(s, '前往汉国洛都'), '非当前合同的跨国出行仍要求地图');
});

test('I-1/I-5 overlay从基线精确重建builtins，重复同步幂等', async () => {
  const catalog = await loadTrackedCanonAuthorityOverlays();
  for (const id of ['lyl.jiangzhou_retreat', 'lyl.lin_an_black_sea']) {
    const old = oldStage(id), overlay = catalog.byStageId.get(id);
    assert.ok(applyCanonAuthorityOverlay(old, overlay) > 0);
    assert.deepEqual(old, stage(id));
    assert.equal(applyCanonAuthorityOverlay(old, overlay), 0);
  }
});

test('I-3 qin-entry地图切关保持背包逐字不变，耗尽物不补发、同名不同id不复制、人物不入包', () => {
  let s = advance(I.applyStrictScenarioInitializationToSave(open('lcq.stage_01'), I.buildStrictScenarioInitialization(stage('lyg.changgan_begins'))));
  assert.equal(Object.keys(s.角色.背包.物品).length, 39);
  const qin = CONTENT_PACKS.stages.find(stage => stage.manifest.id === 'lyg.qin_xianyang');
  const oldMerge = I.applyStrictScenarioInitializationToSave(s, I.buildStrictScenarioInitialization(qin));
  assert.equal(Object.keys(oldMerge.角色.背包.物品).length, 58, '准确复现旧切关路径的39→58');
  assert.equal(oldMerge.角色.背包.物品['lyg.item.np053'].名称, '南霁云');
  rt(s).completedEventIds.push(...['nanhuang', 'jin', 'song'].map(id => CONTENT_PACKS.lineCompass.lines.find(l => l.lineId === id).closedWhen[0].path.slice(5)));
  s = advance(s);
  // 旧档持有自己的道具id；切关不能用另一本书的快照覆盖数量或补齐缺货。
  const bag = s.角色.背包.物品;
  bag['test.flashlight'] = { 物品ID: 'test.flashlight', 名称: '手电筒', 数量: 2, 已装备: true };
  for (const [id, item] of Object.entries(bag)) if (item.名称 === '赤兔马') delete bag[id];
  const before = structuredClone(s.角色.背包);
  const entry = CONTENT_PACKS.mapEntries.find(e => e.id === 'qin');
  const selection = M.selectMapTravel(s, entry.locationId);
  assert.ok(selection);
  assert.equal(M.settleMapTravel(s, selection), true);
  assert.equal(rt(s).modId, 'lyg.qin_xianyang');
  assert.deepEqual(s.角色.背包, before);
  assert.equal(M.settleMapTravel(s, selection), false, '旧地图票不可重复入关');
  assert.deepEqual(s.角色.背包, before);
});

// 实际冻结链路按原样切出执行，避免绕过「localLoot」回执门。
const ai = read('src/utils/AIBidirectionalSystem.ts');
const ts = (await import('typescript')).default;
function block(from, to, args, tail = '') {
  const start = ai.indexOf(from); assert.ok(start > 0);
  return new Function(...args, ts.transpileModule(ai.slice(start, ai.indexOf(to, start)) + tail, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
}
const preLoot = block('      const lootLocal = ', '      const legacyNarrativePilotResponse', ['saveData', 'options', 'userMessage', 'cloneDeep', 'isLocationLootInput', 'settleLocationLoot'], '\nreturn lootLocalText;');
const commitLoot = block('    if ((response.moduleReceipt || response.localLoot)', '    const openWorldProgress', ['saveData', 'options', 'response', 'changes', 'isLocationLootInput', 'settleLocationLoot']);

test('I-4 CP03首判失败后取出发青光硬物仍本地入包；全局一次、同拍重放不双发', () => {
  const s = json('tests/fixtures/playtest-5e8f/cp03-dragon-corpse.json').saves[0].存档数据;
  assert.equal(Object.keys(s.角色.背包.物品).length, 23);
  for (const input of ['我回到龙神尸身旁，搜查尸身，取出发青光的硬物收进背包', '取出发青光的硬物收进背包']) {
    const options = { playerIntentText: input, judgementResolution: { status: 'resolved', outcome: 'failure', kind: 'explore' } };
    assert.equal(L.isLocationLootInput(input), true);
    assert.equal(P.shouldSkipJudgementPreflight({ userMessage: input }), true);
    const text = preLoot(s, options, input, structuredClone, L.isLocationLootInput, L.settleLocationLoot);
    assert.ok(text, '不再进入模型叙事分支');
    const before = structuredClone(s.角色.背包.物品);
    commitLoot(s, options, { text, localLoot: true }, [], L.isLocationLootInput, L.settleLocationLoot);
    const receipt = rt(s).locationLoot.receipts.at(-1);
    assert.ok(receipt.drops.length);
    for (const d of receipt.drops.filter(d => d.itemId)) {
      assert.equal(s.角色.背包.物品[d.itemId].数量, (before[d.itemId]?.数量 || 0) + d.quantity);
      assert.ok(text.includes(d.name));
    }
    const once = structuredClone(s);
    commitLoot(s, options, { text, localLoot: true }, [], L.isLocationLootInput, L.settleLocationLoot);
    assert.deepEqual(s, once);
    rt(s).worldTurn++;
  }
  assert.ok(Object.keys(s.角色.背包.物品).length > 23);
  const rare = rt(s).locationLoot.claimedItemIds;
  assert.equal(new Set(rare).size, rare.length);
});

test('I-4 收拾自己的物品、战斗夹杂句和拒绝搜尸不走搜刮', () => {
  for (const t of ['取出怀里的玉佩收进背包', '我不搜查尸身', '我不从尸身取出硬物收进背包', '我不取出发青光的硬物收进背包', '搜查尸身，随后攻击守卫', '我把硬物收进背包', '捡起短刀收进背包']) assert.equal(L.isLocationLootInput(t), false, t);
});

for (const old of [false, true]) test(`I-5 黑魔海文字动作完成一次（${old ? '旧档' : '新档'}）`, () => {
  let s = open('lyl.lin_an_black_sea', old), r = rt(s);
  const id = 'liuchao.event.black_sea_approach';
  const prior = r.events.slice(0, r.events.findIndex(e => e.id === id)).map(e => e.id);
  r.completedEventIds = prior;
  for (const event of prior) r.flags[`event.${event.split('.').pop()}.done`] = true;
  for (const ch of ['arrival', 'lin_chong', 'wei_yuan', 'xue_sun']) r.flags[`chapter.${ch}.done`] = true;
  for (let i = 0; i < 6 && !rt(s).activeEventIds.includes(id); i++) s = advance(s);
  if (old) repairs.applyLoadRepairs(s);
  assert.equal(act(s, '去江州').completed, false);
  s = advance(s);
  assert.equal(R.resolveStoryEventActionFromPlayerText(s, '不完成江州场外插叙'), undefined);
  assert.equal(act(s, '完成江州场外插叙').completed, true);
  s = advance(s);
  assert.ok(rt(s).completedEventIds.includes(id));
  assert.equal(R.resolveStoryEventActionFromPlayerText(s, '完成江州场外插叙'), undefined);
  assert.equal(rt(s).eventActionStates[id].attemptCount, 1);
});

test('I-7 中文叙事中的attempted状态词清理，英文名称保留', async () => {
  const { sanitizeAITextForDisplay } = await loadTs('../src/utils/textSanitizer.ts');
  assert.equal(sanitizeAITextForDisplay('你催马 attempted，沿道路前行。'), '你催马，沿道路前行。');
  assert.equal(sanitizeAITextForDisplay('一旁刻着 GPS 字样。'), '一旁刻着 GPS 字样。');
});

test('I-8 新档、旧档、回合位置回写均取总表国别，子地点不丢', () => {
  for (const [id, country] of [['lcq.stage_02', '中立边陲'], ['lyg.changgan_begins', '唐']]) {
    const s = open(id);
    assert.ok(s.角色.位置.描述.startsWith(country + '·'));
    s.角色.位置.描述 = s.角色.位置.描述.replace(/^[^·]+/, '中州') + '·街口';
    repairs.applyLoadRepairs(s);
    assert.ok(s.角色.位置.描述.startsWith(country + '·'));
    assert.ok(s.角色.位置.描述.endsWith('·街口'));
    s.角色.位置.描述 = s.角色.位置.描述.replace(/^[^·]+/, '中州');
    refreshSaveEntityReferences(s);
    assert.ok(s.角色.位置.描述.startsWith(country + '·'));
  }
});

test('I-2 只诊断：生成失败占位触发真机格式提示，未提交事务；普通JSON外正文恢复并不覆盖无JSON', async () => {
  const { validateProcessedAIResponse } = await loadTs('../src/utils/processedAIResponseValidation.ts');
  const { parseJsonSmart, narrativeOutsideJson } = await loadTs('../src/utils/jsonExtract.ts');
  assert.throws(() => parseJsonSmart('你举棍挡住猛兽的扑击。', false));
  const failure = { text: '（AI生成失败）', mid_term_memory: '', tavern_commands: [] };
  const result = validateProcessedAIResponse(failure);
  assert.equal(result.isValid, false);
  assert.equal(result.transactionCommitted, false);
  assert.match(result.errors.join(' '), /mid_term_memory/);
  assert.match(narrativeOutsideJson('你举棍挡住扑击。\n{"tavern_commands":[]}'), /挡住扑击/);
});

test('I-6 鬼王峒武士随机战落败收场不再写仍在抵抗；保留落败回执', async () => {
  const host = await loadTs('../src/modules/sceneModule/host/controller.ts');
  const ext = await loadTs('../src/modules/sceneModule/host/ext.ts');
  const E = await loadTs('../src/modules/scenarioMods/randomEncounter.ts');
  const { GAME_NUMBERS } = await loadTs('../src/modules/sceneModule/numbers.ts');
  const priorLocation = globalThis.location;
  globalThis.location = { search: '?sceneModule=on', hostname: 'localhost', href: 'http://localhost/?sceneModule=on' };
  try {
    let current = advance(open('lcq.stage_05b'));
    current.角色.位置 = { 描述: '南荒·鬼王峒驿馆', locationId: 'lcq.location.guiwang_inn' };
    const config = structuredClone(GAME_NUMBERS.encounter);
    config.tiers.hostile = { chance: 1, cooldownTurns: 0 };
    config.regions.nanhuang.zones = [{ key: 'lcq.location.guiwang_inn', tier: 'hostile' }];
    config.regions.nanhuang.pool = [{ enemyId: 'lcq.enemy.guiwang_warrior', level: 3, zones: ['lcq.location.guiwang_inn'], weight: 1, count: [1, 1] }];
    config.regions.nanhuang.skipDuringEventIds = [];
    E.tickRandomEncounter(current, { narrated: true, config });
    for (let i = 0; i < 3; i++) { rt(current).worldTurn++; E.tickRandomEncounter(current, { narrated: true, config }); }
    assert.ok(E.pendingRandomBattle(current));
    const deps = { persist: async s => { current = structuredClone(s); } };
    await host.submitSceneInput(current, '我挥刀攻击对手', deps);
    for (let i = 0; i < 40 && ext.activeScene(current); i++) {
      if (!ext.activeScene(current).pending) await host.submitSceneInput(current, '我挥刀攻击对手', deps);
      ext.activeScene(current).state.forced = { action: Array(200).fill(1), defense: Array(400).fill(1) };
      await host.confirmSceneAction(current, deps);
    }
    assert.equal(ext.activeScene(current), null);
    assert.equal(ext.readExt(current).history.at(-1).outcome, 'lose');
    const last = current.系统.历史.叙事.at(-1).content;
    assert.doesNotMatch(last, /仍在抵抗/);
    assert.match(last, /败|伤|倒/);
  } finally { globalThis.location = priorLocation; }
});
