// 主链整链 walker（tests/mainlineWalkToEnding.test.mjs 的辅助模块，非 *.test.mjs，npm test 不单独跑它）。
//
// 出处：推进循环（withFixedHost / formalNewSave / step）照抄 scripts/generate-qin-replay-fixtures.mjs（基线 291e65cc），
// 宋夹具生成器 scripts/generate-song-replay-fixtures.mjs 也是同一份循环。照抄而不 import，是因为生成器以后可能随搬迁变化。
// 与生成器的不同：
//   - step() 不再特判秦关（主链不入秦；秦口信 Q-1 仍按原样从主拍动作里滤掉，玩家可忽略）；
//   - step() 额外返回本步的 kind，供 walker 记账；timeActionId 前缀换成 mainline-walk:；
//   - 外层循环按关记账，并在「终关 rail 走完」「卡住」「抛错」三种情形停下，不补写任何进度字段。
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';

globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const I = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const P = await loadTs('../src/modules/contentPacks/index.ts');
const W = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const T = await loadTs('../src/modules/scenarioMods/actionTime.ts');
const DR = await loadTs('../src/utils/dataRepair.ts');
const LS = await loadTs('../src/utils/lifespanCalculator.ts');
const RL = await loadTs('../src/modules/scenarioMods/relationships.ts');
const NE = await loadTs('../src/modules/scenarioMods/namedEntities.ts');
const CR = await loadTs('../src/modules/scenarioMods/canonRail.ts');

const ENTRY = P.CONTENT_PACKS.mapEntries.find(e => e.stageId === 'lyg.qin_xianyang');
const dataDir = new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url);
export const rt = save => save.世界.状态.剧本模组;

export async function withFixedHost(fn) {
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

export async function loadMainlineMods() {
  return Promise.all((await readdir(dataDir)).filter(f => f.endsWith('.json')).sort().map(async f =>
    P.applyContentPackOverlays(JSON.parse(await readFile(new URL(f, dataDir), 'utf8')))));
}

/** 正式创角的 strict mod 路径（照抄秦夹具生成器 formalNewSave，只换存档ID/名）。 */
export function formalNewSave(mod) {
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
  save.元数据 = { ...save.元数据, 存档ID: 'mainline-walk', 存档名: '主链整链测试', 创建时间: generatedAt, 更新时间: generatedAt };
  const age = preset.age, oldYear = save.元数据.时间.年;
  save.元数据.时间.年 = LS.计算起始年(age);
  for (const npc of Object.values(save.社交.关系)) if (Number.isInteger(npc.首见年)) npc.首见年 += save.元数据.时间.年 - oldYear;
  RL.reconcileRegistryBirthdates(save);
  save.角色.属性.寿命.当前 = age;
  assert.ok(I.alignBirthWithStartYear(save, age));
  LS.enableLifespanCache(save);
  return save;
}

/** 本步可执行的玩家动作（与 step 同序：s02_01 机会 / s02_04 本地选择 / 合同动作 / 机会）；只读，不改档。 */
export function actionableKinds(save) {
  const focus = R.getScenarioFocusEvent(rt(save)), kinds = [];
  if (R.getCurrentStoryEventActions(save).some(a => a.eventId !== ENTRY.eventId)) kinds.push('action');
  if (focus?.worldActor?.opportunities?.length || R.getTrackedStoryOpportunityActions(save).length) kinds.push('opportunity');
  if (focus?.id === 'lcq.event.s02_04' && W.getWuyuanOpenWorldSelections(save).length) kinds.push('local');
  return kinds;
}

/** 一步真实推进（照抄秦夹具生成器 step；去掉秦关特判，返回 { save, kind }）。 */
export function step(save, mods, n) {
  const state = rt(save), focus = R.getScenarioFocusEvent(state);
  assert.ok(!state.gameOver, `unexpected ending at ${state.modId}`);
  if (state.nextStageReadyId) {
    const result = I.transitionToNextScenarioStage(save, mods);
    assert.ok(result.ok, result.reason);
    return { save: result.saveData, kind: 'stage' };
  }
  // 同 freshPrologueCheckpoint：s02_01 接下整份差事走正式机会动作；s02_04 先经正式选择器去点心铺，再结算点心铺问题动作。
  if (focus?.id === 'lcq.event.s02_01') {
    R.trackStoryOpportunity(save, 'opportunity.lcq.s02_01.take_full_mandate');
    const choice = R.getTrackedStoryOpportunityActions(save)[0];
    if (choice) {
      R.recordStoryOpportunityStructuredAction(save, choice);
      return { save: R.advanceScenarioRuntime(save).saveData, kind: 'opportunity:s02_01' };
    }
  }
  if (focus?.id === 'lcq.event.s02_04') {
    const local = W.getWuyuanOpenWorldSelections(save).find(a => a.kind === 'problem_action')
      || W.resolveWuyuanOpenWorldSelectionFromText(save, '我去点心铺')
      || W.getWuyuanOpenWorldSelections(save).find(a => a.identityId === 'lcq.route.wuyuan.arrive_market');
    if (local) {
      W.settleWuyuanOpenWorldSelection(save, local);
      return { save: R.advanceScenarioRuntime(save).saveData, kind: 'local:s02_04' };
    }
  }
  // 秦口信是可忽略的探索动作，主链推进不代选。
  let kind;
  const actions = R.getCurrentStoryEventActions(save).filter(a => a.eventId !== ENTRY.eventId);
  const action = actions.find(a => focus?.playerCompletionContract?.actions.some(c => c.id === a.actionId))
    || actions.find(a => a.actionId.startsWith('travel:')) || actions[0];
  if (action) {
    const receipt = R.recordStoryEventStructuredAction(save, action);
    assert.ok(receipt.attempted, JSON.stringify({ action, receipt }));
    kind = 'action';
  } else {
    const opportunity = focus?.worldActor?.opportunities?.[0];
    if (opportunity) R.trackStoryOpportunity(save, opportunity.id);
    const choice = R.getTrackedStoryOpportunityActions(save)[0];
    if (choice) {
      const receipt = R.recordStoryOpportunityStructuredAction(save, choice);
      assert.ok(receipt.progressed, JSON.stringify(receipt));
      kind = 'opportunity';
    } else {
      kind = 'wait'; // 世界角色/画外拍的正常时钟推进；不补写事件完成。
    }
  }
  T.settleActionTime(save, { action_time: { tier: '片刻' } }, { timeActionId: `mainline-walk:${n}` }, null, false, false);
  return { save: R.advanceScenarioRuntime(save).saveData, kind };
}

/** rail 结算口径同 heimohaiFestival.finalStageComplete（完成 / 场外结算 / .void）。返回未结算的拍。 */
export function unsettledRailBeats(state) {
  const rail = CR.getCanonRailProfile(state);
  if (!rail?.orderedEventIds?.length) return null;
  return rail.orderedEventIds.filter(id => {
    if (state.completedEventIds.includes(id) || (state.offscreenResolvedEventIds || []).includes(id)) return false;
    const condition = state.events.find(e => e.id === id)?.completion?.[0];
    return !(condition?.path?.startsWith('flags.') && condition.path.endsWith('.done')
      && state.flags[condition.path.slice('flags.'.length).replace(/\.done$/, '.void')] === true);
  });
}

/** 默认主链期望序列：从 startId 沿 manifest.nextStageId，跳过隔离关（与 transitionScenarioStage 同口径）。 */
export function expectedMainline(mods, startId) {
  const byId = new Map(mods.map(m => [m.manifest.id, m]));
  const visited = [], skipped = [], seen = new Set();
  for (let id = startId; id && byId.has(id) && !seen.has(id); id = byId.get(id).manifest.nextStageId) {
    seen.add(id);
    (CR.isDefaultLineQuarantinedStageId(id) ? skipped : visited).push(id);
  }
  return { visited, skipped };
}

/**
 * 从正式新档沿主链推进。停于：终关 rail 走完（done）/ 同一关连续 stallLimit 步无结算进展（stuck）/ 抛错（error）/ 总步数上限（limit）。
 * 每关记账：进入时全局步序号 / 关内回合（worldTurn，切关重置为 1）/ 游戏时钟、离关时回合、进入时可执行动作种类、步数、动作种类计数、离关时完成数、离关前 rail 未结算拍、离关前 nextStageReadyId。
 */
export async function walkMainline({ finalStageId, maxSteps = 6000, stallLimit = 80 } = {}) {
  return withFixedHost(async () => {
    const mods = await loadMainlineMods();
    let save = formalNewSave(mods.find(m => m.manifest.id === 'lcq.stage_01'));
    const stages = [];
    let n = 0;
    const enter = s => stages.push({ id: rt(s).modId, enterStep: n, enterTurn: rt(s).worldTurn ?? null, enterTime: { ...s.元数据.时间 },
      entryActionable: actionableKinds(s), exitTurn: null,
      steps: 0, kinds: {}, completed: 0, offscreen: 0, railLength: CR.getCanonRailProfile(rt(s))?.orderedEventIds?.length ?? 0,
      unsettledAtExit: null, readyAtExit: null, nextStageIdAtExit: null });
    enter(save);
    let outcome = 'limit', error = null, stall = 0, progressKey = '';
    for (; n < maxSteps; n++) {
      const cur = stages.at(-1), state = rt(save);
      if (state.modId === finalStageId && unsettledRailBeats(state)?.length === 0) { outcome = 'done'; break; }
      if (state.nextStageReadyId) Object.assign(cur, { unsettledAtExit: unsettledRailBeats(state), readyAtExit: state.nextStageReadyId, nextStageIdAtExit: state.nextStageId ?? null });
      let r;
      try { r = step(save, mods, n); } catch (e) { outcome = 'error'; error = e; break; }
      save = r.save;
      cur.steps++;
      cur.kinds[r.kind] = (cur.kinds[r.kind] || 0) + 1;
      if (r.kind === 'stage') { stall = 0; progressKey = ''; enter(save); continue; }
      const s = rt(save);
      cur.exitTurn = s.worldTurn ?? null;
      cur.completed = s.completedEventIds.length;
      cur.offscreen = (s.offscreenResolvedEventIds || []).length;
      const key = `${s.completedEventIds.length}/${cur.offscreen}/${(unsettledRailBeats(s) || []).length}/${s.nextStageReadyId || ''}`;
      if (key === progressKey) { if (++stall >= stallLimit) { outcome = 'stuck'; break; } } else { stall = 0; progressKey = key; }
    }
    const s = rt(save), focus = R.getScenarioFocusEvent(s);
    const stop = { outcome, steps: n, stage: s.modId, focus: focus?.id ?? null, unsettled: unsettledRailBeats(s),
      actionable: actionableKinds(save), activeEventIds: [...s.activeEventIds], gameOver: !!s.gameOver,
      error: error ? String(error?.stack || error).split('\n').slice(0, 4).join('\n') : null };
    return { save, mods, stages, stop };
  });
}
