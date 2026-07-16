export const INITIAL_GENERATION_POLICY = Object.freeze({
  maxCalls: 4,
  maxRetries: 2,
  attemptsPerStep: 2,
  step1MaxTokens: 3072,
  step2MaxTokens: 8192,
  step1MinChars: 200,
  step1SoftMaxChars: 1600,
  step1HardMaxChars: 2400,
});

export type InitialNarrativeLengthClass = 'hard_short' | 'normal' | 'soft_long' | 'hard_long';

export function classifyInitialNarrativeLength(length: number): InitialNarrativeLengthClass {
  if (length < INITIAL_GENERATION_POLICY.step1MinChars) return 'hard_short';
  if (length <= INITIAL_GENERATION_POLICY.step1SoftMaxChars) return 'normal';
  if (length <= INITIAL_GENERATION_POLICY.step1HardMaxChars) return 'soft_long';
  return 'hard_long';
}

export function shouldRetryInitialNarrative(length: number): boolean {
  const result = classifyInitialNarrativeLength(length);
  return result === 'hard_short' || result === 'hard_long';
}

export function initialGenerationRequestLimits(maxTokens: number) {
  return {
    maxTokens,
    requestMaxRetries: 0,
  } as const;
}
