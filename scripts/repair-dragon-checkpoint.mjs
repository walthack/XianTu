// 补齐历史测试夹具删去的 V3 容器及当前实体合同；不放宽正式导入器。
import { readFile, writeFile } from 'node:fs/promises';
import lodash from 'lodash';
import { loadTs } from '../tests/loadTs.mjs';
const path = 'tests/fixtures/playtest-5e8f/cp03-dragon-corpse.json';
const raw = JSON.parse(await readFile(process.argv[2] || path, 'utf8'));
const original = raw.saves?.[0]?.存档数据 || raw;
const { repairSaveData, createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const { buildStrictScenarioInitialization } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const { applyContentPackOverlays } = await loadTs('../src/modules/contentPacks/index.ts');
const { migrateRuntimePersonRecords } = await loadTs('../src/modules/scenarioMods/ledger/affinityIdentity.ts');
const { validateSaveDataV3 } = await loadTs('../src/utils/saveValidationV3.ts');
const { assertEntitySaveFormat } = await loadTs('../src/modules/scenarioMods/entitySaveFormat.ts');
const save = repairSaveData(lodash.merge(createMinimalSaveDataV3(), original));
save.元数据.更新时间 = original.元数据.更新时间;
const mod = applyContentPackOverlays(JSON.parse(await readFile('src/modules/scenarioMods/builtins/data/lcq.stage_05b.json','utf8')));
const current = buildStrictScenarioInitialization(mod, original.元数据.更新时间).runtimeState;
const old = save.世界.状态.剧本模组;
// 夹具只有实体 ID 物品/事件和行旅回执；人物运行期旧名由正式投影转换，不伪造格式标签。
const runtime = { ...current, ...old, canon: current.canon, entitySaveFormat: current.entitySaveFormat };
for (const id of runtime.completedEventIds) {
  const event = runtime.events.find(e => e.id === id);
  for (const condition of event?.completion || []) {
    if (condition.path.startsWith('flags.') && condition.operator === 'eq' && condition.value === true) runtime.flags[condition.path.slice(6)] = true;
  }
}
migrateRuntimePersonRecords(runtime);
save.世界.状态.剧本模组 = runtime;
assertEntitySaveFormat(save);
const validation = validateSaveDataV3(save);
if (!validation.isValid) throw Error(JSON.stringify(validation));
await writeFile(path,JSON.stringify({type:'saves',saves:[{存档名:'CP03-龙神尸身搜刮',存档数据:save}]},null,2)+'\n');
console.log('dragon checkpoint validated');
