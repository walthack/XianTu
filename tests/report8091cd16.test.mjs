// 真机 REPORT-8091-cd167d7a / REPORT-8091-69ab6bdd「127 功能广测」修复与判定（2026-10-31）。
// 测试名前的圈号对应工单 ①–⑪；①②⑪ 为「查明是设计／冻结文件」的证据测试，不改规则。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { loadTs } from './loadTs.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const stageJson = id => JSON.parse(read(`src/modules/scenarioMods/builtins/data/${id}.json`));
const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const { advanceScenarioRuntime, resolveStoryEventActionFromPlayerText, getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
const rt = s => s.世界.状态.剧本模组;

let stage01Save;
function freshStage01() {
  if (!stage01Save) {
    stage01Save = advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(stageJson('lcq.stage_01')))).saveData;
    stage01Save.元数据.创建时间 = '2026-10-31T09:08:20.813Z';
  }
  return structuredClone(stage01Save);
}
/** 模拟 HEAD 之前开局的旧档：s01_01 合同里没有 intentMatch（真机 stuck.json 即如此）。 */
function oldStage01Save() {
  const s = freshStage01();
  const action = rt(s).events.find(e => e.id === 'lcq.event.s01_01').playerCompletionContract.actions[0];
  delete action.intentMatch;
  return s;
}
// 真机 69ab-play.txt 的 A1–A3、B 段原话（stage01 B16 卡住存档前的输入）。
const STUCK_INPUTS = ['我一把拽起段强，压低身子朝秦军阵线方向狂奔', '我护着段强冲向秦军阵线，借倒伏尸体掩护', '我割断背包带子，带段强滚入盾阵后撤', '我借盾护住段强，观察敌阵并寻找突围缺口'];

// ① 主动交战 ───────────────────────────────────────────────
test('① 战斗界面只由剧情场面合同或南荒随机遇敌待开战触发；stage01 草原两者皆无（设计，不改规则）', async () => {
  globalThis.location = { search: '?sceneModule=on', hostname: 'localhost', href: 'http://localhost/?sceneModule=on' };
  const host = await loadTs('../src/modules/sceneModule/host/controller.ts');
  const E = await loadTs('../src/modules/scenarioMods/randomEncounter.ts');
  const registry = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
  const s = freshStage01();
  // 剧情场面合同只挂在南荒各关事件上，stage01 六拍都没有。
  for (const id of rt(s).events.map(e => e.id)) assert.equal(registry.sceneContractForEvent(id, rt(s).flags), undefined, id);
  // 随机遇敌地区只有 nanhuang（^lcq.stage_0(3b|4|4b|5b)），stage01 判 no_region，永远不会进入待开战。
  assert.equal(E.encounterGate(s), 'no_region');
  assert.equal(host.sceneCandidate(s), undefined);
  assert.equal(host.hostNeeded(s), false, '主动交战原话在 stage01 只走自由行动本地判定，不开战斗界面');
});

// ② 搜刮 ───────────────────────────────────────────────────
test('② 草原搜刮清单未配置（status=pending）且原话夹「寻找可用物资」不算搜刮句：只给叙事不入包是设计', async () => {
  const L = await loadTs('../src/modules/scenarioMods/locationLoot.ts');
  assert.equal(L.QINGYU_LOOT_TABLE.locations['lcq.location.grassland'].status, 'pending');
  assert.equal(L.QINGYU_LOOT_TABLE.locations['lcq.location.grassland'].entries.length, 0);
  assert.equal(L.isLocationLootInput('我搜刮战场遗骸，寻找可用物资并确认行囊位置。'), false);
  assert.equal(L.isLocationLootInput('我搜刮战场遗骸'), true);
  const s = freshStage01();
  const before = structuredClone(s.角色.背包);
  const result = L.settleLocationLoot(s);
  assert.equal(result.status, 'pending');
  assert.match(result.text, /尚未配置/);
  assert.deepEqual(s.角色.背包, before, '未配置地点不入包、不消耗次数');
});

// ③ 读档清队列 / 失败回合不部分提交 ─────────────────────────
function loadHarness(overrides = {}) {
  const source = read('src/stores/characterStore.ts');
  const start = source.indexOf('  const loadGame = async'), end = source.indexOf('\n  const saveActiveCharacterToStorage', start);
  const js = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const calls = [], toasts = [], noop = () => {};
  const data = { 元数据: { 版本号: 3 } };
  const slot = { 存档名: 'a', 存档数据: data };
  const ui = { startLoading: noop, updateLoadingText: noop, stopLoading: noop, showDetailModal: noop, hideDetailModal: noop };
  const queue = { cleared: 0, clearActions() { this.cleared++; } };
  const deps = {
    cloneDeep: structuredClone, debug: { log: noop, error: noop, warn: noop },
    toast: { error: (m, o) => toasts.push({ type: 'error', m, o }), info: noop, success: m => toasts.push({ type: 'success', m }), warning: noop },
    useUIStore: () => ui, rootState: { value: { 角色列表: { c: { 模式: '单机', 角色: { 名字: '程宗扬' }, 存档列表: { a: slot } } }, 当前激活存档: { 角色ID: 'c', 存档槽位: 'a' } } },
    getOnlineSaveSlot: () => null, isBackendConfigured: () => false, assertEntitySaveFormat: noop, rejectFutureSaveVersion: () => false,
    detectLegacySaveData: () => ({ needsMigration: false }), validateLoadedSave: async (_c, _s, d) => ({ status: 'ok', data: d }),
    loadSaveWithFallback: async () => null, applyLoadRepairs: noop, clearAllCharacterData: async () => {},
    shouldReattachLandingPlaytestWorkingCopy: () => false, landingPlaytestWorkingSlot: () => '', packPlaytestWorkingSlot: () => null,
    applyLoadedSaveToWorkingSlotMeta: noop, checkpointWorkingCopy: () => null,
    useGameStateStore: () => ({ loadFromSaveData: () => calls.push('loaded') }), isTavernEnv: () => false, ensureSaveDataHasTavernNsfw: d => d,
    reseedActiveSceneAfterLoad: noop, storage: { saveSaveData: () => calls.push('write'), deleteSaveData: () => calls.push('delete') },
    resetLastConversationIfForeign: async () => {}, commitMetadataToStorage: async () => calls.push('metadata'),
    useActionQueueStore: () => queue, slot,
    ...overrides,
  };
  const run = new Function(...Object.keys(deps), js + ';return loadGame;')(...Object.values(deps));
  return { run, calls, toasts, queue, deps };
}

test('③ 读档成功后清空待执行动作队列（旧档遗留「开始修炼」不再弹修炼时间框）', async () => {
  const h = loadHarness();
  assert.equal(await h.run('c', 'a'), true);
  assert.equal(h.queue.cleared, 1);
  assert.ok(h.calls.indexOf('loaded') >= 0 && h.calls.indexOf('loaded') < h.calls.indexOf('metadata'));
  // 失败读档不动队列（也不写不删）。
  const failed = loadHarness({ validateLoadedSave: async () => ({ status: 'rejected' }) });
  assert.equal(await failed.run('c', 'a'), false);
  assert.equal(failed.queue.cleared, 0);
  assert.deepEqual(failed.calls, []);
});

test('③ 失败回合撤回本回合预结算：判定写入的修炼进度在 AI 失败时恢复，已提交事务的回合不撤', async () => {
  const { shouldRestorePreTurnSave } = await loadTs('../src/utils/saveTurnRollback.ts');
  const pre = { 元数据: { 更新时间: 'a' }, 角色: { 属性: { 境界: { 当前进度: 0 } } } };
  const after = structuredClone(pre); after.角色.属性.境界.当前进度 = 10; after.元数据.更新时间 = 'b';
  assert.equal(shouldRestorePreTurnSave(pre, after), true, '失败回合判定已写 +10，须整份撤回');
  const touched = structuredClone(pre); touched.元数据.更新时间 = 'c';
  assert.equal(shouldRestorePreTurnSave(pre, touched), false, '只有时间戳不同不重存');
  assert.equal(shouldRestorePreTurnSave(null, after), false);
  const vue = read('src/components/dashboard/MainGamePanel.vue');
  const judge = vue.slice(vue.indexOf('const executePendingJudgement'), vue.indexOf('const changePendingJudgement'));
  assert.ok(judge.indexOf('const beforeResolution = gameStateStore.toSaveData()') < judge.indexOf('resolvePendingJudgement('), '快照必须先于判定结算');
  assert.match(judge, /sendMessage\(\{ skipPreflight: true, resolution, restoreOnFailure: beforeResolution \}\)/);
  const send = vue.slice(vue.indexOf('const sendMessage = async'), vue.indexOf('const executePendingJudgement'));
  assert.ok(send.indexOf('const preTurnSave =') < send.indexOf("saveToSlot('上次对话')"), '回合快照先于上次对话备份与自由行动结算');
  assert.match(send, /aiResponse\?\.transactionCommitted\) \{ turnCommitted = true;/);
  assert.match(send, /!aiResponse && !turnCommitted && preTurnSave/);
  assert.ok(send.indexOf('shouldRestorePreTurnSave(preTurnSave') < send.indexOf('// 最终统一存档（仅成功时）'));
});

// ④ stage01 见段强卡住 ─────────────────────────────────────
test('④ s01_01 补 intentMatch：真机卡住时的原话直接落到主线动作；builtins 与 overlay 同步、Demo 合并后仍可用', async () => {
  const stage = stageJson('lcq.stage_01');
  const action = stage.scenario.events.find(e => e.id === 'lcq.event.s01_01').playerCompletionContract.actions[0];
  assert.ok(action.intentMatch.matchAny.length >= 1 && action.intentMatch.matchAny.length <= 8);
  const overlay = JSON.parse(read('mod-kit/canon-authority-overlays/lcq.stage_01.json'));
  const op = overlay.ops.find(o => o.path === 'scenario.events[id=lcq.event.s01_01].playerCompletionContract.actions[id=advance_declared_objective]');
  assert.equal(op?.op, 'insertKeys');
  assert.deepEqual(op.entries.intentMatch, action.intentMatch, 'overlay 与 builtins 同值，canon:build 重建时保留');
  const { applyCanonAuthorityOverlay } = await import('../scripts/canon-authority-overlay.mjs');
  const replay = structuredClone(stage);
  delete replay.scenario.events.find(e => e.id === 'lcq.event.s01_01').playerCompletionContract.actions[0].intentMatch;
  applyCanonAuthorityOverlay(replay, { ...overlay, ops: [op] });
  assert.deepEqual(replay, stage, 'overlay op 套在改前 builtins 上得到现 builtins');
  const s = freshStage01();
  for (const text of STUCK_INPUTS) assert.equal(resolveStoryEventActionFromPlayerText(structuredClone(s), text)?.eventId, 'lcq.event.s01_01', text);
  assert.equal(resolveStoryEventActionFromPlayerText(structuredClone(s), '我丢下段强独自冲向秦军阵线'), undefined, 'rejectIf 优先');
});

test('④ 旧档读档补 intentMatch：只补缺失、不覆盖已有短语或已有进度', async () => {
  const L = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
  const s = oldStage01Save();
  assert.equal(resolveStoryEventActionFromPlayerText(structuredClone(s), STUCK_INPUTS[0]), undefined, '旧档原样：卡住');
  L.applyLoadRepairs(s);
  assert.ok(rt(s).events.find(e => e.id === 'lcq.event.s01_01').playerCompletionContract.actions[0].intentMatch, '读档修复补上了 intentMatch');
  assert.equal(resolveStoryEventActionFromPlayerText(structuredClone(s), STUCK_INPUTS[0])?.eventId, 'lcq.event.s01_01');
  assert.equal(L.backfillMissingIntentMatch(rt(s)), 0, '幂等');
  const demo = oldStage01Save();
  rt(demo).events.find(e => e.id === 'lcq.event.s01_01').playerCompletionContract.actions[0].intentMatch = { matchAny: ['处理落地'] };
  assert.equal(L.backfillMissingIntentMatch(rt(demo)), 0, 'Demo 覆写过的短语不动');
  const tried = oldStage01Save();
  rt(tried).eventActionStates ||= {};
  rt(tried).eventActionStates['lcq.event.s01_01'] = { contractHash: 'x', attemptCount: 1, preparations: [], attempts: [{}] };
  assert.equal(L.backfillMissingIntentMatch(rt(tried)), 0, '已有尝试的拍不碰');
  const other = oldStage01Save(); rt(other).modId = 'lcq.stage_02';
  assert.equal(L.backfillMissingIntentMatch(rt(other)), 0);
});

test('④ 任务卡：段强已同行时不再写「见段强」；人在五原只剩「去草原」；停滞后给出可点主线按钮的引导', async () => {
  const V = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
  const s = freshStage01();
  const event = rt(s).events.find(e => e.id === 'lcq.event.s01_01');
  assert.deepEqual(V.questCompassPhrases(event, rt(s), 'lcq.location.grassland'), ['见段强']);
  s.角色.位置 = { locationId: 'lcq.location.grassland', 描述: '中州·草原' };
  s.社交.关系['lcq.character.duan_qiang'] = { 角色ID: 'lcq.character.duan_qiang', 名字: '段强', 当前位置: { locationId: 'lcq.location.grassland', 描述: '草原' } };
  rt(s).acquaintances = { 'lcq.character.duan_qiang': { characterId: 'lcq.character.duan_qiang', name: '段强', kind: 'encountered' } };
  const present = V.questCompassPresentIds(s, '');
  assert.deepEqual([...present], ['lcq.character.duan_qiang']);
  assert.deepEqual(V.questCompassPhrases(event, rt(s), 'lcq.location.grassland', present), []);
  assert.equal(V.formatQuestCompass(event, rt(s), 'lcq.location.grassland', present), event.objective);
  // 人到了五原城、段强位置字段没跟上：近期正文里段强在说话，仍算同行。
  s.角色.位置 = { locationId: 'liuchao.location.wuyuan', 描述: '中立边陲·五原城' };
  const withNarrative = V.questCompassPresentIds(s, '段强压低声音：“宗扬，咱们总算跟到有城墙的地方了。”');
  assert.deepEqual(V.questCompassPhrases(event, rt(s), 'liuchao.location.wuyuan', withNarrative), ['去草原']);
  // 没相识的人照旧提示「见X」。
  rt(s).acquaintances = {};
  assert.deepEqual(V.questCompassPhrases(event, rt(s), 'liuchao.location.wuyuan', V.questCompassPresentIds(s, '段强说话')), ['去草原', '见段强']);
  const label = getCurrentStoryEventActions(freshStage01()).find(a => a.eventId === 'lcq.event.s01_01')?.label;
  assert.ok(label);
  assert.equal(V.questStallHint(3, label, event.objective), '');
  assert.match(V.questStallHint(19, label, event.objective), /19 轮没有推进.*「主线 · .*稳住自己/);
  assert.equal(V.questStallHint(19, undefined, event.objective), '', '这一拍没有可点主线动作时不提示');
  const sidebar = read('src/components/dashboard/RightSidebar.vue');
  assert.match(sidebar, /questCompassPhrases\(view, rt, at, compassPresentIds\.value\)/);
  assert.match(sidebar, /v-if="questMain\.stallHint"/);
});

// ⑤ 地图重叠 ───────────────────────────────────────────────
test('⑤ 草原与五原城同坐标：真实底图按落点序号错开显示（各自可点），地点坐标与路程不变', async () => {
  const locations = JSON.parse(read('mod-kit/entity-catalog/locations.json')).entries;
  const at = id => locations.find(e => e.id === id).definition.coordinates;
  assert.deepEqual(at('lcq.location.grassland'), at('liuchao.location.wuyuan'), '根因：两点坐标完全相同');
  const C = await loadTs('../src/utils/coordinateConverter.ts');
  assert.deepEqual(C.coLocatedMarkerOffset(0), { x: 0, y: 0 });
  const CLICK_RADIUS = 50;
  const points = [{ x: 0, y: 0 }, ...Array.from({ length: 8 }, (_, i) => C.coLocatedMarkerOffset(i + 1))];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    assert.ok(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) > CLICK_RADIUS, `标记 ${i}/${j} 间距须大于点击半径`);
  }
  assert.equal(C.coLocatedMarkerKey({ x: 881.2, y: 4366.4 }), C.coLocatedMarkerKey(at('lcq.location.grassland')));
  const manager = read('src/utils/gameMapManager.ts');
  assert.match(manager, /const offset = coLocatedMarkerOffset\(index\);/);
  assert.match(manager, /locationContainer\.x = display\.x/);
  assert.match(manager, /location\.coordinates = resolvedCoordinates;/, '地点坐标仍是真坐标，点击回传与路程计算不变');
  assert.match(manager, /this\.coLocatedMarkerCounts\.clear\(\)/);
});

// ⑥ 功法效果 ───────────────────────────────────────────────
test('⑥ 背包功法效果格式化为可读文本（fraction_increment：0.56→+56%），不再显示原始 JSON', async () => {
  const { formatTechniqueEffects: f } = await loadTs('../src/utils/cultivationSpeedCalculator.ts');
  assert.equal(f({ 修炼速度加成: 0.56, 属性加成: { 悟性: 7, 灵性: 4 } }), '修炼速度 +56%；悟性 +7、灵性 +4');
  assert.equal(f({ 修炼速度加成: -0.2 }), '修炼速度 -20%');
  assert.equal(f({ 修炼速度加成: -0.001 }), '修炼速度 +0%', '不出现 -0');
  assert.equal(f({ 修炼速度加成: 0.56, 特殊能力: ['护体', '辟邪'] }), '修炼速度 +56%；特殊能力：护体、辟邪');
  assert.equal(f('运转周天，生生不息'), '运转周天，生生不息');
  assert.equal(f(undefined), '');
  const numbers = JSON.parse(read('mod-kit/game-numbers.qingyu.json'));
  assert.equal(numbers.techniques.cultivationSpeedBonus.semantics, 'fraction_increment');
  const panel = read('src/components/dashboard/InventoryPanel.vue');
  assert.match(panel, /\{\{ formatTechniqueEffects\(selectedItem\.功法效果\) \}\}/);
  assert.doesNotMatch(panel, /JSON\.stringify\(selectedItem\.功法效果\)/);
});

// ⑦ 读档失败提示 ───────────────────────────────────────────
test('⑦ 读档失败给出「读档失败：原因」提示（停留 8 秒），存档不写不删；面板不再误报成功', async () => {
  for (const [label, overrides, reason] of [
    ['读不到数据', { slot: { 存档名: 'a' } }, /读档失败：存档【a】的数据读取不到/],
    ['读取抛错', { slot: { 存档名: 'a' }, loadSaveWithFallback: async () => { throw Error('HTTP 500'); } }, /读档失败：读取存档【a】出错：HTTP 500/],
    ['格式拒绝', { assertEntitySaveFormat: () => { throw Error('本次实体总表使用新档格式'); } }, /读档失败：本次实体总表使用新档格式/],
    ['末端载入异常', { useGameStateStore: () => ({ loadFromSaveData: () => { throw Error('late'); } }) }, /读档失败：late，存档未改动/],
  ]) {
    const h = loadHarness(overrides);
    if (overrides.slot) h.deps.rootState.value.角色列表.c.存档列表.a = overrides.slot;
    assert.equal(await h.run('c', 'a'), false, label);
    const error = h.toasts.find(t => t.type === 'error');
    assert.match(error?.m || '', reason, label);
    assert.equal(error.o?.duration, 8000);
    assert.ok(!h.toasts.some(t => t.type === 'success'), label);
    assert.deepEqual(h.calls.filter(c => c === 'write' || c === 'delete'), [], label);
  }
  const panel = read('src/components/dashboard/SavePanel.vue');
  const load = panel.slice(panel.indexOf('const loadSave = async'), panel.indexOf('// 删除存档'));
  assert.match(load, /const loaded = await characterStore\.loadGameById/);
  assert.ok(load.indexOf('if (loaded)') < load.indexOf('toast.success'), '成功提示只在读档成功时出现');
  assert.match(panel, /v-if="loadError" class="load-error-banner" role="alert"/);
});

// ⑧ 时间点存档 ─────────────────────────────────────────────
test('⑧ 时间点存档默认关闭未写入时显示「尚未写入」与说明，不再冒充 凡人/未知', async () => {
  const D = await loadTs('../src/utils/saveSlotDisplay.ts');
  const empty = { 存档名: '时间点存档', 保存时间: null, 存档数据: null };
  assert.equal(D.isEmptySaveSlot(empty), true);
  assert.equal(D.saveSlotDetail(empty, '境界'), '尚未写入');
  assert.equal(D.saveSlotDetail(empty, '位置'), '尚未写入');
  assert.match(D.emptySaveSlotHint(empty, false), /默认关闭/);
  assert.match(D.emptySaveSlotHint(empty, true), /已开启/);
  const written = { 存档名: '时间点存档', 保存时间: '2026-10-31T10:00:00Z', 境界: '无修为', 位置: '中州·草原', 存档数据: {} };
  assert.equal(D.saveSlotDetail(written, '境界'), '无修为');
  assert.equal(D.emptySaveSlotHint(written, false), '');
  assert.equal(D.saveSlotDetail({ 存档名: '存档1', 保存时间: 'x' }, '境界'), '凡人', '有内容但缺字段的旧槽沿用旧兜底');
  const store = read('src/stores/gameStateStore.ts');
  assert.match(store, /timeBasedSaveEnabled: false,/, '默认关闭是现行设计，不改写入规则');
  const panel = read('src/components/dashboard/SavePanel.vue');
  assert.match(panel, /saveSlotDetail\(save, '境界'\)/);
  assert.doesNotMatch(panel, /save\.境界 \|\| '凡人'/);
});

// ⑨ 世界事件角标 ───────────────────────────────────────────
test('⑨ 铃铛角标与事件列表同源（worldEventRecords）；旁边的变更日志计数标「变更」', async () => {
  const W = await loadTs('../src/utils/worldEventRecords.ts');
  assert.equal(W.worldEventBadgeCount({ 事件记录: [] }), 0);
  assert.equal(W.worldEventBadgeCount(undefined), 0);
  const records = [{ 事件ID: 'a' }, { 事件ID: 'b' }];
  assert.deepEqual(W.worldEventRecords({ 事件记录: records }).map(e => e.事件ID), ['b', 'a']);
  assert.equal(W.worldEventBadgeCount({ 事件记录: records }), W.worldEventRecords({ 事件记录: records }).length);
  const main = read('src/components/dashboard/MainGamePanel.vue');
  assert.match(main, /worldEventBadgeCount\(gameStateStore\.eventSystem\)/);
  assert.match(main, /v-if="worldEventCount > 0"/);
  assert.match(main, /\{\{ t\('变更'\) \}\} \{\{ currentNarrativeStateChanges\.length \}\}/);
  assert.match(read('src/components/dashboard/EventPanel.vue'), /worldEventRecords\(eventSystem\.value\)/);
});

// ⑩ 元词 ───────────────────────────────────────────────────
test('⑩ 玩家可见正文与选项去掉「本世界线支流」，真河流「大江支流」不动；提示词文本未改', async () => {
  const M = await loadTs('../src/utils/narrativeMetaWords.ts');
  assert.equal(M.stripNarrativeMetaWords('这七日并没有让这条本世界线支流自行回到原路。'), '这七日并没有让这条路自行回到原路。');
  assert.equal(M.stripNarrativeMetaWords('本世界线支流\n残旗正引着两人赶往五原城'), '眼下这条路\n残旗正引着两人赶往五原城');
  assert.deepEqual(M.stripActionOptionMetaWords(['随秦军继续留在草原支流', '取回行囊后准备赴五原城']), ['随秦军继续留在草原', '取回行囊后准备赴五原城']);
  assert.equal(M.stripNarrativeMetaWords('南荒-中州交界的重要河流。 大江支流，河水蜿蜒。'), '南荒-中州交界的重要河流。 大江支流，河水蜿蜒。');
  const main = read('src/components/dashboard/MainGamePanel.vue');
  assert.match(main, /content: stripNarrativeMetaWords\(/);
  assert.match(main, /actionOptions: stripActionOptionMetaWords\(latestNarrative\.actionOptions/);
  assert.match(read('src/modules/scenarioMods/storyContext.ts'), /本世界线支流/, '按要求不改提示词模板文本，只在显示层替换');
});

// ⑪ 打字跨国回合 ───────────────────────────────────────────
test('⑪ 打字跨国：本地只追加「准备前往、请开地图」一句，不清空正文；空正文来自冻结 AIBS 解析（FROZEN-NEEDED）', async () => {
  const P = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
  const config = JSON.parse(read('mod-kit/numbers-runtime.json')).crossCountryTravel;
  const save = { 元数据: { 版本号: 3 }, 角色: { 位置: { locationId: config.capitals.中立边陲 } }, 系统: { 扩展: {} }, 世界: { 状态: { 剧本模组: { worldTurn: 1, completedEventIds: [] } } } };
  const note = P.mapPreparation(save, '我即刻动身离开五原，南下宋国临安城。');
  assert.match(note, /^你正在准备前往临安城?。请打开地图选择已开放路线/);
  assert.equal(P.mapPreparationNotice(save, '我即刻动身离开五原，南下宋国临安城。'), '跨国出行请打开世界地图选择目的地');
  assert.equal(P.mapArrivalViolation(save, '程宗扬收拾行装，准备取道南下前往临安。'), false, '照提示写「准备前往」不会被模块守卫退稿');
  const main = read('src/components/dashboard/MainGamePanel.vue');
  assert.match(main, /if \(mapPrep\) \{ finalUserMessage \+= '\\n' \+ mapPrep;/, '拦截路径只在用户消息末尾追加一句');
  const aibs = read('src/utils/AIBidirectionalSystem.ts');
  assert.match(aibs, /throw new Error\('AI响应为空或格式错误'\)/, '空正文在冻结文件内抛出');
});
