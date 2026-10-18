import { logEvent, setLogContextProvider } from '@/modules/diagnostics/log';
import { NET_TIMEOUT_CODES } from '@/modules/diagnostics/codes';

/** Observational only: never changes a request, deadline, retry or game state. */
export interface RequestDiagnosticContext {
  module: string;
  turnId: string | null;
  generationId: string | null;
  background: boolean;
}
export interface RequestLifecycleDiagnostic extends RequestDiagnosticContext {
  requestId: string;
  transport: string;
  startedAt: number;
  headersAt: number | null;
  firstContentAt: number | null;
  endedAt: number | null;
  httpStatus: number | null;
  status: 'running' | 'completed' | 'http_error' | 'failed' | 'cancelled' | 'timeout';
  timeoutPhase: string | null;
  timeoutStage: string | null;
  finishReason: string | null;
  cancelSource: string | null;
  cancelRequestedAt: number | null;
}
interface TurnDiagnostic {
  turnId: string; startedAt: number; foregroundReadyAt: number | null;
  backgroundEndedAt: number | null; backgroundPending: number; inFlightRequests: number; sealed: boolean;
}
const LIMIT = 500;
const requests: RequestLifecycleDiagnostic[] = [];
function info(...args: unknown[]): void { try { console.info(...args); } catch { /* diagnostics must not fail a request */ } }
const turns = new Map<string, TurnDiagnostic>();
const contexts = new WeakMap<AbortSignal, RequestDiagnosticContext>();
const cancellations = new WeakMap<AbortSignal, { source: string; phase: string | null }>();
let current: string | null = null;
let busy = false;
let sequence = 0;
const token = (s: string | null | undefined) => typeof s === 'string' && s && /^[\w.:-]{1,160}$/.test(s) && !/^(sk-|bearer)/i.test(s) ? s : null;

export function currentDiagnosticTurnId(): string | null { return current; }
// 错误码日志（src/modules/diagnostics）默认带上当前回合 id。
setLogContextProvider(() => ({ turnId: current }));
/** 请求收尾时记一条错误码日志：超时按 phase 分码，HTTP 错误 / 传输层失败各一码；取消与成功不记。只取元数据，不含 URL、请求头、正文。 */
function noteRequestOutcome(entry: RequestLifecycleDiagnostic, error: unknown): void {
  const detail = {
    transport: entry.transport, module: entry.module, background: entry.background, httpStatus: entry.httpStatus,
    timeoutPhase: entry.timeoutPhase, timeoutStage: entry.timeoutStage, cancelSource: entry.cancelSource,
    durationMs: entry.endedAt !== null ? entry.endedAt - entry.startedAt : null, finishReason: entry.finishReason,
  };
  const ctx = { turnId: entry.turnId, requestId: entry.requestId };
  // 后台任务（记忆 / 审计 / 向量）失败不阻塞主流程，降一级记 warn。
  const level = entry.background ? 'warn' as const : undefined;
  if (entry.status === 'timeout') {
    const phase = entry.timeoutPhase as keyof typeof NET_TIMEOUT_CODES;
    logEvent({ code: NET_TIMEOUT_CODES[phase] ?? NET_TIMEOUT_CODES.total, level, detail, cause: error, ctx });
  } else if (entry.status === 'http_error') logEvent({ code: 'LCQ-NET-004', detail, cause: error, ctx });
  else if (entry.status === 'failed' && error) logEvent({ code: 'LCQ-NET-005', detail, cause: error, ctx });
}
export function diagnosticContext(module: string, generationId?: string, background = !busy, turnId = current): RequestDiagnosticContext {
  return { module: token(module) || 'unknown', generationId: token(generationId), turnId: token(turnId), background };
}
export function diagnosticBusyChanged(value: boolean, turnId?: string | null): void {
  if (value && !busy) {
    current = token(turnId) || `diagnostic_turn_${Date.now()}_${++sequence}`;
    turns.set(current, { turnId: current, startedAt: Date.now(), foregroundReadyAt: null, backgroundEndedAt: null, backgroundPending: 0, inFlightRequests: 0, sealed: false });
    if (turns.size > LIMIT) turns.delete(turns.keys().next().value!);
  }
  if (!value && busy && current) {
    const turn = turns.get(current);
    if (turn) { turn.foregroundReadyAt = Date.now(); info('[AI回合诊断] foreground_ready', { turnId: current, at: turn.foregroundReadyAt }); }
  }
  busy = value;
}
function drain(turnId: string | null): void {
  const turn = turnId ? turns.get(turnId) : undefined;
  if (turn && turn.sealed && turn.foregroundReadyAt !== null && turn.backgroundPending === 0 && turn.inFlightRequests === 0 && turn.backgroundEndedAt === null) {
    turn.backgroundEndedAt = Date.now();
    info('[AI回合诊断] background_drained', { turnId, at: turn.backgroundEndedAt });
  }
}
export function sealDiagnosticTurn(turnId: string | null): void {
  const turn = turnId ? turns.get(turnId) : undefined;
  if (turn) turn.sealed = true;
  drain(turnId);
}
/** Reserve before the first await (also covers delayed/disabled background jobs). */
export function reserveDiagnosticBackground(turnId: string | null): () => void {
  const turn = turnId ? turns.get(turnId) : undefined;
  if (turn) { turn.backgroundPending++; turn.backgroundEndedAt = null; }
  let done = false;
  return () => { if (done) return; done = true; if (turn) turn.backgroundPending--; drain(turnId); };
}
export function bindRequestDiagnosticContext(signal: AbortSignal, context: RequestDiagnosticContext): void { contexts.set(signal, { ...context }); }
export function requestDiagnosticContext(signal?: AbortSignal): RequestDiagnosticContext | undefined { return signal ? contexts.get(signal) : undefined; }
export function inheritRequestDiagnostics(parent: AbortSignal | undefined, child: AbortSignal): void {
  const ctx = requestDiagnosticContext(parent); if (ctx) bindRequestDiagnosticContext(child, ctx);
}
export function noteDiagnosticCancellation(signal: AbortSignal, source: string, phase: string | null = null): void {
  if (!cancellations.has(signal)) cancellations.set(signal, { source, phase });
}
export function inheritDiagnosticCancellation(parent: AbortSignal | undefined, child: AbortSignal): void {
  const cause = parent ? cancellations.get(parent) : undefined;
  if (cause) noteDiagnosticCancellation(child, cause.source, cause.phase);
  else noteDiagnosticCancellation(child, 'caller');
}
export function startRequestDiagnostic(context: RequestDiagnosticContext, transport: string, signal?: AbortSignal) {
  const entry: RequestLifecycleDiagnostic = {
    ...diagnosticContext(context.module, context.generationId || undefined, context.background, context.turnId),
    requestId: `transport_${Date.now()}_${++sequence}`, transport,
    startedAt: Date.now(), headersAt: null, firstContentAt: null, endedAt: null, httpStatus: null,
    status: 'running', timeoutPhase: null, timeoutStage: null, finishReason: null, cancelSource: null, cancelRequestedAt: null,
  };
  requests.push(entry); if (requests.length > LIMIT) requests.splice(0, requests.length - LIMIT);
  const turn = context.turnId ? turns.get(context.turnId) : undefined;
  if (turn) { turn.inFlightRequests++; turn.backgroundEndedAt = null; }
  const release = context.background ? reserveDiagnosticBackground(context.turnId) : () => {};
  const finish = (error?: unknown, status?: RequestLifecycleDiagnostic['status']) => {
    if (entry.endedAt !== null) return;
    const e = error as { code?: string; name?: string; phase?: string } | undefined;
    const cause = signal ? cancellations.get(signal) : undefined;
    entry.timeoutPhase = cause?.phase || (e?.code === 'AI_REQUEST_TIMEOUT' ? e.phase || 'unknown' : null);
    entry.timeoutStage = entry.timeoutPhase === 'first_byte' ? entry.headersAt === null ? 'await_headers' : 'await_content' : entry.timeoutPhase === 'idle' ? 'content_idle' : entry.timeoutPhase;
    entry.cancelSource = cause?.source || (signal?.aborted ? 'caller' : null);
    entry.status = entry.timeoutPhase ? 'timeout' : status || (signal?.aborted || e?.name === 'AbortError' || e?.code === 'ERR_CANCELED' ? 'cancelled' : error ? 'failed' : 'completed');
    entry.endedAt = Date.now(); signal?.removeEventListener('abort', onAbort);
    noteRequestOutcome(entry, error);
    info('[AI请求诊断]', { ...entry });
    if (turn) turn.inFlightRequests--;
    release(); drain(context.turnId);
  };
  const onAbort = () => {
    if (entry.cancelRequestedAt !== null) return;
    entry.cancelRequestedAt = Date.now();
    const cause = signal ? cancellations.get(signal) : undefined;
    entry.cancelSource = cause?.source || 'caller';
    entry.timeoutPhase = cause?.phase || null;
    info('[AI请求诊断] cancellation_requested', { ...entry });
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  return {
    entry, finish,
    headers: (status: number) => { if (entry.headersAt === null) { entry.headersAt = Date.now(); entry.httpStatus = status; } },
    content: () => { if (entry.firstContentAt === null) entry.firstContentAt = Date.now(); },
  };
}
/** Only actual body text counts; heartbeats, reasoning and whitespace do not. */
export function hasEffectiveResponseContent(data: any): boolean {
  const text = (v: unknown) => typeof v === 'string' && !!v.trim();
  return text(data?.choices?.[0]?.delta?.content) || text(data?.choices?.[0]?.message?.content)
    || text(data?.delta?.text) && data?.delta?.type === 'text_delta'
    || (Array.isArray(data?.content) && data.content.some((p: any) => p?.type === 'text' && text(p.text)))
    || Array.isArray(data?.candidates?.[0]?.content?.parts) && data.candidates[0].content.parts.some((p: any) => !p.thought && text(p.text))
    || text(data?.message?.content)
    || data?.content_block?.type === 'text' && text(data.content_block.text);
}
export function peekRequestLifecycleDiagnostics() {
  return { version: 1, requests: requests.map(r => ({ ...r })), turns: [...turns.values()].map(t => ({ ...t })) };
}
export function clearRequestLifecycleDiagnostics(): void { requests.length = 0; }

/** 一张票（意图候选、状态提案、将来的自由行动票）被丢弃的记录：只有类别、原因码、票键，没有玩家原文与模型原文。 */
export interface TicketDiscard { kind: string; reason: string; key: string | null; turnId: string | null; at: number }
const ticketDiscards: TicketDiscard[] = [];
/** 观察用，不改变任何结算；不满足 token 规则（含中文、过长、像密钥）的内容一律记为 null / 'unknown'。 */
export function noteTicketDiscard(kind: string, reason: string, key?: unknown): void {
  const row: TicketDiscard = { kind: token(kind) || 'unknown', reason: token(reason) || 'unknown', key: token(typeof key === 'string' ? key : null), turnId: token(current), at: Date.now() };
  ticketDiscards.push(row);
  if (ticketDiscards.length > LIMIT) ticketDiscards.shift();
  info('[票丢弃]', row);
}
export function peekTicketDiscards(): TicketDiscard[] { return ticketDiscards.map(r => ({ ...r })); }
export function clearTicketDiscards(): void { ticketDiscards.length = 0; }
// Console export contains only the fields above. No headers, URL, key, prompt, body or raw error.
if (typeof window !== 'undefined') {
  Object.assign(window, { __xiantuRequestDiagnostics: { snapshot: peekRequestLifecycleDiagnostics } });
}
