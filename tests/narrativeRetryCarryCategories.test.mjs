// PR #75 补用例：主叙事格式重试带结算输入，逐类钉住「第一次失败 → 重试成功 → 照常结算且只结算一次」。
// 真实 AIBS 管线＋替身 aiService.generate；重试 options 照 MainGamePanel.retryAIResponse 拼（先 carryNarrativeRetryOptions，再本次请求字段）。
// 机会／五原地方／白湖拒赌三类只出现在 lcq.* 存档：retryAIResponse 对这类存档（usesFixedScenarioInventory）直接不发重试，
// AIBS 在它们的本地合同上也不请求模型或模型失败就本地落账——这里把这些「到不了重试」的前提钉成断言；判定结果在 lyl 存档可达，走全流程。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: {
    '@': fileURLToPath(new URL('../src', import.meta.url)),
    '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
  },
});
const load = p => jiti.import(new URL(p, import.meta.url).pathname);
if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  const values = new Map();
  globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k), clear: () => values.clear() };
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (!globalThis.window.location) globalThis.window.location = { hostname: 'localhost', href: 'http://localhost/', search: '' };
const quiet = async fn => { const keep = { log: console.log, info: console.info, warn: console.warn, error: console.error }; console.log = console.info = console.warn = console.error = () => {}; try { return await fn(); } finally { Object.assign(console, keep); } };

const PROFILE = { 模式: '单机', 角色: { 名字: '程宗扬', 性别: '男' }, 存档列表: {} };
const RETRY_SUFFIX = '\n\n## 输出格式（必须严格遵守）';
const clone = v => JSON.parse(JSON.stringify(v));

const { createMinimalSaveDataV3 } = await load('../src/utils/dataRepair.ts');
const init = await load('../src/modules/scenarioMods/strictInitializer.ts');
const runtime = await load('../src/modules/scenarioMods/runtime.ts');
const { carryNarrativeRetryOptions } = await load('../src/utils/narrativeRetryOptions.ts');
const { usesFixedScenarioInventory } = await load('../src/modules/scenarioMods/fixedInventoryContracts.ts');
const judgement = await load('../src/utils/judgementEngine.ts');
const lylData = JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lyl.lin_an_bridge.json', import.meta.url)));

async function http529() {
  const { AiHttpError } = await load('../src/services/aiRetryPolicy.ts');
  throw new AiHttpError('API错误 529: overloaded_error', { status: 529 });
}

/** 装好存档与替身 generate；generateImpl(n, args) 第 n 次调用。 */
async function pipeline(save, generateImpl) {
  setActivePinia(createPinia());
  globalThis.localStorage.setItem('narrative-state-reconcile', 'off');
  const { AIBidirectionalSystem } = await load('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await load('../src/stores/gameStateStore.ts');
  const { aiService } = await load('../src/services/aiService.ts');
  const { useAPIManagementStore } = await load('../src/stores/apiManagementStore.ts');
  const store = useGameStateStore(); store.loadFromSaveData(save);
  const api = useAPIManagementStore(); const configs = [...api.apiConfigs]; const assigns = api.apiAssignments.map(a => ({ ...a }));
  api.apiConfigs = [{ id: 'fixture', name: 'fixture', provider: 'custom', url: 'https://api.minimaxi.com/v1', apiKey: 'fixture-not-a-real-key', model: 'MiniMax-M3', enabled: true }];
  api.assignAPI('main', 'fixture');
  const keep = { check: aiService.checkAvailability, generate: aiService.generate, raw: aiService.generateRaw };
  const prompts = [];
  aiService.checkAvailability = () => ({ available: true, message: 'test-stub' });
  aiService.generate = async args => { prompts.push(JSON.stringify(args)); return generateImpl(prompts.length, args); };
  aiService.generateRaw = async () => { throw new Error('must not call generateRaw'); };
  const restore = () => { api.apiConfigs = configs; api.apiAssignments = assigns; Object.assign(aiService, { checkAvailability: keep.check, generate: keep.generate, generateRaw: keep.raw }); globalThis.localStorage.removeItem('narrative-state-reconcile'); };
  const run = (message, options) => quiet(() => AIBidirectionalSystem.processPlayerAction(message, PROFILE, options));
  const firstOptions = (text, extra) => ({ onProgressUpdate: () => {}, playerIntentText: text, cultivationSelections: [], freeTextStatusResolution: undefined,
    useStreaming: false, shouldAbort: () => false, generation_id: 'gen_first', qingyuTurnId: undefined, ...extra });
  const retryOptions = (turnOptions, text, attempt = 1) => ({ ...carryNarrativeRetryOptions(turnOptions), onProgressUpdate: () => {}, playerIntentText: text,
    useStreaming: false, shouldAbort: () => false, generation_id: `gen_retry_${attempt}` });
  return { store, run, firstOptions, retryOptions, restore, prompts };
}

/** 两份存档逐项比较，返回不同的路径。 */
function diffPaths(a, b, path = '', out = []) {
  if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffPaths(a[k], b[k], `${path}.${k}`, out); return out; }
  if (a !== b) out.push(path);
  return out;
}
// 只放过存档 ID、时间戳、随机排期的下次世界事件时间（同 narrativeRetryKeepsAction；下次事件时间由 legacy 路在请求模型前的
// maybeTriggerScheduledWorldEvent 排期，可能从无到有整块写入，所以连 `.社交.事件.下次事件时间` 本身也放过——与本手结算输入无关）。
const VOLATILE = /^\.元数据\.(存档ID|创建时间|更新时间)$|\.updatedAt$|\.timestamp$|^\.世界\.信息\.生成时间$|^\.社交\.事件\.下次事件时间(\.|$)/;

// ───────────────────────── 判定结果 judgementResolution（lyl 存档，格式重试可达） ─────────────────────────

const JUDGE_TEXT = '我翻滚躲开刀锋';
const HP_COMMAND = { action: 'set', key: '角色.属性.气血.当前', value: 1 };
// 模型照旧想改气血：本地判定回执在场时 processGmResponse 必须拒掉（判定的「结算」= 核心数值只认本地判定）。
const JUDGE_GOOD = JSON.stringify({ text: '短刃擦着你的肩头掠过，你翻身滚开。', mid_term_memory: '翻滚躲刀。', tavern_commands: [HP_COMMAND], action_options: [] });

/** lyl 存档：判定已在发送前签发并掷出（MainGamePanel 发送前 resolvePendingJudgement 写进存档）。 */
function judgedSave() {
  const s = runtime.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(lylData))).saveData;
  s.角色.属性.气血 = { 当前: 80, 上限: 100 };
  s.角色.属性.神识 = { 当前: 80, 上限: 100 };
  const proposal = judgement.createJudgementProposal({ actionText: JUDGE_TEXT, kind: 'combat', whyNow: '刀锋已至', difficulty: { band: 'hard', value: 20 },
    factors: [], stakes: { success: '躲开', partial: '擦伤', failure: '被砍中' }, canonPolicy: 'free', createdAtTurn: 3 });
  judgement.persistPendingJudgement(s, proposal);
  const resolution = judgement.resolvePendingJudgement(s, proposal.id, { currentTurn: 3, roll: () => 2 });
  assert.equal(resolution.status, 'resolved');
  return { s, resolution };
}

async function judgementTurn(firstImpl) {
  const { s, resolution } = judgedSave();
  assert.equal(usesFixedScenarioInventory(s), false, 'lyl 存档不是固定道具合同：retryAIResponse 会发格式重试');
  const t = await pipeline(s, firstImpl);
  const first = t.firstOptions(JUDGE_TEXT, { judgementResolution: structuredClone(resolution) });
  return { t, resolution, first, hpAfterLocal: s.角色.属性.气血.当前 };
}

test('判定结果：第一次 529 → 回执不被消耗、气血与判定账本不动；重试带回执 → 照常拒掉模型改气血，与第一次就成功逐项相同', async () => {
  const { validateProcessedAIResponse } = await load('../src/utils/processedAIResponseValidation.ts');
  // 对照：第一次就成功。
  const ctl = await judgementTurn(() => JUDGE_GOOD);
  let control;
  try {
    const r = await ctl.t.run(JUDGE_TEXT, ctl.first);
    assert.equal(r.transactionCommitted, true);
    control = structuredClone(ctl.t.store.toSaveData());
    assert.equal(control.角色.属性.气血.当前, ctl.hpAfterLocal, '对照：模型改气血被拒，气血＝本地判定结算后');
    assert.match(ctl.t.prompts[0], /本回合本地判定回执/);
  } finally { ctl.t.restore(); }

  const x = await judgementTurn(n => n === 1 ? http529() : JUDGE_GOOD);
  try {
    const before = structuredClone(x.t.store.toSaveData());
    const r1 = await x.t.run(JUDGE_TEXT, x.first);
    assert.equal(r1.transactionCommitted, undefined);
    assert.equal(r1.generationError, undefined, '非终止：MainGamePanel 会走格式重试');
    assert.equal(validateProcessedAIResponse(r1).isValid, false);
    const mid = x.t.store.toSaveData();
    assert.ok(judgement.verifyResolvedJudgementReceipt(mid, x.resolution), '第一次失败后回执仍核对得上（没被消耗）');
    assert.deepEqual(judgement.getJudgementState(mid), judgement.getJudgementState(before), '判定账本不动');
    assert.deepEqual(mid.角色.属性, before.角色.属性, '气血／神识不动');
    assert.deepEqual(diffPaths(mid, before).filter(p => !VOLATILE.test(p)), [], '第一次失败后整份存档除放过项外与发送前相同');

    const r2 = await x.t.run(`${JUDGE_TEXT}${RETRY_SUFFIX}`, x.t.retryOptions(x.first, JUDGE_TEXT));
    assert.equal(r2.transactionCommitted, true);
    assert.equal(validateProcessedAIResponse(r2).isValid, true);
    assert.match(x.t.prompts[1], /本回合本地判定回执/, '重试的提示词照样带判定回执');
    const after = x.t.store.toSaveData();
    assert.equal(after.角色.属性.气血.当前, x.hpAfterLocal, '只结算一次：气血＝本地判定结算后，模型改写被拒、判定效果没再叠一遍');
    // 两次各自签发判定：判定 ID（含时间戳＋计数，如 judge-3-j74fq2-<时间>-<序号>）不同，换成同一个再比；其余逐项相同。
    const sameId = save => JSON.parse(JSON.stringify(save).split(ctl.resolution.id).join(x.resolution.id));
    const ctlSave = sameId(control);
    assert.deepEqual(judgement.getJudgementState(after), judgement.getJudgementState(ctlSave));
    // 行动耗时回执按本次请求的 generation_id 记（timeActionId = generationId）：对照记在 gen_first、重试记在 gen_retry_1。
    // 两边都只有一条且内容相同＝时间只推了一次；比完把键对齐再逐项比。
    const receipts = save => Object.fromEntries(Object.entries(save.系统?.扩展?.actionTime?.receipts ?? {}).filter(([k]) => k.startsWith('gen_'))); // 开局作者时间线的回执不算
    assert.deepEqual(Object.keys(receipts(after)), ['gen_retry_1'], '只结算一次：行动耗时回执只有重试那一条');
    assert.deepEqual(Object.keys(receipts(ctlSave)), ['gen_first']);
    assert.deepEqual({ ...receipts(after).gen_retry_1, id: 'gen' }, { ...receipts(ctlSave).gen_first, id: 'gen' }, '耗时回执除 id（＝本次 generation_id）外相同');
    const { gen_first: ctlReceipt, ...ctlRest } = ctlSave.系统.扩展.actionTime.receipts;
    ctlSave.系统.扩展.actionTime.receipts = { ...ctlRest, gen_retry_1: { ...ctlReceipt, id: 'gen_retry_1' } };
    const diffs = diffPaths(after, ctlSave).filter(p => !VOLATILE.test(p));
    assert.deepEqual(diffs, [], `与第一次就成功的对照不同：${diffs.join(', ')}`);
  } finally { x.t.restore(); }
});

test('判定结果：对照——重试不带回执（修前写法）时模型改气血会落账，说明上一条的「拒掉」确实来自带过去的回执', async () => {
  const x = await judgementTurn(n => n === 1 ? http529() : JUDGE_GOOD);
  try {
    await x.t.run(JUDGE_TEXT, x.first);
    const old = { onProgressUpdate: () => {}, playerIntentText: JUDGE_TEXT, useStreaming: false, shouldAbort: () => false, generation_id: 'gen_retry_1' };
    const r2 = await x.t.run(`${JUDGE_TEXT}${RETRY_SUFFIX}`, old);
    assert.equal(r2.transactionCommitted, true);
    assert.doesNotMatch(x.t.prompts[1], /本回合本地判定回执/);
    assert.equal(x.t.store.toSaveData().角色.属性.气血.当前, 1, '不带回执：模型 set 气血=1 落账');
  } finally { x.t.restore(); }
});

// ───────────────────────── 机会动作 / 五原地方动作（lcq.stage_02，固定道具合同存档） ─────────────────────────
// 夹具照 legacyJudgementReceiptBridge.test.mjs 的 stage02Fixture／locateEvent 写法。

const S02_01 = 'lcq.event.s02_01';
const S02_02 = 'lcq.event.s02_02';
const S02_03 = 'lcq.event.s02_03';
const S02_04 = 'lcq.event.s02_04';
const TAKE_MANDATE = 'opportunity.lcq.s02_01.take_full_mandate';

async function stage02Fixture() {
  const { parseScenarioMod } = await load('../src/modules/scenarioMods/validator.ts');
  const { createQingyuOpeningPlaytestSave } = await load('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const read = name => readFile(new URL(`../src/modules/scenarioMods/builtins/data/${name}.json`, import.meta.url), 'utf8').then(raw => parseScenarioMod(JSON.parse(raw)));
  const [stage01, stage02] = await Promise.all([read('lcq.stage_01'), read('lcq.stage_02')]);
  const stage01Save = createQingyuOpeningPlaytestSave(stage01);
  const source = clone(stage01Save);
  source.世界.状态.剧本模组.nextStageReadyId = 'lcq.stage_02';
  const transitioned = init.transitionToNextScenarioStage(source, [stage02]);
  assert.equal(transitioned.ok, true, transitioned.reason);
  const save = transitioned.saveData;
  if (save.系统?.扩展?.清羽记开局?.kind !== stage01Save.系统?.扩展?.清羽记开局?.kind) {
    save.系统 = save.系统 || {}; save.系统.扩展 = save.系统.扩展 || {};
    save.系统.扩展.清羽记开局 = clone(stage01Save.系统.扩展.清羽记开局);
  }
  assert.equal(save.世界.状态.剧本模组.modId, 'lcq.stage_02');
  return save;
}

function locateEvent(save, eventId, extra) {
  const rt = save.世界.状态.剧本模组;
  const chapter = rt.chapters.find(item => (item.eventIds || []).includes(eventId));
  rt.currentChapterId = chapter.id;
  rt.activeEventIds = [eventId];
  rt.completedEventIds = extra.completedEventIds;
  rt.flags = { ...(rt.flags || {}), ...extra.flags };
}

const countSilkPouches = save => Object.values(save?.角色?.背包?.物品 || {}).filter(item => item?.名称 === '锦囊').reduce((sum, item) => sum + (Number(item.数量) || 1), 0);

async function opportunitySave() {
  const s = await stage02Fixture();
  locateEvent(s, S02_01, { completedEventIds: [], flags: { 'event.s02_01.done': false, 'chapter.lcq.stage_02.started': true } });
  assert.equal(runtime.trackStoryOpportunity(s, TAKE_MANDATE).ok, true);
  const action = runtime.getTrackedStoryOpportunityActions(s)[0];
  assert.ok(action);
  return { s, action };
}

async function openWorldSave() {
  const wuyuan = await load('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
  const s = await stage02Fixture();
  locateEvent(s, S02_04, { completedEventIds: [S02_02, S02_03],
    flags: { 'event.s02_04.done': false, 'event.s02_03.done': true, 'event.s02_02.done': true, 'chapter.lcq.stage_02.started': true } });
  const action = wuyuan.getWuyuanOpenWorldSelections(s).find(item => {
    const p = wuyuan.settleWuyuanOpenWorldSelection(clone(s), item);
    return p?.settled === true && p?.idempotent !== true;
  });
  assert.ok(action, '五原须有一个首次可结算的地方动作');
  return { s, action, wuyuan };
}
const openWorldReceipts = save => { const o = save.世界.状态.剧本模组.openWorldSlice || {}; return (o.travelReceipts || []).length + (o.actionReceipts || []).length + (o.noticeReceipts || []).length; };

test('lcq 机会／五原夹具是固定道具合同存档——retryAIResponse 在请求前就 return null，不发格式重试', async () => {
  const { s: opp } = await opportunitySave();
  const { s: ow } = await openWorldSave();
  assert.equal(usesFixedScenarioInventory(opp), true);
  assert.equal(usesFixedScenarioInventory(ow), true);
  const src = await readFile(new URL('../src/components/dashboard/MainGamePanel.vue', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('const retryAIResponse = async ('), src.indexOf('// 存储原始流式内容'));
  const gate = fn.indexOf('usesFixedScenarioInventory(saveForRetryBudget)');
  assert.ok(gate > 0 && gate < fn.indexOf('return null;') && fn.indexOf('return null;') < fn.indexOf('carryNarrativeRetryOptions(turnOptions)'), '固定道具合同闸在带结算输入之前就返回');
});

for (const kind of ['opportunity', 'openWorld']) {
  test(`${kind === 'opportunity' ? '机会动作' : '五原地方动作'}：preview 只读（调用前后存档逐项相同）；processPlayerAction 走本地合同正文、一次都不请求模型，第一次就提交且只结算一次`, async () => {
    const { previewQingyuOpportunityNarrative } = await load('../src/modules/scenarioMods/qingyuOpportunityNarrative.ts');
    const fx = kind === 'opportunity' ? await opportunitySave() : await openWorldSave();
    const before = clone(fx.s);
    const text = kind === 'opportunity' ? previewQingyuOpportunityNarrative(fx.s, fx.action) : fx.wuyuan.previewWuyuanOpenWorldNarrative(fx.s, { openWorldAction: fx.action });
    assert.ok(text, 'preview 出了本地正文');
    // 比序列化后的存档：preview 会在内存对象上给势力条目补 `势力范围: undefined` 键（JSON 里不存在），存档内容不变。
    assert.deepEqual(clone(fx.s), before, 'preview 不改存档（序列化后逐项相同）');

    const t = await pipeline(fx.s, () => http529());
    try {
      const key = kind === 'opportunity' ? 'opportunityAction' : 'openWorldAction';
      const opts = t.firstOptions(fx.action.actionText, { [key]: structuredClone(fx.action) });
      const r = await t.run(fx.action.actionText, opts);
      assert.equal(t.prompts.length, 0, '不请求模型：没有 529／坏 JSON 的机会');
      assert.equal(r.transactionCommitted, true);
      const after = t.store.toSaveData();
      if (kind === 'opportunity') assert.equal(countSilkPouches(after), countSilkPouches(before) + 1, '锦囊发一个');
      else assert.equal(openWorldReceipts(after), openWorldReceipts(before) + 1, '五原回执记一条');
    } finally { t.restore(); }
  });
}

// ───────────────────────── 机会动作 opportunityAction（lyl 存档，格式重试可达） ─────────────────────────

const LYL_OPP_BEAT = 'lyl.event.lin_an_bridge_01_beat';
const LYL_OPP = 'opportunity.lyl.linan_01.hand_tip_to_yun';
const OPP_GOOD = JSON.stringify({ text: '你把瓦棚线报交到云家人手里，对方点头记下。', mid_term_memory: '线报交给云家核对。', tavern_commands: [], action_options: [] });

function lylOpportunitySave() {
  const s = runtime.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(lylData))).saveData;
  const rt = s.世界.状态.剧本模组;
  for (const event of rt.events) if (event.id !== LYL_OPP_BEAT && !rt.completedEventIds.includes(event.id)) {
    if (rt.events.indexOf(event) > rt.events.findIndex(e => e.id === LYL_OPP_BEAT)) continue;
    rt.completedEventIds.push(event.id); for (const c of event.completion || []) if (c.path.startsWith('flags.')) rt.flags[c.path.slice(6)] = c.value;
  }
  rt.activeEventIds = [LYL_OPP_BEAT]; rt.currentChapterId = rt.chapters.find(c => c.eventIds.includes(LYL_OPP_BEAT))?.id ?? rt.currentChapterId;
  const tracked = runtime.trackStoryOpportunity(s, LYL_OPP);
  assert.equal(tracked.ok, true, tracked.reason);
  const action = runtime.getTrackedStoryOpportunityActions(s)[0];
  assert.ok(action, '追踪后有机会动作');
  assert.equal(usesFixedScenarioInventory(s), false, 'lyl 存档：retryAIResponse 会发格式重试');
  return { s, action };
}
const oppState = save => save.世界.状态.剧本模组.actorEngine?.opportunityStates?.[LYL_OPP];

test('机会动作（lyl）：preview 返回空、走模型；第一次 529 → 机会状态与发送前相同；重试带机会动作 → 推进一步，与第一次就成功逐项相同', async () => {
  const { previewQingyuOpportunityNarrative } = await load('../src/modules/scenarioMods/qingyuOpportunityNarrative.ts');
  const { validateProcessedAIResponse } = await load('../src/utils/processedAIResponseValidation.ts');
  const probe = lylOpportunitySave();
  const probeBefore = clone(probe.s);
  assert.equal(previewQingyuOpportunityNarrative(probe.s, probe.action), '', '非清羽试玩存档：没有本地正文，交模型');
  assert.deepEqual(clone(probe.s), probeBefore);

  const turn = async impl => {
    const { s, action } = lylOpportunitySave();
    const t = await pipeline(s, impl);
    return { t, action, first: t.firstOptions(action.actionText, { opportunityAction: structuredClone(action) }), before: clone(t.store.toSaveData()) }; // 发送前＝读进 store 之后
  };
  const ctl = await turn(() => OPP_GOOD);
  let control;
  try {
    assert.equal((await ctl.t.run(ctl.action.actionText, ctl.first)).transactionCommitted, true);
    control = clone(ctl.t.store.toSaveData());
    assert.equal(oppState(control).completionStepIndex, (oppState(ctl.before).completionStepIndex || 0) + 1, '对照：机会推进一步');
  } finally { ctl.t.restore(); }

  const x = await turn(n => n === 1 ? http529() : OPP_GOOD);
  try {
    const r1 = await x.t.run(x.action.actionText, x.first);
    assert.equal(r1.transactionCommitted, undefined);
    assert.equal(r1.generationError, undefined);
    assert.equal(validateProcessedAIResponse(r1).isValid, false);
    const mid = clone(x.t.store.toSaveData());
    assert.deepEqual(oppState(mid), oppState(x.before), '第一次失败后机会状态没动');
    assert.deepEqual(diffPaths(mid, x.before).filter(p => !VOLATILE.test(p)), [], '第一次失败后整份存档除放过项外与发送前相同');
    assert.ok(runtime.getTrackedStoryOpportunityActions(mid).some(a => JSON.stringify(a) === JSON.stringify(x.action)), '同一个机会动作仍可用（重试带过去不会是 stale）');

    const r2 = await x.t.run(`${x.action.actionText}${RETRY_SUFFIX}`, x.t.retryOptions(x.first, x.action.actionText));
    assert.equal(r2.transactionCommitted, true);
    assert.equal(validateProcessedAIResponse(r2).isValid, true);
    const after = clone(x.t.store.toSaveData());
    assert.equal(oppState(after).completionStepIndex, (oppState(x.before).completionStepIndex || 0) + 1, '只推进一步');
    assert.deepEqual(oppState(after), oppState(control));
    const receipts = save => Object.fromEntries(Object.entries(save.系统?.扩展?.actionTime?.receipts ?? {}).filter(([k]) => k.startsWith('gen_')));
    assert.deepEqual(Object.keys(receipts(after)), ['gen_retry_1']);
    const ctlSave = clone(control);
    const { gen_first: ctlReceipt, ...ctlRest } = ctlSave.系统?.扩展?.actionTime?.receipts ?? {};
    if (ctlReceipt) ctlSave.系统.扩展.actionTime.receipts = { ...ctlRest, gen_retry_1: { ...ctlReceipt, id: 'gen_retry_1' } };
    const diffs = diffPaths(after, ctlSave).filter(p => !VOLATILE.test(p));
    assert.deepEqual(diffs, [], `与第一次就成功的对照不同：${diffs.join(', ')}`);
  } finally { x.t.restore(); }
});

test('机会动作（lyl）：对照——重试不带机会动作（修前写法）也会推进一步，但靠的是原话文本匹配（记录键带上了格式说明尾巴）；带过去后走结构化，与第一次就成功一致', async () => {
  const { s, action } = lylOpportunitySave();
  const t = await pipeline(s, n => n === 1 ? http529() : OPP_GOOD);
  try {
    const before = oppState(clone(t.store.toSaveData()));
    await t.run(action.actionText, t.firstOptions(action.actionText, { opportunityAction: structuredClone(action) }));
    const old = { onProgressUpdate: () => {}, playerIntentText: action.actionText, useStreaming: false, shouldAbort: () => false, generation_id: 'gen_retry_1' };
    assert.equal((await t.run(`${action.actionText}${RETRY_SUFFIX}`, old)).transactionCommitted, true);
    const st = oppState(clone(t.store.toSaveData()));
    assert.equal(st.completionStepIndex, (before.completionStepIndex || 0) + 1);
    assert.doesNotMatch(st.lastCompletionActionKey, /:structured:/, '修前：不是结构化结算');
    assert.match(st.lastCompletionActionKey, /输出格式/, '修前：按重试拼过格式说明的原话匹配');
  } finally { t.restore(); }
  // 带过去（上一条已比过与对照逐项相同）：记录键是结构化的。
  const { s: s2, action: a2 } = lylOpportunitySave();
  const t2 = await pipeline(s2, n => n === 1 ? http529() : OPP_GOOD);
  try {
    const first = t2.firstOptions(a2.actionText, { opportunityAction: structuredClone(a2) });
    await t2.run(a2.actionText, first);
    await t2.run(`${a2.actionText}${RETRY_SUFFIX}`, t2.retryOptions(first, a2.actionText));
    assert.match(oppState(clone(t2.store.toSaveData())).lastCompletionActionKey, new RegExp(`:structured:${a2.actionId.replace(/[.]/g, '\\.')}$`));
  } finally { t2.restore(); }
});
