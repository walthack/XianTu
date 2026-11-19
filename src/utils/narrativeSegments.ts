/**
 * 新界面字框（?ui=new）用：把一手正文切成一段一段，一次出一段。纯函数。
 * - 先按空行／换行分段；
 * - 一段超过 maxLen 字时按句末标点（。！？及紧跟的后引号）再拆，引号「」“”『』里面不拆；
 * - 说话人记号 〈名字〉 原样留在段里（显示端再拿掉），记号总在开引号前，不会被拆开。
 */
import { parseSpeakerMarks } from './speakerMarks';

export const SEGMENT_MAX_LEN = 130;

const OPENERS = new Set(['「', '“', '『', '《']);
const CLOSERS = new Set(['」', '”', '』', '》']);
const SENTENCE_END = new Set(['。', '！', '？', '!', '?', '…']);

/** 把一段切成句子；只在引号外的句末标点（连同紧跟的后引号）后切。 */
function splitSentences(para: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < para.length; i++) {
    const ch = para[i];
    if (OPENERS.has(ch)) depth++;
    else if (CLOSERS.has(ch)) depth = Math.max(0, depth - 1);
    if (!SENTENCE_END.has(ch)) continue;
    // 连续的句末标点和后引号一起吃掉
    let j = i + 1;
    let d = depth;
    while (j < para.length && (SENTENCE_END.has(para[j]) || CLOSERS.has(para[j]))) {
      if (CLOSERS.has(para[j])) d = Math.max(0, d - 1);
      j++;
    }
    if (d === 0) {
      out.push(para.slice(start, j));
      start = j;
    }
    depth = d;
    i = j - 1;
  }
  if (start < para.length) out.push(para.slice(start));
  return out.filter(s => s.trim());
}

/** 可见字数（去掉说话人记号后）。 */
const visibleLength = (s: string) => parseSpeakerMarks(s).text.length;

export function splitNarrativeSegments(text: string, maxLen = SEGMENT_MAX_LEN): string[] {
  const paras = String(text || '').split(/\n+/).map(p => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const para of paras) {
    if (visibleLength(para) <= maxLen) { out.push(para); continue; }
    let buf = '';
    for (const sentence of splitSentences(para)) {
      if (buf && visibleLength(buf + sentence) > maxLen) { out.push(buf); buf = ''; }
      buf += sentence;
    }
    if (buf) out.push(buf);
  }
  return out;
}

/** 这一段的说话人：段里第一个合规记号的名字；没有就是旁白（null）。 */
export function segmentSpeaker(segment: string): string | null {
  return parseSpeakerMarks(segment).speakers[0]?.speaker ?? null;
}
