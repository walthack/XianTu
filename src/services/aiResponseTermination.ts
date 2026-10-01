import { isAiRequestTimeout } from './aiRequestDeadline';

export function isTruncatedFinishReason(reason: unknown): boolean {
  if (typeof reason !== 'string') return false;
  const normalized = reason.trim().toLowerCase();
  return normalized === 'length' || normalized === 'max_tokens';
}

export interface AiRequestDiagnostic {
  usageType?: string;
  requestId?: string;
  attempt: number;
  finishReason?: string;
  budget?: number;
  inputChars?: number;
  usage?: {
    total?: number;
    output?: number;
    reasoning?: number;
  };
  truncated?: boolean;
}

export class OutputTruncationError extends Error {
  readonly code = 'OUTPUT_TRUNCATED';
  readonly finishReason?: string;
  readonly budget?: number;
  readonly usageType?: string;
  readonly requestId?: string;
  readonly attempt: number;
  readonly recoveryAttempted: boolean;
  readonly partialContent?: string;

  constructor(input: {
    message?: string;
    finishReason?: string;
    budget?: number;
    usageType?: string;
    requestId?: string;
    attempt?: number;
    recoveryAttempted?: boolean;
    partialContent?: string;
  }) {
    super(input.message || `响应因输出长度限制被截断（maxTokens=${input.budget ?? '?'}）`);
    this.name = 'OutputTruncationError';
    this.finishReason = input.finishReason;
    this.budget = input.budget;
    this.usageType = input.usageType;
    this.requestId = input.requestId;
    this.attempt = input.attempt ?? 0;
    this.recoveryAttempted = input.recoveryAttempted === true;
    this.partialContent = input.partialContent;
  }
}

export function isOutputTruncationError(error: unknown): error is OutputTruncationError {
  if (error instanceof OutputTruncationError) return true;
  if (!error || typeof error !== 'object') return false;
  const rec = error as { code?: unknown; name?: unknown; message?: unknown };
  if (rec.code === 'OUTPUT_TRUNCATED' || rec.name === 'OutputTruncationError') return true;
  return typeof rec.message === 'string' && rec.message.includes('响应因输出长度限制被截断');
}

export function isNonRetryableAiError(error: unknown): boolean {
  if (isAiRequestTimeout(error)) return true;
  if (isOutputTruncationError(error)) return true;
  if (error && typeof error === 'object' && (error as { code?: string }).code === 'QINGYU_TURN_LONG_REQUEST_BUDGET') return true;
  const message = error instanceof Error ? error.message : String(error || '');
  return /请求已被取消|abort|aborted|canceled|cancelled/i.test(message);
}

const DIAGNOSTIC_LIMIT = 40;
const diagnosticSink: AiRequestDiagnostic[] = [];

export function recordAiRequestDiagnostic(entry: AiRequestDiagnostic): void {
  diagnosticSink.push({
    usageType: entry.usageType,
    requestId: entry.requestId,
    attempt: entry.attempt,
    finishReason: entry.finishReason,
    budget: entry.budget,
    inputChars: entry.inputChars,
    usage: entry.usage,
    truncated: entry.truncated,
  });
  if (diagnosticSink.length > DIAGNOSTIC_LIMIT) {
    diagnosticSink.splice(0, diagnosticSink.length - DIAGNOSTIC_LIMIT);
  }
  if (entry.truncated) {
    console.warn('[AI诊断] 输出截断', {
      usageType: entry.usageType,
      requestId: entry.requestId,
      attempt: entry.attempt,
      finishReason: entry.finishReason,
      budget: entry.budget,
      inputChars: entry.inputChars,
      usage: entry.usage,
    });
  }
}

export function peekAiRequestDiagnostics(): AiRequestDiagnostic[] {
  return diagnosticSink.slice();
}

export function clearAiRequestDiagnostics(): void {
  diagnosticSink.length = 0;
}

export function readUsageTotals(usage: unknown): AiRequestDiagnostic['usage'] | undefined {
  if (!usage || typeof usage !== 'object') return undefined;
  const rec = usage as Record<string, unknown>;
  const total = numberOrUndefined(rec.total_tokens ?? rec.totalTokens);
  const output = numberOrUndefined(
    rec.completion_tokens ?? rec.output_tokens ?? rec.completionTokens ?? rec.outputTokens,
  );
  const reasoning = numberOrUndefined(
    rec.completion_tokens_details && typeof rec.completion_tokens_details === 'object'
      ? (rec.completion_tokens_details as { reasoning_tokens?: unknown }).reasoning_tokens
      : rec.reasoning_tokens ?? rec.reasoningTokens,
  );
  if (total === undefined && output === undefined && reasoning === undefined) return undefined;
  return { total, output, reasoning };
}

function numberOrUndefined(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
