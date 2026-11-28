import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';

// 南荒、晋、宋、秦四条线的进线试玩档（scripts/generate-formal-line-entry-checkpoints.mjs 生成，用户 2026-11-28 07:52 交办）。
// 只读入库夹具，不重跑生成器。在队名单不落存档，这里只查不超过上限；具体名单随在队规则表变。
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const quiet = async fn => { const k = ['log', 'info', 'warn', 'error', 'debug'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };
const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const PL = await loadTs('../src/modules/scenarioMods/partyLedger.ts');
const N = await loadTs('../src/modules/sceneModule/numbers.ts');
const rt = save => save.世界.状态.剧本模组;

const EXPECTED = {
  nanhuang: { stage: 'lcq.stage_02', focus: 'lcq.event.iron_bridge_ambush', action: 'stabilize_wuerlang_on_route' },
  jin: { stage: 'lcq.stage_07_qingyuan_jiankang', focus: 'lcq.event.s07_00a_shanghou_trading_house', action: 'hear_shanghou_trading_house' },
  song: { stage: 'lcq.stage_09_trade_and_escape', focus: 'lcq.event.s09_07_feiniao_infiltration', action: 'advance_declared_objective' },
  qin: { stage: 'lyg.qin_xianyang', focus: 'liuchao.event.qin_enter_xianyang', action: 'settle_in_xianyang' },
};

test('四条线进线试玩档：过真实读档入口，停在各线入口拍，入口动作可点，在队人数不超上限', async () => {
  const { assertRealOpeningAfterLoad } = await import('../scripts/generate-prologue-checkpoint.mjs');
  for (const [line, want] of Object.entries(EXPECTED)) {
    const bundle = json(`tests/fixtures/checkpoints/formal-${line}-entry.json`);
    const r = await quiet(() => assertRealOpeningAfterLoad(bundle, `formal-${line}-entry`));
    assert.deepEqual([r.before.year, r.after.birth.年, r.after.age], [224, 200, 24], line);
    const save = bundle.saves[0].存档数据, state = rt(save);
    assert.equal(state.modId, want.stage, line);
    assert.equal(R.getScenarioFocusEvent(state)?.id, want.focus, line);
    assert.ok(!state.completedEventIds.includes(want.focus), line);
    assert.ok(R.getCurrentStoryEventActions(save).some(a => a.eventId === want.focus && a.actionId === want.action), line);
    assert.ok(PL.partyRoster(state).size <= N.GAME_NUMBERS.story.party.maxSize, line);
    assert.equal(save.系统.扩展?.清羽记开局, undefined, `${line}：应是正式档，不带试玩隔离标记`);
  }
});
