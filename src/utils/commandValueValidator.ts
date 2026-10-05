import { splitRecordPath, npcRecordPath } from '@/modules/scenarioMods/ledger/affinityIdentity';
/**
 * 指令值格式验证系统
 *
 * 功能：
 * - 验证指令value的数据格式是否符合游戏数据结构
 * - 检查必需字段是否存在
 * - 拒绝执行格式不完整的指令（不进行修复）
 */

import type { TavernCommand } from '@/types/AIGameMaster';

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function coerceNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function coerceStringArray(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    // 兼容：用中文/英文分隔符拼接
    return trimmed
      .split(/[、,，;；\n]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return null;
}

/**
 * 验证指令值的格式（只验证，不修复）
 */
export function validateAndRepairCommandValue(command: TavernCommand): ValidationResult {
  const { action, key, value } = command;
  const errors: string[] = [];

  if (typeof key !== 'string' || !key) {
    return { valid: false, errors: ['指令缺少key字段'] };
  }
  if (typeof action !== 'string' || !action) {
    return { valid: false, errors: ['指令缺少action字段'] };
  }

  try {
    // 1. 玩家境界对象
    if (key === '角色.属性.境界' && action === 'set') {
      const result = validateRealmObject(value, '玩家');
      errors.push(...result.errors);
    }

    // 2. 玩家位置对象
    if (key === '角色.位置' && action === 'set') {
      const result = validateLocationObject(value);
      errors.push(...result.errors);
    }

    // 2.1 游戏时间对象（允许整体 set，用于时间跳跃/修复）
    if (key === '元数据.时间' && action === 'set') {
      const result = validateGameTimeObject(value);
      errors.push(...result.errors);
    }

    // 3. 状态效果对象（push操作）
    if (key === '角色.效果' && action === 'push') {
      const result = validateStatusEffectObject(value);
      errors.push(...result.errors);
    }

    // 4. 物品对象（push到背包）
    if (key === '角色.背包.物品' && action === 'push') {
      const result = validateItemObject(value);
      errors.push(...result.errors);
    }

    // 5. 物品对象（set操作）
    // 只验证完整物品对象，跳过设置物品子属性的操作（如 .描述、.使用效果、.数量、.修炼进度 等）
    if (key.startsWith('角色.背包.物品.') && action === 'set') {
      // 计算 key 中的点数量来判断是设置完整物品还是物品属性
      // 角色.背包.物品.item_xxx = 3个点 = 设置完整物品对象
      // 角色.背包.物品.item_xxx.描述 = 4个点 = 设置物品的子属性
      const dotCount = (key.match(/\./g) || []).length;
      if (dotCount === 3) {
        // 只有设置完整物品对象时才验证
        const result = validateItemObject(value);
        errors.push(...result.errors);
      }
      // dotCount >= 4 时是设置子属性，跳过验证
    }

    // 6. NPC对象（创建或更新）
    // 🔥 只在“创建/完整覆盖NPC对象”时验证完整性；更新现有NPC时不验证
    // 判断是否是创建新NPC：value包含多个核心字段（名字、性别、出生日期、外貌等）
    if (key.startsWith('社交.关系.') && splitRecordPath(key).length === 3 && action === 'set') {
      const isLikelyFullNpcObject =
        value &&
        typeof value === 'object' &&
        (value as any).名字 &&
        (value as any).性别 &&
        (value as any).出生日期 &&
        ((value as any).外貌描述 || (value as any).性格特征 || (value as any).境界);

      // 如果看起来是完整NPC对象，则执行完整性验证
      if (isLikelyFullNpcObject) {
        const result = validateNPCObject(value);
        errors.push(...result.errors);
      }
      // 否则视为部分更新，跳过验证（避免误伤 set|社交.关系.NPC|{"好感度":...} 之类的指令）
    }

    // 7. NPC境界对象
    if (key.includes('社交.关系.') && key.endsWith('.境界') && action === 'set') {
      const result = validateRealmObject(value, 'NPC');
      errors.push(...result.errors);
    }

    // 8. 大道对象
    if (key.startsWith('角色.大道.大道列表.') && action === 'set' && (key.match(/\./g) || []).length === 3) {
      // 从 key 中提取道名（如 "角色.大道.大道列表.剑道" -> "剑道"）
      const daoName = splitRecordPath(key)[3];
      const result = validateDaoObject(value, daoName);
      errors.push(...result.errors);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  } catch (error) {
    console.error('[指令值验证] 验证过程发生异常:', error);
    return {
      valid: false,
      errors: [`验证过程异常: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

/**
 * 验证境界对象
 */
function validateRealmObject(value: any, type: '玩家' | 'NPC'): ValidationResult {
  const errors: string[] = [];

  if (typeof value !== 'object' || value === null) {
    errors.push('境界必须是对象类型');
    return { valid: false, errors };
  }

  // 玩家和NPC境界统一验证：必需名称和阶段，其他字段可选
  if (!value.名称) errors.push('境界缺少"名称"字段');
  if (!value.阶段) errors.push('境界缺少"阶段"字段');

  // 可选字段类型检查（如果提供了就检查类型）
  if (value.当前进度 !== undefined) {
    const numeric = coerceNumeric(value.当前进度);
    if (numeric === null) errors.push('境界"当前进度"字段类型错误，应为数字');
    else value.当前进度 = numeric;
  }
  if (value.下一级所需 !== undefined) {
    const numeric = coerceNumeric(value.下一级所需);
    if (numeric === null) errors.push('境界"下一级所需"字段类型错误，应为数字');
    else value.下一级所需 = numeric;
  }
  if (value.突破描述 !== undefined && typeof value.突破描述 !== 'string') {
    errors.push('境界"突破描述"字段类型错误，应为字符串');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 验证位置对象
 */
function validateLocationObject(value: any): ValidationResult {
  const errors: string[] = [];

  if (typeof value !== 'object' || value === null) {
    errors.push('位置必须是对象类型');
    return { valid: false, errors };
  }

  if (!value.描述) errors.push('位置缺少"描述"字段');
  if (value.x !== undefined) {
    const numeric = coerceNumeric(value.x);
    if (numeric !== null) value.x = numeric;
    if (typeof value.x !== 'number') errors.push('位置.x类型错误，应为数字');
  }
  if (value.y !== undefined) {
    const numeric = coerceNumeric(value.y);
    if (numeric !== null) value.y = numeric;
    if (typeof value.y !== 'number') errors.push('位置.y类型错误，应为数字');
  }
  if (value.地图ID !== undefined && typeof value.地图ID !== 'string') errors.push('位置.地图ID类型错误，应为字符串');

  return { valid: errors.length === 0, errors };
}

/**
 * 验证游戏时间对象（允许整体 set）
 */
function validateGameTimeObject(value: any): ValidationResult {
  const errors: string[] = [];

  if (typeof value !== 'object' || value === null) {
    errors.push('时间必须是对象类型');
    return { valid: false, errors };
  }

  const fields = ['年', '月', '日', '小时', '分钟'] as const;
  for (const f of fields) {
    if (value[f] === undefined) {
      errors.push(`时间缺少"${f}"字段`);
      continue;
    }
    const numeric = coerceNumeric(value[f]);
    if (numeric !== null) value[f] = numeric;
    if (typeof value[f] !== 'number') {
      errors.push(`时间.${f}类型错误，应为数字`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 验证状态效果对象
 */
function validateStatusEffectObject(value: any): ValidationResult {
  const errors: string[] = [];

  if (typeof value !== 'object' || value === null) {
    errors.push('状态效果必须是对象类型');
    return { valid: false, errors };
  }

  if (!value.状态名称) errors.push('状态效果缺少"状态名称"字段');
  if (!value.类型 || !['buff', 'debuff'].includes(value.类型)) errors.push('状态效果缺少"类型"字段或值无效');
  if (value.状态描述 === undefined) errors.push('状态效果缺少"状态描述"字段');
  if (typeof value.持续时间分钟 !== 'number') errors.push('状态效果缺少"持续时间分钟"字段或类型错误');
  if (!value.生成时间 || typeof value.生成时间 !== 'object') errors.push('状态效果缺少"生成时间"对象字段');

  return { valid: errors.length === 0, errors };
}

/**
 * 验证物品对象
 */
function validateItemObject(value: any): ValidationResult {
  const errors: string[] = [];

  if (typeof value !== 'object' || value === null) {
    errors.push('物品必须是对象类型');
    return { valid: false, errors };
  }

  // 必需字段
  if (!value.物品ID) errors.push('物品缺少"物品ID"字段');
  if (!value.名称) errors.push('物品缺少"名称"字段');
  if (!value.类型) errors.push('物品缺少"类型"字段');

  if (!value.品质) {
    errors.push('物品缺少"品质"字段');
  } else if (typeof value.品质 === 'object') {
    if (!value.品质.quality) errors.push('物品品质缺少"quality"字段');
    if (typeof value.品质.grade !== 'number') errors.push('物品品质缺少"grade"字段或类型错误');
  } else {
    errors.push('物品品质必须是对象类型');
  }

  if (typeof value.数量 !== 'number') errors.push('物品缺少"数量"字段或类型错误');
  if (value.描述 === undefined) errors.push('物品缺少"描述"字段');

  // 功法类型特殊处理
  if (value.类型 === '功法') {
    if (!Array.isArray(value.功法技能)) {
      errors.push('功法物品缺少"功法技能"数组');
    } else if (value.功法技能.length === 0) {
      errors.push('功法物品的"功法技能"数组不能为空，至少需要1个技能');
    } else {
      // 验证每个技能对象
      value.功法技能.forEach((skill: any, index: number) => {
        if (typeof skill !== 'object' || skill === null) {
          errors.push(`功法技能[${index}]不是对象类型`);
        } else {
          if (!skill.技能名称) errors.push(`功法技能[${index}]缺少"技能名称"字段`);
          if (skill.技能描述 === undefined) errors.push(`功法技能[${index}]缺少"技能描述"字段`);
          if (typeof skill.熟练度要求 !== 'number') errors.push(`功法技能[${index}]缺少"熟练度要求"字段或类型错误`);
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 验证NPC对象
 */
function validateNPCObject(value: any): ValidationResult {
  const errors: string[] = [];

  if (typeof value !== 'object' || value === null) {
    errors.push('NPC必须是对象类型');
    return { valid: false, errors };
  }

  // 必需字段
  if (!value.名字) errors.push('NPC缺少"名字"字段');
  if (!value.性别) errors.push('NPC缺少"性别"字段');
  if (!value.出生日期) errors.push('NPC缺少"出生日期"字段');

  if (!value.境界) {
    errors.push('NPC缺少"境界"字段');
  } else {
    const realmResult = validateRealmObject(value.境界, 'NPC');
    errors.push(...realmResult.errors);
  }

  if (!value.出生) errors.push('NPC缺少"出生"字段');
  if (value.性格特征 !== undefined) {
    const coerced = coerceStringArray(value.性格特征);
    if (coerced) value.性格特征 = coerced;
  }
  if (!value.性格特征) errors.push('NPC缺少"性格特征"字段');
  if (!value.外貌描述) errors.push('NPC缺少"外貌描述"字段');
  if (!value.与玩家关系) errors.push('NPC缺少"与玩家关系"字段');
  if (value.好感度 !== undefined) {
    const numeric = coerceNumeric(value.好感度);
    if (numeric !== null) value.好感度 = numeric;
  }
  if (typeof value.好感度 !== 'number') errors.push('NPC缺少"好感度"字段或类型错误');

  // 可选字段验证
  if (value.天赋 !== undefined && !Array.isArray(value.天赋)) {
    errors.push('NPC天赋必须是数组类型');
  }

  if (value.私密信息 && typeof value.私密信息 === 'object') {
    const privacy = value.私密信息 as any;
    const listFields = ['性癖好', '性伴侣名单', '特殊体质', '亲密偏好', '禁忌清单'];
    for (const field of listFields) {
      if (privacy[field] !== undefined) {
        const coerced = coerceStringArray(privacy[field]);
        if (coerced) privacy[field] = coerced;
      }
    }
    if (privacy.生育状态 !== undefined) {
      const fertility = privacy.生育状态;
      if (typeof fertility === 'string') {
        privacy.生育状态 = { 当前状态: fertility };
      } else if (typeof fertility !== 'object' || fertility === null) {
        errors.push('NPC私密信息.生育状态必须是对象或字符串');
      }
    }
    if (value.私密信息.身体部位 !== undefined) {
      const bp = value.私密信息.身体部位;
      const ok = Array.isArray(bp) || (bp && typeof bp === 'object');
      if (!ok) errors.push('NPC私密信息.身体部位必须是数组或对象类型');
    }
  }

  // 记忆字段容错：字符串 -> 数组
  if (value.记忆 !== undefined && !Array.isArray(value.记忆)) {
    const coerced = coerceStringArray(value.记忆);
    if (coerced) value.记忆 = coerced;
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 验证大道对象
 * 支持自动补全缺失字段
 * @param value 大道对象
 * @param daoNameFromKey 从 key 中提取的道名（如 "剑道"）
 */
function validateDaoObject(value: any, daoNameFromKey?: string): ValidationResult {
  const errors: string[] = [];

  if (typeof value !== 'object' || value === null) {
    errors.push('大道对象必须是对象类型');
    return { valid: false, errors };
  }

  // 🔥 自动补全缺失字段，而不是直接拒绝
  // 优先使用 key 中提取的道名
  if (!value.道名) {
    const possibleName = daoNameFromKey || value.name || value.名称;
    if (possibleName) {
      value.道名 = possibleName;
    } else {
      errors.push('大道对象缺少"道名"字段');
    }
  }

  if (value.描述 === undefined) {
    value.描述 = value.description || '修行之道';
  }

  if (!Array.isArray(value.阶段列表)) {
    // 提供默认阶段列表
    value.阶段列表 = [
      { 阶段名: '入门', 需求经验: 100 },
      { 阶段名: '小成', 需求经验: 500 },
      { 阶段名: '大成', 需求经验: 2000 },
      { 阶段名: '圆满', 需求经验: 10000 }
    ];
  }

  if (typeof value.是否解锁 !== 'boolean') {
    value.是否解锁 = true; // 默认解锁
  }

  if (typeof value.当前阶段 !== 'number') {
    value.当前阶段 = 0; // 默认入门阶段
  }

  if (typeof value.当前经验 !== 'number') {
    value.当前经验 = 0;
  }

  if (typeof value.总经验 !== 'number') {
    value.总经验 = 0;
  }

  return { valid: errors.length === 0, errors };
}
