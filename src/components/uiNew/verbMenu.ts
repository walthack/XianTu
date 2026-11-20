/**
 * 新界面（?ui=new）右列四个动词键：把这一手能做的事归到键下，不再分「主线／其他行动」。
 * ⚠ 临时口径（用户 2026-11-20 13:41 定方向，14:39 补：察看、交谈就是看当前场景；移动的主动权交给玩家。键名和归法未定）：
 *   · 剧本动作（主线、探索）带现成的 interaction.verb（runtime.ts 从文案推的）：observe→察看，talk→交谈，move→前往，其余→行动。
 *   · 察看、交谈下常驻当前场景的几条（看看四周、在场的每个人），见 sceneStandingLines；点了当作玩家自己写的这句话直接发出去。
 *   · 没带 verb 的（模型写的建议、机会、地方动作）按开头的词归类（verbOfText）——只决定排在哪个键下，不参与任何判定。
 *   · 同一个键下不按来源排序、不挂来源标签，免得一眼认出哪条是主线。
 */
export type VerbKey = 'look' | 'talk' | 'act' | 'go';

export const VERB_KEYS: ReadonlyArray<{ key: VerbKey; label: string }> = [
  { key: 'look', label: '察看' },
  { key: 'talk', label: '交谈' },
  { key: 'act', label: '行动' },
  { key: 'go', label: '前往' },
];

export interface VerbItem<T> {
  /** 按钮上的字 */
  label: string;
  /** 剧本动作：点了走老的 clickEngineOption；没有就是一句建议，点了当自由行动发出去 */
  engine?: T;
}

type EngineLike = { label: string; interaction?: { verb?: string }; actionText?: string; playerLine?: string };

const LEAD_IN = /^(?:先|再|然后|赶紧|立刻|马上|悄悄|小心|试着|继续|上前|过去|回头|转身|低声|开口|主动)+/u;
const TALK = /^(?:(?:向|找|与|跟|和|对|同|朝|请|让|叫|劝|求)[^，,。]{0,10}(?:打听|询问|问|说|讲|谈|聊|商量|商议|请教|交涉|解释|求|道|喊|答|告)|询问|追问|打听|问|交谈|搭话|说服|劝|安抚|安慰|告诉|回答|答应|拒绝|请求|请教|商议|商量|交涉|喊|呼唤|招呼|谈|聊|道谢|道歉)/u;
const GO = /^(?:前往|赶往|去往|动身|启程|出发|上路|离开|返回|回到)/u;
const LOOK = /^(?:观察|察看|查看|看|打量|留意|环顾|检查|调查|探查|搜|翻|辨认|确认|细听|听|嗅|闻|摸清|弄清|查|找|盯|望|瞧|端详)/u;

/** 一句没有 verb 字段的话归到哪个键：看去掉「先／再／悄悄」之类后的开头。认不出的归「行动」。 */
export function verbOfText(text: string): VerbKey {
  const head = String(text || '').trim().replace(/^我/u, '').replace(LEAD_IN, '');
  if (TALK.test(head)) return 'talk';
  if (LOOK.test(head)) return 'look';
  if (GO.test(head)) return 'go';
  return 'act';
}

/** 察看、交谈两个键下常驻的几条：只取在场的人，不靠剧本也不靠模型。 */
export function sceneStandingLines(presentNames: readonly string[]): { look: string[]; talk: string[] } {
  const names = [...new Set(presentNames.map(name => String(name || '').trim()).filter(Boolean))];
  return { look: ['看看四周', ...names.map(name => `打量${name}`)], talk: names.map(name => `找${name}说话`) };
}

/** 剧本动作按钮的字是「动词 · 对象 · 说明」，放进动词键下面后开头那个动词重复，去掉。 */
export function stripVerbPrefix(label: string): string {
  return String(label || '').replace(/^(?:观察|交谈|行动|使用|修整|前往|攻击)\s*·\s*/u, '');
}

const hash = (text: string): number => {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
};

export function groupVerbItems<T extends EngineLike>(engineOptions: readonly T[], suggestions: readonly string[], standing?: { look: readonly string[]; talk: readonly string[] }): Record<VerbKey, VerbItem<T>[]> {
  const groups: Record<VerbKey, VerbItem<T>[]> = { look: [], talk: [], act: [], go: [] };
  const seen = new Set<string>();
  for (const option of engineOptions) {
    const verb = option.interaction?.verb;
    const key: VerbKey = verb === 'observe' ? 'look' : verb === 'talk' ? 'talk' : verb === 'move' ? 'go' : verb ? 'act' : verbOfText(option.actionText || option.label);
    groups[key].push({ label: stripVerbPrefix(option.label), engine: option });
    for (const line of [option.label, option.actionText, option.playerLine]) if (line) seen.add(line.trim());
  }
  for (const raw of suggestions) {
    const text = String(raw || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    groups[verbOfText(text)].push({ label: text });
  }
  for (const key of ['look', 'talk'] as const) for (const text of standing?.[key] || []) {
    if (seen.has(text)) continue;
    seen.add(text);
    groups[key].push({ label: text });
  }
  // 同一个键下按字面的固定散列排：同一手里顺序不跳，也不是「剧本动作永远排第一」
  for (const key of Object.keys(groups) as VerbKey[]) groups[key].sort((a, b) => hash(a.label) - hash(b.label) || (a.label < b.label ? -1 : 1));
  return groups;
}
