// 路途卡只在南荒行旅关显示：travelLedger.lastCard 存在存档里不清除，离开南荒后（晋、汉、唐……）不应再挂在主面板顶部。
// 用入库的旧档夹具（tests/fixtures/lines-replay）：汉、唐档里带着南荒时期留下的 lastCard；昭南档在南荒行旅关内。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const { loadTs } = await import('./loadTs.mjs');
const L = await loadTs('../src/modules/scenarioMods/travel/travelLedger.ts');
const saveOf = name => JSON.parse(readFileSync(new URL(`./fixtures/lines-replay/${name}.json`, import.meta.url), 'utf8')).saves[0].存档数据;
const runtimeOf = save => save.世界.状态.剧本模组;

test('离开南荒后的档：存档里仍有 lastCard，但路途卡不再显示', () => {
  for (const name of ['han-end', 'tang-mid']) {
    const save = saveOf(name);
    assert.ok(runtimeOf(save).travelLedger?.lastCard, `${name} 夹具前提：存档里带着南荒留下的 lastCard`);
    assert.equal(L.isNanhuangTravelStage(runtimeOf(save).modId), false, `${name} 夹具前提：当前关不是南荒行旅关`);
    assert.equal(L.getTravelCard(save), undefined, `${name}：不在南荒行旅关，不显示路途卡`);
  }
});

test('南荒行旅关内的档：路途卡照常显示', () => {
  const save = saveOf('zhaonan-mid');
  assert.equal(L.isNanhuangTravelStage(runtimeOf(save).modId), true);
  const card = L.getTravelCard(save);
  assert.ok(card?.from && card?.to, '南荒行旅关内有路途卡');
});
