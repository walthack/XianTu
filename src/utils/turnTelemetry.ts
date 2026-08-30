export type TurnTelemetryPath = 'legacy' | 'legacy_pilot' | 'fast' | 'open_world' | 'local_contract';

export interface TurnTelemetry {
  path: TurnTelemetryPath;
  promptBytes: number;
  requestStartedAt: number | null;
  responseHeadersAt: number | null;
  firstReasoningAt: number | null;
  firstContentAt: number | null;
  firstSafeSentenceAt: number | null;
  responseCompletedAt: number | null;
  retryCount: number;
  embeddingCountBeforeGenerate: number;
  embeddingCountTotal: number;
  recallWaitMs: number;
  auxWaitMsBeforeUnlock: number;
  backgroundStartedAfterCommit: boolean;
  provider: string | null;
  model: string | null;
  maxTokens: number | null;
  jsonObject: boolean;
  bufferedFullResponse: boolean;
}

const REASONING_RE = /<(?:think|reasoning)|"reasoning"|reasoning_content/i;

let embeddingCount = 0;
let active: TurnTelemetry | null = null;
let last: TurnTelemetry | null = null;

function now(): number {
  return Date.now();
}

export function markEmbeddingCall(): void {
  embeddingCount += 1;
}

export function snapshotEmbeddingCount(): number {
  return embeddingCount;
}

export function noteTurnPath(path: TurnTelemetryPath): void {
  if (active) active.path = path;
}

export function beginTurnTelemetry(path: TurnTelemetryPath): TurnTelemetry {
  active = {
    path,
    promptBytes: 0,
    requestStartedAt: null,
    responseHeadersAt: null,
    firstReasoningAt: null,
    firstContentAt: null,
    firstSafeSentenceAt: null,
    responseCompletedAt: null,
    retryCount: 0,
    embeddingCountBeforeGenerate: embeddingCount,
    embeddingCountTotal: embeddingCount,
    recallWaitMs: 0,
    auxWaitMsBeforeUnlock: 0,
    backgroundStartedAfterCommit: false,
    provider: null,
    model: null,
    maxTokens: null,
    jsonObject: false,
    bufferedFullResponse: false,
  };
  return active;
}

export function notePromptBytes(bytes: number): void {
  if (active) active.promptBytes = Math.max(0, Math.floor(bytes));
}

export function noteRecallWait(ms: number): void {
  if (active) active.recallWaitMs = Math.max(0, ms);
}

export function noteAuxWaitBeforeUnlock(ms: number): void {
  if (active) active.auxWaitMsBeforeUnlock = Math.max(0, ms);
}

export function noteBufferedFullResponse(buffered: boolean): void {
  if (active) active.bufferedFullResponse = buffered;
}

export function noteFirstSafeSentence(): void {
  if (active && active.firstSafeSentenceAt == null) active.firstSafeSentenceAt = now();
}

export function noteGenerateStart(input?: {
  provider?: string | null;
  model?: string | null;
  maxTokens?: number | null;
  jsonObject?: boolean;
  bufferedFullResponse?: boolean;
}): void {
  if (!active) return;
  if (active.requestStartedAt == null) active.requestStartedAt = now();
  else active.retryCount += 1;
  active.embeddingCountBeforeGenerate = embeddingCount;
  if (input?.provider != null) active.provider = input.provider;
  if (input?.model != null) active.model = input.model;
  if (typeof input?.maxTokens === 'number') active.maxTokens = input.maxTokens;
  if (typeof input?.jsonObject === 'boolean') active.jsonObject = input.jsonObject;
  if (typeof input?.bufferedFullResponse === 'boolean') active.bufferedFullResponse = input.bufferedFullResponse;
}

export function noteResponseHeaders(): void {
  if (active && active.responseHeadersAt == null) active.responseHeadersAt = now();
}

export function noteStreamChunk(chunk: string): void {
  if (!active || !chunk) return;
  if (active.responseHeadersAt == null) active.responseHeadersAt = now();
  if (REASONING_RE.test(chunk)) {
    if (active.firstReasoningAt == null) active.firstReasoningAt = now();
    return;
  }
  if (active.firstContentAt == null) active.firstContentAt = now();
}

export function noteGenerateComplete(): void {
  if (!active) return;
  active.responseCompletedAt = now();
  active.embeddingCountTotal = embeddingCount;
  if (active.bufferedFullResponse && active.firstContentAt == null && active.responseCompletedAt != null) {
    active.firstContentAt = active.responseCompletedAt;
  }
}

export function noteBackgroundStartedAfterCommit(): void {
  if (active) active.backgroundStartedAfterCommit = true;
}

export function endTurnTelemetry(): TurnTelemetry | null {
  if (!active) return last;
  last = active;
  active = null;
  const line = `[回合埋点] ${JSON.stringify(last)}`;
  // 单幕试验必须总能在控制台拆时间；完整 Legacy 仍走 info，受调试开关约束。
  if (last.path === 'legacy_pilot') console.error(line);
  else console.info(line);
  return last;
}

export function getActiveTurnTelemetry(): TurnTelemetry | null {
  return active;
}

export function getLastTurnTelemetry(): TurnTelemetry | null {
  return last;
}

export function resetTurnTelemetryForTests(): void {
  embeddingCount = 0;
  active = null;
  last = null;
}

export function wrapTelemetryStreamChunk(
  inner?: (chunk: string) => void,
): (chunk: string) => void {
  return (chunk: string) => {
    noteStreamChunk(chunk);
    inner?.(chunk);
  };
}
