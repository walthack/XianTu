/**
 * 主叙事格式重试（MainGamePanel.retryAIResponse）是「同一手再发一次」：沿用第一次请求里这一手的结算输入。
 * 只挑结算输入；generation_id、流式回调、shouldAbort、图片等只属于某一次请求，由重试自己给。
 * 第一次生成失败时 AIBidirectionalSystem 在 processGmResponse 之前返回占位回包，这些输入都还没被消耗。
 */
export const NARRATIVE_RETRY_CARRIED_KEYS = [
  'eventAction', // 本拍动作（含罗盘移动的 travelFromLocationId）
  'eventActionProvenance',
  'opportunityAction', // 机会动作
  'openWorldAction', // 五原地方动作
  'gambleRefusalAction', // 白湖拒赌
  'judgementResolution', // 本地判定结果（发送前已写入存档，AIBS 只核对回执）
  'cultivationSelections',
  'freeTextStatusResolution',
  'qingyuTurnId', // 清羽回合号：重试算同一回合的长请求预算
] as const;

export function carryNarrativeRetryOptions(turnOptions: Record<string, unknown> | undefined): Record<string, unknown> {
  const carried: Record<string, unknown> = {};
  for (const key of NARRATIVE_RETRY_CARRIED_KEYS) {
    const value = turnOptions?.[key];
    // 空数组（普通回合的 cultivationSelections）与不带同义，不带：没有结算输入时重试 options 与修之前一致。
    if (value !== undefined && !(Array.isArray(value) && !value.length)) carried[key] = value;
  }
  return carried;
}
