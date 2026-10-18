import { NET_TIMEOUT_CODES } from '@/modules/diagnostics/codes';
import { inheritRequestDiagnostics, inheritDiagnosticCancellation, noteDiagnosticCancellation } from './requestLifecycleDiagnostics';
export class AiRequestTimeoutError extends Error {
  readonly code = 'AI_REQUEST_TIMEOUT';
  /** 错误码（按 phase 分：首字节 / 总耗时 / 空闲），由 requestLifecycleDiagnostics 在请求收尾时记入诊断日志。 */
  readonly lcqCode: string;
  constructor(readonly phase: 'first_byte' | 'total' | 'idle', readonly timeoutMs: number) {
    super(phase === 'first_byte'
      ? `AI请求等待首个响应超时（${timeoutMs / 1000}秒），请手动重试。`
      : phase === 'idle' ? `AI正文流空闲超时（${timeoutMs / 1000}秒），请手动重试。`
      : `AI请求总耗时超时（${timeoutMs / 1000}秒），请手动重试。`);
    this.name = 'AiRequestTimeoutError';
    this.lcqCode = NET_TIMEOUT_CODES[phase];
  }
}

export function isAiRequestTimeout(error: unknown): boolean {
  return error instanceof AiRequestTimeoutError
    || (!!error && typeof error === 'object' && (error as { code?: string }).code === 'AI_REQUEST_TIMEOUT');
}

/** Covers the entire fetch/read lifecycle, including a stream that stops sending. */
export async function withAiRequestDeadline<T>(
  operation: (signal: AbortSignal, markFirstByte: () => void) => Promise<T>,
  options: { signal?: AbortSignal; firstByteMs?: number; totalMs?: number | null; idleMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  inheritRequestDiagnostics(options.signal, controller.signal);
  const totalMs = options.totalMs === null ? null : options.totalMs ?? 120000;
  const firstByteMs = options.firstByteMs ?? 30000;
  let rejectDeadline!: (error: Error) => void;
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const fail = (error: Error) => {
    rejectDeadline(error);
    if (error instanceof AiRequestTimeoutError) noteDiagnosticCancellation(controller.signal, 'deadline', error.phase);
    else inheritDiagnosticCancellation(options.signal, controller.signal);
    controller.abort(error);
  };
  const onAbort = () => fail(new DOMException('请求已取消', 'AbortError'));
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const totalTimer = totalMs === null ? undefined : setTimeout(() => fail(new AiRequestTimeoutError('total', totalMs)), totalMs);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const markContent = () => {
    clearTimeout(firstByteTimer);
    if (options.idleMs) {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => fail(new AiRequestTimeoutError('idle', options.idleMs!)), options.idleMs);
    }
  };
  const firstByteTimer = setTimeout(() => fail(new AiRequestTimeoutError('first_byte', firstByteMs)), firstByteMs);
  try {
    if (options.signal?.aborted) onAbort();
    return await Promise.race([
      options.signal?.aborted ? deadline : operation(controller.signal, markContent),
      deadline,
    ]);
  } finally {
    clearTimeout(totalTimer);
    clearTimeout(idleTimer);
    clearTimeout(firstByteTimer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}
