// G4 黄金对照：判档线集合与「失败是否结束游戏」从 numbers（story.lineOutcome.judgedLines／failEndsGame）搬进各线包 nation-lines.json 之前，
// 在旧代码（41465259）上跑出的读取点结果，内联为期望；搬迁后这些期望一个字节都不许改。
// ① 静态：judgedLineIds() 集合与顺序、7 条国家线与未知 id 的 lineFailEndsGame、writeLineOutcome 逐线接收／拒写、规则表 lineId 判档校验逐线结果；
// ② 旧档（qin-replay 4 份、lines-replay 12 份）各走真实读档链（同 tests/stage2CompassGolden.test.mjs），记 closedLineIds（三种档位口径）、
//    nationClosedLineCount、太泉整线解锁状态（lineUnlockStatus required）与账本读数 unlock.taiquan；
// ③ 合成档：flags 手写各线收束档（含太泉、未知线、非法档位、嵌套兜底），境界够／不够两种，看太泉解锁判定。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

// musicLibrary.ts 直接 import 曲目 .mp3（webpack 资源）；Node 下只把它当成 URL 字符串模块（同 tests/stage2CompassGolden.test.mjs）。
register('data:text/javascript,' + encodeURIComponent(
  "export async function load(url, context, next) { if (url.endsWith('.mp3')) return { format: 'module', source: 'export default ' + JSON.stringify(url), shortCircuit: true }; return next(url, context); }"));
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const { loadTs } = await import('./loadTs.mjs');
const quiet = async fn => { const k = ['log', 'info', 'warn', 'error', 'debug'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };

const L = await loadTs('../src/modules/scenarioMods/ledgerConditions.ts');
const O = await loadTs('../src/modules/scenarioMods/lineOutcomes.ts');
const U = await loadTs('../src/modules/scenarioMods/lineUnlock.ts');
const PL = await loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');
const { unwrapDadBundle } = await loadTs('../src/utils/dadBundle.ts');
const { isSaveDataV3, migrateSaveDataToLatest } = await loadTs('../src/utils/saveMigration.ts');
const { assertEntitySaveFormat } = await loadTs('../src/modules/scenarioMods/entitySaveFormat.ts');
const fallback = await loadTs('../src/utils/saveLoadFallback.ts');
const repairs = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
const calendar = await loadTs('../src/utils/calendarMigration.ts');

const LINES = ['nanhuang', 'jin', 'song', 'han', 'tang', 'qin', 'taiquan'];
const PROBE = [...LINES, 'chu', 'note', ''];
const rt = save => save.世界.状态.剧本模组;

function importBundle(bundle) {
  const raw = unwrapDadBundle(bundle).payload.saves[0].存档数据;
  return isSaveDataV3(raw) ? raw : migrateSaveDataToLatest(raw).migrated;
}
async function loadLikeGame(save, label) {
  const disk = JSON.parse(JSON.stringify(save));
  return quiet(async () => {
    const outcome = await fallback.validateLoadedSave('g4-golden', label, disk, { keep: 0, readBackup: async () => null });
    assert.equal(outcome.status, 'ok', `${label} 读档校验未通过`);
    repairs.applyLoadRepairs(outcome.data);
    assertEntitySaveFormat(outcome.data);
    calendar.migrateCalendar(outcome.data);
    return outcome.data;
  });
}
const fixture = (dir, key) => JSON.parse(readFileSync(new URL(`./fixtures/${dir}/${key}.json`, import.meta.url), 'utf8'));

async function snapshot(save) {
  const s = rt(save);
  return quiet(async () => ({
    closedLineIds: O.closedLineIds(s),
    closedResolved: O.closedLineIds(s, ['resolved']),
    closedUnresolved: O.closedLineIds(s, ['unresolved']),
    nationClosedLineCount: O.nationClosedLineCount(s),
    taiquanUnlock: U.lineUnlockStatus(save, 'taiquan', { required: true, runtime: s }),
    unlockLedger: L.resolveLedgerPath('unlock.taiquan', s, save).value,
  }));
}

const synthetic = (realm, flags, completedEventIds = []) => async () => ({
  角色: { 身份: {}, 属性: { 境界: realm }, 位置: {}, 背包: { 金钱: {}, 物品: {} } }, 社交: { 关系: {} }, 系统: { 扩展: {} },
  世界: { 状态: { 剧本模组: { modId: 'lcq.stage_01', flags, completedEventIds, activeEventIds: [], chronicle: [] } } },
});
const ALL_RESOLVED = Object.fromEntries(LINES.map(id => [`line.${id}.outcome`, 'resolved']));

const CASES = {
  ...Object.fromEntries(['qin-before-entry', 'qin-entry-ready', 'qin-rail-mid', 'qin-rail-end']
    .map(key => [`qin-replay/${key}`, () => loadLikeGame(importBundle(fixture('qin-replay', key)), key)])),
  ...Object.fromEntries(['saiwai-mid', 'saiwai-end', 'zhaonan-mid', 'zhaonan-end', 'jin-mid', 'jin-end', 'taiquan-mid', 'taiquan-end', 'han-mid', 'han-end', 'tang-mid', 'tang-end']
    .map(key => [`lines-replay/${key}`, () => loadLikeGame(importBundle(fixture('lines-replay', key)), key)])),
  'synthetic/none-zuozhao': synthetic('坐照', {}),
  'synthetic/all-resolved-zuozhao': synthetic('坐照', ALL_RESOLVED),
  'synthetic/all-resolved-low-realm': synthetic('初窥', ALL_RESOLVED),
  'synthetic/only-taiquan-and-unknown': synthetic('坐照', { 'line.taiquan.outcome': 'resolved', 'line.chu.outcome': 'resolved', 'line.song.outcome': 'bogus' }),
  'synthetic/mixed-tiers': synthetic('坐照', { 'line.qin.outcome': 'resolved', 'line.jin.outcome': 'unresolved', line: { han: { outcome: 'unresolved' } } }),
};

const EXPECTED_STATIC = {"judgedLineIds":["nanhuang","jin","song","han","tang","qin"],"failEndsGame":{"nanhuang":false,"jin":false,"song":false,"han":false,"tang":false,"qin":false,"taiquan":false,"chu":false,"note":false,"":false},"writes":{"nanhuang":{"ok":true,"flags":{"line.nanhuang.outcome":"resolved"}},"jin":{"ok":true,"flags":{"line.jin.outcome":"resolved"}},"song":{"ok":true,"flags":{"line.song.outcome":"resolved"}},"han":{"ok":true,"flags":{"line.han.outcome":"resolved"}},"tang":{"ok":true,"flags":{"line.tang.outcome":"resolved"}},"qin":{"ok":true,"flags":{"line.qin.outcome":"resolved"}},"taiquan":{"ok":false,"flags":{}},"chu":{"ok":false,"flags":{}},"note":{"ok":false,"flags":{}},"":{"ok":false,"flags":{}}},"ruleErrors":{"nanhuang":[],"jin":[],"song":[],"han":[],"tang":[],"qin":[],"taiquan":["收束规则 lcq.event.charge_sudaji_fee → taiquan：lineId 不在 story.lineOutcome.judgedLines（非判档线不写收束档）：taiquan"],"chu":["收束规则 lcq.event.charge_sudaji_fee → chu：lineId 未知：chu"],"note":["收束规则 lcq.event.charge_sudaji_fee → note：lineId 未知：note"]}};
const EXPECTED = {
  "qin-replay/qin-before-entry": {"closedLineIds":["nanhuang","jin"],"closedResolved":["nanhuang","jin"],"closedUnresolved":["nanhuang","jin"],"nationClosedLineCount":2,"taiquanUnlock":{"lineId":"taiquan","unlocked":false,"entered":false,"missing":["realm"],"realm":{"level":2,"need":5},"lines":{"closedIds":["nanhuang","jin"],"need":1,"short":0},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":false},
  "qin-replay/qin-entry-ready": {"closedLineIds":["nanhuang","jin","song"],"closedResolved":["nanhuang","jin","song"],"closedUnresolved":["nanhuang","jin","song"],"nationClosedLineCount":3,"taiquanUnlock":{"lineId":"taiquan","unlocked":false,"entered":false,"missing":["realm"],"realm":{"level":2,"need":5},"lines":{"closedIds":["nanhuang","jin","song"],"need":1,"short":0},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":false},
  "qin-replay/qin-rail-mid": {"closedLineIds":["nanhuang","jin","song"],"closedResolved":["nanhuang","jin","song"],"closedUnresolved":["nanhuang","jin","song"],"nationClosedLineCount":3,"taiquanUnlock":{"lineId":"taiquan","unlocked":false,"entered":false,"missing":["realm"],"realm":{"level":2,"need":5},"lines":{"closedIds":["nanhuang","jin","song"],"need":1,"short":0},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":false},
  "qin-replay/qin-rail-end": {"closedLineIds":["nanhuang","jin","song","qin"],"closedResolved":["nanhuang","jin","song"],"closedUnresolved":["nanhuang","jin","song","qin"],"nationClosedLineCount":3,"taiquanUnlock":{"lineId":"taiquan","unlocked":false,"entered":false,"missing":["realm"],"realm":{"level":2,"need":5},"lines":{"closedIds":["nanhuang","jin","song","qin"],"need":1,"short":0},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":false},
  "lines-replay/saiwai-mid": {"closedLineIds":[],"closedResolved":[],"closedUnresolved":[],"nationClosedLineCount":0,"taiquanUnlock":{"lineId":"taiquan","unlocked":false,"entered":false,"missing":["realm","lines"],"realm":{"level":0,"need":5},"lines":{"closedIds":[],"need":1,"short":1},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":false},
  "lines-replay/saiwai-end": {"closedLineIds":[],"closedResolved":[],"closedUnresolved":[],"nationClosedLineCount":0,"taiquanUnlock":{"lineId":"taiquan","unlocked":false,"entered":false,"missing":["realm","lines"],"realm":{"level":0,"need":5},"lines":{"closedIds":[],"need":1,"short":1},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":false},
  "lines-replay/zhaonan-mid": {"closedLineIds":[],"closedResolved":[],"closedUnresolved":[],"nationClosedLineCount":0,"taiquanUnlock":{"lineId":"taiquan","unlocked":false,"entered":false,"missing":["realm","lines"],"realm":{"level":2,"need":5},"lines":{"closedIds":[],"need":1,"short":1},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":false},
  "lines-replay/zhaonan-end": {"closedLineIds":["nanhuang"],"closedResolved":["nanhuang"],"closedUnresolved":["nanhuang"],"nationClosedLineCount":1,"taiquanUnlock":{"lineId":"taiquan","unlocked":false,"entered":false,"missing":["realm"],"realm":{"level":2,"need":5},"lines":{"closedIds":["nanhuang"],"need":1,"short":0},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":false},
  "lines-replay/jin-mid": {"closedLineIds":["nanhuang"],"closedResolved":["nanhuang"],"closedUnresolved":["nanhuang"],"nationClosedLineCount":1,"taiquanUnlock":{"lineId":"taiquan","unlocked":false,"entered":false,"missing":["realm"],"realm":{"level":2,"need":5},"lines":{"closedIds":["nanhuang"],"need":1,"short":0},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":false},
  "lines-replay/jin-end": {"closedLineIds":["nanhuang","jin"],"closedResolved":["nanhuang","jin"],"closedUnresolved":["nanhuang","jin"],"nationClosedLineCount":2,"taiquanUnlock":{"lineId":"taiquan","unlocked":false,"entered":false,"missing":["realm"],"realm":{"level":2,"need":5},"lines":{"closedIds":["nanhuang","jin"],"need":1,"short":0},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":false},
  "lines-replay/taiquan-mid": {"closedLineIds":["nanhuang","jin"],"closedResolved":["nanhuang","jin"],"closedUnresolved":["nanhuang","jin"],"nationClosedLineCount":2,"taiquanUnlock":{"lineId":"taiquan","unlocked":false,"entered":false,"missing":["realm"],"realm":{"level":2,"need":5},"lines":{"closedIds":["nanhuang","jin"],"need":1,"short":0},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":false},
  "lines-replay/taiquan-end": {"closedLineIds":["nanhuang","jin","song"],"closedResolved":["nanhuang","jin","song"],"closedUnresolved":["nanhuang","jin","song"],"nationClosedLineCount":3,"taiquanUnlock":{"lineId":"taiquan","unlocked":false,"entered":false,"missing":["realm"],"realm":{"level":2,"need":5},"lines":{"closedIds":["nanhuang","jin","song"],"need":1,"short":0},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":true},
  "lines-replay/han-mid": {"closedLineIds":["nanhuang","jin","song"],"closedResolved":["nanhuang","jin","song"],"closedUnresolved":["nanhuang","jin","song"],"nationClosedLineCount":3,"taiquanUnlock":{"lineId":"taiquan","unlocked":false,"entered":false,"missing":["realm"],"realm":{"level":2,"need":5},"lines":{"closedIds":["nanhuang","jin","song"],"need":1,"short":0},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":true},
  "lines-replay/han-end": {"closedLineIds":["nanhuang","jin","song","han"],"closedResolved":["nanhuang","jin","song","han"],"closedUnresolved":["nanhuang","jin","song","han"],"nationClosedLineCount":4,"taiquanUnlock":{"lineId":"taiquan","unlocked":false,"entered":false,"missing":["realm"],"realm":{"level":2,"need":5},"lines":{"closedIds":["nanhuang","jin","song","han"],"need":1,"short":0},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":true},
  "lines-replay/tang-mid": {"closedLineIds":["nanhuang","jin","song","han"],"closedResolved":["nanhuang","jin","song","han"],"closedUnresolved":["nanhuang","jin","song","han"],"nationClosedLineCount":4,"taiquanUnlock":{"lineId":"taiquan","unlocked":false,"entered":false,"missing":["realm"],"realm":{"level":2,"need":5},"lines":{"closedIds":["nanhuang","jin","song","han"],"need":1,"short":0},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":true},
  "lines-replay/tang-end": {"closedLineIds":["nanhuang","jin","song","han","tang"],"closedResolved":["nanhuang","jin","song","han","tang"],"closedUnresolved":["nanhuang","jin","song","han","tang"],"nationClosedLineCount":5,"taiquanUnlock":{"lineId":"taiquan","unlocked":false,"entered":false,"missing":["realm"],"realm":{"level":2,"need":5},"lines":{"closedIds":["nanhuang","jin","song","han","tang"],"need":1,"short":0},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":true},
  "synthetic/none-zuozhao": {"closedLineIds":[],"closedResolved":[],"closedUnresolved":[],"nationClosedLineCount":0,"taiquanUnlock":{"lineId":"taiquan","unlocked":false,"entered":false,"missing":["lines"],"realm":{"level":5,"need":5},"lines":{"closedIds":[],"need":1,"short":1},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":false},
  "synthetic/all-resolved-zuozhao": {"closedLineIds":["nanhuang","jin","song","han","tang","qin"],"closedResolved":["nanhuang","jin","song","han","tang","qin"],"closedUnresolved":[],"nationClosedLineCount":5,"taiquanUnlock":{"lineId":"taiquan","unlocked":true,"entered":false,"missing":[],"realm":{"level":5,"need":5},"lines":{"closedIds":["nanhuang","jin","song","han","tang","qin"],"need":1,"short":0},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":true},
  "synthetic/all-resolved-low-realm": {"closedLineIds":["nanhuang","jin","song","han","tang","qin"],"closedResolved":["nanhuang","jin","song","han","tang","qin"],"closedUnresolved":[],"nationClosedLineCount":5,"taiquanUnlock":{"lineId":"taiquan","unlocked":false,"entered":false,"missing":["realm"],"realm":{"level":null,"need":5},"lines":{"closedIds":["nanhuang","jin","song","han","tang","qin"],"need":1,"short":0},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":false},
  "synthetic/only-taiquan-and-unknown": {"closedLineIds":[],"closedResolved":[],"closedUnresolved":[],"nationClosedLineCount":0,"taiquanUnlock":{"lineId":"taiquan","unlocked":false,"entered":false,"missing":["lines"],"realm":{"level":5,"need":5},"lines":{"closedIds":[],"need":1,"short":1},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":false},
  "synthetic/mixed-tiers": {"closedLineIds":["jin","han","qin"],"closedResolved":["qin"],"closedUnresolved":["jin","han"],"nationClosedLineCount":2,"taiquanUnlock":{"lineId":"taiquan","unlocked":true,"entered":false,"missing":[],"realm":{"level":5,"need":5},"lines":{"closedIds":["jin","han","qin"],"need":1,"short":0},"deadlines":[{"id":"liuchao.deadline.ice_gu","pass":true}]},"unlockLedger":true},
};

function staticSnapshot() {
  const writes = Object.fromEntries(PROBE.map(id => { const flags = {}; const ok = O.writeLineOutcome(flags, id, 'resolved'); return [id, { ok, flags }]; }));
  const ruleErrors = Object.fromEntries(PROBE.filter(Boolean).map(id => [id, PL.validatePlayerLedgerRules({ version: 1, identityGrants: [], identityRevokes: [], lineOutcomes: [{ eventId: 'lcq.event.charge_sudaji_fee', lineId: id, outcome: 'resolved' }] }, { identities: [] })]));
  return {
    judgedLineIds: [...O.judgedLineIds()],
    failEndsGame: Object.fromEntries(PROBE.map(id => [id, O.lineFailEndsGame(id)])),
    writes,
    ruleErrors,
  };
}

test('静态：判档线集合与顺序、逐线 failEndsGame、逐线写档与规则表判档校验同搬迁前', async () => {
  assert.deepEqual(JSON.parse(JSON.stringify(await quiet(async () => staticSnapshot()))), EXPECTED_STATIC);
});

for (const [name, make] of Object.entries(CASES)) {
  test(`${name}：已收束判档线、计入线数与太泉解锁判定同搬迁前`, async () => {
    assert.deepEqual(JSON.parse(JSON.stringify(await snapshot(await make()))), EXPECTED[name]);
  });
}
