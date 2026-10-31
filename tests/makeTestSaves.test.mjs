// scripts/dev/make-test-saves.mjs：五份试玩测试存档能按现有规则生成、过游戏读档同款校验并处于对应状态（离线，不依赖真机导出文件）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';

const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const { createDadBundle } = await loadTs('../src/utils/dadBundle.ts');
const { buildTestSaves, TEST_SAVE_BUILDERS } = await import('../scripts/dev/make-test-saves.mjs');

const stage01 = JSON.parse(readFileSync(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url), 'utf8'));
const templateSave = init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(stage01, '2026-10-31T00:00:00.000Z'));
const template = createDadBundle('saves', { characterId: 'char_test', characterName: '程宗扬', saves: [{ 存档名: '存档1', 存档数据: templateSave }] });

test('测试存档五份全部生成、过读档校验并处于对应状态', async () => {
  const built = await buildTestSaves(template);
  assert.deepEqual(Object.keys(built).sort(), Object.keys(TEST_SAVE_BUILDERS).sort());
  assert.deepEqual(Object.keys(built).sort(), ['daji-open', 'daji-warning', 'heimohai-approach', 'jiangzhou-retreat', 'qin-entry']);
  for (const [name, { bundle, save }] of Object.entries(built)) {
    assert.equal(bundle.schema, 'dad.bundle', name);
    assert.equal(bundle.type, 'saves', name);
    assert.equal(bundle.payload.saves.length, 1, name);
    assert.equal(bundle.payload.saves[0].存档数据, save, name);
    assert.equal(save.系统.历史.叙事.length, 1, `${name} 只留一条测试说明正文`);
    assert.equal(save.系统.扩展.判定, undefined, `${name} 不带模板遗留的待确认判定`);
  }
  assert.equal(built['qin-entry'].summary.qinMessage, 'liuchao.event.qin_hook_fangshi_rumor');
  assert.equal(built['daji-warning'].summary.available, false);
  assert.equal(built['daji-open'].summary.available, true);
  assert.equal(built['jiangzhou-retreat'].summary.location, 'liuchao.location.jiangzhou');
  assert.equal(built['heimohai-approach'].summary.active, 'liuchao.event.black_sea_approach');
});

test('模板不是导出存档时拒绝生成', async () => {
  await assert.rejects(buildTestSaves({ schema: 'dad.bundle', version: 1, type: 'settings', payload: {} }), /模板不是游戏导出的存档文件/);
});
