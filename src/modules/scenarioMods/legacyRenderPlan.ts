import {
  buildLegacySafeNarrative,
  clipToNarrativeCap,
  LEGACY_NARRATIVE_MAX_CHARS,
  validateLegacyVisibleNarrative,
} from './legacyNarrativeContract';
import type { LegacyNarratorPacket } from './legacyNarratorPacket';

export const LEGACY_RENDER_PACING = ['slow_orient', 'tense_watch', 'steady_breathe'] as const;
export const LEGACY_RENDER_SENSORY = ['grass_iron', 'wind_sky', 'mud_body'] as const;
export const LEGACY_RENDER_COMPANION = ['dazed', 'answers', 'silent_grip'] as const;
export const LEGACY_RENDER_CLOSING = ['hold_ground', 'look_far', 'steady_breath'] as const;

export type LegacyRenderPacing = (typeof LEGACY_RENDER_PACING)[number];
export type LegacyRenderSensory = (typeof LEGACY_RENDER_SENSORY)[number];
export type LegacyRenderCompanion = (typeof LEGACY_RENDER_COMPANION)[number];
export type LegacyRenderClosing = (typeof LEGACY_RENDER_CLOSING)[number];

export interface LegacyRenderPlan {
  pacing: LegacyRenderPacing;
  sensory: LegacyRenderSensory;
  companion: LegacyRenderCompanion;
  closing: LegacyRenderClosing;
}

export const DEFAULT_LEGACY_RENDER_PLAN: LegacyRenderPlan = {
  pacing: 'slow_orient',
  sensory: 'grass_iron',
  companion: 'dazed',
  closing: 'hold_ground',
};

export const LEGACY_RENDER_PLAN_INSTRUCTION = [
  '只输出一个 JSON 对象，不要叙事正文，不要 Markdown。',
  '{"pacing":"slow_orient|tense_watch|steady_breathe","sensory":"grass_iron|wind_sky|mud_body","companion":"dazed|answers|silent_grip","closing":"hold_ground|look_far|steady_breath"}',
].join('\n');

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function parseLegacyRenderPlan(raw: string): { plan: LegacyRenderPlan; parsed: boolean } {
  const text = String(raw || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { plan: { ...DEFAULT_LEGACY_RENDER_PLAN }, parsed: false };
  try {
    const json = JSON.parse(text.slice(start, end + 1));
    if (!json || typeof json !== 'object') return { plan: { ...DEFAULT_LEGACY_RENDER_PLAN }, parsed: false };
    return {
      parsed: true,
      plan: {
        pacing: pickEnum(json.pacing, LEGACY_RENDER_PACING, DEFAULT_LEGACY_RENDER_PLAN.pacing),
        sensory: pickEnum(json.sensory, LEGACY_RENDER_SENSORY, DEFAULT_LEGACY_RENDER_PLAN.sensory),
        companion: pickEnum(json.companion, LEGACY_RENDER_COMPANION, DEFAULT_LEGACY_RENDER_PLAN.companion),
        closing: pickEnum(json.closing, LEGACY_RENDER_CLOSING, DEFAULT_LEGACY_RENDER_PLAN.closing),
      },
    };
  } catch {
    return { plan: { ...DEFAULT_LEGACY_RENDER_PLAN }, parsed: false };
  }
}

function preferredSentences(packet: LegacyNarratorPacket, plan: LegacyRenderPlan): string[] {
  const location = packet.location || '这片草地';
  const names = (packet.mustAppear?.present || packet.present || []).filter(Boolean);
  const companion = names[0] || '身边的人';
  const sensory = {
    grass_iron: `风从${location.replace(/[·,，]/g, '')}上刮过来，铁锈、草汁和远处人喊马嘶混在一起。`,
    wind_sky: `天光白得刺眼。你抬手挡了挡，这才看清地平线处有烟，有尘。`,
    mud_body: `你撑着湿草撑起上身。掌心下面仍是泥土和草根，凉，黏，带着刚被压过的草汁。`,
  }[plan.sensory];
  const pacing = {
    slow_orient: `你没有起身就跑。眼下第一件事仍是先稳住自己，辨认这一处落点，弄清身在何处。`,
    tense_watch: `你把呼吸压低，先把能看见的边界看完，不跟着远处的喊声走。`,
    steady_breathe: `你先稳住呼吸，再慢慢把膝盖从泥里抽出来，让自己重新坐实。`,
  }[plan.pacing];
  const reaction = {
    dazed: `${companion}就在几步开外，肩背一起一伏，嘴唇发白，一时说不出完整的话。`,
    answers: `${companion}抬眼看你，喉咙动了动，终于挤出半句：“这……这不是飞机。”`,
    silent_grip: `${companion}忽然抓住一把草，像抓住最后一点能证明这不是虚空的东西。`,
  }[plan.companion];
  const closing = {
    hold_ground: `你把膝盖上的泥抹掉，重新蹲稳，让自己处在随时能起身、却还不盲目冲出去的位置。`,
    look_far: `你让身边的人先喘气，自己则把视野放远：左面是开阔的坡，右面有旗帜在抖。`,
    steady_breath: `你把呼吸重新对齐，先弄清自己身在何处。`,
  }[plan.closing];
  const gated: string[] = [];
  if (packet.receipts?.move) {
    gated.push(`你仍停在${location}，没有把这一步写成换地方。`);
  }
  if (packet.receipts?.casualty) {
    gated.push(`${companion}还在喘气。你先确认人还在，不把未见回执的伤亡写实。`);
  }
  return [reaction, sensory, pacing, ...gated, closing].filter(Boolean);
}

export function composeLegacyNarrativeFromPlan(
  packet: LegacyNarratorPacket,
  plan: LegacyRenderPlan = DEFAULT_LEGACY_RENDER_PLAN,
): string {
  const text = clipToNarrativeCap(
    buildLegacySafeNarrative(packet, '', preferredSentences(packet, plan)),
    LEGACY_NARRATIVE_MAX_CHARS,
  );
  const check = validateLegacyVisibleNarrative(text, packet);
  if (check.valid) return text;
  return clipToNarrativeCap(buildLegacySafeNarrative(packet), LEGACY_NARRATIVE_MAX_CHARS);
}
