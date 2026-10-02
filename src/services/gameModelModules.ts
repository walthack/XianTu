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
  if (['intent', 'narrative', 'memory', 'audit'].includes(definition.id)) {
    // 识别、演出、记忆、审计统一走 MiniMax-M3 并关闭思考；无配置时明确报错。
    const usable = api.apiConfigs.filter(item => item.enabled && /^MiniMax-M3$/i.test(item.model)
      && /^https:\/\/api\.minimax(?:i)?\.(?:com|io)(?:\/|$)/i.test(item.url));
    const selected = !inherited && config && usable.some(item => item.id === config.id)
      ? config : usable[0];
    if (!selected) throw new Error('模块需要已启用的 MiniMax-M3 直连配置（支持关闭 reasoning），请在 API 设置中配置。');
    return { config: selected, inherited: false };
  }
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

/** 四个游戏模块共用可关闭思考的 MiniMax-M3 直连；独立分配有效时优先。 */
export function runGameModelModule(moduleId: string, input: ModelModuleInput) {
  return createModuleModelRuntime({
    definitions: GAME_MODEL_MODULES,
    resolveRoute: resolveGameModuleRoute,
    isEnabled: isGameModuleEnabled,
    generate: options => aiService.generate(options),
  }).run(moduleId, input);
}
