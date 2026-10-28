import { debugLog } from '../modules/diagnostics/debugLog';
import { logEvent } from '../modules/diagnostics/log';
import { perfConfig } from '../modules/diagnostics/perfConfig';
import { registerStatsProvider } from '../modules/diagnostics/statsProviders';

export type TurnTelemetryPath = 'legacy' | 'legacy_pilot' | 'modular' | 'open_world' | 'local_contract';

export interface TurnTelemetry {
  path: TurnTelemetryPath;
  /** 回合开始时刻（beginTurnTelemetry）；回合总耗时 = 结束 − 它。 */
  beganAt: number;
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

// ───────────── 耗时聚合（p50/p95）与超阈值告警 ─────────────
// 全部在 endTurnTelemetry 内部完成：调用方（AIBidirectionalSystem）的调用点不变。数值见 game-numbers.perf。

export interface PerfSample { path: TurnTelemetryPath; turnMs: number; modelMs: number | null; at: number }
export interface PerfSeries { count: number; p50: number | null; p95: number | null; max: number | null }
export interface PerfStats {
  /** 当前窗口里的样本数 / 窗口上限。 */
  window: { samples: number; max: number };
  turn: PerfSeries;
  /** 只统计走了模型、且收到完整响应的回合。 */
  model: PerfSeries;
  thresholds: { turnWarnMs: number; modelWarnMs: number };
  /** 本会话累计触发的告警次数（不受窗口限制）。 */
  warned: { turn: number; model: number };
  byPath: Record<string, number>;
}

const perfSamples: PerfSample[] = [];
let turnWarnCount = 0;
let modelWarnCount = 0;

/** 最近邻（nearest-rank）分位数；空数组返回 null。 */
export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

function series(values: number[], minSamples: number): PerfSeries {
  const enough = values.length >= minSamples;
  return { count: values.length, p50: enough ? percentile(values, 50) : null, p95: enough ? percentile(values, 95) : null, max: values.length ? Math.max(...values) : null };
}

function recordPerf(t: TurnTelemetry): void {
  try {
    const cfg = perfConfig();
    const ended = now();
    const turnMs = Math.max(0, ended - t.beganAt);
    const modelMs = t.requestStartedAt != null && t.responseCompletedAt != null ? Math.max(0, t.responseCompletedAt - t.requestStartedAt) : null;
    perfSamples.push({ path: t.path, turnMs, modelMs, at: ended });
    while (perfSamples.length > cfg.sampleWindow) perfSamples.shift();
    const detail = { path: t.path, turnMs, modelMs, retryCount: t.retryCount, provider: t.provider, model: t.model, promptBytes: t.promptBytes };
    if (turnMs > cfg.turnWarnMs) { turnWarnCount += 1; logEvent({ code: 'LCQ-NET-010', detail: { ...detail, thresholdMs: cfg.turnWarnMs } }); }
    if (modelMs != null && modelMs > cfg.modelWarnMs) { modelWarnCount += 1; logEvent({ code: 'LCQ-NET-011', detail: { ...detail, thresholdMs: cfg.modelWarnMs } }); }
  } catch {
    // lcq-allow: 观察用的聚合不得影响回合收尾（配置异常、日志故障都吞掉）
  }
}

/** 当前耗时统计快照（诊断导出与反馈包取用）。永不抛错。 */
export function getPerfStats(): PerfStats {
  const cfg = perfConfig();
  const byPath: Record<string, number> = {};
  for (const s of perfSamples) byPath[s.path] = (byPath[s.path] ?? 0) + 1;
  return {
    window: { samples: perfSamples.length, max: cfg.sampleWindow },
    turn: series(perfSamples.map(s => s.turnMs), cfg.minSamplesForPercentile),
    model: series(perfSamples.flatMap(s => (s.modelMs == null ? [] : [s.modelMs])), cfg.minSamplesForPercentile),
    thresholds: { turnWarnMs: cfg.turnWarnMs, modelWarnMs: cfg.modelWarnMs },
    warned: { turn: turnWarnCount, model: modelWarnCount },
    byPath,
  };
}

registerStatsProvider('perf', getPerfStats);

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
    beganAt: now(),
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
  recordPerf(last);
  // 回合埋点归 perf 调试大类（debugCategories.ts 117-118 已把 utils/turnTelemetry.ts 归 perf）；耗时统计仍由 recordPerf 进诊断导出（fix5939-5）
  debugLog('perf', '[回合埋点]', () => last);
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
  perfSamples.length = 0;
  turnWarnCount = 0;
  modelWarnCount = 0;
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
