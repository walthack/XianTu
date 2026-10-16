import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const diag = await loadTs('../src/services/requestLifecycleDiagnostics.ts');
const router = await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
const semantic = await loadTs('../src/modules/sceneModule/host/freeTextStatusSemantic.ts');

async function openingSave() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const playtest = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const stage01 = parseScenarioMod(JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url), 'utf8')));
  return rtm.advanceScenarioRuntime(playtest.createQingyuOpeningPlaytestSave(stage01)).saveData;
}

const intentWith = async (save, playerText, reply) => router.resolveNaturalIntent({ saveData: save, playerText, generate: async () => reply });

test('丢弃日志只留类别、原因码、票键；中文、过长、像密钥的内容一律不进日志', () => {
  diag.clearTicketDiscards();
  diag.noteTicketDiscard('intent', 'low_certainty', 'advance_declared_objective');
  diag.noteTicketDiscard('intent', '玩家原话：我砍王哲', '我砍王哲');
  diag.noteTicketDiscard('status', 'bad_evidence', 'sk-private-key-1234');
  diag.noteTicketDiscard('status', 'x'.repeat(200), 'k'.repeat(200));
  diag.noteTicketDiscard('intent', 'no_key');
  const rows = diag.peekTicketDiscards();
  assert.deepEqual(rows.map(r => [r.kind, r.reason, r.key]), [
    ['intent', 'low_certainty', 'advance_declared_objective'],
    ['intent', 'unknown', null],
    ['status', 'bad_evidence', null],
    ['status', 'unknown', null],
    ['intent', 'no_key', null],
  ]);
  assert.ok(rows.every(r => Object.keys(r).sort().join() === 'at,key,kind,reason,turnId'));
  assert.doesNotMatch(JSON.stringify(rows), /sk-|玩家|王哲/);
});

test('意图票的每条丢弃路径都留下原因码与票键，不含玩家原文与模型证据原文', async () => {
  const save = await openingSave();
  const text = '我四处打量一圈再说';
  const secretEvidence = 'sk-secret-evidence';
  const cases = [
    [JSON.stringify({ actionId: 'advance_declared_objective', evidence: '四处打量', certainty: 'low' }), 'low_certainty', 'advance_declared_objective'],
    [JSON.stringify({ certainty: 'high' }), 'missing_action', null],
    [JSON.stringify({ actionId: 'advance_declared_objective', evidence: secretEvidence, certainty: 'high' }), 'bad_evidence', 'advance_declared_objective'],
    ['这不是JSON', 'malformed', null],
  ];
  for (const [reply, reason, key] of cases) {
    diag.clearTicketDiscards();
    const result = await intentWith(save, text, reply);
    const rows = diag.peekTicketDiscards();
    assert.equal(rows.length, 1, `${reason}: ${JSON.stringify(rows)}`);
    assert.deepEqual([rows[0].kind, rows[0].reason, rows[0].key], ['intent', reason, key]);
    assert.equal(result.reason, reason, '日志原因码与返回的 reason 一致');
    assert.doesNotMatch(JSON.stringify(rows), new RegExp(`${secretEvidence}|四处打量`));
  }
});

test('模型明说 none 不是丢弃票，不记日志；生成函数抛错记 classifier_error', async () => {
  const save = await openingSave();
  diag.clearTicketDiscards();
  const none = await intentWith(save, '我四处打量一圈再说', JSON.stringify({ actionId: 'none', certainty: 'high' }));
  assert.equal(none.reason, 'explicit_none');
  assert.deepEqual(diag.peekTicketDiscards(), []);
  const failed = await router.resolveNaturalIntent({ saveData: save, playerText: '我四处打量一圈再说', generate: async () => { throw new Error('network sk-secret'); } });
  assert.ok(['classifier_error'].includes(failed.reason));
  assert.deepEqual(diag.peekTicketDiscards().map(r => [r.kind, r.reason, r.key]), [['intent', 'classifier_error', null]]);
  assert.doesNotMatch(JSON.stringify(diag.peekTicketDiscards()), /secret/);
});

test('状态提案被丢弃时留下原因码与状态 id', async () => {
  const proposal = (patch = {}) => ({ statusId: 'drunk', actor: 'player', assertion: 'current', source: 'input', evidence: '酩酊大醉', confidence: 0.95, ...patch });
  const input = '我喝得酩酊大醉。';
  const validate = (proposals, user = input) => semantic.validateFreeTextStatusProposals(JSON.stringify({ proposals }), user, '', 'input');
  const reasons = (fn) => { diag.clearTicketDiscards(); const r = fn(); return [r.state, diag.peekTicketDiscards().map(d => [d.kind, d.reason, d.key])]; };

  assert.deepEqual(reasons(() => semantic.validateFreeTextStatusProposals('garbage', input, '')), ['clarify', [['status', 'unparsable', null]]]);
  assert.deepEqual(reasons(() => validate([proposal({ evidence: '原文里没有这句话' })])), ['clarify', [['status', 'bad_evidence', 'drunk']]]);
  assert.deepEqual(reasons(() => validate([proposal({ minutes: 999 })])), ['clarify', [['status', 'extra_fields', 'drunk']]]);
  assert.deepEqual(reasons(() => validate([proposal({ statusId: 'invented' })])), ['clarify', [['status', 'out_of_contract', 'invented']]]);
  assert.deepEqual(reasons(() => validate([proposal({ actor: 'unknown' })])), ['clarify', [['status', 'uncertain_actor', 'drunk']]]);
  assert.deepEqual(reasons(() => validate([proposal(), proposal({ assertion: 'denied' })])), ['clarify', [['status', 'contradictory', null]]]);
  assert.deepEqual(reasons(() => validate([proposal({ actor: 'other' })])), ['resolved', [['status', 'ignored_other_actor', 'drunk']]]);
  assert.deepEqual(reasons(() => validate([proposal({ assertion: 'hypothetical' })])), ['resolved', [['status', 'ignored_hypothetical', 'drunk']]]);
  assert.deepEqual(reasons(() => validate([proposal()])), ['resolved', []], '被接受的提案不记丢弃');
  const failed = await semantic.recognizeFreeTextStatuses(input, '', async () => { throw new Error('boom'); });
  assert.equal(failed.state, 'clarify');
  assert.equal(diag.peekTicketDiscards().at(-1).reason, 'ask_failed');
});
