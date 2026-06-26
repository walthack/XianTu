// 内置剧情模板：构建时由 scripts/sync-builtin-mods.mjs 写入 data/ 与 manifest.json。
// 运行时被 manager 播种进库（enabled:false, builtin:true）。本项目使用 Webpack，故用 require.context 聚合。
import type { ScenarioMod } from '../schema';
import manifest from './manifest.json';

const context = require.context('./data', false, /\.json$/);

export const BUILTIN_VERSION: string = manifest.version;

export const BUILTIN_SCENARIO_MODS: ScenarioMod[] = context
  .keys()
  .map(key => context(key) as ScenarioMod)
  .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
