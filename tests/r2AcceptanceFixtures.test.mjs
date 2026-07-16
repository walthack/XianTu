import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

async function loadStage06() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const raw = JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_06.json', import.meta.url), 'utf8'));
  return parseScenarioMod(raw);
}

test('R2-0V DEV pack creates three neutral independent s06_03 branchpoint saves', async () => {
  globalThis.APP_VERSION = 'test';
  const { buildR20VAcceptancePack, R2_ACCEPTANCE_MARKER } = await loadTs('../src/modules/scenarioMods/r2AcceptanceFixtures.ts');
  const pack = buildR20VAcceptancePack(await loadStage06(), '2026-07-15T00:00:00.000Z');

  assert.equal(pack.profile.模式, '单机');
  assert.equal(pack.profile.角色.名字, '[DEV] R2-0V 谢艺三路线');
  assert.equal(pack.saves[0].存档数据.角色.身份.名字, '程宗扬');
  assert.equal(pack.profile.开发测试标记.kind, R2_ACCEPTANCE_MARKER);
  assert.equal(pack.saves.length, 3);
  assert.equal(new Set(pack.saves.map(save => save.存档数据.元数据.存档ID)).size, 3);

  for (const slot of pack.saves) {
    const save = slot.存档数据;
    const runtime = save.世界.状态.剧本模组;
    assert.equal(runtime.modId, 'lcq.stage_06');
    assert.deepEqual(runtime.completedEventIds, ['lcq.event.s06_01', 'lcq.event.s06_02']);
    assert.deepEqual(runtime.activeEventIds, ['lcq.event.s06_03']);
    assert.equal(runtime.flags['event.s06_01.done'], true);
    assert.equal(runtime.flags['event.s06_02.done'], true);
    assert.equal(runtime.flags['event.s06_03.done'], false);
    assert.equal(runtime.flags['event.s06_03.void'], undefined);
    assert.equal(runtime.flags['branch.lcq.if_xieyi_longrest.active'], undefined);
    assert.equal(runtime.flags['character.xie_yi.status'], undefined);
    assert.deepEqual(runtime.divergences, []);
    assert.equal(save.系统.扩展.开发验收.kind, R2_ACCEPTANCE_MARKER);
    assert.match(save.社交.记忆.短期记忆[0], /最终生死尚未发生/);
  }
});
