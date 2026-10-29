import { GAME_NUMBERS, registerNumbersValidator } from '@/modules/sceneModule/numbers';
import { logEvent } from '@/modules/diagnostics/log';
import { OutputTruncationError } from './aiResponseTermination';

const observed = new Set<string>(); // Session-only; never writes API settings.
const config = () => GAME_NUMBERS.aiRetry.reasoning;
registerNumbersValidator(() => {
  try { new RegExp(config().modelPattern, 'i'); return []; }
  // lcq-allow: 配置错误交给 numbers validator 统一诊断并拒绝。
  catch { return ['aiRetry.reasoning.modelPattern 必须为有效正则']; }
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
