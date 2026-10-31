/**
 * 「上次对话」回合备份的来源校验（fix5939-1）。
 * 「上次对话」是角色级固定槽位，每回合发送前覆盖写入；它必须盖上来源存档槽位，
 * 否则读旧档 / 重开试玩后「回到上一轮」会跨档回滚到上一局。
 * 没有来源章的旧备份一律视为不属于当前档：宁可不给回滚，也不跨档。
 */

import type { SaveSlot } from '@/types/game';

export const LAST_CONVERSATION_SLOT = '上次对话';

type LastConversationLike = { 保存时间?: unknown; 回滚来源槽位?: string } | null | undefined;

/** 读档后「上次对话」能否保留：只有读入槽位就是激活槽位（没有被挂到工作槽/复测槽），且备份盖的来源章 === 激活槽位 才保留 */
export function shouldKeepLastConversationOnLoad(lastSlot: LastConversationLike, loadedSlotKey: string, activeSlotKey: string): boolean {
  return !!lastSlot && lastSlot.保存时间 != null && loadedSlotKey === activeSlotKey && lastSlot.回滚来源槽位 === activeSlotKey;
}

/** 已被清空的「上次对话」（读别的档／新开一局后）：两个保存时间都为空。磁盘备份保留，但不再读回内存充当一份有内容的槽。 */
export function isClearedLastConversationSlot(slotKey: string, slot: { 保存时间?: unknown; 最后保存时间?: unknown } | null | undefined): boolean {
  return slotKey === LAST_CONVERSATION_SLOT && !!slot && slot.保存时间 == null && slot.最后保存时间 == null;
}

/** 「上次对话」是否属于当前激活槽位（按钮可见性与回滚前校验共用） */
export function lastConversationMatchesActive(lastSlot: LastConversationLike, activeSlotKey: string | undefined | null): boolean {
  return !!lastSlot && lastSlot.保存时间 != null && !!activeSlotKey && lastSlot.回滚来源槽位 === activeSlotKey;
}

/**
 * 清空后的槽位元数据（保留存档名、角色名，保存时间/存档数据置 null，删除 回滚来源槽位）。
 * 境界/位置/游戏内时间/修为进度属于被清掉的那份备份，一并去掉，否则存档面板显示一份「有地点没时间」的上次对话（真机 REPORT-8091-fbef6792）。
 */
export function clearedLastConversationSlot(slot: Partial<SaveSlot> | null | undefined): SaveSlot {
  const { 回滚来源槽位: _origin, 境界: _realm, 位置: _place, 游戏内时间: _gameTime, 修为进度: _progress, ...rest } = slot || {};
  return {
    ...rest,
    存档名: rest.存档名 || LAST_CONVERSATION_SLOT,
    保存时间: null,
    最后保存时间: null,
    存档数据: null,
  };
}
