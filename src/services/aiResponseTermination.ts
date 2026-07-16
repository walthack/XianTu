export function isTruncatedFinishReason(reason: unknown): boolean {
  if (typeof reason !== 'string') return false;
  const normalized = reason.trim().toLowerCase();
  return normalized === 'length' || normalized === 'max_tokens';
}
