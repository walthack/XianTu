import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadTs } from './loadTs.mjs';
import { checkpointLines, writeLineEntryCheckpoints, outputDir } from '../scripts/generate-line-entry-checkpoints.mjs';
const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const { unwrapDadBundle } = await loadTs('../src/utils/dadBundle.ts');
const { isSaveDataV3, migrateSaveDataToLatest } = await loadTs('../src/utils/saveMigration.ts');
const { validateSaveDataV3 } = await loadTs('../src/utils/saveValidationV3.ts');
const { assertEntitySaveFormat } = await loadTs('../src/modules/scenarioMods/entitySaveFormat.ts');
const read = async (name, dir = outputDir) => JSON.parse(await readFile(new URL(name, dir), 'utf8'));
const reference = await read('current-prologue-before-s02_04.json');

for (const line of checkpointLines) {
  test(`${line.name}线检查点：导入格式/校验、首拍未完成且在当地可行动、trace 无进度注入`, async () => {
    const bundle = await read(`current-${line.id}-entry.json`);
    assert.deepEqual(Object.keys(bundle).sort(), Object.keys(reference).sort());
    assert.equal(bundle.saves.length, 1);
    assert.deepEqual(Object.keys(bundle.saves[0]).sort(), Object.keys(reference.saves[0]).sort());
    const unwrapped = unwrapDadBundle(bundle);
    assert.equal(unwrapped.type, 'saves');
    const raw = unwrapped.payload.saves[0].存档数据;
    const save = isSaveDataV3(raw) ? raw : migrateSaveDataToLatest(raw).migrated;
    assert.equal(save.元数据.存档名, `当前构建新档-${line.name}线进线前`);
    assert.equal(bundle.saves[0].存档名, save.元数据.存档名);
    const validation = validateSaveDataV3(save);
    assert.equal(validation.isValid, true, JSON.stringify(validation));
    assert.doesNotThrow(() => assertEntitySaveFormat(save));
    const state = save.世界.状态.剧本模组;
    assert.ok(!state.completedEventIds.includes(line.eventId));
    assert.ok(state.activeEventIds.includes(line.eventId) || R.getScenarioFocusEvent(state)?.id === line.eventId);
    const event = state.events.find(e => e.id === line.eventId);
    assert.ok(event);
    if (line.id === 'taiquan') assert.equal(save.角色.位置.locationId, 'liuchao.location.canglan');
    if (event.locationId) assert.equal(save.角色.位置.locationId, event.locationId);
    const actions = R.getCurrentStoryEventActions(save).filter(a => a.eventId === line.eventId && !/^(travel:|idle:)/.test(a.actionId));
    assert.ok(actions.length, '主拍可行动，不只是旅行提示');
    const trace = await read(`current-${line.id}-entry.trace.json`);
    assert.deepEqual(trace[0].nonEngineProgress, []);
    assert.equal(trace.at(-1).eventId, line.eventId);
    assert.deepEqual(trace.at(-1).location, save.角色.位置);
    assert.deepEqual(trace.at(-1).actions, actions.map(a => a.actionId));
    assert.ok(!trace.some(t => t.event === line.eventId && t.receipt?.completed));
    // 与存档加载后的首轮同步一致，不能同步后就自动越过首拍。
    const resumed = R.advanceScenarioRuntime(structuredClone(save)).saveData;
    assert.ok(!resumed.世界.状态.剧本模组.completedEventIds.includes(line.eventId));
    const resumedAction = R.getCurrentStoryEventActions(resumed).find(a => a.eventId === line.eventId);
    assert.ok(resumedAction);
    const receipt = R.recordStoryEventStructuredAction(resumed, resumedAction);
    assert.equal(receipt.attempted, true, JSON.stringify(receipt));
  });
}

test('重新运行生成器：三份完整存档及 trace 与仓库夹具一致', { timeout: 120000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiantu-line-checkpoints-'));
  try {
    const url = pathToFileURL(dir + '/');
    await writeLineEntryCheckpoints(url);
    for (const line of checkpointLines) {
      for (const suffix of ['.json', '.trace.json']) {
        const name = `current-${line.id}-entry${suffix}`;
        assert.deepEqual(await read(name, url), await read(name), name);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
