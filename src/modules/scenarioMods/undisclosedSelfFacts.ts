/**
 * 主角尚不自知的自身设定（stage 数据 `scenario.undisclosedSelfFacts`，见 schema 的 ScenarioUndisclosedSelfFact）。
 * 提示词禁令与正文检查共用这一份：旧链路经 storyContext 拼进剧本提示词，模块链路拼进演出 systemInstruction，
 * 叙事来源日志（LCQ-NAR-003）用同一份禁词只记录、不改正文。
 */

type UndisclosedFact = { fact: string; untilEventId: string; disclosedBy?: string };
type Runtime = { undisclosedSelfFacts?: UndisclosedFact[]; completedEventIds?: string[] } | null | undefined;

/**
 * 某条设定点破之前，叙事同样不写的相关词。
 * 九阳神功（用户 2026-10-28 01:18 定，策划稿《九阳得功时点与凝羽自称》①）：得功前允许修炼，
 * 但只写调息、吐纳、静坐、体内说不清的暖意；不写九阳、口诀、太一经。
 * 「真阳」一并禁：原著首次出口是王哲在帅帐点破生死根时（qyj:1215「没有修习过聚炼真阳的法术」），
 * 正是 s01_05 那一拍；蔺采泉（qyj:1446，第7章）没有单独的拍，月霜强取真阳的 s01_06 要等 s01_05 完成才激活。
 */
const WITHHELD_WITH_FACT: Record<string, string[]> = {
  九阳神功: ['九阳', '口诀', '太一经', '真阳'],
};
const PRE_DISCLOSURE_CULTIVATION = '调息、吐纳、静坐、体内说不清的暖意';

/** 还没到点破那一拍的设定。 */
export function pendingUndisclosedSelfFacts(runtime: Runtime): UndisclosedFact[] {
  const done = runtime?.completedEventIds || [];
  return (runtime?.undisclosedSelfFacts || []).filter(item => item?.fact && !done.includes(item.untilEventId));
}

/** 正文里此刻不该出现的词：未点破的设定本身加上它们的相关词，去重保序。 */
export function undisclosedSelfFactTerms(runtime: Runtime): string[] {
  return [...new Set(pendingUndisclosedSelfFacts(runtime).flatMap(item => [item.fact, ...(WITHHELD_WITH_FACT[item.fact] || [])]))];
}

/** 【主角尚不自知】禁令；全部点破后为空串。 */
export function undisclosedSelfFactsPromptLine(runtime: Runtime): string {
  const undisclosed = pendingUndisclosedSelfFacts(runtime);
  if (!undisclosed.length) return '';
  const related = [...new Set(undisclosed.flatMap(item => WITHHELD_WITH_FACT[item.fact] || []))];
  return `【主角尚不自知】玩家角色**还不知道**自己身上有这些：${undisclosed.map(item => `「${item.fact}」`).join('、')}。`
    + '这些字段确实写在人物面板上，但那是引擎的账，不是角色的认知——'
    + '**正文、玩家台词与行动选项里一律不得出现这些词**，也不得让主角据此行事或自述。'
    + '它们只能在剧情把它点破的那一拍由当场的人物说出来，那之后才可使用。'
    + (undisclosed.some(item => item.disclosedBy) ? `（点破方式：${undisclosed.filter(item => item.disclosedBy).map(item => `${item.fact}＝${item.disclosedBy}`).join('；')}）` : '')
    + (related.length ? `点破之前写修炼只写${PRE_DISCLOSURE_CULTIVATION}，同样不写${related.map(term => `「${term}」`).join('、')}。` : '');
}
