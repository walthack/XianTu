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

test('重新运行生成器：首见年另验，其余三份完整存档及 trace 与仓库夹具一致', { timeout: 120000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiantu-line-checkpoints-'));
  try {
    const url = pathToFileURL(dir + '/');
    await writeLineEntryCheckpoints(url);
    for (const line of checkpointLines) {
      for (const suffix of ['.json', '.trace.json']) {
        const name = `current-${line.id}-entry${suffix}`;
        const actual = await read(name, url);
        const expected = await read(name);
        if (suffix === '.json') {
          // 夹具已按真实开局重生成（总策划 11-11 03:21 与 05:12；C01 v5：主角开局 20 岁、出生 200、先开寿命缓存），
          // 首见年与寿命缓存已落在仓库夹具里，不再从生成结果里剔除；仍单独验证，再整份对照。
          for (const slot of actual.saves) {
            const save = slot.存档数据;
            const { LIFESPAN_CACHE_VERSION_KEY, LIFESPAN_CACHE_VERSION } = await loadTs('../src/utils/lifespanCalculator.ts');
            assert.equal(save.系统.扩展[LIFESPAN_CACHE_VERSION_KEY], LIFESPAN_CACHE_VERSION);
            // 真实开局：出生 200；224 年进线档的 寿命.当前 是开局缓存值 20，读档现算为 24（见 c01AgeTimeline 检查点用例）。
            assert.equal(save.角色.身份.出生日期.年, 200, `${name}: 出生年`);
            for (const [id, year] of [['lcq.character.yue_shuang', 220], ['lcq.character.wang_zhe', 220], ['liuchao.character.le_mingzhu', 224], ['liuchao.character.pan_jinlian', 224]]) {
              assert.equal(save.社交.关系[id].首见年, year, `${name}: ${id} 首见年`);
            }
            for (const npc of Object.values(slot.存档数据.社交.关系)) {
              assert.ok(Number.isInteger(npc.首见年), `${name}: 首见年必须落账`);
              assert.ok(npc.首见年 <= slot.存档数据.元数据.时间.年);
            }
          }
        }
        assert.deepEqual(actual, expected, name);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
