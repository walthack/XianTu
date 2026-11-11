// 阶段 2b 回放对照（phase2 plan「2b 先补的夹具」）：大祭改成包声明的通用世界事件（worldEvents）之前，
// 在旧代码（heimohaiFestival.ts 直接读 numbers 的 story.lineCompass.festival）上跑出 festivalView 输出、
// startHeimohaiFestival 的返回与执行前后的存档 diff，冻结在 tests/fixtures/festival-replay/expected.json；重构后一个字节都不许改。
// 六种情形：终关 rail 未走完（只出 warning）；终关 rail 走完（available）；秦内、从地图入口进来（blocked，可用性取 mapEntryResume.runtime，
// 另加 rail 未走完的变体）；已开祭未入秦（秦线卡消失、口信不再投递、qinEntryReady=false、口信拍已删）；已开祭、之前入过秦（秦不关闭）；
// 已开祭的档 JSON 往返再读回，view 不变（同 tests/mainlineWalkToEnding.test.mjs 的 d 段）。
// 期望文件只在重构前的旧代码上生成：FESTIVAL_REPLAY_WRITE=1 node --test tests/festivalReplay.test.mjs。以后改期望等于改行为，须另行说明。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { register } from 'node:module';

// musicLibrary.ts 直接 import 曲目 .mp3；Node 下只把它当成 URL 字符串模块（同 tests/stage2CompassGolden.test.mjs）。
register('data:text/javascript,' + encodeURIComponent(
  "export async function load(url, context, next) { if (url.endsWith('.mp3')) return { format: 'module', source: 'export default ' + JSON.stringify(url), shortCircuit: true }; return next(url, context); }"));
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const { loadTs } = await import('./loadTs.mjs');
const quiet = async fn => { const k = ['log', 'info', 'warn', 'error', 'debug'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };

const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const I = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const P = await loadTs('../src/modules/contentPacks/index.ts');
const L = await loadTs('../src/modules/scenarioMods/ledgerConditions.ts');
const ME = await loadTs('../src/modules/scenarioMods/mapEntries.ts');
const LC = await loadTs('../src/modules/scenarioMods/lineCompass.ts');
const CR = await loadTs('../src/modules/scenarioMods/canonRail.ts');
const MT = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
const F = await loadTs('../src/modules/scenarioMods/heimohaiFestival.ts');

const EXPECTED_URL = new URL('./fixtures/festival-replay/expected.json', import.meta.url);
const POINTER = '<<COMPASS_POINTER>>';
const QIN_ENTRY = P.CONTENT_PACKS.mapEntries.find(e => e.id === 'qin');
const rt = save => save.世界.状态.剧本模组;
const plain = v => (v === undefined ? { $undefined: true } : JSON.parse(JSON.stringify(v)));

/** 存档 diff：按键／下标递归，记 [路径, 旧值, 新值]；缺失记 {$missing:true}。 */
function diff(a, b, path = '', out = []) {
  const MISSING = { $missing: true };
  const isObj = v => v !== null && typeof v === 'object';
  if (isObj(a) && isObj(b) && Array.isArray(a) === Array.isArray(b)) {
    const keys = Array.isArray(a) ? [...Array(Math.max(a.length, b.length)).keys()].map(String) : [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const k of keys) {
      const p = path ? `${path}.${k}` : k;
      if (!(k in a)) out.push([p, MISSING, b[k]]);
      else if (!(k in b)) out.push([p, a[k], MISSING]);
      else diff(a[k], b[k], p, out);
    }
  } else if (JSON.stringify(a) !== JSON.stringify(b)) out.push([path, a, b]);
  return out;
}

// 合成档：同 tests/qinEntryWiring.test.mjs 的 finalSave（南荒／晋／宋三线收束，人在唐终关）
const stage07 = JSON.parse(readFileSync(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json', import.meta.url)));
const finalSource = JSON.parse(readFileSync(new URL('../src/modules/scenarioMods/builtins/data/lyg.shituolin_endgame.json', import.meta.url)));
const closers = ['nanhuang', 'jin', 'song'].map(id => P.CONTENT_PACKS.lineCompass.lines.find(l => l.lineId === id).closedWhen[0].path.slice(5));
function finalSave(complete = true) {
  const init = I.buildStrictScenarioInitialization(stage07);
  const s = { 元数据: { 时间: { 年: 220, 月: 1, 日: 1, 小时: 12, 分钟: 0 } }, 角色: { 身份: {}, 属性: {}, 位置: init.initialLocation, 背包: { 金钱: {}, 物品: {} } }, 社交: { 关系: {} }, 系统: { 扩展: {} }, 世界: { 状态: { 剧本模组: null } } };
  s.世界.状态.剧本模组 = I.buildStrictScenarioInitialization(finalSource).runtimeState;
  rt(s).completedEventIds = [...closers, ...(complete ? CR.getCanonRailProfile(rt(s)).orderedEventIds : [])];
  return s;
}
const advance = s => quiet(async () => R.advanceScenarioRuntime(s));
async function enterQin(s) {
  const selection = MT.selectMapTravel(s, QIN_ENTRY.locationId);
  assert.ok(selection, '应能从地图入秦');
  assert.equal(await quiet(async () => MT.settleMapTravel(s, selection)), true);
  return s;
}

/** 读取点：大祭视图、秦是否被关、qinEntryReady、地图入口、右栏线卡、再推进一次时的口信投递。 */
async function probe(save) {
  const s = rt(save);
  const next = await advance(structuredClone(save));
  return plain({
    view: F.festivalView(save),
    qinClosedByFestival: F.qinClosedByFestival(save),
    lineClosedByWorldEvent: F.lineClosedByWorldEvent(save, s, 'qin'),
    qinEntryReady: L.resolveLedgerPath('compass.qinEntryReady', s, save).value,
    mapEntryReady: ME.mapEntryReady(save, QIN_ENTRY),
    mapSelectable: MT.selectMapTravel(structuredClone(save), QIN_ENTRY.locationId) !== undefined,
    messageActive: s.activeEventIds.includes(QIN_ENTRY.eventId),
    messageInChapters: s.chapters.some(c => c.eventIds.includes(QIN_ENTRY.eventId)),
    mapEntryMessages: save.系统?.扩展?.mapEntryMessages,
    lineCompass: LC.lineCompassView(save, { focusEventId: R.getScenarioFocusEvent(s)?.id, atLocationId: save.角色.位置?.locationId, compassPointer: () => POINTER }),
    qinEntryHint: LC.lineCompassView(save, {}).entryHints.some(h => h.lineId === 'qin'),
    nextAdvance: { messageTransitions: next.transitions.filter(t => t.id === QIN_ENTRY.eventId), messageActive: rt(next.saveData).activeEventIds.includes(QIN_ENTRY.eventId) },
  });
}
/** 依次试 tick 来源、错 actionId、玩家点击，各记返回与存档 diff；最后记点击后的读取点。 */
async function attempt(save) {
  const out = { before: await probe(save), tries: [] };
  for (const choice of [{ source: 'tick', actionId: F.FESTIVAL.actionId }, { source: 'player', actionId: 'not_the_festival' }, { source: 'player', actionId: F.FESTIVAL.actionId }]) {
    const prev = plain(save);
    const result = F.startHeimohaiFestival(save, choice);
    out.tries.push({ choice, result: plain(result), diff: diff(prev, plain(save)) });
  }
  // 重复点击幂等
  const prev = plain(save);
  out.repeat = { result: plain(F.startHeimohaiFestival(save, { source: 'player', actionId: F.FESTIVAL.actionId })), diff: diff(prev, plain(save)) };
  out.after = await probe(save);
  return out;
}

const CASES = {
  'final-rail-unsettled': async () => attempt(finalSave(false)),
  'final-rail-settled': async () => attempt(finalSave(true)),
  'qin-from-entry': async () => attempt(await enterQin((await advance(finalSave(true))).saveData)),
  'qin-from-entry-rail-unsettled': async () => attempt(await enterQin((await advance(finalSave(false))).saveData)),
  'started-before-qin': async () => attempt((await advance(finalSave(true))).saveData),
  // 已知秦（口信拍已完成、编年史有记录）：开祭前右栏有秦提示，开祭后消失（同 qinEntryWiring「已知秦提示在开祭后隐藏」）
  'started-before-qin-known': async () => {
    const s = finalSave(true);
    rt(s).completedEventIds.push(QIN_ENTRY.eventId);
    rt(s).chronicle = [{ id: `chronicle.${rt(s).modId}.${QIN_ENTRY.eventId}`, stageId: rt(s).modId, type: 'event' }];
    return attempt(s);
  },
  'started-after-qin': async () => {
    const s = (await advance(finalSave(true))).saveData;
    (rt(s).chronicle ||= []).push({ id: 'visited-qin', stageId: QIN_ENTRY.stageId });
    return attempt(s);
  },
  'started-reread': async () => {
    const s = (await advance(finalSave(true))).saveData;
    assert.equal(F.startHeimohaiFestival(s, { source: 'player', actionId: F.FESTIVAL.actionId }).ok, true);
    const reread = JSON.parse(JSON.stringify(s));
    assert.deepEqual(F.festivalView(reread), F.festivalView(s));
    return { saved: await probe(s), reread: await probe(reread) };
  },
};

async function actual() {
  const out = { FESTIVAL: plain(F.FESTIVAL), cases: {} };
  for (const [key, run] of Object.entries(CASES)) out.cases[key] = await run();
  return out;
}

if (process.env.FESTIVAL_REPLAY_WRITE === '1') {
  test('生成 festival-replay 期望（只在重构前的旧代码上跑）', async () => {
    mkdirSync(new URL('./fixtures/festival-replay/', import.meta.url), { recursive: true });
    writeFileSync(EXPECTED_URL, `${JSON.stringify(await actual(), null, 1)}\n`);
  });
} else {
  const expected = JSON.parse(readFileSync(EXPECTED_URL, 'utf8'));
  const got = await actual();
  test('FESTIVAL 兼容导出：10 个键同名同值', () => {
    assert.deepEqual(Object.keys(got.FESTIVAL).sort(), Object.keys(expected.FESTIVAL).sort());
    assert.deepEqual(got.FESTIVAL, expected.FESTIVAL);
  });
  for (const key of Object.keys(CASES)) test(`大祭回放：${key}`, () => assert.deepEqual(got.cases[key], expected.cases[key]));
  test('期望覆盖的情形与用例一致', () => assert.deepEqual(Object.keys(expected.cases), Object.keys(CASES)));
}
