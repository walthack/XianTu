import { stripModelThinking } from '@/utils/jsonExtract';
import {
  buildLegacySafeNarrative,
  clipToNarrativeCap,
  LEGACY_NARRATIVE_MAX_CHARS,
  validateLegacyVisibleNarrative,
} from './legacyNarrativeContract';
import { legacyPilotPreferredSentences } from './legacyPilotScenes';
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
  const text = stripModelThinking(String(raw || '')).trim();
  if (!text.startsWith('{') || !text.endsWith('}')) return fallback;
  try {
    const json = JSON.parse(text);
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
  return legacyPilotPreferredSentences(packet, plan);
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
