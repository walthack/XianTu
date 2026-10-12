import axios from 'axios';
import {
  diagnosticContext, hasEffectiveResponseContent, requestDiagnosticContext, startRequestDiagnostic,
  type RequestDiagnosticContext,
} from './requestLifecycleDiagnostics';

const responses = new WeakMap<Response, ReturnType<typeof startRequestDiagnostic>>();
export async function diagnosticFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const signal = init?.signal || undefined;
  const trace = startRequestDiagnostic(requestDiagnosticContext(signal) || diagnosticContext('unknown'), 'fetch', signal);
  try {
    const response = await fetch(input, init);
    responses.set(response, trace); trace.headers(response.status);
    if (!response.ok) trace.finish(undefined, 'http_error');
    else if (!(response.headers.get('content-type') || '').includes('text/event-stream')) trace.finish(undefined, 'failed');
    return response;
  } catch (error) { trace.finish(error); throw error; }
}
export function observeStreamContent(response: Response, data: unknown): void {
  const trace = responses.get(response), record = data as any;
  if (hasEffectiveResponseContent(data)) trace?.content();
  const reason = record?.choices?.[0]?.finish_reason || record?.delta?.stop_reason || record?.candidates?.[0]?.finishReason;
  if (trace && typeof reason === 'string' && /^[\w_]{1,40}$/.test(reason)) trace.entry.finishReason = reason;
}
export function finishStreamDiagnostic(response: Response, error?: unknown): void { responses.get(response)?.finish(error); }

/** Decorates the existing adapter; retains its transport, timeouts and validation. */
export function diagnosticAxiosConfig(config: any = {}, context?: RequestDiagnosticContext) {
  const adapter = axios.getAdapter(config.adapter || axios.defaults.adapter);
  return {
    ...config,
    adapter: (request: any) => {
      const signal: AbortSignal | undefined = request.signal;
      const trace = startRequestDiagnostic(context || requestDiagnosticContext(signal) || diagnosticContext('api_probe', undefined, false, null), 'axios', signal);
      const Native = globalThis.XMLHttpRequest;
      // Axios's XHR adapter constructs synchronously. Each instance closes over its
      // own trace, and the constructor is restored before any asynchronous work.
      // Other adapters remain untouched; an unobservable headersAt stays null.
      let pending;
      try {
        if (Native) globalThis.XMLHttpRequest = class extends Native {
          constructor() {
            super();
            this.addEventListener('readystatechange', () => {
              if (this.readyState === 2 && this.status > 0) trace.headers(this.status);
            });
          }
        };
        pending = adapter(request);
      } catch (error) { trace.finish(error); throw error; }
      finally { if (Native) globalThis.XMLHttpRequest = Native; }
      return Promise.resolve(pending).then(response => {
        trace.entry.httpStatus = response.status;
        let data = response.data;
        if (typeof data === 'string') { try { data = JSON.parse(data); } catch { /* no effective body */ } }
        const reason = data?.choices?.[0]?.finish_reason || data?.stop_reason || data?.candidates?.[0]?.finishReason;
        if (typeof reason === 'string' && /^[\w_]{1,40}$/.test(reason)) trace.entry.finishReason = reason;
        if (hasEffectiveResponseContent(data) || Array.isArray(data?.data) && data.data.some((d: any) => Array.isArray(d.embedding)) || Array.isArray(data?.output?.embeddings)) trace.content();
        trace.finish(undefined, response.status >= 400 ? 'http_error' : 'completed');
        return response;
      }, error => {
        if (error?.response?.status) trace.entry.httpStatus = error.response.status;
        trace.finish(error, error?.response?.status ? 'http_error' : undefined);
        throw error;
      });
    },
  };
}
export const diagnosticAxiosPost: typeof axios.post = (url: any, data?: any, config?: any) => axios.post(url, data, diagnosticAxiosConfig(config));
export const diagnosticAxiosGet: typeof axios.get = (url: any, config?: any) => axios.get(url, diagnosticAxiosConfig(config));
