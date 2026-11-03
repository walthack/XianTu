// 双模型第3步（设计稿 2026-11-03-双模型分工 ①③④⑥「合规写法」，用户 22:26 定稿）：后端 consistency 模块的调度、校验与落账，不接线。
// 钉住：输入白名单（不读正文/本地副本/短期记忆/玩家输入、私密不进）、不导入 freeAction/、校验拒非在场 id 与超长、
// 迟到下回合落账、切档作废、422 降级、关闭或未确认付费不发请求、落后超 maxLagTurns 丢旧任务。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
const memory = new Map();
globalThis.localStorage = { getItem: k => memory.has(k) ? memory.get(k) : null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) };
globalThis.window ||= globalThis;
globalThis.window.location ||= { hostname: 'localhost', href: 'http://localhost/' };
const jiti = createJiti(import.meta.url, { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } });
const cb = await jiti.import('../src/services/consistencyBackground.ts');
const { DUAL_MODEL_CONFIG } = await jiti.import('../src/services/dualModelConfig.ts');
const { PROMPT_LAYERS } = await jiti.import('../src/modules/scenarioMods/promptLayers.ts');
// 去注释后的代码（文件头说明里会写「不读正文、短期记忆」等字样）。
const SOURCE = readFileSync(new URL('../src/services/consistencyBackground.ts', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const BACKEND = DUAL_MODEL_CONFIG.dualModel.backend;
const KEY = BACKEND.extensionKey;
const JIA = 't.character.jia';
const YI = 't.character.yi';

/** 正文、玩家输入都用读即抛的 getter 钉住：组装函数一旦碰到就失败。 */
function gm(i, summary, extra = {}) {
  const entry = { type: 'gm', role: 'assistant', summary, detailId: `nd_${i}_x`, ...extra };
  for (const field of ['content', 'userIntent']) Object.defineProperty(entry, field, { enumerable: true, get() { throw new Error(`读了 ${field}`); } });
  return entry;
}
function user() {
  const entry = { type: 'user', role: 'user' };
  Object.defineProperty(entry, 'content', { enumerable: true, get() { throw new Error('读了玩家原始输入'); } });
  return entry;
}
function makeSave() {
  return {
    元数据: { 时间: { 年: 1004, 月: 6, 日: 1 } },
    角色: { 位置: { 描述: '某城·客栈' } },
    社交: {
      关系: {
        甲: { 角色ID: JIA, 名字: '甲', 与玩家关系: '朋友', 好感度: 30, 当前位置: { 描述: '某城·客栈' }, 出生日期: { 年: 980, 月: 1, 日: 1 },
          记忆: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'], 私密信息: { 性取向: 'SECRET_PRIVACY' } },
        乙: { 角色ID: YI, 名字: '乙', 与玩家关系: '路人', 好感度: 5, 当前位置: { 描述: '远山·洞府' }, 记忆: [] },
      },
      记忆: { 短期记忆: ['SHORT_TERM_RAW'], 隐式中期记忆: ['IMPLICIT_RAW'] },
    },
    世界: { 状态: { 剧本模组: {
      modId: 'test.mod', chapters: [], events: [], opening: { featuredCharacterIds: [JIA] },
      canon: { characters: [
        { id: JIA, name: '甲', description: '客栈掌柜', profile: { personality: ['爽快'], memories: ['CANON_MEMORY'] }, principles: ['GATED_PRINCIPLE'] },
        { id: YI, name: '乙', description: '散修' },
      ] },
    } } },
    系统: { 历史: { 叙事: [user(), gm(1, '概要一'), user(), gm(3, '概要二')] }, 扩展: {} },
  };
}
function appendTurn(save, summary) {
  const list = save.系统.历史.叙事;
  list.push(user(), gm(list.length + 1, summary));
}
function makeHost(save, handler) {
  const state = { busy: false, enabled: true, paid: false, scope: { characterId: 'c1', slotId: 's1' }, calls: [], persists: 0 };
  const host = {
    scope: () => state.scope, snapshot: () => save,
    relations: () => save.社交.关系, history: () => save.系统.历史.叙事, extensions: () => save.系统.扩展,
    isBusy: () => state.busy, persist: async () => { state.persists += 1; },
    enabled: () => state.enabled, paidConfirmNeeded: () => state.paid,
    run: async input => { state.calls.push(input); return { raw: await handler(input, state.calls.length) }; },
  };
  return { host, state };
}
const ok = (turnId, extra = {}) => JSON.stringify({ turnId, npcMemory: [{ id: JIA, entry: '甲答应帮忙打听消息。' }], relationNotes: [],
  continuity: [{ kind: 'fact', about: JIA, note: '甲已答应打听消息。' }], summaryCheck: { ok: true, issue: '' }, ...extra });
const settle = async () => { for (let i = 0; i < 30; i += 1) await new Promise(resolve => setImmediate(resolve)); await cb.consistencyBackgroundState().settled(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const moderationError = () => Object.assign(new Error('input new_sensitive (1026)'), { status: 422 });
const latestId = save => cb.latestConsistencyTurn(save).turnId;

test('白名单：只读概要、在场账（记忆限条）、基础层、时间线、本回合变化；不读正文/玩家输入/短期记忆，私密与 gated 不进', () => {
  const save = makeSave();
  const turn = cb.latestConsistencyTurn(save);
  assert.equal(turn.summary, '概要二');
  const input = cb.buildConsistencyInput(save, turn, { stateChanges: { changes: [
    { key: '社交.关系.["t.character.jia"].好感度', oldValue: 26, newValue: 30 },
    { key: '社交.关系.["t.character.yi"].好感度', oldValue: 1, newValue: 5 },
    { key: '角色.位置', newValue: { 描述: '某城·客栈' } },
  ] } });
  assert.deepEqual(Object.keys(input).sort(), ['canonBase', 'ledger', 'stateDelta', 'summaries', 'timeline', 'turnId', '游戏时间'].sort());
  assert.deepEqual(input.summaries.map(item => item.summary), ['概要一', '概要二']);
  assert.equal(input.ledger.length, 1, '只带本回合在场者');
  assert.equal(input.ledger[0].角色ID, JIA);
  assert.deepEqual(input.ledger[0].记忆, ['m3', 'm4', 'm5', 'm6', 'm7'].slice(-BACKEND.ledgerMemoryPerNpc));
  assert.deepEqual(input.canonBase, [{ id: JIA, 名字: '甲', 身份: '客栈掌柜', 性格: ['爽快'] }]);
  assert.deepEqual(input.timeline, { 开局已过年数: BACKEND.timeline.yearsElapsedAtOpening, 当前年: 1004, 年龄: { [JIA]: 24 } });
  assert.deepEqual(input.stateDelta, { 好感: [{ id: JIA, 变化: 4 }], 位置: '某城·客栈' }, '不在场者的好感变化不进');
  const text = JSON.stringify(input);
  for (const leaked of ['SECRET_PRIVACY', '私密信息', 'GATED_PRINCIPLE', 'CANON_MEMORY', 'SHORT_TERM_RAW', 'IMPLICIT_RAW', '乙', YI]) assert.ok(!text.includes(leaked), leaked);
  assert.ok(text.length <= BACKEND.maxInputChars);
});

test('白名单（静态）：源码不碰正文字段、本地全文副本、短期记忆与玩家意图；不导入任何 freeAction/ 路径', () => {
  assert.doesNotMatch(SOURCE, /\.content\b|\[['"]content['"]\]/, '不读 历史.叙事 的正文字段');
  assert.doesNotMatch(SOURCE, /narrativeDetailStore|loadDetailsFor|短期记忆|隐式中期记忆|userIntent|playerIntent|user_input/);
  assert.doesNotMatch(SOURCE, /from\s+['"][^'"]*freeAction\//);
  assert.doesNotMatch(SOURCE, /import\(\s*['"][^'"]*freeAction\//);
  assert.doesNotMatch(SOURCE, /mustSurvive/);
});

test('白名单：moderated 概要换占位；降级输入去掉概要与 NPC 记忆；超 maxInputChars 先丢最旧概要', () => {
  const save = makeSave();
  save.系统.历史.叙事[1].summaryFlag = cb.MODERATED_FLAG;
  const turn = cb.latestConsistencyTurn(save);
  assert.deepEqual(cb.buildConsistencyInput(save, turn).summaries.map(item => item.summary), [DUAL_MODEL_CONFIG.memory.moderatedPlaceholder, '概要二']);
  const degraded = cb.buildConsistencyInput(save, turn, {}, true);
  assert.deepEqual(degraded.summaries, []);
  assert.equal(degraded.ledger[0].记忆, undefined);
  assert.equal(degraded.ledger[0].好感度, 30, '账的数值部分保留');
  const big = makeSave();
  big.系统.历史.叙事[1] = gm(1, '长'.repeat(BACKEND.maxInputChars));
  const trimmed = cb.buildConsistencyInput(big, cb.latestConsistencyTurn(big));
  assert.deepEqual(trimmed.summaries.map(item => item.summary), ['概要二']);
});

test('校验：拒非在场/未登记 id 与超长条目，continuity 封顶且只认合法 kind，turnId 不符整体拒', () => {
  const save = makeSave();
  const turn = cb.latestConsistencyTurn(save);
  const max = PROMPT_LAYERS.memory.npcEntryMaxChars;
  const raw = JSON.stringify({
    turnId: turn.turnId,
    npcMemory: [
      { id: JIA, entry: '甲收下了玉佩。' },
      { id: YI, entry: '乙不在场。' },
      { id: 'nobody', entry: '未登记。' },
      { id: JIA, entry: '长'.repeat(max + 1) },
      { id: JIA, entry: '刚'.repeat(max) },
    ],
    relationNotes: [{ id: YI, 关系: '路人→朋友' }, { id: JIA, 关系: '朋友→挚友' }],
    continuity: [1, 2, 3, 4, 5].map(i => ({ kind: 'fact', about: JIA, note: `第${i}条` })).concat([{ kind: 'bogus', note: 'x' }]),
  });
  const out = cb.validateConsistencyOutput(raw, turn, save);
  assert.deepEqual(out.npcMemory.map(item => item.entry), ['甲收下了玉佩。', '刚'.repeat(max)]);
  assert.deepEqual(out.rejected.map(item => `${item.id}:${item.reason}`), [`${YI}:not_present`, 'nobody:not_present', `${JIA}:too_long`, `${YI}:not_present`]);
  assert.deepEqual(out.relationNotes, [{ id: JIA, 关系: '朋友→挚友' }]);
  assert.equal(out.continuity.length, BACKEND.continuityMaxItems);
  assert.deepEqual(out.summaryCheck, { ok: true, issue: '' });
  assert.throws(() => cb.validateConsistencyOutput(JSON.stringify({ turnId: 'other' }), turn, save), /turnId/);
  assert.throws(() => cb.validateConsistencyOutput('不是 JSON', turn, save));
});

test('迟到：结果回来时前台忙只排队，下一回合提交后先落账（追加记忆、封顶、存提示、存盘），好感不动', async () => {
  cb.cancelConsistencyBackground();
  const save = makeSave();
  const first = latestId(save);
  const gate = deferred();
  const { host, state } = makeHost(save, (input, n) => (n === 1 ? gate.promise : ok(JSON.parse(input.input).turnId)));
  cb.startConsistencyBackground(host);
  assert.equal(state.calls.length, 1);
  state.busy = true; // 玩家已开始下一回合
  gate.resolve(ok(first));
  await settle();
  assert.deepEqual(cb.consistencyBackgroundState().pending, [first]);
  assert.equal(save.社交.关系.甲.记忆.length, 7, '前台忙时不写');
  assert.equal(state.persists, 0);
  appendTurn(save, '概要三');
  state.busy = false;
  cb.startConsistencyBackground(host);
  await settle();
  assert.equal(save.社交.关系.甲.记忆.at(-1), '甲答应帮忙打听消息。');
  assert.ok(save.社交.关系.甲.记忆.length <= BACKEND.npcMemoryKeep);
  assert.equal(save.社交.关系.甲.好感度, 30);
  assert.equal(save.系统.扩展[KEY].turnId, latestId(save), '新回合结果覆盖旧提示');
  assert.ok(state.persists >= 1);
  assert.equal(state.calls.length, 2, '前台在途不取消后端，也不重复发同一回合');
});

test('落账核对：回执被回滚（概要改写）或换角色/槽位时不写', async () => {
  cb.cancelConsistencyBackground();
  const save = makeSave();
  const gate = deferred();
  const { host, state } = makeHost(save, () => gate.promise);
  cb.startConsistencyBackground(host);
  save.系统.历史.叙事[3] = gm(3, '回滚后重写的概要');
  gate.resolve(ok(`3:nd_3_x`));
  await settle();
  assert.equal(save.社交.关系.甲.记忆.length, 7);
  assert.equal(save.系统.扩展[KEY], undefined);
  assert.equal(state.persists, 0);
});

test('切档作废：在途结果回来也不写，并清掉已存连续性提示', async () => {
  cb.cancelConsistencyBackground();
  const save = makeSave();
  save.系统.扩展[KEY] = { turnId: 'old', turnIndex: 0, continuity: [{ kind: 'fact', about: 'x', note: '过期' }] };
  const gate = deferred();
  const { host, state } = makeHost(save, () => gate.promise);
  cb.startConsistencyBackground(host);
  cb.cancelConsistencyBackground(host);
  assert.equal(save.系统.扩展[KEY], undefined);
  gate.resolve(ok(latestId(save)));
  await settle();
  assert.equal(save.社交.关系.甲.记忆.length, 7);
  assert.equal(state.persists, 0);
  // 只换槽位不调 cancel：epoch 不变，靠 scope 核对拦住。
  const gate2 = deferred();
  const second = makeHost(makeSave(), () => gate2.promise);
  cb.startConsistencyBackground(second.host);
  second.state.scope = { characterId: 'c1', slotId: 's2' };
  gate2.resolve(ok(latestId(makeSave())));
  await settle();
  assert.equal(second.host.relations().甲.记忆.length, 7);
});

test('422/1026：标记该回合概要 moderated，去掉概要与 NPC 记忆重发；降级成功照常落账', async () => {
  cb.cancelConsistencyBackground();
  const save = makeSave();
  const id = latestId(save);
  const { host, state } = makeHost(save, (input, n) => { if (n === 1) throw moderationError(); return ok(id); });
  cb.startConsistencyBackground(host);
  await settle();
  assert.equal(state.calls.length, 2);
  const retry = JSON.parse(state.calls[1].input);
  assert.deepEqual(retry.summaries, []);
  assert.equal(retry.ledger[0].记忆, undefined);
  assert.equal(save.系统.历史.叙事[3].summaryFlag, cb.MODERATED_FLAG);
  assert.equal(save.社交.关系.甲.记忆.at(-1), '甲答应帮忙打听消息。');
});

test('422/1026：降级重发 degradedAttempts 次仍被拒则丢弃结果，只留 moderated 标记，不写记忆与提示', async () => {
  cb.cancelConsistencyBackground();
  const save = makeSave();
  const { host, state } = makeHost(save, () => { throw moderationError(); });
  cb.startConsistencyBackground(host);
  await settle();
  assert.equal(state.calls.length, 1 + BACKEND.degradedAttempts);
  assert.equal(save.系统.历史.叙事[3].summaryFlag, cb.MODERATED_FLAG);
  assert.equal(save.社交.关系.甲.记忆.length, 7);
  assert.equal(save.系统.扩展[KEY], undefined);
  // 下一次组装：被标的概要用占位。
  appendTurn(save, '概要三');
  const next = cb.buildConsistencyInput(save, cb.latestConsistencyTurn(save));
  assert.ok(next.summaries.some(item => item.summary === DUAL_MODEL_CONFIG.memory.moderatedPlaceholder));
});

test('其他错误/超时：丢弃，不重发、不标记', async () => {
  cb.cancelConsistencyBackground();
  const save = makeSave();
  const { host, state } = makeHost(save, () => { throw Object.assign(new Error('timeout'), { status: 504 }); });
  cb.startConsistencyBackground(host);
  await settle();
  assert.equal(state.calls.length, 1);
  assert.equal(save.系统.历史.叙事[3].summaryFlag, undefined);
  assert.equal(save.社交.关系.甲.记忆.length, 7);
});

test('关闭：开关关不发请求，并作废、清掉已存连续性提示；付费确认未过也不发', async () => {
  cb.cancelConsistencyBackground();
  const save = makeSave();
  save.系统.扩展[KEY] = { turnId: 'old', turnIndex: 0, continuity: [{ kind: 'fact', about: 'x', note: '过期' }] };
  const { host, state } = makeHost(save, () => ok(latestId(save)));
  state.enabled = false;
  cb.startConsistencyBackground(host);
  await settle();
  assert.equal(state.calls.length, 0);
  assert.equal(save.系统.扩展[KEY], undefined);
  state.enabled = true; state.paid = true;
  cb.startConsistencyBackground(host);
  await settle();
  assert.equal(state.calls.length, 0, 'needsPaidConfirm 为真且未确认');
  state.paid = false;
  cb.startConsistencyBackground(host);
  await settle();
  assert.equal(state.calls.length, 1);
});

test('默认开关：dualModel.enabled=false 时不经注入也不发请求', async () => {
  cb.cancelConsistencyBackground();
  assert.equal(DUAL_MODEL_CONFIG.dualModel.enabled, false);
  const save = makeSave();
  const { host, state } = makeHost(save, () => ok(latestId(save)));
  delete host.enabled;
  const { createPinia, setActivePinia } = await import('pinia');
  setActivePinia(createPinia());
  cb.startConsistencyBackground(host);
  await settle();
  assert.equal(state.calls.length, 0);
});

test('积压：在途不取消；等待任务落后超 maxLagTurns 回合的丢弃，只跑较新的', async () => {
  cb.cancelConsistencyBackground();
  const save = makeSave();
  const gate = deferred();
  const { host, state } = makeHost(save, (input, n) => (n === 1 ? gate.promise : ok(JSON.parse(input.input).turnId)));
  cb.startConsistencyBackground(host);
  const ids = [];
  for (let i = 0; i < BACKEND.maxLagTurns + 2; i += 1) { appendTurn(save, `后续${i}`); ids.push(latestId(save)); cb.startConsistencyBackground(host); }
  assert.equal(state.calls.length, 1, '在途时只排队');
  gate.resolve(ok(JSON.parse(state.calls[0].input).turnId));
  await settle();
  const sent = state.calls.slice(1).map(call => JSON.parse(call.input).turnId);
  assert.ok(!sent.includes(ids[0]), '最旧的等待任务已丢弃');
  assert.equal(sent.at(-1), ids.at(-1));
});
