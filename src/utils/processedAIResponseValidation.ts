export interface ProcessedAIResponseValidation {
  isValid: boolean;
  errors: string[];
  transactionCommitted: boolean;
}

/**
 * 校验已经由 AIBidirectionalSystem 落账过的响应。
 *
 * mid_term_memory 在 GM_Response 合同中本来就是可选字段；落账层也会在它为空时，
 * 从正文补一条隐式中期记忆。这里不能因其为空而重新执行整次玩家行动，否则同一
 * 次输入会二次推进世界回合、重复消费跨拍状态。
 */
export function validateProcessedAIResponse(response: unknown): ProcessedAIResponseValidation {
  const errors: string[] = [];

  if (!response) {
    errors.push('AI响应为空');
    return { isValid: false, errors, transactionCommitted: false };
  }

  const value = response as Record<string, unknown>;
  const transactionCommitted = value.transactionCommitted === true;
  if (!value.text || typeof value.text !== 'string') {
    errors.push('缺少有效的text字段');
  }

  // 生成失败发生在状态事务之前，仍沿用旧的结构重试；一旦事务已经提交，
  // 展示层只检查可展示正文，绝不能因模型附带字段再执行同一玩家行动。
  if (!transactionCommitted) {
    if (typeof value.mid_term_memory !== 'string' || value.mid_term_memory.trim().length === 0) {
      errors.push('缺少必要的mid_term_memory字段（中期记忆总结）');
    }
    if (value.tavern_commands !== undefined && !Array.isArray(value.tavern_commands)) {
      errors.push('tavern_commands字段必须是数组');
    }
  }

  return { isValid: errors.length === 0, errors, transactionCommitted };
}
