// 按钮化方案 B（用户 2026-11-14 暂定）：任务引导开时主线／探索／启程按钮照常显示，输入框保留；人不在本拍地点时只出「前往」按钮。
// 主面板按钮列表直接截 MainGamePanel.vue 的 scenarioEngineActionOptions／engineButtonOptions 源码，用真实 runtime／questLog 跑（同 report8091_6a22 的 cut 做法）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { loadTs } from './loadTs.mjs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const quiet = fn => { const log = console.log, info = console.info, warn = console.warn, debug = console.debug; console.log = console.info = console.warn = console.debug = () => {}; try { return fn(); } finally { Object.assign(console, { log, info, warn, debug }); } };
const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const cp = await loadTs('../src/modules/contentPacks/index.ts');
const ec = await loadTs('../src/modules/scenarioMods/entityCatalog.ts');
const cr = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const BP = await loadTs('../src/modules/scenarioMods/beatProgress.ts');
const Q = await loadTs('../src/modules/scenarioMods/questLog.ts');
const V = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
const W = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const BG = await loadTs('../src/modules/scenarioMods/baihuGambleRefusal.ts');
const KB = await loadTs('../src/modules/scenarioMods/keyBeatCards.ts');
const BD = await loadTs('../src/modules/scenarioMods/branchDecision.ts');
const { GAME_NUMBERS } = await loadTs('../src/modules/sceneModule/numbers.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const rt = s => s.世界.状态.剧本模组;
const QC = GAME_NUMBERS.story.quest;
const withQuest = (on, fn) => { const prev = QC.enabled; QC.enabled = on; try { return fn(); } finally { QC.enabled = prev; } };

const MODS = ['lcq.stage_01', 'lcq.stage_02'].map(id => {
  const mod = ec.resolveScenarioContent(cp.applyContentPackOverlays(JSON.parse(read(`src/modules/scenarioMods/builtins/data/${id}.json`))));
  cr.resolveScenarioCharacters(mod.canon?.characters, mod.manifest.id);
  return mod;
});
const S02 = 'lcq.event.s02_01', SHUAI_ZHANG = 'lcq.location.shuai_zhang';
const moveTo = (s, locationId, text) => { s.角色.位置 = { ...(s.角色.位置 || {}), 描述: text, locationId }; };
/** 点按钮的一回合（同 questGuide.test 的 turn 点按钮分支）：结算所选动作 → 推进。 */
const click = (save, action) => {
  BP.applyBeatDeadlines(rt(save).events);
  BP.prepareBeatDeadlineTurn(save);
  rt(save).worldTurn++;
  const receipt = quiet(() => R.recordStoryEventStructuredAction(save, action));
  save.系统.历史.叙事.push({ type: 'gm', content: '风从草原尽头吹来。' });
  return { save: quiet(() => R.advanceScenarioRuntime(save).saveData), receipt };
};
/** s01 一路点按钮到收束待启程。 */
const toStageReady = () => quiet(() => {
  let s = quiet(() => R.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(MODS[0]))).saveData);
  for (let i = 0; i < 12 && !rt(s).nextStageReadyId; i++) {
    const focus = R.getScenarioFocusEvent(rt(s));
    const actions = R.getCurrentStoryEventActions(s).filter(a => a.eventId === focus?.id);
    const ids = new Set((focus?.playerCompletionContract?.actions || []).map(a => a.id));
    s = click(s, actions.find(x => ids.has(x.actionId)) || actions.find(x => x.actionId.startsWith('travel:'))).save;
  }
  assert.equal(rt(s).nextStageReadyId, 'lcq.stage_02');
  return s;
});
const toS02 = () => {
  const t = quiet(() => init.transitionToNextScenarioStage(toStageReady(), MODS));
  assert.ok(t.ok, t.reason);
  assert.equal(R.getScenarioFocusEvent(rt(t.saveData)).id, S02);
  return t.saveData;
};

// ── 截 MainGamePanel 的按钮计算 ──
const panel = read('src/components/dashboard/MainGamePanel.vue');
function cut(source, from, to, args, tail) {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, from);
  return new Function(...args, ts.transpileModule(source.slice(start, end) + tail, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
}
const panelButtons = cut(panel, 'const questGuideOn = computed', '/** 选项填入输入框时使用的原句', ['computed', 'ref', 'gameStateStore', 'questGuideEnabled', 'isAIProcessing', 'currentScene', 'advanceScenarioRuntime', 'scenarioGameOver',
  'getWuyuanOpenWorldSelections', 'getBaihuGambleRefusalSelections', 'getCurrentStoryEventActions', 'storyActionPresentation', 'questActionGate',
  'getCurrentStoryExplorationActions', 'getTrackedStoryOpportunityActions', 'getActiveKeyBeatCard', 'playtestFinished', 'branchDecision', 'isKeyBeatCardAction', 'isDormantLockedOption'],
  '\nreturn { questGuideOn: questGuideOn.value, options: scenarioEngineActionOptions.value, buttons: engineButtonOptions.value };');
const buttonsOf = (save, { isKeyBeatCardAction = KB.isKeyBeatCardAction, branchDecision = null } = {}) => quiet(() => panelButtons(
  fn => ({ get value() { return fn(); } }), v => ({ value: v }), { toSaveData: () => save }, Q.questGuideEnabled, { value: false }, { value: null }, R.advanceScenarioRuntime, { value: false },
  W.getWuyuanOpenWorldSelections, BG.getBaihuGambleRefusalSelections, R.getCurrentStoryEventActions, V.storyActionPresentation, Q.questActionGate,
  R.getCurrentStoryExplorationActions, R.getTrackedStoryOpportunityActions, KB.getActiveKeyBeatCard, { value: false }, { value: branchDecision }, isKeyBeatCardAction, BD.isDormantLockedOption));
const mainline = list => list.filter(o => o.source === 'event_engine');

test('方案 B：任务引导开、人在本拍地点且要见的人在场 → 主线动作按钮出现（与开关关时同一批动作）', () => withQuest(true, () => {
  const s = toS02();
  assert.ok(Q.atLocation(s.角色.位置.locationId, SHUAI_ZHANG), JSON.stringify(s.角色.位置));
  const on = buttonsOf(s);
  assert.equal(on.questGuideOn, true);
  const shown = mainline(on.buttons).filter(o => o.eventId === S02);
  assert.ok(shown.some(o => o.actionId === 'advance_declared_objective'), JSON.stringify(on.buttons.map(o => o.actionId)));
  assert.ok(shown.every(o => !o.actionId.startsWith('travel:')));
  const off = withQuest(false, () => buttonsOf(s));
  assert.deepEqual(mainline(on.buttons).map(o => o.actionId), mainline(off.buttons).map(o => o.actionId), '人到了时任务模式与非任务模式按钮一致');
}));

test('方案 B：人不在本拍地点 → 只出「前往」按钮；点了前往（现有移动结算）后下一步出动作按钮', () => withQuest(true, () => {
  let s = toS02();
  moveTo(s, 'lcq.location.grassland', '中立边陲·草原');
  const away = mainline(buttonsOf(s).buttons).filter(o => o.eventId === S02);
  assert.equal(away.length, 1, JSON.stringify(away));
  assert.ok(away[0].actionId.startsWith('travel:'), away[0].actionId);
  assert.equal(away[0].interaction?.verb, 'move');
  const r = click(s, away[0]);
  assert.equal(r.receipt.attempted, true, JSON.stringify(r.receipt));
  s = r.save;
  assert.ok(Q.atLocation(s.角色.位置.locationId, SHUAI_ZHANG), JSON.stringify(s.角色.位置));
  const after = mainline(buttonsOf(s).buttons).filter(o => o.eventId === S02);
  assert.ok(after.some(o => o.actionId === 'advance_declared_objective'), JSON.stringify(after.map(o => o.actionId)));
  assert.ok(!after.some(o => o.actionId.startsWith('travel:')));
}));

test('方案 B 负向：questActionGate 不通过（runtime 认为在场、任务数据要求的地点没到）的动作不出按钮', () => withQuest(true, () => {
  const s = toS02();
  delete rt(s).events.find(e => e.id === S02).locationId; // runtime 不再给前往
  moveTo(s, 'lcq.location.grassland', '中立边陲·草原');
  const raw = R.getCurrentStoryEventActions(s).filter(a => a.eventId === S02);
  assert.ok(raw.some(a => a.actionId === 'advance_declared_objective'), 'runtime 仍列出该动作');
  assert.equal(Q.questActionGate(s, { eventId: S02, actionId: 'advance_declared_objective' }).where, false);
  const { options, buttons } = buttonsOf(s);
  assert.ok(!options.some(o => o.actionId === 'advance_declared_objective'));
  assert.ok(!buttons.some(o => o.actionId === 'advance_declared_objective'));
  // 开关关时闸门不生效，按钮照旧出现（现状）。
  assert.ok(withQuest(false, () => buttonsOf(s)).buttons.some(o => o.actionId === 'advance_declared_objective'));
}));

test('方案 B：关键选择卡在时卡片动作不重复出成小按钮；分支选择在时只出分支选项', () => withQuest(true, () => {
  const s = toS02();
  const card = o => o.eventId === S02 && o.actionId === 'advance_declared_objective';
  const { options, buttons } = buttonsOf(s, { isKeyBeatCardAction: card });
  assert.ok(options.some(card), '候选里有');
  assert.ok(!buttons.some(card), '小按钮里没有（只能点卡片）');
  const decision = { options: [{ source: 'event_engine', eventId: 'x', actionId: 'a' }, { source: 'event_engine', eventId: 'x', actionId: 'b' }], labels: ['甲', '乙'] };
  assert.deepEqual(buttonsOf(s, { branchDecision: decision }).buttons.map(o => o.label), ['甲', '乙']);
}));

test('方案 B：本关收束后启程按钮出现（任务模式不再隐藏）；源码不再按任务模式滤主线／探索按钮', () => withQuest(true, () => {
  const s = toStageReady();
  assert.ok(R.getStageDepartureOffer(s), '本关收束有启程报价');
  assert.match(panel, /<div v-if="stageDepartureOffer" class="action-options opportunity-action-options">/);
  assert.doesNotMatch(panel, /stageDepartureOffer && !questGuideOn/);
  assert.doesNotMatch(panel, /questHidesButton/);
  assert.match(panel, /actionOptions: scenarioEngineActionOptions\.value\.map\(engineOptionLine\)/, 'stage_entry 的行动建议也不再滤');
}));
