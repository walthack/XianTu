const INVENTORY_ITEM_NOUNS = [
  '玉简',
  '玉',
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
const INVENTORY_ITEM_COUNT_VALUE_PATTERN = '[0-9]+|[一二两三四五六七八九十百千万]+|数|几';
const INVENTORY_ITEM_COUNT_PREFIX = `(?:${INVENTORY_ITEM_COUNT_VALUE_PATTERN})?`;
const INVENTORY_ITEM_UNIT_PREFIX =
  `(?:这|那|此)?${INVENTORY_ITEM_COUNT_PREFIX}(?:枚|块|本|卷|件|只|个|颗|粒|瓶|支|张|份|把|柄|条)`;

export interface NarratedInventoryGain {
  名称: string;
  数量: number;
}

export function normalizeNarratedItemName(value: string): string {
  let normalized = value
    .replace(/[【】“”"「」『』《》‘’'`]/g, '')
    .replace(/^(?:取出|拿出|清点|确认|查看|摸出|掏出|取来|拿起)/, '')
    .replace(/^(?:有|带着|带有|持有|藏着|剩下|只剩)/, '')
    .replace(/^(?:第[0-9一二两三四五六七八九十百千万]+)?(?:一枚|一块|一本|一卷|一件|一只|一个|一把|这枚|这块|这本|这卷|这件|这把|那枚|那块|那本|那卷|那件|那把)/, '')
    .replace(new RegExp(`^${INVENTORY_ITEM_UNIT_PREFIX}`), '')
    .replace(/^第[0-9一二两三四五六七八九十百千万]+(?:枚|块|本|卷|件|只|个|颗|粒|瓶|支|张|份|把|柄|条)/, '')
    .replace(/^(?:那|这|此|一)[个件枚块本卷只]?/, '')
    .replace(/^的+/, '')
    .replace(/龙晴玉/g, '龙睛玉')
    .trim();

  const descriptivePrefixMatch = normalized.match(new RegExp(`^[\\u4e00-\\u9fff]{1,8}的(.+(?:${INVENTORY_ITEM_NOUN_PATTERN}))$`));
  if (descriptivePrefixMatch?.[1]) {
    normalized = descriptivePrefixMatch[1].trim();
  }

  return normalized;
}

export function getInventoryItemIdentityKey(value: string): string {
  return normalizeNarratedItemName(value)
    .replace(/[·\-—_、，。；：:!！?？\s]/g, '')
    .trim();
}

function isPlausibleNarratedItemName(value: string): boolean {
  const itemName = normalizeNarratedItemName(value);
  if (!itemName || itemName.length < 2 || itemName.length > 24) return false;
  if (!new RegExp(INVENTORY_ITEM_NOUN_PATTERN).test(itemName)) return false;
  if (/[。；\n]|——|…/.test(itemName)) return false;
  if (/(?:气息|光芒|紫光|青芒|波动|触感|掌心|怀中|袖中|腰间|手中|身上|案上|桌上|深处|边缘|几行|文字|感觉|散发|复杂)/.test(itemName)) {
    return false;
  }
  if (/(?:城东|城西|城南|城北|青云坊|玉清观|山门|丹房|码头|街口|巷口|门前|房内|楼内|阁中|殿内)/.test(itemName)) {
    return false;
  }
  return true;
}

function parseChineseInteger(value: string): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  if (value === '两') return 2;
  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (value in digits) return digits[value];
  if (value === '十') return 10;
  const tenMatch = value.match(/^([一二两三四五六七八九])?十([一二三四五六七八九])?$/);
  if (tenMatch) {
    const tens = tenMatch[1] ? (tenMatch[1] === '两' ? 2 : digits[tenMatch[1]]) : 1;
    const ones = tenMatch[2] ? digits[tenMatch[2]] : 0;
    return tens * 10 + ones;
  }
  return null;
}

function getNarratedItemQuantity(rawValue: string): number {
  const match = rawValue
    .trim()
    .match(new RegExp(`^(?:这|那|此)?(${INVENTORY_ITEM_COUNT_VALUE_PATTERN})(?:枚|块|本|卷|件|只|个|颗|粒|瓶|支|张|份|把|柄|条)`));
  const parsed = parseChineseInteger(match?.[1] || '');
  return parsed && Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function addNarratedGain(found: Map<string, NarratedInventoryGain>, rawValue: string): void {
  const itemName = normalizeNarratedItemName(rawValue || '');
  if (!isPlausibleNarratedItemName(itemName)) return;
  const existing = found.get(itemName);
  const quantity = getNarratedItemQuantity(rawValue);
  if (existing) {
    existing.数量 += quantity;
  } else {
    found.set(itemName, { 名称: itemName, 数量: quantity });
  }
}

export function detectNarratedInventoryGainEntries(text: string): NarratedInventoryGain[] {
  if (!text || typeof text !== 'string') return [];

  const found = new Map<string, NarratedInventoryGain>();
  const patterns = [
    new RegExp(`(?:获得|得到|取得|接过|收下|收起|拾起|捡起|买下|购得|缴获|受赠|收入囊中|纳入怀中|放入(?:怀中|背包|储物袋|囊中)|揣入怀中)[了着]?(?:一枚|一块|一本|一卷|一件|一只|一个|这枚|这块|这本|这卷|这件|那枚|那块|那本|那卷|那件)?([^，。；、\\n]{0,18}?(?:${INVENTORY_ITEM_NOUN_PATTERN}))`, 'g'),
    new RegExp(`(?:将|把)([^，。；、\\n]{0,18}?(?:${INVENTORY_ITEM_NOUN_PATTERN}))(?:轻轻|顺手|郑重|小心)?(?:收下|收起|收入|纳入|放入|揣入|塞进)`, 'g'),
    new RegExp(`(?:递来|递给|交给|送来|呈上)[了着]?(?:一枚|一块|一本|一卷|一件|一只|一个|这枚|这块|这本|这卷|这件|那枚|那块|那本|那卷|那件)?([^，。；、\\n]{0,18}?(?:${INVENTORY_ITEM_NOUN_PATTERN}))[^。；\\n]{0,30}?(?:将其|把它|将它|把其|将这(?:枚|块|本|卷|件|只|个)?|把这(?:枚|块|本|卷|件|只|个)?)(?:收入|收起|纳入|揣入|放入)(?:怀中|袖中|囊中|背包|储物袋|行囊)?`, 'g'),
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      addNarratedGain(found, match[1] || '');
    }
  }

  return [...found.values()];
}

export function detectNarratedInventoryGains(text: string): string[] {
  return detectNarratedInventoryGainEntries(text).map((item) => item.名称);
}

export function detectNarratedInventoryPossessions(text: string): string[] {
  if (!text || typeof text !== 'string') return [];

  const found = new Set<string>(detectNarratedInventoryGains(text));
  const possessionContext = /怀中|袖中|囊中|背包|储物袋|行囊|随身|身上|安然无恙|还在|尚在|未失/.test(text);
  if (!possessionContext) return [...found];

  const bracketPattern = /【([^】]+)】/g;
  for (const match of text.matchAll(bracketPattern)) {
    const itemName = normalizeNarratedItemName(match[1] || '');
    if (
      isPlausibleNarratedItemName(itemName)
    ) {
      found.add(itemName);
    }
  }

  if (found.size > 0) return [...found];

  const possessionPatterns = [
    new RegExp(`(?:怀中|袖中|囊中|背包|储物袋|行囊|随身|身上)[^，。；\\n]{0,40}?([^，。；、\\n]{0,18}?(?:${INVENTORY_ITEM_NOUN_PATTERN}))`, 'g'),
    new RegExp(`([^，。；、\\n]{0,18}?(?:${INVENTORY_ITEM_NOUN_PATTERN}))[^，。；\\n]{0,20}?(?:安然无恙|还在|尚在|未失)`, 'g'),
  ];

  for (const pattern of possessionPatterns) {
    for (const match of text.matchAll(pattern)) {
      const itemName = normalizeNarratedItemName(match[1] || '');
      if (/[【】]/.test(itemName)) continue;
      if (isPlausibleNarratedItemName(itemName)) found.add(itemName);
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

function addCommandItemIdentity(identities: Set<string>, value: unknown): void {
  if (typeof value === 'string') {
    const identity = getInventoryItemIdentityKey(value);
    if (identity) identities.add(identity);
    return;
  }

  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const entry of value) addCommandItemIdentity(identities, entry);
    return;
  }

  const record = value as Record<string, unknown>;
  for (const key of ['名称', 'name', '物品名', 'itemName']) {
    if (typeof record[key] === 'string') {
      const identity = getInventoryItemIdentityKey(record[key]);
      if (identity) identities.add(identity);
    }
  }
}

function getInventoryMutationItemIdentities(commands: unknown[]): Set<string> {
  const identities = new Set<string>();
  if (!Array.isArray(commands)) return identities;

  for (const command of commands) {
    if (!command || typeof command !== 'object') continue;
    const cmd = command as Record<string, unknown>;
    const action = typeof cmd.action === 'string' ? cmd.action : '';
    const key = typeof cmd.key === 'string' ? cmd.key.trim() : '';
    if (!['set', 'push', 'add'].includes(action)) continue;
    if (
      key !== '角色.背包.物品' &&
      !key.startsWith('角色.背包.物品.') &&
      key !== '背包.物品' &&
      !key.startsWith('背包.物品.') &&
      key !== '物品栏.物品' &&
      !key.startsWith('物品栏.物品.')
    ) {
      continue;
    }

    addCommandItemIdentity(identities, cmd.value);

    const suffix = key.split('.').pop() || '';
    if (/[\u4e00-\u9fff]/.test(suffix)) {
      const identity = getInventoryItemIdentityKey(suffix);
      if (identity) identities.add(identity);
    }
  }

  return identities;
}

export function getMissingNarratedInventoryGains(text: string, commands: unknown[]): string[] {
  const gains = detectNarratedInventoryGains(text);
  if (gains.length === 0) return [];

  const commandItemIdentities = getInventoryMutationItemIdentities(commands);
  return gains.filter((itemName) => {
    const identity = getInventoryItemIdentityKey(itemName);
    return identity && !commandItemIdentities.has(identity);
  });
}
