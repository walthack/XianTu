/**
 * 统一AI服务 - 支持酒馆和自定义API
 *
 * 双模式架构：
 * 1. 酒馆模式（Tavern）:
 *    - 主API（main）: 永远通过酒馆TavernHelper调用，使用酒馆配置的API
 *    - 辅助功能（cot/text_optimization等）: 如果配置了独立API，则使用自定义API调用
 *
 * 2. 网页模式（Web/Custom）:
 *    - 所有功能都通过配置的自定义API调用
 *    - 可为不同功能分配不同的API
 */
import axios from 'axios';
import { AiRequestTimeoutError, isAiRequestTimeout, withAiRequestDeadline } from './aiRequestDeadline';
import type { APIUsageType, APIConfig as StoreAPIConfig } from '@/stores/apiManagementStore';
import { buildOpenAICompatibleEndpoint, normalizeOpenAIBaseUrl } from './openAIEndpoint';
import { toUserFacingAIError } from './apiErrorMessage';
import {
  isTruncatedFinishReason,
  isOutputTruncationError,
  isNonRetryableAiError,
  OutputTruncationError,
  recordAiRequestDiagnostic,
  readUsageTotals,
} from './aiResponseTermination';
import {
  salvageCompleteNarrativeResponse,
  serializeSalvagedNarrativeResponse,
} from './narrativeResponseSalvage';
import { optionalReasoningParam } from './optionalReasoningParams';
import {
  consumeQingyuTurnLongRequest,
  peekActiveQingyuTurnId,
  remainingQingyuTurnTimeMs,
  QingyuTurnLongRequestBudgetError,
} from './qingyuTurnLongRequests';
import {
  noteGenerateComplete,
  noteGenerateStart,
  wrapTelemetryStreamChunk,
} from '@/utils/turnTelemetry';

// ============ API提供商类型 ============
export type APIProvider = 'openai' | 'claude' | 'gemini' | 'deepseek' | 'zhipu' | 'xai' | 'openrouter' | 'ollama' | 'siliconflow-embedding' | 'custom';

// ============ 配置接口 ============
export interface AIConfig {
  mode: 'tavern' | 'custom';
  streaming?: boolean;
  memorySummaryMode?: 'raw' | 'standard';
  initMode?: 'generate' | 'generateRaw';
  maxRetries?: number; // API调用失败后的重试次数，默认1
  customAPI?: {
    provider: APIProvider;  // API提供商
    url: string;
    apiKey: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
    forceJsonOutput?: boolean;
  };
}

type DirectAPIConfig = NonNullable<AIConfig['customAPI']>;
type QingyuTransportBudget = {
  usageType?: string;
  maxTokens?: number;
  qingyuTurnId?: string;
  reasoningEffort?: 'none' | 'low';
};
const qingyuTransportBudgetBySignal = new WeakMap<AbortSignal, QingyuTransportBudget>();

// API提供商预设配置
export const API_PROVIDER_PRESETS: Record<APIProvider, {
  url: string;
  defaultModel: string;
  name: string;
  defaultMaxTokens?: number;
  maxOutputTokens?: number;
}> = {
  openai: { url: 'https://api.openai.com', defaultModel: 'gpt-4o', name: 'OpenAI', defaultMaxTokens: 16000, maxOutputTokens: 128000 },
  claude: { url: 'https://api.anthropic.com', defaultModel: 'claude-sonnet-4-20250514', name: 'Claude', defaultMaxTokens: 16000, maxOutputTokens: 64000 },
  gemini: { url: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-2.0-flash', name: 'Gemini', defaultMaxTokens: 16000, maxOutputTokens: 65536 },
  deepseek: { url: 'https://api.deepseek.com', defaultModel: 'deepseek-v4-flash', name: 'DeepSeek', defaultMaxTokens: 64000, maxOutputTokens: 384000 },
  zhipu: { url: 'https://open.bigmodel.cn', defaultModel: 'glm-4-flash', name: '智谱AI', defaultMaxTokens: 16000, maxOutputTokens: 128000 },
  xai: { url: 'https://api.x.ai', defaultModel: 'grok-4', name: 'xAI / Grok', defaultMaxTokens: 16000, maxOutputTokens: 128000 },
  openrouter: { url: 'https://openrouter.ai/api/v1', defaultModel: 'x-ai/grok-4', name: 'OpenRouter', defaultMaxTokens: 16000, maxOutputTokens: 128000 },
  'siliconflow-embedding': { url: 'https://api.siliconflow.cn', defaultModel: 'BAAI/bge-m3', name: '硅基流动(Embedding)' },
  ollama: { url: 'http://localhost:11434', defaultModel: 'llama3.1', name: 'Ollama(本地)', defaultMaxTokens: 16000, maxOutputTokens: 128000 },
  custom: { url: '', defaultModel: '', name: '自定义(OpenAI兼容)', defaultMaxTokens: 16000, maxOutputTokens: 384000 }
};

/**
 * 是否需要 API 密钥。Ollama 等纯本地 OpenAI 兼容服务不需要密钥；
 * 指向本机地址（localhost/127.0.0.1 等）的自定义服务通常也不需要。
 */
export function providerRequiresApiKey(provider?: APIProvider, url?: string): boolean {
  if (provider === 'ollama') return false;
  const u = (url || '').toLowerCase();
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1/.test(u)) return false;
  return true;
}

const DEEPSEEK_V4_CONTEXT_WINDOW = 1_000_000;
const DEEPSEEK_V4_MAX_OUTPUT_TOKENS = 384_000;

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  /** 模块运行时固定的本次连接配置，不写回API管理，也不随重试重新路由。 */
  apiConfigOverride?: Readonly<DirectAPIConfig>;
  user_input?: string;
  ordered_prompts?: AIMessage[];
  should_stream?: boolean;
  generation_id?: string;
  /** 功能类型，用于多API配置时选择对应的API，不填则使用主API */
  usageType?: APIUsageType;
  injects?: Array<{
    content: string;
    role: 'system' | 'assistant' | 'user';
    depth: number;
    position: 'in_chat' | 'none';
  }>;
  overrides?: {
    world_info_before?: string;
    world_info_after?: string;
  };
  onStreamChunk?: (chunk: string) => void;
  /** 本次调用的输出 token 上限；只收紧当前请求，不改写用户保存的全局 API 配置。 */
  maxTokens?: number;
  /** 本次调用在服务层的隐式重试次数；开局分步状态机设为 0，由外层统一控制总预算。 */
  requestMaxRetries?: number;
  /** 单次生成（含补救）截止与OpenRouter调用级推理预算，不改用户配置。 */
  timeoutMs?: number;
  reasoningEffort?: 'none' | 'low';
  /** 清羽长请求预算所属回合。实际 HTTP/酒馆传输按此 id 计次。 */
  qingyuTurnId?: string;
  /** 后台模块不继承前台回合预算／取消归属。 */
  background?: boolean;
  /** 调用级取消信号；由 AIService 为每次顶层请求创建并向下透传。 */
  signal?: AbortSignal;
  /** 强制JSON格式输出（仅支持OpenAI兼容API，如DeepSeek）*/
  responseFormat?: 'json_object';
  /**
   * 调用级响应模式。默认 configured 保持现有行为：
   * 未显式传 responseFormat 时，仍可被 assigned config 的 forceJsonOutput 设为 json_object。
   * text 压过 assigned config 的 forceJsonOutput，但不改 store／localStorage／用户配置。
   * json_object 明确强制 JSON。
   */
  responseMode?: GenerateResponseMode;
}

export type GenerateResponseMode = 'configured' | 'text' | 'json_object';

export function resolveGenerateResponseFormat(
  options?: { responseMode?: GenerateResponseMode; responseFormat?: 'json_object' },
  assignedConfig?: { forceJsonOutput?: boolean } | null,
): 'json_object' | undefined {
  const mode = options?.responseMode || 'configured';
  if (mode === 'text') return undefined;
  if (mode === 'json_object') return 'json_object';
  return options?.responseFormat || (assignedConfig?.forceJsonOutput ? 'json_object' : undefined);
}

// ============ AI服务类 ============
/** 主叙事调用级输出上限。截断补救不得再放大预算。 */
export const MAIN_NARRATIVE_OUTPUT_CAP = 8192;
/** @deprecated 不再把截断补救膨胀到 16000；保留别名以免旧测试/调用读到空值。 */
export const TRUNCATION_RECOVERY_MAX_TOKENS = MAIN_NARRATIVE_OUTPUT_CAP;

function salvageTruncationError(error: unknown): string | null {
  if (!isOutputTruncationError(error)) return null;
  const salvaged = salvageCompleteNarrativeResponse((error as OutputTruncationError).partialContent || '');
  return salvaged ? serializeSalvagedNarrativeResponse(salvaged) : null;
}

/** 只补救未指定调用级预算的主叙事请求；意图分类等小预算调用截断即失败。 */
export function shouldRecoverTruncation(options: Pick<GenerateOptions, 'usageType' | 'maxTokens' | 'signal'>, error: unknown): boolean {
  if (!isOutputTruncationError(error)) return false;
  if ((error as OutputTruncationError).recoveryAttempted) return false;
  if (options.signal?.aborted) return false;
  if ((options.usageType || 'main') !== 'main') return false;
  return options.maxTokens === undefined;
}

class AIService {
  private config: AIConfig = {
    mode: 'tavern',
    streaming: true,
    memorySummaryMode: 'raw',
    initMode: 'generate',
    maxRetries: 1, // 默认重试1次
    customAPI: {
      provider: 'openai',
      url: '',
      apiKey: '',
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 16000
    }
  };

  // 每个顶层请求各有独立 controller；集合只用于“取消全部”，不会决定单次请求配置或信号。
  private activeAbortControllers = new Set<AbortController>();
  private turnAbortControllers = new Map<string, Set<AbortController>>();
  private controllerTurnIds = new WeakMap<AbortController, string>();

  constructor() {
    this.loadConfig();
  }

  /**
   * 只取消指定清羽回合的在途请求，不得误杀后来者的合法回合。
   */
  abortQingyuTurnRequests(turnId: string) {
    const set = this.turnAbortControllers.get(turnId);
    if (!set) return;
    console.log('[AI服务] 取消指定回合请求', turnId);
    for (const controller of [...set]) {
      controller.abort();
      this.releaseRequestController(controller);
    }
    this.turnAbortControllers.delete(turnId);
  }

  /**
   * 取消所有正在进行的请求（包括重试中的请求）
   */
  cancelAllRequests() {
    console.log('[AI服务] 取消所有请求');
    for (const controller of this.activeAbortControllers) controller.abort();
    this.activeAbortControllers.clear();
    this.turnAbortControllers.clear();
    const tavernHelper = this.getTavernHelper();
    if (tavernHelper) {
      if (typeof (tavernHelper as any).abortGeneration === 'function') {
        (tavernHelper as any).abortGeneration();
      }
      if (typeof (tavernHelper as any).stopGeneration === 'function') {
        (tavernHelper as any).stopGeneration();
      }
      if (typeof (tavernHelper as any).cancelGeneration === 'function') {
        (tavernHelper as any).cancelGeneration();
      }
    }
  }

  private createRequestController(turnId?: string): AbortController {
    const controller = new AbortController();
    this.activeAbortControllers.add(controller);
    const id = turnId || peekActiveQingyuTurnId() || undefined;
    if (id) {
      let set = this.turnAbortControllers.get(id);
      if (!set) {
        set = new Set();
        this.turnAbortControllers.set(id, set);
      }
      set.add(controller);
      this.controllerTurnIds.set(controller, id);
    }
    return controller;
  }

  private releaseRequestController(controller: AbortController): void {
    this.activeAbortControllers.delete(controller);
    const id = this.controllerTurnIds.get(controller);
    if (id) this.turnAbortControllers.get(id)?.delete(controller);
  }

  private async withRequestController<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    inheritedSignal?: AbortSignal,
    turnId?: string,
  ): Promise<T> {
    if (inheritedSignal) return fn(inheritedSignal);
    const controller = this.createRequestController(turnId);
    try {
      return await fn(controller.signal);
    } finally {
      this.releaseRequestController(controller);
    }
  }

  /**
   * 带重试的执行函数
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    operationName: string,
    maxRetriesOverride?: number,
    signal?: AbortSignal,
  ): Promise<T> {
    const maxRetries = maxRetriesOverride ?? this.config.maxRetries ?? 1;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 在每次尝试前检查是否已取消
        if (signal?.aborted) {
          console.log(`[AI服务] ${operationName} 已被取消，停止执行`);
          throw new Error('请求已被取消');
        }

        if (attempt > 0) {
          console.log(`[AI服务] ${operationName} 重试第 ${attempt}/${maxRetries} 次`);
        }

        return await fn();
      } catch (error) {
        lastError = error as Error;

        // 如果是取消操作，立即停止，不重试
        if (signal?.aborted || lastError.message?.includes('取消') || lastError.message?.includes('abort')) {
          console.log(`[AI服务] ${operationName} 检测到取消信号，立即停止`);
          throw lastError;
        }
        if (isNonRetryableAiError(lastError)) {
          throw lastError;
        }

        // 如果还有重试机会，等待后继续
        if (attempt < maxRetries) {
          console.warn(`[AI服务] ${operationName} 失败，准备重试:`, lastError.message);

          // 在延迟期间也检查取消状态
          const delayMs = 1000 * (attempt + 1);
          const checkInterval = 100; // 每100ms检查一次
          for (let waited = 0; waited < delayMs; waited += checkInterval) {
            if (signal?.aborted) {
              console.log(`[AI服务] ${operationName} 在重试等待期间被取消`);
              throw new Error('请求已被取消');
            }
            await new Promise(resolve => setTimeout(resolve, Math.min(checkInterval, delayMs - waited)));
          }
        }
      }
    }

    throw lastError || new Error(`${operationName} 失败`);
  }

  private syncModeWithEnvironment() {
    this.config.mode = this.isTavernEnvironment() ? 'tavern' : 'custom';
  }

  private loadConfig() {
    try {
      const saved = localStorage.getItem('ai_service_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.config = { ...this.config, ...parsed };
        console.log('[AI服务] 配置已加载:', this.config.mode);
        // 强制按运行环境选择默认模式：酒馆=酒馆API，非酒馆=自定义API
        this.syncModeWithEnvironment();
        return;
      }
      // 没有保存配置时：酒馆默认用酒馆模式，网页版默认用自定义API
      this.syncModeWithEnvironment();
    } catch (e) {
      console.error('[AI服务] 加载配置失败:', e);
    }
  }

  saveConfig(config: Partial<AIConfig>) {
    this.config = { ...this.config, ...config };
    // 强制按运行环境选择默认模式：酒馆=酒馆API，非酒馆=自定义API
    this.syncModeWithEnvironment();
    // 自动清理自定义API URL末尾的 /v1 和 / 后缀
    if (this.config.customAPI?.url) {
      this.config.customAPI.url = this.config.customAPI.url
        .replace(/\/v1\/?$/, '')  // 移除末尾的 /v1 或 /v1/
        .replace(/\/+$/, '');      // 移除末尾的斜杠
    }
    localStorage.setItem('ai_service_config', JSON.stringify(this.config));
    console.log('[AI服务] 配置已保存:', this.config.mode);
  }

  /**
   * 直接使用指定API配置进行测试（绕过环境检测，强制直连）
   */
  async testAPIDirectly(apiConfig: {
    provider: APIProvider;
    url: string;
    apiKey: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
    forceJsonOutput?: boolean;
  }, testPrompt: string): Promise<string> {
    console.log(`[AI服务] 直接测试API: ${apiConfig.url}, model: ${apiConfig.model}`);

    return this.withRequestController(async (signal) => {
      if (apiConfig.provider === 'ollama') {
        return this.testOllamaAPIDirectly(apiConfig, testPrompt, signal);
      }
      const directConfig: DirectAPIConfig = {
        provider: apiConfig.provider,
        url: apiConfig.url.replace(/\/v1\/?$/, '').replace(/\/+$/, ''),
        apiKey: apiConfig.apiKey,
        model: apiConfig.model,
        temperature: apiConfig.temperature ?? 0.7,
        maxTokens: apiConfig.maxTokens ?? 1000,
        forceJsonOutput: apiConfig.forceJsonOutput
      };
      return this.generateWithCustomAPI({
        user_input: testPrompt,
        should_stream: false,
        signal,
      }, directConfig);
    });
  }

  private getOllamaBaseUrl(url: string): string {
    return (url || API_PROVIDER_PRESETS.ollama.url)
      .replace(/\/v1\/?$/i, '')
      .replace(/\/api\/chat\/?$/i, '')
      .replace(/\/api\/generate\/?$/i, '')
      .replace(/\/+$/, '');
  }

  private async resolveOllamaModel(baseUrl: string, model: string, signal?: AbortSignal): Promise<string> {
    const requested = (model || '').trim();
    if (!requested) return requested;

    try {
      const response = await axios.get(`${baseUrl}/api/tags`, {
        timeout: 10000,
        signal
      });
      const models: string[] = (response.data?.models || [])
        .map((item: any) => item?.model || item?.name)
        .filter((name: any): name is string => typeof name === 'string' && name.length > 0);

      if (models.includes(requested)) return requested;

      const shortName = requested.includes('/') ? requested.split('/').pop()! : requested;
      const matched = models.find(name => name.endsWith(`/${shortName}`));
      if (matched) {
        console.log(`[AI服务-Ollama测试] 模型短名 ${requested} 已匹配为 ${matched}`);
        return matched;
      }
    } catch (error) {
      console.warn('[AI服务-Ollama测试] 获取模型列表失败，继续使用原模型名:', error);
    }

    return requested;
  }

  private async testOllamaAPIDirectly(apiConfig: {
    url: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  }, testPrompt: string, signal?: AbortSignal): Promise<string> {
    const baseUrl = this.getOllamaBaseUrl(apiConfig.url);
    const proxyBaseUrl = this.getOllamaProxyBaseUrl();

    try {
      return await this.testOllamaViaBaseUrl(baseUrl, apiConfig, testPrompt, signal);
    } catch (error) {
      if (proxyBaseUrl && this.isNetworkError(error)) {
        console.warn('[AI服务-Ollama测试] 浏览器直连失败，改用同源代理重试:', error);
        return this.testOllamaViaBaseUrl(proxyBaseUrl, apiConfig, testPrompt, signal);
      }
      throw error;
    }
  }

  private getOllamaProxyBaseUrl(): string | null {
    if (typeof window === 'undefined' || !window.location?.origin) return null;
    return `${window.location.origin}/ollama-api`;
  }

  private isNetworkError(error: unknown): boolean {
    return (axios.isAxiosError(error) && !error.response) ||
      (error instanceof Error && /network error/i.test(error.message));
  }

  private async testOllamaViaBaseUrl(baseUrl: string, apiConfig: {
    model: string;
    temperature?: number;
    maxTokens?: number;
  }, testPrompt: string, signal?: AbortSignal): Promise<string> {
    const model = await this.resolveOllamaModel(baseUrl, apiConfig.model, signal);

    if (!model) {
      throw new Error('请先配置Ollama模型名称');
    }

    const requestBody = {
      model,
      messages: [
        {
          role: 'user',
          content: testPrompt
        }
      ],
      stream: false,
      think: false,
      options: {
        temperature: apiConfig.temperature ?? 0.7,
        num_predict: Math.max(apiConfig.maxTokens ?? 1000, 256)
      }
    };

    try {
      const response = await axios.post(`${baseUrl}/api/chat`, requestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000,
        signal
      });

      const message = response.data?.message;
      const content = message?.content || response.data?.response || message?.thinking || '';
      console.log(`[AI服务-Ollama测试] 响应长度: ${content.length}`);
      return content;
    } catch (error) {
      console.error('[AI服务-Ollama测试] 失败:', error);
      if (axios.isAxiosError(error)) {
        const detail = typeof error.response?.data === 'string'
          ? error.response.data
          : error.response?.data?.error || error.message;
        if (error.response?.status === 404) {
          throw new Error(`Ollama端点不存在，请检查地址: ${baseUrl}`);
        }
        throw new Error(`Ollama连接失败: ${detail}`);
      }
      throw error;
    }
  }

  getConfig(): AIConfig {
    return { ...this.config };
  }

  /**
   * 获取可用模型列表
   */
  async fetchModels(): Promise<string[]> {
    const apiConfig = this.config.customAPI ? { ...this.config.customAPI } : null;
    if (!apiConfig) throw new Error('请先配置API地址');
    return this.withRequestController(signal => this.fetchModelsWithConfig(apiConfig, signal));
  }

  async fetchModelsForConfig(apiConfig: DirectAPIConfig): Promise<string[]> {
    const snapshot: DirectAPIConfig = {
      ...apiConfig,
      url: apiConfig.url.replace(/\/v1\/?$/, '').replace(/\/+$/, ''),
    };
    return this.withRequestController(signal => this.fetchModelsWithConfig(snapshot, signal));
  }

  private async fetchModelsWithConfig(apiConfig: DirectAPIConfig, signal: AbortSignal): Promise<string[]> {
    const needsKey = providerRequiresApiKey(apiConfig.provider, apiConfig.url);
    if (!apiConfig.url || (needsKey && !apiConfig.apiKey)) {
      throw new Error(needsKey ? '请先配置API地址和密钥' : '请先配置API地址');
    }

    const { provider, url, apiKey } = apiConfig;
    const baseUrl = normalizeOpenAIBaseUrl(url);

    try {
      switch (provider) {
        case 'gemini': {
          // Gemini API: GET /v1beta/models?key={apiKey}
          // 注意：官方Gemini使用查询参数，但某些中转服务可能使用Bearer token
          try {
            // 首先尝试使用查询参数方式（官方Gemini格式）
            const response = await axios.get(`${baseUrl}/v1beta/models?key=${apiKey}`, {
              signal,
              timeout: 10000
            });

            // 过滤出支持 generateContent 的模型
            const models = response.data.models || [];
            return models
              .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
              .map((m: any) => m.name.replace('models/', ''));
          } catch (error) {
            // 如果查询参数方式失败，尝试使用Bearer token方式（中转服务可能使用）
            if (axios.isAxiosError(error) && error.response?.status === 401) {
              console.warn('[AI服务] Gemini查询参数认证失败，尝试Bearer token方式');
              try {
                const response = await axios.get(`${baseUrl}/v1beta/models`, {
                  headers: { 'Authorization': `Bearer ${apiKey}` },
                  signal,
                  timeout: 10000
                });

                const models = response.data.models || [];
                return models
                  .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
                  .map((m: any) => m.name.replace('models/', ''));
              } catch (bearerError) {
                console.error('[AI服务] Bearer token方式也失败:', bearerError);
              }
            }

            console.error('[AI服务] Gemini模型列表获取失败:', error);
            // 如果所有方式都失败，返回常用模型
            console.warn('[AI服务] 返回Gemini预设模型列表');
            return [
              'gemini-2.0-flash-exp',
              'gemini-exp-1206',
              'gemini-2.0-flash-thinking-exp-1219',
              'gemini-1.5-pro',
              'gemini-1.5-flash',
              'gemini-1.5-flash-8b'
            ];
          }
        }

        case 'claude': {
          // Claude API 不提供模型列表端点，返回常用模型列表
          console.warn('[AI服务] Claude API不支持获取模型列表，返回预设模型');
          return [
            'claude-3-5-sonnet-20241022',
            'claude-3-5-haiku-20241022',
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307'
          ];
        }

        case 'siliconflow-embedding': {
          // 硅基流动 Embedding 模型：使用 sub_type=embedding 过滤
          try {
            const response = await axios.get(`${buildOpenAICompatibleEndpoint(baseUrl, 'models')}?sub_type=embedding`, {
              headers: { 'Authorization': `Bearer ${apiKey}` },
              signal,
              timeout: 10000
            });

            const models = response.data.data?.map((m: any) => m.id) || [];
            if (models.length > 0) {
              return models;
            }
          } catch (fetchError) {
            console.warn('[AI服务] 获取硅基流动Embedding模型列表失败:', fetchError);
          }
          // 返回预设的 Embedding 模型列表
          return [
            'BAAI/bge-m3',
            'Pro/BAAI/bge-m3',
            'BAAI/bge-large-zh-v1.5',
            'BAAI/bge-large-en-v1.5',
            'netease-youdao/bce-embedding-base_v1',
            'Qwen/Qwen3-Embedding-8B',
            'Qwen/Qwen3-Embedding-4B',
            'Qwen/Qwen3-Embedding-0.6B'
          ];
        }

        case 'openai':
        case 'deepseek':
        case 'ollama':
        case 'custom':
        default: {
          // OpenAI 兼容 API: GET /v1/models
          try {
            const response = await axios.get(buildOpenAICompatibleEndpoint(baseUrl, 'models'), {
              headers: { 'Authorization': `Bearer ${apiKey}` },
              signal,
              timeout: 10000
            });

            const models = response.data.data?.map((m: any) => m.id) || [];

            // 如果成功获取到模型列表，返回
            if (models.length > 0) {
              return models;
            }

            // 如果返回空列表，根据provider返回预设列表
            console.warn('[AI服务] API返回空模型列表，使用预设列表');
            return this.getPresetModels(provider, baseUrl);
          } catch (fetchError) {
            // 如果获取失败，返回预设模型列表
            console.warn('[AI服务] 获取模型列表失败，使用预设列表:', fetchError);
            return this.getPresetModels(provider, baseUrl);
          }
        }
      }
    } catch (error) {
      console.error('[AI服务] 获取模型列表失败:', error);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('API密钥无效或已过期');
        } else if (error.response?.status === 404) {
          throw new Error('API端点不存在，请检查URL配置是否正确');
        } else if (error.response) {
          throw new Error(`获取模型列表失败: ${error.response.status} ${error.response.statusText}`);
        } else if (error.code === 'ECONNABORTED') {
          throw new Error('请求超时，请检查网络连接');
        }
      }
      throw new Error('获取模型列表失败，请检查网络连接和API配置');
    }
  }

  /**
   * 获取预设模型列表（当API获取失败时使用）
   */
  private getPresetModels(provider: APIProvider, baseUrl: string): string[] {
    // 根据URL判断是否为硅基流动
    if (baseUrl.includes('siliconflow.cn')) {
      console.log('[AI服务] 检测到硅基流动API，返回硅基流动预设模型列表');
      return [
        'Qwen/Qwen2.5-7B-Instruct',
        'Qwen/Qwen2.5-14B-Instruct',
        'Qwen/Qwen2.5-32B-Instruct',
        'Qwen/Qwen2.5-72B-Instruct',
        'Qwen/QwQ-32B-Preview',
        'deepseek-ai/DeepSeek-V2.5',
        'deepseek-ai/DeepSeek-R1',
        'Pro/Qwen/Qwen2.5-7B-Instruct',
        'Pro/Qwen/Qwen2.5-14B-Instruct',
        'Pro/Qwen/Qwen2.5-32B-Instruct',
        'Pro/Qwen/Qwen2.5-72B-Instruct'
      ];
    }

    // DeepSeek预设模型
    if (provider === 'deepseek' || baseUrl.includes('deepseek.com')) {
      return [
        'deepseek-v4-flash',
        'deepseek-v4-pro',
        'deepseek-chat',
        'deepseek-reasoner'
      ];
    }

    if (provider === 'xai' || baseUrl.includes('api.x.ai')) {
      return [
        'grok-4',
        'grok-3',
        'grok-3-fast',
        'grok-3-mini',
        'grok-3-mini-fast'
      ];
    }

    if (provider === 'openrouter' || baseUrl.includes('openrouter.ai')) {
      return [
        'x-ai/grok-4',
        'x-ai/grok-3',
        'x-ai/grok-3-mini',
        'openai/gpt-4o',
        'anthropic/claude-sonnet-4'
      ];
    }

    // OpenAI预设模型
    if (provider === 'openai' || baseUrl.includes('openai.com')) {
      return [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'gpt-3.5-turbo'
      ];
    }

    // 默认返回通用模型列表
    return [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-3.5-turbo',
      'deepseek-v4-flash'
    ];
  }

  /**
   * 根据 usageType 获取对应的 API 配置
   * 返回 null 表示使用默认配置（aiService.customAPI 或酒馆代理）。
   *
   * 额外兜底：
   * - 当某个功能仍使用 default 分配时，如果主流程（main）分配了非 default 的独立 API，
   *   则该功能默认跟随 main，避免出现“主流程能用但某些生成按钮用不了”的割裂体验。
   */
  private getAPIConfigForUsageType(usageType?: APIUsageType): StoreAPIConfig | null {
    if (!usageType) return null;

    try {
      // 动态导入 store 避免循环依赖
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useAPIManagementStore } = require('@/stores/apiManagementStore');
      const apiStore = useAPIManagementStore();

      // 获取该功能分配的 API
      const apiConfig = apiStore.getAPIForType(usageType);
      if (!apiConfig) return null;

      // 该功能明确分配了非 default API：直接使用
      if (apiConfig.id !== 'default') return apiConfig;

      // 该功能仍为 default：如果 main 使用了独立 API，则跟随 main（提升可用性）
      if (usageType !== 'main') {
        const mainApi = apiStore.getAPIForType('main');
        if (mainApi && mainApi.id !== 'default') return mainApi;
      }

      // 🔥 返回 default API 配置（而不是 null），以便读取 forceJsonOutput 等设置
      return apiConfig;
    } catch (e) {
      console.warn('[AI服务] 获取功能API配置失败，使用默认配置:', e);
      return null;
    }
  }

  /**
   * 标准生成（带角色卡、聊天历史）
   *
   * 酒馆端逻辑：
   * - usageType='main' 或未指定 → 永远走酒馆TavernHelper
   * - 其他usageType且配置了独立API → 走自定义API
   *
   * 网页端逻辑：
   * - 根据usageType查找对应API配置
   * - 如果没有配置独立API，使用默认API
   */
  async generate(options: GenerateOptions): Promise<string> {
    const turnId = options.background ? `background_${options.generation_id || Date.now()}`
      : options.qingyuTurnId ?? peekActiveQingyuTurnId() ?? undefined;
    if (options.background) options = { ...options, qingyuTurnId: turnId };
    const remaining = remainingQingyuTurnTimeMs(turnId);
    const totalMs = options.timeoutMs === undefined ? remaining
      : remaining === null ? options.timeoutMs : Math.min(options.timeoutMs, remaining);
    if (totalMs === null) return this.generateWithinBudget(options);
    if (totalMs <= 0) throw new AiRequestTimeoutError('total', 60000);
    const controller = this.createRequestController(turnId);
    const onAbort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      if (options.signal?.aborted) onAbort();
      return await withAiRequestDeadline(signal => this.generateWithinBudget({
        ...options, qingyuTurnId: turnId, signal,
      }), { signal: controller.signal, totalMs, firstByteMs: totalMs });
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
      this.releaseRequestController(controller);
    }
  }

  private async generateWithinBudget(options: GenerateOptions): Promise<string> {
    const withTurn: GenerateOptions = {
      ...options,
      qingyuTurnId: options.qingyuTurnId ?? peekActiveQingyuTurnId() ?? undefined,
    };
    try {
      return await this.generateOnce(withTurn);
    } catch (error) {
      if (error instanceof QingyuTurnLongRequestBudgetError) throw error;
      const salvaged = salvageTruncationError(error);
      if (salvaged) return salvaged;
      if (!shouldRecoverTruncation(withTurn, error)) throw error;
      // 主叙事截断只补救一次，且不把预算从 8192 膨胀到 16000。
      console.warn(`[AI服务] 主叙事输出截断，以 maxTokens=${MAIN_NARRATIVE_OUTPUT_CAP} 自动补救一次（不放大预算）`);
      try {
        return await this.generateOnce({
          ...withTurn,
          maxTokens: MAIN_NARRATIVE_OUTPUT_CAP,
          requestMaxRetries: 0,
          should_stream: false,
          onStreamChunk: undefined,
        });
      } catch (retryError) {
        const recovered = salvageTruncationError(retryError);
        if (recovered) return recovered;
        if (isOutputTruncationError(retryError)) {
          throw new OutputTruncationError({
            budget: MAIN_NARRATIVE_OUTPUT_CAP,
            usageType: options.usageType || 'main',
            attempt: 1,
            recoveryAttempted: true,
            partialContent: (retryError as OutputTruncationError).partialContent,
          });
        }
        throw retryError;
      }
    }
  }

  private bindQingyuTransportBudget(signal: AbortSignal | undefined, options: GenerateOptions): void {
    if (!signal) return;
    qingyuTransportBudgetBySignal.set(signal, {
      usageType: options.usageType || 'main',
      reasoningEffort: options.reasoningEffort ?? (remainingQingyuTurnTimeMs(options.qingyuTurnId) !== null ? 'low' : undefined),
      maxTokens: options.maxTokens,
      qingyuTurnId: options.qingyuTurnId ?? peekActiveQingyuTurnId() ?? undefined,
    });
  }

  /** 每次实际 long transport（含网络重试与非流降级）计一次预算。非清羽回合 consume 直接放行。 */
  private chargeQingyuLongTransport(signal?: AbortSignal): void {
    const bound = signal ? qingyuTransportBudgetBySignal.get(signal) : undefined;
    const options = bound || {
      usageType: 'main' as const,
      qingyuTurnId: peekActiveQingyuTurnId() ?? undefined,
    };
    if (!consumeQingyuTurnLongRequest(options, options.qingyuTurnId)) {
      throw new QingyuTurnLongRequestBudgetError();
    }
  }

  private async generateOnce(options: GenerateOptions): Promise<string> {
    return this.withRequestController(async (signal) => {
      this.bindQingyuTransportBudget(signal, options);
      try {
        return await this.executeWithRetry(async () => {
      const requestOptions = { ...options, signal };
      this.syncModeWithEnvironment();
      const usageType = requestOptions.usageType || 'main';
      const assigned = requestOptions.apiConfigOverride || this.getAPIConfigForUsageType(usageType);
      noteGenerateStart({
        provider: assigned?.provider || this.config.customAPI?.provider || null,
        model: assigned?.model || this.config.customAPI?.model || null,
        maxTokens: requestOptions.maxTokens ?? assigned?.maxTokens ?? this.config.customAPI?.maxTokens ?? null,
        jsonObject: resolveGenerateResponseFormat(requestOptions, assigned) === 'json_object',
      });
      requestOptions.onStreamChunk = wrapTelemetryStreamChunk(requestOptions.onStreamChunk);
      console.log(`[AI服务] 调用generate，模式: ${this.config.mode}, usageType: ${usageType}, hasOnStreamChunk=${!!requestOptions.onStreamChunk}`);

      if (requestOptions.apiConfigOverride) {
        return this.generateWithAPIConfig(requestOptions, requestOptions.apiConfigOverride);
      }

      // 酒馆模式特殊处理
      if (this.config.mode === 'tavern') {
        // 检查是否配置了独立API（必须是非 default；default 在酒馆端表示“使用酒馆配置”）
        const apiConfig = this.getAPIConfigForUsageType(usageType);

        // 如果配置了独立API，直接请求，不走酒馆代理
        if (apiConfig && apiConfig.id !== 'default') {
          console.log(`[AI服务-酒馆] 功能[${usageType}]使用独立API直连: ${apiConfig.name}`);
          // 如果API配置启用了强制JSON输出，设置responseFormat
          if (resolveGenerateResponseFormat(requestOptions, apiConfig) === 'json_object') {
            requestOptions.responseFormat = 'json_object';
          }
          return this.generateWithAPIConfig(requestOptions, {
            provider: apiConfig.provider,
            url: apiConfig.url,
            apiKey: apiConfig.apiKey,
            model: apiConfig.model,
            temperature: apiConfig.temperature,
            maxTokens: apiConfig.maxTokens
          });
        }

        // 没有配置独立API（使用default），走酒馆
        console.log(`[AI服务-酒馆] 功能[${usageType}]使用酒馆TavernHelper`);
        return this.generateWithTavern(requestOptions);
      }

      // 网页模式：检查是否需要使用特定功能的 API 配置
      const apiConfig = this.getAPIConfigForUsageType(usageType);
      if (apiConfig) {
        console.log(`[AI服务-网页] 使用功能[${usageType}]分配的API: ${apiConfig.name}`);
        // 如果API配置启用了强制JSON输出，设置responseFormat
        if (resolveGenerateResponseFormat(requestOptions, apiConfig) === 'json_object') {
          requestOptions.responseFormat = 'json_object';
        }
        return this.generateWithAPIConfig(requestOptions, {
          provider: apiConfig.provider,
          url: apiConfig.url,
          apiKey: apiConfig.apiKey,
          model: apiConfig.model,
          temperature: apiConfig.temperature,
          maxTokens: apiConfig.maxTokens
        });
      }

      // 网页模式默认
      return this.generateWithCustomAPI(requestOptions);
        }, `generate[${options.usageType || 'main'}]`, options.requestMaxRetries, signal);
      } finally {
        noteGenerateComplete();
      }
    }, options.signal, options.qingyuTurnId);
  }

  /**
   * 纯净生成（不带角色卡）
   *
   * 酒馆端逻辑：
   * - usageType='main' 或未指定 → 永远走酒馆TavernHelper
   * - 其他usageType且配置了独立API → 走自定义API
   *
   * 网页端逻辑：
   * - 根据usageType查找对应API配置
   * - 如果没有配置独立API，使用默认API
   */
  async generateRaw(options: GenerateOptions): Promise<string> {
    const withTurn: GenerateOptions = {
      ...options,
      qingyuTurnId: options.qingyuTurnId ?? peekActiveQingyuTurnId() ?? undefined,
    };
    return this.withRequestController(async (signal) => {
      this.bindQingyuTransportBudget(signal, withTurn);
      return this.executeWithRetry(async () => {
      const requestOptions = { ...withTurn, signal };
      this.syncModeWithEnvironment();
      const usageType = requestOptions.usageType || 'main';
      console.log(`[AI服务] 调用generateRaw，模式: ${this.config.mode}, usageType: ${usageType}`);

      // 酒馆模式特殊处理
      if (this.config.mode === 'tavern') {
        // 检查是否配置了独立API（必须是非 default；default 在酒馆端表示“使用酒馆配置”）
        const apiConfig = this.getAPIConfigForUsageType(usageType);

        // 如果配置了独立API，直接请求，不走酒馆代理
        if (apiConfig && apiConfig.id !== 'default') {
          console.log(`[AI服务-酒馆] 功能[${usageType}]使用独立API直连(Raw): ${apiConfig.name}`);
          // 如果API配置启用了强制JSON输出，设置responseFormat
          if (resolveGenerateResponseFormat(requestOptions, apiConfig) === 'json_object') {
            requestOptions.responseFormat = 'json_object';
          }
          return this.generateRawWithAPIConfig(requestOptions, {
            provider: apiConfig.provider,
            url: apiConfig.url,
            apiKey: apiConfig.apiKey,
            model: apiConfig.model,
            temperature: apiConfig.temperature,
            maxTokens: apiConfig.maxTokens
          });
        }

        // 没有配置独立API（使用default），走酒馆
        console.log(`[AI服务-酒馆] 功能[${usageType}]使用酒馆TavernHelper(Raw)`);
        return this.generateRawWithTavern(requestOptions);
      }

      // 网页模式：检查是否需要使用特定功能的 API 配置
      const apiConfig = this.getAPIConfigForUsageType(usageType);
      if (apiConfig) {
        console.log(`[AI服务-网页] 使用功能[${usageType}]分配的API: ${apiConfig.name}`);
        // 如果API配置启用了强制JSON输出，设置responseFormat
        if (resolveGenerateResponseFormat(requestOptions, apiConfig) === 'json_object') {
          requestOptions.responseFormat = 'json_object';
        }
        return this.generateRawWithAPIConfig(requestOptions, {
          provider: apiConfig.provider,
          url: apiConfig.url,
          apiKey: apiConfig.apiKey,
          model: apiConfig.model,
          temperature: apiConfig.temperature,
          maxTokens: apiConfig.maxTokens
        });
      }

      // 网页模式默认
      return this.generateRawWithCustomAPI(requestOptions);
    }, `generateRaw[${withTurn.usageType || 'main'}]`, withTurn.requestMaxRetries, signal);
    }, options.signal, withTurn.qingyuTurnId);
  }

  /**
   * 使用指定的API配置进行生成
   * 适用于多API配置场景，可以为不同功能使用不同的API
   */
  async generateWithAPIConfig(
    options: GenerateOptions,
    apiConfig: {
      provider: APIProvider;
      url: string;
      apiKey: string;
      model: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<string> {
    console.log(`[AI服务] 使用指定API配置生成，provider: ${apiConfig.provider}, model: ${apiConfig.model}`);
    const directConfig: DirectAPIConfig = {
        provider: apiConfig.provider,
        url: apiConfig.url,
        apiKey: apiConfig.apiKey,
        model: apiConfig.model,
        temperature: apiConfig.temperature ?? 0.7,
        maxTokens: apiConfig.maxTokens ?? 16000
    };
    return this.withRequestController(
      signal => this.generateWithCustomAPI({ ...options, signal }, directConfig),
      options.signal,
    );
  }

  /**
   * 使用指定的API配置进行纯净生成（不带角色卡）
   */
  async generateRawWithAPIConfig(
    options: GenerateOptions,
    apiConfig: {
      provider: APIProvider;
      url: string;
      apiKey: string;
      model: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<string> {
    console.log(`[AI服务] 使用指定API配置进行纯净生成，provider: ${apiConfig.provider}, model: ${apiConfig.model}`);
    const directConfig: DirectAPIConfig = {
        provider: apiConfig.provider,
        url: apiConfig.url,
        apiKey: apiConfig.apiKey,
        model: apiConfig.model,
        temperature: apiConfig.temperature ?? 0.7,
        maxTokens: apiConfig.maxTokens ?? 16000
    };
    return this.withRequestController(
      signal => this.generateRawWithCustomAPI({ ...options, signal }, directConfig),
      options.signal,
    );
  }

  // ============ 酒馆模式实现 ============
  private async generateWithTavern(options: GenerateOptions): Promise<string> {
    const tavernHelper = this.getTavernHelper();
    if (!tavernHelper) {
      throw new Error(this.isTavernEnvironment()
        ? '酒馆环境不可用，请切换到自定义API模式或在SillyTavern中打开'
        : '当前环境不可用，请切换到自定义API模式');
    }

    console.log('[AI服务-酒馆] 调用tavernHelper.generate');
    try {
      return await this.withRetry('tavern.generate', async () => {
        // 在调用前检查是否已取消
        if (options.signal?.aborted) {
          throw new Error('请求已被取消');
        }
        this.chargeQingyuLongTransport(options.signal);
        return await tavernHelper.generate(options);
      }, { retries: options.requestMaxRetries, signal: options.signal });
    } catch (error) {
      throw this.toUserFacingError(error);
    }
  }

  private async generateRawWithTavern(options: GenerateOptions): Promise<string> {
    const tavernHelper = this.getTavernHelper();
    if (!tavernHelper) {
      throw new Error(this.isTavernEnvironment()
        ? '酒馆环境不可用，请切换到自定义API模式或在SillyTavern中打开'
        : '当前环境不可用，请切换到自定义API模式');
    }

    console.log('[AI服务-酒馆] 调用tavernHelper.generateRaw');
    try {
      const result = await this.withRetry('tavern.generateRaw', async () => {
        // 在调用前检查是否已取消
        if (options.signal?.aborted) {
          throw new Error('请求已被取消');
        }
        this.chargeQingyuLongTransport(options.signal);
        return await tavernHelper.generateRaw(options);
      }, { retries: options.requestMaxRetries, signal: options.signal });
      return String(result);
    } catch (error) {
      throw this.toUserFacingError(error);
    }
  }

  private async withRetry<T>(
    label: string,
    fn: () => Promise<T>,
    opts?: { retries?: number; baseDelayMs?: number; signal?: AbortSignal },
  ): Promise<T> {
    const retries = opts?.retries ?? this.config.maxRetries ?? 2;
    const baseDelayMs = opts?.baseDelayMs ?? 800;

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      // 检查是否已取消
      if (opts?.signal?.aborted) {
        console.log(`[AI服务] ${label} 请求已被取消，停止重试`);
        throw new Error('请求已取消');
      }

      try {
        // 使用 Promise.race 来同时监听函数执行和取消信号
        let checkInterval: NodeJS.Timeout | null = null;
        const abortPromise = new Promise<never>((_, reject) => {
          checkInterval = setInterval(() => {
            if (opts?.signal?.aborted) {
              if (checkInterval) clearInterval(checkInterval);
              reject(new Error('请求已被取消'));
            }
          }, 50); // 每50ms检查一次，更快响应
        });

        try {
          const result = await Promise.race([fn(), abortPromise]);
          // 函数正常完成，清理检查器
          if (checkInterval) clearInterval(checkInterval);
          return result;
        } catch (error) {
          // 出错时也要清理检查器
          if (checkInterval) clearInterval(checkInterval);
          throw error;
        }
      } catch (error) {
        // 再次检查取消状态
        if (opts?.signal?.aborted) {
          console.log(`[AI服务] ${label} 请求已被取消，停止重试`);
          throw new Error('请求已取消');
        }

        lastError = error;
        const retryable = this.isRetryableError(error);
        if (!retryable || attempt >= retries) break;

        const jitter = Math.floor(Math.random() * 250);
        const delay = baseDelayMs * Math.pow(2, attempt) + jitter;
        console.warn(`[AI服务] ${label} 失败，准备重试 (${attempt + 1}/${retries + 1})，${delay}ms`, error);

        // 使用可中断的延迟
        await new Promise((resolve, reject) => {
          let timer: NodeJS.Timeout | null = null;
          let checkAbort: NodeJS.Timeout | null = null;

          const cleanup = () => {
            if (timer) clearTimeout(timer);
            if (checkAbort) clearInterval(checkAbort);
          };

          timer = setTimeout(() => {
            cleanup();
            resolve(undefined);
          }, delay);

          // 如果在等待期间被取消，立即结束
          checkAbort = setInterval(() => {
            if (opts?.signal?.aborted) {
              cleanup();
              reject(new Error('请求已取消'));
            }
          }, 100);
        });
      }
    }
    throw lastError;
  }

  private isRetryableError(error: unknown): boolean {
    if (isNonRetryableAiError(error)) return false;
    const message = (() => {
      if (!error) return '';
      if (typeof error === 'string') return error;
      if (error instanceof Error) return error.message || '';
      return String(error);
    })();

    // axios / fetch-like errors
    const status = (() => {
      const anyErr = error as any;
      return anyErr?.status ?? anyErr?.response?.status ?? anyErr?.cause?.status ?? anyErr?.cause?.response?.status;
    })();

    if (typeof status === 'number') {
      return [408, 409, 425, 429, 500, 502, 503, 504].includes(status);
    }

    // SillyTavern/OpenAI proxy errors often只有 message
    if (/service unavailable/i.test(message)) return true;
    if (/\b(429|500|502|503|504)\b/.test(message)) return true;
    if (/timeout|timed out|network error|fetch failed/i.test(message)) return true;

    return false;
  }

  private toUserFacingError(error: unknown): Error {
    if (error instanceof Error && isNonRetryableAiError(error)) return error;
    return toUserFacingAIError(error);
  }

  /**
   * 递归向上查找 TavernHelper，兼容多层 iframe 嵌套
   * 最多查找 5 层，防止无限循环
   */
  private getTavernHelper(): any {
    if (typeof window === 'undefined') return null;

    // 先检查当前 window
    if ((window as any).TavernHelper) {
      return (window as any).TavernHelper;
    }

    try {
      // 尝试直接访问 top（最顶层窗口）
      if (window.top && window.top !== window && (window.top as any).TavernHelper) {
        return (window.top as any).TavernHelper;
      }
    } catch {
      // 跨域访问失败，忽略
    }

    // 逐层向上查找，最多 5 层
    let currentWindow: Window = window;
    for (let i = 0; i < 5; i++) {
      try {
        if (currentWindow.parent && currentWindow.parent !== currentWindow) {
          if ((currentWindow.parent as any).TavernHelper) {
            return (currentWindow.parent as any).TavernHelper;
          }
          currentWindow = currentWindow.parent;
        } else {
          break;
        }
      } catch {
        // 跨域访问失败，停止向上查找
        break;
      }
    }

    return null;
  }

  private isTavernEnvironment(): boolean {
    return !!this.getTavernHelper();
  }

  /**
   * 检测 API 是否不支持 response_format 参数
   * 某些中转API（如豆包/Doubao、部分Claude中转）不支持该参数
   */
  private isResponseFormatUnsupported(url: string, model: string): boolean {
    const lowerUrl = (url || '').toLowerCase();
    const lowerModel = (model || '').toLowerCase();

    // 豆包/Doubao API 不支持 response_format
    if (lowerUrl.includes('doubao') || lowerUrl.includes('volcengine')) {
      return true;
    }

    // 火山引擎 API
    if (lowerUrl.includes('volc') || lowerUrl.includes('bytedance')) {
      return true;
    }

    // 某些 Claude 中转服务
    if (lowerUrl.includes('anthropic') || lowerModel.includes('claude')) {
      return true;
    }

    // 通义千问某些版本
    if (lowerUrl.includes('dashscope') && !lowerModel.includes('qwen-max')) {
      return true;
    }

    return false;
  }

  // ============ 自定义API模式实现 ============
  private async generateWithCustomAPI(
    options: GenerateOptions,
    requestConfig: DirectAPIConfig | undefined = this.config.customAPI,
  ): Promise<string> {
    if (!requestConfig) {
      throw new Error('自定义API未配置');
    }

    console.log('[AI服务-自定义] 构建消息列表');
    console.log(`[AI服务-自定义] hasOnStreamChunk=${!!options.onStreamChunk}, should_stream=${options.should_stream}`);

    // 构建消息列表
    const messages: AIMessage[] = [];

    // 处理 injects（注入的系统提示词）
    if (options.injects && options.injects.length > 0) {
      // 按 depth 排序（depth越大越靠前）
      const sortedInjects = [...options.injects].sort((a, b) => b.depth - a.depth);
      sortedInjects.forEach(inject => {
        // 跳过占位消息
        if (inject.content === '</input>') {
          return;
        }
        messages.push({
          role: inject.role,
          content: inject.content
        });
      });
      console.log(`[AI服务-自定义] 已添加 ${messages.length} 条inject消息`);
    }

    // 添加用户输入
    if (options.user_input) {
      messages.push({
        role: 'user',
        content: options.user_input
      });
      console.log('[AI服务-自定义] 已添加用户输入');
    }

    const shouldStream = options.should_stream ?? this.config.streaming ?? false;
    // 🔥 读取功能对应的 API 配置的 forceJsonOutput 设置；responseMode=text 可压过它。
    const usageType = options.usageType;
    const assignedConfig = usageType ? this.getAPIConfigForUsageType(usageType) : null;
    const responseFormat = resolveGenerateResponseFormat(options, assignedConfig);
    return this.callAPI(messages, shouldStream, options.onStreamChunk, responseFormat, options.usageType, options.maxTokens, requestConfig, options.signal);
  }

  private async generateRawWithCustomAPI(
    options: GenerateOptions,
    requestConfig: DirectAPIConfig | undefined = this.config.customAPI,
  ): Promise<string> {
    if (!requestConfig) {
      throw new Error('自定义API未配置');
    }

    console.log('[AI服务-自定义Raw] 使用ordered_prompts');

    // 过滤掉占位消息
    const messages = (options.ordered_prompts || []).filter(msg => msg.content !== '</input>');

    console.log(`[AI服务-自定义Raw] 消息数量: ${messages.length}`);
    const shouldStream = options.should_stream ?? this.config.streaming ?? false;
    // 🔥 读取功能对应的 API 配置的 forceJsonOutput 设置；responseMode=text 可压过它。
    const usageType = options.usageType;
    const assignedConfig = usageType ? this.getAPIConfigForUsageType(usageType) : null;
    const responseFormat = resolveGenerateResponseFormat(options, assignedConfig);
    console.log(`[AI服务-自定义Raw] shouldStream=${shouldStream}, hasOnStreamChunk=${!!options.onStreamChunk}, options.should_stream=${options.should_stream}, config.streaming=${this.config.streaming}`);
    return this.callAPI(messages, shouldStream, options.onStreamChunk, responseFormat, options.usageType, options.maxTokens, requestConfig, options.signal);
  }

  private async callAPI(
    messages: AIMessage[],
    streaming: boolean,
    onStreamChunk?: (chunk: string) => void,
    responseFormat?: 'json_object',
    usageType?: APIUsageType,
    maxTokensOverride?: number,
    apiConfig: DirectAPIConfig = this.config.customAPI!,
    signal?: AbortSignal,
  ): Promise<string> {
    const { provider, url, apiKey, model, temperature, maxTokens } = apiConfig;

    // 🔥 某些模型/API不支持 response_format: json_object
    const isReasonerModel = model.includes('reasoner') || model.includes('r1');
    const isClaudeModel = model.includes('claude');
    const isUnsupportedAPI = this.isResponseFormatUnsupported(url, model);
    const shouldSkipResponseFormat = isReasonerModel || isClaudeModel || isUnsupportedAPI;
    const effectiveResponseFormat = (responseFormat && !shouldSkipResponseFormat) ? responseFormat : undefined;
    if (responseFormat && shouldSkipResponseFormat) {
      const reason = isReasonerModel ? 'reasoner模型' : isClaudeModel ? 'Claude模型' : '该API';
      console.log(`[AI服务-API调用] 跳过JSON格式输出（${reason} 不支持 response_format）`);
    }

    // 🔥 DeepSeek 等 API 使用 response_format: json_object 时，要求 prompt 中包含 "json"
    let finalMessages = messages;
    if (effectiveResponseFormat === 'json_object') {
      const hasJsonKeyword = messages.some(msg => msg.content.toLowerCase().includes('json'));
      if (!hasJsonKeyword) {
        finalMessages = [...messages];
        const sysIdx = finalMessages.findIndex(m => m.role === 'system');
        if (sysIdx >= 0) {
          finalMessages[sysIdx] = { ...finalMessages[sysIdx], content: finalMessages[sysIdx].content + '\n\nRespond in JSON format.' };
        } else {
          finalMessages.unshift({ role: 'system', content: 'Respond in JSON format.' });
        }
        console.log('[AI服务-API调用] 已自动添加JSON格式提示（API要求prompt中包含"json"）');
      }
    }

    console.log(`[AI服务-API调用] Provider: ${provider}, URL: ${url}, Model: ${model}, 消息数: ${finalMessages.length}, 流式: ${streaming}, usageType=${usageType || 'main'}`);

    // 根据provider选择不同的调用方式
    switch (provider) {
      case 'claude':
        return this.callClaudeAPI(finalMessages, streaming, onStreamChunk, effectiveResponseFormat, maxTokensOverride, apiConfig, signal);
      case 'gemini':
        return this.callGeminiAPI(finalMessages, streaming, onStreamChunk, effectiveResponseFormat, maxTokensOverride, apiConfig, signal);
      case 'openai':
      case 'deepseek':
      case 'zhipu':
      case 'xai':
      case 'openrouter':
      case 'ollama':
      case 'custom':
      default:
        return this.callOpenAICompatibleAPI(finalMessages, streaming, onStreamChunk, effectiveResponseFormat, usageType, maxTokensOverride, apiConfig, signal);
    }
  }

  // OpenAI兼容格式（OpenAI、DeepSeek、自定义）
  private estimateTokensForText(text: string): number {
    if (!text) return 0;
    let cjkCount = 0;
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      if (code >= 0x4e00 && code <= 0x9fff) cjkCount++;
    }
    const nonCjkCount = Math.max(0, text.length - cjkCount);
    return cjkCount + Math.ceil(nonCjkCount / 4);
  }

  private estimateTokensForMessages(messages: Array<{ content: string }>): number {
    const overheadPerMessage = 8;
    return messages.reduce((sum, msg) => sum + overheadPerMessage + this.estimateTokensForText(msg.content || ''), 0);
  }

  private getApproxContextWindow(provider: APIProvider, model: string): number | null {
    const m = (model || '').toLowerCase();
    const isGrokModel = m.includes('grok') || m.includes('x-ai/');

    // Provider/model with known large context windows
    if (provider === 'claude' || m.includes('claude')) return 200_000;
    if (provider === 'gemini' || m.includes('gemini')) return 1_000_000;

    // Many OpenAI-compatible providers expose these model names; match by model string first.
    if (provider === 'deepseek' || m.includes('deepseek')) return DEEPSEEK_V4_CONTEXT_WINDOW;
    if (provider === 'xai' || isGrokModel) return 256_000;
    if (m.includes('moonshot') || m.includes('kimi')) return 128_000;
    if (provider === 'zhipu' || m.includes('glm')) return 128_000;

    // OpenAI-compatible defaults
    if (m.includes('gpt-4o') || m.includes('gpt-4.1') || m.includes('o1') || m.includes('o3')) return 128_000;
    if (m.includes('gpt-4')) return 128_000;
    if (m.includes('gpt-3.5')) return 16_385;

    // Unknown model: don't guess (this project often uses 10k+ token prompts).
    return null;
  }

  private getApproxMaxOutputTokens(provider: APIProvider, model: string): number | null {
    const m = (model || '').toLowerCase();
    const isGrokModel = m.includes('grok') || m.includes('x-ai/');

    if (provider === 'deepseek' || m.includes('deepseek')) return DEEPSEEK_V4_MAX_OUTPUT_TOKENS;
    if (provider === 'xai' || isGrokModel) return API_PROVIDER_PRESETS.xai.maxOutputTokens || null;
    if (provider === 'openrouter') return API_PROVIDER_PRESETS.openrouter.maxOutputTokens || null;
    if (provider === 'gemini' || m.includes('gemini')) return API_PROVIDER_PRESETS.gemini.maxOutputTokens || null;
    if (provider === 'claude' || m.includes('claude')) return API_PROVIDER_PRESETS.claude.maxOutputTokens || null;
    if (provider === 'zhipu' || m.includes('glm')) return API_PROVIDER_PRESETS.zhipu.maxOutputTokens || null;
    if (provider === 'openai' || m.includes('gpt-') || m.includes('o1') || m.includes('o3')) {
      return API_PROVIDER_PRESETS.openai.maxOutputTokens || null;
    }

    return null;
  }

  private getEffectiveRequestedMaxTokens(
    _provider: APIProvider,
    _model: string,
    requestedMaxTokens: number,
    usageType?: APIUsageType,
    callLevelOverride?: number,
  ): number {
    // 调用级预算（快路/意图/单次恢复）按调用方给出的值走，仍受模型输出上限与上下文夹紧。
    if (typeof callLevelOverride === 'number' && Number.isFinite(callLevelOverride) && callLevelOverride > 0) {
      return callLevelOverride;
    }
    // 主叙事默认配置曾请求 16k 输出；未知模型不猜新规格，保留 8k 安全余量。
    return usageType === 'main' || usageType === undefined
      ? Math.min(requestedMaxTokens, 8192)
      : requestedMaxTokens;
  }

  private clampMaxTokensForOutputLimit(
    provider: APIProvider,
    model: string,
    requestedMaxTokens: number
  ): number {
    const maxOutputTokens = this.getApproxMaxOutputTokens(provider, model);
    if (!maxOutputTokens) return requestedMaxTokens;

    const clamped = Math.min(requestedMaxTokens, maxOutputTokens);
    if (clamped < requestedMaxTokens) {
      console.warn(`[AI服务] maxTokens超过模型输出上限，已自动下调：${requestedMaxTokens} -> ${clamped}（模型最大输出≈${maxOutputTokens}）`);
    }
    return clamped;
  }

  private clampMaxTokensForContext(
    provider: APIProvider,
    model: string,
    messagesForEstimate: Array<{ content: string }>,
    requestedMaxTokens: number
  ): number {
    const outputLimitedMaxTokens = this.clampMaxTokensForOutputLimit(provider, model, requestedMaxTokens);
    const contextWindow = this.getApproxContextWindow(provider, model);
    if (!contextWindow) return outputLimitedMaxTokens;

    const inputTokens = this.estimateTokensForMessages(messagesForEstimate);
    const safety = 512;
    const available = contextWindow - inputTokens - safety;

    if (available < 256) {
      throw new Error(`API上下文长度不足：输入过长（估算输入≈${inputTokens} tokens），请减少世界/提示词长度或更换更大上下文模型。`);
    }

    const clamped = Math.min(outputLimitedMaxTokens, Math.max(256, available));
    if (clamped < outputLimitedMaxTokens) {
      console.warn(`[AI服务] maxTokens过大，已自动下调：${outputLimitedMaxTokens} -> ${clamped}（估算输入≈${inputTokens}，模型上下文≈${contextWindow}）`);
    }
    return clamped;
  }

  private shouldUseMaxCompletionTokens(provider: APIProvider, model: string): boolean {
    const m = (model || '').toLowerCase();
    return provider === 'openai' && (m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4'));
  }

  private applyMaxTokensParam(requestBody: Record<string, unknown>, provider: APIProvider, model: string, maxTokens: number) {
    if (this.shouldUseMaxCompletionTokens(provider, model)) {
      requestBody.max_completion_tokens = maxTokens;
      return;
    }
    requestBody.max_tokens = maxTokens;
  }

  private isStreamUnsupportedError(message: string): boolean {
    const m = (message || '').toLowerCase();
    return (
      (m.includes('stream') && (m.includes('not supported') || m.includes('unsupported') || m.includes('invalid') || m.includes('unknown'))) ||
      m.includes('text/event-stream') ||
      m.includes('sse')
    );
  }

  private async callOpenAICompatibleAPI(
    messages: AIMessage[],
    streaming: boolean,
    onStreamChunk?: (chunk: string) => void,
    responseFormat?: 'json_object',
    usageType?: APIUsageType,
    maxTokensOverride?: number,
    apiConfig: DirectAPIConfig = this.config.customAPI!,
    signal?: AbortSignal,
  ): Promise<string> {
    const { provider, url, apiKey, model, temperature, maxTokens } = apiConfig;
    const requestedMaxTokens = this.getEffectiveRequestedMaxTokens(provider, model, maxTokens ?? 16000, usageType, maxTokensOverride);
    const safeMaxTokens = this.clampMaxTokensForContext(provider, model, messages, requestedMaxTokens);
    const inputChars = messages.reduce((sum, item) => sum + String(item.content || '').length, 0);
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const emitDiagnostic = (attempt: number, finishReason: string | undefined, truncated: boolean, usage?: unknown) => {
      recordAiRequestDiagnostic({
        usageType,
        requestId,
        attempt,
        finishReason,
        budget: safeMaxTokens,
        inputChars,
        usage: readUsageTotals(usage),
        truncated,
      });
    };

    const throwTruncated = (finishReason: unknown, attempt: number, usage?: unknown, partialContent?: string): never => {
      emitDiagnostic(attempt, typeof finishReason === 'string' ? finishReason : undefined, true, usage);
      throw new OutputTruncationError({
        finishReason: typeof finishReason === 'string' ? finishReason : undefined,
        budget: safeMaxTokens,
        usageType,
        requestId,
        attempt,
        recoveryAttempted: false,
        partialContent,
      });
    };

    // 智谱AI使用不同的API路径
    const normalizedUrl = normalizeOpenAIBaseUrl(url);
    const chatEndpoint = provider === 'zhipu'
      ? `${normalizedUrl}/api/paas/v4/chat/completions`
      : buildOpenAICompatibleEndpoint(normalizedUrl, 'chat/completions');

    console.log(`[AI服务-OpenAI兼容] streaming=${streaming}, hasOnStreamChunk=${!!onStreamChunk}`);

    try {
      if (streaming) {
        try {
          this.chargeQingyuLongTransport(signal);
          return await this.streamingRequestOpenAI(url, apiKey, model, messages, temperature || 0.7, safeMaxTokens, onStreamChunk, responseFormat, provider, signal,
            (finishReason, usage) => emitDiagnostic(0, finishReason, isTruncatedFinishReason(finishReason), usage));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!this.isStreamUnsupportedError(msg)) throw e;
          console.warn('[AI服务-OpenAI兼容] 当前API可能不支持流式传输，已自动降级为非流式请求。');

          const requestBody: any = {
            model,
            messages,
            temperature: temperature || 0.7,
            stream: false
          };
          this.applyMaxTokensParam(requestBody, provider, model, safeMaxTokens);
          Object.assign(requestBody, optionalReasoningParam(provider, model, {
          url, effort: signal ? qingyuTransportBudgetBySignal.get(signal)?.reasoningEffort : undefined,
        }) || {});

          // 如果指定了 JSON 格式，添加 response_format
          // 🔥 注意：某些模型/API不支持 response_format
          const isReasonerModel = model.includes('reasoner') || model.includes('r1');
          const isClaudeModel = model.includes('claude');
          const isUnsupportedAPI = this.isResponseFormatUnsupported(url, model);
          if (responseFormat === 'json_object' && !isReasonerModel && !isClaudeModel && !isUnsupportedAPI) {
            requestBody.response_format = { type: 'json_object' };
            console.log('[AI服务-OpenAI兼容] 启用JSON格式输出(降级非流式)');
          }

          this.chargeQingyuLongTransport(signal);
          const response = await axios.post(
            chatEndpoint,
            requestBody,
            {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              timeout: 60000, // 减少到60秒
              signal
            }
          );

          const message = response.data.choices?.[0]?.message;
          const content = message?.content || message?.reasoning_content || message?.reasoning || '';
          const finishReason = response.data.choices?.[0]?.finish_reason;
          if (isTruncatedFinishReason(finishReason)) {
            throwTruncated(finishReason, 0, response.data.usage, content);
          }
          emitDiagnostic(0, finishReason, false, response.data.usage);
          console.log(`[AI服务-OpenAI] 响应长度: ${content.length}`);
          return content;
        }
      } else {
        const requestBody: any = {
          model,
          messages,
          temperature: temperature || 0.7,
          stream: false
        };
        this.applyMaxTokensParam(requestBody, provider, model, safeMaxTokens);
        Object.assign(requestBody, optionalReasoningParam(provider, model, {
          url, effort: signal ? qingyuTransportBudgetBySignal.get(signal)?.reasoningEffort : undefined,
        }) || {});

        // 如果指定了 JSON 格式，添加 response_format
        // 🔥 注意：某些模型/API不支持 response_format
        const isReasonerModel = model.includes('reasoner') || model.includes('r1');
        const isClaudeModel = model.includes('claude');
        const isUnsupportedAPI = this.isResponseFormatUnsupported(url, model);
        if (responseFormat === 'json_object' && !isReasonerModel && !isClaudeModel && !isUnsupportedAPI) {
          requestBody.response_format = { type: 'json_object' };
          console.log('[AI服务-OpenAI兼容] 启用JSON格式输出(非流式)');
        }

        this.chargeQingyuLongTransport(signal);
        const response = await axios.post(
          chatEndpoint,
          requestBody,
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 120000,
            signal
          }
        );

        const message = response.data.choices?.[0]?.message;
        const content = message?.content || message?.reasoning_content || message?.reasoning || '';
        const finishReason = response.data.choices?.[0]?.finish_reason;
        if (isTruncatedFinishReason(finishReason)) {
          throwTruncated(finishReason, 0, response.data.usage, content);
        }
        emitDiagnostic(0, finishReason, false, response.data.usage);
        console.log(`[AI服务-OpenAI] 响应长度: ${content.length}`);
        return content;
      }
    } catch (error) {
      console.error('[AI服务-OpenAI] 失败:', error);
      if (error instanceof QingyuTurnLongRequestBudgetError) throw error;
      if (isAiRequestTimeout(error)) throw error;
      if (isOutputTruncationError(error)) throw error;
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          throw new AiRequestTimeoutError('total', Number(error.config?.timeout) || 120000);
        }
        if (error.response) {
          throw new Error(`API错误 ${error.response.status}: ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
          throw new Error('网络错误：无法连接到API服务器');
        }
      }
      throw new Error(`OpenAI API调用失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // Claude API格式
  private async callClaudeAPI(
    messages: AIMessage[],
    streaming: boolean,
    onStreamChunk?: (chunk: string) => void,
    responseFormat?: 'json_object',
    maxTokensOverride?: number,
    apiConfig: DirectAPIConfig = this.config.customAPI!,
    signal?: AbortSignal,
  ): Promise<string> {
    const { provider, url, apiKey, model, temperature, maxTokens } = apiConfig;

    // 转换消息格式：提取system消息，其余转为Claude格式
    let systemPrompt = '';
    const claudeMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt += (systemPrompt ? '\n\n' : '') + msg.content;
      } else {
        claudeMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
      }
    }

    // 确保第一条是user消息（Claude要求）
    if (claudeMessages.length === 0 || claudeMessages[0].role !== 'user') {
      claudeMessages.unshift({ role: 'user', content: '请开始。' });
    }

    const baseUrl = url || 'https://api.anthropic.com';
    const safeMaxTokens = this.clampMaxTokensForContext(
      provider,
      model,
      [
        ...(systemPrompt ? [{ content: systemPrompt }] : []),
        ...claudeMessages.map(m => ({ content: m.content })),
      ],
      maxTokensOverride ?? maxTokens ?? 8192
    );

    // 构建请求体
    const buildRequestBody = () => {
      const body: any = {
        model,
        max_tokens: safeMaxTokens,
        system: systemPrompt || undefined,
        messages: claudeMessages,
        temperature: temperature || 0.7
      };

      // Claude 支持 JSON 模式（通过 prefill 技巧）
      if (responseFormat === 'json_object') {
        console.log('[AI服务-Claude] 启用JSON格式输出（使用prefill技巧）');
        // 在最后一条用户消息后添加助手的 prefill，强制 JSON 输出
        const lastMsg = body.messages[body.messages.length - 1];
        if (lastMsg && lastMsg.role === 'user') {
          body.messages.push({ role: 'assistant', content: '{' });
        }
      }

      return body;
    };

    try {
      if (streaming) {
        try {
          this.chargeQingyuLongTransport(signal);
          return await this.streamingRequestClaude(baseUrl, apiKey, model, systemPrompt, claudeMessages, temperature || 0.7, safeMaxTokens, onStreamChunk, signal);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!this.isStreamUnsupportedError(msg)) throw e;
          console.warn('[AI服务-Claude] 当前API可能不支持流式传输，已自动降级为非流式请求。');

          this.chargeQingyuLongTransport(signal);
          const response = await axios.post(
            `${baseUrl}/v1/messages`,
            buildRequestBody(),
            {
              headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
              },
              timeout: 60000, // 减少到60秒
              signal
            }
          );

          let content = response.data.content[0]?.text || '';
          if (isTruncatedFinishReason(response.data.stop_reason)) {
            throw new OutputTruncationError({ budget: safeMaxTokens });
          }
          // 如果使用了 prefill，需要在返回内容前加上 '{'
          if (responseFormat === 'json_object' && content && !content.startsWith('{')) {
            content = '{' + content;
          }
          console.log(`[AI服务-Claude] 响应长度: ${content.length}`);
          return content;
        }
      } else {
        this.chargeQingyuLongTransport(signal);
        const response = await axios.post(
          `${baseUrl}/v1/messages`,
          buildRequestBody(),
          {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json'
            },
            timeout: 120000,
            signal
          }
        );

        let content = response.data.content[0]?.text || '';
        if (isTruncatedFinishReason(response.data.stop_reason)) {
          throw new OutputTruncationError({ budget: safeMaxTokens });
        }
        // 如果使用了 prefill，需要在返回内容前加上 '{'
        if (responseFormat === 'json_object' && content && !content.startsWith('{')) {
          content = '{' + content;
        }
        console.log(`[AI服务-Claude] 响应长度: ${content.length}`);
        return content;
      }
    } catch (error) {
      console.error('[AI服务-Claude] 失败:', error);
      if (error instanceof QingyuTurnLongRequestBudgetError) throw error;
      if (isAiRequestTimeout(error)) throw error;
      if (isOutputTruncationError(error)) throw error;
      if (axios.isAxiosError(error)) {
        if (error.response) {
          throw new Error(`Claude API错误 ${error.response.status}: ${JSON.stringify(error.response.data)}`);
        }
      }
      throw new Error(`Claude API调用失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // Gemini API格式
  private async callGeminiAPI(
    messages: AIMessage[],
    streaming: boolean,
    onStreamChunk?: (chunk: string) => void,
    responseFormat?: 'json_object',
    maxTokensOverride?: number,
    apiConfig: DirectAPIConfig = this.config.customAPI!,
    signal?: AbortSignal,
  ): Promise<string> {
    const { provider, url, apiKey, model, temperature, maxTokens } = apiConfig;

    // 验证必需参数
    if (!model || model.trim() === '') {
      throw new Error('Gemini API调用失败：未指定模型名称');
    }

    // 转换为Gemini格式
    let systemInstruction = '';
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction += (systemInstruction ? '\n\n' : '') + msg.content;
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }

    // 确保至少有一条消息
    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: '请开始。' }] });
    }

    const baseUrl = url || 'https://generativelanguage.googleapis.com';
    const endpoint = streaming ? 'streamGenerateContent' : 'generateContent';
    const safeMaxTokens = this.clampMaxTokensForContext(
      provider,
      model,
      [
        ...(systemInstruction ? [{ content: systemInstruction }] : []),
        ...contents.map(c => ({ content: (c.parts || []).map(p => p.text).join('\n') })),
      ],
      maxTokensOverride ?? maxTokens ?? 8192
    );

    // 构建 generationConfig
    const buildGenerationConfig = () => {
      const config: any = {
        temperature: temperature || 0.7,
        maxOutputTokens: safeMaxTokens
      };

      // Gemini 支持 JSON 模式（通过 response_mime_type）
      if (responseFormat === 'json_object') {
        console.log('[AI服务-Gemini] 启用JSON格式输出（使用response_mime_type）');
        config.response_mime_type = 'application/json';
      }

      return config;
    };

    // 构建请求体
    const requestBody = {
      contents,
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      generationConfig: buildGenerationConfig()
    };

    // Gemini API请求辅助函数：支持查询参数和Bearer token两种方式
    const makeGeminiRequest = async (urlPath: string, useQueryParam: boolean = true) => {
      const requestUrl = useQueryParam
        ? `${baseUrl}${urlPath}?key=${apiKey}`
        : `${baseUrl}${urlPath}`;

      const headers: any = { 'Content-Type': 'application/json' };
      if (!useQueryParam) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      this.chargeQingyuLongTransport(signal);
      return axios.post(requestUrl, requestBody, {
        headers,
        timeout: 120000,
        signal
      });
    };

    const readGeminiContent = (response: any): string => {
      const candidate = response.data.candidates?.[0];
      if (isTruncatedFinishReason(candidate?.finishReason)) {
        throw new OutputTruncationError({ budget: safeMaxTokens });
      }
      return candidate?.content?.parts?.[0]?.text || '';
    };

    try {
      if (streaming) {
        try {
          this.chargeQingyuLongTransport(signal);
          return await this.streamingRequestGemini(baseUrl, apiKey, model, systemInstruction, contents, temperature || 0.7, safeMaxTokens, onStreamChunk, signal);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!this.isStreamUnsupportedError(msg)) throw e;
          console.warn('[AI服务-Gemini] 当前API可能不支持流式传输，已自动降级为非流式请求。');

          // 尝试查询参数方式
          try {
            const response = await makeGeminiRequest(`/v1beta/models/${model}:generateContent`, true);
            const content = readGeminiContent(response);
            console.log(`[AI服务-Gemini] 响应长度: ${content.length}`);
            return content;
          } catch (queryError) {
            // 如果查询参数方式失败且是401错误，尝试Bearer token方式
            if (axios.isAxiosError(queryError) && queryError.response?.status === 401) {
              console.warn('[AI服务-Gemini] 查询参数认证失败，尝试Bearer token方式');
              const response = await makeGeminiRequest(`/v1beta/models/${model}:generateContent`, false);
              const content = readGeminiContent(response);
              console.log(`[AI服务-Gemini] 响应长度: ${content.length}`);
              return content;
            }
            throw queryError;
          }
        }
      } else {
        // 尝试查询参数方式
        try {
          const response = await makeGeminiRequest(`/v1beta/models/${model}:${endpoint}`, true);
          const content = readGeminiContent(response);
          console.log(`[AI服务-Gemini] 响应长度: ${content.length}`);
          return content;
        } catch (queryError) {
          // 如果查询参数方式失败且是401错误，尝试Bearer token方式
          if (axios.isAxiosError(queryError) && queryError.response?.status === 401) {
            console.warn('[AI服务-Gemini] 查询参数认证失败，尝试Bearer token方式');
            const response = await makeGeminiRequest(`/v1beta/models/${model}:${endpoint}`, false);
            const content = readGeminiContent(response);
            console.log(`[AI服务-Gemini] 响应长度: ${content.length}`);
            return content;
          }
          throw queryError;
        }
      }
    } catch (error) {
      console.error('[AI服务-Gemini] 失败:', error);
      if (error instanceof QingyuTurnLongRequestBudgetError) throw error;
      if (isAiRequestTimeout(error)) throw error;
      if (isOutputTruncationError(error)) throw error;
      if (axios.isAxiosError(error)) {
        if (error.response) {
          throw new Error(`Gemini API错误 ${error.response.status}: ${JSON.stringify(error.response.data)}`);
        }
      }
      throw new Error(`Gemini API调用失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // OpenAI格式流式请求
  private async streamingRequestOpenAI(
    url: string,
    apiKey: string,
    model: string,
    messages: AIMessage[],
    temperature: number,
    maxTokens: number,
    onStreamChunk?: (chunk: string) => void,
    responseFormat?: 'json_object',
    provider?: APIProvider,
    signal?: AbortSignal,
    onFinish?: (finishReason: string | undefined, usage: unknown) => void,
  ): Promise<string> {
    return withAiRequestDeadline((requestSignal, firstByte) => {
      const policy = signal ? qingyuTransportBudgetBySignal.get(signal) : undefined;
      if (policy) qingyuTransportBudgetBySignal.set(requestSignal, policy);
      return this.streamingRequestOpenAIOnce(
      url, apiKey, model, messages, temperature, maxTokens, onStreamChunk,
      responseFormat, provider, requestSignal, firstByte, onFinish,
      );
    }, { signal });
  }

  private async streamingRequestOpenAIOnce(
    url: string,
    apiKey: string,
    model: string,
    messages: AIMessage[],
    temperature: number,
    maxTokens: number,
    onStreamChunk?: (chunk: string) => void,
    responseFormat?: 'json_object',
    provider?: APIProvider,
    signal?: AbortSignal,
    onFirstByte?: () => void,
    onFinish?: (finishReason: string | undefined, usage: unknown) => void,
  ): Promise<string> {
    console.log('[AI服务-OpenAI流式] 开始');

    const requestBody: any = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true
    };
    if (provider === 'openrouter' || /openrouter\.ai/i.test(url)) {
      requestBody.stream_options = { include_usage: true };
    }
    Object.assign(requestBody, optionalReasoningParam(provider, model, {
          url, effort: signal ? qingyuTransportBudgetBySignal.get(signal)?.reasoningEffort : undefined,
        }) || {});

    // 如果指定了 JSON 格式，添加 response_format
    // 🔥 注意：某些模型/API不支持 response_format
    const isReasonerModel = model.includes('reasoner') || model.includes('r1');
    const isClaudeModel = model.includes('claude');
    const isUnsupportedAPI = this.isResponseFormatUnsupported(url, model);
    const shouldSkipFormat = isReasonerModel || isClaudeModel || isUnsupportedAPI;
    if (responseFormat === 'json_object' && !shouldSkipFormat) {
      requestBody.response_format = { type: 'json_object' };
      console.log('[AI服务-OpenAI流式] 启用JSON格式输出');
    } else if (responseFormat === 'json_object' && shouldSkipFormat) {
      const reason = isReasonerModel ? 'reasoner模型' : isClaudeModel ? 'Claude模型' : '该API';
      console.log(`[AI服务-OpenAI流式] 跳过JSON格式输出（${reason}不支持）`);
    }

    // 智谱AI使用不同的API路径
    const normalizedUrl = normalizeOpenAIBaseUrl(url);
    const chatEndpoint = provider === 'zhipu'
      ? `${normalizedUrl}/api/paas/v4/chat/completions`
      : buildOpenAICompatibleEndpoint(normalizedUrl, 'chat/completions');

    const response = await fetch(chatEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'text/event-stream',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal
    });

    if (!response.ok) {
      throw new Error(`API错误 ${response.status}: ${await response.text()}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream')) {
      throw new Error(`Stream unsupported (content-type=${contentType || 'unknown'})`);
    }

    // 思维链兜底：部分推理模型（DeepSeek 用 reasoning_content，Ollama 等用 reasoning）
    // 把思考放在独立字段、content 为空。正式内容优先；若整段流没有任何 content，
    // 则回退使用思维链文本，避免返回空结果导致“AI生成失败”。
    let reasoningBuffer = '';
    let truncated = false;
    let finishReason: string | undefined;
    let usage: unknown;
    const result = await this.processSSEStream(response, (data) => {
      const parsed = JSON.parse(data);
      if (parsed.usage) usage = parsed.usage;
      const choice = parsed.choices?.[0];
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      const delta = choice?.delta;
      if (isTruncatedFinishReason(choice?.finish_reason)) {
        truncated = true;
      }

      const reasoningPiece = delta?.reasoning_content ?? delta?.reasoning;
      if (typeof reasoningPiece === 'string') reasoningBuffer += reasoningPiece;

      // 普通 content（优先）
      const hasActualContent = delta?.content !== undefined && delta?.content !== null && delta?.content !== '';
      if (hasActualContent) {
        return delta.content;
      }

      return '';
    }, onStreamChunk, signal, onFirstByte);
    onFinish?.(finishReason, usage);

    const visible = result.trim() ? result : reasoningBuffer;
    if (truncated) {
      throw new OutputTruncationError({ budget: maxTokens, partialContent: visible });
    }

    return visible;
  }

  // Claude格式流式请求
  private async streamingRequestClaude(
    url: string,
    apiKey: string,
    model: string,
    systemPrompt: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    temperature: number,
    maxTokens: number,
    onStreamChunk?: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    console.log(`[AI服务-Claude流式] 开始`);

    const requestBody: any = {
      model,
      max_tokens: maxTokens,
      system: systemPrompt || undefined,
      messages,
      temperature,
      stream: true
    };

    const response = await fetch(`${url}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Accept': 'text/event-stream',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal
    });

    if (!response.ok) {
      throw new Error(`Claude API错误 ${response.status}: ${await response.text()}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream')) {
      throw new Error(`Stream unsupported (content-type=${contentType || 'unknown'})`);
    }

    // Claude thinking 状态追踪
    let inThinkingPhase = false;
    let truncated = false;

    const result = await this.processSSEStream(response, (data) => {
      const parsed = JSON.parse(data);

      if (parsed.type === 'message_delta' && isTruncatedFinishReason(parsed.delta?.stop_reason)) {
        truncated = true;
      }

      // Claude extended thinking: 处理 thinking content block
      if (parsed.type === 'content_block_start') {
        if (parsed.content_block?.type === 'thinking') {
          inThinkingPhase = true;
          return '<thinking>';
        }
      }

      if (parsed.type === 'content_block_stop' && inThinkingPhase) {
        inThinkingPhase = false;
        return '</thinking>';
      }

      // Claude流式响应格式：content_block_delta事件
      if (parsed.type === 'content_block_delta') {
        // thinking_delta 事件
        if (parsed.delta?.type === 'thinking_delta') {
          return parsed.delta?.thinking || '';
        }
        // 普通 text_delta 事件
        return parsed.delta?.text || '';
      }
      return '';
    }, onStreamChunk, signal);

    if (truncated) {
      throw new OutputTruncationError({ budget: maxTokens });
    }
    return result;
  }

  // Gemini格式流式请求
  private async streamingRequestGemini(
    url: string,
    apiKey: string,
    model: string,
    systemInstruction: string,
    contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
    temperature: number,
    maxTokens: number,
    onStreamChunk?: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    console.log(`[AI服务-Gemini流式] 开始`);

    const generationConfig: any = {
      temperature,
      maxOutputTokens: maxTokens
    };

    const response = await fetch(`${url}/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`, {
      method: 'POST',
      headers: { 'Accept': 'text/event-stream', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
        generationConfig
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(`Gemini API错误 ${response.status}: ${await response.text()}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream')) {
      throw new Error(`Stream unsupported (content-type=${contentType || 'unknown'})`);
    }

    // Gemini thinking 状态追踪
    let lastWasThought = false;
    let truncated = false;

    const result = await this.processSSEStream(response, (data) => {
      const parsed = JSON.parse(data);
      if (isTruncatedFinishReason(parsed.candidates?.[0]?.finishReason)) {
        truncated = true;
      }
      const parts = parsed.candidates?.[0]?.content?.parts || [];
      let result = '';

      for (const part of parts) {
        // Gemini thinking mode: thought 字段包含思维内容
        if (part.thought) {
          if (!lastWasThought) {
            result += '<thinking>';
            lastWasThought = true;
          }
          result += part.thought;
        } else if (part.text) {
          if (lastWasThought) {
            result += '</thinking>';
            lastWasThought = false;
          }
          result += part.text;
        }
      }

      return result;
    }, onStreamChunk, signal);

    if (truncated) {
      throw new OutputTruncationError({ budget: maxTokens });
    }
    return result;
  }

  // 通用SSE流处理 - 真流式版本（保留thinking标签，前端处理显示）
  private async processSSEStream(
    response: Response,
    extractContent: (data: string) => string,
    onStreamChunk?: (chunk: string) => void,
    signal?: AbortSignal,
    onFirstByte?: () => void,
  ): Promise<string> {
    console.log(`[AI服务-流式] processSSEStream 开始, hasOnStreamChunk=${!!onStreamChunk}`);

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    let rawFullText = '';
    let buffer = '';
    let chunkCount = 0;

    // 立即发送内容到前端（真流式，不做任何过滤）
    const sendChunk = (text: string) => {
      if (text && onStreamChunk) {
        chunkCount++;
        if (chunkCount <= 3 || chunkCount % 100 === 0) {
          console.log(`[AI服务-流式] chunk #${chunkCount}: "${text.substring(0, 30)}..."`);
        }
        onStreamChunk(text);
      }
    };

    try {
      while (true) {
        if (signal?.aborted) {
          try { await reader.cancel(); } catch { /* ignore */ }
          throw new Error('请求已取消');
        }

        const { done, value } = await reader.read();
        if (signal?.aborted) throw new Error('请求已取消');
        if (done) break;
        if (value?.byteLength) onFirstByte?.();

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          let data = trimmed.slice(5);
          if (data.startsWith(' ')) data = data.slice(1);
          if (data === '[DONE]') continue;

          try {
            const content = extractContent(data);
            if (content) {
              rawFullText += content;
              // 真流式：立即发送，不做任何缓冲
              sendChunk(content);
            }
          } catch (e) {
            console.warn('[AI服务-流式] 解析chunk失败:', data.substring(0, 100));
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    console.log(`[AI服务-流式] 完成，总长度: ${rawFullText.length}`);
    return rawFullText;
  }

  /**
   * 检查指定功能是否启用了强制JSON输出
   * @param usageType 功能类型
   * @returns 是否启用强制JSON输出
   */
  isForceJsonEnabled(usageType?: APIUsageType): boolean {
    const apiConfig = this.getAPIConfigForUsageType(usageType);
    return apiConfig?.forceJsonOutput === true;
  }

  /**
   * 检查当前模式是否可用
   */
  checkAvailability(): { available: boolean; message: string } {
    if (this.config.mode === 'tavern') {
      const tavernHelper = this.getTavernHelper();
      if (!tavernHelper) {
        return {
          available: false,
          message: this.isTavernEnvironment()
            ? '酒馆环境不可用。请在SillyTavern中打开，或切换到自定义API模式。'
            : '当前环境不可用，请切换到自定义API模式。'
        };
      }
      return { available: true, message: '酒馆模式已就绪' };
    } else {
      const needsKey = providerRequiresApiKey(this.config.customAPI?.provider, this.config.customAPI?.url);
      if (!this.config.customAPI?.url || (needsKey && !this.config.customAPI?.apiKey)) {
        return {
          available: false,
          message: needsKey ? '自定义API未配置。请在设置中配置API地址和密钥。' : '自定义API未配置。请在设置中配置API地址。'
        };
      }
      return { available: true, message: '自定义API模式已就绪' };
    }
  }
}

export const aiService = new AIService();
