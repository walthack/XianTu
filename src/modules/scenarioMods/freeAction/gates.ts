/**
 * 动作可行性闸门：纯函数，“只有真能做到才结算”。确认判定前后各跑一次（存档指纹、背包、状态可能已变）。
 * 闸门读变体参数（needsItem / needsGoodwill / requires / cost / cooldownMinutes …），不按变体名分支。
 * 不过 → 不出判定卡、不扣任何东西、不改任何状态，只拼“未发生”事实行给叙事。
 * 本文件只读：没有关系记录的在场正典人物由 plan.ts / settle.ts 在进闸门前懒登记（encounter.ts），这里目标认“关系表”或“总表里的在场原著角色”任一命中（双保险），在场再由名单兜住。
 */
import type { SaveData } from '@/types/game';
import { GAME_NUMBERS } from '../../sceneModule/numbers';
import { activeScene } from '../../sceneModule/host/ext';
import { sceneTime } from '../../sceneModule/host/injuries';
import { contentDefinition, contentName } from '../entityCatalog';
import { levelFact, effectiveLevel } from '../characterLevels';
import { namingChapter } from '../ledger/naming';
import { relationshipOf, runtimeEntityName } from '../ledger/affinityIdentity';
import { stanceOf } from '../affinityLadder';
import { actorStatusRecords } from '../actorStatusRead';
import { levelOf } from '@/utils/realmUtils';
import { trainingRealm } from '../levelProgression';
import type { InjuryRecord } from '../../sceneModule/host/injuries';
import { itemEffectOf, type ItemEffect } from './itemUse';
import { resolveNumberRef, variantSpecOf, type VariantSpec } from './config';
import { freeActionText, targetLevelOf } from './judgement';
import { canonCharacterOf, freeActionRosterOf, playerIdOf, type FreeActionTicket } from './ticket';
import { readFreeActionState, runtimeOf } from './state';
import { lethalForbidden, protectedForbids } from './protect';
import { defenseDownOf } from './defenseDown';
import type { GateReason } from './facts';

export interface FreeActionDeps {
  /** 测试可注入：物品效果表（缺省读物品总表的 effectTags / onUse）。 */
  itemEffect?: (itemId: string) => ItemEffect;
}

export interface GateSlots { player: string; target: string; item?: string; status?: string; level?: string }
export interface GateOk {
  ok: true;
  spec: VariantSpec;
  slots: GateSlots;
  item?: ItemEffect;
  toxic: boolean;
  /** heal / bandage / 有解除标签的药：要解除的那一条状态记录与对应标签。 */
  treat?: { row: InjuryRecord; tag: string };
}
export interface GateFail { ok: false; reason: GateReason; slots: GateSlots }

export const playerNameOf = (save: SaveData): string => String((save as any)?.角色?.身份?.名字 || '你');

export function targetNameOf(save: SaveData, targetId: string): string {
  const profile = relationshipOf(save as any, targetId)?.profile as { 名字?: string } | undefined;
  return profile?.名字 || runtimeEntityName(runtimeOf(save), targetId);
}

/** 目标身上能被该物品标签解除的状态（dying 优先，其余按记录顺序）。 */
export function findTreatable(save: SaveData, targetId: string, tags: readonly string[]): { row: InjuryRecord; tag: string } | undefined {
  const matches = actorStatusRecords(save, targetId).flatMap(row => {
    const tag = tags.find(t => (row.remove || []).some(rule => rule.kind === 'item' && rule.ref === t));
    return tag ? [{ row, tag }] : [];
  });
  return matches.find(m => m.row.statusId === 'dying') ?? matches[0];
}

export function isToxic(item: ItemEffect): boolean {
  const toxic: readonly string[] = GAME_NUMBERS.status.itemTags.toxic;
  return item.tags.some(tag => toxic.includes(tag));
}

/** 自修试算：按旧引擎同一套修炼结算，成功档下境界（名称 / 阶段 / 进度）会不会变。 */
function realmWouldMove(save: SaveData, spec: VariantSpec): boolean {
  const now = (save as any)?.角色?.属性?.境界, next = trainingRealm(save, freeActionText(spec, ''), 'success');
  return Boolean(now && next && (next.名称 !== now.名称 || next.阶段 !== now.阶段 || Number(next.当前进度) !== Number(now.当前进度)));
}

/**
 * 无对象的票（自修、场面）只在“出判定卡前”过闸门：不查名单、好感、物品、代价，只看场面是否在进行，和自修的境界试算。
 * 确认判定时旧引擎已按 kind 落账（境界、气血、余波），所以结算侧不再回头过闸门（见 settle.ts）。
 */
function checkTargetlessGates(save: SaveData, spec: VariantSpec): GateOk | GateFail {
  const slots: GateSlots = { player: playerNameOf(save), target: '' };
  if (activeScene(save)) return { ok: false, reason: 'scene_active', slots };
  if (spec.requires?.realmMoves && !realmWouldMove(save, spec)) return { ok: false, reason: 'not_ready', slots };
  return { ok: true, spec, slots, toxic: false };
}

export function checkGates(save: SaveData, ticket: FreeActionTicket, deps: FreeActionDeps = {}): GateOk | GateFail {
  const spec = variantSpecOf(ticket.actionClass, ticket.variant);
  if (!spec || !spec.enabled) throw new Error(`自由行动变体不可用：${ticket.actionClass}.${ticket.variant}`);
  if (spec.target === 'none') return checkTargetlessGates(save, spec);
  const targetId = ticket.targetId!, runtime = runtimeOf(save);
  const slots: GateSlots = { player: playerNameOf(save), target: targetNameOf(save, targetId) };
  const fail = (reason: GateReason): GateFail => ({ ok: false, reason, slots });

  if (activeScene(save)) return fail('scene_active');
  if (targetId === playerIdOf(save) || !(relationshipOf(save as any, targetId) || canonCharacterOf(save, targetId)) || !freeActionRosterOf(save).some(entry => entry.id === targetId)) return fail('not_present');
  if (protectedForbids(targetId, spec)) return fail('protected');
  // drainProgress 类变体只对“设防失效”（配置名单里的状态）的目标成立；读状态记录，不读原话。
  if (spec.requires?.targetDefenseDown && !defenseDownOf(save, targetId, spec.requires.targetDefenseDown)) return fail('guard_up');

  // 手段物品
  let item: ItemEffect | undefined, toxic = false, treat: GateOk['treat'];
  if (spec.needsItem) {
    const owned = ticket.itemId ? (save as any)?.角色?.背包?.物品 : undefined;
    const entry = owned ? Object.entries(owned).map(([key, raw]) => ({ id: (raw as any)?.物品ID || key, raw: raw as any })).find(row => row.id === ticket.itemId) : undefined;
    if (!ticket.itemId || !entry || !(Number(entry.raw.数量) > 0)) return fail('no_item');
    slots.item = entry.raw.名称 || contentName('item', ticket.itemId);
    if (spec.denyEquipped && entry.raw.已装备 === true) return fail('equipped_or_story');
    if (spec.denyStoryItem && contentDefinition('item', ticket.itemId)?.storyItem === true) return fail('equipped_or_story');
    item = (deps.itemEffect ?? itemEffectOf)(ticket.itemId);
    toxic = isToxic(item);
    const wanted = spec.itemTag ? [spec.itemTag] : spec.itemTags;
    if (wanted) {
      const tags = item.tags.filter(tag => wanted.includes(tag));
      if (!tags.length) return fail('item_mismatch');
      treat = findTreatable(save, targetId, tags);
      if (!treat) return fail('nothing_to_treat');
      slots.status = treat.row.label;
    } else if (spec.effect === 'itemDefined') {
      if (!item.tags.length && !item.onUse.length) return fail('item_mismatch');
      if (!toxic && !item.onUse.length) {
        treat = findTreatable(save, targetId, item.tags);
        if (!treat) return fail('nothing_to_treat');
        slots.status = treat.row.label;
      }
    }
  }

  // 目标态度：低姿态（敌对/戒备）不肯接受；byItemTag 时毒性物品不看态度。
  const wantsGoodwill = spec.needsGoodwill === true || (spec.needsGoodwill === 'byItemTag' && !toxic);
  if (wantsGoodwill && stanceOf(Number((relationshipOf(save as any, targetId)?.profile as any)?.好感度) || 0) === 'low') return fail('low_goodwill');

  // 目标好感门槛：低于 requires.minGoodwill 不肯接受（与上面的“低姿态”检查并存）。
  const minGoodwill = spec.requires?.minGoodwill;
  if (minGoodwill !== undefined && (Number((relationshipOf(save as any, targetId)?.profile as any)?.好感度) || 0) < minGoodwill) return fail('goodwill_below_min');

  // 施术者资格：功力不低于目标。目标级数已知（可用的九级时点行）时，高于施术者就拒绝；
  // 查不到级数（占位行、非九级体系、无行）：requires.onLevelUnknown = assume_equal 时按与施术者同级放行（施术者须有修为，只看上面的好感），
  // 否则（deny）拒绝；deny 下目标没有可涨的进度条也拒绝。assume_equal 下没处落地的目标由后面的预算检查兜底（budget_full）。
  if (spec.requires?.actorLevel === 'ge_target') {
    const fact = levelFact(targetId, namingChapter(runtime || {}));
    const realm = (relationshipOf(save as any, targetId)?.profile as any)?.境界;
    const targetLevel = effectiveLevel(fact);
    const levelKnown = Boolean(fact && fact.available && fact.applicability === 'nine_levels' && fact.settingStatus !== 'placeholder' && targetLevel !== undefined);
    if (spec.requires.onLevelUnknown !== 'assume_equal' && (!levelKnown || !(Number(realm?.下一级所需) > 0))) return fail('level_unknown');
    const mine = levelOf((save as any)?.角色?.属性?.境界);
    if (mine === null || (levelKnown ? mine < targetLevel! : !(mine > 0))) {
      slots.level = String(levelKnown ? targetLevel : 1); // 文案写明要修到几级；目标级数不明时，至少得有 1 级
      return fail('level_too_low'); // 查不到目标级数（assume_equal）时，施术者至少得有修为
    }
  }

  // 施术者代价：付得起才行。
  if (spec.cost) {
    const resource = (save as any)?.角色?.属性?.[spec.cost.resource];
    const max = Number(resource?.上限), current = Number(resource?.当前);
    if (!(max > 0) || !(current >= Math.round(max * spec.cost.onResolveRatio))) return fail('no_resource');
  }

  // 冷却与阶段预算（传功）
  const state = readFreeActionState(save);
  if (spec.cooldownMinutes !== undefined) {
    const last = state.cooldowns[`${spec.variant}:${targetId}`];
    if (last !== undefined && sceneTime(save) - last < spec.cooldownMinutes) return fail('cooldown');
  }
  if (spec.phaseBudgetRatio !== undefined && spec.gain) {
    const room = transferRoom(save, targetId, spec);
    if (room <= 0) return fail('budget_full');
  }
  if (spec.drain) {
    const plan = drainPlan(save, targetId, spec);
    if (plan.empty) return fail('drain_empty');
    if (plan.qi + plan.hp <= 0) return fail('drain_resisted');
    if (!drainHpAffordable(save, spec)) return fail('hp_too_low');
    // 吸到对方倒下：必须活着的角色（总表标记，见 protect.ts）直接拒绝；其余的照常结算。
    if (plan.lethal && lethalForbidden(targetId)) return fail('drain_survivor');
  }
  return { ok: true, spec, slots, ...(item ? { item } : {}), toxic, ...(treat ? { treat } : {}) };
}

/** 传功还能再加多少进度：min(阶段预算余量, 离“下一级所需−1”的距离)。 */
export function transferRoom(save: SaveData, targetId: string, spec: VariantSpec): number {
  const realm = (relationshipOf(save as any, targetId)?.profile as any)?.境界;
  const need = Number(realm?.下一级所需), current = Number(realm?.当前进度) || 0;
  if (!(need > 0) || !spec.gain || spec.phaseBudgetRatio === undefined) return 0;
  const phase = `${realm.名称}/${realm.阶段}`, budget = readFreeActionState(save).transferBudget[targetId];
  const used = budget && budget.phase === phase ? budget.used : 0;
  const budgetLeft = Math.floor(need * spec.phaseBudgetRatio) - used;
  const ceilingLeft = need - spec.gain.ceilingBelowNeed - current;
  return Math.max(0, Math.min(budgetLeft, ceilingLeft));
}

/** 级数加“小阶段序号/phasesPerLevel”；阶段不明按初期（序号 0）。 */
const levelWithPhase = (level: number, stage: unknown, phasesPerLevel: number): number =>
  level + (GAME_NUMBERS.levels.phases[stage as keyof typeof GAME_NUMBERS.levels.phases] ?? 0) / phasesPerLevel;

/** 夺取类吸取比例 = clamp(lossRatio + attrStep·Δa + levelStep·Δp, 0, perUseCapRatio)；Δa、Δp 的算法见 config.ts 的 DrainSpec 说明。 */
export function drainRatio(save: SaveData, targetId: string, spec: VariantSpec): number {
  const drain = spec.drain;
  if (!drain) return 0;
  const { attrWeights, attrStep, levelStep, phasesPerLevel, unknownTargetAttr } = drain.amount;
  const identity = (save as any)?.角色?.身份, theirs = (relationshipOf(save as any, targetId)?.profile as any)?.先天六司;
  const center = GAME_NUMBERS.factors.center, fallback = resolveNumberRef(unknownTargetAttr);
  const num = (value: unknown, missing: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : missing);
  let deltaAttr = 0;
  for (const [key, weight] of Object.entries(attrWeights)) {
    const mine = num(identity?.先天六司?.[key], center) + num(identity?.后天六司?.[key], 0);
    deltaAttr += weight * (mine - num(theirs?.[key], fallback));
  }
  const realm = (save as any)?.角色?.属性?.境界, theirLevel = targetLevelOf(save, targetId);
  const deltaLevel = theirLevel === undefined ? 0
    : levelWithPhase(levelOf(realm) ?? 0, realm?.阶段, phasesPerLevel) - levelWithPhase(theirLevel, (relationshipOf(save as any, targetId)?.profile as any)?.境界?.阶段, phasesPerLevel);
  return Math.min(drain.perUseCapRatio, Math.max(0, drain.lossRatio + attrStep * deltaAttr + levelStep * deltaLevel));
}

export interface DrainPlan {
  /** 本次吸到的目标灵气 / 气血点数。 */
  qi: number;
  hp: number;
  /** 目标灵气已空、气血只剩 hpFloor 以内，且这一下有量可吸：吸下去气血归零（hp = 剩下的全部气血），目标倒下（挂 lethalStatus）。 */
  lethal: boolean;
  /** 目标灵气与气血都已竭。 */
  empty: boolean;
}

/**
 * 夺取类单次吸取（闸门与结算共用）：先吸灵气，每池按“池上限 × 吸取比例”（单池不超过 上限×perUseCapRatio）；
 * 灵气不够吸时，没吸满的那部分比例折到气血（气血 = 气血上限 × 比例 × 缺口占比），气血最多吸到 hpFloor；
 * 目标灵气已空且气血在 hpFloor 以内（>0）时再吸 = 吸到对方倒下，lethal 为真，hp 取剩下的全部气血。
 * scale 是结算时的轻重 × 结果档 × 递减（闸门取 1）。不看目标的修炼进度；没有灵气 / 气血记录的池按 0。
 */
export function drainPlan(save: SaveData, targetId: string, spec: VariantSpec, scale = 1): DrainPlan {
  const drain = spec.drain, attrs = (relationshipOf(save as any, targetId)?.profile as any)?.属性;
  const pool = (key: '灵气' | '气血'): { cur: number; max: number } => {
    const cur = Number(attrs?.[key]?.当前), max = Number(attrs?.[key]?.上限);
    return { cur: Number.isFinite(cur) ? Math.max(0, cur) : 0, max: Number.isFinite(max) ? Math.max(0, max) : 0 };
  };
  const qi = pool('灵气'), hp = pool('气血');
  const empty = qi.cur <= 0 && hp.cur <= 0;
  if (!drain || empty) return { qi: 0, hp: 0, lethal: false, empty };
  const ratio = Math.min(drain.perUseCapRatio, drainRatio(save, targetId, spec) * Math.max(0, scale));
  const qiWant = Math.round(qi.max * ratio), qiTake = Math.min(qi.cur, qiWant);
  const gap = qiWant > 0 ? (qiWant - qiTake) / qiWant : ratio > 0 ? 1 : 0;
  const hpWant = Math.round(hp.max * ratio * gap), hpRoom = Math.max(0, hp.cur - drain.hpFloor);
  const lethal = qi.cur <= 0 && hp.cur > 0 && hp.cur <= drain.hpFloor && hpWant > 0;
  return { qi: qiTake, hp: lethal ? hp.cur : Math.min(hpRoom, hpWant), lethal, empty };
}

/** 夺取类每次施行先扣的玩家气血：上限 × drain.selfCostHpRatio（四舍五入）；不是夺取类、没有气血记录是 0。 */
export function drainSelfCost(save: SaveData, spec: VariantSpec): number {
  const max = Number((save as any)?.角色?.属性?.气血?.上限);
  return spec.drain && max > 0 ? Math.round(max * spec.drain.selfCostHpRatio) : 0;
}

/** 气血付得起：当前气血须大于自损量（施行后至少剩一点，不能靠自损把自己耗死）；没有气血记录的存档付不起。 */
export function drainHpAffordable(save: SaveData, spec: VariantSpec): boolean {
  const hp = (save as any)?.角色?.属性?.气血;
  return Number(hp?.上限) > 0 && Number(hp?.当前) > drainSelfCost(save, spec);
}
