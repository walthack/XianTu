import { createLegacySentenceStream } from './legacySentenceStream';
import {
  buildLegacySafeNarrative,
  clipToNarrativeCap,
  countVisibleNarrativeChars,
  LEGACY_NARRATIVE_MAX_CHARS,
  validateLegacyVisibleNarrative,
} from './legacyNarrativeContract';
import type { LegacyNarratorPacket } from './legacyNarratorPacket';

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

function localClosedText(packet: LegacyNarratorPacket, existing = ''): string {
  return clipToNarrativeCap(buildLegacySafeNarrative(packet, existing), LEGACY_NARRATIVE_MAX_CHARS);
}

/**
 * Outer retry for the s01_01 narrative-only pilot.
 * Each model attempt uses a fresh stream. Service-internal retries must stay disabled.
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
    const stream = createLegacySentenceStream({
      userInput: input.playerLine,
      storyPrompt: input.storyPrompt,
      packet: input.packet,
      mustNotAppear: input.packet.mustNotAppear,
      onSafeText: delta => {
        if (input.useStreaming) input.onStreamChunk?.(delta);
      },
    });
    try {
      const raw = await input.generate({
        generationId: `${input.generationId}_a${attempt}`,
        onStreamChunk: input.useStreaming ? (chunk: string) => stream.push(chunk) : undefined,
      });
      if (input.shouldAbort?.()) throw new Error('请求已被取消');
      if (!input.useStreaming || stream.isEmpty()) {
        stream.push(input.extractNarrativeText(String(raw)));
      }
      const closed = stream.closeAttempt();
      const visible = closed.displayed.trim();
      const complete = validateLegacyVisibleNarrative(visible, input.packet, {
        userInput: input.playerLine,
        storyPrompt: input.storyPrompt,
      });
      if (visible && complete.valid && countVisibleNarrativeChars(visible) <= LEGACY_NARRATIVE_MAX_CHARS) {
        return {
          text: visible,
          displayed: visible,
          usedFallback: false,
          attempts,
          retried: attempt > 0,
        };
      }
      if (visible) {
        stream.applyLocalSafety();
        const text = stream.getDisplayed().trim();
        return {
          text,
          displayed: text,
          usedFallback: true,
          attempts,
          retried: attempt > 0,
        };
      }
      if (attempt < maxRetries) continue;
      stream.applyLocalSafety();
      const text = stream.getDisplayed().trim() || localClosedText(input.packet);
      if (!stream.getDisplayed().trim()) input.onStreamChunk?.(text);
      return {
        text,
        displayed: text,
        usedFallback: true,
        attempts,
        retried: attempt > 0,
      };
    } catch (error) {
      lastError = error;
      if (input.shouldAbort?.()) throw error;
      stream.closeAttempt();
      const visible = stream.getDisplayed().trim();
      if (visible) {
        stream.applyLocalSafety();
        const text = stream.getDisplayed().trim();
        return {
          text,
          displayed: text,
          usedFallback: true,
          attempts,
          retried: attempt > 0,
        };
      }
      if (attempt < maxRetries) continue;
      stream.applyLocalSafety();
      const text = stream.getDisplayed().trim() || localClosedText(input.packet);
      if (!stream.getDisplayed().trim()) input.onStreamChunk?.(text);
      return {
        text,
        displayed: text,
        usedFallback: true,
        attempts,
        retried: attempt > 0,
      };
    }
  }

  throw (lastError instanceof Error ? lastError : new Error('Legacy 单幕试验返回空正文'));
}
