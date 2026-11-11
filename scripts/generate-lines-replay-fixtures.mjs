// 其余各线旧档夹具（lines-replay）生成器 —— 仅作出处记录。
// **入库后不再重生成**；以后改了行为就改测试期望（tests/linesReplayFixtures.test.mjs）并在 PR 写明原因，不改不删夹具。
// 夹具生成于塞外／昭南／晋国／太泉／汉国／唐国六条线「搬进内容包」之前的提交（基线 cdbe3e23），
// 代表搬迁前烘焙进存档（世界.状态.剧本模组 的 chapters/events）的旧形状；测试只读入库夹具，不重跑本脚本比对。
//
// 推进循环照抄 tests/mainlineWalker.mjs（withFixedHost / formalNewSave / step；后者又照抄秦夹具生成器）：正式新档 strict 路径、
// 真实动作推进、不补写完成/flags/激活；固定宿主时钟/随机/UUID。照抄而不 import tests/ 下的模块：夹具出处不随 walker 以后的改动漂移。
// 与 walker 的不同只有：step() 额外往 trace 记一条（不影响推进）；timeActionId 前缀换成 lines-replay:；存档ID/名换成本夹具的。
// 本批不做派生夹具（零手工改动）：每份都是整链上引擎真实推进到的那一刻，trace[0].nonEngineProgress 恒为空。
// 生成：node scripts/generate-lines-replay-fixtures.mjs [输出目录] → tests/fixtures/lines-replay/<name>.json + <name>.trace.json
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { register } from 'node:module';

// musicLibrary.ts 直接 import 曲目 .mp3（webpack 资源）；Node 下只把它当成 URL 字符串模块（同 tests/qinReplayFixtures.test.mjs）。
register('data:text/javascript,' + encodeURIComponent(
  "export async function load(url, context, next) { if (url.endsWith('.mp3')) return { format: 'module', source: 'export default ' + JSON.stringify(url), shortCircuit: true }; return next(url, context); }"));
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const { loadTs } = await import('../tests/loadTs.mjs');
const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const I = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const P = await loadTs('../src/modules/contentPacks/index.ts');
const W = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const T = await loadTs('../src/modules/scenarioMods/actionTime.ts');
const V = await loadTs('../src/utils/saveValidationV3.ts');
const O = await loadTs('../src/modules/scenarioMods/lineOutcomes.ts');
const DR = await loadTs('../src/utils/dataRepair.ts');
const LS = await loadTs('../src/utils/lifespanCalculator.ts');
const RL = await loadTs('../src/modules/scenarioMods/relationships.ts');
const NE = await loadTs('../src/modules/scenarioMods/namedEntities.ts');
const CR = await loadTs('../src/modules/scenarioMods/canonRail.ts');
const NV = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
const MUSIC = await loadTs('../src/utils/musicLibrary.ts');
const FQ = await loadTs('../src/modules/scenarioMods/fixedQuestObjectives.ts');
const LC = await loadTs('../src/modules/scenarioMods/lineCompass.ts');

export const outputDir = new URL('../tests/fixtures/lines-replay/', import.meta.url);
/**
 * 每条线两份：mid＝该线某一关 rail 前 k 拍完成（焦点在第 k+1 拍）；end＝该线最后一关 rail 走完、下一关就绪（切关前一刻）。
 * 唐线末关 lyg.shituolin_endgame 是整链终关，没有下一关：end 取 rail 全部结算的那一刻（同 mainlineWalker 的 done 判据）。
 */
export const PLAN = [
  { key: 'saiwai-mid', name: '塞外旧档-五原关rail九拍', stage: 'lcq.stage_02', railDone: 9 },
  { key: 'saiwai-end', name: '塞外旧档-五原关收束-下一关就绪', stage: 'lcq.stage_02', end: true },
  { key: 'zhaonan-mid', name: '昭南旧档-白夷危局rail十七拍', stage: 'lcq.stage_04b_lingfei_baiyi_crisis', railDone: 17 },
  { key: 'zhaonan-end', name: '昭南旧档-鬼王宫收束-下一关就绪', stage: 'lcq.stage_05b', end: true },
  { key: 'jin-mid', name: '晋国旧档-清远建康rail九拍', stage: 'lcq.stage_07_qingyuan_jiankang', railDone: 9 },
  { key: 'jin-end', name: '晋国旧档-商路脱身收束-江州暗战就绪', stage: 'lcq.stage_09_trade_and_escape', end: true },
  { key: 'taiquan-mid', name: '太泉旧档-赤阳圣果rail七拍', stage: 'lyl.taiquan_sacred_fruit', railDone: 7 },
  { key: 'taiquan-end', name: '太泉旧档-太泉余波收束-洛都就绪', stage: 'lyl.taiquan_afterfall', end: true },
  { key: 'han-mid', name: '汉国旧档-汉宫rail九拍', stage: 'lyl.han_palace_endgame', railDone: 9 },
  { key: 'han-end', name: '汉国旧档-汉嗣收束-长安就绪', stage: 'lyg.han_succession', end: true },
  { key: 'tang-mid', name: '唐国旧档-长安插曲rail十四拍', stage: 'lyg.changgan_interlude', railDone: 14 },
  { key: 'tang-end', name: '唐国旧档-石驼林终关rail走完', stage: 'lyg.shituolin_endgame', end: true, final: true },
];
export const FIXTURES = PLAN.map(p => p.key);
const ENTRY = P.CONTENT_PACKS.mapEntries.find(e => e.stageId === 'lyg.qin_xianyang');
const POINTER = '<<COMPASS_POINTER>>';
const rt = save => save.世界.状态.剧本模组;
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

/** 正式创角的 strict mod 路径（照抄 mainlineWalker formalNewSave，只换存档ID/名）。 */
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
  save.元数据 = { ...save.元数据, 存档ID: 'lines-replay-fixture', 存档名: '其余各线旧档夹具', 创建时间: generatedAt, 更新时间: generatedAt };
  const age = preset.age, oldYear = save.元数据.时间.年;
  save.元数据.时间.年 = LS.计算起始年(age);
  for (const npc of Object.values(save.社交.关系)) if (Number.isInteger(npc.首见年)) npc.首见年 += save.元数据.时间.年 - oldYear;
  RL.reconcileRegistryBirthdates(save);
  save.角色.属性.寿命.当前 = age;
  assert.ok(I.alignBirthWithStartYear(save, age));
  LS.enableLifespanCache(save);
  return save;
}

const lineOutcomes = s => Object.fromEntries(Object.entries(s.flags || {}).filter(([k]) => /^line\.[^.]+\.outcome$/.test(k)).sort(([a], [b]) => (a < b ? -1 : 1)));
export function fixtureSummary(save) {
  const s = rt(save);
  return { stage: s.modId, chapter: s.currentChapterId ?? null, focus: R.getScenarioFocusEvent(s)?.id ?? null,
    completed: s.completedEventIds.length, active: s.activeEventIds.length, closedLines: O.closedLineIds(s), lineOutcomes: lineOutcomes(s),
    nextStageId: s.nextStageId ?? null, nextStageReadyId: s.nextStageReadyId ?? null, stallTurns: s.stallTurns ?? 0, location: save.角色.位置?.locationId ?? null };
}

/** 一步真实推进（照抄 mainlineWalker step：无秦关特判；另记一条 trace，不影响推进）。 */
function step(save, mods, trace, n) {
  const state = rt(save), focus = R.getScenarioFocusEvent(state);
  assert.ok(!state.gameOver, `unexpected ending at ${state.modId}`);
  if (state.nextStageReadyId) {
    const result = I.transitionToNextScenarioStage(save, mods);
    assert.ok(result.ok, result.reason);
    trace.push({ kind: 'stage', from: state.modId, to: rt(result.saveData).modId });
    return result.saveData;
  }
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
  // 秦口信是可忽略的探索动作，主链推进不代选。
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
      trace.push({ kind: 'wait', stage: state.modId, focus: focus?.id ?? null, turn: state.worldTurn }); // 世界角色/画外拍的正常时钟推进；不补写事件完成。
    }
  }
  T.settleActionTime(save, { action_time: { tier: '片刻' } }, { timeActionId: `lines-replay:${n}` }, null, false, false);
  return R.advanceScenarioRuntime(save).saveData;
}

/** rail 结算口径同 mainlineWalker.unsettledRailBeats（完成 / 场外结算 / .void）。 */
function unsettledRailBeats(state) {
  const rail = CR.getCanonRailProfile(state);
  if (!rail?.orderedEventIds?.length) return null;
  return rail.orderedEventIds.filter(id => {
    if (state.completedEventIds.includes(id) || (state.offscreenResolvedEventIds || []).includes(id)) return false;
    const condition = state.events.find(e => e.id === id)?.completion?.[0];
    return !(condition?.path?.startsWith('flags.') && condition.path.endsWith('.done')
      && state.flags[condition.path.slice('flags.'.length).replace(/\.done$/, '.void')] === true);
  });
}

/** 搬迁前的展示层输出（章名/配乐/目标），只按烘焙对象 + 现行 TS 表算，写进 trace 当期望（同宋夹具生成器）。 */
function presentationOf(s) {
  const chapterOf = id => s.chapters.find(c => (c.eventIds || []).includes(id));
  return {
    chapterTitles: Object.fromEntries(s.events.map(e => [e.id, NV.storyChapterTitle(s.modId, e.id, chapterOf(e.id)?.title ?? '')])),
    chapterMusic: Object.fromEntries(s.chapters.map(c => [c.id, MUSIC.resolveMusicMoodForChapter(c.id)])),
    eventMusic: Object.fromEntries(s.events.map(e => [e.id, MUSIC.resolveMusicMoodForScenario(chapterOf(e.id)?.id ?? null, [e])])),
    currentMusic: MUSIC.resolveMusicMoodForScenario(s.currentChapterId, s.events.filter(e => s.activeEventIds.includes(e.id))),
    objectives: Object.fromEntries(s.events.map(e => [e.id, FQ.resolveFixedQuestObjective(e)])),
  };
}
const bakedPresentation = s => ({ events: s.events.filter(e => 'presentation' in e).map(e => e.id), chapters: s.chapters.filter(c => 'presentation' in c).map(c => c.id) });

function lineCompassOf(save) {
  const s = rt(save);
  return LC.lineCompassView(save, { focusEventId: R.getScenarioFocusEvent(s)?.id, atLocationId: save.角色.位置?.locationId, compassPointer: () => POINTER });
}

export async function generateLinesReplayFixtures() {
  return withFixedHost(async () => {
    const mods = await Promise.all((await readdir(dataDir)).filter(f => f.endsWith('.json')).sort().map(async f =>
      P.applyContentPackOverlays(JSON.parse(await readFile(new URL(f, dataDir), 'utf8')))));
    let save = formalNewSave(mods.find(m => m.manifest.id === 'lcq.stage_01'));
    const trace = [{ kind: 'source', generator: 'formalNewSave', nonEngineProgress: [],
      note: '正式（非隔离试玩）新档：同 characterInitialization 的 strict mod 路径（推进循环照抄 tests/mainlineWalker.mjs）。'
        + '沿正式关链用真实动作推进；固定宿主时钟和随机种子，不固定游戏时钟。本批无派生夹具、无手工改动。' }];
    const out = {};
    let n = 0;
    const until = (cond, label) => {
      for (let guard = 0; guard < 3000 && !cond(); guard++, n++) save = step(save, mods, trace, n);
      assert.ok(cond(), `never reached: ${label}`);
    };
    const mark = (plan, s, traceLen, expect) => {
      const snapshot = JSON.parse(JSON.stringify(s));
      snapshot.元数据.存档名 = plan.name;
      assert.equal(V.validateSaveDataV3(snapshot).isValid, true, plan.key);
      out[plan.key] = {
        bundle: { type: 'saves', saves: [{ 存档名: plan.name, 存档数据: snapshot }] },
        trace: [...structuredClone(trace.slice(0, traceLen)), { kind: 'checkpoint', fixture: plan.key, ...fixtureSummary(snapshot), expect }],
      };
    };
    const commonExpect = s => {
      const state = rt(s), presentation = presentationOf(state);
      // 删掉烘焙事件与章的 presentation 后输出不变（展示值不读烘焙对象上的 presentation）
      const stripped = structuredClone(state);
      for (const item of [...stripped.events, ...stripped.chapters]) delete item.presentation;
      assert.deepEqual(presentationOf(stripped), presentation, 'presentation 与烘焙 presentation 无关');
      return { presentation, bakedPresentation: bakedPresentation(state), lineCompass: lineCompassOf(s) };
    };

    for (const plan of PLAN) {
      if (!plan.end) {
        const rail = CR.getCanonRailProfile({ modId: plan.stage }).orderedEventIds;
        const lastDone = rail[plan.railDone - 1], next = rail[plan.railDone];
        until(() => rt(save).modId === plan.stage && rt(save).completedEventIds.includes(lastDone), plan.key);
        const s = rt(save);
        assert.ok(!s.completedEventIds.includes(next), `${plan.key}：第 ${plan.railDone + 1} 拍还没完成`);
        assert.deepEqual(unsettledRailBeats(s), rail.slice(plan.railDone), `${plan.key}：rail 恰好前 ${plan.railDone} 拍结算`);
        mark(plan, save, trace.length, { railDone: plan.railDone, ...commonExpect(save) });
      } else if (!plan.final) {
        until(() => rt(save).modId === plan.stage && rt(save).nextStageReadyId, plan.key);
        assert.deepEqual(unsettledRailBeats(rt(save)), [], `${plan.key}：rail 全部结算`);
        const lineEnd = structuredClone(save), lineEndLen = trace.length, expect = commonExpect(lineEnd);
        until(() => rt(save).modId !== plan.stage, `${plan.key} transition`);
        mark(plan, lineEnd, lineEndLen, { ...expect, afterTransition: fixtureSummary(save) });
      } else {
        until(() => rt(save).modId === plan.stage && unsettledRailBeats(rt(save))?.length === 0, plan.key);
        assert.equal(rt(save).nextStageReadyId ?? null, null, '整链终关没有下一关');
        const probe = I.transitionToNextScenarioStage(structuredClone(save), mods);
        mark(plan, save, trace.length, { ...commonExpect(save), transitionProbe: { ok: !!probe.ok, reason: probe.reason ?? null } });
      }
    }
    return out;
  });
}

export async function writeLinesReplayFixtures(dir = outputDir) {
  const out = await generateLinesReplayFixtures();
  await mkdir(dir, { recursive: true });
  for (const key of FIXTURES) {
    const stem = fileURLToPath(new URL(key, dir));
    await writeFile(`${stem}.json`, JSON.stringify(out[key].bundle) + '\n');
    await writeFile(`${stem}.trace.json`, JSON.stringify(out[key].trace, null, 1) + '\n');
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = await writeLinesReplayFixtures(process.argv[2] ? pathToFileURL(process.argv[2].replace(/\/?$/, '/')) : outputDir);
  for (const key of FIXTURES) { const { expect, ...summary } = out[key].trace.at(-1); console.log(JSON.stringify(summary)); }
}
