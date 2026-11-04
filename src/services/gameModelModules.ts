import { isContentModerationError, toUserFacingAIError } from './apiErrorMessage';
import { ModuleNarrativeGuardError } from '@/modules/scenarioMods/modularTurn';
import { useAPIManagementStore } from '@/stores/apiManagementStore';
import { isTavernEnv } from '@/utils/tavern';
import { aiService } from './aiService';
import { noteModelRoute } from '@/modules/diagnostics/narrativeSource';
import {
  beatJudgeModuleDefinition, createModuleModelRuntime, GAME_MODEL_MODULES,
  type ModelModuleDefinition, type ModelModuleInput, type ModuleRouteResolution,
} from './moduleModelRuntime';
import { DUAL_MODEL_CONFIG, consistencyEnabled, type BackendReasoningEffort } from './dualModelConfig';

const CONSISTENCY_MODULE_ID = DUAL_MODEL_CONFIG.dualModel.backend.moduleId;

/** 有独立开关的模块；其余模块沿用继承功能的开关。 */
const MODULES_WITH_OWN_SWITCH = new Set(['audit', CONSISTENCY_MODULE_ID]);

export function resolveGameModuleRoute(definition: ModelModuleDefinition): ModuleRouteResolution {
  const api = useAPIManagementStore();
  // 双模型后端（N6-A）：玩家为 consistency 单独选的连接优先，未分配时继承 memory_summary 的连接；
  // 不走主叙事连接，也不经酒馆宿主（宿主承载的是主叙事）。其余模块维持下方统一继承主模型。
  if (definition.id === CONSISTENCY_MODULE_ID) return api.getAPIForModule(definition.id, definition.inheritUsageType);
  // 用户裁定：四个游戏模块统一继承后台主模型，不按模型名或模块独立分配覆盖。
  const config = api.getAPIForType('main');
  const inherited = true;
  // 酒馆端主流程永远由宿主承载；继承主流程的模块不能改走默认直连。
  if (isTavernEnv()) return { config: null, inherited: true, viaHost: true };
  return { config: config || api.apiConfigs.find(item => item.id === 'default' && item.enabled) || null, inherited };
}

export function isGameModuleEnabled(definition: ModelModuleDefinition): boolean {
  const api = useAPIManagementStore();
  // 双模型后端（N3-A）：总闸（dualModelMasterEnabled）与玩家开关任一关即关。
  if (definition.id === CONSISTENCY_MODULE_ID) return consistencyEnabled(api.isModuleEnabled(definition.id));
  return MODULES_WITH_OWN_SWITCH.has(definition.id)
    ? api.isModuleEnabled(definition.id)
    : api.isFunctionEnabled(definition.inheritUsageType);
}

/** 四个游戏模块共用后台主模型；请求策略与连接配置分别冻结。 */
export async function runGameModelModule(moduleId: string, input: ModelModuleInput) {
  const result = await createModuleModelRuntime({
    definitions: GAME_MODEL_MODULES,
    resolveRoute: resolveGameModuleRoute,
    isEnabled: isGameModuleEnabled,
    backendReasoningEffort: definition => useAPIManagementStore().getModuleReasoningEffort(definition.id),
    generate: async options => {
      try { return await aiService.generate(options); }
      catch (error) {
        // lcq-allow: 传输层已记录 LCQ-NET-012；这里只保留 cause 并转换本地正文守卫。
        if (!isContentModerationError(error)) throw error;
        throw Object.assign(new ModuleNarrativeGuardError(toUserFacingAIError(error, { localFallback: true }).message), { cause: error });
      }
    },
  }).run(moduleId, input);
  // 叙事来源日志（LCQ-NAR-001）取场面描写的模型名用。
  noteModelRoute(moduleId, result.route);
  return result;
}

/**
 * 任务模式拍子判定小请求（story.quest.intentSettle.beatJudge）：连接继承主流程，开关随主流程；
 * 推理档固定取配置（不读玩家的后端档位），usageType＝beat_judge 便于单独记 token。
 */
export async function runBeatJudgeModule(
  judge: { maxTokens: number; maxTokensWithReasoning: number; reasoningEffort: string; timeoutMs: number },
  input: ModelModuleInput,
) {
  const definition = beatJudgeModuleDefinition(judge);
  const result = await createModuleModelRuntime({
    definitions: [definition],
    resolveRoute: resolveGameModuleRoute,
    isEnabled: isGameModuleEnabled,
    backendReasoningEffort: () => judge.reasoningEffort as BackendReasoningEffort,
    generate: options => aiService.generate(options),
  }).run(definition.id, input);
  noteModelRoute(definition.id, result.route);
  return result;
}
