import { stripModelThinking } from '@/utils/jsonExtract';
import { noteFirstSafeSentence } from '@/utils/turnTelemetry';
import {
  hasHardNarrativeViolation,
  safeNarrativeFallbackForContext,
  validateNarrativePerformance,
} from './narrativePerformanceGuard';

const LOOKAHEAD_SENTENCES = 1;
const SENTENCE_RE = /[^。！？\n]*[。！？\n]+/gu;

export interface LegacySentenceStreamInput {
  userInput: string;
  storyPrompt: string;
  mustNotAppear: string[];
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

  function violates(text: string): boolean {
    if (!text.trim()) return false;
    if (input.mustNotAppear.some(term => term && text.includes(term))) return true;
    return hasHardNarrativeViolation(
      validateNarrativePerformance(text, input.userInput, input.storyPrompt),
    );
  }

  function emit(sentence: string): void {
    if (!sentence) return;
    displayed += sentence;
    if (displayed.trim()) noteFirstSafeSentence();
    input.onSafeText?.(sentence, displayed);
  }

  function tryEmitHead(): boolean {
    if (stopped || !held.length) return false;
    const next = held[0];
    if (violates(next) || violates(displayed + next)) {
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

  function finish(): { text: string; raw: string; usedFallback: boolean; stopped: boolean } {
    if (!stopped && pending.trim()) held.push(pending);
    pending = '';
    while (!stopped && held.length) {
      if (!tryEmitHead()) break;
    }
    let text = displayed.trim();
    const full = validateNarrativePerformance(text, input.userInput, input.storyPrompt);
    if (!text || hasHardNarrativeViolation(full) || stopped) {
      const fallback = safeNarrativeFallbackForContext(input.userInput, input.storyPrompt);
      text = text ? `${text}\n${fallback}` : fallback;
      usedFallback = true;
      if (!displayed.trim()) {
        displayed = text;
        input.onSafeText?.(text, displayed);
        noteFirstSafeSentence();
      } else {
        input.onSafeText?.(`\n${fallback}`, `${displayed}\n${fallback}`);
      }
    }
    return { text, raw, usedFallback, stopped };
  }

  return {
    push,
    finish,
    getDisplayed: () => displayed,
    isEmpty: () => !raw.trim() && !displayed.trim() && held.length === 0 && !pending.trim(),
  };
}
