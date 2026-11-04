// REPORT-8091-68fe9d20 P1-4：任务模式 s02_06 之后卡在 gamble_bond_signed（150 回合 119 次「没对上」）。
// 根因：任务模式撤了主线按钮，本拍不是分支锁（不出固定选项）；清羽 Demo 的同拍作者短语（overlayDemoActionIntent）只挂在 Demo 档，
// 正式档在任务模式下没有任何短语，卡片选项原话（当面核对时限与刻香／盯住苏妲己的手）手打也认不出，只能靠小请求猜。
// 修：quests.json 给本拍两步补短语（Demo 同拍短语＋卡片原话）。五原赌局（ningyu_enters_gamble）与南荒之约仍是分支锁：锁输入、出固定选项。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { search: '', hostname: 'localhost' };
const quiet = async fn => { const k = ['log', 'info', 'warn', 'error'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };
const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const W = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const BP = await loadTs('../src/modules/scenarioMods/beatProgress.ts');
const BD = await loadTs('../src/modules/scenarioMods/branchDecision.ts');
const BG = await loadTs('../src/modules/scenarioMods/baihuGambleRefusal.ts');
const Q = await loadTs('../src/modules/scenarioMods/questLog.ts');
const cp = await loadTs('../src/modules/contentPacks/index.ts');
const { GAME_NUMBERS } = await loadTs('../src/modules/sceneModule/numbers.ts');
const { freshPrologueCheckpoint } = await import('../scripts/generate-prologue-checkpoint.mjs');
const QC = GAME_NUMBERS.story.quest;
const rt = s => s.世界.状态.剧本模组;
const focus = s => R.getScenarioFocusEvent(rt(s))?.id;

// 正式档（去掉 Demo 标记）走到 untilEvent 为焦点；分支锁一律选接赌／订约。
async function questSaveAt(untilEvent) {
  let { save } = await quiet(() => freshPrologueCheckpoint());
  for (const p of cp.CONTENT_PACKS.playtests) if (p.openingTextId) delete save.系统.扩展[p.extensionKey];
  await quiet(() => {
    W.settleWuyuanOpenWorldSelection(save, W.getWuyuanOpenWorldSelections(save).find(a => a.kind === 'problem_action'));
    save = R.advanceScenarioRuntime(save).saveData;
    for (let n = 0; n < 20 && focus(save) !== untilEvent; n++) {
      const ev = R.getScenarioFocusEvent(rt(save));
      const ids = new Set(ev.playerCompletionContract.actions.map(a => a.id));
      const a = R.getCurrentStoryEventActions(save).find(x => ids.has(x.actionId) && !/refuse/.test(x.actionId));
      R.recordStoryEventStructuredAction(save, a);
      save = R.advanceScenarioRuntime(save).saveData;
    }
  });
  assert.equal(focus(save), untilEvent);
  return save;
}
const withQuest = async fn => { const prev = QC.enabled; QC.enabled = true; try { return await fn(); } finally { QC.enabled = prev; } };

test('gamble_bond_signed 任务模式：卡片原话与 Demo 同拍短语手打能认出第 1 步；否定赌局的话不认', () => withQuest(async () => {
  const save = await questSaveAt('lcq.event.gamble_bond_signed');
  assert.equal(Q.questGuideEnabled(save), true);
  for (const text of ['我当面核对时限与刻香', '我盯住苏妲己的手，看她有没有动手脚', '我检查刻香']) {
    const hit = BP.resolveBeatText(save, text);
    assert.equal(hit?.action.selection.actionId, 'confirm_rigged_wager_loss', text);
  }
  assert.equal(BP.resolveBeatText(save, '不赌了，我检查刻香'), undefined);
  // 不是分支锁：不锁输入；按字没对上的自然说法仍是关键拍，发小请求。
  const opts = R.getCurrentStoryEventActions(save);
  assert.equal(BD.detectBranchDecision(opts), null);
  assert.equal(BP.beatKeyTurn(save, '我看着那炷香，心里发凉')?.key, 'scene');
}));

test('gamble_bond_signed 第 2 步：签契短语认出 sign_the_bond 并完成本拍；拒签不认', () => withQuest(async () => {
  let save = await questSaveAt('lcq.event.gamble_bond_signed');
  const first = BP.resolveBeatText(save, '我当面核对时限与刻香').action.selection;
  await quiet(() => { R.recordStoryEventStructuredAction(save, first); save = R.advanceScenarioRuntime(save).saveData; });
  assert.equal(BP.resolveBeatText(save, '我咬牙拿起契书，签下卖身契')?.action.selection.actionId, 'sign_the_bond');
  assert.equal(BP.resolveBeatText(save, '我拒绝签契'), undefined);
  const second = BP.resolveBeatText(save, '我咬牙拿起契书，签下卖身契').action.selection;
  const receipt = await quiet(() => R.recordStoryEventStructuredAction(save, second));
  assert.equal(receipt.completed, true);
}));

test('五原赌局分支锁仍在：凝羽入局答复那步出「接赌／不赌」固定选项、锁输入', () => withQuest(async () => {
  let save = await questSaveAt('lcq.event.ningyu_enters_gamble');
  await quiet(() => {
    const see = R.getCurrentStoryEventActions(save).find(a => a.actionId === 'see_ningyu_sent_into_gamble');
    R.recordStoryEventStructuredAction(save, see);
    save = R.advanceScenarioRuntime(save).saveData;
  });
  const opts = [...R.getCurrentStoryEventActions(save).filter(a => Q.questActionGate(save, a).ok), ...BG.getBaihuGambleRefusalSelections(save)];
  const decision = BD.detectBranchDecision(opts);
  assert.deepEqual(decision?.labels, ['接赌', '不赌']);
  assert.equal(BD.branchDecisionLocksInput(decision), true);
}));

test('quests.json 自检无问题（短语条数 ≤8、目标字数）', () => {
  assert.deepEqual(Q.validateQuestData(), []);
});
