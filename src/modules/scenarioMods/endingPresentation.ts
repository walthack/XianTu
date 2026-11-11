import images from '../../../mod-kit/ending-images.qingyu.json';
import { CONTENT_PACKS } from '../contentPacks';
import type { PackEnding } from '../contentPacks/presentationFormats';

export interface EndingPresentation { image: string | null }
type EndingRef = { endingId: string; sourceEventId: string };
/** 旧E01与E03共用id，必须由来源事件判别；不得把E03迁移成E01。 */
export function canonicalEndingId(ending: EndingRef | undefined): string {
  if (!ending) return '';
  return ending.endingId === 'lcq.ending.death.paolao' && ending.sourceEventId === 'lcq.event.ningyu_enters_gamble'
    ? 'lcq.ending.death.baihu_beheading' : ending.endingId;
}
/** 结局编号（F0b：TS 侧表，与内容包 endings 的 key 合并，TS 在前、包按 catalog 顺序在后；编译期禁止同一结局或同一编号两边都有）。
 *  B7：E01–E04 已搬进塞外包 endings.json、E05–E08 已搬进昭南包 endings.json，TS 侧留空。 */
export const TS_ENDING_KEYS: Readonly<Record<string, string>> = {};
export function mergeEndingKeys(ts: Readonly<Record<string, string>>, endings: readonly PackEnding[]): Readonly<Record<string, string>> {
  const pack = endings.filter(e => e.key !== undefined);
  if (!pack.length) return ts;
  const out: Record<string, string> = { ...ts };
  for (const e of pack) { if (e.endingId in out) throw Error(`结局编号 ${e.endingId} 同时在 TS 表与内容包里`); out[e.endingId] = e.key!; }
  return out;
}
const ENDING_KEYS = mergeEndingKeys(TS_ENDING_KEYS, CONTENT_PACKS.endings || []);
export function endingKey(ending: EndingRef | undefined): string {
  return (ENDING_KEYS as Record<string, string>)[canonicalEndingId(ending)] || '';
}
export function endingPresentation(ending: EndingRef | undefined): EndingPresentation {
  return { image: (images.byEndingId as Record<string, string | null>)[canonicalEndingId(ending)] || null };
}
/** 仅迁移旧E01终局身份与旧图，不重写已发生的历史正文。 */
export function migrateLegacyE01Ending(ending: (EndingRef & { title?: string; presentation?: EndingPresentation }) | undefined): boolean {
  if (!ending || canonicalEndingId(ending) === ending.endingId) return false;
  ending.endingId = canonicalEndingId(ending);
  ending.title = '第六个';
  ending.presentation = endingPresentation(ending);
  return true;
}
