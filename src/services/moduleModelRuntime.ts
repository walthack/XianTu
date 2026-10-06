import type { APIConfig, APIUsageType } from '@/stores/apiManagementStore';
import type { GenerateOptions } from './aiService';

/**
 * 模块卡：模块的身份是职责合同，模型只是其中可替换的一个槽位。
 * 阶段（phase）就是调度顺序，取代原先未注册、不校验的 dependencies 字符串。
 */
export type ModulePhase = 'intake' | 'settle' | 'compile' | 'render' | 'commit' | 'derive' | 'checkpoint';

export interface ModuleModelPolicy {
  /** 单次请求输出上限（含推理）；API 配置的 maxTokens 更小时取更小值。 */
  maxTokens: number;
  reasoningEffort: NonNullable<GenerateOptions['reasoningEffort']>;
  timeoutMs?: number;
  streaming?: boolean;
  timeoutMode?: GenerateOptions['timeoutMode'];
  responseMode: 'text';
}

export interface ModelModuleDefinition {
  id: string;
  purpose: string;
  phase: ModulePhase;
  /** true = 位于玩家等待的关键路径上。 */
  blocking: boolean;
  /** 未单独分配模型时继承的功能配置；也作为传输层的 usageType。 */
  inheritUsageType: APIUsageType;
  /** 传输层计量口径；缺省同 inheritUsageType。 */
  transportUsageType?: APIUsageType;
  /** 模型模块永远不是 authority：none＝不写任何状态；proposal:<范围>＝只提案，由代码验证后提交。 */
  write: 'none' | `proposal:${string}`;
  /** 产物的读取方，为空不准注册。 */
  consumers: readonly string[];
  lifecycle: 'production' | 'dev';
  /** dev 模块必须写明退场条件。 */
  retireWhen?: string;
  /** 指向提示词注册表（getPrompt）的键；为空表示调用方自行提供指令。 */
  promptKey?: string;
  /** hold_on_contract＝识别失败时：在固定事件链上停下保留输入；只剩地方行动时按不结算的自由行动继续。 */
  onFail: 'hold_on_contract' | 'retry_then_legacy' | 'drop';
  onLate: 'drop' | 'apply_next_turn';
  policy: ModuleModelPolicy;
}

export const GAME_MODEL_MODULES: readonly ModelModuleDefinition[] = [
  {
    id: 'intent', purpose: '把玩家自然输入解释成当前合法动作，返回原文证据与置信度', phase: 'intake', blocking: true,
    inheritUsageType: 'main', write: 'proposal:actionId', consumers: ['settle'], lifecycle: 'production',
    onFail: 'hold_on_contract', onLate: 'drop',
    policy: { maxTokens: 4096, reasoningEffort: 'none', responseMode: 'text', streaming: true, timeoutMode: 'content_idle' },
  },
  {
    id: 'narrative', purpose: '把已结算的本轮行动演成第二人称正文', phase: 'render', blocking: true,
    // 精简上下文的演出请求单独计量：不占旧链路每回合 2 次长请求预算，也不触发主叙事截断补救；
    // 截断/越界由 onFail 的同快照重试处理，流式演出仅限制首段正文与空闲时间。
    inheritUsageType: 'main', transportUsageType: 'module_narrative', write: 'none', consumers: ['player', 'memory', 'audit'], lifecycle: 'production',
    promptKey: 'moduleNarrativeSystem', onFail: 'retry_then_legacy', onLate: 'drop',
    policy: { maxTokens: 4096, reasoningEffort: 'none', responseMode: 'text', streaming: true, timeoutMode: 'content_idle' },
  },
  {
    id: 'memory', purpose: '从已提交正文中摘录 1–4 句已发生事实，作为该回合的短期记忆', phase: 'derive', blocking: false,
    inheritUsageType: 'memory_summary', write: 'proposal:短期记忆', consumers: ['短期记忆', 'narrative'], lifecycle: 'production',
    promptKey: 'moduleMemoryInstruction', onFail: 'drop', onLate: 'apply_next_turn',
    policy: { maxTokens: 4096, reasoningEffort: 'none', responseMode: 'text', streaming: true, timeoutMode: 'content_idle' },
  },
  {
    id: 'audit', purpose: '只读后台审计：按检查点做跨回合一致性校验，结果只进本地审计日志', phase: 'checkpoint', blocking: false,
    inheritUsageType: 'main', transportUsageType: 'background_audit', write: 'none', consumers: ['本地审计日志', '试玩反馈台账'],
    lifecycle: 'production', promptKey: 'backgroundAuditInstruction', onFail: 'drop', onLate: 'drop',
    policy: { maxTokens: 4096, reasoningEffort: 'none', responseMode: 'text', streaming: true, timeoutMode: 'content_idle' },
  },
];

/** 注册表合同：在注册时就拒绝不完整的模块卡，而不是等运行时才暴露。 */
export function validateModuleDefinition(definition: ModelModuleDefinition): string[] {
  const errors: string[] = [];
  if (!definition.id?.trim()) errors.push('缺少 id');
  if (!definition.consumers?.length) errors.push(`${definition.id}：消费者为空，不准注册`);
  if (definition.blocking && !['intake', 'render'].includes(definition.phase)) errors.push(`${definition.id}：关键路径模块只能位于 intake/render`);
  if (definition.blocking && definition.onLate !== 'drop') errors.push(`${definition.id}：前台模块迟到只能丢弃`);
  if (definition.lifecycle === 'dev' && !definition.retireWhen?.trim()) errors.push(`${definition.id}：dev 模块必须写明退场条件`);
  if (!(definition.policy?.maxTokens > 0)) errors.push(`${definition.id}：缺少输出预算`);
  return errors;
}

export interface ModuleModelRoute { configId: string; provider: string; model: string; inherited?: boolean; }

/**
 * 解析结果：config 为本次冻结的连接；viaHost=true 表示继承的主流程由宿主（酒馆）承载，
 * 不能以直连覆盖，否则酒馆用户未填 Key 的默认连接会被误用。
 */
export interface ModuleRouteResolution {
  config: APIConfig | null;
  inherited: boolean;
  viaHost?: boolean;
}

export interface ModelModuleInput {
  system: string;
  input: string;
  generationId: string;
  signal?: AbortSignal;
  qingyuTurnId?: string;
  onTransportStart?: () => void;
}

export function createModuleModelRuntime(dependencies: {
  definitions: readonly ModelModuleDefinition[];
  resolveRoute: (definition: ModelModuleDefinition) => ModuleRouteResolution;
  isEnabled: (definition: ModelModuleDefinition) => boolean;
  generate: (options: GenerateOptions) => Promise<string>;
}) {
  const registry = new Map<string, ModelModuleDefinition>();
  for (const definition of dependencies.definitions) {
    if (registry.has(definition.id)) throw new Error(`重复模块：${definition.id}`);
    const errors = validateModuleDefinition(definition);
    if (errors.length) throw new Error(`模块卡不合格：${errors.join('；')}`);
    registry.set(definition.id, { ...definition, consumers: [...definition.consumers], policy: { ...definition.policy } });
  }
  return {
    definition(moduleId: string): ModelModuleDefinition | undefined {
      return registry.get(moduleId);
    },
    async run(moduleId: string, input: ModelModuleInput): Promise<{ raw: string; route: ModuleModelRoute }> {
      const definition = registry.get(moduleId);
      if (!definition) throw new Error(`未注册模块：${moduleId}`);
      if (!dependencies.isEnabled(definition)) throw new Error(`模块功能未启用：${moduleId}`);
      const resolved = dependencies.resolveRoute(definition);
      const policy = definition.policy;
      const shared = {
        usageType: definition.transportUsageType || definition.inheritUsageType,
        background: !definition.blocking,
        timeoutMs: policy.timeoutMs, reasoningEffort: policy.reasoningEffort,
        responseMode: policy.responseMode, should_stream: policy.streaming ?? false, requestMaxRetries: 0,
        timeoutMode: policy.timeoutMode, onTransportStart: input.onTransportStart,
        generation_id: input.generationId, signal: input.signal, qingyuTurnId: input.qingyuTurnId,
        user_input: input.input,
        injects: [{ role: 'system' as const, content: input.system, depth: 4, position: 'in_chat' as const }],
      };
      let route: ModuleModelRoute;
      let request: GenerateOptions;
      if (resolved.viaHost) {
        route = { configId: 'host', provider: 'tavern', model: '宿主主流程', inherited: true };
        request = { ...shared, maxTokens: policy.maxTokens };
      } else {
        const configured = resolved.config;
        if (!configured?.enabled || !configured.model?.trim() || !configured.url?.trim()) throw new Error(`模块没有可用模型配置：${moduleId}`);
        // Snapshot before the first await: changing settings cannot reroute an in-flight task/retry.
        const snapshot = Object.freeze({ ...configured });
        route = { configId: snapshot.id, provider: snapshot.provider, model: snapshot.model, inherited: resolved.inherited };
        const budget = Number.isFinite(snapshot.maxTokens) && snapshot.maxTokens > 0
          ? Math.min(policy.maxTokens, snapshot.maxTokens) : policy.maxTokens;
        request = { ...shared, maxTokens: budget, apiConfigOverride: snapshot };
      }
      let raw: string;
      try { raw = await dependencies.generate(request); } catch (error) {
        // Preserve typed transport errors and cancellation behavior; attach only public route metadata.
        try { if (error && typeof error === 'object') Object.assign(error, { moduleModelRoute: route }); } catch { /* immutable errors */ }
        throw error;
      }
      return { raw, route };
    },
  };
}
