/** 统计提供者登记：其他层（如回合埋点）把自己的聚合统计登记进来，诊断导出与反馈包统一带上；诊断模块不反向依赖它们。 */
const providers = new Map<string, () => unknown>();

export const registerStatsProvider = (name: string, provider: () => unknown): void => { providers.set(name, provider); };

/** 收集所有已登记的统计；单个提供者抛错只丢它自己（记为 { error }），永不抛错。 */
export function collectStats(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, provider] of providers) {
    try {
      out[name] = provider();
    } catch { // lcq-allow: 统计只是附带信息，提供者故障不得拖垮日志导出（不能在日志导出路径里再记日志）
      out[name] = { error: 'provider_failed' };
    }
  }
  return out;
}
