import { findInternalNarrativeControlLeaks } from '@/utils/textSanitizer';
import {
  hasHardNarrativeViolation,
  validateNarrativePerformance,
} from './narrativePerformanceGuard';
import type { LegacyMustAppear, LegacyNarratorPacket } from './legacyNarratorPacket';

export const LEGACY_NARRATIVE_MIN_CHARS = 800;
export const LEGACY_NARRATIVE_MAX_CHARS = 1000;

const INTERNAL_DEV_LANGUAGE_RE = [
  /事件完成真值将由本地引擎落账/g,
  /事件完成真值/g,
  /本地引擎落账/g,
  /该动作类型不产生[^。！？\n]*/g,
  /若需要部分成功，必须改用专门的本地判定合同[^。！？\n]*/g,
  /若需要失败与重试，必须改用专门的本地判定合同[^。！？\n]*/g,
  /必须改用专门的本地判定合同[^。！？\n]*/g,
  /Render Packet/gi,
  /tavern_commands/gi,
  /narrativeAuthority/gi,
  /local_contract/gi,
  /mustAppear/g,
  /mustNotAppear/g,
];

/** Player-visible meta leaks. Reject LLM/local visible prose only — never settle move or write world state. */
export const PLAYER_VISIBLE_META_LEAK_RE = [
  /被写成/,
  /被写进/,
  /改写的?范围/,
  /落账/,
  /公开事实/,
  /公开动静/,
  /选择权交还/,
  /事件结束/,
  /你已亲自执行/,
  /气血\s*[：:]?\s*\d+\s*\/\s*\d+/,
  /气血仍是\s*\d+/,
];

const UNAUTHORIZED_ITEM_RE = /神兵|仙剑|飞剑|法宝|捡起一柄|获得了?(?:一[柄把件颗枚])/u;
const UNAUTHORIZED_MOVE_RE = /(?:已走到|走到了|走进了|进入了|来到了|已至|抵达了|已到达)([^。！？\n]{1,16})/u;
const UNAUTHORIZED_HARM_RE = /(?:重伤|身亡|死亡|被射杀|中箭身亡|刎颈|气绝)/u;
const UNAUTHORIZED_RELATION_RE = /结为(?:生死兄弟|道侣|夫妻|义兄|义弟)|拜把|生死与共的兄弟/u;
const UNAUTHORIZED_COMPLETION_RE = /事件完成|本事件已(?:完成|结束|落账)|任务已完成|事件已落账/u;

export interface LegacyVisibleNarrativeCheck {
  valid: boolean;
  issues: string[];
}

export function countVisibleNarrativeChars(text: string): number {
  return Array.from(String(text || '').replace(/\s+/g, '')).length;
}

export function stripInternalDevLanguage(text: string): string {
  let next = String(text || '');
  for (const pattern of INTERNAL_DEV_LANGUAGE_RE) {
    next = next.replace(pattern, '');
  }
  return next.replace(/[；;，,\s]+/g, match => (match.includes('；') || match.includes(';') ? '；' : match))
    .replace(/^[；;，,。.\s]+|[；;，,。.\s]+$/g, '')
    .replace(/；{2,}/g, '；')
    .trim();
}

export function isInternalDevLanguage(text: string): boolean {
  const raw = String(text || '');
  if (!raw.trim()) return false;
  if (findInternalNarrativeControlLeaks(raw).length) return true;
  return INTERNAL_DEV_LANGUAGE_RE.some(pattern => {
    pattern.lastIndex = 0;
    return pattern.test(raw);
  });
}

export function findPlayerVisibleMetaLeaks(text: string): string[] {
  const raw = String(text || '');
  if (!raw) return [];
  return PLAYER_VISIBLE_META_LEAK_RE
    .filter(pattern => {
      pattern.lastIndex = 0;
      return pattern.test(raw);
    })
    .map(pattern => pattern.source);
}

export function hasPlayerVisibleMetaLeak(text: string): boolean {
  return findPlayerVisibleMetaLeaks(text).length > 0;
}

function locationFragments(location: string): string[] {
  return String(location || '')
    .split(/[·,，\s]/)
    .map(item => item.trim())
    .filter(item => item.length >= 2);
}

function placeIsAuthorized(place: string, packet: LegacyNarratorPacket): boolean {
  const text = String(place || '').replace(/[“”"『』《》]/g, '').trim();
  if (!text) return true;
  if (packet.location && (packet.location.includes(text) || text.includes(packet.location))) return true;
  return locationFragments(packet.location).some(part => text.includes(part) || part.includes(text));
}

function authorizedFactBlob(packet: LegacyNarratorPacket): string {
  return [
    packet.action,
    packet.settledOutcome,
    packet.location,
    packet.currentObjective,
    ...(packet.publicFacts || []),
    ...(packet.present || []),
    packet.localReceipt?.outcome,
    ...(packet.body?.效果 || []),
  ].filter(Boolean).join('｜');
}

function unauthorizedInvention(text: string, packet: LegacyNarratorPacket): string | undefined {
  const authorized = authorizedFactBlob(packet);
  if (UNAUTHORIZED_ITEM_RE.test(text) && !/神兵|仙剑|飞剑|法宝/.test(authorized)) {
    return '未经授权的物品';
  }
  const move = text.match(UNAUTHORIZED_MOVE_RE);
  if (move?.[1] && !placeIsAuthorized(move[1], packet)) {
    return '未经授权的地点移动';
  }
  if (UNAUTHORIZED_HARM_RE.test(text) && !UNAUTHORIZED_HARM_RE.test(authorized)) {
    return '未经授权的受伤或死亡';
  }
  if (UNAUTHORIZED_RELATION_RE.test(text) && !UNAUTHORIZED_RELATION_RE.test(authorized)) {
    return '未经授权的关系终态';
  }
  if (UNAUTHORIZED_COMPLETION_RE.test(text)) {
    return '未经授权的事件完成声明';
  }
  return undefined;
}

function requiredConcepts(packet: LegacyNarratorPacket): LegacyMustAppear {
  const required = packet.mustAppear;
  if (required && typeof required === 'object' && !Array.isArray(required)) {
    return {
      location: required.location || packet.location || '',
      present: Array.isArray(required.present) && required.present.length ? required.present : (packet.present || []),
      objective: required.objective || packet.currentObjective || '',
    };
  }
  return {
    location: packet.location || '',
    present: packet.present || [],
    objective: packet.currentObjective || '',
  };
}

/** Local semantic cues for the current goal. Text hits never settle movement or write world state. */
export function narrativeHasObjectiveSemantics(text: string, objective: string): boolean {
  const narrative = String(text || '');
  const goal = String(objective || '').trim();
  if (!goal) return true;
  const needStabilize = /稳住/.test(goal);
  const needOrient = /弄清|身在何处|辨认|处境|降落/.test(goal);
  const hasStabilize = /稳住|坐实|站稳|把重心放稳|把呼吸/.test(narrative);
  const hasOrient = /弄清|身在何处|辨认|处境|这是哪里|落点/.test(narrative);
  if (needStabilize && needOrient) return hasStabilize && hasOrient;
  if (needStabilize) return hasStabilize;
  if (needOrient) return hasOrient;
  const parts = goal.split(/[，。；、\s]/).map(item => item.trim()).filter(item => item.length >= 2);
  return parts.some(part => narrative.includes(part));
}

function missingRequiredConcepts(text: string, packet: LegacyNarratorPacket): string[] {
  const issues: string[] = [];
  const required = requiredConcepts(packet);
  for (const name of required.present || []) {
    if (name && !text.includes(name)) issues.push(`在场人物“${name}”未出现`);
  }
  const location = required.location;
  const locationHit = locationFragments(location).some(part => text.includes(part));
  if (location && !locationHit && !text.includes(location)) {
    issues.push('当前位置未出现');
  }
  if (required.objective && !narrativeHasObjectiveSemantics(text, required.objective)) {
    issues.push('当前目标语义未出现');
  }
  return issues;
}

export function narrativeHasRequiredConcepts(text: string, packet: LegacyNarratorPacket): boolean {
  return missingRequiredConcepts(text, packet).length === 0;
}

export function validateLegacyVisibleNarrative(
  text: string,
  packet: LegacyNarratorPacket,
  options: { partial?: boolean; userInput?: string; storyPrompt?: string } = {},
): LegacyVisibleNarrativeCheck {
  const issues: string[] = [];
  const narrative = String(text || '');
  if (!narrative.trim()) {
    if (!options.partial) issues.push('正文为空');
    return { valid: issues.length === 0, issues };
  }
  if (isInternalDevLanguage(narrative)) {
    issues.push('正文含内部协议或开发话术');
  }
  if (hasPlayerVisibleMetaLeak(narrative)) {
    issues.push('正文含玩家可见系统话术');
  }
  const invention = unauthorizedInvention(narrative, packet);
  if (invention) issues.push(invention);
  if (options.storyPrompt) {
    const performance = validateNarrativePerformance(
      narrative,
      options.userInput || packet.action || '',
      options.storyPrompt,
    );
    if (hasHardNarrativeViolation(performance)) {
      issues.push(...performance.issues.filter(issue => issue.startsWith('硬门禁：')));
    }
  }
  if (options.partial) return { valid: issues.length === 0, issues };

  if (!/你/.test(narrative)) issues.push('正文必须是第二人称');
  const chars = countVisibleNarrativeChars(narrative);
  if (chars < LEGACY_NARRATIVE_MIN_CHARS) issues.push(`正文过短（${chars}字）`);
  if (chars > LEGACY_NARRATIVE_MAX_CHARS) issues.push(`正文超过硬上限（${chars}字）`);
  issues.push(...missingRequiredConcepts(narrative, packet));
  return { valid: issues.length === 0, issues };
}

function placeLabel(location: string): string {
  const compact = String(location || '').replace(/[·,，]/g, '');
  if (compact) return compact;
  return locationFragments(location)[0] || '这片草地';
}

function safeSentencePool(packet: LegacyNarratorPacket): string[] {
  const companion = (packet.present || []).find(Boolean) || '身边的人';
  const location = packet.location || '这片草地';
  const place = placeLabel(location);
  const objective = stripInternalDevLanguage(packet.currentObjective || '先稳住自己并弄清身在何处');
  const goalLine = /稳住|弄清|身在何处|辨认/.test(objective)
    ? `你没有起身就跑。眼下第一件事仍是先稳住自己，辨认这一处落点，弄清身在何处。`
    : `你没有起身就跑。眼下第一件事仍是${objective}。`;
  return [
    `${companion}就在几步开外，肩背一起一伏，嘴唇发白，一时说不出完整的话。`,
    `风从${place}上刮过来，铁锈、草汁和远处人喊马嘶混在一起。`,
    goalLine,
    `你撑着湿草撑起上身。掌心下面仍是泥土和草根，凉，黏，带着刚被压过的草汁。`,
    `耳膜里还残留着刚才那一阵轰响，像整片天空从中间被撕开。`,
    `你先稳住呼吸，再慢慢把膝盖从泥里抽出来，让自己重新坐实。`,
    `指甲缝里是黑土，指节还在发抖。衣服被露水洇透，贴在小腿上发凉。`,
    `“${companion}。”你低声叫了一声。他答应得晚半拍，声音发干，却毕竟应了。`,
    `他眼睛很大，神情里仍带着那种容易把眼前一切当成梦的恍惚。`,
    `你认得这副样子，眼下却只能先确认他还在、还能喘气。`,
    `四周不是跑道，也不是舱壁。草浪一层层推开，远近都有旗帜和人影在晃。`,
    `天光白得刺眼。你抬手挡了挡，这才看清地平线处有烟，有尘，有一群人正在厮杀。`,
    `那些动静离你还不近，可风已经把血腥味送过来了。`,
    `脚底的土是软的，踩下去会陷。你试着把重心放稳，免得再摔回草里。`,
    `${companion}朝你这边爬了一小步，手在空中抓了抓，像还想抓住并不存在的扶手。`,
    `你把眼前能确定的事在心里过了一遍：人还在，地是草地，天还亮着，远处在打仗。`,
    `你用袖口擦掉嘴角的土，味道又腥又苦。`,
    `一只虫子从草叶上弹开。你跟着它的方向看过去，只看到更多的草。`,
    `你试着辨认太阳的位置，又辨认风的来处，好让自己不要转糊涂。`,
    `${companion}忽然抓住一把草，像抓住最后一点能证明这不是虚空的东西。`,
    `你让他先喘气，自己则把视野放远：左面是开阔的坡，右面有旗帜在抖，再远处有金属碰撞的碎响。`,
    `你再看了看自己的落点。周围只剩被压倒的草和浅浅的泥窝。`,
    `你把手指插入土里，确认它会凉、会湿、会粘。这是实的。`,
    `有那么一瞬间你想问这是哪里。问题已经在嘴里，答案却不能靠空想。`,
    `你决定先把能看见的都看清楚：人、草、烟、旗、还有自己还能不能站稳。`,
    `${companion}的呼吸渐渐从乱变成急。你朝他点了下头，意思是先活过这一刻。`,
    `风更大了些。草浪把你们两个小小的影子一下下盖住，又一下下掀开。`,
    `你把膝盖上的泥抹掉，重新蹲稳，让自己处在随时能起身、却还不盲目冲出去的位置。`,
    `远处的喊杀仍在继续。你只把这一圈看得更清楚：${place}还在脚下，${companion}还在身边。`,
    `你把呼吸重新对齐，先弄清自己身在何处。`,
    `草叶刮过手腕，留下一道浅浅的凉意。你没有跟着远处的喊声走。`,
    `你再听了听自己的心跳，一下一下，沉，却还算齐。`,
    `${companion}抬眼看你，喉咙动了动，终于挤出半句：“这……这不是飞机。”`,
    `你点了下头，没有急着回答。先把能看见的边界看完。`,
    `坡下有旗在抖。旗的颜色被烟尘搅浑，看不真切，可那是人在动，不是云。`,
    `你用手背抹掉睫毛上的土，视野这才干净一点。`,
    `泥土的味道很重。比机舱里那点循环空气要实得多。`,
    `你把一只手按在地上，另一只手虚扶着，让自己随时能撑起来。`,
    `${companion}还蹲在原处，手指死死抠着草根，像生怕一松手人就会重新掉回去。`,
    `你低声说：“先别动。看清楚再说话。”`,
    `他自己点头，动作小，却听进去了。`,
    `你把目光从他脸上收回来，重新量这片落点：前、后、左、右，都是草。`,
  ];
}

function endsWithCompleteSentence(text: string): boolean {
  return /[。！？]$/.test(String(text || '').trim());
}

function assembleSafeNarrative(packet: LegacyNarratorPacket, existing: string): string {
  let text = String(existing || '').trim();
  if (text && !/[。！？”]$/.test(text)) text += '。';
  if (text && !validateLegacyVisibleNarrative(text, packet, { partial: true }).valid) {
    text = '';
  }
  if (countVisibleNarrativeChars(text) >= LEGACY_NARRATIVE_MIN_CHARS) {
    const complete = validateLegacyVisibleNarrative(text, packet);
    if (complete.valid) return clipToNarrativeCap(text, LEGACY_NARRATIVE_MAX_CHARS);
  }

  const pool = safeSentencePool(packet);
  for (const sentence of pool) {
    if (!sentence || text.includes(sentence)) continue;
    const trial = `${text}${sentence}`;
    const chars = countVisibleNarrativeChars(trial);
    if (chars > LEGACY_NARRATIVE_MAX_CHARS) continue;
    const check = validateLegacyVisibleNarrative(trial, packet, { partial: true });
    if (!check.valid) continue;
    text = trial;
    if (
      countVisibleNarrativeChars(text) >= LEGACY_NARRATIVE_MIN_CHARS
      && validateLegacyVisibleNarrative(text, packet).valid
    ) break;
  }

  if (countVisibleNarrativeChars(text) < LEGACY_NARRATIVE_MIN_CHARS) {
    const filler = '风还在吹。草还在动。你把这一圈又看清楚了一些。';
    while (
      countVisibleNarrativeChars(text + filler) <= LEGACY_NARRATIVE_MAX_CHARS
      && countVisibleNarrativeChars(text) < LEGACY_NARRATIVE_MIN_CHARS
    ) {
      const check = validateLegacyVisibleNarrative(text + filler, packet, { partial: true });
      if (!check.valid) break;
      text += filler;
    }
  }

  if (countVisibleNarrativeChars(text) > LEGACY_NARRATIVE_MAX_CHARS) {
    text = clipToNarrativeCap(text, LEGACY_NARRATIVE_MAX_CHARS);
  }
  if (text && !endsWithCompleteSentence(text)) {
    const clipped = clipToNarrativeCap(`${text}。`, LEGACY_NARRATIVE_MAX_CHARS);
    text = endsWithCompleteSentence(clipped) ? clipped : clipped.replace(/[^。！？]*$/, '').trim();
  }
  return text.trim();
}

export function buildLegacySafeNarrative(
  packet: LegacyNarratorPacket,
  existing = '',
): string {
  const assembled = assembleSafeNarrative(packet, existing);
  const complete = validateLegacyVisibleNarrative(assembled, packet);
  if (complete.valid) return assembled;
  if (existing) {
    const fresh = assembleSafeNarrative(packet, '');
    const freshCheck = validateLegacyVisibleNarrative(fresh, packet);
    if (freshCheck.valid) return fresh;
  }
  return assembled;
}

export function clipToNarrativeCap(text: string, maxChars: number = LEGACY_NARRATIVE_MAX_CHARS): string {
  const normalized = String(text || '');
  if (countVisibleNarrativeChars(normalized) <= maxChars) return normalized.trim();
  let kept = '';
  for (const char of Array.from(normalized)) {
    const trial = kept + char;
    if (countVisibleNarrativeChars(trial) > maxChars) break;
    kept = trial;
  }
  const sentenceEnd = Math.max(kept.lastIndexOf('。'), kept.lastIndexOf('！'), kept.lastIndexOf('？'), kept.lastIndexOf('”'));
  if (sentenceEnd >= Math.floor(kept.length * 0.65)) {
    return kept.slice(0, sentenceEnd + 1).trim();
  }
  return kept.trim();
}
