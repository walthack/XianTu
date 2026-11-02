// REPORT-8091-75eaaee0 复测新问题回归：P2-1 固定选项分支手打近义说法与提示；P2-2 跨国罗盘移动只写准备、引导地图。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';

const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const B = await loadTs('../src/modules/scenarioMods/branchDecision.ts');
const W = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const rt = s => s.世界.状态.剧本模组;
const read = async p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const fixture = async name => JSON.parse(await read(`tests/fixtures/checkpoints/current-${name}.json`)).saves[0].存档数据;
function advance(s, a) {
  assert.ok(R.recordStoryEventStructuredAction(s, a, { judgementResolution: { status: 'resolved', outcome: 'success', kind: 'explore' } }).attempted, a.actionId);
  rt(s).worldTurn++; return R.advanceScenarioRuntime(s).saveData;
}
const lineOf = a => a.playerLine;

let gamble;
async function gambleDecision() {
  if (gamble) return gamble;
  let s = R.advanceScenarioRuntime(await fixture('prologue-before-s02_04')).saveData, decision;
  for (let i = 0; i < 25; i++) {
    const actions = R.getCurrentStoryEventActions(s); decision = B.detectBranchDecision(actions);
    if (decision) break;
    if (rt(s).activeEventIds.includes('lcq.event.s02_04')) {
      W.settleWuyuanOpenWorldSelection(s, W.getWuyuanOpenWorldSelections(s)[0]); rt(s).worldTurn++; s = R.advanceScenarioRuntime(s).saveData;
    } else s = advance(s, actions[0]);
  }
  assert.deepEqual(decision?.labels, ['接赌', '不赌']);
  return (gamble = { s, decision });
}

test('P2-1 五原赌局：「我接下这场赌局」等自然说法认作接赌，与点击结算同一动作', async () => {
  const { s, decision } = await gambleDecision();
  const [accept, decline] = decision.options;
  for (const text of ['我接下这场赌局', '好，这场赌局我应下了。', '我答应凝羽，赌就赌！', '接受赌局']) {
    assert.equal(B.resolveBranchDecisionInput(decision, text, lineOf)?.actionId, accept.actionId, text);
  }
  const typed = B.resolveBranchDecisionInput(decision, '我接下这场赌局', lineOf);
  assert.deepEqual(advance(structuredClone(s), typed), advance(structuredClone(s), accept));
  for (const text of ['我拒绝这场赌局', '这赌局我推掉', '我不赌了']) {
    assert.equal(B.resolveBranchDecisionInput(decision, text, lineOf)?.actionId, decline.actionId, text);
  }
});

test('P2-1 否定句、问句、二选一含糊句不误配；对不上时给出可选项提示', async () => {
  const { decision } = await gambleDecision();
  for (const text of ['我不接这赌局', '不接赌', '我不想接下这场赌局', '接赌还是不赌', '要不要接下赌局', '我接下这场赌局？', '随便聊聊', '不怕，我先看看']) {
    assert.notEqual(B.resolveBranchDecisionInput(decision, text, lineOf)?.actionId, 'answer_ningyu_on_debut', text);
  }
  for (const text of ['不接赌', '接赌还是不赌', '随便聊聊', '我接下这场赌局？']) assert.equal(B.resolveBranchDecisionInput(decision, text, lineOf), undefined, text);
  assert.equal(B.branchDecisionChoiceHint(decision), '请选择：接赌 / 不赌');
  const ui = await read('src/components/dashboard/MainGamePanel.vue');
  assert.doesNotMatch(ui, /!!branchDecision && !branchDecisionReady/, '发送键不再因分支锁静默禁用');
  assert.match(ui, /data-testid="branch-decision-input-hint"/);
  assert.match(ui, /intentHoldMessage.value = `\$\{BRANCH_DECISION_TITLE\}：\$\{branchDecisionChoiceHint\(branchDecision.value\)\}`/);
});

test('P2-1 通用于所有固定选项锁：近义说法配置覆盖每把锁的每个选项，正反说法各归其位', async () => {
  const phrases = JSON.parse(await read('mod-kit/branch-decision-phrases.json'));
  const src = await read('src/modules/scenarioMods/branchDecision.ts');
  const table = [...src.matchAll(/'([^']+)': \[\['([^']+)', '([^']+)'\], \['([^']+)', '([^']+)'\]\]/g)];
  assert.equal(table.length, 4);
  // [手打, 应认作的动作（undefined＝不代选，界面提示可选项）]
  const samples = {
    'lcq.event.shanghou_revealed': [['我认出那警示，不去碰它', 'refuse_shanghou_relic_test'], ['我伸手去碰那件东西', 'touch_shanghou_relic'], ['我不伸手', 'refuse_shanghou_relic_test'], ['碰还是不碰', undefined]],
    'lcq.event.ningyu_enters_gamble': [['我接下这场赌局', 'answer_ningyu_on_debut'], ['我拒绝这场赌局', 'refuse_gamble_take_paolao'], ['我不接这赌局', undefined]],
    'lcq.event.free_ajiman': [['我当面把身契撕了', 'tear_bond_and_face_blockade'], ['先把身契收起来，出城再说', 'pocket_ajiman_bond'], ['我不撕了', 'pocket_ajiman_bond']],
    'lcq.event.s05b_09_temporary_pact_with_xiaozi': [['我去帮谢艺准备反杀', 'support_xieyi_counterstrike'], ['我先休整一下，随队走', 'rest_then_follow_team'], ['我不支援', 'rest_then_follow_team']],
  };
  for (const [, eventId, a1, l1, a2, l2] of table) {
    assert.deepEqual(Object.keys(phrases.decisions[eventId]).sort(), [a1, a2].sort(), eventId);
    const options = [a1, a2].map(actionId => ({ source: 'event_engine', eventId, actionId, label: actionId, playerLine: actionId }));
    const decision = { options, labels: [l1, l2] };
    for (const [text, expected] of samples[eventId]) assert.equal(B.resolveBranchDecisionInput(decision, text, lineOf)?.actionId, expected, text);
  }
});

// ---------- P2-2 跨国罗盘移动 ----------
const M = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
const AT = await loadTs('../src/modules/scenarioMods/actionTime.ts');
const N = await loadTs('../src/modules/sceneModule/numbers.ts');
const { gameTimeMinutes } = await loadTs('../src/utils/time.ts');
const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const opening = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
const readStage = async id => JSON.parse(await read(`src/modules/scenarioMods/builtins/data/${id}.json`));
const stageSave = async id => init.applyStrictScenarioInitializationToSave(
  opening.createQingyuOpeningPlaytestSave(parseScenarioMod(await readStage('lcq.stage_01')), '2026-10-31T00:00:00.000Z'),
  init.buildStrictScenarioInitialization(parseScenarioMod(await readStage(id))),
);
const JZ = 'liuchao.location.jiangzhou', LINAN = 'liuchao.location.lin_an';
async function jiangzhouToLinan() {
  let save = R.advanceScenarioRuntime(await stageSave('lyl.jiangzhou_retreat')).saveData;
  const first = R.getCurrentStoryEventActions(save).find(a => a.eventId === 'lyl.event.s01_01');
  assert.equal(R.recordStoryEventStructuredAction(save, first).completed, true);
  save = R.advanceScenarioRuntime(save).saveData;
  const travel = R.getCurrentStoryEventActions(save).find(a => a.eventId === 'lyl.event.s01_02');
  assert.equal(save.角色.位置.locationId, JZ);
  return { save, travel };
}

test('P2-2 来源：「去临安 · 见谢幼度」是 runtime 按 s01_02 的 locationId 生成的通用罗盘移动，不是剧情写死转场', async () => {
  const { save, travel } = await jiangzhouToLinan();
  assert.equal(travel.actionId, 'travel:liuchao.location.linan');
  assert.match(travel.label, /去临安/);
  const stage = await readStage('lyl.jiangzhou_retreat');
  const event = stage.scenario.events.find(e => e.id === 'lyl.event.s01_02');
  assert.equal(event.locationId, 'liuchao.location.linan');
  // 作者没有为这段水路写任何路程天数：唯一的 timeCost 是合同动作的回合数 1；运行时配置里也不是剧情转场。
  assert.deepEqual(event.playerCompletionContract.actions.map(a => a.timeCost), [1]);
  assert.equal(N.GAME_NUMBERS.crossCountryTravel.storyTransitionEventIds.includes(event.id), false);
  assert.equal(N.GAME_NUMBERS.story.actionTime.questRouteDays.eventIds.includes(event.id), false);
  assert.ok(M.crossCountryStoryTravel(save, travel));
});

test('P2-2 耗时依据：c385 的国内片刻修法不碰跨国；旧路径下这一步只按模型选档（一日＝1天，数日3＝3天），与地图32日脱节', async () => {
  const { save, travel } = await jiangzhouToLinan();
  for (const [response, days] of [[{ action_time: { tier: '一日' } }, 1], [{ action_time: { tier: '数日', days: 3 } }, 3]]) {
    const s = structuredClone(save), before = gameTimeMinutes(s.元数据.时间);
    const eventAction = { ...travel, travelFromLocationId: JZ };
    R.recordStoryEventStructuredAction(s, travel);
    AT.settleActionTime(s, response, { eventAction, timeActionId: 'p22:' + days }, null, false, false);
    assert.equal(gameTimeMinutes(s.元数据.时间) - before, days * 1440);
  }
  const preview = M.mapTravelPreview(save, LINAN);
  assert.equal(preview.days, 32);
});

test('P2-2 跨国罗盘（建议原句或手打）只写准备、引导地图；地图走完32日后到场才给合同动作', async () => {
  const { save, travel } = await jiangzhouToLinan();
  const across = M.crossCountryStoryTravel(save, travel);
  assert.deepEqual({ ...across }, { toId: LINAN, name: '临安', mapTargetId: LINAN, mapTargetName: '临安' });
  for (const text of [travel.playerLine, '去临安', '我去见谢幼度']) {
    assert.match(M.mapPreparation(save, text) || '', /准备前往临安。请打开地图/, text);
    assert.equal(M.mapPreparationNotice(save, text), '跨国出行请打开世界地图选择目的地');
  }
  assert.match(M.crossCountryStoryTravelToast(across), /打开地图前往临安/);
  const ui = await read('src/components/dashboard/MainGamePanel.vue');
  assert.match(ui, /const resolvedEventAction = crossCountryTravel \? undefined : matchedEventAction;/);
  assert.match(ui, /const mapPrep = crossCountryTravel \? crossCountryStoryTravelPreparation\(crossCountryTravel\)/);
  // 地图路线：32日、换国到临安；到场后罗盘消失，给 s01_02 的合同动作。
  const s = structuredClone(save), before = gameTimeMinutes(s.元数据.时间);
  assert.equal(M.settleMapTravel(s, M.selectMapTravel(s, LINAN)), true);
  assert.equal(gameTimeMinutes(s.元数据.时间) - before, 32 * 1440);
  assert.equal(s.角色.位置.locationId, LINAN);
  const after = R.getCurrentStoryEventActions(s).filter(a => a.eventId === 'lyl.event.s01_02');
  assert.ok(after.length && after.every(a => !a.actionId.startsWith('travel:')));
  assert.equal(M.crossCountryStoryTravel(s, travel), undefined);
});

test('P2-2 例外与边界：国内罗盘、南荒行旅关、剧情写死转场（五原→南荒商队）不拦；非地图落点引到该国代表地点', async () => {
  const at = (locationId, modId) => ({ 元数据: { 时间: { 年: 1, 月: 1, 日: 1, 小时: 0, 分钟: 0 } }, 角色: { 位置: { locationId } }, 系统: { 扩展: {} }, 世界: { 状态: { 剧本模组: { modId, completedEventIds: [] } } } });
  const compass = (eventId, to) => ({ source: 'event_engine', eventId, actionId: 'travel:' + to });
  // 国内（唐内）
  assert.equal(M.crossCountryStoryTravel(at('lyg.location.bolu_wangfu', 'lyg.ganlu_bian'), compass('x', 'liuchao.location.changan')), undefined);
  // 剧情写死的跨国转场：五原商队入南荒（lcq.stage_03 s03_07）
  assert.equal(M.crossCountryStoryTravel(at('liuchao.location.baihu_shang_guan', 'lcq.stage_03'), compass('lcq.event.s03_07', 'lcq.location.nanhuang_route')), undefined);
  // 南荒行旅关自有路线与时钟
  assert.equal(M.crossCountryStoryTravel(at('liuchao.location.wuyuan', 'lcq.stage_02'), compass('lcq.event.any', 'lcq.location.huamiao_village')), undefined);
  // 汉→唐大明宫：大明宫不是地图落点，引到长安
  const han = at('lyg.location.wuyang_houfu', 'lyg.ganlu_bian');
  const t = M.crossCountryStoryTravel(han, compass('lyg.event.li_jinxiang_meeting', 'lyg.location.daming_palace'));
  assert.equal(t.mapTargetId, 'liuchao.location.changan');
  assert.match(M.crossCountryStoryTravelPreparation(t), /打开地图选择前往长安的已开放路线，到后再前往/);
  // 非罗盘动作不受影响
  assert.equal(M.crossCountryStoryTravel(han, { source: 'event_engine', eventId: 'x', actionId: 'advance_declared_objective' }), undefined);
});
