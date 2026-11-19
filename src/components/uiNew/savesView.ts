/**
 * 新界面「存档页」用的纯函数（只管怎么摆，不管存档逻辑）。
 * 每个存档能做的事照老存档面板 SavePanel.vue 存档卡片 card-actions 的显示／禁用条件写，改老面板时这里要一起改。
 */

export const AUTO_SLOT_NAMES = ['上次对话', '时间点存档'] as const;

/** 行上的名字：同老卡片 `save.存档名 || save.id || 存档N`。 */
export function saveRowName(save: { 存档名?: string; id?: string } | null | undefined, index: number): string {
  return save?.存档名 || save?.id || `存档${index + 1}`;
}

export type SaveActionKey = 'load' | 'rollback' | 'export' | 'overwrite' | 'delete';
export interface SaveAction { key: SaveActionKey; label: string; disabled: boolean; title: string }

export interface SaveActionState {
  /** 这一份就是当前激活存档（save.id === currentSave.id） */
  isCurrent: boolean;
  /** 老面板 loading */
  loading: boolean;
  /** 有当前激活存档（!!currentSave） */
  hasCurrent: boolean;
  isOnlineMode: boolean;
  /** lastConversationMatchesActive(save, activeSlotKey) */
  rollbackMatches: boolean;
  /** 老面板 isUndeletableSave(save) */
  undeletable: boolean;
  /** 老面板 getDeleteTooltip(save) */
  deleteTooltip: string;
  /** isEmptySaveSlot(save)：只影响覆盖按钮的字（空位写「存到这里」），条件不变 */
  empty: boolean;
}

/**
 * 选中存档在老卡片上有哪几个按钮，顺序同老卡片：
 * 读取（不是当前、不是自动槽）→ 回滚（上次对话、单机、属于当前槽）→ 导出（总有）→ 覆盖（不是自动槽）→ 删除（总有，不可删时禁用）。
 */
export function saveActions(name: string, s: SaveActionState): SaveAction[] {
  const auto = (AUTO_SLOT_NAMES as readonly string[]).includes(name);
  const out: SaveAction[] = [];
  if (!s.isCurrent && !auto) out.push({ key: 'load', label: '读取', disabled: s.loading, title: '读取存档' });
  if (name === '上次对话' && !s.isOnlineMode && s.rollbackMatches) {
    out.push({ key: 'rollback', label: '回滚', disabled: s.loading || !s.hasCurrent, title: '用上次对话的数据覆盖当前存档（回滚）' });
  }
  out.push({ key: 'export', label: '导出', disabled: s.loading, title: '导出此存档' });
  if (!auto) out.push({ key: 'overwrite', label: s.empty ? '存到这里' : '覆盖', disabled: s.loading || !s.hasCurrent, title: '用当前进度覆盖此存档' });
  out.push({ key: 'delete', label: '删除', disabled: s.loading || s.undeletable, title: s.deleteTooltip });
  return out;
}
