const INVENTORY_ITEM_NOUNS = [
  '玉简',
  '令牌',
  '丹药',
  '丹丸',
  '符箓',
  '法器',
  '法宝',
  '功法',
  '秘籍',
  '玉佩',
  '钥匙',
  '书册',
  '卷轴',
  '药瓶',
  '锦盒',
  '灵草',
  '灵材',
  '矿石',
  '信物',
  '地图',
  '阵盘',
  '储物袋',
];

const INVENTORY_ITEM_NOUN_PATTERN = INVENTORY_ITEM_NOUNS.join('|');

function normalizeNarratedItemName(value: string): string {
  return value
    .replace(/[“”"「」『』《》]/g, '')
    .replace(/^(?:一枚|一块|一本|一卷|一件|一只|一个|这枚|这块|这本|这卷|这件|那枚|那块|那本|那卷|那件)/, '')
    .replace(/^(?:那|这|此|一)[个件枚块本卷只]?/, '')
    .trim();
}

export function detectNarratedInventoryGains(text: string): string[] {
  if (!text || typeof text !== 'string') return [];

  const found = new Set<string>();
  const patterns = [
    new RegExp(`(?:获得|得到|取得|接过|收下|收起|拾起|捡起|买下|购得|缴获|受赠|收入囊中|纳入怀中|放入(?:怀中|背包|储物袋|囊中)|揣入怀中)[了着]?(?:一枚|一块|一本|一卷|一件|一只|一个|这枚|这块|这本|这卷|这件|那枚|那块|那本|那卷|那件)?([^，。；、\\n]{0,18}?(?:${INVENTORY_ITEM_NOUN_PATTERN}))`, 'g'),
    new RegExp(`(?:将|把)([^，。；、\\n]{0,18}?(?:${INVENTORY_ITEM_NOUN_PATTERN}))(?:轻轻|顺手|郑重|小心)?(?:收下|收起|收入|纳入|放入|揣入|塞进)`, 'g'),
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const itemName = normalizeNarratedItemName(match[1] || '');
      if (itemName && itemName.length <= 24) found.add(itemName);
    }
  }

  return [...found];
}

export function hasInventoryItemMutationCommand(commands: unknown[]): boolean {
  if (!Array.isArray(commands)) return false;
  return commands.some((command) => {
    if (!command || typeof command !== 'object') return false;
    const cmd = command as Record<string, unknown>;
    const action = typeof cmd.action === 'string' ? cmd.action : '';
    const key = typeof cmd.key === 'string' ? cmd.key.trim() : '';
    if (!['set', 'push', 'add', 'delete'].includes(action)) return false;
    return (
      key === '角色.背包.物品' ||
      key.startsWith('角色.背包.物品.') ||
      key === '背包.物品' ||
      key.startsWith('背包.物品.') ||
      key === '物品栏.物品' ||
      key.startsWith('物品栏.物品.')
    );
  });
}

export function getMissingNarratedInventoryGains(text: string, commands: unknown[]): string[] {
  const gains = detectNarratedInventoryGains(text);
  if (gains.length === 0 || hasInventoryItemMutationCommand(commands)) return [];
  return gains;
}
