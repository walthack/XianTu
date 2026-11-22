/**
 * 新界面（?ui=new）立绘区：多人在场也只放一张立绘，跟着「这一手主要是谁在说话」换，换人时淡入淡出。纯函数。
 * （用户 2026-11-23 01:32：不要小头像那一行，只留一张立绘做淡入淡出；怕角色一多互相说话时换得太勤。）
 *
 * 一手（一次正文）最多换一次，不跟着每一句换：
 * 1. 在场的人（不算主角）为空 → 「没有」。
 * 2. a. 在场的人只有一个 → 就是他；
 *    b. 这个事件牵涉的人（不算主角）只有一个，且他在场 → 就是他（这一拍的主角，不跟说话人换）；
 *    c. 这一手正文里说话句数最多的在场的人（说话人记号〈名字〉）；上一次的人并列最多 → 不换，否则并列取先开口的；
 *    keep／d. 这一手没有在场的人说话 → 沿用上一次的（事件没变记 keep，换了事件记 d），只要他还在场；
 *    e. 都定不了 → 在场名单里排第一的人（不空着）。
 * 「在场」由调用方按 computeScenarioPresence 的口径给出；非剧本存档调用方直接当「没有」。
 */
import { parseSpeakerMarks } from '@/utils/speakerMarks';

export type LeadRule = 'keep' | 'a' | 'b' | 'c' | 'd' | 'e';

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

  if (present.length === 1) return { eventId, name: present[0], rule: 'a' };
  const involved = [...new Set(input.eventCharacterNames.filter(notPlayer))];
  if (involved.length === 1 && isPresent(involved[0])) return { eventId, name: involved[0], rule: 'b' };

  // 按出现先后记每个在场的人说了几句；Map 保持先后，并列时先开口的在前
  const counts = new Map<string, number>();
  for (const { speaker } of parseSpeakerMarks(input.narrativeText || '').speakers) {
    if (isPresent(speaker)) counts.set(speaker, (counts.get(speaker) || 0) + 1);
  }
  if (counts.size) {
    const most = Math.max(...counts.values());
    if (previous && counts.get(previous.name) === most) return { eventId, name: previous.name, rule: 'c' };
    const name = [...counts.keys()].find(key => counts.get(key) === most) as string;
    return { eventId, name, rule: 'c' };
  }
  if (previous && isPresent(previous.name)) {
    return { eventId, name: previous.name, rule: previous.eventId === eventId ? 'keep' : 'd' };
  }
  return { eventId, name: present[0], rule: 'e' };
}

/** 剪影的三种通用人形；按角色资料的性别选，没有或认不出 → 不分性别的披风人形。 */
export type SilhouetteKind = 'male' | 'female' | 'neutral';
export function silhouetteKindFor(gender: string | undefined): SilhouetteKind {
  const g = String(gender || '').trim();
  if (g === '男') return 'male';
  if (g === '女') return 'female';
  return 'neutral';
}
