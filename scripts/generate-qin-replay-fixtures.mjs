// 秦线旧档夹具（qin-replay）生成器 —— 仅作出处记录。
// **入库后不再重生成**；以后改了行为就改测试期望（tests/qinReplayFixtures.test.mjs）并在 PR 写明原因，不改不删夹具。
// 夹具生成于秦线「声明化搬迁」（rail/章名/配乐/线注册从 TS 搬进内容包）之前的提交（基线 b668792f），
// 代表搬迁前烘焙进存档（世界.状态.剧本模组 的 chapters/events）的旧形状；测试只读入库夹具，不重跑本脚本比对。
//
// 做法同 generate-line-entry-checkpoints.mjs：沿正式关链用真实动作推进，不补写 completedEventIds/flags/activeEventIds；
// 秦口信「先记下」、地图入秦、秦关逐拍均走正式入口（recordStoryEventStructuredAction / selectMapTravel + settleMapTravel）。
// 与 line-entry 生成器的唯一不同：底档是正式新档而非清羽试玩档——试玩档带 系统.扩展.清羽记开局（kind qingyu-demo-v1）隔离标记，
// mapEntryReady 对 demo/playtest 档不开放秦入口，试玩档永远进不了秦。正式新档按 characterInitialization 的 strict mod 路径组装。
// 固定宿主时钟/随机种子/UUID，只为重跑逐字节一致；不固定游戏时钟。
// 生成：node scripts/generate-qin-replay-fixtures.mjs → tests/fixtures/qin-replay/<name>.json + <name>.trace.json
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { loadTs } from '../tests/loadTs.mjs';

globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const I = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const P = await loadTs('../src/modules/contentPacks/index.ts');
const W = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const M = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
const T = await loadTs('../src/modules/scenarioMods/actionTime.ts');
const V = await loadTs('../src/utils/saveValidationV3.ts');
const L = await loadTs('../src/modules/scenarioMods/ledgerConditions.ts');
const O = await loadTs('../src/modules/scenarioMods/lineOutcomes.ts');
const ME = await loadTs('../src/modules/scenarioMods/mapEntries.ts');
const DR = await loadTs('../src/utils/dataRepair.ts');
const LS = await loadTs('../src/utils/lifespanCalculator.ts');
const RL = await loadTs('../src/modules/scenarioMods/relationships.ts');
const NE = await loadTs('../src/modules/scenarioMods/namedEntities.ts');

export const outputDir = new URL('../tests/fixtures/qin-replay/', import.meta.url);
export const FIXTURES = ['qin-before-entry', 'qin-entry-ready', 'qin-rail-mid', 'qin-rail-end'];
const SAVE_NAMES = {
  'qin-before-entry': '秦线旧档-入秦前-未达阈值',
  'qin-entry-ready': '秦线旧档-入秦阈值已达-口信已记下',
  'qin-rail-mid': '秦线旧档-秦关中段',
  'qin-rail-end': '秦线旧档-秦关rail走完',
};
const QIN_STAGE = 'lyg.qin_xianyang';
const ENTRY = P.CONTENT_PACKS.mapEntries.find(e => e.stageId === QIN_STAGE);
const MID_CHAPTER = 'lyg.chapter.qin_xianyang_act1';
const MID_DONE = 'liuchao.event.qin_palace_sealed';
const rt = save => save.世界.状态.剧本模组;
const ready = save => L.resolveLedgerPath('compass.qinEntryReady', rt(save), save)?.value === true;
const dataDir = new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url);

async function withFixedHost(fn) {
  const OriginalDate = globalThis.Date, originalRandom = Math.random;
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const epoch = OriginalDate.parse('2026-11-01T00:00:00.000Z');
  globalThis.Date = class extends OriginalDate {
    constructor(...args) { super(...(args.length ? args : [epoch])); }
    static now() { return epoch; }
  };
  let seed = 20261111;
  Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
    randomUUID() {
      const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    },
  } });
  try { return await fn(); } finally {
    globalThis.Date = OriginalDate; Math.random = originalRandom;
    if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor); else delete globalThis.crypto;
  }
}

/** 正式创角的 strict mod 路径（不含 LLM/商店）：主角取开局预设（同 qingyuOpeningPlaytest.applyCreationPreset 字段），无试玩覆写、无隔离标记。 */
function formalNewSave(mod) {
  const generatedAt = '2026-11-01T00:00:00.000Z';
  const save = I.applyStrictScenarioInitializationToSave(DR.createMinimalSaveDataV3(), I.buildStrictScenarioInitialization(mod, generatedAt));
  const preset = mod.scenario.opening.creationPreset, identity = save.角色.身份;
  identity.名字 = preset?.characterName || NE.entityName('character', 'liuchao.character.cheng_zongyang');
  if (preset?.gender) identity.性别 = preset.gender;
  if (preset?.race) identity.种族 = preset.race;
  identity.世界 = mod.world?.name || '六朝';
  identity.天资 = preset?.talentTier || { name: '异世来客' };
  identity.出生 = preset?.origin?.name || '现代来客';
  identity.灵根 = preset?.spiritRoot || { name: '生死根' };
  identity.天赋 = (preset?.talents || []).map((t, i) => ({ id: 9100 + i, name: t.name, description: t.description, rarity: '特殊', talent_cost: 0 }));
  if (preset?.attributes) identity.先天六司 = { 根骨: preset.attributes.rootBone, 灵性: preset.attributes.spirituality, 悟性: preset.attributes.comprehension,
    气运: preset.attributes.fortune, 魅力: preset.attributes.charm, 心性: preset.attributes.temperament };
  save.世界 = R.advanceScenarioRuntime(save).saveData.世界;
  save.元数据 = { ...save.元数据, 存档ID: 'qin-replay-fixture', 存档名: '秦线旧档夹具', 创建时间: generatedAt, 更新时间: generatedAt };
  // 同 freshPrologueCheckpoint / 正式创角：开局年由年龄公式算，首见年随之平移，寿命.当前=开局年龄，出生对齐，开寿命缓存。
  const age = preset.age, oldYear = save.元数据.时间.年;
  save.元数据.时间.年 = LS.计算起始年(age);
  for (const npc of Object.values(save.社交.关系)) if (Number.isInteger(npc.首见年)) npc.首见年 += save.元数据.时间.年 - oldYear;
  RL.reconcileRegistryBirthdates(save);
  save.角色.属性.寿命.当前 = age;
  assert.ok(I.alignBirthWithStartYear(save, age));
  LS.enableLifespanCache(save);
  return save;
}

export function fixtureSummary(save) {
  const s = rt(save);
  return { stage: s.modId, chapter: s.currentChapterId ?? null, focus: R.getScenarioFocusEvent(s)?.id ?? null,
    completed: s.completedEventIds.length, active: s.activeEventIds.length, closedLines: O.nationClosedLineCount(s),
    qinEntryReady: ready(save), nextStageReadyId: s.nextStageReadyId ?? null, qinOutcome: s.flags?.['line.qin.outcome'] ?? null,
    location: save.角色.位置?.locationId ?? null };
}

/** 一步真实推进：切关 / 主拍合同动作 / 机会 / 等待，然后结算片刻并推进 runtime（同 line-entry 生成器的循环体）。 */
function step(save, mods, trace, n) {
  const state = rt(save), focus = R.getScenarioFocusEvent(state);
  assert.ok(!state.gameOver, `unexpected ending at ${state.modId}`);
  if (state.nextStageReadyId && state.modId !== QIN_STAGE) {
    const result = I.transitionToNextScenarioStage(save, mods);
    assert.ok(result.ok, result.reason);
    trace.push({ kind: 'stage', from: state.modId, to: rt(result.saveData).modId });
    return result.saveData;
  }
  // 同 freshPrologueCheckpoint：s02_01 接下整份差事走正式机会动作；s02_04 先经正式选择器去点心铺，再结算点心铺问题动作。
  if (focus?.id === 'lcq.event.s02_01') {
    R.trackStoryOpportunity(save, 'opportunity.lcq.s02_01.take_full_mandate');
    const choice = R.getTrackedStoryOpportunityActions(save)[0];
    if (choice) {
      const receipt = R.recordStoryOpportunityStructuredAction(save, choice);
      trace.push({ kind: 'opportunity', stage: state.modId, opportunity: 'opportunity.lcq.s02_01.take_full_mandate', progressed: !!receipt.progressed });
      return R.advanceScenarioRuntime(save).saveData;
    }
  }
  if (focus?.id === 'lcq.event.s02_04') {
    const local = W.getWuyuanOpenWorldSelections(save).find(a => a.kind === 'problem_action')
      || W.resolveWuyuanOpenWorldSelectionFromText(save, '我去点心铺')
      || W.getWuyuanOpenWorldSelections(save).find(a => a.identityId === 'lcq.route.wuyuan.arrive_market');
    if (local) {
      const result = W.settleWuyuanOpenWorldSelection(save, local);
      trace.push({ kind: 'local', selection: local.identityId, settled: !!result?.settled, canonEventCompleted: !!result?.canonEventCompleted });
      return R.advanceScenarioRuntime(save).saveData;
    }
  }
  // 秦口信是可忽略的探索动作，主链推进不代选（由夹具 2 显式「先记下」）。
  const actions = R.getCurrentStoryEventActions(save).filter(a => a.eventId !== ENTRY.eventId);
  const action = actions.find(a => focus?.playerCompletionContract?.actions.some(c => c.id === a.actionId))
    || actions.find(a => a.actionId.startsWith('travel:')) || actions[0];
  if (action) {
    const receipt = R.recordStoryEventStructuredAction(save, action);
    assert.ok(receipt.attempted, JSON.stringify({ action, receipt }));
    trace.push({ kind: 'action', stage: state.modId, event: action.eventId, action: action.actionId, completed: !!receipt.completed });
  } else {
    const opportunity = focus?.worldActor?.opportunities?.[0];
    if (opportunity) R.trackStoryOpportunity(save, opportunity.id);
    const choice = R.getTrackedStoryOpportunityActions(save)[0];
    if (choice) {
      const receipt = R.recordStoryOpportunityStructuredAction(save, choice);
      assert.ok(receipt.progressed, JSON.stringify(receipt));
      trace.push({ kind: 'opportunity', stage: state.modId, opportunity: choice.opportunityId ?? null });
    } else {
      // 世界角色/画外拍的正常时钟推进；不补写事件完成。
      trace.push({ kind: 'wait', stage: state.modId, focus: focus?.id ?? null, turn: state.worldTurn });
    }
  }
  T.settleActionTime(save, { action_time: { tier: '片刻' } }, { timeActionId: `qin-replay:${n}` }, null, false, false);
  return R.advanceScenarioRuntime(save).saveData;
}

export async function generateQinReplayFixtures() {
  return withFixedHost(async () => {
    const mods = await Promise.all((await readdir(dataDir)).filter(f => f.endsWith('.json')).sort().map(async f =>
      P.applyContentPackOverlays(JSON.parse(await readFile(new URL(f, dataDir), 'utf8')))));
    let save = formalNewSave(mods.find(m => m.manifest.id === 'lcq.stage_01'));
    const trace = [{ kind: 'source', generator: 'formalNewSave', nonEngineProgress: [],
      note: '正式（非隔离试玩）新档：同 characterInitialization 的 strict mod 路径（createMinimalSaveDataV3 → applyStrictScenarioInitializationToSave → 预设主角 → 对齐出生/开寿命缓存）。'
        + '沿正式关链用真实动作推进；固定宿主时钟和随机种子，不固定游戏时钟。' }];
    const out = {};
    const mark = (key, s, traceLen = trace.length) => {
      const snapshot = JSON.parse(JSON.stringify(s));
      snapshot.元数据.存档名 = SAVE_NAMES[key];
      assert.equal(V.validateSaveDataV3(snapshot).isValid, true, key);
      out[key] = {
        bundle: { type: 'saves', saves: [{ 存档名: SAVE_NAMES[key], 存档数据: snapshot }] },
        trace: [...structuredClone(trace.slice(0, traceLen)), { kind: 'checkpoint', fixture: key, ...fixtureSummary(snapshot) }],
      };
    };
    let n = 0, lastNotReady = null;
    // 1：主链推进至入秦阈值达成；夹具 1 取达成前最后一个「已有线收束、未达阈值」的档（口信只在达成时投递，故此时尚无口信）。
    for (; n < 3000 && !ready(save); n++) {
      if (O.nationClosedLineCount(rt(save)) >= 1) lastNotReady = { save: structuredClone(save), traceLen: trace.length };
      save = step(save, mods, trace, n);
    }
    assert.ok(ready(save), 'qinEntryReady never reached');
    assert.ok(lastNotReady, 'no closed line before ready');
    mark('qin-before-entry', lastNotReady.save, lastNotReady.traceLen);
    // 2：达成的这一轮已投递口信（syncMapEntryMessages 把 Q-1 连同 compass.qinEntryReady 条件烘进 rt.events）；
    //    玩家选「先记下」留在主链，地图入口仍可用（下一步就是地图入秦）。
    assert.ok(rt(save).activeEventIds.includes(ENTRY.eventId), 'Q-1 未投递');
    const later = R.getCurrentStoryExplorationActions(save).find(a => a.eventId === ENTRY.eventId && a.actionId === 'later');
    assert.ok(later, 'Q-1 先记下动作缺失');
    assert.equal(R.recordStoryEventStructuredAction(save, later).completed, true);
    trace.push({ kind: 'action', stage: rt(save).modId, event: ENTRY.eventId, action: 'later', completed: true });
    save = R.advanceScenarioRuntime(save).saveData;
    assert.ok(rt(save).completedEventIds.includes(ENTRY.eventId));
    assert.equal(ME.mapEntryReady(save, ENTRY), true, '先记下后地图入口应可用');
    mark('qin-entry-ready', save);
    // 3：地图点咸阳入秦（同 qinEntryWiring 的真实切关入口），沿默认 rail 推进到第一幕「年节封宫」的封宫拍完成、焦点为同章的夺位拍。
    //    注：秦关 rail profile 钉在序幕章，runtime.currentChapterId 整条 rail 都停在序幕章（引擎现状）；「在后续章内」按焦点事件所属章判。
    const selection = M.selectMapTravel(save, ENTRY.locationId);
    assert.ok(selection, '咸阳地图入口不可用');
    selection.actionId = 'qin-replay:map:xianyang';
    assert.equal(M.settleMapTravel(save, selection), true);
    trace.push({ kind: 'map', selection, stage: rt(save).modId, location: structuredClone(save.角色.位置) });
    assert.equal(rt(save).modId, QIN_STAGE);
    for (; n < 3000 && !rt(save).completedEventIds.includes(MID_DONE); n++) save = step(save, mods, trace, n);
    const midFocus = R.getScenarioFocusEvent(rt(save))?.id;
    assert.ok(rt(save).chapters.find(c => c.id === MID_CHAPTER).eventIds.includes(midFocus), `mid focus ${midFocus}`);
    mark('qin-rail-mid', save);
    // 4：rail 14 拍走完，line.qin.outcome 写出。地图入秦的秦关 nextStageId 为空，引擎不签 nextStageReadyId（当前构建无回主链入口）。
    for (; n < 3000 && !rt(save).completedEventIds.includes('liuchao.event.qin_close_default'); n++) save = step(save, mods, trace, n);
    assert.ok(rt(save).flags['line.qin.outcome'], 'line.qin.outcome missing');
    mark('qin-rail-end', save);
    return out;
  });
}

export async function writeQinReplayFixtures(dir = outputDir) {
  const out = await generateQinReplayFixtures();
  await mkdir(dir, { recursive: true });
  for (const key of FIXTURES) {
    const stem = fileURLToPath(new URL(key, dir));
    await writeFile(`${stem}.json`, JSON.stringify(out[key].bundle) + '\n');
    await writeFile(`${stem}.trace.json`, JSON.stringify(out[key].trace, null, 1) + '\n');
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = await writeQinReplayFixtures(process.argv[2] ? pathToFileURL(process.argv[2].replace(/\/?$/, '/')) : outputDir);
  for (const key of FIXTURES) console.log(JSON.stringify(out[key].trace.at(-1)));
}
