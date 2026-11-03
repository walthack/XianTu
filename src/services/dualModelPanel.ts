/** API 配置页策略；只接收连接元信息，不读取凭据。 */
import { DUAL_MODEL_CONFIG } from './dualModelConfig';
import { backendReasoningParam } from './aiReasoningModelPolicy';

export interface BackendConnection { id: string; model: string; url: string }

export function backendPanelState(connection: BackendConnection | null, inherited: boolean) {
  const { backend, ui } = DUAL_MODEL_CONFIG.dualModel;
  return {
    supportsReasoning: !!connection && 'reasoning_effort' in backendReasoningParam(connection.url, connection.model, true, 'max'),
    inheritedWarning: inherited && !!connection && connection.model.trim().toLowerCase() !== backend.defaultModel.toLowerCase()
      ? ui.inheritedModelWarning.replace('{model}', backend.defaultModel) : '',
    defaultEffortLabel: ui.defaultEffortLabel.replace('{effort}', backend.reasoningEffort),
  };
}
