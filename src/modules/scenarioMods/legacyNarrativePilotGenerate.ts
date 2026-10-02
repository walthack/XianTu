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

export const LEGACY_PILOT_GENERATE_TIMEOUT_MS = 45_000;

export interface LegacyPilotGenerateInput {
  playerLine: string;
  storyPrompt: string;
  packet: LegacyNarratorPacket;
  maxRetries: number;
  useStreaming: boolean;
  generationId: string;
  generate: (call: LegacyPilotGenerateCall) => Promise<string>;
  onStreamChunk?: (delta: string) => void;
  shouldAbort?: () => boolean;
  /** Cap the RenderPlan call; the visible body is always composed locally. */
  generateTimeoutMs?: number;
}

export interface LegacyPilotGenerateResult {
  text: string;
  displayed: string;
  usedFallback: boolean;
  attempts: number;
  retried: boolean;
}

function isPilotGenerateTimeout(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Legacy 单幕试验生成超时');
}

async function callPilotGenerate(
  input: LegacyPilotGenerateInput,
  attemptId: string,
): Promise<string> {
  const configured = Number(input.generateTimeoutMs);
  const timeoutMs = Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : LEGACY_PILOT_GENERATE_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      input.generate({ generationId: attemptId }),
      new Promise<string>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Legacy 单幕试验生成超时')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
// @deprecated LEGACY：模块化稳定后删除（2026-10-02 用户决定）
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
      const raw = await callPilotGenerate(input, `${input.generationId}_a${attempt}`);
      if (input.shouldAbort?.()) throw new Error('请求已被取消');
      const parsed = parseLegacyRenderPlan(String(raw));
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
      if (!isPilotGenerateTimeout(error) && attempt < maxRetries) continue;
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
