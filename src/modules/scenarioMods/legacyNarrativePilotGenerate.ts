import { createLegacySentenceStream } from './legacySentenceStream';
import { validateLegacyVisibleNarrative } from './legacyNarrativeContract';
import type { LegacyNarratorPacket } from './legacyNarratorPacket';
import {
  composeLegacyNarrativeFromPlan,
  parseLegacyRenderPlan,
} from './legacyRenderPlan';

export interface LegacyPilotGenerateCall {
  generationId: string;
  onStreamChunk?: (chunk: string) => void;
}

export interface LegacyPilotGenerateInput {
  playerLine: string;
  storyPrompt: string;
  packet: LegacyNarratorPacket;
  maxRetries: number;
  useStreaming: boolean;
  generationId: string;
  generate: (call: LegacyPilotGenerateCall) => Promise<string>;
  extractNarrativeText: (raw: string) => string;
  onStreamChunk?: (delta: string) => void;
  shouldAbort?: () => boolean;
}

export interface LegacyPilotGenerateResult {
  text: string;
  displayed: string;
  usedFallback: boolean;
  attempts: number;
  retried: boolean;
}

function publishLocalBody(
  input: LegacyPilotGenerateInput,
  body: string,
): { text: string; usedFallback: boolean } {
  const stream = createLegacySentenceStream({
    userInput: input.playerLine,
    storyPrompt: input.storyPrompt,
    packet: input.packet,
    mustNotAppear: input.packet.mustNotAppear,
    onSafeText: delta => {
      if (input.useStreaming) input.onStreamChunk?.(delta);
    },
  });
  stream.push(body);
  stream.closeAttempt();
  const visible = stream.getDisplayed().trim() || body;
  const complete = validateLegacyVisibleNarrative(visible, input.packet, {
    userInput: input.playerLine,
    storyPrompt: input.storyPrompt,
  });
  if (complete.valid) return { text: visible, usedFallback: false };
  stream.applyLocalSafety();
  const text = stream.getDisplayed().trim() || composeLegacyNarrativeFromPlan(input.packet);
  return { text, usedFallback: true };
}

/**
 * s01_01 vehicle: the model only returns a short RenderPlan.
 * Visible 800–1000 chars are composed locally from Packet + reviewed variants.
 */
export async function generateLegacyPilotNarrative(
  input: LegacyPilotGenerateInput,
): Promise<LegacyPilotGenerateResult> {
  const configuredRetries = Number(input.maxRetries);
  const maxRetries = Number.isFinite(configuredRetries)
    ? Math.max(0, Math.floor(configuredRetries))
    : 0;
  let attempts = 0;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (input.shouldAbort?.()) throw new Error('请求已被取消');
    attempts = attempt + 1;
    try {
      const raw = await input.generate({
        generationId: `${input.generationId}_a${attempt}`,
      });
      if (input.shouldAbort?.()) throw new Error('请求已被取消');
      const parsed = parseLegacyRenderPlan(input.extractNarrativeText(String(raw)));
      const body = composeLegacyNarrativeFromPlan(input.packet, parsed.plan);
      const published = publishLocalBody(input, body);
      if (input.useStreaming && !published.text) input.onStreamChunk?.(body);
      return {
        text: published.text,
        displayed: published.text,
        usedFallback: published.usedFallback || !parsed.parsed,
        attempts,
        retried: attempt > 0,
      };
    } catch (error) {
      lastError = error;
      if (input.shouldAbort?.()) throw error;
      if (attempt < maxRetries) continue;
      const body = composeLegacyNarrativeFromPlan(input.packet);
      const published = publishLocalBody(input, body);
      if (input.useStreaming && !published.text) input.onStreamChunk?.(body);
      return {
        text: published.text,
        displayed: published.text,
        usedFallback: true,
        attempts,
        retried: attempt > 0,
      };
    }
  }

  throw (lastError instanceof Error ? lastError : new Error('Legacy 单幕试验返回空正文'));
}
