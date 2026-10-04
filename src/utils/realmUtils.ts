/**
 * 境界工具函数
 * 用于格式化境界显示
 */

/**
 * 显示层映射：底层引擎仍用标准修仙境界（凡人/练气/筑基…，排序/战斗/存档全部不变），
 * 仅在面向玩家的展示处把名称翻译成小说《六朝》高手榜体系。改这张表即可调整称谓。
 * 阶梯来源：六朝高手榜.jpg —— 编号体系，四级·入微/五级·坐照/六级·通幽/七级·归元/八级·至臻/九级·入神。
 * 对齐：级号 = 修仙等级 + 1（金丹=四级·入微「准高手」，一一对应铺满九级）。
 */
const REALM_DISPLAY_NAME_MAP: Record<string, string> = {
  凡人: '一级',
  练气: '二级',
  筑基: '三级',
  金丹: '四级·入微',
  元婴: '五级·坐照',
  化神: '六级·通幽',
  炼虚: '七级·归元',
  合体: '八级·至臻',
  渡劫: '九级·入神',
};

/** 修仙子阶段 → 高手榜「下/中/上」展示阶。 */
const REALM_DISPLAY_STAGE_MAP: Record<string, string> = {
  初期: '下',
  中期: '中',
  后期: '上',
  圆满: '巅峰',
  极境: '绝巅',
};

/** 把存档里的修仙境界名翻译成高手榜展示名（未知名称原样返回）。 */
export function toGaoshoubangName(name: string): string {
  return REALM_DISPLAY_NAME_MAP[name] || name;
}

/**
 * 注入系统提示词的「修为称谓」规则：让 AI 叙事正文用高手榜称谓，
 * 但 JSON 命令与数据字段仍保持修仙原名（否则破坏数值与排序键）。
 * 由上面两张映射表生成，单一数据源、不会与 UI 显示漂移。
 */
export const GAOSHOUBANG_NARRATION_RULE = (() => {
  const names = Object.entries(REALM_DISPLAY_NAME_MAP)
    .map(([k, v]) => `${k}→${v}`)
    .join('、');
  const stages = Object.entries(REALM_DISPLAY_STAGE_MAP)
    .map(([k, v]) => `${k}→${v}`)
    .join('、');
  return [
    '[修为称谓·六朝高手榜]',
    '叙事正文(text)里称呼任何角色的修为层次时，一律用《六朝》高手榜称谓，不要出现"凡人/练气/筑基/金丹/元婴"等修仙境界名：',
    `${names}。`,
    `子阶段：${stages}（如"四级·入微·下"）。`,
    '注意：仅叙事文字改称谓；JSON 命令与数据字段(如 境界.名称)仍保持修仙原名(金丹/元婴…)，不可写成高手榜名，否则破坏数值与排序。',
  ].join('\n');
})();

/**
 * 格式化境界和阶段显示
 * @param realm 境界对象或字符串
 * @returns 格式化后的境界字符串
 */
export function formatRealmWithStage(realm: any): string {
  if (!realm) {
    return toGaoshoubangName('凡人');
  }

  // 如果是字符串，直接返回（翻译为展示名）
  if (typeof realm === 'string') {
    return toGaoshoubangName(realm);
  }

  // 如果是对象，提取名称和阶段
  const name = realm.名称 || realm.name || '凡人';
  const stage = realm.阶段 || realm.stage || '';
  const displayName = toGaoshoubangName(name);
  if (realm.九阳层次) return `${displayName} · ${realm.九阳层次}`;

  // 凡人不加阶段
  if (name === '凡人' || name === 'Mortal') {
    return toGaoshoubangName('凡人');
  }

  // 如果有阶段，返回"境界+阶段"
  if (stage) {
    return `${displayName}·${REALM_DISPLAY_STAGE_MAP[stage] || stage}`;
  }

  // 否则只返回境界名称
  return displayName;
}
