/**
 * 玩家可见叙事里的内部元词替换（真机 REPORT-8091-69ab6bdd / cd167d7a：正文、卡片标题与行动选项出现「本世界线支流」）。
 * 来源是大偏离提示要求模型把衍生线表述为“本世界线支流”（storyContext 的提示词，按用户要求不改提示词文本），
 * 所以只在显示层把它换成玩家化说法；存档里的原文、送回模型的上下文都不动。
 * 「支流」单独出现可能是真河流（如「大江支流」），只替换带世界线字样或明显指剧情线的写法。
 */
const META_WORD_RULES: ReadonlyArray<[RegExp, string]> = [
  [/这条本?世界线(?:的)?支流/g, '这条路'],
  [/本?世界线(?:的)?支流/g, '眼下这条路'],
  [/(?:当前|这条|此条)?衍生(?:支)?线/g, '眼下这条路'],
  [/继续(?:当前|这条)?支流/g, '继续眼下这条路'],
  [/留在([一-龥]{1,6}?)支流/g, '留在$1'],
];

/** 把内部元词换成玩家化说法；非字符串原样返回空串。 */
export function stripNarrativeMetaWords(text: unknown): string {
  if (typeof text !== 'string' || !text) return typeof text === 'string' ? text : '';
  let out = text;
  for (const [pattern, replacement] of META_WORD_RULES) out = out.replace(pattern, replacement);
  return out;
}

/** 行动选项逐条替换。 */
export function stripActionOptionMetaWords(options: unknown): string[] {
  return Array.isArray(options) ? options.map(option => stripNarrativeMetaWords(String(option ?? ''))) : [];
}
