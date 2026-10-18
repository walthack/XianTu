/**
 * 主游戏入口的热改：页面加载时读与 index.html 同级的 tuning.json（形状同 combat-trial 的 ?tuning=1，见 applyTuning）：
 * { "numbers": {…game-numbers.qingyu.json 的局部，含 freeAction / judgement 段}, "statuses": {…}, "<合同 id>": {…} }。
 * 刷新页面生效；任何一步失败（没有文件 / 404 / 网络错 / 超时 / 不是合法 JSON / 校验不过）都静默用打包内默认值，只在控制台 debug 留一行，不弹窗；
 * 同时记一条错误码日志（LCQ-CFG-001…006：404 info，网络 / 超时 / 其它 HTTP 状态 warn，JSON / 校验 error），见 docs/ERROR-CODES.md。
 * 校验不过是整份拒绝，已合并的数值会退回（applyTuning 负责）。
 */
import { GAME_NUMBERS } from './numbers';
import { applyTuning } from './contracts/registry';
import { diagnosticsConfig } from '../diagnostics/config';
import { logError, logEvent } from '../diagnostics/log';

export type RuntimeTuningResult = { applied: boolean; reason?: string };

export async function loadRuntimeTuning(fetcher: typeof fetch = fetch): Promise<RuntimeTuningResult> {
  const skip = (reason: string): RuntimeTuningResult => { console.debug(`【数值热改】未应用 tuning.json，使用打包内默认值：${reason}`); return { applied: false, reason }; };
  try {
    const { file, timeoutMs } = GAME_NUMBERS.tuning;
    const response = await fetcher(file, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    if (!response?.ok) {
      if (!response) logEvent({ code: 'LCQ-CFG-002', detail: { reason: '没有响应' } });
      else if (response.status === 404) logEvent({ code: 'LCQ-CFG-001', level: diagnosticsConfig().tuning404Level, detail: { status: response.status } });
      else logEvent({ code: 'LCQ-CFG-006', detail: { status: response.status } });
      return skip(`HTTP ${response?.status}`);
    }
    let parsed: unknown;
    try { parsed = JSON.parse(await response.text()); } catch (error) { logError('LCQ-CFG-004', error); return skip('不是合法 JSON'); }
    const result = applyTuning(parsed);
    if (!result.ok) { logEvent({ code: 'LCQ-CFG-005', detail: { errors: result.errors } }); return skip(`校验不过：${result.errors.join('；')}`); }
    console.info('【数值热改】已应用 tuning.json');
    return { applied: true };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    logError(timedOut ? 'LCQ-CFG-003' : 'LCQ-CFG-002', error);
    return skip(error instanceof Error ? error.message : String(error));
  }
}
