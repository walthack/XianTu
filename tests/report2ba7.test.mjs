// REPORT-8091-2ba71102 复测新问题回归：P2-A 手打跨国目的地点名地图落点（不在地图上按该国代表地点）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';

const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const M = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
const read = async p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const fixture = async name => JSON.parse(await read(`tests/fixtures/checkpoints/current-${name}.json`)).saves[0].存档数据;

// ---------- P2-A 手打跨国目的地 ----------
test('P2-A 汉线舞都手打「我要去大明宫」：不是罗盘动作，提示「先开地图去长安」并写到后再去大明宫', async () => {
  const s = R.advanceScenarioRuntime(await fixture('han-entry')).saveData;
  assert.equal(s.角色.位置.locationId, 'liuchao.location.wudu');
  for (const text of ['我要去大明宫', '去大明宫']) {
    assert.equal(R.resolveStoryEventActionFromPlayerText(structuredClone(s), text), undefined, '手打路径，不经罗盘');
    assert.equal(M.mapPreparationNotice(s, text), '跨国出行请先开地图去长安，到后再前往大明宫', text);
    assert.match(M.mapPreparation(s, text), /打开地图选择前往长安的已开放路线，到后再前往大明宫/);
    assert.match(M.mapPreparationToast(s, text), /请打开地图前往长安/);
  }
  // 地图落点本身：直说该地；只说国别：取该国代表地点。
  assert.equal(M.mapPreparationNotice(s, '我要去长安'), '跨国出行请先开地图去长安');
  assert.equal(M.mapPreparationNotice(s, '我准备去唐国'), '跨国出行请先开地图去长安');
  assert.equal(M.mapPreparationNotice(s, '我要去临安'), '跨国出行请先开地图去临安');
  // 国内、否定不提示。
  assert.equal(M.mapPreparationNotice(s, '我不去大明宫'), undefined);
  assert.equal(M.mapPreparationNotice(s, '去洛都'), undefined);
});

test('P2-A 文案来自 mod-kit 配置；发送时 toast 走 mapPreparationToast，不写死通用句', async () => {
  const ui = JSON.parse(await read('mod-kit/cross-country-travel-ui.json'));
  for (const key of ['preparationDirect', 'preparationVia', 'toast', 'noticeDirect', 'noticeVia', 'genericNotice', 'genericToast']) assert.equal(typeof ui[key], 'string', key);
  const src = await read('src/modules/scenarioMods/travel/mapTravel.ts');
  assert.doesNotMatch(src, /跨国出行请|你正在准备前往/, '文案不写死在代码里');
  const panel = await read('src/components/dashboard/MainGamePanel.vue');
  assert.match(panel, /crossCountryStoryTravelToast\(crossCountryTravel\) : mapPreparationToast\(mapPrepSave!, userMessage\)/);
  assert.doesNotMatch(panel, /跨国旅行请打开地图选择路线/);
});

// ---------- P2-B 地图抵达清旧建议 ----------
const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const opening = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
const readStage = async id => JSON.parse(await read(`src/modules/scenarioMods/builtins/data/${id}.json`));
async function jiangzhouAtS01_02() {
  const base = init.applyStrictScenarioInitializationToSave(
    opening.createQingyuOpeningPlaytestSave(parseScenarioMod(await readStage('lcq.stage_01')), '2026-10-31T00:00:00.000Z'),
    init.buildStrictScenarioInitialization(parseScenarioMod(await readStage('lyl.jiangzhou_retreat'))),
  );
  let save = R.advanceScenarioRuntime(base).saveData;
  assert.equal(R.recordStoryEventStructuredAction(save, R.getCurrentStoryEventActions(save).find(a => a.eventId === 'lyl.event.s01_01')).completed, true);
  save = R.advanceScenarioRuntime(save).saveData;
  save.系统.历史 = { ...(save.系统.历史 || {}), 叙事: [...(save.系统.历史?.叙事 || []),
    { type: 'gm', content: '江州渡口，快船已备。', actionOptions: ['确认航线后登上快船', '让小紫继续守住泊位'] }] };
  return save;
}
const LINAN = 'liuchao.location.lin_an';

test('P2-B 走地图从江州到临安：出发地正文附带的模型建议清空，正文保留；新地点主线建议照常', async () => {
  const s = await jiangzhouAtS01_02();
  assert.equal(M.settleMapTravel(s, M.selectMapTravel(s, LINAN)), true);
  assert.equal(s.角色.位置.locationId, LINAN);
  const latest = s.系统.历史.叙事.at(-1);
  assert.deepEqual(latest.actionOptions, [], '江州渡口旧建议不残留');
  assert.equal(latest.content, '江州渡口，快船已备。');
  assert.ok(R.getCurrentStoryEventActions(s).some(a => a.eventId === 'lyl.event.s01_02'), '临安主线建议照常');
});

test('P2-B 地图出行没走成（无路线/重放核验）不动建议', async () => {
  const s = await jiangzhouAtS01_02();
  assert.equal(M.settleMapTravel(s, { source: 'map', actionId: 'x', fromId: 'liuchao.location.jiangzhou', toId: 'liuchao.location.changan', routeId: 'nope' }), false);
  assert.deepEqual(s.系统.历史.叙事.at(-1).actionOptions, ['确认航线后登上快船', '让小紫继续守住泊位']);
  // 地图面板落账后整档载入，显示层读的就是被清空的这条叙事。
  const panel = await read('src/components/dashboard/GameMapPanel.vue');
  assert.match(panel, /settleMapTravel\(save, selection\)\) \{[^\n]*\n\s*mapTravelBusy\.value = true;\n\s*try \{ gameStateStore\.loadFromSaveData\(save\);/);
});

// ---------- P2-C 结局回合发完成信号 ----------
const B = await loadTs('../src/modules/scenarioMods/branchDecision.ts');
const W = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const TS = await loadTs('../src/composables/turnSignal.ts');
const rt = s => s.世界.状态.剧本模组;
function advance(s, a) {
  assert.ok(R.recordStoryEventStructuredAction(s, a, { judgementResolution: { status: 'resolved', outcome: 'success', kind: 'explore' } }).attempted, a.actionId);
  rt(s).worldTurn++; return R.advanceScenarioRuntime(s).saveData;
}
async function gambleDecision() {
  let s = R.advanceScenarioRuntime(await fixture('prologue-before-s02_04')).saveData, decision;
  for (let i = 0; i < 25; i++) {
    const actions = R.getCurrentStoryEventActions(s); decision = B.detectBranchDecision(actions);
    if (decision) break;
    if (rt(s).activeEventIds.includes('lcq.event.s02_04')) {
      W.settleWuyuanOpenWorldSelection(s, W.getWuyuanOpenWorldSelections(s)[0]); rt(s).worldTurn++; s = R.advanceScenarioRuntime(s).saveData;
    } else s = advance(s, actions[0]);
  }
  assert.deepEqual(decision?.labels, ['接赌', '不赌']);
  return { s, decision };
}
const flagsOf = s => ({ processing: false, ended: !!rt(s).gameOver?.endingId, choiceOnly: B.branchDecisionLocksInput(rt(s).gameOver ? null : B.detectBranchDecision(R.getCurrentStoryEventActions(s))) });

test('P2-C 五原「不赌」进结局：回合收尾状态为 ended（输入框按设计不再恢复），信号照发且带结局 id；「接赌」为 ready', async () => {
  const { s, decision } = await gambleDecision();
  assert.equal(TS.turnStateOf(flagsOf(s)), 'choice', '分支点只能点选项');
  const declined = advance(structuredClone(s), decision.options[1]);
  const endingId = rt(declined).gameOver?.endingId;
  assert.ok(endingId, '不赌进结局');
  assert.equal(TS.turnStateOf(flagsOf(declined)), 'ended');
  const accepted = advance(structuredClone(s), decision.options[0]);
  assert.equal(TS.turnStateOf(flagsOf(accepted)), 'ready');
  // 派发：结局回合也发；生成中（重复点发送被挡回）不发。
  const target = new EventTarget(), got = [];
  target.addEventListener(TS.TURN_COMPLETE_EVENT, e => got.push(e.detail));
  assert.equal(TS.emitTurnComplete(target, { seq: 1, state: 'ended', endingId }), true);
  assert.equal(TS.emitTurnComplete(target, { seq: 2, state: 'processing' }), false);
  assert.deepEqual(got, [{ seq: 1, state: 'ended', endingId }]);
  assert.equal(TS.turnStateOf({ processing: true, ended: true, choiceOnly: true }), 'processing');
});

test('P2-C 界面：sendMessage 最外层 finally（含被拦、出错、结局各路径）都发完成信号；输入区挂 data-turn-state / data-turn-seq', async () => {
  const ui = await read('src/components/dashboard/MainGamePanel.vue');
  assert.match(ui, /<div class="input-section" data-testid="turn-status" :data-turn-state="turnState" :data-turn-seq="turnCompleteSeq">/);
  assert.match(ui, /const sendMessage = async[^\n]*\n\s*let diagnosticTurnId[^\n]*\n\s*try \{/);
  assert.match(ui, /\} finally \{ sealDiagnosticTurn\(diagnosticTurnId\); await signalTurnComplete\(\); \}\n\};/);
  assert.match(ui, /ended: !!scenarioGameOver\.value \|\| playtestFinished\.value, choiceOnly: branchDecisionInputLocked\.value/);
  assert.match(ui, /if \(turnState\.value === 'processing'\) return;\n\s*turnCompleteSeq\.value\+\+;/);
});
