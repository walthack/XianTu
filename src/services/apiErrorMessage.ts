function readStatus(error: unknown): number | undefined {
  const value = error as any;
  const status = value?.status ?? value?.response?.status ?? value?.cause?.status ?? value?.cause?.response?.status;
  return typeof status === 'number' ? status : undefined;
}

function readMessage(error: unknown): string {
  if (!error) return '未知错误';
  if (typeof error === 'string') return error;
  const value = error as any;
  const detail = value?.response?.data?.error?.message ?? value?.response?.data?.detail ?? value?.response?.data?.message;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (error instanceof Error) return error.message || '未知错误';
  return String(error);
}

export function toUserFacingAIError(error: unknown): Error {
  const status = readStatus(error);
  const message = readMessage(error);
  const quota = /insufficient[_ -]?quota|quota.{0,20}(?:exceed|耗尽|不足)|credit|余额|billing|payment required/i.test(message);

  let userMessage: string;
  if (status === 401 || /invalid.{0,12}(?:api[_ -]?key|密钥)|unauthori[sz]ed|authentication/i.test(message)) {
    userMessage = 'API 密钥无效或已过期。请打开“API管理”重新填写密钥，并使用“测试连接”验证。';
  } else if (status === 402 || quota) {
    userMessage = 'API 额度或账户余额不足。请充值/更换提供商，或在“API管理”切换到仍有额度的配置。';
  } else if (status === 403) {
    userMessage = 'API 拒绝访问（403）。请检查密钥权限、模型访问权限和账户状态。';
  } else if (status === 429 || /\b429\b/.test(message)) {
    userMessage = 'AI 请求过于频繁（429）。系统已自动重试；仍失败请稍后再试或降低并发。';
  } else if (status === 503 || /service unavailable/i.test(message)) {
    userMessage = 'AI 服务暂不可用（503）。系统已自动重试；请检查提供方状态，或稍后再试。';
  } else {
    userMessage = message || 'AI 调用失败';
  }

  const result = new Error(userMessage);
  (result as any).cause = error;
  return result;
}
