/**
 * 自由行动票的配置读取：所有数值与白名单在 game-numbers.qingyu.json 的 freeAction 段，代码不写字面量。
 * 变体 = 类默认 ⊕ 变体行（浅合并，变体行优先）；代码只认类的路由家族（judge / table / none）与有限的 effect 种类，不认变体名。
 */
import { GAME_NUMBERS } from '../../sceneModule/numbers';
import type { JudgementKind } from '@/utils/judgementEngine';

export type ActionClass = 'physical' | 'verbal' | 'intimate' | 'give' | 'cast' | 'other';
export type Degree = 'light' | 'normal' | 'heavy';
export type Route = 'judge' | 'table' | 'none';
export type EffectKind = 'none' | 'practiceProgress' | 'applyStatus' | 'removeStatus' | 'transferItem' | 'itemDefined';
export const EFFECT_KINDS: readonly EffectKind[] = ['none', 'practiceProgress', 'applyStatus', 'removeStatus', 'transferItem', 'itemDefined'];
export const OUTCOMES = ['critical_failure', 'failure', 'partial', 'success', 'great_success', 'perfect'] as const;
export type Outcome = typeof OUTCOMES[number];
export type Stance = 'low' | 'mid' | 'high';

export interface VariantSpec {
  actionClass: ActionClass;
  variant: string;
  label: string;
  enabled: boolean;
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
  requires?: { actorLevel?: 'ge_target' };
  cost?: { resource: string; onResolveRatio: number; criticalFailureRatio: number };
  gain?: { base: number; perTransferCap: number; ceilingBelowNeed: number };
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
  affinity: { perBeatCap: number; majorAbs: number; majorSalienceFloor: number };
  degreeFactor: Record<Degree, number>;
  lethalAllowed: boolean;
  memory: { keep: number; chars: number; episodeKeep: number };
  /** 判定卡难度档的下界（难度值 < normal 为 easy）。 */
  judgement: { bands: { normal: number; hard: number; severe: number; extreme: number } };
  state: { logKeep: number; settledKeep: number; budgetKeep: number };
  outcomeFactors: Record<string, Record<Outcome, number>>;
  classes: Record<string, RawClass>;
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
  return { ...merged, actionClass, variant, enabled: merged.enabled !== false } as unknown as VariantSpec;
}

/** 提示词里的“类→变体”清单：只列启用的变体（other 类不列）。 */
export function enabledVariants(cfg: FreeActionConfig = freeActionConfig()): Array<{ actionClass: ActionClass; variant: string; label: string }> {
  return cfg.actionClasses.filter(cls => cls !== 'other').flatMap(cls =>
    Object.keys(cfg.classes[cls]?.variants || {})
      .map(variant => variantSpecOf(cls, variant, cfg)!)
      .filter(spec => spec.enabled)
      .map(spec => ({ actionClass: cls, variant: spec.variant, label: spec.label })));
}

/** 变体可能产出的 NPC 侧事实档 / 反应（用于校验每个结果都有文本）。 */
export function resultKeysOf(spec: VariantSpec, cfg: FreeActionConfig = freeActionConfig()): string[] {
  const keys = new Set<string>();
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
      if (spec.route === 'judge' && spec.enabled) {
        for (const key of ['kind', 'modifierProfile', 'difficulty', 'outcomeFactor'] as const) if (spec[key] === undefined) errors.push(`${where}: judge 缺 ${key}`);
        if (spec.base === undefined) errors.push(`${where}: judge 缺 base`);
        for (const outcome of OUTCOMES) if (spec.outcomeFactor && !Number.isFinite(spec.outcomeFactor[outcome])) errors.push(`${where}: outcomeFactor 缺 ${outcome}`);
        if (spec.actionClass !== 'cast' && spec.actionClass !== 'give') {
          for (const outcome of OUTCOMES) if (!spec.npcOutcomes?.[outcome]) errors.push(`${where}: npcOutcomes 缺 ${outcome}`);
        }
      }
      if (spec.route === 'table' && spec.enabled && actionNeedsMatrix(spec)) {
        for (const band of ['low', 'mid', 'high'] as const) for (const gate of ['open', 'closed'] as const) {
          const reaction = spec.matrix?.[band]?.[gate];
          if (!reaction || !intimacyConfig(cfg)?.reactions.includes(reaction)) errors.push(`${where}: matrix.${band}.${gate} 缺格或反应无效`);
        }
      }
      if (spec.needsItem && spec.actionClass === 'cast' && !spec.itemTag && !spec.itemTags?.length) errors.push(`${where}: needsItem 的施术变体缺 itemTag(s)`);
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
  if (cfg.affinity.perBeatCap !== GAME_NUMBERS.affinity.limits.perTurn) errors.push('affinity.perBeatCap 应与 affinity.limits.perTurn 同值');
  const attack = cfg.classes.physical?.variants?.attack;
  const physicalDifficulty = (cfg.classes.physical?.defaults as { difficulty?: number } | undefined)?.difficulty;
  if (attack && physicalDifficulty !== GAME_NUMBERS.combat.baselineDc) errors.push('physical 默认难度应与 combat.baselineDc 同值');
  return errors;
}

function actionNeedsMatrix(spec: VariantSpec): boolean {
  return spec.actionClass === 'intimate';
}
