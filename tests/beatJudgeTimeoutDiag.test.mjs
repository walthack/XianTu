// 设计稿 2026-11-04「拍子判定按意思与风险」问三：拍子判定超时先标原因（beat_judge_timeout）再中止，诊断记专用码 LCQ-NET-021，不记 cancelled；
// 传输层三个分支（OpenAI／Claude／Gemini）遇到中止／取消只进调试日志，不 console.error（否则 consolePatch 记 LCQ-SYS-000）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { search: '', hostname: 'localhost' };
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('拍子判定超时：请求诊断记 timeout／cancelSource=beat_judge_timeout，错误码 LCQ-NET-021，不出 SYS-000', async () => {
  const D = await loadTs('../src/services/requestLifecycleDiagnostics.ts');
  const { resetLogState } = await loadTs('../src/modules/diagnostics/log.ts');
  const { logStore } = await loadTs('../src/modules/diagnostics/store.ts');
  const info = console.info; console.info = () => {};
  try {
    resetLogState(); logStore?.clear?.();
    const controller = new AbortController();
    const req = D.startRequestDiagnostic(D.diagnosticContext('beat_judge', 'beat_test_1', false), 'openai', controller.signal);
    D.noteDiagnosticCancellation(controller.signal, D.BEAT_JUDGE_TIMEOUT_SOURCE, 'total');
    controller.abort();
    req.finish(Object.assign(new Error('canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' }));
    assert.equal(req.entry.status, 'timeout');
    assert.equal(req.entry.cancelSource, 'beat_judge_timeout');
    const codes = logStore.recent(50).map(e => e.code);
    assert.ok(codes.includes('LCQ-NET-021'), codes.join(','));
    assert.ok(!codes.includes('LCQ-NET-002'));
    assert.ok(!codes.includes('LCQ-SYS-000'));
    // 用户取消照旧：cancelled，不记码。
    resetLogState(); logStore?.clear?.();
    const c2 = new AbortController();
    const r2 = D.startRequestDiagnostic(D.diagnosticContext('beat_judge', 'beat_test_2', false), 'openai', c2.signal);
    D.noteDiagnosticCancellation(c2.signal, 'beat_judge_cancel');
    c2.abort(); r2.finish(new Error('canceled'));
    assert.equal(r2.entry.status, 'cancelled');
    assert.equal(logStore.recent(50).length, 0);
  } finally { console.info = info; }
});

test('拍子判定计时器先标 beat_judge_timeout 再 abort', () => {
  const src = read('src/modules/scenarioMods/naturalIntentRouter.ts');
  const at = src.indexOf('noteDiagnosticCancellation(controller.signal, BEAT_JUDGE_TIMEOUT_SOURCE');
  assert.ok(at > 0);
  assert.ok(src.indexOf('controller.abort()', at) > at);
});

test('传输层三个分支：中止／取消走 debugLog，不 console.error', async () => {
  const src = read('src/services/aiService.ts');
  for (const tag of ['OpenAI', 'Claude', 'Gemini']) {
    assert.match(src, new RegExp(`if \\(isRequestCancellation\\(error, signal\\)\\) debugLog\\('ai', '\\[AI服务-${tag}\\] 请求已中止'[^\\n]*\\n\\s*else console\\.error\\('\\[AI服务-${tag}\\] 失败:'`));
  }
  const fn = src.match(/export function isRequestCancellation[\s\S]*?\n}\n/)[0];
  assert.match(fn, /signal\?\.aborted/); assert.match(fn, /AbortError/); assert.match(fn, /ERR_CANCELED/);
});
