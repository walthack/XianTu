/**
 * 说话人记号（Q29 修订版做法甲，2026-11-18 用户批准）。
 * 模型在每句对白的开引号前紧挨着写 `〈说话人〉`，例：`凝羽收起银针。〈凝羽〉“毒清了。”`。
 * 记号随正文走完落账各道清洗、存进本机全文副本；只在显示时拿掉。
 * 概要、记忆、行动选项、发回模型的上下文里一律不得出现记号。
 *
 * 保守规则：记号内容 1–12 个字，只含文字/数字（允许间隔号 ·），不含空白、换行和其他标点。
 * 不合这个形状的 `〈…〉`（如含标点的长句）不当记号，原样保留。
 * 认的开引号与 FormattedText.vue 一致：“ 「 "。
 */

const NAME_CHAR = String.raw`(?:[^\s\p{P}\p{S}]|·)`;
const OPEN_QUOTE = '[“「"]';
/** 完整记号 `〈名字〉`。 */
const COMPLETE_MARK = new RegExp(String.raw`〈(${NAME_CHAR}{1,12})〉`, 'gu');
/** 缺右括号的半个记号：`〈名字` 紧跟开引号、换行或文本末尾（其余写法不当记号，免得误伤正文里的〈…〉）。 */
const BROKEN_MARK = new RegExp(String.raw`〈${NAME_CHAR}{1,12}(?=${OPEN_QUOTE}|\n|$)`, 'gu');
/** 空记号 `〈〉`、紧贴开引号或停在文末的孤立 `〈`。 */
const EMPTY_MARK = new RegExp(String.raw`〈〉|〈(?=${OPEN_QUOTE}|$)`, 'gu');
/** 合规记号：完整记号且紧跟开引号。 */
const VALID_MARK = new RegExp(String.raw`〈(${NAME_CHAR}{1,12})〉(?=${OPEN_QUOTE})`, 'gu');
/** 流式预览：文本末尾停在半个记号上（`〈` 或 `〈凝`，还没写到右括号）。 */
const PARTIAL_TAIL = new RegExp(String.raw`〈${NAME_CHAR}{0,12}$`, 'u');

/** 删掉所有说话人记号（含写坏的）；给概要、记忆、选项、发回模型的上下文、导出和判断用。 */
export function stripSpeakerMarks(text: string): string {
  if (!text || !text.includes('〈')) return text;
  return text.replace(COMPLETE_MARK, '').replace(BROKEN_MARK, '').replace(EMPTY_MARK, '');
}

/** 存全文前用：只保留「完整记号＋紧跟开引号」，其余记号一律删掉。 */
export function normalizeSpeakerMarks(text: string): string {
  if (!text || !text.includes('〈')) return text;
  return text
    .replace(COMPLETE_MARK, (mark, _name, offset: number, whole: string) => (/^[“「"]/.test(whole.slice(offset + mark.length)) ? mark : ''))
    .replace(BROKEN_MARK, '')
    .replace(EMPTY_MARK, '');
}

export interface SpeakerMarkParse {
  /** 去掉记号后的正文（玩家看到的样子）。 */
  text: string;
  /** 每个合规记号：它所标对白的开引号在 text 里的下标，与说话人名字。 */
  speakers: Array<{ index: number; speaker: string }>;
}

/** 显示端用：拿掉记号，并告诉调用方「哪个开引号是谁说的」。 */
export function parseSpeakerMarks(text: string): SpeakerMarkParse {
  const normalized = normalizeSpeakerMarks(text || '');
  const speakers: SpeakerMarkParse['speakers'] = [];
  let removed = 0;
  const clean = normalized.replace(VALID_MARK, (mark, name: string, offset: number) => {
    speakers.push({ index: offset - removed, speaker: name });
    removed += mark.length;
    return '';
  });
  return { text: clean, speakers };
}

/** 流式预览用：先去掉末尾还没写完的半个记号，再删掉其余记号。 */
export function stripSpeakerMarksForStreaming(text: string): string {
  if (!text || !text.includes('〈')) return text;
  return stripSpeakerMarks(text.replace(PARTIAL_TAIL, ''));
}
