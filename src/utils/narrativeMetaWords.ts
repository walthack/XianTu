/**
 * 玩家可见叙事里的内部元词替换（真机 REPORT-8091-69ab6bdd / cd167d7a：正文、卡片标题与行动选项出现「本世界线支流」）。
 * 来源是大偏离提示要求模型把衍生线表述为“本世界线支流”（storyContext 的提示词，按用户要求不改提示词文本），
 * 所以只在显示层把它换成玩家化说法；存档里的原文、送回模型的上下文都不动。
 * 「支流」单独出现可能是真河流（如「大江支流」），只替换带世界线字样或明显指剧情线的写法。
 */
const META_WORD_RULES: ReadonlyArray<[RegExp, string]> = [
  // 作者占位标记（真机 REPORT-8091-fbef6792：右栏预警「【扩写】大祭将近…」、开祭过场「【扩写·待剧情策划】你决定赴黑魔海…」）：
  // 只隐藏标记本身，后面的文字保留；数据里的标记不动（剧情策划据此找待补文案）。
  [/【扩写[^】]*】\s*/g, ''],
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

/**
 * 事件原始 id → 玩家可读名（真机 REPORT-8091-fbef6792：入秦档右栏「战役编年史」露出 lyl.event.taiquan_sacred_fruit_06）。
 * 编年史条目由 runtime 按「当前关事件 name，查不到用 id」写入；跨关继承的已完成拍在当前关查不到 name，就落成了 id。
 * 只改显示：先查给定的事件名表，查不到给 UNNAMED_EVENT_LABEL，不再把 id 给玩家看。
 */
const RAW_EVENT_ID = /\b[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*\.event\.[a-z0-9_]+\b/g;
const LOOKS_LIKE_EVENT_ID = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*\.event\.[a-z0-9_]+$/;
export const UNNAMED_EVENT_LABEL = '前情一幕';
export function displayEventIds(text: unknown, nameOf: (id: string) => string | undefined): string {
  if (typeof text !== 'string' || !text) return typeof text === 'string' ? text : '';
  return text.replace(RAW_EVENT_ID, id => {
    const name = nameOf(id);
    return typeof name === 'string' && name.trim() && !LOOKS_LIKE_EVENT_ID.test(name) ? name : UNNAMED_EVENT_LABEL;
  });
}

/** 由剧本（内置关＋内容包关）汇总事件 id → name；同 id 先到先得。 */
export function eventNameIndex(mods: ReadonlyArray<{ scenario?: { events?: ReadonlyArray<{ id?: string; name?: string }> } }>): Map<string, string> {
  const index = new Map<string, string>();
  for (const mod of mods) for (const event of mod?.scenario?.events || []) {
    if (event?.id && typeof event.name === 'string' && event.name.trim() && !index.has(event.id)) index.set(event.id, event.name);
  }
  return index;
}

/** 玩家可见的右栏/编年史文本：先换事件 id，再去元词与占位标记。 */
export function playerFacingText(text: unknown, nameOf: (id: string) => string | undefined = () => undefined): string {
  return stripNarrativeMetaWords(displayEventIds(text, nameOf));
}
