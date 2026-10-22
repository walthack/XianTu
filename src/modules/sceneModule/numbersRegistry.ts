/**
 * Numbers registry：段级 / 字段级形状表。
 * - 冷启动（默认三分包合并后）：缺段、缺必填、类型错 → LCQ-NUM-007
 * - 热改合并后：已登记叶子的范围 / 枚举 / 元组 → LCQ-NUM-008（与 004 并列，模块业务仍走 006）
 * 与 registerNumbersValidator 分工：registry = 结构／类型／粗范围；validator = 跨字段业务。
 */
export type FieldKind = 'number' | 'int' | 'bool' | 'string' | 'object' | 'array' | 'tuple2';

export type NumbersSection = 'combat' | 'progress' | 'runtime' | 'assist';

export interface FieldSpec {
  path: string;
  kind: FieldKind;
  required?: boolean;
  min?: number;
  max?: number;
  section: NumbersSection;
}

/** 三分包顶层段归属（与 mod-kit/numbers-*.json 一致）。 */
export const SECTION_KEYS: Record<NumbersSection, readonly string[]> = {
  combat: ['combat', 'difficulty', 'judgement', 'factors', 'weights', 'goalModifiers', 'sceneDefaults', 'historicalPrototype'],
  progress: ['levels', 'training', 'techniques', 'status', 'currency', 'freeAction', 'affinity', 'reputation', 'lineBonds', 'npcCard', 'story', 'shop', 'crafting'],
  runtime: ['version', 'tuning', 'diagnostics', 'saves', 'aiRetry', 'feedback', 'e2eSmoke', 'perf'],
  assist: ['assist'],
};

/** 30 个顶层键：version 为 int，其余为必填 object。 */
export const REQUIRED_TOP: ReadonlyArray<{ key: string; kind: 'int' | 'object'; section: NumbersSection }> = [
  { key: 'version', kind: 'int', section: 'runtime' },
  { key: 'levels', kind: 'object', section: 'progress' },
  { key: 'factors', kind: 'object', section: 'combat' },
  { key: 'combat', kind: 'object', section: 'combat' },
  { key: 'training', kind: 'object', section: 'progress' },
  { key: 'difficulty', kind: 'object', section: 'combat' },
  { key: 'currency', kind: 'object', section: 'progress' },
  { key: 'weights', kind: 'object', section: 'combat' },
  { key: 'goalModifiers', kind: 'object', section: 'combat' },
  { key: 'sceneDefaults', kind: 'object', section: 'combat' },
  { key: 'historicalPrototype', kind: 'object', section: 'combat' },
  { key: 'lineBonds', kind: 'object', section: 'progress' },
  { key: 'npcCard', kind: 'object', section: 'progress' },
  { key: 'affinity', kind: 'object', section: 'progress' },
  { key: 'reputation', kind: 'object', section: 'progress' },
  { key: 'status', kind: 'object', section: 'progress' },
  { key: 'techniques', kind: 'object', section: 'progress' },
  { key: 'freeAction', kind: 'object', section: 'progress' },
  { key: 'tuning', kind: 'object', section: 'runtime' },
  { key: 'judgement', kind: 'object', section: 'combat' },
  { key: 'diagnostics', kind: 'object', section: 'runtime' },
  { key: 'saves', kind: 'object', section: 'runtime' },
  { key: 'aiRetry', kind: 'object', section: 'runtime' },
  { key: 'feedback', kind: 'object', section: 'runtime' },
  { key: 'e2eSmoke', kind: 'object', section: 'runtime' },
  { key: 'perf', kind: 'object', section: 'runtime' },
  { key: 'assist', kind: 'object', section: 'assist' },
  { key: 'story', kind: 'object', section: 'progress' },
  { key: 'shop', kind: 'object', section: 'progress' },
  { key: 'crafting', kind: 'object', section: 'progress' },
];

/** 高频叶子：挡住缺字段 / 类型 / 粗范围；其余叶子仍靠补丁 typeof 对齐默认。 */
export const FIELD_SPECS: readonly FieldSpec[] = [
  { path: 'story.trades', kind: 'array', required: true, section: 'progress' },
  { path: 'shop.sites', kind: 'object', required: true, section: 'progress' },
  { path: 'story.stepScene.minutesPerBeat', kind: 'int', required: true, min: 0, section: 'progress' },
  { path: 'lineBonds.majorResponse.delta', kind: 'number', required: true, min: 0, section: 'progress' },
  { path: 'lineBonds.majorResponse.salienceFloor', kind: 'number', required: true, min: 0, section: 'progress' },
  { path: 'lineBonds.majorResponse.memoryKeep', kind: 'int', required: true, min: 1, section: 'progress' },
  { path: 'judgement.dice.sides', kind: 'int', required: true, min: 2, section: 'combat' },
  { path: 'combat.baselineDc', kind: 'number', required: true, section: 'combat' },
  { path: 'tuning.timeoutMs', kind: 'int', required: true, min: 1, section: 'runtime' },
  { path: 'affinity.range.min', kind: 'number', required: true, section: 'progress' },
  { path: 'affinity.range.max', kind: 'number', required: true, section: 'progress' },
  { path: 'affinity.tiers.nemesis', kind: 'tuple2', required: true, section: 'progress' },
  { path: 'affinity.tiers.sworn', kind: 'tuple2', required: true, section: 'progress' },
  { path: 'status.senseRange', kind: 'object', required: true, section: 'progress' },
  { path: 'status.psycheRange', kind: 'object', required: true, section: 'progress' },
  { path: 'status.permanentMinutesThreshold', kind: 'int', required: true, min: 1, section: 'progress' },
  { path: 'status.bingGu.qiCapRatio', kind: 'number', required: true, min: 0, max: 1, section: 'progress' },
  { path: 'status.bingGu.backlash.dc', kind: 'int', required: true, min: 1, section: 'progress' },
  { path: 'status.bingGu.backlash.hpLossRatio', kind: 'number', required: true, min: 0, max: 1, section: 'progress' },
  { path: 'status.freeText.minConfidence', kind: 'number', required: true, min: 0, max: 1, section: 'progress' },
  { path: 'sceneDefaults.brief.narrateMaxChars', kind: 'int', required: true, min: 1, section: 'combat' },
  { path: 'sceneDefaults.auditKeep', kind: 'int', required: true, min: 1, section: 'combat' },
  { path: 'weights.combat', kind: 'array', required: true, section: 'combat' },
  { path: 'weights.social', kind: 'array', required: true, section: 'combat' },
  { path: 'combat.woundRules.profiles', kind: 'object', required: true, section: 'combat' },
  { path: 'combat.preBattleSave.enabled', kind: 'bool', required: true, section: 'combat' },
  { path: 'combat.preBattleSave.slotName', kind: 'string', required: true, section: 'combat' },
  { path: 'combat.preBattleSave.workingSlotName', kind: 'string', required: true, section: 'combat' },
  { path: 'combat.heal.baseDifficulty', kind: 'number', required: true, section: 'combat' },
  { path: 'combat.heal.byTier', kind: 'object', required: true, section: 'combat' },
  { path: 'combat.heal.itemHpGainByGrade', kind: 'object', required: true, section: 'combat' },
  { path: 'combat.woundRules.hp.keepHp', kind: 'number', required: true, min: 0, section: 'combat' },
  { path: 'combat.woundRules.hp.combatDownedAt', kind: 'number', required: true, min: 0, section: 'combat' },
  { path: 'combat.woundRules.hp.afterLossContinueHp', kind: 'number', required: true, min: 1, section: 'combat' },
  { path: 'combat.woundRules.hp.playerDownedLoses', kind: 'bool', required: false, section: 'combat' },
  { path: 'combat.woundRules.afterWin.clearLight', kind: 'bool', required: true, section: 'combat' },
  { path: 'combat.woundRules.afterWin.statuses', kind: 'array', required: true, section: 'combat' },
  { path: 'crafting.levelTierCaps', kind: 'array', required: true, section: 'progress' },
  { path: 'crafting.uncraftableTiers', kind: 'array', required: true, section: 'progress' },
  { path: 'crafting.daoProficiency', kind: 'array', required: true, section: 'progress' },
  { path: 'crafting.successRateRange.min', kind: 'int', required: true, min: 0, max: 100, section: 'progress' },
  { path: 'crafting.successRateRange.max', kind: 'int', required: true, min: 0, max: 100, section: 'progress' },
  { path: 'assist.defaultRole', kind: 'string', required: true, section: 'assist' },
  { path: 'assist.maxActive', kind: 'int', required: true, min: 0, section: 'assist' },
  { path: 'assist.levelCount', kind: 'int', required: true, min: 1, section: 'assist' },
  { path: 'assist.simulationAffinity', kind: 'number', required: true, section: 'assist' },
  { path: 'assist.affinityLevels', kind: 'object', required: true, section: 'assist' },
  { path: 'assist.byActor', kind: 'object', required: true, section: 'assist' },
];

function atPath(tree: unknown, path: string): unknown {
  let node: unknown = tree;
  for (const part of path.split('.')) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

function kindOk(value: unknown, kind: FieldKind): boolean {
  switch (kind) {
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'int': return typeof value === 'number' && Number.isInteger(value);
    case 'bool': return typeof value === 'boolean';
    case 'string': return typeof value === 'string';
    case 'object': return !!value && typeof value === 'object' && !Array.isArray(value);
    case 'array': return Array.isArray(value);
    case 'tuple2': return Array.isArray(value) && value.length === 2 && value.every(v => typeof v === 'number' && Number.isFinite(v));
    default: return false;
  }
}

export type RegistryMode = 'cold' | 'patch';

/** 返回错误消息列表（不含错误码前缀）；空 = 通过。 */
export function validateAgainstRegistry(tree: unknown, mode: RegistryMode = 'cold'): string[] {
  const errors: string[] = [];
  if (!tree || typeof tree !== 'object' || Array.isArray(tree)) {
    errors.push('数值根须为对象');
    return errors;
  }
  const root = tree as Record<string, unknown>;

  if (mode === 'cold') {
    for (const { key, kind } of REQUIRED_TOP) {
      if (!(key in root)) { errors.push(`缺段：${key}`); continue; }
      if (!kindOk(root[key], kind)) errors.push(`段类型无效：${key} 须为 ${kind}`);
    }
    // 未知顶层键（拆文件/合并漂移）
    const allowed = new Set(REQUIRED_TOP.map(s => s.key));
    for (const key of Object.keys(root)) if (!allowed.has(key)) errors.push(`未知顶层段：${key}`);
  }

  for (const spec of FIELD_SPECS) {
    const value = atPath(tree, spec.path);
    if (value === undefined) {
      if (mode === 'cold' || spec.required) errors.push(`缺字段：${spec.path}`);
      continue;
    }
    if (!kindOk(value, spec.kind)) {
      errors.push(`字段类型无效：${spec.path} 须为 ${spec.kind}`);
      continue;
    }
    if (typeof value === 'number') {
      if (spec.min !== undefined && value < spec.min) errors.push(`字段范围无效：${spec.path} < ${spec.min}`);
      if (spec.max !== undefined && value > spec.max) errors.push(`字段范围无效：${spec.path} > ${spec.max}`);
    }
    if (spec.kind === 'array' && Array.isArray(value) && value.length === 0) errors.push(`字段范围无效：${spec.path} 不能为空数组`);
  }

  // 交叉：好感两端须覆盖档端
  const rangeMin = atPath(tree, 'affinity.range.min');
  const rangeMax = atPath(tree, 'affinity.range.max');
  const nemesis = atPath(tree, 'affinity.tiers.nemesis') as number[] | undefined;
  const sworn = atPath(tree, 'affinity.tiers.sworn') as number[] | undefined;
  if (typeof rangeMin === 'number' && typeof rangeMax === 'number') {
    if (!(rangeMin < rangeMax)) errors.push('affinity.range.min 须小于 max');
    if (Array.isArray(nemesis) && nemesis[0] !== rangeMin) errors.push('affinity.range.min 须等于 tiers.nemesis[0]');
    if (Array.isArray(sworn) && sworn[1] !== rangeMax) errors.push('affinity.range.max 须等于 tiers.sworn[1]');
  }

  return errors;
}

/** 合并三分包：键不得重叠。 */
export function mergeNumberPacks(...packs: Record<string, unknown>[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const pack of packs) {
    if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw new Error('数值分包须为对象');
    for (const [key, value] of Object.entries(pack)) {
      if (key in out) throw new Error(`数值分包键重叠：${key}`);
      out[key] = value;
    }
  }
  return out;
}
