// 任务模式拍子按意图结算（设计稿 2026-11-04「任务模式拍子按意图结算」方案 A＋第 9 节收窄）回归：关键拍本地判定、拍子判定小请求、rejectIf 优先、非关键拍与只剩前往不发请求。
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
const Q = await loadTs('../src/modules/scenarioMods/questLog.ts');
const { GAME_NUMBERS } = await loadTs('../src/modules/sceneModule/numbers.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const { resetLogState } = await loadTs('../src/modules/diagnostics/log.ts');
const { logStore } = await loadTs('../src/modules/diagnostics/store.ts');
const rt = s => s.世界.状态.剧本模组;
const QC = GAME_NUMBERS.story.quest;
const withQuest = (on, fn) => {
  const prev = QC.enabled; QC.enabled = on;
  let out;
  try { out = fn(); } catch (error) { QC.enabled = prev; throw error; }
  if (out && typeof out.then === 'function') return out.finally(() => { QC.enabled = prev; });
  QC.enabled = prev; return out;
};

const STAGES = ['lcq.stage_01', 'lcq.stage_02', 'lcq.stage_03', 'lcq.stage_03b_snake_flower_bridge'];
const MODS = STAGES.map(id => {
  const mod = ec.resolveScenarioContent(cp.applyContentPackOverlays(JSON.parse(read(`src/modules/scenarioMods/builtins/data/${id}.json`))));
  cr.resolveScenarioCharacters(mod.canon?.characters, mod.manifest.id);
  return mod;
});
const SHUAI_ZHANG = 'lcq.location.shuai_zhang';
const newSave = () => quiet(() => R.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(MODS[0]))).saveData);
const moveTo = (s, locationId, text) => { s.角色.位置 = { ...(s.角色.位置 || {}), 描述: text, locationId }; };
// 一回合＝MainGamePanel.sendMessage 的本地部分（同 reportEf57）：到点对齐 → 启程文字 → 本拍动作（对不上记 miss／notThere）→ 推进 → 回合收尾（开关开：任务日志分级；关：两种空转提示）。
function turn(save, input, clicked) {
  const trace = {};
  BP.applyBeatDeadlines(rt(save).events);
  BP.prepareBeatDeadlineTurn(save);
  const typed = clicked ? undefined : BP.resolveBeatText(save, input);
  if (typed?.action.kind === 'departure') {
    const t = quiet(() => init.transitionToNextScenarioStage(save, MODS));
    assert.ok(t.ok, t.reason);
    return { save: t.saveData, trace: { departed: 'text', via: typed.via } };
  }
  rt(save).worldTurn++;
  const action = clicked || (typed?.action.kind === 'event' ? typed.action.selection : undefined);
  trace.via = clicked ? 'button' : typed ? typed.via : BP.beatTextNotThere(save, input) ? 'notThere' : BP.beatActionTable(save).actions.length ? 'miss' : 'none';
  if (trace.via === 'miss' || trace.via === 'notThere') trace.notice = BP.beatMissNotice(save);
  quiet(() => { if (action) { R.recordStoryEventStructuredAction(save, action); trace.event = action.eventId; trace.action = action.actionId; } });
  const before = structuredClone(save);
  save.系统.历史.叙事.push({ type: 'gm', content: '风从草原尽头吹来。' });
  save = quiet(() => R.advanceScenarioRuntime(save).saveData);
  trace.deadline = BP.deadlineResolvedThisTurn(before, save);
  trace.idleNotice = BP.noteStageDepartureIdleTurn(save) || BP.noteBeatActionIdleTurn(save);
  trace.quest = Q.noteQuestIdleTurn(save);
  trace.arrived = Q.questArrivedDeparture(before, save, MODS);
  return { save, trace };
}
const clickInput = save => {
  const offer = R.getStageDepartureOffer(save);
  if (offer) return { input: offer.label };
  const focus = R.getScenarioFocusEvent(rt(save));
  const actions = R.getCurrentStoryEventActions(save).filter(a => a.eventId === focus?.id);
  const ids = new Set((focus?.playerCompletionContract?.actions || []).map(a => a.id));
  const a = actions.find(x => ids.has(x.actionId)) || actions.find(x => x.actionId.startsWith('travel:'));
  return { input: a?.playerLine || '我看看四周', clicked: a };
};
// 走到第 n 拍（每拍点本拍动作／前往）。
// 正式档（不在试玩范围）：路由不发 intent，只在关键拍发小请求（设计稿 D9）。scopedLanding：带星月湖落地试玩标记＝试玩范围内、非清羽 Demo，intent 与小请求并行。
const LANDING = cp.CONTENT_PACKS.playtests.find(p => !p.openingTextId);
const scopedLanding = s => { s.系统.扩展 = { ...(s.系统.扩展 || {}), [LANDING.extensionKey]: { kind: LANDING.kind } }; return s; };
const saveAt = n => { let s = newSave(); for (let i = 0; i < n; i++) { const c = clickInput(s); s = turn(s, c.input, c.clicked).save; } return s; };
const NONE = JSON.stringify({ actionId: 'none', certainty: 'high', evidence: '', statusProposals: [], tickets: [] });
const route = (save, text, beatReply) => {
  const calls = { intent: 0, beat: 0, prompts: [] };
  const out = NI.resolveNaturalIntent({
    saveData: save, playerText: text, selected: null, resolveFromText: NI.resolveStoryEventActionFromText,
    generate: async () => { calls.intent++; return NONE; },
    generateBeat: async req => { calls.beat++; calls.prompts.push(req); return typeof beatReply === 'function' ? beatReply(req) : { raw: JSON.stringify(beatReply), inputTokens: 210, outputTokens: 30 }; },
  });
  return out.then(result => ({ result, calls }));
};
const S01_03 = 2, S01_05_AWAY = 5, AFTER_S01 = 7;

test('假设 1：任务模式下本拍原始标签手打＝exact，路由不发小请求', () => withQuest(true, async () => {
  const s = saveAt(S01_03);
  assert.equal(R.getScenarioFocusEvent(rt(s)).id, 'lcq.event.s01_03');
  assert.equal(BP.resolveBeatText(s, '战场上有名受伤军士，先判断该不该伸手相助')?.via, 'exact');
  const { result, calls } = await route(s, '战场上有名受伤军士，先判断该不该伸手相助', () => { throw new Error('must not call'); });
  assert.equal(result.kind, 'alias');
  assert.equal(result.selection.actionId, 'advance_declared_objective');
  assert.equal(calls.beat, 0);
}));

test('自然说法：小请求判 high、证据出自原话 → 按本拍动作结算（via intent），票不收', () => withQuest(true, async () => {
  const s = saveAt(S01_03);
  const text = '我蹲下查看那个受伤军士的伤势。';
  assert.equal(BP.resolveBeatText(s, text), undefined);
  const plan = BP.beatKeyTurn(s, text);
  assert.equal(plan?.key, 'scene');
  resetLogState(); logStore?.clear?.();
  const { result, calls } = await route(s, text, { id: 'advance_declared_objective', c: 'high', ev: '查看那个受伤军士的伤势', neg: false });
  assert.equal(calls.beat, 1);
  assert.equal(calls.intent, 0, '正式档不发 intent 大请求，只发小请求');
  assert.equal(result.kind, 'matched');
  assert.equal(result.reason, 'beat_intent');
  assert.equal(result.selection.eventId, 'lcq.event.s01_03');
  assert.equal(result.selection.actionId, 'advance_declared_objective');
  assert.deepEqual(result.beatIntent, { certainty: 'high', evidenceLength: 11 });
  assert.equal(result.freeActionTickets, undefined);
  const req = calls.prompts[0];
  assert.equal(req.maxTokens, QC.intentSettle.beatJudge.maxTokensWithReasoning);
  const payload = JSON.parse(req.userPrompt);
  assert.equal(payload.playerText, text);
  assert.deepEqual(payload.actions.map(a => a.id), ['advance_declared_objective']);
  assert.equal(payload.actions[0].label, '战场上有名受伤军士，先判断该不该伸手相助');
  assert.ok(payload.people.includes('月霜'));
  assert.equal(payload.place, '草原');
}));

test('小请求判 low／neg／证据不在原话 → 不结算，照大请求结果', () => withQuest(true, async () => {
  for (const reply of [
    { id: 'advance_declared_objective', c: 'low', ev: '查看那个受伤军士的伤势', neg: false },
    { id: 'advance_declared_objective', c: 'high', ev: '查看那个受伤军士的伤势', neg: true },
    { id: 'advance_declared_objective', c: 'high', ev: '救下军士', neg: false },
  ]) {
    const { result, calls } = await route(saveAt(S01_03), '我蹲下查看那个受伤军士的伤势。', reply);
    assert.equal(calls.beat, 1);
    assert.notEqual(result.kind, 'matched', JSON.stringify(reply));
  }
}));

test('rejectIf 优先于模型：命中本拍 rejectIf 时不发请求、也不结算；回来后再判一次', () => withQuest(true, async () => {
  const s = saveAt(S01_03);
  const authored = rt(s).events.find(e => e.id === 'lcq.event.s01_03').playerCompletionContract.actions.find(a => a.id === 'advance_declared_objective');
  authored.intentMatch = { ...(authored.intentMatch || {}), rejectIf: ['不管伤者'] };
  const { result, calls } = await route(s, '我不管伤者，上前查看四周。', { id: 'advance_declared_objective', c: 'high', ev: '上前查看四周', neg: false });
  assert.equal(calls.beat, 0);
  assert.notEqual(result.kind, 'matched');
  // 回来后再判：发出时没命中；模型回来前本拍 rejectIf 变了（现读存档）且原话命中 → 不结算，模型说 high 也不算。
  const s2 = saveAt(S01_03);
  const authored2 = rt(s2).events.find(e => e.id === 'lcq.event.s01_03').playerCompletionContract.actions.find(a => a.id === 'advance_declared_objective');
  const late = await route(s2, '我蹲下查看那个受伤军士的伤势。', () => {
    authored2.intentMatch = { ...(authored2.intentMatch || {}), rejectIf: ['伤势'] };
    return { raw: JSON.stringify({ id: 'advance_declared_objective', c: 'high', ev: '查看那个受伤军士的伤势', neg: false }) };
  });
  assert.equal(late.calls.beat, 1);
  assert.notEqual(late.result.kind, 'matched');
}));

test('非关键拍（本关已无焦点拍）不发小请求', () => withQuest(true, async () => {
  const s = saveAt(AFTER_S01);
  assert.equal(BP.beatKeyTurn(s, '我上前查看那位伤者。'), undefined);
  const { calls } = await route(s, '我上前查看那位伤者。', () => { throw new Error('must not call'); });
  assert.equal(calls.beat, 0);
}));

test('只剩「前往」的回合（人不在本拍地点）不发小请求，原话含人名也不升 K', () => withQuest(true, async () => {
  const s = saveAt(S01_05_AWAY);
  assert.ok(R.getCurrentStoryEventActions(s).every(a => a.actionId.startsWith('travel:')));
  assert.equal(BP.beatKeyTurn(s, '我去见王哲，把来历说清楚。'), undefined);
  const { calls } = await route(s, '我把来历跟王哲说清楚。', () => { throw new Error('must not call'); });
  assert.equal(calls.beat, 0);
}));

test('任务引导关：与原来一致，不发小请求', () => withQuest(false, async () => {
  const s = saveAt(S01_03);
  assert.equal(BP.beatKeyTurn(s, '我上前查看那位伤者。'), undefined);
  const { calls } = await route(s, '我上前查看那位伤者。', () => { throw new Error('must not call'); });
  assert.equal(calls.beat, 0);
}));

test('小请求超时／坏 JSON：停下保留输入（hold），不结算', () => withQuest(true, async () => {
  const { result } = await route(saveAt(S01_03), '我蹲下查看那个受伤军士的伤势。', () => ({ raw: 'not json' }));
  assert.equal(result.kind, 'failed');
  assert.equal(result.hold, true);
}));

test('没听清提示：任务模式指任务日志、不叫点按钮；关时原文', () => {
  const s = saveAt(S01_03);
  withQuest(true, () => assert.equal(NI.naturalIntentClarify(s), QC.intentSettle.clarifyNotice));
  withQuest(false, () => assert.equal(NI.naturalIntentClarify(s), NI.NATURAL_INTENT_CLARIFY_DEFAULT));
  assert.doesNotMatch(QC.intentSettle.clarifyNotice, /按钮/);
});

test('试玩范围内：小请求与 intent 并行，焦点拍动作不进大请求候选；小请求过了就结算', () => withQuest(true, async () => {
  const s = scopedLanding(saveAt(S01_03));
  assert.equal(Q.questGuideEnabled(s), true);
  const prompts = [];
  const out = await NI.resolveNaturalIntent({
    saveData: s, playerText: '我蹲下查看那个受伤军士的伤势。', selected: null, resolveFromText: NI.resolveStoryEventActionFromText,
    generate: async req => { prompts.push(req); return JSON.stringify({ actionId: 'none', certainty: 'high', evidence: '', statusProposals: [], tickets: [] }); },
    generateBeat: async () => JSON.stringify({ id: 'advance_declared_objective', c: 'high', ev: '查看那个受伤军士的伤势', neg: false }),
  });
  assert.equal(prompts.length, 1);
  const candidates = JSON.parse(prompts[0].userPrompt).candidates;
  assert.ok(!candidates.some(c => c.source === 'event_engine' && c.eventId === 'lcq.event.s01_03'));
  assert.equal(out.kind, 'matched');
  assert.equal(out.selection.actionId, 'advance_declared_objective');
}));

// REPORT-8091-a4a451cf P0：s02_04 小请求判 high 却不落账。根因：这拍的合同动作要等五原开放世界「拖延观察／抢出口」先落回执（runtime open_world_prerequisites），
// 小请求原先只给合同动作 advance_declared_objective → 结算被拒、attemptCount 不动。现在候选换成店里两个地方应对，按开放世界结算并连带完成 s02_04。
test('端到端 s02_04：小请求判 high → 地方应对结算 → 本拍完成（attemptCount 1、completedEventIds 含 s02_04）', () => withQuest(true, async () => {
  const { freshPrologueCheckpoint } = await import('../scripts/generate-prologue-checkpoint.mjs');
  const W = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
  const { save } = await quiet(() => freshPrologueCheckpoint());
  for (const p of cp.CONTENT_PACKS.playtests) if (p.openingTextId) delete save.系统.扩展[p.extensionKey];
  assert.equal(R.getScenarioFocusEvent(rt(save)).id, 'lcq.event.s02_04');
  const text = '我在点心铺里要了一笼包子，边慢慢吃边留意门外的动静';
  // 旧行为的根因：合同动作此刻被拒收。
  const contract = R.getCurrentStoryEventActions(save).find(a => a.eventId === 'lcq.event.s02_04');
  assert.equal(quiet(() => R.recordStoryEventStructuredAction(structuredClone(save), contract)).reason, 'open_world_prerequisites');
  const plan = BP.beatKeyTurn(save, text);
  assert.deepEqual(plan.actions.map(a => a.id), ['lcq.action.wuyuan.delay_and_observe', 'lcq.action.wuyuan.break_for_exit']);
  const { result, calls } = await route(save, text, { id: 'lcq.action.wuyuan.delay_and_observe', c: 'high', ev: '留意门外的动静', neg: false });
  assert.equal(calls.beat, 1);
  assert.equal(result.kind, 'matched');
  assert.equal(result.reason, 'beat_intent');
  assert.equal(result.selection.source, 'open_world_engine');
  assert.ok(NI.verifyFreshSelection(save, { actionId: result.selection.identityId, source: 'open_world_engine', contractHash: result.selection.receiptId }));
  const settled = quiet(() => W.settleWuyuanOpenWorldSelection(save, result.selection));
  assert.equal(settled.settled, true);
  assert.equal(settled.canonEventCompleted, true);
  assert.equal(rt(save).eventActionStates['lcq.event.s02_04'].attemptCount, 1);
  // 回合收尾推进运行时：本拍落定、焦点移到 s02_05（同真机点「用话头拖住他们」）。
  save.系统.历史.叙事.push({ type: 'gm', content: '门外脚步声近了。' });
  const after = quiet(() => R.advanceScenarioRuntime(save).saveData);
  assert.ok(rt(after).completedEventIds.includes('lcq.event.s02_04'));
  assert.equal(R.getScenarioFocusEvent(rt(after)).id, 'lcq.event.s02_05');
}));

test('s02_04 人还不在点心铺（只剩前往）：不发小请求', () => withQuest(true, async () => {
  const { freshPrologueCheckpoint } = await import('../scripts/generate-prologue-checkpoint.mjs');
  const { save } = await quiet(() => freshPrologueCheckpoint());
  for (const p of cp.CONTENT_PACKS.playtests) if (p.openingTextId) delete save.系统.扩展[p.extensionKey];
  rt(save).openWorldSlice.currentZoneId = 'lcq.zone.wuyuan.market';
  assert.equal(BP.beatKeyTurn(save, '我在点心铺里要了一笼包子，边慢慢吃边留意门外的动静'), undefined);
}));

// REPORT-8091-a4a451cf P2：小请求实发 max_tokens 16384（推理模型最低预算覆盖了配置）。现按配置原值发、不翻倍重试；M3.1-Flash 推理档发配置的 low（该模型不支持 none）。
test('小请求预算：beat_judge 按配置 maxTokensWithReasoning 发、带 reasoning_effort=low、思考耗尽不重试', async () => {
  const { default: axios } = await import('axios');
  const { aiService } = await loadTs('../src/services/aiService.ts');
  const judge = QC.intentSettle.beatJudge;
  const original = axios.post; const bodies = [];
  axios.post = async (_url, body) => { bodies.push(body); return { data: { choices: [{ message: { content: '{"id":"none","c":"low","ev":"","neg":false}' }, finish_reason: 'stop' }] } }; };
  try {
    const raw = await aiService.generate({
      user_input: 'fixture', should_stream: false, usageType: 'beat_judge', background: true, requestMaxRetries: 0,
      apiConfigOverride: { provider: 'custom', url: 'https://api.minimaxi.com/v1', apiKey: '', model: 'MiniMax-M3.1-Flash' },
      maxTokens: judge.maxTokensWithReasoning, backendReasoningEffort: judge.reasoningEffort,
    });
    assert.match(raw, /"id":"none"/);
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0].max_tokens, judge.maxTokensWithReasoning);
    assert.equal(bodies[0].reasoning_effort, 'low');
  } finally { axios.post = original; }
  axios.post = async (_url, body) => { bodies.push(body); return { data: { choices: [{ message: { content: '', reasoning: 'thought' }, finish_reason: 'length' } ] } }; };
  bodies.length = 0;
  try {
    await assert.rejects(aiService.generate({
      user_input: 'fixture', should_stream: false, usageType: 'beat_judge', background: true, requestMaxRetries: 0,
      apiConfigOverride: { provider: 'custom', url: 'https://api.minimaxi.com/v1', apiKey: '', model: 'MiniMax-M3.1-Flash' },
      maxTokens: judge.maxTokensWithReasoning, backendReasoningEffort: judge.reasoningEffort,
    }));
    assert.deepEqual(bodies.map(b => b.max_tokens), [judge.maxTokensWithReasoning]);
  } finally { axios.post = original; }
});
