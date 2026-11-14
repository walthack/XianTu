// REPORT-8091-75eaaee0 复测新问题回归：P2-1 固定选项分支期间关闭自由输入（输入框与发送键禁用、占位明示，只能点选项）；P2-2 跨国罗盘移动只写准备、引导地图。
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

test('P2-1 五原赌局：分支期间输入框与发送键一起禁用、占位明示；点选项结算后分支消失即恢复可输入', async () => {
  const { s, decision } = await gambleDecision();
  const [accept, decline] = decision.options;
  assert.equal(B.branchDecisionLocksInput(decision), true, '分支期间锁输入');
  // 手打一律不放行：只认点选的选项（选中且输入框就是该选项原句）。
  for (const text of ['接赌', '我接下这场赌局', '不赌', '随便聊聊']) assert.equal(B.branchDecisionAllowsSend(decision, null, text, lineOf), false, text);
  assert.equal(B.branchDecisionAllowsSend(decision, accept, lineOf(accept), lineOf), true);
  assert.equal(B.branchDecisionAllowsSend(decision, decline, lineOf(decline), lineOf), true);
  // 点「接赌」后：下一拍不再是分支点，输入恢复。
  const after = advance(structuredClone(s), accept);
  const next = B.detectBranchDecision(R.getCurrentStoryEventActions(after));
  assert.equal(next, null);
  assert.equal(B.branchDecisionLocksInput(next), false, '点选项后恢复可输入');
});

test('P2-1 界面：输入框与发送键都挂分支锁禁用，占位与提示文案来自 mod-kit 配置；手打代选已撤', async () => {
  const ui = await read('src/components/dashboard/MainGamePanel.vue');
  const config = JSON.parse(await read('mod-kit/branch-decision-ui.json'));
  const textarea = ui.match(/<textarea[\s\S]*?<\/textarea>/)[0];
  const send = ui.match(/<button\s+@click="sendMessage"[\s\S]*?class="send-button"/)[0];
  assert.match(textarea, /:disabled="[^"]*\|\| branchDecisionInputLocked"/, '输入框分支期间禁用');
  assert.match(send, /:disabled="[^"]*\|\| branchDecisionInputLocked"/, '发送键分支期间禁用');
  assert.match(textarea, /branchDecisionInputLocked \? BRANCH_DECISION_INPUT_PLACEHOLDER :/, '占位文字明示有意禁用');
  assert.match(ui, /const branchDecisionInputLocked = computed\(\(\) => branchDecisionLocksInput\(branchDecision.value\)\)/);
  // 建议区在分支期间点按即确认（发送键已禁用，不能只填入）。
  assert.match(ui, /@click="branchDecision \? confirmBranchDecision\(option\) : clickEngineOption\(option\)"/);
  assert.match(ui, /const confirmBranchDecision = async \(option: ScenarioEngineActionSelection\) => \{\n\s*selectScenarioEngineAction\(option\);\n\s*await sendMessage\(\);/, '点选项结算行为不变');
  // 文案不写死在组件里。
  assert.equal(B.BRANCH_DECISION_INPUT_PLACEHOLDER, config.inputPlaceholder);
  assert.equal(B.BRANCH_DECISION_HINT, config.hint);
  assert.equal(B.BRANCH_DECISION_TITLE, config.title);
  assert.equal(B.BRANCH_DECISION_BLOCKED_NOTICE, config.blockedSendNotice);
  assert.match(config.inputPlaceholder, /此处请从选项中选择/);
  assert.match(config.inputPlaceholder, /有意禁用/);
  for (const text of [config.inputPlaceholder, config.hint, config.blockedSendNotice]) assert.equal(ui.includes(text), false, text);
  // 6ec8d94c 的手打匹配代选已撤。
  assert.equal(B.resolveBranchDecisionInput, undefined);
  assert.equal(B.branchDecisionChoiceHint, undefined);
  assert.doesNotMatch(ui, /resolveBranchDecisionInput|branchDecisionChoiceHint|branch-decision-input-hint/);
  assert.doesNotMatch(await read('src/modules/scenarioMods/branchDecision.ts'), /branch-decision-phrases/);
  await assert.rejects(read('mod-kit/branch-decision-phrases.json'), { code: 'ENOENT' });
});

test('P2-1 通用于全部固定选项锁：每把锁激活时都关闭自由输入，手打选项原文也不代选', async () => {
  // B6：锁表大部分搬进塞外、昭南包 stageMeta（lockedDecision），改读合并后的 LOCKED_DECISIONS（原来按源码正则读 TS 表）
  const table = Object.entries(B.LOCKED_DECISIONS).map(([eventId, [[a1, l1], [a2, l2]]]) => [null, eventId, a1, l1, a2, l2]);
  assert.deepEqual(table.map(m => m[1]).sort(), ['lcq.event.free_ajiman', 'lcq.event.ningyu_enters_gamble', 'lcq.event.s05b_09_temporary_pact_with_xiaozi', 'lcq.event.shanghou_revealed', 'lcq.event.sudaji_south_pact', 'lcq.event.xieyi_entrustment']);
  for (const [, eventId, a1, l1, a2, l2] of table) {
    const options = [a1, a2].map(actionId => ({ source: 'event_engine', eventId, actionId, label: actionId, playerLine: `line:${actionId}` }));
    const decision = B.detectBranchDecision(options);
    assert.deepEqual(decision?.labels, [l1, l2], eventId);
    assert.equal(B.branchDecisionLocksInput(decision), true, eventId);
    for (const [i, label] of [l1, l2].entries()) {
      assert.equal(B.branchDecisionAllowsSend(decision, null, label, lineOf), false, label);
      assert.equal(B.branchDecisionAllowsSend(decision, options[i], lineOf(options[i]), lineOf), true, label);
    }
    assert.equal(B.detectBranchDecision(options.slice(1)), null, `${eventId} 决定步不在时不锁`);
  }
  assert.equal(B.branchDecisionLocksInput(null), false);
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
    // REPORT-8091-2ba71102 P2-A：常驻提示点名地图落点。
    assert.equal(M.mapPreparationNotice(save, text), '跨国出行请先开地图去临安');
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
