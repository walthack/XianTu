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
  // 用户裁定：四个游戏模块统一继承后台主模型，不按模型名或模块独立分配覆盖。
  const config = api.getAPIForType('main');
  const inherited = true;
  // 酒馆端主流程永远由宿主承载；继承主流程的模块不能改走默认直连。
  if (isTavernEnv()) return { config: null, inherited: true, viaHost: true };
  return { config: config || api.apiConfigs.find(item => item.id === 'default' && item.enabled) || null, inherited };
}

export function isGameModuleEnabled(definition: ModelModuleDefinition): boolean {
  const api = useAPIManagementStore();
  return MODULES_WITH_OWN_SWITCH.has(definition.id)
    ? api.isModuleEnabled(definition.id)
    : api.isFunctionEnabled(definition.inheritUsageType);
}

/** 四个游戏模块共用后台主模型；请求策略与连接配置分别冻结。 */
export function runGameModelModule(moduleId: string, input: ModelModuleInput) {
  return createModuleModelRuntime({
    definitions: GAME_MODEL_MODULES,
    resolveRoute: resolveGameModuleRoute,
    isEnabled: isGameModuleEnabled,
    generate: options => aiService.generate(options),
  }).run(moduleId, input);
}
