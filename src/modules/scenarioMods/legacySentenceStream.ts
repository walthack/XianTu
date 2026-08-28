import { stripModelThinking } from '@/utils/jsonExtract';
import { noteFirstSafeSentence } from '@/utils/turnTelemetry';
import {
  buildLegacySafeNarrative,
  clipToNarrativeCap,
  countVisibleNarrativeChars,
  LEGACY_NARRATIVE_MAX_CHARS,
  LEGACY_NARRATIVE_MIN_CHARS,
  narrativeHasRequiredConcepts,
  validateLegacyVisibleNarrative,
} from './legacyNarrativeContract';
import type { LegacyNarratorPacket } from './legacyNarratorPacket';

const LOOKAHEAD_SENTENCES = 1;
const REQUIRED_CLOSURE_RESERVE_CHARS = 180;
const SENTENCE_RE = /[^。！？\n]*[。！？\n]+/gu;

export interface LegacySentenceStreamInput {
  userInput: string;
  storyPrompt: string;
  packet: LegacyNarratorPacket;
  mustNotAppear?: string[];
  minChars?: number;
  maxChars?: number;
  onSafeText?: (delta: string, displayed: string) => void;
}

export function createLegacySentenceStream(input: LegacySentenceStreamInput) {
  let raw = '';
  let strippedPrev = '';
  let pending = '';
  const held: string[] = [];
  let displayed = '';
  let stopped = false;
  let usedFallback = false;
  const minChars = input.minChars ?? LEGACY_NARRATIVE_MIN_CHARS;
  const maxChars = input.maxChars ?? LEGACY_NARRATIVE_MAX_CHARS;
  const mustNotAppear = input.mustNotAppear || input.packet.mustNotAppear || [];

  function violates(text: string, partial: boolean): boolean {
    if (!text.trim()) return false;
    if (mustNotAppear.some(term => term && text.includes(term))) return true;
    const visible = validateLegacyVisibleNarrative(text, input.packet, {
      partial,
      userInput: input.userInput,
      storyPrompt: input.storyPrompt,
    });
    return !visible.valid;
  }

  function emit(sentence: string): void {
    if (!sentence) return;
    displayed += sentence;
    if (displayed.trim()) noteFirstSafeSentence();
    input.onSafeText?.(sentence, displayed);
  }

  function canEmit(sentence: string): boolean {
    if (violates(sentence, true) || violates(displayed + sentence, true)) return false;
    const trial = displayed + sentence;
    const chars = countVisibleNarrativeChars(trial);
    if (chars > maxChars) return false;
    if (
      chars > Math.max(0, maxChars - REQUIRED_CLOSURE_RESERVE_CHARS)
      && !narrativeHasRequiredConcepts(trial, input.packet)
    ) return false;
    return true;
  }

  function tryEmitHead(): boolean {
    if (stopped || !held.length) return false;
    const next = held[0];
    if (!canEmit(next)) {
      stopped = true;
      held.length = 0;
      return false;
    }
    emit(held.shift()!);
    return true;
  }

  function flushReady(): void {
    while (!stopped && held.length > LOOKAHEAD_SENTENCES) {
      if (!tryEmitHead()) return;
    }
  }

  function takeSentences(delta: string): string[] {
    pending += delta;
    const parts: string[] = [];
    SENTENCE_RE.lastIndex = 0;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = SENTENCE_RE.exec(pending)) !== null) {
      parts.push(match[0]);
      last = SENTENCE_RE.lastIndex;
    }
    pending = pending.slice(last);
    return parts;
  }

  function push(chunk: string): void {
    if (stopped || !chunk) return;
    raw += chunk;
    const stripped = stripModelThinking(raw);
    const delta = stripped.slice(strippedPrev.length);
    strippedPrev = stripped;
    if (!delta) return;
    for (const sentence of takeSentences(delta)) {
      if (stopped) break;
      held.push(sentence);
      flushReady();
    }
  }

  function flushHeld(): void {
    if (!stopped && pending.trim()) held.push(pending);
    pending = '';
    while (!stopped && held.length) {
      if (!tryEmitHead()) break;
    }
  }

  function applyLocalSafety(): void {
    const current = displayed.trim();
    const complete = validateLegacyVisibleNarrative(current, input.packet, {
      userInput: input.userInput,
      storyPrompt: input.storyPrompt,
    });
    const tooShort = countVisibleNarrativeChars(current) < minChars;
    if (current && complete.valid && !tooShort) return;
    const next = clipToNarrativeCap(
      buildLegacySafeNarrative(input.packet, current),
      maxChars,
    );
    const merged = current && next.startsWith(current) ? next : (current ? `${current}\n${next}` : next);
    displayed = clipToNarrativeCap(merged, maxChars);
    usedFallback = true;
    const delta = displayed.startsWith(current) ? displayed.slice(current.length) : displayed;
    if (delta.trim()) input.onSafeText?.(delta, displayed);
    if (displayed.trim()) noteFirstSafeSentence();
  }

  function closeAttempt(): { displayed: string; raw: string; stopped: boolean } {
    flushHeld();
    return { displayed: displayed.trim(), raw, stopped };
  }

  function finish(): { text: string; raw: string; usedFallback: boolean; stopped: boolean; displayed: string } {
    flushHeld();
    applyLocalSafety();
    const text = displayed.trim();
    return { text, raw, usedFallback, stopped, displayed: text };
  }

  return {
    push,
    closeAttempt,
    finish,
    applyLocalSafety,
    getDisplayed: () => displayed,
    isEmpty: () => !raw.trim() && !displayed.trim() && held.length === 0 && !pending.trim(),
    hasVisibleText: () => Boolean(displayed.trim()),
  };
}
