// tests/loadReconcileChain.test.mjs 的辅助模块（非 *.test.mjs，npm test 不单独跑它）。
//
// 为什么要有它：src/modules/scenarioMods/builtins/index.ts 用 webpack 才有的 require.context 聚合 data/*.json，
// Node 下 tests/loadTs.mjs 的 jiti 加载它会抛错，runtime.ts 的 getReconcileDeps() 因此记 LCQ-SAV-044 并返回 null，
// advanceScenarioRuntime 里的 reconcileSaveWithRegistry（读档对账）整段 no-op；beatProgress / naturalIntentRouter /
// strictInitializer 懒加载 builtins 的地方同样走降级分支。
//
// 做法（不改 src）：本模块自建一个 jiti 实例，transform 钩子只在编译 builtins/index.ts 时，在模块体最前面给该模块
// 自己的 require 补一个 context 方法（只服务 './data' 非递归，其余参数直接抛错）。index.ts 其余代码原样执行：
// overlay（applyContentPackOverlays）→ resolveScenarioContent → resolveScenarioCharacters → 并上 CONTENT_PACKS.stages → 排序，
// 没有任何等价重写。JSON 用同一个 require 读入，与 loadRepairs.ts 静态 import 的 data JSON 是同一模块对象（与 webpack 一致）。
//
// 不泄漏：npm test 是 node --test（每个测试文件一个子进程）；本 jiti 关掉 fsCache（不读也不写 node_modules/.cache/jiti，
// 否则带 shim 的编译结果会按源码哈希被别的进程的 loadTs 命中）；shim 只挂在本进程这一个模块的 require 函数上。
// 本进程里不要再用 tests/loadTs.mjs 加载 src（moduleCache 共用 Node require.cache，会混进两套实例）。
import { createJiti } from 'jiti';
import { createRequire, register } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

// musicLibrary.ts 直接 import 曲目 .mp3（webpack 资源）；Node 下只把它当成 URL 字符串模块（同 qinReplayFixtures.test.mjs）。
register('data:text/javascript,' + encodeURIComponent(
  "export async function load(url, context, next) { if (url.endsWith('.mp3')) return { format: 'module', source: 'export default ' + JSON.stringify(url), shortCircuit: true }; return next(url, context); }"));
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };

const req = createRequire(import.meta.url);
// jiti 默认 transform 就是 dist/babel.cjs（lib/jiti.mjs 的 lazyTransform）；包 exports 没导出它，按文件路径取。
const babelTransform = req(join(dirname(req.resolve('jiti')), '../dist/babel.cjs'));
const src = p => fileURLToPath(new URL(`../src/${p}`, import.meta.url));
export const BUILTINS_INDEX = src('modules/scenarioMods/builtins/index.ts');
export const BUILTINS_DATA_DIR = src('modules/scenarioMods/builtins/data');

const CONTEXT_SHIM = [
  'require.context = function loadReconcileChainContext(dir, deep, re) {',
  "  if (dir !== './data' || deep !== false) throw new Error('loadReconcileChain shim 只服务 builtins/data');",
  "  const fs = require('node:fs'), path = require('node:path'), abs = path.join(__dirname, 'data');",
  "  const keys = fs.readdirSync(abs).filter(f => re.test(f)).sort().map(f => './' + f);",
  '  const ctx = key => require(path.join(abs, key.slice(2)));',
  '  ctx.keys = () => keys.slice();',
  '  return ctx;',
  '};',
].join('\n');

/** 本进程里 builtins/index.ts 被编译（并补上 require.context）的次数；自检用。 */
export const shimStats = { builtinsCompiled: 0 };
const DISABLE_SHIM = process.env.LOAD_RECONCILE_CHAIN_NO_SHIM === '1'; // 只给灵敏度自检用：关掉后应当变红

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  fsCache: false,
  alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) },
  transform(opts) {
    const result = babelTransform(opts);
    if (opts.filename === BUILTINS_INDEX && !DISABLE_SHIM) {
      shimStats.builtinsCompiled += 1;
      result.code = result.code.replace(/^("use strict";)?/, head => `${head}\n${CONTEXT_SHIM}\n`);
    }
    return result;
  },
});
export const load = rel => jiti.import(src(rel));

export const R = await load('modules/scenarioMods/runtime.ts');
export const W = await load('modules/scenarioMods/wuyuanOpenWorldSlice.ts');
export const BP = await load('modules/scenarioMods/beatProgress.ts');
// 对照组（不补 require.context）下内置关加载不了，clickButton 的合同迁移那一步按无内置关跳过。
const BUILTINS = DISABLE_SHIM ? null : await load('modules/scenarioMods/builtins/index.ts');
export const repairs = await load('modules/scenarioMods/loadRepairs.ts');
export const fallback = await load('utils/saveLoadFallback.ts');
export const { unwrapDadBundle } = await load('utils/dadBundle.ts');
export const { activeScene } = await load('modules/sceneModule/host/ext.ts');
export const { logStore } = await load('modules/diagnostics/store.ts');

export const rt = save => save.世界.状态.剧本模组;
export const quiet = fn => {
  const keys = ['log', 'info', 'warn', 'error', 'debug'], orig = keys.map(k => console[k]);
  keys.forEach(k => { console[k] = () => {}; });
  try { return fn(); } finally { keys.forEach((k, i) => { console[k] = orig[i]; }); }
};

/** 夹具 → 存档对象：DAD bundle / {type,saves} 走 unwrapDadBundle；{source,save} 取 save；load-reconcile/ 的 {说明,来源,存档} 取 存档；.gz 先解压。 */
export function readFixtureSave(relPath) {
  const url = new URL(`./fixtures/${relPath}`, import.meta.url);
  const raw = relPath.endsWith('.gz') ? JSON.parse(gunzipSync(readFileSync(url))) : JSON.parse(readFileSync(url, 'utf8'));
  if (raw.save && raw.save.世界) return raw.save;
  if (raw.存档 && raw.来源) return raw.存档;
  if (raw.type === 'saves') return unwrapDadBundle(raw).payload.saves[0].存档数据;
  return raw;
}

/** 合同哈希：逐字照抄 runtime.ts 的 stableOpportunityContract + stableContractHash（未导出）。测试里用按钮带的 contractHash 反向核对，防止照抄版漂移。 */
const IGNORED_KEYS = ['cast', 'sceneLocation', 'sceneObjective', 'dayPart', 'fixedFacts', 'factChecks', 'forbidden', 'fallbackText', 'previousBeat', 'ledgerEffects', 'forceFixed'];
function stableOpportunityContract(value) {
  if (Array.isArray(value)) return `[${value.map(stableOpportunityContract).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([l], [r]) => l < r ? -1 : l > r ? 1 : 0).map(([k, v]) => `${k}:${stableOpportunityContract(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export function contractHash(contract) {
  let result = 2166136261;
  for (const char of stableOpportunityContract(JSON.parse(JSON.stringify(contract, (key, value) => IGNORED_KEYS.includes(key) ? undefined : value)))) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
}

export const hasProgress = state => Boolean((state?.attemptCount || 0) > 0 || state?.preparations?.length || state?.attempts?.length);

/**
 * 读档：与 characterStore.loadGame 同序的纯函数段——落盘形状（JSON 往返）→ validateLoadedSave → applyLoadRepairs。
 * （migrateNarrativeDetailOnLoad 走 IndexedDB 本地副本，Node 下不可用，夹具里也没有要搬的正文。）store 读档时不跑 advanceScenarioRuntime。
 */
export async function loadLikeGame(save, label) {
  const disk = JSON.parse(JSON.stringify(save));
  const outcome = await quiet(() => fallback.validateLoadedSave('load-reconcile', label, disk, { keep: 0, readBackup: async () => null }));
  if (outcome.status !== 'ok') throw new Error(`${label} 读档校验未通过：${outcome.status}`);
  quiet(() => repairs.applyLoadRepairs(outcome.data));
  return outcome.data;
}

/**
 * 界面取按钮：MainGamePanel.scenarioEngineActionOptions —— 有场面时不出按钮；否则在副本上 advanceScenarioRuntime（真实对账在这里跑），
 * 再 getCurrentStoryEventActions(副本)；五原开放世界有本地选择时隐去 s02_04 的宽泛按钮、改出本地选择。
 */
export function uiButtons(live) {
  if (activeScene(live)) return { view: null, scene: true, eventActions: [], openWorld: [] };
  const view = quiet(() => R.advanceScenarioRuntime(live).saveData);
  const openWorld = quiet(() => W.getWuyuanOpenWorldSelections(view));
  const eventActions = quiet(() => R.getCurrentStoryEventActions(view))
    .filter(action => !(openWorld.length && action.eventId === 'lcq.event.s02_04'));
  return { view, scene: false, eventActions, openWorld };
}

/** 选「当前拍」的按钮：焦点事件合同里的动作优先；s02_04 走五原本地选择（同 tests/mainlineWalker.mjs 的取法）；否则第一个。 */
export function pickButton(buttons) {
  const focus = buttons.view && R.getScenarioFocusEvent(rt(buttons.view));
  const own = buttons.eventActions.find(a => focus?.playerCompletionContract?.actions.some(c => c.id === a.actionId) && a.eventId === focus.id);
  if (own) return { kind: 'event', selection: own, focusId: focus.id };
  const local = buttons.openWorld.find(a => a.kind === 'problem_action')
    || buttons.openWorld.find(a => a.identityId === 'lcq.route.wuyuan.arrive_market') || buttons.openWorld[0];
  if (local) return { kind: 'open_world', selection: local, focusId: focus?.id ?? null };
  if (buttons.eventActions[0]) return { kind: 'event', selection: buttons.eventActions[0], focusId: focus?.id ?? null };
  return null;
}

/**
 * 点按钮：MainGamePanel 发送前在 live 上 reconcileNaturalIntentMetadata + 合同迁移表（migrateBatch6TextContracts，2026-11-12 起）+ applyBeatDeadlines →
 * AIBS processGmResponse 在 live 上落账（事件按钮 recordStoryEventStructuredAction / 五原本地选择 settleWuyuanOpenWorldSelection）→
 * AIBS 回合尾 advanceScenarioRuntime(live)。live 读档后从没跑过 advance（与游戏相同）。
 */
export function clickButton(live, button) {
  return quiet(() => {
    R.reconcileNaturalIntentMetadata(live);
    const canonical = BUILTINS?.BUILTIN_SCENARIO_MODS.find(mod => mod.manifest?.id === rt(live)?.modId)?.scenario.events;
    if (rt(live) && canonical) R.migrateBatch6TextContracts(rt(live), canonical);
    BP.applyBeatDeadlines(rt(live)?.events);
    const receipt = button.kind === 'open_world'
      ? W.settleWuyuanOpenWorldSelection(live, button.selection)
      : R.recordStoryEventStructuredAction(live, button.selection);
    const after = R.advanceScenarioRuntime(live).saveData;
    return { receipt, after };
  });
}

/** 内置关数（data/*.json）——自检 BUILTIN_SCENARIO_MODS 数量用。 */
export const builtinDataFileCount = () => readdirSync(BUILTINS_DATA_DIR).filter(f => f.endsWith('.json')).length;
