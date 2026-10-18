/**
 * AI 请求重试策略：哪些错误值得重试、等多久。全部是纯函数（随机数与时钟由参数注入），不碰网络与 aiService 状态。
 * 数值全在 game-numbers.qingyu.json 的 aiRetry 段（可经 tuning.json 热改），一律调用时再读，不在顶层缓存。
 * 不做备用模型降级：重试始终打同一个模型/连接。
 */
import { GAME_NUMBERS, registerNumbersValidator } from '@/modules/sceneModule/numbers';
import { isAiRequestTimeout } from './aiRequestDeadline';
import { isNonRetryableAiError, isOutputTruncationError } from './aiResponseTermination';

export interface AiRetryConfig {
  /** 调用方与玩家设置都没指定时的重试次数（不含首次请求）。 */
  maxRetries: number;
  /** 值得重试的 HTTP 状态码。 */
  retryStatuses: number[];
  baseDelayMs: number;
  maxDelayMs: number;
  factor: number;
  /** 抖动幅度（0–1）：延迟在 ±jitter 比例内随机浮动。 */
  jitter: number;
  /** 超时（首字节/总耗时/空闲）是否自动重试。默认 false：超时后请玩家手动重试。 */
  retryOnTimeout: boolean;
  /** 服务端 Retry-After 的采信上限：更长的等待按此截断。 */
  retryAfterMaxMs: number;
}

export const aiRetryConfig = (): AiRetryConfig => GAME_NUMBERS.aiRetry as AiRetryConfig;

const MAX_RETRIES_CAP = 5;
const DELAY_CAP_MS = 120000;
const FACTOR_CAP = 10;

export function validateAiRetryConfig(cfg: AiRetryConfig | undefined = aiRetryConfig()): string[] {
  if (!cfg || typeof cfg !== 'object') return ['aiRetry 段缺失'];
  const problems: string[] = [];
  const int = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
  if (!int(cfg.maxRetries, 0, MAX_RETRIES_CAP)) problems.push(`aiRetry.maxRetries 须为 0–${MAX_RETRIES_CAP} 的整数`);
  if (!Array.isArray(cfg.retryStatuses) || cfg.retryStatuses.some(code => !int(code, 400, 599))) problems.push('aiRetry.retryStatuses 须为 400–599 整数组成的数组');
  if (!int(cfg.baseDelayMs, 1, DELAY_CAP_MS)) problems.push(`aiRetry.baseDelayMs 须为 1–${DELAY_CAP_MS} 的整数`);
  if (!int(cfg.maxDelayMs, 1, DELAY_CAP_MS) || (int(cfg.baseDelayMs, 1, DELAY_CAP_MS) && cfg.maxDelayMs < cfg.baseDelayMs)) problems.push(`aiRetry.maxDelayMs 须为不小于 baseDelayMs 且不超过 ${DELAY_CAP_MS} 的整数`);
  if (!(typeof cfg.factor === 'number' && Number.isFinite(cfg.factor) && cfg.factor >= 1 && cfg.factor <= FACTOR_CAP)) problems.push(`aiRetry.factor 须为 1–${FACTOR_CAP} 的数`);
  if (!(typeof cfg.jitter === 'number' && Number.isFinite(cfg.jitter) && cfg.jitter >= 0 && cfg.jitter <= 1)) problems.push('aiRetry.jitter 须为 0–1 的数');
  if (typeof cfg.retryOnTimeout !== 'boolean') problems.push('aiRetry.retryOnTimeout 须为布尔');
  if (!int(cfg.retryAfterMaxMs, 0, DELAY_CAP_MS)) problems.push(`aiRetry.retryAfterMaxMs 须为 0–${DELAY_CAP_MS} 的整数（0 = 不采信 Retry-After）`);
  return problems;
}
registerNumbersValidator(() => validateAiRetryConfig());

/** 第 attempt 次重试（0 起）的指数退避：base×factor^attempt，封顶 maxDelayMs，再按 jitter 上下浮动，最终仍不超过 maxDelayMs。 */
export function computeBackoffDelayMs(attempt: number, cfg: AiRetryConfig = aiRetryConfig(), random: () => number = Math.random): number {
  const raw = Math.min(cfg.maxDelayMs, cfg.baseDelayMs * Math.pow(cfg.factor, Math.max(0, attempt)));
  const spread = 1 + cfg.jitter * (2 * random() - 1);
  return Math.round(Math.min(cfg.maxDelayMs, Math.max(0, raw * spread)));
}

/**
 * 解析 Retry-After：秒数（"120"，也容忍小数）或 HTTP 日期（"Wed, 21 Oct 2026 07:28:00 GMT"）。
 * 返回毫秒（日期已过则为 0）；格式无法识别返回 undefined。不做上限截断，上限由 planAiRetry 按配置施加。
 */
export function parseRetryAfterMs(value: unknown, nowMs: number = Date.now()): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) : undefined;
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text) return undefined;
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 1000);
  if (!/[A-Za-z]/.test(text)) return undefined;
  const at = Date.parse(text);
  return Number.isNaN(at) ? undefined : Math.max(0, at - nowMs);
}

/** 从 fetch 的 Headers、axios 的 AxiosHeaders 或普通对象里取 Retry-After 原值（大小写不敏感）。 */
export function readRetryAfterHeader(headers: unknown): unknown {
  if (!headers || typeof headers !== 'object') return undefined;
  const bag = headers as { get?: (name: string) => unknown };
  if (typeof bag.get === 'function') return bag.get('retry-after') ?? undefined;
  const key = Object.keys(headers).find(name => name.toLowerCase() === 'retry-after');
  return key ? (headers as Record<string, unknown>)[key] : undefined;
}

/** 带状态码与 Retry-After 的 AI 请求错误；message 保持原有“API错误 <状态>: <正文>”格式。 */
export class AiHttpError extends Error {
  readonly code = 'AI_HTTP_ERROR';
  readonly kind: 'http' | 'network';
  readonly status?: number;
  /** 服务端要求的等待（毫秒，未截断）。 */
  readonly retryAfterMs?: number;
  constructor(message: string, init: { status?: number; retryAfter?: unknown; kind?: 'http' | 'network'; cause?: unknown; nowMs?: number } = {}) {
    super(message);
    this.name = 'AiHttpError';
    this.kind = init.kind ?? 'http';
    this.status = init.status;
    this.retryAfterMs = parseRetryAfterMs(init.retryAfter, init.nowMs);
    if (init.cause !== undefined) (this as { cause?: unknown }).cause = init.cause;
  }
}

/** axios / fetch / 酒馆错误里的 HTTP 状态码。 */
export function readHttpStatus(error: unknown): number | undefined {
  const value = error as any;
  const status = value?.status ?? value?.response?.status ?? value?.cause?.status ?? value?.cause?.response?.status;
  return typeof status === 'number' ? status : undefined;
}

function readMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || '';
  return String(error);
}

/** 只有 message 的错误（酒馆/代理）：从“API错误 429”“status 503”“service unavailable”这类字样里认状态码。 */
function statusFromMessage(message: string): number | undefined {
  if (/service unavailable/i.test(message)) return 503;
  const hit = message.match(/(?:API错误|错误|status(?: code)?|HTTP)\s*[:：=]?\s*([45]\d\d)\b/i);
  return hit ? Number(hit[1]) : undefined;
}

const TIMEOUT_MESSAGE = /timeout|timed out/i;
const NETWORK_MESSAGE = /network|fetch failed|failed to fetch|load failed|econnreset|socket hang up|terminated|无法连接|网络错误|无法获取响应流/i;

export type AiRetryVerdict =
  | { retry: true; reason: 'status' | 'network' | 'timeout'; status?: number }
  | { retry: false; reason: 'cancelled' | 'truncated' | 'turn_budget' | 'timeout' | 'retries_spent' | 'status_not_retryable' | 'unknown'; status?: number };

/** 这个错误本身值得不值得重试（不考虑次数与剩余时间）。 */
export function classifyAiError(error: unknown, cfg: AiRetryConfig = aiRetryConfig()): AiRetryVerdict {
  if (isAiRequestTimeout(error)) return { retry: cfg.retryOnTimeout, reason: 'timeout' } as AiRetryVerdict;
  if (isOutputTruncationError(error)) return { retry: false, reason: 'truncated' };
  if ((error as { code?: string } | null)?.code === 'QINGYU_TURN_LONG_REQUEST_BUDGET') return { retry: false, reason: 'turn_budget' };
  const message = readMessage(error);
  if (isNonRetryableAiError(error) || /取消/.test(message) || (error as { name?: string } | null)?.name === 'AbortError') return { retry: false, reason: 'cancelled' };
  if ((error as { retriesSpent?: boolean } | null)?.retriesSpent === true) return { retry: false, reason: 'retries_spent' };

  const status = readHttpStatus(error) ?? statusFromMessage(message);
  if (status !== undefined) {
    return cfg.retryStatuses.includes(status)
      ? { retry: true, reason: 'status', status }
      : { retry: false, reason: 'status_not_retryable', status };
  }
  if ((error as { kind?: string } | null)?.kind === 'network' || NETWORK_MESSAGE.test(message)) return { retry: true, reason: 'network' };
  if (TIMEOUT_MESSAGE.test(message)) return { retry: cfg.retryOnTimeout, reason: 'timeout' } as AiRetryVerdict;
  return { retry: false, reason: 'unknown' };
}

/** 错误里带的 Retry-After（毫秒，未截断）：AiHttpError 已解析好的值，或 axios/酒馆错误上的响应头。 */
export function readRetryAfterMs(error: unknown, nowMs: number = Date.now()): number | undefined {
  const value = error as any;
  if (typeof value?.retryAfterMs === 'number') return value.retryAfterMs;
  const headers = value?.response?.headers ?? value?.cause?.response?.headers ?? value?.headers;
  return parseRetryAfterMs(readRetryAfterHeader(headers), nowMs);
}

export type AiRetryPlan =
  | { retry: true; delayMs: number; source: 'backoff' | 'retry-after'; verdict: AiRetryVerdict }
  | { retry: false; reason: AiRetryVerdict['reason'] | 'retries_exhausted' | 'turn_time_short'; verdict: AiRetryVerdict };

export interface AiRetryPlanInput {
  error: unknown;
  /** 已经重试过的次数（首次失败时为 0）。 */
  attempt: number;
  maxRetries: number;
  /** 本回合剩余可用毫秒；null/undefined 表示不限。等待时间不低于它就不再重试。 */
  remainingMs?: number | null;
  nowMs?: number;
  random?: () => number;
  cfg?: AiRetryConfig;
}

/** 失败后的决定：不重试（及原因），或等 delayMs 再试。等待 = max(指数退避, 截断后的 Retry-After)。 */
export function planAiRetry(input: AiRetryPlanInput): AiRetryPlan {
  const cfg = input.cfg ?? aiRetryConfig();
  const verdict = classifyAiError(input.error, cfg);
  if (!verdict.retry) return { retry: false, reason: verdict.reason, verdict };
  if (input.attempt >= input.maxRetries) return { retry: false, reason: 'retries_exhausted', verdict };
  const backoff = computeBackoffDelayMs(input.attempt, cfg, input.random);
  const asked = readRetryAfterMs(input.error, input.nowMs);
  const honored = asked === undefined ? undefined : Math.min(asked, cfg.retryAfterMaxMs);
  const delayMs = honored !== undefined && honored > backoff ? honored : backoff;
  if (input.remainingMs != null && delayMs >= input.remainingMs) return { retry: false, reason: 'turn_time_short', verdict };
  return { retry: true, delayMs, source: delayMs === honored ? 'retry-after' : 'backoff', verdict };
}

/** 可取消的等待：到点 resolve；signal 中止立即以“请求已被取消”reject，并清掉定时器与监听。 */
export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('请求已被取消'));
    const onAbort = () => { clearTimeout(timer); reject(new Error('请求已被取消')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
