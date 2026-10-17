// 自由行动票接进 intent 路由：提示词由 config 生成、票只在自由回合收、坏响应不收、关闭开关与今天逐字一致；
// 顺手修的 hasUnclearIntentFrame 子串匹配（“我对她说…”被误当转述）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { DUAN_QIANG, WANG_ZHE, load, makeSave, mods } from './freeActionFixture.mjs';

const router = mods.router;
const N = mods.numbers;

const stub = reply => {
  const calls = [];
  const generate = async input => { calls.push(input); return typeof reply === 'function' ? reply(input) : reply; };
  return { generate, calls };
};
const ticketJson = (patch = {}) => ({ actionClass: 'physical', variant: 'attack', targetId: WANG_ZHE, degree: 'normal', performed: 'yes', evidence: '一刀砍向王哲', itemId: null, ...patch });
const reply = (tickets, extra = {}) => JSON.stringify({ actionId: 'none', certainty: 'high', evidence: '', statusProposals: [], tickets, ...extra });
const fresh = () => makeSave({ present: [WANG_ZHE], favor: { [WANG_ZHE]: 55 } });
const run = (saveData, playerText, generate) => router.resolveNaturalIntent({ saveData, playerText, selected: null, generate });
const withDisabled = async fn => {
  N.applyGameNumbers({ freeAction: { enabled: false } });
  try { return await fn(); } finally { N.applyGameNumbers({ freeAction: { enabled: true } }); }
};

test('试玩存档的 intent 提示里带票说明、在场名单、背包名单；类→变体清单只列启用的（bind 不在）', async () => {
  const save = fresh();
  assert.equal((await load('../src/modules/scenarioMods/playtestNarrativeScope.ts')).isScopedNaturalIntentSave(save), true);
  const { generate, calls } = stub(reply([]));
  await run(save, '我拔刀，一刀砍向王哲！', generate);
  const { systemPrompt, userPrompt } = calls[0];
  assert.match(systemPrompt, /自由行动票/);
  assert.match(systemPrompt, /"tickets":\[\]/);
  const payload = JSON.parse(userPrompt).freeAction;
  assert.deepEqual(payload.roster.map(r => r.id).sort(), [DUAN_QIANG, WANG_ZHE].sort());
  const variants = Object.fromEntries(payload.classes.map(c => [c.actionClass, c.variants.map(v => v.variant)]));
  assert.deepEqual(variants.physical, ['attack', 'grab', 'drain_qi']);
  assert.deepEqual(variants.cast, ['transfer_qi', 'heal', 'bandage']);
  assert.equal('other' in variants, false);
  assert.ok(Array.isArray(payload.items));
});

test('模型说 none 并报票：校验通过的票挂在自由结果上；名单外/越权字段/证据对不上的丢弃并记原因码', async () => {
  const save = fresh();
  mods.diag.clearTicketDiscards();
  const text = '我拔刀，一刀砍向王哲！';
  const { generate } = stub(reply([ticketJson(), ticketJson({ targetId: 'lcq.character.nobody', evidence: '一刀砍向' })]));
  const result = await run(save, text, generate);
  assert.equal(result.kind, 'free');
  assert.equal(result.skipKeywordPreflight, true);
  assert.equal(result.freeActionTickets.length, 1);
  assert.deepEqual(Object.keys(result.freeActionTickets[0]).sort(), ['actionClass', 'degree', 'evidence', 'itemId', 'performed', 'targetId', 'variant']);
  const dropped = mods.diag.peekTicketDiscards().filter(d => d.kind === 'free_action');
  assert.deepEqual(dropped.map(d => d.reason), ['target_not_present']);
  assert.equal(JSON.stringify(dropped).includes('王哲'), false, '丢弃日志里没有玩家原话');
  const second = await run(save, text, stub(reply([ticketJson({ delta: 100 })])).generate);
  assert.equal(second.freeActionTickets, undefined);
  assert.ok(mods.diag.peekTicketDiscards().some(d => d.reason === 'extra_fields'));
});

test('T13 模型失败（坏 JSON / 超时）：不收票、不写任何状态', async () => {
  const save = fresh();
  router.listNaturalIntentCandidates(save); // 路由本来就会补一次事件元数据；以它为基线
  const before = structuredClone(save);
  for (const generate of [stub('这不是 JSON').generate, async () => { throw new Error('timeout'); }]) {
    const result = await run(save, '我拔刀，一刀砍向王哲！', generate);
    assert.equal(result.freeActionTickets, undefined);
  }
  assert.deepEqual(save, before);
});

test('不确定（low）也收票；候选命中（matched）时不收票，避免同拍双结算', async () => {
  const save = fresh();
  const low = await run(save, '我拔刀，一刀砍向王哲！', stub(JSON.stringify({ actionId: 'none', certainty: 'low', tickets: [ticketJson()] })).generate);
  assert.equal(low.freeActionTickets?.length, 1);
  const candidates = router.listNaturalIntentCandidates(save);
  const pick = candidates.find(c => c.eventId && c.source === 'event_engine');
  assert.ok(pick, '夹具里应有事件候选');
  const text = `我${pick.playerLine}`;
  const matched = await run(save, text, stub(JSON.stringify({ actionId: pick.actionId, source: pick.source, eventId: pick.eventId, contractHash: pick.contractHash, evidence: pick.playerLine.slice(0, 4), certainty: 'high', affinityDelta: 0, statusProposals: [], tickets: [ticketJson({ evidence: pick.playerLine.slice(0, 4) })] })).generate);
  assert.equal(matched.kind, 'matched', '夹具要真的命中作者动作，这条断言才有意义');
  assert.equal(matched.freeActionTickets, undefined);
});

test('T15 回滚开关：freeAction.enabled=false 时提示词不带票说明、响应里的票一律不收（与今天一致）', async () => {
  const save = fresh();
  await withDisabled(async () => {
    const { generate, calls } = stub(reply([ticketJson()]));
    const result = await run(save, '我拔刀，一刀砍向王哲！', generate);
    assert.doesNotMatch(calls[0].systemPrompt, /自由行动票|tickets/);
    assert.equal('freeAction' in JSON.parse(calls[0].userPrompt), false);
    assert.equal(result.freeActionTickets, undefined);
  });
  const on = stub(reply([]));
  await run(save, '我拔刀，一刀砍向王哲！', on.generate);
  assert.match(on.calls[0].systemPrompt, /自由行动票/);
});

test('hasUnclearIntentFrame：“我对她说…/跟他说/告诉她说”是玩家自己在说话，“她说完/他说话”不是转述；真转述与问句仍判含糊', () => {
  const unclear = router.hasUnclearIntentFrame;
  for (const text of ['我对她说我要砍了你', '我跟他说你别过来', '我告诉她说我不赌', '她说完，我一刀砍向她', '他说话的样子很凶，我上前攻击他', '我向他说明来意', '我朝她说了一句话']) {
    assert.equal(unclear(text), false, `${text} 是玩家自己的话/动作，不该被当含糊句式`);
  }
  for (const text of ['她说你要砍我', '他说你要攻击我吗', '别人说你偷袭了她', '有人说你拔刀了', '他们说你要走', '他问我要不要砍他', '她问我是谁', '如果我砍了他会怎样？', '我是不是该动手', '']) {
    assert.equal(unclear(text), true, `${text} 应判含糊`);
  }
  assert.equal(unclear('凝羽说你要走'), true, '人名 + 说 同样是转述');
  assert.equal(unclear('我对凝羽说我要走'), false);
});
