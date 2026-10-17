/**
 * 自由行动票的配置读取：所有数值与白名单在 game-numbers.qingyu.json 的 freeAction 段，代码不写字面量。
 * 变体 = 类默认 ⊕ 变体行（浅合并，变体行优先）；代码只认类的路由家族（judge / table / none）与有限的 effect 种类，不认变体名。
 */
import { GAME_NUMBERS } from '../../sceneModule/numbers';
import type { JudgementKind } from '@/utils/judgementEngine';
import { catalogStatus } from '../../sceneModule/statuses';
import type { AftermathConfig, SelfBuffConfig } from './outcomeEffects';

export type ActionClass = 'physical' | 'verbal' | 'intimate' | 'give' | 'cast' | 'guard' | 'solo' | 'field' | 'other';
export type Degree = 'light' | 'normal' | 'heavy';
export type Route = 'judge' | 'table' | 'none';
// drainProgress 是单方面扣取对方修为进度的 effect，只在配置里启用的变体上生效，闸门要求对方设防失效（见 gates.ts / defenseDown.ts）。
// selfBuff 是判定有成效时给玩家自己挂一个限时增益（双修的阴阳调和），增益定义在变体行 buffRef 指向的配置段。
export type EffectKind = 'none' | 'practiceProgress' | 'drainProgress' | 'applyStatus' | 'removeStatus' | 'transferItem' | 'itemDefined' | 'selfBuff';
export const EFFECT_KINDS: readonly EffectKind[] = ['none', 'practiceProgress', 'drainProgress', 'applyStatus', 'removeStatus', 'transferItem', 'itemDefined', 'selfBuff'];
export const OUTCOMES = ['critical_failure', 'failure', 'partial', 'success', 'great_success', 'perfect'] as const;
export type Outcome = typeof OUTCOMES[number];
export type Stance = 'low' | 'mid' | 'high';

/** 目标“设防失效”的判据：身上有活着的状态记录，其 statusId 在名单里，或其效果种类在 effectKinds 里。 */
export interface DefenseDownRule { statusIds?: string[]; effectKinds?: string[] }
/**
 * drainProgress 的参数（全在配置里）：
 * lossRatio / perUseCapRatio 是占目标“下一级所需”的比例；outcomeFactor 是夺走量的结果档系数表（配置里写表名，variantSpecOf 解析成表）；
 * qiGainRatio 是玩家灵气回收占上限的比例；selfCostHpRatio 是每次施行先扣的玩家气血占上限的比例（气血不够不能施行）；diminish 按目标记次数递减（perUse^次数，下限 floor，每 recoverMinutes 恢复一次）；
 * afterStatuses / statusMinutes 是夺走量>0 时目标挂的状态与时长。
 */
export interface DrainSpec {
  lossRatio: number;
  perUseCapRatio: number;
  outcomeFactor: Record<Outcome, number>;
  qiGainRatio: number;
  selfCostHpRatio: number;
  diminish: { perUse: number; floor: number; recoverMinutes: number };
  afterStatuses: string[];
  statusMinutes: Record<string, number>;
}

export interface VariantSpec {
  actionClass: ActionClass;
  variant: string;
  label: string;
  /** 给模型的变体说明（进票提示词），不是代码拦截。 */
  hint?: string;
  enabled: boolean;
  /** 'none' = 无对象（自修、场面）：票的 targetId 为 null，不查名单与关系，不写好感与记忆；效果由判定引擎按 kind 在确认时落账。 */
  target?: 'none';
  /** 自修的调息疗伤、双修：判定卡放开旧引擎的“回气血/神识”结算（其余变体一律关）。 */
  applyRecovery?: boolean;
  /** selfBuff 用：增益定义所在的配置路径（freeAction 段下，如 dualCultivation.buff）。 */
  buffRef?: string;
  route: Route;
  effect: EffectKind;
  kind?: JudgementKind;
  modifierProfile?: string;
  difficulty?: number;
  /** 好感基础点（单位=好感点，负为敌意）。 */
  base?: number;
  /** feed_pill 毒性物品的好感基础点。 */
  toxicBase?: number;
  outcomeFactor?: Record<Outcome, number>;
  /** 判定结果 → NPC 侧事实档。 */
  npcOutcomes?: Record<Outcome, string>;
  /** 目标受保护（总表标了必须活着）时的事实档封顶（档 → 降成的档）。 */
  protectedCap?: Record<string, string>;
  matrix?: Record<Stance, { open: string; closed: string }>;
  needsGoodwill?: boolean | 'byItemTag';
  needsItem?: boolean;
  itemTag?: string;
  itemTags?: string[];
  consume?: number;
  denyEquipped?: boolean;
  denyStoryItem?: boolean;
  /**
   * onLevelUnknown：目标级数查不到时 deny（拒绝）/ assume_equal（按与施术者同级放行，只看好感；没处落地由后面的预算检查兜底）。
   * minGoodwill：目标好感（-100~100）低于它就不肯接受，与 needsGoodwill 的“低姿态”检查并存；配置里可写数，也可写 "freeAction.xxx" 这样的数值引用（variantSpecOf 解析成数）。
   * realmMoves：自修用——按旧引擎同一套修炼结算（trainingRealm）试算，境界进度没有变化（时机未到、已满）就不出判定卡。
   */
  requires?: { actorLevel?: 'ge_target'; onLevelUnknown?: 'deny' | 'assume_equal'; minGoodwill?: number; targetDefenseDown?: DefenseDownRule; realmMoves?: boolean };
  /** 玩家原话含其中任一词（且在自由行动范围内）= 这句归本变体的票据与结算，不再回落旧关键词判定。 */
  legacyGuardWords?: string[];
  cost?: { resource: string; onResolveRatio: number; criticalFailureRatio: number };
  gain?: { base: number; perTransferCap: number; ceilingBelowNeed: number };
  drain?: DrainSpec;
  cooldownMinutes?: number;
  phaseBudgetRatio?: number;
  maxStatusMinutes?: number;
  backlash?: Partial<Record<'failure' | 'critical_failure', string>>;
  downgrade?: Record<string, string>;
  statusId?: string;
  protectedForbid?: boolean;
}

interface RawClass {
  label: string;
  /** 界面持久回执的归类：given = 这类票结算成功时给一条“已给出”回执。 */
  receipt?: 'given';
  defaults?: Record<string, unknown>;
  intimacy?: IntimacyConfig;
  variants: Record<string, Record<string, unknown>>;
}
export interface IntimacyConfig {
  defaultGateTier: string;
  defaultTemperament: string;
  reactions: string[];
  temperamentRemap: Record<string, Record<string, string>>;
  reactionEffect: Record<string, { delta: number }>;
}
export interface FreeActionConfig {
  enabled: boolean;
  actionClasses: ActionClass[];
  degrees: Degree[];
  performed: string[];
  ticket: { maxPerTurn: number; evidenceChars: number; rosterMax: number; itemListMax: number };
  /**
   * floatBand：票上的好感浮动位只能在“代码基础值 ± floatBand”内生效。
   * repeat：同一目标同一行动类的正向好感按次数递减——factors[n] 是窗口内第 n+1 次的系数（超出表长取最后一项），windowMinutes 从窗口内第一次起算，窗口外重算；敌意不递减。
   */
  affinity: { perBeatCap: number; majorAbs: number; majorSalienceFloor: number; floatBand: number; repeat: { windowMinutes: number; factors: number[] } };
  degreeFactor: Record<Degree, number>;
  lethalAllowed: boolean;
  memory: { keep: number; chars: number; episodeKeep: number };
  /** 判定卡难度档的下界（难度值 < normal 为 easy）。 */
  judgement: { bands: { normal: number; hard: number; severe: number; extreme: number } };
  state: { logKeep: number; settledKeep: number; budgetKeep: number };
  /** 调试通道（默认全关）：playerTextLog = 本地记录没出票的玩家原文；keep = 内存环形条数；textChars = 原文截取字数。 */
  debug: { playerTextLog: boolean; keep: number; textChars: number };
  /** 发给叙事的背包事实：inventoryListMax = 列出的物品种数上限。 */
  narration: { inventoryListMax: number };
  outcomeFactors: Record<string, Record<Outcome, number>>;
  classes: Record<string, RawClass>;
  /** 双修：好感门槛（intimate.dual_cultivate 的 requires.minGoodwill 引用它；旧关键词判定的阴阳调和也读它）与专属收益（阴阳调和）的定义。 */
  dualCultivation: { requires: { minGoodwill: number }; buff: SelfBuffConfig };
  /** 判定非成功档的余波：combat 类扣气血、行动门控；见 outcomeEffects.ts。 */
  aftermath: AftermathConfig;
  /**
   * 判定卡的技能/天赋因子：玩家已学的正典技能、身上的天赋，其名称与描述含该行动类（键取 类.变体 / 类 / 判定 kind，先中先用）标签词时给加成，
   * 否则只在卡上提示未掌握、无加成。skillBonus 可写数值引用；unavailableMarks 出现在技能描述里表示该技能眼下不能用。
   */
  skillMatch: { skillBonus: number | string; talentBonus: number; maxSkill: number; maxTalent: number; unavailableMarks: string[]; tags: Record<string, string[]> };
}

export const freeActionConfig = (): FreeActionConfig => GAME_NUMBERS.freeAction as unknown as FreeActionConfig;

/** "training.successProgress" 这类对已有数值键的引用；数字原样返回。 */
export function resolveNumberRef(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  let node: unknown = GAME_NUMBERS;
  for (const part of value.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
  return typeof node === 'number' ? node : NaN;
}

export function intimacyConfig(cfg: FreeActionConfig = freeActionConfig()): IntimacyConfig | undefined {
  return cfg.classes.intimate?.intimacy;
}

/** 类默认 ⊕ 变体行，并把 outcomeFactor / gain 里的引用解析成数。不存在的类或变体返回 undefined。 */
export function variantSpecOf(actionClass: string, variant: string, cfg: FreeActionConfig = freeActionConfig()): VariantSpec | undefined {
  const cls = cfg.classes[actionClass];
  const row = cls?.variants?.[variant];
  if (!cls || !row) return undefined;
  const merged: Record<string, unknown> = { ...(cls.defaults || {}), ...row };
  const factor = merged.outcomeFactor;
  if (typeof factor === 'string') merged.outcomeFactor = cfg.outcomeFactors[factor];
  const gain = merged.gain as Record<string, unknown> | undefined;
  if (gain) merged.gain = { base: resolveNumberRef(gain.base), perTransferCap: resolveNumberRef(gain.perTransferCap), ceilingBelowNeed: resolveNumberRef(gain.ceilingBelowNeed) };
  const drain = merged.drain as Record<string, unknown> | undefined;
  if (drain && typeof drain.outcomeFactor === 'string') merged.drain = { ...drain, outcomeFactor: cfg.outcomeFactors[drain.outcomeFactor] };
  const requires = merged.requires as Record<string, unknown> | undefined;
  if (requires && typeof requires.minGoodwill === 'string') merged.requires = { ...requires, minGoodwill: resolveNumberRef(requires.minGoodwill) };
  return { ...merged, actionClass, variant, enabled: merged.enabled !== false } as unknown as VariantSpec;
}

/** selfBuff 变体的增益定义：buffRef 是 freeAction 段下的路径；找不到（体检会报错）时抛错。 */
export function selfBuffOf(spec: VariantSpec, cfg: FreeActionConfig = freeActionConfig()): SelfBuffConfig {
  let node: unknown = cfg;
  for (const part of (spec.buffRef ?? '').split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
  if (!node || typeof node !== 'object') throw new Error(`${spec.actionClass}.${spec.variant}: buffRef ${String(spec.buffRef)} 找不到`);
  return node as SelfBuffConfig;
}

/** 提示词里的“类→变体”清单：只列启用的变体（other 类不列）。 */
export function enabledVariants(cfg: FreeActionConfig = freeActionConfig()): Array<{ actionClass: ActionClass; variant: string; label: string; needsItem: boolean; hint?: string }> {
  return cfg.actionClasses.filter(cls => cls !== 'other').flatMap(cls =>
    Object.keys(cfg.classes[cls]?.variants || {})
      .map(variant => variantSpecOf(cls, variant, cfg)!)
      .filter(spec => spec.enabled)
      .map(spec => ({ actionClass: cls, variant: spec.variant, label: spec.label, needsItem: spec.needsItem === true, ...(spec.hint ? { hint: spec.hint } : {}) })));
}

/** 变体可能产出的 NPC 侧事实档 / 反应（用于校验每个结果都有文本）。 */
export function resultKeysOf(spec: VariantSpec, cfg: FreeActionConfig = freeActionConfig()): string[] {
  const keys = new Set<string>();
  if (spec.target === 'none') OUTCOMES.forEach(outcome => keys.add(outcome)); // 无对象：事实文本直接按结果档取
  Object.values(spec.npcOutcomes || {}).forEach(key => keys.add(key));
  Object.values(spec.protectedCap || {}).forEach(key => keys.add(key));
  if (spec.matrix) {
    const remap = intimacyConfig(cfg)?.temperamentRemap || {};
    for (const band of Object.values(spec.matrix)) for (const reaction of [band.open, band.closed]) {
      keys.add(reaction);
      for (const map of Object.values(remap)) if (map[reaction]) keys.add(map[reaction]);
    }
  }
  return [...keys];
}

/** 配置体检：返回错误列表（空 = 通过）。事实/记忆文本是否齐全见 facts.ts 的 validateFreeActionTexts。 */
export function validateFreeActionConfig(cfg: FreeActionConfig = freeActionConfig()): string[] {
  const errors: string[] = [];
  const known = new Set<string>(cfg.actionClasses);
  for (const cls of Object.keys(cfg.classes)) if (!known.has(cls as ActionClass)) errors.push(`类 ${cls} 不在 actionClasses 里`);
  for (const cls of cfg.actionClasses) if (!cfg.classes[cls]) errors.push(`actionClasses 里的 ${cls} 没有配置`);
  for (const cls of cfg.actionClasses) {
    for (const variant of Object.keys(cfg.classes[cls]?.variants || {})) {
      const spec = variantSpecOf(cls, variant, cfg)!;
      const where = `${cls}.${variant}`;
      if (!spec.label) errors.push(`${where}: 缺 label`);
      if (!['judge', 'table', 'none'].includes(spec.route)) errors.push(`${where}: route 无效`);
      if (!EFFECT_KINDS.includes(spec.effect ?? 'none')) errors.push(`${where}: effect ${String(spec.effect)} 不在代码认得的种类内`);
      // 无对象的类不论开关都体检：免得开关一开才发现配置残缺。
      if (spec.target !== undefined && spec.target !== 'none') errors.push(`${where}: target 只能是 none`);
      if (spec.target === 'none') {
        if (spec.route !== 'judge') errors.push(`${where}: 无对象的变体只能走 judge`);
        if (spec.needsItem || spec.needsGoodwill || spec.cost || spec.drain || spec.requires?.targetDefenseDown) errors.push(`${where}: 无对象的变体不能带物品、好感、代价、夺取参数`);
      }
      if (spec.route === 'judge' && (spec.enabled || spec.target === 'none')) {
        const targetless = spec.target === 'none';
        for (const key of targetless ? ['kind', 'modifierProfile', 'difficulty'] as const : ['kind', 'modifierProfile', 'difficulty', 'outcomeFactor'] as const) if (spec[key] === undefined) errors.push(`${where}: judge 缺 ${key}`);
        if (spec.base === undefined && !targetless) errors.push(`${where}: judge 缺 base`);
        for (const outcome of OUTCOMES) if (spec.outcomeFactor && !Number.isFinite(spec.outcomeFactor[outcome])) errors.push(`${where}: outcomeFactor 缺 ${outcome}`);
        if (spec.actionClass !== 'cast' && spec.actionClass !== 'give' && !targetless) {
          for (const outcome of OUTCOMES) if (!spec.npcOutcomes?.[outcome]) errors.push(`${where}: npcOutcomes 缺 ${outcome}`);
        }
      }
      if (spec.route === 'table' && spec.enabled && actionNeedsMatrix(spec)) {
        for (const band of ['low', 'mid', 'high'] as const) for (const gate of ['open', 'closed'] as const) {
          const reaction = spec.matrix?.[band]?.[gate];
          if (!reaction || !intimacyConfig(cfg)?.reactions.includes(reaction)) errors.push(`${where}: matrix.${band}.${gate} 缺格或反应无效`);
        }
      }
      if (spec.effect === 'selfBuff') {
        try {
          const buff = selfBuffOf(spec, cfg);
          if (!buff.name || !buff.descKey || !Object.keys(buff.minutesByOutcome || {}).length || !Object.values(buff.minutesByOutcome).every(minutes => Number(minutes) > 0)) errors.push(`${where}: buffRef 的增益缺 name / descKey / 各档时长`);
        } catch (error) { errors.push((error as Error).message); }
      }
      if (spec.effect === 'applyStatus' && spec.enabled) {
        if (!spec.statusId || !catalogStatus(spec.statusId)) errors.push(`${where}: applyStatus 的 statusId 不在状态目录里`);
        if (!(Number(spec.maxStatusMinutes) > 0)) errors.push(`${where}: applyStatus 缺 maxStatusMinutes`);
      }
      if (spec.requires?.onLevelUnknown !== undefined && !['deny', 'assume_equal'].includes(spec.requires.onLevelUnknown)) errors.push(`${where}: requires.onLevelUnknown 无效`);
      if (spec.requires?.minGoodwill !== undefined && !(Number.isFinite(spec.requires.minGoodwill) && spec.requires.minGoodwill >= -100 && spec.requires.minGoodwill <= 100)) errors.push(`${where}: requires.minGoodwill 须为 -100~100 的数`);
      if (spec.legacyGuardWords !== undefined && (!Array.isArray(spec.legacyGuardWords) || spec.legacyGuardWords.some(word => typeof word !== 'string' || !word.trim()))) errors.push(`${where}: legacyGuardWords 须为非空字符串数组`);
      if (spec.needsItem && spec.actionClass === 'cast' && !spec.itemTag && !spec.itemTags?.length) errors.push(`${where}: needsItem 的施术变体缺 itemTag(s)`);
      if (spec.effect === 'drainProgress') errors.push(...validateDrain(spec, where));
      if (spec.gain) for (const key of ['base', 'perTransferCap', 'ceilingBelowNeed'] as const) if (!Number.isFinite(spec.gain[key])) errors.push(`${where}: gain.${key} 引用无法解析`);
    }
  }
  const intimacy = intimacyConfig(cfg);
  if (intimacy) {
    for (const reaction of intimacy.reactions) if (!Number.isFinite(intimacy.reactionEffect[reaction]?.delta)) errors.push(`intimacy.reactionEffect 缺 ${reaction}`);
    for (const [temperament, map] of Object.entries(intimacy.temperamentRemap)) for (const [from, to] of Object.entries(map)) {
      if (!intimacy.reactions.includes(from) || !intimacy.reactions.includes(to)) errors.push(`intimacy.temperamentRemap.${temperament} 引用了未知反应 ${from}→${to}`);
    }
  }
  if (!(cfg.debug?.keep > 0) || !(cfg.debug?.textChars > 0) || typeof cfg.debug?.playerTextLog !== 'boolean') errors.push('debug 配置无效');
  if (!(cfg.narration?.inventoryListMax > 0)) errors.push('narration.inventoryListMax 无效');
  const { floatBand, repeat } = cfg.affinity;
  if (!(Number.isFinite(floatBand) && floatBand >= 0)) errors.push('affinity.floatBand 须为非负数');
  if (!(Number.isFinite(repeat?.windowMinutes) && repeat.windowMinutes > 0)) errors.push('affinity.repeat.windowMinutes 须为正数');
  if (!Array.isArray(repeat?.factors) || !repeat.factors.length || repeat.factors.some(factor => !(Number.isFinite(factor) && factor >= 0 && factor <= 1))) errors.push('affinity.repeat.factors 须为非空的 0~1 数组');
  if (cfg.affinity.perBeatCap !== GAME_NUMBERS.affinity.limits.perTurn) errors.push('affinity.perBeatCap 应与 affinity.limits.perTurn 同值');
  const hpLoss = cfg.aftermath?.hpLoss, gate = cfg.aftermath?.gate;
  if (!hpLoss || !(hpLoss.minLoss >= 0) || !(hpLoss.keepHp >= 0) || !Object.values(hpLoss.ratio || {}).every(ratio => ratio >= 0 && ratio <= 1)) errors.push('aftermath.hpLoss 配置无效');
  if (!gate || !(gate.ttlTurns > 0) || !(gate.labelChars > 0) || !gate.defaultScope || !Object.keys(gate.outcomeByResult || {}).length) errors.push('aftermath.gate 配置无效');
  const match = cfg.skillMatch;
  if (!match || !Number.isFinite(resolveNumberRef(match.skillBonus)) || !Number.isFinite(match.talentBonus) || !(match.maxSkill >= 0) || !(match.maxTalent >= 0) || !Object.values(match.tags || {}).every(words => Array.isArray(words) && words.length && words.every(word => typeof word === 'string' && word)) || !Array.isArray(match.unavailableMarks)) errors.push('skillMatch 配置无效');
  const dualMin = cfg.dualCultivation?.requires?.minGoodwill;
  if (!(Number.isFinite(dualMin) && dualMin >= -100 && dualMin <= 100)) errors.push('dualCultivation.requires.minGoodwill 须为 -100~100 的数');
  const attack = cfg.classes.physical?.variants?.attack;
  const physicalDifficulty = (cfg.classes.physical?.defaults as { difficulty?: number } | undefined)?.difficulty;
  if (attack && physicalDifficulty !== GAME_NUMBERS.combat.baselineDc) errors.push('physical 默认难度应与 combat.baselineDc 同值');
  return errors;
}

/** drainProgress 变体的参数体检（不论是否启用都查，免得开关一开才发现配置残缺）。 */
function validateDrain(spec: VariantSpec, where: string): string[] {
  const errors: string[] = [], drain = spec.drain, finite = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value);
  if (!drain) return [`${where}: drainProgress 缺 drain`];
  if (!(finite(drain.lossRatio) && drain.lossRatio > 0)) errors.push(`${where}: drain.lossRatio 须为正数`);
  if (!(finite(drain.perUseCapRatio) && drain.perUseCapRatio > 0)) errors.push(`${where}: drain.perUseCapRatio 须为正数`);
  if (!(finite(drain.qiGainRatio) && drain.qiGainRatio >= 0)) errors.push(`${where}: drain.qiGainRatio 须为非负数`);
  if (!(finite(drain.selfCostHpRatio) && drain.selfCostHpRatio >= 0 && drain.selfCostHpRatio < 1)) errors.push(`${where}: drain.selfCostHpRatio 须在 [0,1)`);
  for (const outcome of OUTCOMES) if (!finite(drain.outcomeFactor?.[outcome])) errors.push(`${where}: drain.outcomeFactor 缺 ${outcome}`);
  const { perUse, floor, recoverMinutes } = drain.diminish || ({} as Partial<DrainSpec['diminish']>);
  if (!(finite(perUse) && perUse! > 0 && perUse! <= 1)) errors.push(`${where}: drain.diminish.perUse 须在 (0,1]`);
  if (!(finite(floor) && floor! >= 0 && floor! <= 1)) errors.push(`${where}: drain.diminish.floor 须在 [0,1]`);
  if (!(finite(recoverMinutes) && recoverMinutes! > 0)) errors.push(`${where}: drain.diminish.recoverMinutes 须为正数`);
  for (const id of drain.afterStatuses || []) {
    if (!catalogStatus(id)) errors.push(`${where}: drain.afterStatuses 的 ${id} 不在状态目录里`);
    if (!(drain.statusMinutes?.[id] > 0)) errors.push(`${where}: drain.statusMinutes 缺 ${id} 的时长`);
  }
  for (const id of Object.values(spec.backlash || {})) if (!catalogStatus(id)) errors.push(`${where}: backlash 的 ${id} 不在状态目录里`);
  const down = spec.requires?.targetDefenseDown;
  if (!down || !(down.statusIds?.length || down.effectKinds?.length)) errors.push(`${where}: drainProgress 缺 requires.targetDefenseDown（statusIds / effectKinds 至少一项）`);
  for (const id of down?.statusIds || []) if (!catalogStatus(id)) errors.push(`${where}: targetDefenseDown.statusIds 的 ${id} 不在状态目录里`);
  return errors;
}

function actionNeedsMatrix(spec: VariantSpec): boolean {
  return spec.actionClass === 'intimate';
}
