import { GAME_NUMBERS, registerNumbersValidator } from '@/modules/sceneModule/numbers';
import { logEvent } from '@/modules/diagnostics/log';
import { REASONING_EFFORT_LEVELS } from '@/modules/sceneModule/numbersRegistry';
import { OutputTruncationError } from './aiResponseTermination';
import { DUAL_MODEL_CONFIG } from './dualModelConfig';

const observed = new Set<string>(); // Session-only; never writes API settings.
const config = () => GAME_NUMBERS.aiRetry.reasoning;
registerNumbersValidator(() => {
  try { new RegExp(config().modelPattern, 'i'); return []; }
  // lcq-allow: 配置错误交给 numbers validator 统一诊断并拒绝。
  catch { return ['aiRetry.reasoning.modelPattern 必须为有效正则']; }
});
registerNumbersValidator(() => {
  const main = config().mainNarrative;
  return (['modelPattern', 'hostPattern'] as const).flatMap(key => {
    try { new RegExp(main[key], 'i'); return []; }
    // lcq-allow: 配置错误交给 numbers validator 统一诊断并拒绝。
    catch { return [`aiRetry.reasoning.mainNarrative.${key} 必须为有效正则`]; }
  });
});
export function reasoningPolicy(model: string): boolean {
  if (observed.has(model.toLowerCase())) return true;
  try { return new RegExp(config().modelPattern, 'i').test(model); } catch { /* lcq-allow: validator 已拒绝无效正则，此处保守按普通模型处理。 */ return false; }
}
export function reasoningLimits(model: string, tokens: number): number {
  return reasoningPolicy(model) ? Math.max(config().minMaxTokens, Math.ceil(tokens * config().tokenMultiplier)) : tokens;
}
export function reasoningTimeout(model: string, ms: number): number {
  return reasoningPolicy(model) ? Math.max(config().minTimeoutMs, ms * config().timeoutMultiplier) : ms;
}
/** Strip closed and unfinished think blocks; reasoning never substitutes for visible prose. */
export function observeReasoning(model: string, content: unknown, reasoning?: unknown): string {
  const text = typeof content === 'string' ? content : '';
  if ((typeof reasoning === 'string' && reasoning.trim()) || /<think>/i.test(text)) observed.add(model.toLowerCase());
  return text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
}
/** Only the existing OpenRouter contract is supported; 0 disables this opt-in. */
export function reasoningBudgetParam(url: string): Record<string, unknown> {
  try {
    if (config().budgetTokens > 0 && new URL(url).hostname === 'openrouter.ai') return { reasoning: { max_tokens: config().budgetTokens } };
  } catch { /* lcq-allow: 无效 URL 不发送可选参数，实际传输层负责报错。 */ }
  return {};
}
/**
 * 主叙事推理档：仅前台回合主叙事请求、模型与主机都命中配置时发送 reasoning_effort（MiniMax 官方参数，M3.1-Flash 默认 max）。
 * effort=off 不发送；其他请求与未知端点保持原样。
 */
export function mainNarrativeReasoningParam(url: string, model: string, mainNarrative: boolean): Record<string, unknown> {
  const main = config().mainNarrative;
  if (!mainNarrative || main.effort === 'off') return {};
  try {
    if (new RegExp(main.modelPattern, 'i').test(model) && new RegExp(main.hostPattern, 'i').test(new URL(url).hostname)) {
      return { reasoning_effort: main.effort };
    }
  } catch { /* lcq-allow: 无效 URL/正则不发送可选参数，正则由 validator 拒绝，传输层负责 URL 报错。 */ }
  return {};
}
/** 开局生成推理档（aiRetry.reasoning.opening）：只对开局请求发送；模型/主机名单沿用 mainNarrative，名单外不发；off 不发送。 */
export function openingReasoningParam(url: string, model: string, opening: boolean): Record<string, unknown> {
  const effort = config().opening.effort;
  if (!opening || effort === 'off') return {};
  const main = config().mainNarrative;
  try {
    if (new RegExp(main.modelPattern, 'i').test(model) && new RegExp(main.hostPattern, 'i').test(new URL(url).hostname)) {
      return { reasoning_effort: effort };
    }
  } catch { /* lcq-allow: 无效 URL/正则不发送可选参数，正则由 validator 拒绝，传输层负责 URL 报错。 */ }
  return {};
}
/**
 * 双模型后端推理档：只对后端请求（backend=true）发送；模型/主机名单沿用 mainNarrative.modelPattern/hostPattern，名单外不发（N2-A）。
 * 档位取调用方传入值；'default'、缺省或非法值回落 mod-kit/dual-model.json backend.reasoningEffort。off 不发送；max 显式发送。
 */
export function backendReasoningParam(url: string, model: string, backend: boolean, effort?: string): Record<string, unknown> {
  if (!backend) return {};
  const picked = effort && effort !== 'default' && effort !== 'off' && REASONING_EFFORT_LEVELS.includes(effort) ? effort : DUAL_MODEL_CONFIG.dualModel.backend.reasoningEffort;
  if (!REASONING_EFFORT_LEVELS.includes(picked) || picked === 'off') return {};
  const main = config().mainNarrative;
  try {
    if (new RegExp(main.modelPattern, 'i').test(model) && new RegExp(main.hostPattern, 'i').test(new URL(url).hostname)) {
      return { reasoning_effort: picked };
    }
  } catch { /* lcq-allow: 无效 URL/正则不发送可选参数，正则由 validator 拒绝，传输层负责 URL 报错。 */ }
  return {};
}
export class ReasoningExhaustedError extends OutputTruncationError {
  constructor(budget: number) {
    super({ message: '思考耗尽输出长度', finishReason: 'length', budget, partialContent: '' });
  }
}
export async function retryReasoningOnce<T>(cap: number | undefined, run: (cap: number | undefined) => Promise<T>, signal?: AbortSignal): Promise<T> {
  try { return await run(cap); } catch (error) {
    if (!(error instanceof ReasoningExhaustedError)) throw error;
    logEvent({ code: 'LCQ-NET-013', detail: { budget: error.budget, retry: !signal?.aborted } });
    if (signal?.aborted) throw error;
    const next = Math.max(config().minMaxTokens, Math.ceil((error.budget || cap || 1) * config().retryMultiplier));
    try { return await run(next); } catch (retryError) {
      if (retryError instanceof ReasoningExhaustedError) logEvent({ code: 'LCQ-NET-013', detail: { budget: retryError.budget, retry: false } });
      if (retryError instanceof OutputTruncationError && !(retryError instanceof ReasoningExhaustedError)) {
        throw new OutputTruncationError({ ...retryError, recoveryAttempted: true });
      }
      throw retryError;
    }
  }
}
