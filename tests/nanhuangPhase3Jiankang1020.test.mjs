// 2026-10-20 用户定：加试玩第三期 nanhuang-3，终点 lcq.event.s07_00c_arrive_jiankang；第二期 nextId 指向它。
// 用真机 CP-5e8f-04（二期终点·殇侯授艺后）复现：继续到第三期 → 启程跳过隔离关 stage_06 进 stage_07 → 返程入建康三拍 → 第三期结束。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { loadTs } from './loadTs.mjs';

const q = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
const rt = await loadTs('../src/modules/scenarioMods/runtime.ts');
const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const pack = await loadTs('../src/modules/contentPacks/index.ts');
const val = await loadTs('../src/modules/scenarioMods/validator.ts');
const mod = id => val.parseScenarioMod(pack.applyContentPackOverlays(JSON.parse(readFileSync(`src/modules/scenarioMods/builtins/data/${id}.json`, 'utf8'))));
const cp04 = () => JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/playtest-5e8f/cp04-phase2-end.json.gz', import.meta.url))).toString('utf8'));

test('试玩包：第二期 nextId＝nanhuang-3，第三期终点在返程入建康', () => {
  const list = JSON.parse(readFileSync('src/modules/contentPacks/packs/qingyu/playtests.json', 'utf8'));
  const p2 = list.find(p => p.id === 'nanhuang-2'), p3 = list.find(p => p.id === 'nanhuang-3');
  assert.equal(p2.nextId, 'nanhuang-3');
  assert.deepEqual([p3.endModId, p3.endEventId, p3.nextId], ['lcq.stage_07_qingyuan_jiankang', 'lcq.event.s07_00c_arrive_jiankang', undefined]);
  assert.equal(pack.CONTENT_PACKS.playtests.find(p => p.id === 'nanhuang-3')?.endEventId, 'lcq.event.s07_00c_arrive_jiankang', '生成目录已更新');
});

test('CP-5e8f-04：二期终点可继续到第三期，启程进 stage_07，走完返程三拍后第三期结束', () => {
  let save = cp04();
  assert.equal(q.isNanhuangDemoFinished(save), true);
  assert.equal(q.nanhuangPhaseNumber(save), 2);
  assert.equal(q.nextNanhuangPhase(save)?.id, 'nanhuang-3');
  save = q.withNextNanhuangPhase(save);
  assert.equal(q.nanhuangPhaseNumber(save), 3);
  assert.equal(q.isNanhuangDemoFinished(save), false);
  assert.ok(rt.getStageDepartureOffer(save), '可以启程');
  const out = init.transitionToNextScenarioStage(save, ['lcq.stage_06', 'lcq.stage_07_qingyuan_jiankang'].map(mod));
  assert.equal(out.ok, true, out.reason);
  assert.equal(out.to, 'lcq.stage_07_qingyuan_jiankang', '隔离关 stage_06 被跳过');
  let cur = out.saveData;
  for (const id of ['lcq.event.s07_00a_shanghou_trading_house', 'lcq.event.s07_00b_return_north', 'lcq.event.s07_00c_arrive_jiankang']) {
    assert.ok(cur.世界.状态.剧本模组.activeEventIds.includes(id), id);
    assert.equal(q.isNanhuangDemoFinished(cur), false, `${id} 前不算结束`);
    const travel = rt.getCurrentStoryEventActions(cur).find(x => x.actionId.startsWith('travel:'));
    if (travel) rt.recordStoryEventStructuredAction(cur, travel);
    const act = rt.getCurrentStoryEventActions(cur).find(x => x.eventId === id && !x.actionId.startsWith('travel:'));
    assert.ok(act, id);
    rt.recordStoryEventStructuredAction(cur, act);
    cur = rt.advanceScenarioRuntime(cur).saveData;
  }
  assert.equal(q.isNanhuangDemoFinished(cur), true, '入建康后第三期结束');
  assert.equal(q.nextNanhuangPhase(cur), undefined);
  assert.equal(init.transitionToNextScenarioStage(cur, []).reason, '本期南荒试玩已结束');
});
