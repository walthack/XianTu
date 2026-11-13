// 主线拍没推进日志（LCQ-SAV-065）与判拍结果补字段（LCQ-SAV-062）：work/ASK-USER.md Q20 用户 2026-11-13 08:35 答复「先补日志」。
// 只断言日志字段；结算行为由 beatIntentSettle／beatJudge* 测试照旧守住（本批不改它们的断言）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { search: '', hostname: 'localhost' };
const quiet = fn => { const log = console.log, info = console.info, warn = console.warn; console.log = console.info = console.warn = () => {}; try { return fn(); } finally { Object.assign(console, { log, info, warn }); } };
const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const cp = await loadTs('../src/modules/contentPacks/index.ts');
const ec = await loadTs('../src/modules/scenarioMods/entityCatalog.ts');
const cr = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const NI = await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
const BP = await loadTs('../src/modules/scenarioMods/beatProgress.ts');
const SL = await loadTs('../src/modules/scenarioMods/beatStallLog.ts');
const { GAME_NUMBERS } = await loadTs('../src/modules/sceneModule/numbers.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const { resetLogState } = await loadTs('../src/modules/diagnostics/log.ts');
const { logStore } = await loadTs('../src/modules/diagnostics/store.ts');
const { ERROR_CODES } = await loadTs('../src/modules/diagnostics/codes.ts');
const rt = s => s.世界.状态.剧本模组;
const QC = GAME_NUMBERS.story.quest;
const withQuest = async fn => { const prev = QC.enabled; QC.enabled = true; try { return await fn(); } finally { QC.enabled = prev; } };

const MOD = (() => {
  const mod = ec.resolveScenarioContent(cp.applyContentPackOverlays(JSON.parse(read('src/modules/scenarioMods/builtins/data/lcq.stage_01.json'))));
  cr.resolveScenarioCharacters(mod.canon?.characters, mod.manifest.id);
  return mod;
})();
const newSave = () => quiet(() => R.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(MOD))).saveData);
// 每拍点本拍动作（或前往）走 n 手，同 beatIntentSettle.test.mjs 的 saveAt。
const saveAt = n => {
  let s = newSave();
  for (let i = 0; i < n; i++) {
    const focus = R.getScenarioFocusEvent(rt(s));
    const ids = new Set((focus?.playerCompletionContract?.actions || []).map(a => a.id));
    const actions = R.getCurrentStoryEventActions(s).filter(a => a.eventId === focus?.id);
    const a = actions.find(x => ids.has(x.actionId)) || actions.find(x => x.actionId.startsWith('travel:'));
    rt(s).worldTurn++;
    quiet(() => R.recordStoryEventStructuredAction(s, a));
    s.系统.历史.叙事.push({ type: 'gm', content: '风从草原尽头吹来。' });
    s = quiet(() => R.advanceScenarioRuntime(s).saveData);
  }
  return s;
};
const S01_03 = 2, S01_05_AWAY = 5;
const NONE = JSON.stringify({ actionId: 'none', certainty: 'high', evidence: '', statusProposals: [], tickets: [] });
const route = (save, text, beatReply) => NI.resolveNaturalIntent({
  saveData: save, playerText: text, selected: null, resolveFromText: NI.resolveStoryEventActionFromText,
  generate: async () => NONE,
  generateBeat: async () => ({ raw: JSON.stringify(beatReply), inputTokens: 200, outputTokens: 20 }),
});
const entries = async code => (await logStore.all()).filter(e => e.code === code);
const NO_EXTRA = { pendingJudgement: false, intentHold: false };

test('LCQ-SAV-065 已登记；配置 story.quest.beatStall.textChars 默认 80', () => {
  assert.equal(ERROR_CODES['LCQ-SAV-065'].level, 'info');
  assert.equal(ERROR_CODES['LCQ-SAV-065'].module, 'beatProgress');
  assert.equal(QC.beatStall.textChars, 80);
  assert.equal(JSON.parse(read('mod-kit/numbers-progress.json')).story.quest.beatStall.textChars, 80);
  assert.equal(JSON.parse(read('mod-kit/game-numbers.qingyu.json')).story.quest.beatStall.textChars, 80);
});

test('人不在本拍地点（引擎只给罗盘移动）、照任务日志目标打字：reason=notThere（travelOnly），记要求地点、位置前后、目标原文与输入', () => withQuest(async () => {
  await resetLogState();
  const s = saveAt(S01_05_AWAY);
  assert.equal(R.getScenarioFocusEvent(rt(s)).id, 'lcq.event.s01_05');
  const text = '在帅帐里把来历说清楚，先让对方诊治你的伤';
  const probe = SL.beginBeatStallProbe(s, text);
  SL.noteBeatStallVia(probe, 'miss', undefined, { freeActionTickets: false });
  probe.narrativeSent = true; probe.committed = true;
  const entry = SL.finishBeatStallProbe(probe, s, NO_EXTRA);
  assert.ok(entry);
  const d = entry.detail;
  assert.equal(d.reason, 'notThere');
  assert.equal(d.gate.notThereKind, 'travelOnly');
  assert.equal(d.beatId, 'lcq.event.s01_05');
  assert.equal(d.stageId, 'lcq.stage_01');
  assert.equal(typeof d.turn, 'number');
  assert.equal(d.via, 'miss');
  assert.equal(d.gate.travelOnly, true);
  assert.deepEqual(d.gate.required.map(r => [r.source, r.where, r.whereName, r.whereOk]), [['travel', 'lcq.location.command_tent', '帅帐', false]]);
  assert.equal(d.location.before, 'lcq.location.grassland');
  assert.equal(d.location.descBefore, '中立边陲·草原');
  assert.equal(d.location.after, 'lcq.location.grassland');
  assert.equal(d.location.changed, false);
  assert.equal(d.gate.okAfter, false);
  assert.equal(d.objective, '在帅帐里把来历说清楚，先让对方诊治你的伤');
  assert.equal(d.place, '帅帐');
  assert.equal(d.narrativeSent, true, '账上没发生、正文照写的回合');
  assert.equal(d.inputLength, [...text].length);
  assert.equal(d.input, text, '默认 textChars=80，短句原样记');
  assert.equal(d.judgeOutcome, undefined);
  assert.deepEqual((await entries('LCQ-SAV-065')).length, 1);
}));

test('人不在场后被挪到本拍地点：locationChanged、gateOkAfter=true', () => withQuest(async () => {
  await resetLogState();
  const s = saveAt(S01_05_AWAY);
  const probe = SL.beginBeatStallProbe(s, '我在帅帐里把来历说清楚');
  SL.noteBeatStallVia(probe, 'miss', undefined, {});
  probe.committed = true;
  const after = structuredClone(s);
  after.角色.位置 = { 描述: '中立边陲·草原·帅帐', locationId: 'lcq.location.command_tent' };
  const d = SL.finishBeatStallProbe(probe, after, NO_EXTRA)?.detail;
  assert.ok(d);
  assert.equal(d.location.after, 'lcq.location.command_tent');
  assert.equal(d.location.changed, true);
  assert.equal(d.gate.okAfter, true);
}));

test('quests.json 的 where／who 闸门没过（beat.resolve via=notThere）：reason=notThere（questGate）', () => withQuest(async () => {
  await resetLogState();
  const s = saveAt(S01_03);
  const probe = SL.beginBeatStallProbe(s, '我上前看看');
  SL.noteBeatStallVia(probe, 'notThere', undefined, {});
  const d = SL.finishBeatStallProbe(probe, s, NO_EXTRA)?.detail;
  assert.equal(d.reason, 'notThere');
  assert.equal(d.gate.notThereKind, 'questGate');
}));

test('字链和短语都没对上、没发判拍：reason=miss，无 judgeOutcome', () => withQuest(async () => {
  await resetLogState();
  const s = saveAt(S01_03);
  const probe = SL.beginBeatStallProbe(s, '我看看四周');
  SL.noteBeatStallVia(probe, 'miss', undefined, {});
  probe.narrativeSent = true; probe.committed = true;
  const d = SL.finishBeatStallProbe(probe, s, NO_EXTRA)?.detail;
  assert.equal(d.reason, 'miss');
  assert.equal(d.gate.travelOnly, false);
  assert.equal(d.judgeOutcome, undefined);
}));

test('判拍 bad_evidence：065 reason=judgeUnsettled 带 outcome；062 记模型挑的动作、c、neg、引用长度、逐字与否、候选 id，不记引用内容', () => withQuest(async () => {
  await resetLogState();
  const s = saveAt(S01_03);
  const text = '我蹲下查看那个受伤军士的伤势。';
  const probe = SL.beginBeatStallProbe(s, text);
  const ev = '替他包扎伤口';
  const result = await route(s, text, { id: 'advance_declared_objective', c: 'high', ev, neg: false });
  assert.notEqual(result.reason, 'beat_intent');
  const [judged] = await entries('LCQ-SAV-062');
  assert.equal(judged.detail.outcome, 'bad_evidence');
  assert.equal(judged.detail.pickedId, 'advance_declared_objective');
  assert.equal(judged.detail.c, 'high');
  assert.equal(judged.detail.neg, false);
  assert.equal(judged.detail.evLength, ev.length);
  assert.equal(judged.detail.evClippedLength, undefined);
  assert.equal(judged.detail.evMaxChars, QC.intentSettle.beatJudge.evidenceMaxChars);
  assert.equal(judged.detail.evVerbatim, false);
  assert.deepEqual(judged.detail.candidateIds, ['advance_declared_objective']);
  assert.ok(!JSON.stringify(judged.detail).includes(ev), '不记引用内容');
  SL.noteBeatStallVia(probe, 'miss', undefined, {});
  probe.narrativeSent = true; probe.committed = true;
  const d = SL.finishBeatStallProbe(probe, s, NO_EXTRA)?.detail;
  assert.equal(d.reason, 'judgeUnsettled');
  assert.equal(d.judgeOutcome, 'bad_evidence');
  assert.equal(d.judgeAttempt, 1);
}));

test('判拍 judged_none：065 reason=judgeUnsettled、judgeOutcome=judged_none；062 pickedId=none', () => withQuest(async () => {
  await resetLogState();
  const s = saveAt(S01_03);
  const text = '我蹲下查看那个受伤军士的伤势。';
  const probe = SL.beginBeatStallProbe(s, text);
  await route(s, text, { id: 'none', c: 'high', ev: '', neg: false });
  const [judged] = await entries('LCQ-SAV-062');
  assert.equal(judged.detail.outcome, 'judged_none');
  assert.equal(judged.detail.pickedId, 'none');
  assert.equal(judged.detail.evLength, 0);
  assert.equal(judged.detail.evVerbatim, false);
  SL.noteBeatStallVia(probe, 'miss', undefined, {});
  const d = SL.finishBeatStallProbe(probe, s, NO_EXTRA)?.detail;
  assert.equal(d.reason, 'judgeUnsettled');
  assert.equal(d.judgeOutcome, 'judged_none');
}));

test('062：引用超长但逐字一致被截取时另记 evClippedLength；被否决（neg）也记模型挑的动作', () => withQuest(async () => {
  await resetLogState();
  const s = saveAt(S01_03);
  const max = QC.intentSettle.beatJudge.evidenceMaxChars;
  const text = '我蹲下查看那个受伤军士的伤势，再撕下衣襟替他把腿上的伤口一圈一圈包扎好。';
  const ev = '我蹲下查看那个受伤军士的伤势，再撕下衣襟替他把腿上的伤口';
  assert.ok(ev.length > max);
  await route(s, text, { id: 'advance_declared_objective', c: 'high', ev, neg: false });
  const [long] = await entries('LCQ-SAV-062');
  assert.equal(long.detail.evLength, ev.length);
  assert.equal(long.detail.evClippedLength, max);
  assert.equal(long.detail.evVerbatim, true);
  await resetLogState();
  await route(s, '我蹲下查看那个受伤军士的伤势。', { id: 'advance_declared_objective', c: 'high', ev: '查看那个受伤军士的伤势', neg: true });
  const [neg] = await entries('LCQ-SAV-062');
  assert.equal(neg.detail.outcome, 'negated');
  assert.equal(neg.detail.pickedId, 'advance_declared_objective');
  assert.equal(neg.detail.neg, true);
  assert.equal(neg.detail.evVerbatim, true);
}));

test('beatStall.textChars=0：只记长度不记文本；超过上限时截断；不动全局 diagnostics.textChars', () => withQuest(async () => {
  const prev = QC.beatStall.textChars, globalPrev = GAME_NUMBERS.diagnostics.textChars;
  try {
    const s = saveAt(S01_03);
    const text = '我看看四周有没有别的人。';
    QC.beatStall.textChars = 0;
    await resetLogState();
    let probe = SL.beginBeatStallProbe(s, text);
    SL.noteBeatStallVia(probe, 'miss', undefined, {});
    let d = SL.finishBeatStallProbe(probe, s, NO_EXTRA).detail;
    assert.equal(d.inputLength, [...text].length);
    assert.ok(!d.input.includes('四周'), `不记原文：${d.input}`);
    assert.match(d.input, new RegExp(`${[...text].length}字`));
    QC.beatStall.textChars = 4;
    await resetLogState();
    probe = SL.beginBeatStallProbe(s, text);
    SL.noteBeatStallVia(probe, 'miss', undefined, {});
    d = SL.finishBeatStallProbe(probe, s, NO_EXTRA).detail;
    assert.ok(d.input.startsWith('我看看四'));
    assert.ok(!d.input.includes('有没有'));
    assert.equal(GAME_NUMBERS.diagnostics.textChars, globalPrev);
  } finally { QC.beatStall.textChars = prev; }
}));

test('推进了不记：命中本拍动作且已提交、或焦点拍已完成', () => withQuest(async () => {
  await resetLogState();
  const s = saveAt(S01_03);
  const probe = SL.beginBeatStallProbe(s, '战场上有名受伤军士，先判断该不该伸手相助');
  SL.noteBeatStallVia(probe, 'exact', 'advance_declared_objective', {});
  probe.committed = true;
  assert.equal(SL.finishBeatStallProbe(probe, s, NO_EXTRA), null);
  const next = saveAt(S01_03 + 1);
  const probe2 = SL.beginBeatStallProbe(s, '我看看四周');
  SL.noteBeatStallVia(probe2, 'miss', undefined, {});
  assert.equal(SL.finishBeatStallProbe(probe2, next, NO_EXTRA), null, '拍键已变');
  assert.equal((await entries('LCQ-SAV-065')).length, 0);
  assert.equal(SL.beginBeatStallProbe(s, '   '), undefined, '没有输入不记');
}));

test('原因分类：超时、罗盘移动、没提交、场面、判定卡、停下保留输入、自由行动票、别的引擎、没有动作', () => {
  const base = { via: undefined, actionId: undefined, clues: [], committed: true, exit: undefined, travelOnly: false };
  const c = (patch, judge = null, extra = NO_EXTRA) => SL.classifyBeatStall({ ...base, ...patch }, judge, extra);
  assert.equal(c({ via: 'miss' }, 'timeout'), 'judgeTimeout');
  assert.equal(c({ via: 'miss' }, 'low_certainty'), 'judgeUnsettled');
  assert.equal(c({ via: 'miss' }, 'settled'), 'miss');
  assert.equal(c({ via: 'exact', actionId: 'travel:lcq.location.command_tent' }), 'travel');
  assert.equal(c({ via: 'alias', actionId: 'advance_declared_objective', committed: false }), 'turnFailed');
  assert.equal(c({ exit: 'scene' }), 'scene');
  assert.equal(c({}, null, { pendingJudgement: true, intentHold: false }), 'judgementPending');
  assert.equal(c({}, null, { pendingJudgement: false, intentHold: true }), 'intentHold');
  assert.equal(c({ via: 'other', clues: ['freeActionTickets'] }), 'freeAction');
  assert.equal(c({ via: 'other', clues: ['opportunity'] }), 'otherEngine');
  assert.equal(c({ via: 'none' }), 'noActions');
  assert.equal(c({}), 'other');
  for (const reason of ['notThere', 'miss', 'judgeUnsettled', 'judgeTimeout', 'travel', 'turnFailed', 'scene', 'judgementPending', 'intentHold', 'freeAction', 'otherEngine', 'noActions', 'other']) assert.ok(SL.BEAT_STALL_REASONS.includes(reason));
});

test('MainGamePanel 接线：回合开头取快照、beat.resolve 记 via、发主叙事前标 narrativeSent、finally 里收尾（只加日志调用）', () => {
  const src = read('src/components/dashboard/MainGamePanel.vue');
  assert.match(src, /beatStall = beginBeatStallProbe\(gameStateStore\.toSaveData\(\), inputText\.value\)/);
  assert.match(src, /noteBeatStallVia\(beatStall, via,/);
  assert.match(src, /if \(beatStall\) beatStall\.narrativeSent = true;\n\s+const budget = /);
  assert.match(src, /\} finally \{\n\s+finishBeatStallProbe\(beatStall, gameStateStore\.toSaveData\(\), \{ pendingJudgement: Boolean\(pendingJudgement\.value\), intentHold: Boolean\(intentHoldMessage\.value\) \}\);\n\s+\}\n\s+\} catch \(error\) \{ \/\/ lcq-allow: 内层 try 之外/);
});
