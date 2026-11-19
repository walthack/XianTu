/**
 * 新界面（?ui=new）立绘区：每一场（一个剧本事件）定一个「主要角色」。纯函数。
 *
 * ⚠ 临时办法：下面的规则是实现时定的占位规则，用户还没拍板，以后可能整体换掉。
 * 1. 事件没变、上一次定的主要角色还在场 → 不换（keep）。
 * 2. 否则重新定：
 *    a. 在场的人（不算主角）只有一个 → 就是他；
 *    b. 这个事件牵涉的人（不算主角）只有一个，且他在场 → 就是他；
 *    c. 这一手正文里第一个说话的（说话人记号〈名字〉）、在场的人 → 就是他；
 *    d. 都定不了 → 沿用上一次的（如果还在场），否则「没有」。
 * 3. 在场的人为空 → 「没有」。
 * 「在场」由调用方按 computeScenarioPresence 的口径给出；非剧本存档调用方直接当「没有」。
 */
import { parseSpeakerMarks } from '@/utils/speakerMarks';

export type LeadRule = 'keep' | 'a' | 'b' | 'c' | 'd';

export interface LeadPick {
  eventId: string;
  name: string;
  rule: LeadRule;
}

export interface LeadInput {
  /** 当前剧本事件 id（没有锚点事件时为空串）。 */
  eventId: string;
  /** 在场的人（名字，可含主角，函数里会去掉）。 */
  presentNames: readonly string[];
  /** 剧本里当前事件牵涉的人（名字，可含主角）；取不到给空数组＝跳过 b。 */
  eventCharacterNames: readonly string[];
  /** 这一手正文（带说话人记号的原文）。 */
  narrativeText: string;
  /** 主角名字，从各名单里去掉。 */
  playerName: string;
  /** 上一次定的结果。 */
  previous: LeadPick | null;
}

/** 正文里说话人按出现先后（去重）。 */
export function speakersInOrder(text: string): string[] {
  const out: string[] = [];
  for (const { speaker } of parseSpeakerMarks(text || '').speakers) {
    if (!out.includes(speaker)) out.push(speaker);
  }
  return out;
}

export function pickLeadCharacter(input: LeadInput): LeadPick | null {
  const { eventId, playerName, previous } = input;
  const notPlayer = (name: string) => Boolean(name) && name !== playerName;
  const present = [...new Set(input.presentNames.filter(notPlayer))];
  if (!present.length) return null;
  const isPresent = (name: string) => present.includes(name);

  if (previous && previous.eventId === eventId && isPresent(previous.name)) {
    return { eventId, name: previous.name, rule: 'keep' };
  }
  if (present.length === 1) return { eventId, name: present[0], rule: 'a' };
  const involved = [...new Set(input.eventCharacterNames.filter(notPlayer))];
  if (involved.length === 1 && isPresent(involved[0])) return { eventId, name: involved[0], rule: 'b' };
  const speaker = speakersInOrder(input.narrativeText).find(name => notPlayer(name) && isPresent(name));
  if (speaker) return { eventId, name: speaker, rule: 'c' };
  if (previous && isPresent(previous.name)) return { eventId, name: previous.name, rule: 'd' };
  return null;
}

/** 剪影的三种通用人形；按角色资料的性别选，没有或认不出 → 不分性别的披风人形。 */
export type SilhouetteKind = 'male' | 'female' | 'neutral';
export function silhouetteKindFor(gender: string | undefined): SilhouetteKind {
  const g = String(gender || '').trim();
  if (g === '男') return 'male';
  if (g === '女') return 'female';
  return 'neutral';
}
