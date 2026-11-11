// 阶段 2a 黄金对照（phase2 plan「先补的快照」）：qinEntryReady 改由秦包声明、计入线／失败收束搬进各线 nation-lines.json 之前，
// 在旧代码上跑出的派生读取点结果，内联为期望；重构后这些期望一个字节都不许改。
// 旧档（qin-replay 4 份、lines-replay 12 份）各自走真实读档链（同 tests/qinReplayFixtures.test.mjs 的 loadLikeGame），
// 记 compass.qinEntryReady、compass.anyLineClosed、nationClosedLineCount、7 条国家线 lineClosed、mapEntryReady(save, qin)、右栏线卡；
// 另两种合成档：终关开大祭后未入秦（qinEntryReady 为 false）、开祭前已入秦并返回（不按未入秦关闭）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

// musicLibrary.ts 直接 import 曲目 .mp3（webpack 资源）；Node 下只把它当成 URL 字符串模块（同 tests/qinReplayFixtures.test.mjs）。
register('data:text/javascript,' + encodeURIComponent(
  "export async function load(url, context, next) { if (url.endsWith('.mp3')) return { format: 'module', source: 'export default ' + JSON.stringify(url), shortCircuit: true }; return next(url, context); }"));
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const { loadTs } = await import('./loadTs.mjs');
const quiet = async fn => { const k = ['log', 'info', 'warn', 'error', 'debug'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };

const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const I = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const P = await loadTs('../src/modules/contentPacks/index.ts');
const L = await loadTs('../src/modules/scenarioMods/ledgerConditions.ts');
const O = await loadTs('../src/modules/scenarioMods/lineOutcomes.ts');
const ME = await loadTs('../src/modules/scenarioMods/mapEntries.ts');
const LC = await loadTs('../src/modules/scenarioMods/lineCompass.ts');
const CR = await loadTs('../src/modules/scenarioMods/canonRail.ts');
const F = await loadTs('../src/modules/scenarioMods/heimohaiFestival.ts');
const { unwrapDadBundle } = await loadTs('../src/utils/dadBundle.ts');
const { isSaveDataV3, migrateSaveDataToLatest } = await loadTs('../src/utils/saveMigration.ts');
const { assertEntitySaveFormat } = await loadTs('../src/modules/scenarioMods/entitySaveFormat.ts');
const fallback = await loadTs('../src/utils/saveLoadFallback.ts');
const repairs = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
const calendar = await loadTs('../src/utils/calendarMigration.ts');

const POINTER = '<<COMPASS_POINTER>>';
const LINES = ['nanhuang', 'jin', 'song', 'han', 'tang', 'qin', 'taiquan'];
const QIN_ENTRY = P.CONTENT_PACKS.mapEntries.find(e => e.id === 'qin');
const rt = save => save.世界.状态.剧本模组;

function importBundle(bundle) {
  const raw = unwrapDadBundle(bundle).payload.saves[0].存档数据;
  return isSaveDataV3(raw) ? raw : migrateSaveDataToLatest(raw).migrated;
}
/** 游戏读档链：JSON 往返 → validateLoadedSave → applyLoadRepairs → assertEntitySaveFormat → migrateCalendar（同 qinReplayFixtures）。 */
async function loadLikeGame(save, label) {
  const disk = JSON.parse(JSON.stringify(save));
  return quiet(async () => {
    const outcome = await fallback.validateLoadedSave('stage2-golden', label, disk, { keep: 0, readBackup: async () => null });
    assert.equal(outcome.status, 'ok', `${label} 读档校验未通过`);
    repairs.applyLoadRepairs(outcome.data);
    assertEntitySaveFormat(outcome.data);
    calendar.migrateCalendar(outcome.data);
    return outcome.data;
  });
}
const fixture = (dir, key) => JSON.parse(readFileSync(new URL(`./fixtures/${dir}/${key}.json`, import.meta.url), 'utf8'));

function snapshot(save) {
  const s = rt(save);
  return {
    qinEntryReady: L.resolveLedgerPath('compass.qinEntryReady', s, save).value,
    anyLineClosed: L.resolveLedgerPath('compass.anyLineClosed', s, save).value,
    nationClosedLineCount: O.nationClosedLineCount(s),
    lineClosed: Object.fromEntries(LINES.map(id => [id, O.lineClosed(id, s)])),
    mapEntryReady: ME.mapEntryReady(save, QIN_ENTRY),
    lineCompass: LC.lineCompassView(save, { focusEventId: R.getScenarioFocusEvent(s)?.id, atLocationId: save.角色.位置?.locationId, compassPointer: () => POINTER }),
  };
}

// 合成档：同 tests/qinEntryWiring.test.mjs 的 finalSave（南荒／晋／宋三线收束，人在唐终关、rail 走完）
const stage07 = JSON.parse(readFileSync(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json', import.meta.url)));
const finalSource = JSON.parse(readFileSync(new URL('../src/modules/scenarioMods/builtins/data/lyg.shituolin_endgame.json', import.meta.url)));
const closers = ['nanhuang', 'jin', 'song'].map(id => P.CONTENT_PACKS.lineCompass.lines.find(l => l.lineId === id).closedWhen[0].path.slice(5));
function finalSave() {
  const init = I.buildStrictScenarioInitialization(stage07);
  const s = { 元数据: { 时间: { 年: 220, 月: 1, 日: 1, 小时: 12, 分钟: 0 } }, 角色: { 身份: {}, 属性: {}, 位置: init.initialLocation, 背包: { 金钱: {}, 物品: {} } }, 社交: { 关系: {} }, 系统: { 扩展: {} }, 世界: { 状态: { 剧本模组: null } } };
  s.世界.状态.剧本模组 = I.buildStrictScenarioInitialization(finalSource).runtimeState;
  rt(s).completedEventIds = [...closers, ...CR.getCanonRailProfile(rt(s)).orderedEventIds];
  return s;
}
const startFestival = s => F.startHeimohaiFestival(s, { source: 'player', actionId: F.FESTIVAL.actionId });

const CASES = {
  ...Object.fromEntries(['qin-before-entry', 'qin-entry-ready', 'qin-rail-mid', 'qin-rail-end']
    .map(key => [`qin-replay/${key}`, () => loadLikeGame(importBundle(fixture('qin-replay', key)), key)])),
  ...Object.fromEntries(['saiwai-mid', 'saiwai-end', 'zhaonan-mid', 'zhaonan-end', 'jin-mid', 'jin-end', 'taiquan-mid', 'taiquan-end', 'han-mid', 'han-end', 'tang-mid', 'tang-end']
    .map(key => [`lines-replay/${key}`, () => loadLikeGame(importBundle(fixture('lines-replay', key)), key)])),
  'synthetic/festival-before-qin': async () => {
    const s = await quiet(async () => R.advanceScenarioRuntime(finalSave()).saveData);
    assert.equal(startFestival(s).ok, true);
    return quiet(async () => R.advanceScenarioRuntime(s).saveData);
  },
  'synthetic/festival-after-qin': async () => {
    const s = finalSave();
    (rt(s).chronicle ||= []).push({ id: 'visited-qin', stageId: QIN_ENTRY.stageId });
    assert.equal(startFestival(s).ok, true);
    return s;
  },
};

const EXPECTED = {
  "qin-replay/qin-before-entry": {"qinEntryReady":false,"anyLineClosed":true,"nationClosedLineCount":2,"lineClosed":{"nanhuang":true,"jin":true,"song":false,"han":false,"tang":false,"qin":false,"taiquan":false},"mapEntryReady":false,"lineCompass":{"current":{"lineId":"song","name":"宋国","step":"<<COMPASS_POINTER>>","source":"focus"},"others":[{"lineId":"han","name":"汉国","locked":false,"hintLines":[]},{"lineId":"tang","name":"唐国","locked":false,"hintLines":[]},{"lineId":"taiquan","name":"太泉古阵 · 时机未到","locked":true,"hintLines":["王哲的托付还记着：「等你的修为突破六阳后，往苍澜的太泉古阵去一趟。」「如果未达六阳之境，根本无法进入太泉古阵。」六阳，差不多就是第五级坐照的修为——眼下还没到。"]}],"entryHints":[]}},
  "qin-replay/qin-entry-ready": {"qinEntryReady":true,"anyLineClosed":true,"nationClosedLineCount":3,"lineClosed":{"nanhuang":true,"jin":true,"song":true,"han":false,"tang":false,"qin":false,"taiquan":false},"mapEntryReady":true,"lineCompass":{"current":null,"others":[{"lineId":"han","name":"汉国","locked":false,"hintLines":[]},{"lineId":"tang","name":"唐国","locked":false,"hintLines":[]},{"lineId":"qin","name":"秦国","locked":false,"hintLines":[]},{"lineId":"taiquan","name":"太泉古阵 · 时机未到","locked":true,"hintLines":["王哲的托付还记着：「等你的修为突破六阳后，往苍澜的太泉古阵去一趟。」「如果未达六阳之境，根本无法进入太泉古阵。」六阳，差不多就是第五级坐照的修为——眼下还没到。"]}],"entryHints":[{"lineId":"qin","text":"去咸阳，找那个方士问问"}]}},
  "qin-replay/qin-rail-mid": {"qinEntryReady":true,"anyLineClosed":true,"nationClosedLineCount":3,"lineClosed":{"nanhuang":true,"jin":true,"song":true,"han":false,"tang":false,"qin":false,"taiquan":false},"mapEntryReady":false,"lineCompass":{"current":{"lineId":"qin","name":"秦国","step":"<<COMPASS_POINTER>>","source":"focus"},"others":[{"lineId":"han","name":"汉国","locked":false,"hintLines":[]},{"lineId":"tang","name":"唐国","locked":false,"hintLines":[]},{"lineId":"taiquan","name":"太泉古阵 · 时机未到","locked":true,"hintLines":["王哲的托付还记着：「等你的修为突破六阳后，往苍澜的太泉古阵去一趟。」「如果未达六阳之境，根本无法进入太泉古阵。」六阳，差不多就是第五级坐照的修为——眼下还没到。"]}],"entryHints":[]}},
  "qin-replay/qin-rail-end": {"qinEntryReady":true,"anyLineClosed":true,"nationClosedLineCount":3,"lineClosed":{"nanhuang":true,"jin":true,"song":true,"han":false,"tang":false,"qin":true,"taiquan":false},"mapEntryReady":false,"lineCompass":{"current":null,"others":[{"lineId":"han","name":"汉国","locked":false,"hintLines":[]},{"lineId":"tang","name":"唐国","locked":false,"hintLines":[]},{"lineId":"taiquan","name":"太泉古阵 · 时机未到","locked":true,"hintLines":["王哲的托付还记着：「等你的修为突破六阳后，往苍澜的太泉古阵去一趟。」「如果未达六阳之境，根本无法进入太泉古阵。」六阳，差不多就是第五级坐照的修为——眼下还没到。"]}],"entryHints":[]}},
  "lines-replay/saiwai-mid": {"qinEntryReady":false,"anyLineClosed":false,"nationClosedLineCount":0,"lineClosed":{"nanhuang":false,"jin":false,"song":false,"han":false,"tang":false,"qin":false,"taiquan":false},"mapEntryReady":false,"lineCompass":{"current":null,"others":[{"lineId":"nanhuang","name":"南荒","locked":false,"hintLines":[]},{"lineId":"jin","name":"晋国","locked":false,"hintLines":[]},{"lineId":"song","name":"宋国","locked":false,"hintLines":[]},{"lineId":"han","name":"汉国","locked":false,"hintLines":[]},{"lineId":"tang","name":"唐国","locked":false,"hintLines":[]},{"lineId":"taiquan","name":"太泉古阵 · 时机未到","locked":true,"hintLines":["王哲的托付还记着：「等你的修为突破六阳后，往苍澜的太泉古阵去一趟。」「如果未达六阳之境，根本无法进入太泉古阵。」六阳，差不多就是第五级坐照的修为——眼下还没到。","手头的事还没了结。至少还得先了结一处的大事，才腾得出手。"]}],"entryHints":[]}},
  "lines-replay/saiwai-end": {"qinEntryReady":false,"anyLineClosed":false,"nationClosedLineCount":0,"lineClosed":{"nanhuang":false,"jin":false,"song":false,"han":false,"tang":false,"qin":false,"taiquan":false},"mapEntryReady":false,"lineCompass":{"current":{"lineId":"nanhuang","name":"南荒","step":"","source":"recent"},"others":[{"lineId":"jin","name":"晋国","locked":false,"hintLines":[]},{"lineId":"song","name":"宋国","locked":false,"hintLines":[]},{"lineId":"han","name":"汉国","locked":false,"hintLines":[]},{"lineId":"tang","name":"唐国","locked":false,"hintLines":[]},{"lineId":"taiquan","name":"太泉古阵 · 时机未到","locked":true,"hintLines":["王哲的托付还记着：「等你的修为突破六阳后，往苍澜的太泉古阵去一趟。」「如果未达六阳之境，根本无法进入太泉古阵。」六阳，差不多就是第五级坐照的修为——眼下还没到。","手头的事还没了结。至少还得先了结一处的大事，才腾得出手。"]}],"entryHints":[]}},
  "lines-replay/zhaonan-mid": {"qinEntryReady":false,"anyLineClosed":false,"nationClosedLineCount":0,"lineClosed":{"nanhuang":false,"jin":false,"song":false,"han":false,"tang":false,"qin":false,"taiquan":false},"mapEntryReady":false,"lineCompass":{"current":{"lineId":"nanhuang","name":"南荒","step":"<<COMPASS_POINTER>>","source":"focus"},"others":[{"lineId":"jin","name":"晋国","locked":false,"hintLines":[]},{"lineId":"song","name":"宋国","locked":false,"hintLines":[]},{"lineId":"han","name":"汉国","locked":false,"hintLines":[]},{"lineId":"tang","name":"唐国","locked":false,"hintLines":[]},{"lineId":"taiquan","name":"太泉古阵 · 时机未到","locked":true,"hintLines":["王哲的托付还记着：「等你的修为突破六阳后，往苍澜的太泉古阵去一趟。」「如果未达六阳之境，根本无法进入太泉古阵。」六阳，差不多就是第五级坐照的修为——眼下还没到。","手头的事还没了结。至少还得先了结一处的大事，才腾得出手。"]}],"entryHints":[]}},
  "lines-replay/zhaonan-end": {"qinEntryReady":false,"anyLineClosed":true,"nationClosedLineCount":1,"lineClosed":{"nanhuang":true,"jin":false,"song":false,"han":false,"tang":false,"qin":false,"taiquan":false},"mapEntryReady":false,"lineCompass":{"current":null,"others":[{"lineId":"jin","name":"晋国","locked":false,"hintLines":[]},{"lineId":"song","name":"宋国","locked":false,"hintLines":[]},{"lineId":"han","name":"汉国","locked":false,"hintLines":[]},{"lineId":"tang","name":"唐国","locked":false,"hintLines":[]},{"lineId":"taiquan","name":"太泉古阵 · 时机未到","locked":true,"hintLines":["王哲的托付还记着：「等你的修为突破六阳后，往苍澜的太泉古阵去一趟。」「如果未达六阳之境，根本无法进入太泉古阵。」六阳，差不多就是第五级坐照的修为——眼下还没到。"]}],"entryHints":[]}},
  "lines-replay/jin-mid": {"qinEntryReady":false,"anyLineClosed":true,"nationClosedLineCount":1,"lineClosed":{"nanhuang":true,"jin":false,"song":false,"han":false,"tang":false,"qin":false,"taiquan":false},"mapEntryReady":false,"lineCompass":{"current":{"lineId":"jin","name":"晋国","step":"","source":"focus"},"others":[{"lineId":"song","name":"宋国","locked":false,"hintLines":[]},{"lineId":"han","name":"汉国","locked":false,"hintLines":[]},{"lineId":"tang","name":"唐国","locked":false,"hintLines":[]},{"lineId":"taiquan","name":"太泉古阵 · 时机未到","locked":true,"hintLines":["王哲的托付还记着：「等你的修为突破六阳后，往苍澜的太泉古阵去一趟。」「如果未达六阳之境，根本无法进入太泉古阵。」六阳，差不多就是第五级坐照的修为——眼下还没到。"]}],"entryHints":[]}},
  "lines-replay/jin-end": {"qinEntryReady":false,"anyLineClosed":true,"nationClosedLineCount":2,"lineClosed":{"nanhuang":true,"jin":true,"song":false,"han":false,"tang":false,"qin":false,"taiquan":false},"mapEntryReady":false,"lineCompass":{"current":{"lineId":"song","name":"宋国","step":"离开广阳，接着上路","source":"recent"},"others":[{"lineId":"han","name":"汉国","locked":false,"hintLines":[]},{"lineId":"tang","name":"唐国","locked":false,"hintLines":[]},{"lineId":"taiquan","name":"太泉古阵 · 时机未到","locked":true,"hintLines":["王哲的托付还记着：「等你的修为突破六阳后，往苍澜的太泉古阵去一趟。」「如果未达六阳之境，根本无法进入太泉古阵。」六阳，差不多就是第五级坐照的修为——眼下还没到。"]}],"entryHints":[]}},
  "lines-replay/taiquan-mid": {"qinEntryReady":false,"anyLineClosed":true,"nationClosedLineCount":2,"lineClosed":{"nanhuang":true,"jin":true,"song":false,"han":false,"tang":false,"qin":false,"taiquan":false},"mapEntryReady":false,"lineCompass":{"current":{"lineId":"song","name":"宋国","step":"<<COMPASS_POINTER>>","source":"focus"},"others":[{"lineId":"han","name":"汉国","locked":false,"hintLines":[]},{"lineId":"tang","name":"唐国","locked":false,"hintLines":[]},{"lineId":"taiquan","name":"太泉古阵 · 时机未到","locked":true,"hintLines":["王哲的托付还记着：「等你的修为突破六阳后，往苍澜的太泉古阵去一趟。」「如果未达六阳之境，根本无法进入太泉古阵。」六阳，差不多就是第五级坐照的修为——眼下还没到。"]}],"entryHints":[]}},
  "lines-replay/taiquan-end": {"qinEntryReady":true,"anyLineClosed":true,"nationClosedLineCount":3,"lineClosed":{"nanhuang":true,"jin":true,"song":true,"han":false,"tang":false,"qin":false,"taiquan":false},"mapEntryReady":true,"lineCompass":{"current":{"lineId":"han","name":"汉国","step":"回到洛都看看","source":"recent"},"others":[{"lineId":"tang","name":"唐国","locked":false,"hintLines":[]},{"lineId":"taiquan","name":"太泉古阵","locked":false,"hintLines":[]}],"entryHints":[]}},
  "lines-replay/han-mid": {"qinEntryReady":true,"anyLineClosed":true,"nationClosedLineCount":3,"lineClosed":{"nanhuang":true,"jin":true,"song":true,"han":false,"tang":false,"qin":false,"taiquan":false},"mapEntryReady":true,"lineCompass":{"current":{"lineId":"han","name":"汉国","step":"","source":"focus"},"others":[{"lineId":"tang","name":"唐国","locked":false,"hintLines":[]},{"lineId":"taiquan","name":"太泉古阵","locked":false,"hintLines":[]}],"entryHints":[]}},
  "lines-replay/han-end": {"qinEntryReady":true,"anyLineClosed":true,"nationClosedLineCount":4,"lineClosed":{"nanhuang":true,"jin":true,"song":true,"han":true,"tang":false,"qin":false,"taiquan":false},"mapEntryReady":true,"lineCompass":{"current":{"lineId":"taiquan","name":"太泉古阵","step":"","source":"recent"},"others":[{"lineId":"tang","name":"唐国","locked":false,"hintLines":[]}],"entryHints":[]}},
  "lines-replay/tang-mid": {"qinEntryReady":true,"anyLineClosed":true,"nationClosedLineCount":4,"lineClosed":{"nanhuang":true,"jin":true,"song":true,"han":true,"tang":false,"qin":false,"taiquan":false},"mapEntryReady":true,"lineCompass":{"current":{"lineId":"tang","name":"唐国","step":"","source":"focus"},"others":[{"lineId":"taiquan","name":"太泉古阵","locked":false,"hintLines":[]}],"entryHints":[]}},
  "lines-replay/tang-end": {"qinEntryReady":true,"anyLineClosed":true,"nationClosedLineCount":5,"lineClosed":{"nanhuang":true,"jin":true,"song":true,"han":true,"tang":true,"qin":false,"taiquan":false},"mapEntryReady":true,"lineCompass":{"current":{"lineId":"taiquan","name":"太泉古阵","step":"","source":"recent"},"others":[],"entryHints":[]}},
  "synthetic/festival-before-qin": {"qinEntryReady":false,"anyLineClosed":true,"nationClosedLineCount":3,"lineClosed":{"nanhuang":true,"jin":true,"song":true,"han":false,"tang":false,"qin":false,"taiquan":false},"mapEntryReady":false,"lineCompass":{"current":null,"others":[],"entryHints":[]}},
  "synthetic/festival-after-qin": {"qinEntryReady":true,"anyLineClosed":true,"nationClosedLineCount":3,"lineClosed":{"nanhuang":true,"jin":true,"song":true,"han":false,"tang":false,"qin":false,"taiquan":false},"mapEntryReady":false,"lineCompass":{"current":null,"others":[],"entryHints":[]}},
};

for (const [name, make] of Object.entries(CASES)) {
  test(`${name}：派生读取点与右栏线卡同重构前`, async () => {
    assert.deepEqual(snapshot(await make()), EXPECTED[name]);
  });
}
