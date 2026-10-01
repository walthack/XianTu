/**
 * Optional compatibility helper. Explicit scoped effort is sent only to OpenRouter.
 * Unknown proxies retain their prior behavior; accepted effort does not prove latency gains.
 */

export function optionalReasoningParam(
  provider: string | undefined,
  model: string | undefined,
  options?: { effort?: 'none' | 'low'; url?: string },
): { reasoning: { effort: 'none' | 'low' } } | undefined {
  const providerId = String(provider || '').toLowerCase();
  const modelId = String(model || '').toLowerCase();
  if (!modelId) return undefined;
  // 只对明确的OpenRouter端点采用官方统一参数，未知代理保持兼容。
  let openRouterHost = false;
  try { openRouterHost = new URL(options?.url || '').hostname === 'openrouter.ai'; } catch { /* absent */ }
  if (options?.effort && openRouterHost) return { reasoning: { effort: options.effort } };

  if (modelId.includes('jev') || modelId.includes('typesafe') || providerId.includes('jev')) return undefined;
  if (providerId === 'custom') return undefined;
  const knownReasoningModel = /^(o1|o3|o4)/.test(modelId)
    || modelId.includes('gpt-5')
    || modelId.includes('o1-')
    || modelId.includes('o3-')
    || modelId.includes('o4-');
  if (!knownReasoningModel) return undefined;
  return { reasoning: { effort: 'low' } };
}
