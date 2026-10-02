/**
 * 事件级叙事边界（数据表）。
 *
 * 多步事件在合同尚未完成时，演出模型不得把结果写成已成立。边界按事件声明，
 * 由通用演出提示与通用验证器读取——通用代码里不再出现具体事件 ID。
 * 新增承重拍时只在此表追加一条，由剧情策划提供 sceneNote，系统策划提供判定式。
 */
export interface NarrativeBoundary {
  /** 合同未完成时追加进场景材料的演出边界（给模型看）。 */
  sceneNote: string;
  /** 命中即判定"把未完成的结果写成已成立"。 */
  forbidden: RegExp;
  /** 先从子句中剥除的否定表达（如"尚未答应"），避免误杀。 */
  negations?: RegExp;
  /** 拒收正文时的原因（进回执与回落记录）。 */
  rejectMessage: string;
}

const NARRATIVE_BOUNDARIES: Readonly<Record<string, NarrativeBoundary>> = {
  'lcq.event.sudaji_south_pact': {
    sceneNote: '只演提出交换，苏妲己尚未确认三个月期限。不能写期限从今日算起、达成协议或行动自由。',
    // 复测 fx-pact2 原话「三个月，我准了」曾漏过；补上口头应允类说法。
    forbidden: /从(?:今日|今天)算起|给你三个月|三个月.{0,8}(?:订死|定下|算起)|南荒之约.{0,8}(?:说死|达成|确定)|苏妲己.{0,12}(?:答应|同意|应允)|期限.{0,8}(?:确定|订下|定下|达成)|准了|准你|依你|成交|一言为定|就这么(?:定|说定|办)/,
    negations: /(?:没有|尚未|还未|并未|不曾|未曾|未能|不会|还没有)(?:立刻)?(?:答应|同意|应允|确认|达成|定下|准)/g,
    rejectMessage: '本轮只完成提议，正文提前确认了期限；没有提交，请重试',
  },
};

export function getNarrativeBoundary(eventId: string | undefined): NarrativeBoundary | null {
  return eventId ? NARRATIVE_BOUNDARIES[eventId] || null : null;
}

/** 合同未完成时给演出模型的边界文本；已完成或无声明时为 undefined。 */
export function narrativeBoundaryNote(eventId: string | undefined, completed: boolean): string | undefined {
  if (completed) return undefined;
  return getNarrativeBoundary(eventId)?.sceneNote;
}

/** 通用验证：未完成的合同被正文写成已成立时抛错。 */
export function validateNarrativeBoundary(text: string, eventId: string | undefined, completed: boolean): void {
  const boundary = completed ? null : getNarrativeBoundary(eventId);
  if (!boundary) return;
  const clauses = text.split(/[。！？\n]/);
  const strip = (clause: string) => boundary.negations ? clause.replace(boundary.negations, '') : clause;
  if (clauses.some(clause => boundary.forbidden.test(strip(clause)))) throw new Error(boundary.rejectMessage);
}

/**
 * 自由回合兜底：未完成的合同被正文写成已成立时，只删命中的句子，保留其余正文。
 * 返回 removed 为空表示未命中。用于重要桥段的"幕间"回合（不推进事件时，正文不得写出结果）。
 */
export function stripNarrativeBoundaryClauses(text: string, eventId: string | undefined): { text: string; removed: string[] } {
  const boundary = getNarrativeBoundary(eventId);
  if (!boundary || !text) return { text, removed: [] };
  const segments = text.match(/[^。！？!?\n]+[。！？!?]*[”’」』"]*|\n+/g) || [];
  const removed: string[] = [];
  const kept = segments.filter(segment => {
    if (/^\n+$/.test(segment)) return true;
    const stripped = boundary.negations ? segment.replace(boundary.negations, '') : segment;
    if (boundary.forbidden.test(stripped)) { removed.push(segment.trim()); return false; }
    return true;
  });
  return { text: kept.join('').replace(/\n{3,}/g, '\n\n').trim(), removed };
}
