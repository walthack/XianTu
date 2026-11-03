/** API 配置页策略；只接收连接元信息，不读取凭据。 */
import { DUAL_MODEL_CONFIG, needsPaidConfirm } from './dualModelConfig';
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

/** 同步确认后才提交变更；取消不会写确认记录或改配置。 */
export function applyConfirmedBackendChange(
  connection: BackendConnection | null,
  isDevBuild: boolean,
  actions: {
    isConfirmed: (apiId: string, model: string) => boolean;
    confirm: (message: string) => boolean;
    remember: (apiId: string, model: string) => void;
    apply: () => void;
  },
): boolean {
  if (connection && needsPaidConfirm(connection.model, isDevBuild, actions.isConfirmed(connection.id, connection.model))) {
    const { backend, ui } = DUAL_MODEL_CONFIG.dualModel;
    if (!actions.confirm(ui.paidConfirmation.replace('{hourlyBudget}', String(backend.hourlyBudget)))) return false;
    actions.remember(connection.id, connection.model);
  }
  actions.apply();
  return true;
}
