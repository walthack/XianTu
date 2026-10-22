/**
 * F02 对手（SHIWEIMO_ID）救治规则（纯逻辑，数值读 story.shiweimo）。
 * 制服（被制住）或化解（松口退开）后到天亮为救治窗口；窗口内用珍品及以上带疗伤/解毒标签的药，或治疗技能达门槛并过判定，可救活。
 * 凡品无效；朱箓蛇丹不可用（用或给她看 → 好感降到 affinityOnShedanTruth）。
 * 只做判定；接到自由行动/剧情事件由宿主负责（未接线，见 PROJECT-STATUS）。
 */
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { contentDefinition } from './entityCatalog';
import { itemTierOf, ITEM_TIERS } from './itemGrades';
import { entityName } from './namedEntities';

export type ShiweimoEnding = '倒下' | '被制住' | '松口退开';
export type RescueTry =
  | { kind: 'item'; itemId: string }
  | { kind: 'skill'; skillLevel: number; roll: number };
export interface RescueVerdict { ok: boolean; reason: 'saved' | 'dead' | 'window_closed' | 'tier_too_low' | 'wrong_item' | 'forbidden' | 'skill_too_low' | 'skill_failed' | 'no_tries'; affinity?: number }

const cfg = () => (GAME_NUMBERS as any).story.shiweimo;
const order = (name?: string) => ITEM_TIERS.find(t => t.name === name || t.id === name)?.order ?? -1;

export function rescueWindowOpen(ending: ShiweimoEnding, hoursSinceEnd: number): boolean {
  return ending !== '倒下' && hoursSinceEnd >= 0 && hoursSinceEnd <= Number(cfg().rescueWindowHours);
}

export function judgeRescue(ending: ShiweimoEnding, hoursSinceEnd: number, attempt: RescueTry, skillTriesUsed = 0): RescueVerdict {
  const c = cfg();
  if (ending === '倒下') return { ok: false, reason: 'dead' };
  if (!rescueWindowOpen(ending, hoursSinceEnd)) return { ok: false, reason: 'window_closed' };
  const affinity = Number(c.affinityOnRescue?.[ending] ?? 0);
  if (attempt.kind === 'item') {
    if ((c.forbiddenItemIds as string[]).includes(attempt.itemId)) return { ok: false, reason: 'forbidden', affinity: Number(c.affinityOnShedanTruth) };
    const def = contentDefinition('item', attempt.itemId) as { effectTags?: string[]; grade?: string } | undefined;
    if (!def || !(def.effectTags || []).some(t => (c.itemTags as string[]).includes(t))) return { ok: false, reason: 'wrong_item' };
    const tier = itemTierOf(def.grade);
    if (!tier || tier.order < order(c.minItemTier)) return { ok: false, reason: 'tier_too_low' };
    return { ok: true, reason: 'saved', affinity };
  }
  if (skillTriesUsed >= Number(c.skillTries)) return { ok: false, reason: 'no_tries' };
  if (attempt.skillLevel < Number(c.skillThreshold)) return { ok: false, reason: 'skill_too_low' };
  return attempt.roll >= Number(c.skillDifficulty) ? { ok: true, reason: 'saved', affinity } : { ok: false, reason: 'skill_failed' };
}

// ---- 接线：F02 收场登记 + 战后自由行动结算 ----
import type { SaveData } from '@/types/game';
import { ensureEncounteredScenarioCharacter } from './relationships';
import { relationshipOf } from './ledger/affinityIdentity';
import { sceneTime } from '../sceneModule/host/injuries';
import { newSeed, unitAt } from '../sceneModule/dice';

export const SHIWEIMO_ID = 'lcq.character.nanhuang_shiweimo';
export const F02_CONTRACT_ID = 'combat.f02.snake_assault';
/** 显示名一律按 id 从总表取，不在代码里写人名。 */
const shiweimoName = (): string => entityName('character', SHIWEIMO_ID);
export interface ShiweimoRecord { ending: ShiweimoEnding; endedAt: number; status: 'pending' | 'saved' | 'dead' | 'left'; skillTries: number; shedanSeen?: boolean; /** 项目 RNG 种子：离开判定用，首次需要时生成并随存档保存。 */ seed?: number }

const ext = (save: SaveData): any => (((save as any).系统 ||= {}).扩展 ||= {});
export function shiweimoRecord(save: SaveData): ShiweimoRecord | undefined { return ext(save).lcq_shiweimo; }

/** F02 赢后由 host 调用：记下收场方式和时刻；制住/化解时登记关系（好感 0），让战后自由行动能指向她。 */
export function recordShiweimoEnding(save: SaveData, ending: string): void {
  if (!['倒下', '被制住', '松口退开'].includes(ending)) return;
  ext(save).lcq_shiweimo = { ending: ending as ShiweimoEnding, endedAt: sceneTime(save), status: ending === '倒下' ? 'dead' : 'pending', skillTries: 0 } satisfies ShiweimoRecord;
  if (ending === '倒下') return;
  const source = (save as any).世界?.状态?.剧本模组?.canon || {};
  ensureEncounteredScenarioCharacter(save, source, SHIWEIMO_ID, { name: shiweimoName(), gender: '女' });
}

/** 离开判定的骰流盐（与场面骰流区分）。 */
const LEAVE_SALT = 0x5f356495;
/** 她认出朱箓蛇丹后的离开骰：走项目 RNG（种子存在记录里），按回合取第 turn 颗。 */
export function shiweimoLeaveRoll(save: SaveData, turn: number): number {
  const rec = shiweimoRecord(save);
  if (!rec) return 1;
  if (typeof rec.seed !== 'number') rec.seed = newSeed();
  return unitAt(rec.seed, LEAVE_SALT, Math.max(0, Math.floor(Number(turn) || 0)));
}

export interface ShiweimoSettle { handled: boolean; facts: string[] }
/** 战后自由行动：目标是 SHIWEIMO_ID、带着药（itemId）或治疗技能（skillLevel/roll）时按救治规则结算。其余交回常规结算。 */
export function settleShiweimoAction(save: SaveData, t: { targetId: string | null; itemId: string | null }, skill?: { skillLevel: number; roll: number }, leaveRoll = 1): ShiweimoSettle {
  const rec = shiweimoRecord(save);
  if (t.targetId !== SHIWEIMO_ID || !rec || rec.status !== 'pending' || (!t.itemId && !skill)) return { handled: false, facts: [] };
  const hours = (sceneTime(save) - rec.endedAt) / 60;
  if (!rescueWindowOpen(rec.ending, hours)) { rec.status = 'dead'; return { handled: true, facts: [`天已亮，${shiweimoName()}体内的咒毒发作，没能撑过去。`] }; }
  const v = judgeRescue(rec.ending, hours, t.itemId ? { kind: 'item', itemId: t.itemId } : { kind: 'skill', ...skill! }, rec.skillTries);
  const rel = relationshipOf(save as any, SHIWEIMO_ID)?.profile as any;
  if (!t.itemId) rec.skillTries++;
  if (v.reason === 'forbidden') {
    rec.shedanSeen = true; if (rel) rel.好感度 = v.affinity;
    if (leaveRoll < Number(cfg().leaveChanceOnShedanTruth)) { rec.status = 'left'; return { handled: true, facts: [`${shiweimoName()}认出了朱箓蛇丹，眼瞳骤然竖起，拖着伤体离开了。`] }; }
    return { handled: true, facts: [`${shiweimoName()}认出了朱箓蛇丹，再看众人的眼神只剩冰冷。`] };
  }
  const items = (save as any).角色?.背包?.物品 || {};
  if (t.itemId && items[t.itemId] && ['saved', 'tier_too_low'].includes(v.reason)) {
    items[t.itemId].数量 = Number(items[t.itemId].数量) - 1; if (items[t.itemId].数量 <= 0) delete items[t.itemId];
  }
  if (v.ok) {
    rec.status = 'saved'; if (rel) { rel.好感度 = v.affinity; rel.人物关系 = '侍从'; }
    return { handled: true, facts: [`${shiweimoName()}的气息稳住了，咒毒被压了下去；她醒来后留在了主角身边，做了侍从。`] };
  }
  const why: Record<string, string> = { tier_too_low: `寻常药物解得了毒，解不了咒，${shiweimoName()}的气息没有起色。`, wrong_item: '这东西对她的伤没有用处。', skill_too_low: '医术不够，压不住她体内的咒毒。', skill_failed: '施救没有成功，她的气息仍在变弱。', no_tries: '已经试过太多次，再强行施救只会伤她。' };
  return { handled: true, facts: [why[v.reason] || '施救没有起效。'] };
}
