// 副作用模块：在应用入口(Vite 环境)注入内置剧情模板。
// 单独成文，使 manager.ts 保持纯净（不含 import.meta.glob，jiti 单测可加载）。
import { scenarioModManager } from '../manager';
import { BUILTIN_SCENARIO_MODS, BUILTIN_VERSION } from './index';

scenarioModManager.registerBuiltins(BUILTIN_SCENARIO_MODS, BUILTIN_VERSION);
