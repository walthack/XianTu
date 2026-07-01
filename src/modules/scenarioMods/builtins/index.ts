// 内置剧情模板：构建时由 scripts/sync-builtin-mods.mjs 写入 data/ 与 manifest.json。
// 运行时被 manager 播种进库（enabled:false, builtin:true）。本项目使用 Webpack，故用 require.context 聚合。
import type { ScenarioMod } from '../schema';
import manifest from './manifest.json';
import { resolveScenarioCharacters } from '../characterResolver';

const context = require.context('./data', false, /\.json$/);

// 版本 = 内容哈希 + 播种逻辑版本(seed schema)。改播种逻辑/需强制全库对账时 bump 后缀。
export const BUILTIN_VERSION: string = `${manifest.version}.s2`;

export const BUILTIN_SCENARIO_MODS: ScenarioMod[] = context
  .keys()
  .map(key => {
    // 全量 P4：内置 stage 里角色只存动态字段，静态档案在此按 registry 还原为完整角色。
    const mod = context(key) as ScenarioMod;
    resolveScenarioCharacters(mod.canon?.characters as unknown as any[], mod.manifest.id);
    return mod;
  })
  .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
