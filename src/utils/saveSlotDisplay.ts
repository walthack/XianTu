/**
 * 存档卡片的显示文本。自动槽（「上次对话」「时间点存档」）在写入前只是占位（保存时间、存档数据都是 null），
 * 原先卡片照样拿「凡人／未知」兜底，看起来像一份境界凡人、地点未知的存档（真机 REPORT-8091-cd167d7a：时间点存档显示 未知/凡人/未知）。
 * 时间点存档默认关闭（gameStateStore.timeBasedSaveEnabled=false），开启后按间隔由 saveToSlot 写入真实元数据；这里只改显示，不改写入规则。
 */
import type { SaveSlot } from '@/types/game';

export const TIME_BASED_SLOT_NAME = '时间点存档';
export const LAST_CONVERSATION_SLOT_NAME = '上次对话';
export const EMPTY_SLOT_LABEL = '尚未写入';

/** 槽位里还没有任何存档内容（自动槽的占位）。 */
export function isEmptySaveSlot(slot: Partial<SaveSlot> | null | undefined): boolean {
  if (!slot) return true;
  return !slot.存档数据 && !slot.保存时间 && !slot.最后保存时间 && !slot.境界 && !slot.位置;
}

/** 卡片上的「境界」「位置」两栏；空槽不再冒充凡人／未知。 */
export function saveSlotDetail(slot: Partial<SaveSlot> | null | undefined, field: '境界' | '位置'): string {
  if (isEmptySaveSlot(slot)) return EMPTY_SLOT_LABEL;
  const value = slot?.[field];
  if (typeof value === 'string' && value.trim()) return value;
  return field === '境界' ? '凡人' : '未知';
}

/** 空自动槽的说明；有内容或手动槽返回空串。 */
export function emptySaveSlotHint(slot: Partial<SaveSlot> | null | undefined, timeBasedSaveEnabled: boolean): string {
  if (!isEmptySaveSlot(slot)) return '';
  if (slot?.存档名 === TIME_BASED_SLOT_NAME) {
    return timeBasedSaveEnabled
      ? '时间点存档已开启，到达设定间隔后的下一次对话结束时自动写入。'
      : '时间点存档默认关闭，尚未写入；可在下方「时间点存档」开关开启。';
  }
  if (slot?.存档名 === LAST_CONVERSATION_SLOT_NAME) return '下一次发送对话前会自动写入。';
  return '此槽位尚无存档内容。';
}
