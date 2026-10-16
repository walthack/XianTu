import assert from 'node:assert/strict';
import test from 'node:test';
import { mod, makeContract } from './sceneModuleFixture.mjs';
import { loadTs } from './loadTs.mjs';

const contract = makeContract();
const rule = text => mod.classifyByRules(contract, text);

test('转述片段：从“她说/他说…”起到句末被剥掉，对她说/跟他说/她说完不算转述', () => {
  assert.equal(mod.stripReportedSpeech('她说你要砍我吗'), '');
  assert.equal(mod.stripReportedSpeech('她说：“你要砍我。”我点头。'), '”我点头。');
  assert.equal(mod.stripReportedSpeech('别人说你偷袭了她。我拔刀。'), '我拔刀。');
  assert.equal(mod.stripReportedSpeech('我对她说我要砍了你'), '我对她说我要砍了你');
  assert.equal(mod.stripReportedSpeech('我告诉他说我要攻击你'), '我告诉他说我要攻击你');
  assert.equal(mod.stripReportedSpeech('她说完，我一刀砍向她'), '她说完，我一刀砍向她');
  assert.equal(mod.stripReportedSpeech('他说话的样子很凶，我上前攻击他'), '他说话的样子很凶，我上前攻击他');
  assert.equal(mod.stripReportedSpeech(''), '');
});

test('场面输入：转述里的行动词不是玩家动作，不进行动流程', () => {
  for (const text of ['她说你要砍我吗', '她说你要砍我', '她说：你要砍我吗', '他说你要攻击我', '别人说你偷袭了她', '有人说你要冲上去', '他们说你拔刀了', '他问我要不要砍他', '她说你看到周围有什么吗']) {
    const verdict = rule(text);
    assert.notEqual(verdict.class, 'action', `${text} 不应判为玩家行动：${JSON.stringify(verdict)}`);
  }
  assert.deepEqual([rule('她说你要砍我').class, rule('她说你要砍我').strength], ['chat', 'strong']);
});

test('场面输入：玩家自己的话或转述之外的动作照常判行动', () => {
  for (const text of ['我砍他', '我对她说我要砍了你', '我告诉他说我要攻击你', '她说完，我一刀砍向她', '他说话的样子很凶，我上前攻击他', '她说你要砍我。我拔刀迎上去', '她说你要砍我。我借浓雾绕到他背后']) {
    assert.equal(rule(text).class, 'action', `${text} 应判为玩家行动`);
  }
  assert.equal(rule('我砍他行吗？').class, 'unclear', '玩家自己的问句行为不变');
});

test('关键词判定预检：转述里的“攻击/偷袭”不发判定卡，玩家自己的动作照常发', async () => {
  const { buildLocalJudgementPreflight } = await loadTs('../src/utils/judgementPreflight.ts');
  const save = { 角色: { 身份: { 先天六司: {}, 后天六司: {} }, 位置: { 灵气浓度: 50 } } };
  for (const text of ['他说你要攻击我', '别人说你偷袭了她', '他说你要攻击我吗', '她说你要攻击我，我就迎战', '有人说你们要潜入府邸']) {
    assert.equal(buildLocalJudgementPreflight(text, save, 1), null, `${text} 不应发判定卡`);
  }
  assert.equal(buildLocalJudgementPreflight('我攻击他', save, 1)?.kind, 'combat');
  assert.equal(buildLocalJudgementPreflight('我对她说我要攻击你', save, 1)?.kind, 'combat', '对她说是玩家自己的话，保持原行为');
  assert.equal(buildLocalJudgementPreflight('她说完，我一刀砍向她', save, 1)?.kind, 'combat');
  assert.equal(buildLocalJudgementPreflight('她说你要攻击我。我潜入府邸', save, 1)?.kind, 'stealth', '转述句之后的另一句照常判');
});
