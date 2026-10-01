import { useAPIManagementStore } from '@/stores/apiManagementStore';
import { isTavernEnv } from '@/utils/tavern';
import { aiService } from './aiService';
import {
  createModuleModelRuntime, GAME_MODEL_MODULES,
  type ModelModuleDefinition, type ModelModuleInput, type ModuleRouteResolution,
} from './moduleModelRuntime';

/** 有独立开关的模块；其余模块沿用继承功能的开关。 */
const MODULES_WITH_OWN_SWITCH = new Set(['audit']);

export function resolveGameModuleRoute(definition: ModelModuleDefinition): ModuleRouteResolution {
  const api = useAPIManagementStore();
  const { config, inherited } = api.getAPIForModule(definition.id, definition.inheritUsageType);
  // 酒馆端主流程永远由宿主承载；继承主流程的模块不能改走默认直连。
  if (inherited && definition.inheritUsageType === 'main' && isTavernEnv()) return { config: null, inherited: true, viaHost: true };
  return { config: config || api.apiConfigs.find(item => item.id === 'default' && item.enabled) || null, inherited };
}

export function isGameModuleEnabled(definition: ModelModuleDefinition): boolean {
  const api = useAPIManagementStore();
  return MODULES_WITH_OWN_SWITCH.has(definition.id)
    ? api.isModuleEnabled(definition.id)
    : api.isFunctionEnabled(definition.inheritUsageType);
}

/** 模块按自身分配取模型；未单独配置时继承模块卡声明的功能配置（API 设置 → 回合模块模型）。 */
export function runGameModelModule(moduleId: string, input: ModelModuleInput) {
  return createModuleModelRuntime({
    definitions: GAME_MODEL_MODULES,
    resolveRoute: resolveGameModuleRoute,
    isEnabled: isGameModuleEnabled,
    generate: options => aiService.generate(options),
  }).run(moduleId, input);
}
