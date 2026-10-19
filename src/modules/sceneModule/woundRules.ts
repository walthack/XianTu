// 敌方出手的通用挂伤结算：数值、几率、挂哪一级、连续几次重击升级、战后是否清轻伤，全部读 GAME_NUMBERS.combat.woundRules；
// 合同只在 enemyActions[].woundRule 写配置项名（或 {profile, 覆盖字段}）。代码不认任何具体状态 id。
import { GAME_NUMBERS, registerNumbersValidator } from './numbers';
import { peekDefenseDie } from './dice';
import { applyStatus, resolveStatusDef, type StatusEvent } from './statuses';
import { resolveCheck, type ResolvedSettings } from './tiers';
import type { Contract, EnemyActionDef, SceneContext, SceneState, WoundRuleRef } from './types';

/** 敌方这一下的结果档：great_success=重击，success=打中，failure=被挡住，critical_failure=被大挡。 */
export type WoundTier = 'great_success' | 'success' | 'failure' | 'critical_failure';
export const WOUND_TIERS: readonly WoundTier[] = ['great_success', 'success', 'failure', 'critical_failure'];
export interface WoundTierRule { chance: number; status: string; hpLossRatio: number }
/** 档从哪里来：defenseCheck＝把被打的人这次防御当成一次普通四档检定（与玩家行动同一套：sceneDefaults.tiers 的大成功/大失败差值、自然 1/20 规则），防御大失败＝敌方大成功（重击）。 */
export type WoundTierSource = 'defenseCheck';
export const WOUND_TIER_SOURCES: readonly WoundTierSource[] = ['defenseCheck'];
export interface WoundProfile {
  tierFrom: WoundTierSource;
  tiers: Record<WoundTier, WoundTierRule>;
  /** perBeat=true：一拍里同一人被重击几次都只算一次（不会一拍连挂两级），连续指相邻两拍都被重击。 */
  streak: { count: number; status: string; perBeat: boolean };
}
export interface WoundRulesConfig {
  profiles: Record<string, WoundProfile>;
  /** 回执里给敌方这一下的档加的字样（空串＝不标）。 */
  labels: Record<WoundTier, string>;
  hp: { keepHp: number };
  afterWin: { clearLight: boolean; statuses: string[]; sides: string[] };
}

const woundError = (message: string): Error => Object.assign(Error(`[LCQ-NUM-009] ${message}`), { code: 'LCQ-NUM-009' });
export const woundRulesConfig = (): WoundRulesConfig => (GAME_NUMBERS.combat as unknown as { woundRules: WoundRulesConfig }).woundRules;

/** 合同引用 → 完整规则：配置项为底，合同覆盖值逐字段盖上去。引用了不存在的配置项直接报错（不静默当成不挂伤）。 */
export function resolveWoundProfile(ref: WoundRuleRef, cfg: WoundRulesConfig = woundRulesConfig()): WoundProfile {
  const name = typeof ref === 'string' ? ref : ref.profile;
  const base = cfg.profiles[name];
  if (!base) throw woundError(`挂伤规则配置项不存在：${String(name)}`);
  if (typeof ref === 'string') return structuredClone(base);
  const tiers = structuredClone(base.tiers);
  for (const tier of WOUND_TIERS) if (ref.tiers?.[tier]) tiers[tier] = { ...tiers[tier], ...ref.tiers[tier] };
  return {
    tierFrom: ref.tierFrom ?? base.tierFrom,
    tiers,
    streak: { ...base.streak, ...(ref.streak || {}) },
  };
}

/** 配置体检：返回错误列表。给了合同时，状态 id 还必须在状态目录/内置状态里。 */
export function validateWoundRules(contract?: Contract, cfg: WoundRulesConfig = woundRulesConfig()): string[] {
  const errors: string[] = [];
  const known = (id: string): boolean => !id || !contract || !!resolveStatusDef(id, contract);
  if (!cfg?.profiles || typeof cfg.profiles !== 'object') return ['woundRules.profiles 缺失'];
  for (const [name, p] of Object.entries(cfg.profiles || {})) {
    for (const tier of WOUND_TIERS) {
      const rule = p.tiers?.[tier];
      if (!rule) { errors.push(`woundRules.${name}.tiers 缺 ${tier}`); continue; }
      if (!(rule.chance >= 0 && rule.chance <= 1)) errors.push(`woundRules.${name}.${tier}.chance 须在 0–1`);
      if (!(rule.hpLossRatio >= 0 && rule.hpLossRatio <= 1)) errors.push(`woundRules.${name}.${tier}.hpLossRatio 须在 0–1`);
      if (rule.chance > 0 && !rule.status) errors.push(`woundRules.${name}.${tier}：chance>0 却没写 status`);
      if (!known(rule.status)) errors.push(`woundRules.${name}.${tier}.status ${rule.status} 不在状态目录`);
    }
    if (!WOUND_TIER_SOURCES.includes(p.tierFrom)) errors.push(`woundRules.${name}.tierFrom 须为 ${WOUND_TIER_SOURCES.join('/')}`);
    if (!(Number.isInteger(p.streak?.count) && p.streak.count >= 1)) errors.push(`woundRules.${name}.streak.count 须为正整数`);
    if (typeof p.streak?.perBeat !== 'boolean') errors.push(`woundRules.${name}.streak.perBeat 须为 true/false`);
    if (!known(p.streak?.status)) errors.push(`woundRules.${name}.streak.status ${p.streak?.status} 不在状态目录`);
  }
  for (const tier of WOUND_TIERS) if (typeof cfg.labels?.[tier] !== 'string') errors.push(`woundRules.labels.${tier} 须为字符串`);
  for (const id of cfg.afterWin?.statuses || []) if (!known(id)) errors.push(`woundRules.afterWin.statuses ${id} 不在状态目录`);
  return errors;
}

registerNumbersValidator(() => validateWoundRules());

/**
 * 防御检定的结果 → 敌方这一下的档。防御按玩家行动同一套四档规则定档（差值门槛、自然 1 降档、自然 20 都读 sceneDefaults.tiers / 合同 settings）：
 * 没挡住时，防御落到大失败才算敌方大成功（重击），否则只是打中；挡住时，防御大成功算被大挡。
 */
export function woundTierOf(_profile: WoundProfile, roll: { hit: boolean; face: number; total: number; dc: number }, settings: ResolvedSettings): WoundTier {
  const tier = resolveCheck({ face: roll.face, modifier: roll.total - roll.face, difficulty: roll.dc, grounded: false }, settings).tier;
  if (roll.hit) return tier === 'critical_failure' ? 'great_success' : 'success';
  return tier === 'great_success' ? 'critical_failure' : 'failure';
}

/**
 * 按档挂伤：几率在 0 与 1 之间时从防御骰流再取一颗（0、1 不取骰，不挪动后续骰面）。
 * 连续重击达到 streak.count 次挂 streak.status；没到次数时，身上已有同一级伤就不再自动升级。
 * streak.perBeat=true 时按拍计（一拍至多算一次重击、至多挂一次伤，相邻两拍都被重击才算连续）；false 时按出手计（同一目标、中间没有别的结果）。
 * worst=true 只用于危险预警：几率大于 0 就按挂上算，不取骰。
 */
export function applyWoundRule(
  state: SceneState, contract: Contract, ctx: Pick<SceneContext, 'catalog'> | undefined,
  targetId: string, action: EnemyActionDef, tier: WoundTier, worst = false,
): StatusEvent[] {
  const profile = resolveWoundProfile(action.woundRule!);
  const rule = profile.tiers[tier];
  const streaks = (state.woundStreaks ||= {});
  if (rule.hpLossRatio > 0) (state.hpLoss ||= {})[targetId] = (state.hpLoss[targetId] || 0) + rule.hpLossRatio;
  if (profile.streak.perBeat) {
    // 按拍计：本拍已经被重击过的人，再被重击只扣气血，不再挂伤、不再升级；连续＝上一拍也被重击。
    const marks = (state.woundCritBeats ||= {});
    // 没被重击不清零：连续与否看“上一次被重击是不是上一拍”，同拍里先挨普通一下、后挨重击也照样接上。
    if (tier !== 'great_success') { /* 不改计数 */ }
    else if (marks[targetId] === state.beat) return [];
    else { streaks[targetId] = (marks[targetId] === state.beat - 1 ? streaks[targetId] || 0 : 0) + 1; marks[targetId] = state.beat; }
  } else streaks[targetId] = tier === 'great_success' ? (streaks[targetId] || 0) + 1 : 0;
  if (!rule.status || rule.chance <= 0) return [];
  if (rule.chance < 1 && !worst) {
    const face = peekDefenseDie(state);
    state.cursors.defense += 1;
    if (face > rule.chance * GAME_NUMBERS.judgement.dice.sides) return [];
  }
  const escalate = tier === 'great_success' && streaks[targetId] >= profile.streak.count && !!profile.streak.status;
  const status = escalate ? profile.streak.status : rule.status;
  if (!escalate && (state.statuses[targetId] || []).some(active => active.id === status)) return [];
  return applyStatus(state, contract, ctx, targetId, { status, ...(action.woundParams ? { params: action.woundParams } : {}) }, { cause: 'combat', sourceId: action.id });
}

/** 回执字样：敌方这一下的档在配置里的标注（重击等）。 */
export function woundTierLabel(tier: WoundTier | undefined, cfg: WoundRulesConfig = woundRulesConfig()): string {
  return tier ? cfg.labels?.[tier] || '' : '';
}

/** 这条规则可能挂上的全部状态（lint 判断败局能否走到“倒下”用）。 */
export function woundRuleStatuses(ref: WoundRuleRef): string[] {
  const p = resolveWoundProfile(ref);
  return [...WOUND_TIERS.map(t => p.tiers[t].status), p.streak.status].filter(Boolean);
}

/** 赢下之后战后休整：配置开着时，清掉我方参与方的轻伤（只看配置里列的状态 id）。 */
export function afterWinClears(contract: Contract, partyId: string, statusId: string, cfg: WoundRulesConfig = woundRulesConfig()): boolean {
  const party = contract.parties.find(p => p.id === partyId);
  return !!cfg.afterWin?.clearLight && !!party && cfg.afterWin.sides.includes(party.side) && cfg.afterWin.statuses.includes(statusId);
}
export function afterWinClearIds(contract: Contract, partyId: string, ids: string[]): string[] {
  return ids.filter(id => !afterWinClears(contract, partyId, id));
}
