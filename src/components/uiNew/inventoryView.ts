/**
 * 新界面「背包页」用的纯函数（只管怎么摆，不管物品逻辑）。
 * 物品能做的事、分类、空背包提示都照老背包面板 InventoryPanel.vue 的模板条件写，改老面板时这里要一起改。
 */

/** 格子里的圆形字徽：取物品名里一个字。去掉末尾的「子／儿」，取最后一个汉字（火折子→折、金创药→药）；没有汉字取第一个字符。 */
export function itemGlyph(name: string): string {
  const chars = Array.from(String(name || '').trim());
  if (!chars.length) return '?';
  const han = chars.filter(c => /\p{Script=Han}/u.test(c));
  if (!han.length) return chars[0];
  const trimmed = han.length > 1 && /[子儿]/.test(han[han.length - 1]) ? han.slice(0, -1) : han;
  return trimmed[trimmed.length - 1];
}

export type InventoryActionKey = 'equip' | 'cultivate' | 'use' | 'discard';
export interface InventoryAction { key: InventoryActionKey; label: string; disabled: boolean }

/**
 * 选中物品在老面板详情里有哪几个按钮（同老模板 details-actions）：
 * 装备 → 装备／卸下（equipBusy 时禁用）＋丢弃；功法 → 修炼／停止修炼（cultivateBusy 时禁用）＋丢弃；其他 → 使用＋丢弃。
 */
export function itemActions(
  type: string,
  state: { equipped: boolean; cultivating: boolean; equipBusy: boolean; cultivateBusy: boolean },
): InventoryAction[] {
  if (type === '装备') {
    return [
      { key: 'equip', label: state.equipped ? '卸下' : '装备', disabled: state.equipBusy },
      { key: 'discard', label: '丢弃', disabled: false },
    ];
  }
  if (type === '功法') {
    return [
      { key: 'cultivate', label: state.cultivating ? '停止修炼' : '修炼', disabled: state.cultivateBusy },
      { key: 'discard', label: '丢弃', disabled: false },
    ];
  }
  return [
    { key: 'use', label: '使用', disabled: false },
    { key: 'discard', label: '丢弃', disabled: false },
  ];
}

/** 分类牌子：全部＋老面板 itemCategories 的分类（不自己加）。 */
export function categoryTabs(categories: readonly string[]): Array<{ id: string; label: string }> {
  return [{ id: 'all', label: '全部' }, ...categories.map(c => ({ id: c, label: c }))];
}

/** 格子为空时的那句话（同老模板 grid-placeholder 的分支）。返回未翻译的 i18n 键；arg 是要替换进 {0} 的分类名（也未翻译）。 */
export function emptyInventoryText(category: string): { key: string; arg?: string; tip: string } {
  const tip = category === 'all' ? '' : '可以试试搜索其他分类';
  if (category === 'all') return { key: '空空如也', tip };
  if (category === '装备') return { key: '暂无装备', tip };
  if (category === '功法') return { key: '暂无功法', tip };
  if (category === '其他') return { key: '暂无其他物品', tip };
  return { key: '暂无{0}', arg: category, tip };
}
