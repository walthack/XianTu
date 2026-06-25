export const NATIVE_SCENARIO_LOCATION_TYPES = ['城池', '宗门', '秘境', '险地', '商会', '坊市', '洞府'] as const;

export type NativeScenarioLocationType = typeof NATIVE_SCENARIO_LOCATION_TYPES[number];

const ALIAS_RULES: Array<[RegExp, NativeScenarioLocationType]> = [
  [/^(?:capital|city|town|settlement|城|城池|都城|京城|城市|县城|港口|关隘)$/i, '城池'],
  [/(?:城|都|京|港|关|寨|堡|镇|村|庄|宫|府|驿|营地|军营|战场|battlefield|camp|palace|court)/i, '城池'],
  [/^(?:sect|school|temple|monastery|宗门|门派|山门|道观|寺庙|修行宗门|宗门驻地)$/i, '宗门'],
  [/(?:宗|门派|山门|道观|寺|庵|观堂|教派|教团)/i, '宗门'],
  [/^(?:realm|secret_realm|ancient_ruin|ruin|ruins|秘境|遗迹|古阵|洞天|福地)$/i, '秘境'],
  [/(?:秘境|古阵|遗迹|洞天|福地|幻境|结界|陵|墓|ruin)/i, '秘境'],
  [/^(?:danger|wilderness|forbidden|险地|禁地|荒野|绝地)$/i, '险地'],
  [/(?:险|禁地|荒|岭|谷|林|海域|沙漠|雪原|深渊|绝地|地域|region)/i, '险地'],
  [/^(?:guild|company|trade|merchant|商会|商馆|镖局|行会|钱庄)$/i, '商会'],
  [/(?:商会|商馆|镖局|钱庄|商行|会馆|guild|company)/i, '商会'],
  [/^(?:market|bazaar|坊市|集市|市集|黑市)$/i, '坊市'],
  [/(?:坊市|集市|市集|黑市|市场|market|bazaar)/i, '坊市'],
  [/^(?:cave|residence|manor|洞府|宅邸|居所|府邸|别院|客栈)$/i, '洞府'],
  [/(?:洞府|宅|府邸|别院|客栈|居所|院|楼|阁|cave|residence)/i, '洞府'],
];

export function normalizeScenarioLocationType(value?: string): NativeScenarioLocationType {
  const raw = String(value || '').trim();
  if (!raw) return '城池';
  if ((NATIVE_SCENARIO_LOCATION_TYPES as readonly string[]).includes(raw)) {
    return raw as NativeScenarioLocationType;
  }
  const matched = ALIAS_RULES.find(([pattern]) => pattern.test(raw));
  return matched?.[1] || '城池';
}

export function withNativeScenarioLocationType<T extends Record<string, unknown>>(
  location: T,
  type?: string,
): T & { 类型: NativeScenarioLocationType; 原始类型?: string } {
  const originalType = type || String(location.类型 || location.type || '');
  const normalizedType = normalizeScenarioLocationType(originalType);
  return {
    ...location,
    类型: normalizedType,
    ...(originalType && originalType !== normalizedType ? { 原始类型: originalType } : {}),
  };
}
