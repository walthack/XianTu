// 自由行动测试夹具：清羽记开局试玩存档，把指定人物放进“在场名单”（走真实的 readLocalMemoryCapsule），骰子用 testOutcome 固定。
import { readFile } from 'node:fs/promises';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';

if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), clear: () => values.clear(),
  };
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (!globalThis.window.location) globalThis.window.location = { hostname: 'localhost', href: 'http://localhost/' };

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } });
export const load = rel => jiti.import(new URL(rel, import.meta.url).pathname);

export const DUAN_QIANG = 'lcq.character.duan_qiang';
export const WANG_ZHE = 'lcq.character.wang_zhe';
export const NING_YU = 'liuchao.character.ning_yu';
export const XIE_YI = 'liuchao.character.xie_yi';

const stage01 = JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url), 'utf8'));
const playtest = await load('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
const quiet = fn => { const saved = {}; for (const k of ['log', 'info', 'warn', 'debug']) { saved[k] = console[k]; console[k] = () => {}; } try { return fn(); } finally { Object.assign(console, saved); } };

export const mods = {
  config: await load('../src/modules/scenarioMods/freeAction/config.ts'),
  ticket: await load('../src/modules/scenarioMods/freeAction/ticket.ts'),
  settle: await load('../src/modules/scenarioMods/freeAction/settle.ts'),
  plan: await load('../src/modules/scenarioMods/freeAction/plan.ts'),
  turn: await load('../src/modules/scenarioMods/freeAction/turn.ts'),
  facts: await load('../src/modules/scenarioMods/freeAction/facts.ts'),
  state: await load('../src/modules/scenarioMods/freeAction/state.ts'),
  memory: await load('../src/modules/scenarioMods/freeAction/memory.ts'),
  actorStatus: await load('../src/modules/scenarioMods/freeAction/actorStatus.ts'),
  judgement: await load('../src/utils/judgementEngine.ts'),
  numbers: await load('../src/modules/sceneModule/numbers.ts'),
  affinity: await load('../src/modules/scenarioMods/ledger/affinityIdentity.ts'),
  card: await load('../src/modules/scenarioMods/npcCardLayer.ts'),
  packet: await load('../src/modules/scenarioMods/legacyNarratorPacket.ts'),
  levels: await load('../src/modules/scenarioMods/characterLevels.ts'),
  levelMath: await load('../src/modules/sceneModule/levels.ts'),
  injuries: await load('../src/modules/sceneModule/host/injuries.ts'),
  statusRead: await load('../src/modules/scenarioMods/actorStatusRead.ts'),
  router: await load('../src/modules/scenarioMods/naturalIntentRouter.ts'),
  realm: await load('../src/utils/realmUtils.ts'),
  diag: await load('../src/services/requestLifecycleDiagnostics.ts'),
};

export const runtimeOf = save => save.世界.状态.剧本模组;
export const profileOf = (save, id) => mods.affinity.relationshipOf(save, id).profile;

/**
 * 清羽记开局存档：当前事件 s01_02，在场 = 段强 + present 里的人（经事件 relatedCharacterIds，叙事真正用的那条路）。
 * options.favor：{id: 好感}；options.chapter：让 namingChapter 返回该章（时点级数表按章取行）；
 * options.realm：玩家境界名；options.items：{id: 背包条目}。
 */
export function makeSave({ present = [], favor = {}, chapter, realm, items = {} } = {}) {
  const save = quiet(() => playtest.createQingyuOpeningPlaytestSave(structuredClone(stage01)));
  const runtime = runtimeOf(save);
  runtime.activeEventIds = ['lcq.event.s01_02'];
  runtime.events.find(e => e.id === 'lcq.event.s01_02').relatedCharacterIds = ['liuchao.character.cheng_zongyang', DUAN_QIANG, ...present];
  for (const [id, value] of Object.entries(favor)) profileOf(save, id).好感度 = value;
  if (chapter) {
    runtime.events.push({ id: 'fake.chapter.anchor', axisAnchor: `第${chapter}章` });
    (runtime.completedEventIds ||= []).push('fake.chapter.anchor');
  }
  if (realm) save.角色.属性.境界.名称 = realm;
  Object.assign((save.角色.背包 ||= { 物品: {} }).物品 ||= {}, items);
  save.系统 ||= {};
  save.系统.历史 ||= {};
  save.系统.历史.叙事 ||= [];
  return save;
}

/** 推进一个叙事回合（getNarrativeTurn = 历史叙事条数），并模拟回合推进取走好感 grant。 */
export const advanceTurn = save => {
  save.系统.历史.叙事.push({ role: 'assistant', content: '…' });
  delete runtimeOf(save).pendingLineAffinityGrants; // 真实回合里 advanceScenarioRuntime 会取走并清空
  return save;
};

export const ticket = (actionClass, variant, targetId, extra = {}) => ({
  actionClass, variant, targetId, degree: 'normal', performed: 'yes', evidence: '…', itemId: null, ...extra,
});

/** 签发 → 用固定结果档确认 → 回执取票结算。返回 { prepared, resolution, result }。 */
export function runJudged(save, tk, outcome, deps = {}) {
  const prepared = mods.plan.prepareFreeAction(save, tk, deps);
  if (prepared.kind !== 'issued') return { prepared };
  const resolution = mods.judgement.resolvePendingJudgement(save, prepared.proposal.id, { currentTurn: 1, testOutcome: outcome });
  const result = mods.settle.settleFromResolution(save, resolution, deps);
  return { prepared, resolution, result };
}

export const itemEntry = (id, extra = {}) => ({ 物品ID: id, 名称: id, 类型: '丹药', 数量: 1, 已装备: false, ...extra });
