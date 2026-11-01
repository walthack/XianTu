import { readHttpStatus } from './aiRetryPolicy';
import moderation from '../../mod-kit/ai-content-moderation.json';

function readMessage(error: unknown): string {
  if (!error) return '未知错误';
  if (typeof error === 'string') return error;
  const value = error as any;
  const detail = value?.response?.data?.error?.message ?? value?.response?.data?.detail ?? value?.response?.data?.message;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (typeof value?.message === 'string') return value.message || '未知错误';
  return String(error);
}

/** 包装后的玩家错误通过 cause 保留审核分类；防御循环 cause。 */
export function contentModerationDetail(error: unknown): { status: number; providerCode?: string; requestId?: string } | undefined {
  const seen = new Set<unknown>();
  for (let current: any = error; current && !seen.has(current); current = current.cause) {
    seen.add(current);
    const message = readMessage(current);
    if (readHttpStatus(current) !== moderation.status || !moderation.markers.some(marker => message.toLowerCase().includes(marker))) continue;
    return {
      status: moderation.status,
      providerCode: moderation.markers.filter(marker => /^\d+$/.test(marker)).find(marker => new RegExp(`\\b${marker}\\b`).test(message)),
      requestId: message.match(/request_id["'\s]*[:=]["'\s]*([\w-]+)/i)?.[1],
    };
  }
  return undefined;
}

export const isContentModerationError = (error: unknown): boolean => !!contentModerationDetail(error);

/**
 * retries = 已自动重试的次数；大于 0 时文案如实写“已自动重试 N 次仍失败”，为 0/缺省则不声称重试过。
 * localFallback = 调用方在审核拦截后确实改用本地正文（模块叙事 / 场面描写走模板）；缺省为否：
 * 主叙事回合（AIBS）被拦截时不会产出本地叙事、时间不推进，文案只能如实说没推进（REPORT-8091-da90cb13 P2-3）。
 */
export function toUserFacingAIError(error: unknown, info: { retries?: number; localFallback?: boolean } = {}): Error {
  const status = readHttpStatus(error);
  const message = readMessage(error);
  const retried = (info.retries ?? 0) > 0 ? `已自动重试 ${info.retries} 次仍失败。` : '';
  const quota = /insufficient[_ -]?quota|quota.{0,20}(?:exceed|耗尽|不足)|credit|余额|billing|payment required/i.test(message);

  let userMessage: string;
  if (isContentModerationError(error)) {
    userMessage = info.localFallback
      ? '内容审核未通过（LCQ-NET-012）。本回合将使用本地叙事；启用自动切换后可使用“API管理”中的备用连接。'
      : '内容审核未通过（LCQ-NET-012）。本回合没有推进，可调整行动后重试；启用自动切换后可使用“API管理”中的备用连接。';
  } else if (status === 401 || /invalid.{0,12}(?:api[_ -]?key|密钥)|unauthori[sz]ed|authentication/i.test(message)) {
    userMessage = 'API 密钥无效或已过期。请打开“API管理”重新填写密钥，并使用“测试连接”验证。';
  } else if (status === 402 || quota) {
    userMessage = 'API 额度或账户余额不足。请充值/更换提供商，或在“API管理”切换到仍有额度的配置。';
  } else if (status === 403) {
    userMessage = 'API 拒绝访问（403）。请检查密钥权限、模型访问权限和账户状态。';
  } else if (status === 429 || /\b429\b/.test(message)) {
    userMessage = `AI 请求过于频繁（429）。${retried}请稍后再试或降低并发。`;
  } else if (status === 503 || /service unavailable/i.test(message)) {
    userMessage = `AI 服务暂不可用（503）。${retried}请检查提供方状态，或稍后再试。`;
  } else if (status !== undefined && (status === 408 || status >= 500)) {
    userMessage = `AI 服务暂时出错（${status}）。${retried}请稍后再试。`;
  } else if ((error as { kind?: string } | null)?.kind === 'network') {
    userMessage = `无法连接到 AI 服务器。${retried}请检查网络和“API管理”里的地址后再试。`;
  } else {
    userMessage = message || 'AI 调用失败';
  }

  const result = new Error(userMessage);
  (result as any).cause = error;
  return result;
}
