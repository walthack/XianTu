import { logEvent } from './log';

/**
 * 数字检查只记不拦（Q26 版一，用户 2026-11-24 批）：正文里字面命中「数词＋军事／伤亡用词」的句子记一条 LCQ-NAR-011，
 * 带哪一拍（eventId、actionId）与命中的原句；正文、指令、选项都不动。hits 为空不记。永不抛错。
 */
export function recordNumberGateHits(
  hits: ReadonlyArray<{ rule: string; sentence: string }> | undefined,
  at: { site: 'turn' | 'opening'; generationId?: string; step?: { eventId?: string; action?: { id?: string } } | null },
): void {
  try {
    if (!hits?.length) return;
    logEvent({
      code: 'LCQ-NAR-011', msg: `正文数字检查命中 ${hits.length} 句（${at.site}），只记录`,
      detail: {
        site: at.site, eventId: at.step?.eventId ?? null, actionId: at.step?.action?.id ?? null,
        ...(at.generationId ? { generationId: at.generationId } : {}),
        count: hits.length, rules: [...new Set(hits.map(hit => hit.rule))],
      },
      verbatim: { sentences: hits.map(hit => `[${hit.rule}] ${hit.sentence.trim()}`).join('\n') },
    });
  } catch {
    return; // lcq-allow: 观察用的日志不得影响正文发布
  }
}
