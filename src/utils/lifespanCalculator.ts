

/**
 * 纪元基点：主角固定出生于第 200 年，开局当前年 = 纪元基点 + 开局年龄。
 * 起始年是「年龄的纯函数」，不是创作内容——所有 init 路径共享此常量、由代码确定，
 * 不交给 LLM 生成（曾因 LLM 自由发挥导致开局年份 485/384 乱飘）。
 * 注册表内 38 个 NPC birthYear 亦锚定于此基点（170~218），改基点需同步迁移，勿轻动。
 */
export const 纪元基点 = 200;
/** 起始游戏年 = 纪元基点 + 开局年龄（确定性） */
export function 计算起始年(age: number): number {
  return 纪元基点 + (Number.isFinite(age) ? Math.max(0, Math.floor(age)) : 0);
}

export interface GameTime {
  年: number;
  月: number;
  日: number;
  小时?: number;
  分钟?: number;
}

/**
 * 根据出生日期和当前时间计算年龄
 * @param birthTime 出生日期
 * @param currentTime 当前时间
 * @returns 当前年龄（向下取整）
 */
export function calculateAgeFromBirthdate(birthTime: GameTime, currentTime: GameTime): number {
  // 计算年龄差
  let age = currentTime.年 - birthTime.年;

  // 如果当前月日还没到生日月日，说明还没满周岁
  if (currentTime.月 < birthTime.月 ||
      (currentTime.月 === birthTime.月 && currentTime.日 < birthTime.日)) {
    age--;
  }

  return Math.max(0, age); // 确保年龄不为负
}

/**
 * 根据当前年龄和当前时间推算出生日期
 * @param currentAge 当前年龄
 * @param currentTime 当前时间
 * @returns 出生日期
 */
export function calculateBirthdateFromAge(currentAge: number, currentTime: GameTime): GameTime {
  return {
    年: currentTime.年 - currentAge,
    月: currentTime.月,
    日: currentTime.日,
    小时: 0,
    分钟: 0
  };
}

/** 显式版本区分旧的寿命当前值与现算缓存；旧档须完成出生年识别后才启用。 */
export const LIFESPAN_CACHE_VERSION_KEY = 'c01LifespanCacheVersion';
export const LIFESPAN_CACHE_VERSION = 1;
export function lifespanCacheEnabled(saveData: any): boolean {
  return Number(saveData?.系统?.扩展?.[LIFESPAN_CACHE_VERSION_KEY]) >= LIFESPAN_CACHE_VERSION;
}
export function enableLifespanCache(saveData: any): void {
  // 没有角色寿命的残缺／元数据档无需启用缓存，也不应为此写入只读系统容器。
  if (!saveData?.角色?.身份 || !saveData?.角色?.属性?.寿命) return;
  saveData.系统 ||= {};
  saveData.系统.扩展 ||= {};
  saveData.系统.扩展[LIFESPAN_CACHE_VERSION_KEY] = LIFESPAN_CACHE_VERSION;
}

/**
 * 从SaveData中计算当前年龄（玩家）
 * 寿命.当前 是出生日期现算年龄的缓存，供状态摘要等既有读取方使用。
 * @param saveData 存档数据
 * @returns 计算得到的年龄
 */
export function updateLifespanFromGameTime(saveData: any): number {
  const currentTime = saveData?.元数据?.时间 ?? { 年: 1, 月: 1, 日: 1, 小时: 8, 分钟: 0 };
  const identity = saveData?.角色?.身份 ?? null;

  if (!identity || typeof identity !== 'object') return 0;

  // 如果没有出生日期，按默认年龄18推算（沿用既有缺值兜底）
  if (!identity.出生日期) {
    const defaultAge = 18;
    if (!lifespanCacheEnabled(saveData)) return defaultAge;
    identity.出生日期 = calculateBirthdateFromAge(defaultAge, currentTime);
  }

  // 根据出生日期计算当前年龄
  const age = calculateAgeFromBirthdate(identity.出生日期, currentTime);
  const lifespan = saveData?.角色?.属性?.寿命;
  // 未迁移旧档先只计算，不覆盖旧识别依据；读档修复／新建入口负责显式启用。
  if (lifespan && typeof lifespan === 'object' && lifespanCacheEnabled(saveData)) lifespan.当前 = age;
  return age;
}

/**
 * 从NPC数据中自动计算并更新当前年龄
 * @param npcData NPC数据对象
 * @param globalGameTime 当前游戏时间
 * @returns NPC当前年龄
 */
export function updateNpcLifespanFromGameTime(npcData: any, globalGameTime: GameTime): number {
  const currentTime = globalGameTime || { 年: 1, 月: 1, 日: 1, 小时: 8, 分钟: 0 };

  const baseInfo = npcData;

  // 如果没有出生日期，根据当前年龄推算出生日期
  if (!baseInfo.出生日期) {
    const currentAge = baseInfo.年龄 || 18;
    const birthdate = calculateBirthdateFromAge(currentAge, currentTime);

    baseInfo.出生日期 = birthdate;

    
    return currentAge;
  }

  // 根据出生日期计算当前年龄
  const birthdate = baseInfo.出生日期;
  const calculatedAge = calculateAgeFromBirthdate(birthdate, currentTime);

  // 更新年龄字段（如果存在）
  if (baseInfo.年龄 !== undefined) baseInfo.年龄 = calculatedAge;

  return calculatedAge;
}

/** 存档列表按槽内游戏时间现算，不修改尚未读入的槽；缺生日才退回旧缓存。 */
export function ageForSaveCard(saveData: any): number {
  const birth = saveData?.角色?.身份?.出生日期;
  const now = saveData?.元数据?.时间 ?? saveData?.游戏时间;
  if (Number.isFinite(birth?.年) && Number.isFinite(now?.年)) {
    return calculateAgeFromBirthdate({ 月: 1, 日: 1, ...birth }, { 月: 1, 日: 1, ...now });
  }
  return saveData?.角色?.属性?.寿命?.当前 ?? 18;
}
