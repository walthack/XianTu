// REPORT-8091-68fe9d20 P1-1：拍子判定判中 s02_04 点心铺开放世界应对时，不得本地直接写成功、只本地叙事；
// 须先走常规判定卡，确认后按判定结果结算，并发主叙事请求（不带 openWorldAction，AIBS 就走正常模型请求）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { search: '', hostname: 'localhost' };
const quiet = async fn => { const k = ['log', 'info', 'warn', 'error'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };
const H = await loadTs('../src/modules/scenarioMods/beatOpenWorldJudgement.ts');
const W = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const P = await loadTs('../src/utils/judgementPreflight.ts');
const { freshPrologueCheckpoint } = await import('../scripts/generate-prologue-checkpoint.mjs');
const panel = readFileSync(new URL('../src/components/dashboard/MainGamePanel.vue', import.meta.url), 'utf8');
const intent = { certainty: 'high', evidenceLength: 6 };

test('只认拍子判定判中的开放世界行动', () => {
  assert.equal(H.isBeatJudgedOpenWorldAction(intent, { source: 'open_world_engine' }), true);
  assert.equal(H.isBeatJudgedOpenWorldAction(undefined, { source: 'open_world_engine' }), false);
  assert.equal(H.isBeatJudgedOpenWorldAction(intent, { source: 'event_engine' }), false);
});

test('判定卡 id 对上才沿用当初判中的选择，取一次即清', () => {
  const selection = { source: 'open_world_engine', kind: 'problem_action', identityId: 'x', settledFacts: [] };
  H.rememberBeatOpenWorldJudgement({ judgementId: 'j1', selection, beatIntent: intent });
  assert.equal(H.takeBeatOpenWorldJudgement('j2'), undefined);
  assert.equal(H.takeBeatOpenWorldJudgement('j1'), undefined, '对不上时已清掉');
  H.rememberBeatOpenWorldJudgement({ judgementId: 'j1', selection, beatIntent: intent });
  assert.equal(H.takeBeatOpenWorldJudgement('j1')?.selection.identityId, 'x');
  assert.equal(H.takeBeatOpenWorldJudgement('j1'), undefined);
});

test('结算档与事件判定缺省成功档一致；未出判定卡照常结算', () => {
  for (const o of ['success', 'great_success', 'perfect']) assert.equal(H.beatOpenWorldOutcomeSettles(o, true), true);
  for (const o of ['partial', 'failure', 'critical_failure']) assert.equal(H.beatOpenWorldOutcomeSettles(o, true), false);
  assert.equal(H.beatOpenWorldOutcomeSettles(undefined, false), true);
});

test('s02_04 点心铺：有风险的手打原话出常规判定卡；叙事后结算生效', async () => {
  const { save } = await quiet(() => freshPrologueCheckpoint());
  const action = W.getWuyuanOpenWorldSelections(save).find(a => a.kind === 'problem_action');
  assert.ok(action, '点心铺应有开放世界问题行动');
  const proposal = P.buildLocalJudgementPreflight('我上前拦住那几个打手，掩护阿姐逃离点心铺', save, 1);
  assert.ok(proposal?.id, '风险原话应出判定卡');
  assert.equal(await quiet(() => H.settleBeatOpenWorldAfterNarrative(save, action)), true);
});

test('MainGamePanel：拍子判定的开放世界应对不再走本地捷径', () => {
  assert.match(panel, /isBeatJudgedOpenWorldAction\(routedBeatIntent, routedIntentAction\)/);
  assert.match(panel, /rememberBeatOpenWorldJudgement\(\{ judgementId: proposal\.id/);
  assert.match(panel, /\|\| \(beatOpenWorldAction && !exactSelectedOpenWorldAction\)\n\s+\? undefined/, 'beat 判中的不进 resolvedOpenWorldAction（即不设 options.openWorldAction）');
  assert.match(panel, /settleBeatOpenWorldAfterNarrative\(settleSave as any, selection\)/);
  assert.match(panel, /await settleBeatOpenWorldTurn\(beatOpenWorldAction\);\n\s+await tickEncounterAfterTurn\(aiResponse\)/);
});
