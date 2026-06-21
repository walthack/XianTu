import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const fixtureUrl = new URL('./fixtures/scenario-mod/minimal.json', import.meta.url);

async function loadMod() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  return parseScenarioMod(JSON.parse(await readFile(fixtureUrl, 'utf8')));
}

test('converts strict canon into native WorldInfo without renaming entities', async () => {
  const { buildStrictScenarioInitialization } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const mod = await loadMod();
  const result = buildStrictScenarioInitialization(mod, '2026-06-22T00:00:00.000Z');

  assert.equal(result.worldInfo.世界名称, '六朝世界');
  assert.deepEqual(result.worldInfo.大陆信息.map(item => item.名称), ['江南']);
  assert.deepEqual(result.worldInfo.势力信息.map(item => item.名称), ['太乙真宗']);
  assert.deepEqual(result.worldInfo.地点信息.map(item => item.名称), ['建康', '太乙真宗山门']);
  assert.equal(result.runtimeState.canon.characters[0].name, '程宗扬');
  assert.equal(result.runtimeState.canon.skills[0].name, '雷刀诀');
  assert.equal(result.runtimeState.canon.items[0].name, '雷刀');
  assert.equal(result.initialLocation.描述, '江南·建康');
  assert.equal(result.worldInfo.版本, 'scenario-mod:liuchao.jiankang@1.0.0');
});

test('strict resolution never calls the AI world generator', async () => {
  const { resolveInitialWorldInfo } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const mod = await loadMod();
  let generatorCalls = 0;

  const result = await resolveInitialWorldInfo(mod, async () => {
    generatorCalls += 1;
    throw new Error('AI world generator must not run');
  });

  assert.equal(generatorCalls, 0);
  assert.equal(result.strictInitialization.runtimeState.modId, 'liuchao.jiankang');
});

test('strict Mod identity and canon survive a save serialization round trip', async () => {
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const mod = await loadMod();
  const initialization = buildStrictScenarioInitialization(mod, '2026-06-22T00:00:00.000Z');
  const baseSave = {
    角色: { 位置: { 描述: '旧地点', x: 0, y: 0 } },
    世界: { 信息: {}, 状态: {} },
    系统: { 扩展: {}, 联机: { 模式: '单机', 只读路径: [] } },
  };

  const saved = applyStrictScenarioInitializationToSave(baseSave, initialization);
  const reloaded = JSON.parse(JSON.stringify(saved));

  assert.equal(reloaded.系统.扩展.剧本模组.modId, 'liuchao.jiankang');
  assert.equal(reloaded.世界.状态.剧本模组.modVersion, '1.0.0');
  assert.equal(reloaded.世界.状态.剧本模组.canon.characters[0].name, '程宗扬');
  assert.equal(reloaded.角色.位置.描述, '江南·建康');
  assert.equal(baseSave.角色.位置.描述, '旧地点', 'base save must not be mutated');
});

test('non-strict resolution preserves the original world generation path', async () => {
  const { resolveInitialWorldInfo } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const mod = await loadMod();
  mod.rules.mode = 'expand';
  let generatorCalls = 0;
  const generated = { 世界名称: 'generated' };

  const result = await resolveInitialWorldInfo(mod, async () => {
    generatorCalls += 1;
    return generated;
  });

  assert.equal(generatorCalls, 1);
  assert.equal(result.worldInfo, generated);
  assert.equal(result.strictInitialization, undefined);
});
