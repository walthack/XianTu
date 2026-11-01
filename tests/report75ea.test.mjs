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
