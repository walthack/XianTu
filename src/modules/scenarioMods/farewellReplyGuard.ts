/**
 * 隔门道别时门内回应的输出检查（用户 2026-10-14 定：回应由模型生成，必须过检查，命中换固定备用版）。
 * 三层：关键词 → 主持模型复核等价表达 → 命中任何一层即换成按黑石滩照料档位选的固定备用版。
 * 只检查生成出来的回应台词本身，不检查禁令文本。
 *
 * 状态：纯函数，已有单测；**尚未接进叙事管线**。接线需要 AIBidirectionalSystem 在 stage_05b 对该步骤调用本函数，
 * 现有的 validateStepSceneNarrative 只覆盖 isNanhuangSceneStage（03b/04/04b），不含 05b。
 * 在接线之前，Y6 的 replyMode 保持 fixed（见 game-numbers.qingyu.json 的 lineBonds.ningyu.replyMode）。
 */
export type CareLevel = 'warm' | 'plain' | 'none';

/** 关键词层。命中即判失败。 */
export const FAREWELL_FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /爱/, /喜欢/, /心里.{0,4}(?:有|只有)你/, /舍不得/, /离不开/, /想你/, /等你/, /(?:跟|随)你(?:走|去)/, /丢下一切/, /同行/,
];

/** 固定备用版。warm 一句来自原著第124章的转述（改为直接引语，属推断）；plain 为推断；none 取原著「闭门不见」。 */
export const FAREWELL_FALLBACKS: Readonly<Record<CareLevel, string>> = {
  warm: '「我的伤不要紧，别误了你的事。」',
  plain: '「走吧。」',
  none: '门内没有声音，门也没有开。',
};

export function farewellKeywordHit(text: string): string | null {
  return FAREWELL_FORBIDDEN_PATTERNS.find(pattern => pattern.test(text))?.source ?? null;
}

export function buildFarewellReviewPrompt(reply: string): { system: string; user: string } {
  return {
    system: '你是文本审核员。判断一段小说台词是否在承认情意：包括直说爱、喜欢、牵挂、不舍、想念、等待、愿意跟随或放下一切的任何等价说法。只回答 JSON：{"admitsFeelings": true|false}。',
    user: `台词：${reply}`,
  };
}

/** 复核结果解析；任何无法确认「没有承认情意」的输出都按承认处理（宁可换备用版）。 */
export function parseFarewellReview(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?|```$/g, '').trim());
    return parsed?.admitsFeelings !== false;
  } catch {
    return true;
  }
}

export type FarewellCheck = { ok: true; text: string } | { ok: false; text: string; reason: 'keyword' | 'review' | 'review_error' };

/**
 * `review` 必填：没有复核就不能放行模型稿。care 缺省（没做过黑石滩那一拍）按 none 处理。
 */
export async function checkFarewellReply(input: {
  text: string;
  care?: CareLevel;
  review: (prompt: { system: string; user: string }) => Promise<string>;
}): Promise<FarewellCheck> {
  const fallback = FAREWELL_FALLBACKS[input.care ?? 'none'];
  if (farewellKeywordHit(input.text)) return { ok: false, text: fallback, reason: 'keyword' };
  let raw: string;
  try {
    raw = await input.review(buildFarewellReviewPrompt(input.text));
  } catch {
    return { ok: false, text: fallback, reason: 'review_error' };
  }
  return parseFarewellReview(raw) ? { ok: false, text: fallback, reason: 'review' } : { ok: true, text: input.text };
}
