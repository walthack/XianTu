// 宋线旧档夹具（song-replay）生成器 —— 仅作出处记录。
// **入库后不再重生成**；以后改了行为就改测试期望（tests/songReplayFixtures.test.mjs）并在 PR 写明原因，不改不删夹具。
// 夹具生成于宋线「搬进内容包」（rail/展示表/二级线/下一步表从框架 TS 搬进 packs/song）之前的提交（基线 da0edee9），
// 代表搬迁前烘焙进存档（世界.状态.剧本模组 的 chapters/events）的旧形状；测试只读入库夹具，不重跑本脚本比对。
//
// 推进循环照抄 scripts/generate-qin-replay-fixtures.mjs（正式新档 strict 路径、真实动作推进、不补写完成/flags/激活；固定宿主时钟/随机/UUID），
// 在途经宋关的节点落夹具。两份「派生夹具」在引擎真实推进的档上做最小手工改动以构造旧形状，每处改动写进 trace[0].nonEngineProgress：
//   song-retreat-legacy：江州撤退入关档，s01_01/s01_02 的 locationId/objective/合同换回 da90cb13 之前的内置值（旧位置、无 intentMatch）；
//   song-quarantine：江州撤退收束档，临时把黑魔海移出隔离集合、走正式切关进入隔离关（隔离规则出现之前的旧档就是这样进去的），再删掉烘焙事件的 intentMatch。
// 生成：node scripts/generate-song-replay-fixtures.mjs [输出目录] → tests/fixtures/song-replay/<name>.json + <name>.trace.json
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

export const outputDir = new URL('../tests/fixtures/song-replay/', import.meta.url);
export const FIXTURES = ['song-before-entry', 'song-jiangzhou-mid', 'song-retreat-legacy', 'song-linan-mid', 'song-line-end', 'song-quarantine'];
const SAVE_NAMES = {
  'song-before-entry': '宋线旧档-晋关收束-江州暗战就绪',
  'song-jiangzhou-mid': '宋线旧档-烈山关中段',
  'song-jiangzhou-mid:entry': '宋线旧档-烈山关入关',
  'song-retreat-legacy': '宋线旧档-江州撤退-旧位置无短语',
  'song-linan-mid': '宋线旧档-临安初抵五拍',
  'song-line-end': '宋线旧档-小瀛洲收束-太泉圣果就绪',
  'song-quarantine': '宋线旧档-停在隔离关黑魔海',
  'song-quarantine:retreat-ready': '宋线旧档-江州撤退收束-下一关隔离',
};
const QIN_STAGE = 'lyg.qin_xianyang';
const ENTRY = P.CONTENT_PACKS.mapEntries.find(e => e.stageId === QIN_STAGE);
const JIN_09 = 'lcq.stage_09_trade_and_escape', S10 = 'lcq.stage_10_jiangzhou_shadow_war', LIESHAN = 'lcq.stage_11_lieshan_battle';
const RETREAT = 'lyl.jiangzhou_retreat', BLACK_SEA = 'lyl.lin_an_black_sea', LINAN = 'lyl.lin_an_bridge';
const XYZ = 'lyl.xiaoyingzhou_blacksea_trap', SACRED = 'lyl.taiquan_sacred_fruit';
const LIESHAN_MID_DONE = 'lcq.event.s11_05_wangtao_breaks';
const LINAN_MID_DONE = 'lyl.event.mingqingsi_lin_lu_meeting'; // 「初抵临安」rail 第 5 拍
const LEGACY_COMMIT = 'da90cb13'; // 这次提交把 s01_01/02 换到新位置并补了 intentMatch；取它的父提交里的内置值作旧形状
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

/** 正式创角的 strict mod 路径（同秦夹具生成器 formalNewSave）。 */
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
  save.元数据 = { ...save.元数据, 存档ID: 'song-replay-fixture', 存档名: '宋线旧档夹具', 创建时间: generatedAt, 更新时间: generatedAt };
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
    completed: s.completedEventIds.length, active: s.activeEventIds.length, closedLines: O.closedLineIds(s),
    songOutcome: s.flags?.['line.song.outcome'] ?? null, nextStageId: s.nextStageId ?? null, nextStageReadyId: s.nextStageReadyId ?? null,
    stallTurns: s.stallTurns ?? 0, location: save.角色.位置?.locationId ?? null };
}

/** 一步真实推进（照抄秦夹具生成器的 step，只换 timeActionId 前缀）。 */
function step(save, mods, trace, n) {
  const state = rt(save), focus = R.getScenarioFocusEvent(state);
  assert.ok(!state.gameOver, `unexpected ending at ${state.modId}`);
  if (state.nextStageReadyId && state.modId !== QIN_STAGE) {
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
      trace.push({ kind: 'wait', stage: state.modId, focus: focus?.id ?? null, turn: state.worldTurn });
    }
  }
  T.settleActionTime(save, { action_time: { tier: '片刻' } }, { timeActionId: `song-replay:${n}` }, null, false, false);
  return R.advanceScenarioRuntime(save).saveData;
}

/** 搬迁前的展示层输出（章名/配乐/目标），只按烘焙对象 + 现行 TS 表算，写进 trace 当期望。 */
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

function lineCompassOf(save) {
  const s = rt(save);
  return LC.lineCompassView(save, { focusEventId: R.getScenarioFocusEvent(s)?.id, atLocationId: save.角色.位置?.locationId, compassPointer: () => POINTER });
}

/** 烈山缺席战报：把停滞轮数拨到阈值推进一轮，看场外结算写了什么（declared＝档里烘焙的合同；legacy＝删掉烘焙 offscreenResolution 后走 runtime 旧兼容层）。 */
export function lieshanOffscreenProbe(save, variant) {
  const s = structuredClone(save);
  if (variant === 'legacy') for (const e of rt(s).events) delete e.offscreenResolution;
  rt(s).stallTurns = 10;
  const after = R.advanceScenarioRuntime(s).saveData, a = rt(after);
  const d = (a.divergences || []).find(x => x.id === 'offscreen.lcq.xingyuehu_war');
  return { flag: a.flags['world.xingyuehu_war.offscreen_resolved'] ?? null, offscreenResolvedEventIds: a.offscreenResolvedEventIds ?? [],
    completed: a.completedEventIds, active: a.activeEventIds, divergence: d ? { eventId: d.eventId, worldDelta: d.worldDelta, evidence: d.evidence } : null };
}

function legacyRetreatEvents() {
  const raw = execFileSync('git', ['show', `${LEGACY_COMMIT}^:src/modules/scenarioMods/builtins/data/lyl.jiangzhou_retreat.json`], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const events = JSON.parse(raw).scenario.events;
  return Object.fromEntries(['lyl.event.s01_01', 'lyl.event.s01_02'].map(id => {
    const e = events.find(x => x.id === id);
    return [id, { locationId: e.locationId, objective: e.objective, playerCompletionContract: e.playerCompletionContract }];
  }));
}

export async function generateSongReplayFixtures() {
  return withFixedHost(async () => {
    const mods = await Promise.all((await readdir(dataDir)).filter(f => f.endsWith('.json')).sort().map(async f =>
      P.applyContentPackOverlays(JSON.parse(await readFile(new URL(f, dataDir), 'utf8')))));
    let save = formalNewSave(mods.find(m => m.manifest.id === 'lcq.stage_01'));
    const trace = [{ kind: 'source', generator: 'formalNewSave', nonEngineProgress: [],
      note: '正式（非隔离试玩）新档：同 characterInitialization 的 strict mod 路径（同秦夹具生成器）。'
        + '沿正式关链用真实动作推进；固定宿主时钟和随机种子，不固定游戏时钟。' }];
    const out = {};
    const snapshotOf = (key, s) => {
      const snapshot = JSON.parse(JSON.stringify(s));
      snapshot.元数据.存档名 = SAVE_NAMES[key];
      assert.equal(V.validateSaveDataV3(snapshot).isValid, true, key);
      return snapshot;
    };
    const mark = (key, s, { traceLen = trace.length, nonEngineProgress = [], expect = {}, extraSaves = [], extraTrace = [] } = {}) => {
      const snapshot = snapshotOf(key, s);
      const head = [...structuredClone(trace.slice(0, traceLen)), ...extraTrace];
      head[0].nonEngineProgress = nonEngineProgress;
      out[key] = {
        bundle: { type: 'saves', saves: [{ 存档名: SAVE_NAMES[key], 存档数据: snapshot }, ...extraSaves.map(([name, data]) => ({ 存档名: SAVE_NAMES[name], 存档数据: snapshotOf(name, data) }))] },
        trace: [...head, { kind: 'checkpoint', fixture: key, ...fixtureSummary(snapshot), expect }],
      };
    };
    const until = (cond, label) => {
      let n = trace.length;
      for (let guard = 0; guard < 3000 && !cond(); guard++, n++) save = step(save, mods, trace, n);
      assert.ok(cond(), `never reached: ${label}`);
    };

    // 1：晋关 stage_09 收束、江州暗战就绪（切关前一刻）。期望：下一步正式切关进入 stage_10。
    until(() => rt(save).modId === JIN_09 && rt(save).nextStageReadyId === S10, 'stage_09 ready');
    const beforeEntry = structuredClone(save), beforeEntryLen = trace.length;
    until(() => rt(save).modId === S10, 'enter stage_10');
    mark('song-before-entry', beforeEntry, { traceLen: beforeEntryLen, expect: { afterTransition: fixtureSummary(save) } });

    // 2：烈山关中段（rail 第 5 拍王韬破阵完成）。附带同一条链上的烈山入关档（s11_01 未动）：
    //    缺席战报的合同主（s11_01）一旦被玩家亲手完成就不再结算，所以中段档两种合同都不出战报，旧兼容层要在入关档上测。
    until(() => rt(save).modId === LIESHAN, 'enter lieshan');
    const lieshanEntry = structuredClone(save);
    until(() => rt(save).modId === LIESHAN && rt(save).completedEventIds.includes(LIESHAN_MID_DONE), 'lieshan mid');
    mark('song-jiangzhou-mid', save, { extraSaves: [['song-jiangzhou-mid:entry', lieshanEntry]], expect: {
      mid: { offscreenDeclared: lieshanOffscreenProbe(save, 'declared'), offscreenLegacy: lieshanOffscreenProbe(save, 'legacy') },
      entry: { ...fixtureSummary(lieshanEntry), offscreenDeclared: lieshanOffscreenProbe(lieshanEntry, 'declared'), offscreenLegacy: lieshanOffscreenProbe(lieshanEntry, 'legacy') } } });

    // 3：江州撤退入关（焦点 s01_01，尚无尝试）——派生：s01_01/02 换回 da90cb13 之前的旧位置、旧目标、旧合同（无 intentMatch）。
    until(() => rt(save).modId === RETREAT, 'enter retreat');
    {
      const legacy = structuredClone(save), s = rt(legacy), old = legacyRetreatEvents(), changes = [];
      for (const [id, fields] of Object.entries(old)) {
        const event = s.events.find(e => e.id === id);
        assert.ok(event && !s.completedEventIds.includes(id), id);
        const state = s.eventActionStates?.[id];
        assert.ok(!state || (!(state.attemptCount > 0) && !state.attempts?.length && !state.preparations?.length), `${id} 已有尝试`);
        for (const [field, value] of Object.entries(fields)) {
          if (JSON.stringify(event[field]) === JSON.stringify(value)) continue;
          changes.push({ path: `世界.状态.剧本模组.events[id=${id}].${field}`, from: field === 'playerCompletionContract' ? '（现行内置合同，含 intentMatch）' : event[field],
            to: field === 'playerCompletionContract' ? `（${LEGACY_COMMIT}^ 内置合同，无 intentMatch）` : value, reason: `${LEGACY_COMMIT} 之前烘焙的旧形状` });
          event[field] = structuredClone(value);
        }
        if (state) { delete s.eventActionStates[id]; changes.push({ path: `世界.状态.剧本模组.eventActionStates.${id}`, from: '（按现行合同建的空动作状态）', to: '删除，交引擎按旧合同重建', reason: '动作状态的 contractHash 随合同' }); }
      }
      R.getCurrentStoryEventActions(legacy); // 引擎按旧合同重建当前拍动作状态
      mark('song-retreat-legacy', legacy, { nonEngineProgress: changes, expect: { legacyShapes: old } });
    }

    // 6 的底档：江州撤退收束、下一关是隔离关黑魔海。
    until(() => rt(save).modId === RETREAT && rt(save).nextStageReadyId, 'retreat ready');
    const retreatReady = structuredClone(save), retreatReadyLen = trace.length;

    // 4：临安「初抵临安」章 rail 前 5 拍完成。期望：烘焙对象下的章名/配乐/目标。
    until(() => rt(save).modId === LINAN && rt(save).completedEventIds.includes(LINAN_MID_DONE), 'linan mid');
    mark('song-linan-mid', save, { expect: { presentation: presentationOf(rt(save)) } });

    // 5：小瀛洲 rail 走完、太泉圣果就绪（切关前一刻）。期望：线卡视图与切关结果。
    until(() => rt(save).modId === XYZ && rt(save).nextStageReadyId === SACRED, 'xiaoyingzhou ready');
    const lineEnd = structuredClone(save), lineEndLen = trace.length;
    const lineEndCompass = lineCompassOf(lineEnd);
    until(() => rt(save).modId === SACRED, 'enter sacred fruit');
    mark('song-line-end', lineEnd, { traceLen: lineEndLen, expect: { lineCompass: lineEndCompass, afterTransition: fixtureSummary(save) } });

    // 6：派生——隔离规则出现之前的旧档：从江州撤退收束档正式切关进入黑魔海（临时移出隔离集合，切完立即恢复），再删掉烘焙事件的 intentMatch。
    {
      const changes = [{ path: 'canonRail.DEFAULT_LINE_QUARANTINED_STAGE_IDS', from: '含 lyl.lin_an_black_sea', to: '切关期间临时移除，切完恢复',
        reason: '默认路线会跳过隔离关；隔离规则出现之前的旧档就是这样正式切进黑魔海的' }];
      CR.DEFAULT_LINE_QUARANTINED_STAGE_IDS.delete(BLACK_SEA);
      let result;
      try { result = I.transitionToNextScenarioStage(structuredClone(retreatReady), mods); } finally { CR.DEFAULT_LINE_QUARANTINED_STAGE_IDS.add(BLACK_SEA); }
      assert.ok(result.ok, result.reason);
      const blackSea = result.saveData, s = rt(blackSea);
      assert.equal(s.modId, BLACK_SEA);
      for (const event of s.events) for (const action of event.playerCompletionContract?.actions || []) {
        if (!action.intentMatch) continue;
        delete action.intentMatch;
        changes.push({ path: `世界.状态.剧本模组.events[id=${event.id}].playerCompletionContract.actions[id=${action.id}].intentMatch`, from: '（现行内置短语）', to: '删除',
          reason: '黑魔海插叙短语是 da90cb13 后补的，旧档烘焙的合同没有' });
      }
      // trace 截到江州撤退收束点，再接这次派生切关（不混入主链之后的临安、小瀛洲步骤）。
      mark('song-quarantine', blackSea, { traceLen: retreatReadyLen, extraTrace: [{ kind: 'stage', from: RETREAT, to: BLACK_SEA, derived: true }],
        nonEngineProgress: changes, extraSaves: [['song-quarantine:retreat-ready', retreatReady]],
        expect: { retreatReady: { ...fixtureSummary(retreatReady), traceLen: retreatReadyLen } } });
    }
    return out;
  });
}

export async function writeSongReplayFixtures(dir = outputDir) {
  const out = await generateSongReplayFixtures();
  await mkdir(dir, { recursive: true });
  for (const key of FIXTURES) {
    const stem = fileURLToPath(new URL(key, dir));
    await writeFile(`${stem}.json`, JSON.stringify(out[key].bundle) + '\n');
    await writeFile(`${stem}.trace.json`, JSON.stringify(out[key].trace, null, 1) + '\n');
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = await writeSongReplayFixtures(process.argv[2] ? pathToFileURL(process.argv[2].replace(/\/?$/, '/')) : outputDir);
  for (const key of FIXTURES) { const { expect, ...summary } = out[key].trace.at(-1); console.log(JSON.stringify(summary)); }
}
