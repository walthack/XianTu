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
  /** 字符串枚举：取值只能是其中之一 */
  oneOf?: readonly string[];
  section: NumbersSection;
}

/** 三分包顶层段归属（与 mod-kit/numbers-*.json 一致）。 */
export const SECTION_KEYS: Record<NumbersSection, readonly string[]> = {
  combat: ['combat', 'difficulty', 'judgement', 'factors', 'weights', 'goalModifiers', 'sceneDefaults', 'historicalPrototype'],
  progress: ['levels', 'training', 'techniques', 'status', 'currency', 'freeAction', 'affinity', 'reputation', 'lineBonds', 'npcCard', 'story', 'shop', 'crafting'],
  runtime: ['version', 'tuning', 'diagnostics', 'saves', 'aiRetry', 'feedback', 'e2eSmoke', 'perf', 'ui'],
  assist: ['assist'],
};

/** 31 个顶层键：version 为 int，其余为必填 object。 */
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
  { key: 'ui', kind: 'object', section: 'runtime' },
];

/** 7 条并行国家线 id（身份账设计稿 2026-10-25 §10 Q2；均在实体索引 kind=line，nanhuang/qin 登记于 entity-catalog/lines.json）。其中哪些判档读配置 story.lineOutcome.judgedLines，这里不写。 */
export const NATION_LINE_IDS: readonly string[] = ['nanhuang', 'jin', 'song', 'han', 'tang', 'qin', 'taiquan'];

/** story.lineUnlock.<lineId> 每线允许的键（太泉解锁设计稿 2026-10-27 §2；不设 enforce 开关，总策划 2026-10-27 定）。 */
export const LINE_UNLOCK_KEYS: readonly string[] = ['note', 'minRealmLevel', 'minClosedLines', 'countTiers', 'requireDeadlinesCleared'];

/** 高频叶子：挡住缺字段 / 类型 / 粗范围；其余叶子仍靠补丁 typeof 对齐默认。 */
export const FIELD_SPECS: readonly FieldSpec[] = [
  { path: 'story.trades', kind: 'array', required: true, section: 'progress' },
  { path: 'shop.sites', kind: 'object', required: true, section: 'progress' },
  { path: 'story.stepScene.minutesPerBeat', kind: 'int', required: true, min: 0, section: 'progress' },
  { path: 'story.lineOutcome.tiers', kind: 'array', required: true, section: 'progress' },
  { path: 'story.lineOutcome.writeOnce', kind: 'bool', required: true, section: 'progress' },
  { path: 'story.lineOutcome.judgedLines', kind: 'array', required: true, section: 'progress' },
  { path: 'story.lineOutcome.failEndsGame', kind: 'object', required: true, section: 'progress' },
  { path: 'story.lineUnlock.taiquan.minRealmLevel', kind: 'int', required: true, min: 0, section: 'progress' },
  { path: 'story.lineUnlock.taiquan.minClosedLines', kind: 'int', required: true, min: 0, section: 'progress' },
  { path: 'story.lineUnlock.taiquan.countTiers', kind: 'array', required: true, section: 'progress' },
  { path: 'story.identity.kinds', kind: 'array', required: true, section: 'progress' },
  { path: 'story.identity.prompt.maxItems', kind: 'int', required: true, min: 1, section: 'progress' },
  { path: 'story.itemProvenance.dedupeBy', kind: 'string', required: true, oneOf: ['everObtained', 'currentlyHeld'], section: 'progress' },
  { path: 'story.progressDeadline.limits', kind: 'object', required: true, section: 'progress' },
  { path: 'lineBonds.majorResponse.delta', kind: 'number', required: true, min: 0, section: 'progress' },
  { path: 'lineBonds.majorResponse.salienceFloor', kind: 'number', required: true, min: 0, section: 'progress' },
  { path: 'lineBonds.majorResponse.memoryKeep', kind: 'int', required: true, min: 1, section: 'progress' },
  { path: 'judgement.dice.sides', kind: 'int', required: true, min: 2, section: 'combat' },
  { path: 'combat.baselineDc', kind: 'number', required: true, section: 'combat' },
  { path: 'tuning.timeoutMs', kind: 'int', required: true, min: 1, section: 'runtime' },
  { path: 'ui.rightSidebar.showSecondaryLines', kind: 'bool', required: true, section: 'runtime' },
  { path: 'ui.rightSidebar.showLineCompass', kind: 'bool', required: true, section: 'runtime' },
  { path: 'story.lineCompass.regionLines', kind: 'object', required: true, section: 'progress' },
  { path: 'story.lineCompass.hint.maxChars', kind: 'int', required: true, min: 1, section: 'progress' },
  { path: 'story.lineCompass.hint.bannedWords', kind: 'array', required: true, section: 'progress' },
  { path: 'story.lineCompass.anyLineClosed.lineIds', kind: 'array', required: true, section: 'progress' },
  { path: 'diagnostics.debug.categories', kind: 'object', required: true, section: 'runtime' },
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
    if (spec.oneOf && typeof value === 'string' && !spec.oneOf.includes(value)) errors.push(`字段范围无效：${spec.path} 须为 ${spec.oneOf.join('/')} 之一：${value}`);
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

  // 交叉：判档线须为不重复的国家线 id；失败是否结束游戏须逐线配置，键正好是判档线，值为 bool
  const judgedLines = atPath(tree, 'story.lineOutcome.judgedLines');
  const judged = Array.isArray(judgedLines) ? judgedLines : [];
  judged.forEach((lineId, i) => {
    if (typeof lineId !== 'string' || !NATION_LINE_IDS.includes(lineId)) errors.push(`未知国家线：story.lineOutcome.judgedLines[${i}]=${String(lineId)}`);
    else if (judged.indexOf(lineId) !== i) errors.push(`判档线重复：story.lineOutcome.judgedLines[${i}]=${lineId}`);
  });
  const failEndsGame = atPath(tree, 'story.lineOutcome.failEndsGame');
  if (kindOk(failEndsGame, 'object') && Array.isArray(judgedLines)) {
    const table = failEndsGame as Record<string, unknown>;
    for (const lineId of judged) if (typeof lineId === 'string' && !(lineId in table)) errors.push(`缺字段：story.lineOutcome.failEndsGame.${lineId}`);
    for (const [lineId, value] of Object.entries(table)) {
      if (!judged.includes(lineId)) errors.push(`非判档线：story.lineOutcome.failEndsGame.${lineId}（不在 story.lineOutcome.judgedLines）`);
      else if (typeof value !== 'boolean') errors.push(`字段类型无效：story.lineOutcome.failEndsGame.${lineId} 须为 bool`);
    }
  }

  // 交叉：整线解锁（太泉解锁设计稿 2026-10-27 §2）。键须为国家线（另可有 note）；每线只许 LINE_UNLOCK_KEYS；
  // minRealmLevel ≤ levels.max、minClosedLines ≤ 判档线条数（否则门永远打不开）、countTiers ⊆ lineOutcome.tiers 不重复；
  // requireDeadlinesCleared 空数组合法（＝不读期限），故不进 FIELD_SPECS（array 一律禁空），在这里校验；期限 id 与规则表的交叉核对不在这里
  const lineUnlock = atPath(tree, 'story.lineUnlock');
  if (lineUnlock !== undefined && !kindOk(lineUnlock, 'object')) errors.push('字段类型无效：story.lineUnlock 须为 object');
  else if (lineUnlock !== undefined) {
    const levelMax = atPath(tree, 'levels.max');
    const tiers = atPath(tree, 'story.lineOutcome.tiers');
    const specified = new Set(FIELD_SPECS.map(s => s.path));
    for (const [lineId, conf] of Object.entries(lineUnlock as Record<string, unknown>)) {
      const at = `story.lineUnlock.${lineId}`;
      if (lineId === 'note') { if (typeof conf !== 'string') errors.push(`字段类型无效：${at} 须为 string`); continue; }
      if (!NATION_LINE_IDS.includes(lineId)) { errors.push(`未知国家线：${at}`); continue; }
      if (!kindOk(conf, 'object')) { errors.push(`字段类型无效：${at} 须为 object`); continue; }
      const table = conf as Record<string, unknown>;
      for (const key of Object.keys(table)) if (!LINE_UNLOCK_KEYS.includes(key)) errors.push(`未知字段：${at}.${key}（只有 ${LINE_UNLOCK_KEYS.join(' / ')}）`);
      if ('note' in table && typeof table.note !== 'string') errors.push(`字段类型无效：${at}.note 须为 string`);
      // 已在 FIELD_SPECS 的（taiquan）不重复报形状；其余线在这里补形状
      for (const [key, kind] of [['minRealmLevel', 'int'], ['minClosedLines', 'int'], ['countTiers', 'array']] as const) {
        if (specified.has(`${at}.${key}`)) continue;
        const value = table[key];
        if (value === undefined) errors.push(`缺字段：${at}.${key}`);
        else if (!kindOk(value, kind)) errors.push(`字段类型无效：${at}.${key} 须为 ${kind}`);
        else if (kind === 'int' && (value as number) < 0) errors.push(`字段范围无效：${at}.${key} < 0`);
        else if (kind === 'array' && (value as unknown[]).length === 0) errors.push(`字段范围无效：${at}.${key} 不能为空数组`);
      }
      const { minRealmLevel, minClosedLines, countTiers, requireDeadlinesCleared } = table;
      if (kindOk(minRealmLevel, 'int') && typeof levelMax === 'number' && (minRealmLevel as number) > levelMax) errors.push(`字段范围无效：${at}.minRealmLevel > levels.max（${levelMax}）`);
      if (kindOk(minClosedLines, 'int') && (minClosedLines as number) > judged.length) errors.push(`字段范围无效：${at}.minClosedLines > story.lineOutcome.judgedLines 条数（${judged.length}），门永远打不开`);
      if (Array.isArray(countTiers)) countTiers.forEach((tier, i) => {
        if (!Array.isArray(tiers) || !tiers.includes(tier)) errors.push(`字段范围无效：${at}.countTiers[${i}]=${String(tier)} 不在 story.lineOutcome.tiers`);
        else if (countTiers.indexOf(tier) !== i) errors.push(`档位重复：${at}.countTiers[${i}]=${String(tier)}`);
      });
      if (requireDeadlinesCleared === undefined) errors.push(`缺字段：${at}.requireDeadlinesCleared`);
      else if (!Array.isArray(requireDeadlinesCleared)) errors.push(`字段类型无效：${at}.requireDeadlinesCleared 须为 array`);
      else requireDeadlinesCleared.forEach((id, i) => {
        if (typeof id !== 'string' || !id) errors.push(`字段类型无效：${at}.requireDeadlinesCleared[${i}] 须为非空字符串`);
        else if (requireDeadlinesCleared.indexOf(id) !== i) errors.push(`期限重复：${at}.requireDeadlinesCleared[${i}]=${id}`);
      });
    }
  }

  // 交叉：当前线卡地区映射（右栏线入口复用分析 2026-10-27 §5.1）。值须为国家线 id；定性词须为非空字符串
  const regionLines = atPath(tree, 'story.lineCompass.regionLines');
  if (kindOk(regionLines, 'object')) {
    for (const [region, lineId] of Object.entries(regionLines as Record<string, unknown>)) {
      if (typeof lineId !== 'string' || !NATION_LINE_IDS.includes(lineId)) errors.push(`未知国家线：story.lineCompass.regionLines.${region}=${String(lineId)}`);
    }
  }
  // compass.anyLineClosed 计入的线（R-3）：须为国家线、不得重复；太泉、秦不计入
  const anyClosedLines = atPath(tree, 'story.lineCompass.anyLineClosed.lineIds');
  if (Array.isArray(anyClosedLines)) anyClosedLines.forEach((lineId, i) => {
    if (typeof lineId !== 'string' || !NATION_LINE_IDS.includes(lineId) || lineId === 'qin' || lineId === 'taiquan' || anyClosedLines.indexOf(lineId) !== i) errors.push(`字段值无效：story.lineCompass.anyLineClosed.lineIds[${i}]=${String(lineId)}（须为国家线 id、不重复，太泉／秦不计入）`);
  });
  const bannedWords = atPath(tree, 'story.lineCompass.hint.bannedWords');
  if (Array.isArray(bannedWords)) bannedWords.forEach((word, i) => {
    if (typeof word !== 'string' || !word.trim()) errors.push(`字段类型无效：story.lineCompass.hint.bannedWords[${i}] 须为非空字符串`);
  });

  // 形状：进度期限每项 { due:int≥1, urgentAt:int, 0≤urgentAt<due }（键集合与规则表的交叉核对在 validatePlayerLedgerRules）
  const deadlineLimits = atPath(tree, 'story.progressDeadline.limits');
  if (kindOk(deadlineLimits, 'object')) {
    for (const [id, limit] of Object.entries(deadlineLimits as Record<string, unknown>)) {
      const at = `story.progressDeadline.limits.${id}`;
      if (!kindOk(limit, 'object')) { errors.push(`字段类型无效：${at} 须为 object`); continue; }
      const { due, urgentAt, ...extra } = limit as Record<string, unknown>;
      for (const key of Object.keys(extra)) errors.push(`未知字段：${at}.${key}（只有 due / urgentAt）`);
      if (!kindOk(due, 'int')) errors.push(`字段类型无效：${at}.due 须为 int`);
      else if ((due as number) < 1) errors.push(`字段范围无效：${at}.due < 1`);
      if (!kindOk(urgentAt, 'int')) errors.push(`字段类型无效：${at}.urgentAt 须为 int`);
      else if ((urgentAt as number) < 0) errors.push(`字段范围无效：${at}.urgentAt < 0`);
      else if (kindOk(due, 'int') && (urgentAt as number) >= (due as number)) errors.push(`字段范围无效：${at}.urgentAt 须小于 due`);
    }
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
