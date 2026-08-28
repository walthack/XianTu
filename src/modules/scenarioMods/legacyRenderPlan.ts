import { stripModelThinking } from '@/utils/jsonExtract';
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

export const LEGACY_RENDER_PLAN_FIELDS = ['pacing', 'sensory', 'companion', 'closing'] as const;

export const LEGACY_RENDER_PLAN_INSTRUCTION = `# Legacy RenderPlan 响应合同（实验）

只输出一个 JSON 对象，不要叙事正文，不要 Markdown，不要 text 字段。

四个字段必须全部出现，不得增删字段，取值必须与下列枚举完全一致：

- pacing: ${LEGACY_RENDER_PACING.join(' | ')}
- sensory: ${LEGACY_RENDER_SENSORY.join(' | ')}
- companion: ${LEGACY_RENDER_COMPANION.join(' | ')}
- closing: ${LEGACY_RENDER_CLOSING.join(' | ')}

示例：
{"pacing":"slow_orient","sensory":"grass_iron","companion":"dazed","closing":"hold_ground"}`;

function isAllowed<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}

export function parseLegacyRenderPlan(raw: string): { plan: LegacyRenderPlan; parsed: boolean } {
  const fallback = { plan: { ...DEFAULT_LEGACY_RENDER_PLAN }, parsed: false as const };
  const text = stripModelThinking(String(raw || ''));
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return fallback;
  try {
    const json = JSON.parse(text.slice(start, end + 1));
    if (!json || typeof json !== 'object' || Array.isArray(json)) return fallback;
    const keys = Object.keys(json).sort();
    const expected = [...LEGACY_RENDER_PLAN_FIELDS].sort();
    if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
      return fallback;
    }
    if (
      !isAllowed(json.pacing, LEGACY_RENDER_PACING)
      || !isAllowed(json.sensory, LEGACY_RENDER_SENSORY)
      || !isAllowed(json.companion, LEGACY_RENDER_COMPANION)
      || !isAllowed(json.closing, LEGACY_RENDER_CLOSING)
    ) {
      return fallback;
    }
    return {
      parsed: true,
      plan: {
        pacing: json.pacing,
        sensory: json.sensory,
        companion: json.companion,
        closing: json.closing,
      },
    };
  } catch {
    return fallback;
  }
}

function preferredSentences(packet: LegacyNarratorPacket, plan: LegacyRenderPlan): string[] {
  const location = packet.location || '这片草地';
  const names = (packet.mustAppear?.present || packet.present || []).filter(Boolean);
  const companion = names[0] || '身边的人';
  const answers = companion === '段强'
    ? `${companion}抬眼看你，喉咙动了动，终于挤出半句：“这……这不是飞机。”`
    : `${companion}就在几步开外，一时说不出完整的话。`;
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
    answers,
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
