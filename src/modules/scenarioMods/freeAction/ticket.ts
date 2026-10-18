/**
 * 自由行动票：模型只报“玩家这一句做了什么”（类、变体、对谁、轻重、是否真做了、原话证据、手段物品），
 * 全部是固定枚举或代码生成名单里的 id；本文件只做名单生成与票的校验，不读数值、不结算。
 * 不对玩家原话做任何关键词/正则匹配：是否真做了由模型填 performed，原话只用于“确有此话”的连续子串核对。
 */
import type { SaveData } from '@/types/game';
import { contentDefinition, contentName } from '../entityCatalog';
import { relationshipOf } from '../ledger/affinityIdentity';
import { readLocalMemoryCapsule } from '../legacyNarratorPacket';
import { itemEffectOf } from './itemUse';
import { freeActionConfig, variantSpecOf, enabledVariants, type ActionClass, type Degree } from './config';
import { gateText } from './facts';
import { logGateRefusal } from './refusalLog';

export interface FreeActionTicket {
  actionClass: ActionClass;
  variant: string;
  targetId: string | null;
  degree: Degree;
  performed: 'yes';
  evidence: string;
  itemId: string | null;
  /** 模型对这次举动好感变化的评估（可选）；只在代码基础值 ± affinity.floatBand 内生效，基础值为 0 时不采用。 */
  affinityDelta?: number;
}
export interface RosterEntry { id: string; name: string }
export interface ItemEntry { id: string; name: string }
export interface TicketDiscard { reason: string; key?: string }
/** refusals：证据已核对通过、但目标或手段物品无效的票——不结算，只留一行“未发生”事实给叙事与界面回执。 */
export interface TicketValidation {
  tickets: FreeActionTicket[]; discards: TicketDiscard[]; refusals: string[];
  /** 模型明确报了“其他”（performed=yes）的票数：没有结算规则，只作叙述；界面据此给一条持久回执。 */
  others: number;
}

const TICKET_KEYS = ['actionClass', 'variant', 'targetId', 'degree', 'performed', 'evidence', 'itemId', 'affinityDelta'];
const OPTIONAL_KEYS = ['targetId', 'itemId', 'affinityDelta'];

const runtimeOf = (save: unknown): any => (save as any)?.世界?.状态?.剧本模组;
export const playerIdOf = (save: unknown): string | undefined => runtimeOf(save)?.opening?.playerCharacterId;
/** 本存档剧本正典里的人物条目（只读）。 */
export const canonCharacterOf = (save: unknown, id: string): { id: string } | undefined =>
  (runtimeOf(save)?.canon?.characters as Array<{ id: string }> | undefined)?.find(item => item?.id === id);

/**
 * 在场名单：叙事真正用的 readLocalMemoryCapsule().presentNames 对应的人物（带 id）；排除玩家自己。
 * 要有关系档案或正典记录（后者的档案由 prepare/settle 在结算时懒登记，这里只读不写）。
 */
export function freeActionRosterOf(save: SaveData): RosterEntry[] {
  const capsule = readLocalMemoryCapsule(save, undefined, []);
  if (!capsule.presentNames.length) return [];
  const player = playerIdOf(save), seen = new Set<string>(), roster: RosterEntry[] = [];
  for (const actor of capsule.presentActors) {
    const id = actor.characterId;
    if (!id || id === player || seen.has(id) || !(relationshipOf(save as any, id) || canonCharacterOf(save, id))) continue;
    seen.add(id);
    roster.push({ id, name: actor.panelName || actor.name });
    if (roster.length >= freeActionConfig().ticket.rosterMax) break;
  }
  return roster;
}

/** 背包里数量>0 的物品（物品 id → 名称、是否已装备）。 */
function backpackEntries(save: SaveData): Array<{ id: string; name: string; equipped: boolean }> {
  const items = (save as any)?.角色?.背包?.物品 || {};
  return Object.entries(items).flatMap(([key, raw]) => {
    const item = raw as { 物品ID?: string; 名称?: string; 类型?: string; 数量?: number; 已装备?: boolean };
    const id = item?.物品ID || key;
    if (!(Number(item?.数量) > 0) || item?.类型 === '功法') return [];
    return [{ id, name: item.名称 || contentName('item', id), equipped: item.已装备 === true }];
  });
}

/** 校验用的完整名单：背包里的所有物品。 */
export function freeActionItemIds(save: SaveData): Set<string> {
  return new Set(backpackEntries(save).map(entry => entry.id));
}

/** 提示用名单（≤ itemListMax）：先放有效果标签的，再放可赠的其余物品；已装备与剧情物品不列。 */
export function freeActionItemListOf(save: SaveData): ItemEntry[] {
  const rows = backpackEntries(save).filter(entry => !entry.equipped && contentDefinition('item', entry.id)?.storyItem !== true);
  const tagged = rows.filter(entry => itemEffectOf(entry.id).tags.length > 0);
  const rest = rows.filter(entry => itemEffectOf(entry.id).tags.length === 0);
  return [...tagged, ...rest].slice(0, freeActionConfig().ticket.itemListMax).map(({ id, name }) => ({ id, name }));
}

/** 去掉空白后的文本（不用正则）。 */
export function squash(text: string): string {
  return [...String(text ?? '').normalize('NFKC')].filter(ch => ch.trim() !== '').join('');
}

export function evidenceBelongs(playerText: string, evidence: string): boolean {
  const needle = squash(evidence);
  return needle.length >= 2 && squash(playerText).includes(needle);
}

/** 追加到 intent 提示里的票说明（由 config 生成：只列启用的变体）。freeAction 关闭时不调用。 */
export function ticketPromptSection(save: SaveData): { system: string; payload: Record<string, unknown> } {
  const cfg = freeActionConfig();
  const byClass = new Map<string, Array<{ variant: string; label: string; needsItem: boolean; hint?: string }>>();
  for (const row of enabledVariants()) {
    if (!byClass.has(row.actionClass)) byClass.set(row.actionClass, []);
    byClass.get(row.actionClass)!.push({ variant: row.variant, label: row.label, needsItem: row.needsItem, ...(row.hint ? { hint: row.hint } : {}) });
  }
  const system = [
    `自由行动票：玩家这句若确实对在场某人或自身做了动作，就在tickets数组出票（最多${cfg.ticket.maxPerTurn}张，每个目标最多1张）；没有就返回空数组。`,
    '每张票字段为actionClass、variant、targetId、degree、performed、evidence、itemId，外加可选的affinityDelta，不许有别的字段；除affinityDelta外不要输出任何数值。',
    `affinityDelta（可选）：你作为主持评估这次举动让对方对玩家的好感变化，整数，范围-${cfg.affinity.perBeatCap}..+${cfg.affinity.perBeatCap}，口径同候选的好感评估；代码以自己算的基础值为准，只在其上下小幅采纳你的值，对方拒绝或没做成时一律不采纳。拿不准就省略。`,
    'actionClass与variant只能取freeAction.classes里的；找不到合适变体就不出票，不要就近硬套。targetId只能取freeAction.roster里的id；itemId只能取freeAction.items里的id，用不到手段物品填null。needsItem为true的变体，玩家没有合用的物品也照样出票，itemId填null，本地会判定没成事并告知，不要因为没物品就不出票。',
    `degree取${cfg.degrees.join('|')}（轻描淡写/常规/全力或当众）。performed：玩家这一句里确实做了该动作填yes；问句、假设、转述、否定、只是想想填no；拿不准填unclear。`,
    `evidence必须逐字摘自玩家原话的连续片段（不超过${cfg.ticket.evidenceChars}字），不得改写或把两处拼起来；同一句里对几个人动手，每张票各摘一段原话里的连续片段（可以重叠）。观察、闲聊、吃饭、不可能的事不出票。`,
  ].join('');
  return {
    system,
    payload: {
      classes: [...byClass].map(([actionClass, variants]) => ({ actionClass, variants })),
      roster: freeActionRosterOf(save),
      items: freeActionItemListOf(save),
    },
  };
}

/**
 * 校验模型报来的票，失败即丢弃（不追问、不降级结算）。
 * 名单一律从存档重新算，不信提示里发过的那份。
 */
export function validateFreeActionTickets(raw: unknown, playerText: string, save: SaveData): TicketValidation {
  const cfg = freeActionConfig(), result: TicketValidation = { tickets: [], discards: [], refusals: [], others: 0 };
  const drop = (reason: string, key?: string) => { result.discards.push({ reason, ...(key ? { key } : {}) }); };
  const slots = { player: String((save as any)?.角色?.身份?.名字 || '你'), target: '' };
  const refuse = (reason: 'target_unavailable' | 'item_unavailable' | 'dropped', discard: string, key?: string) => {
    drop(discard, key);
    logGateRefusal(reason, 'ticket', undefined, { discard, ...(key ? { ticketKey: key } : {}) });
    const text = gateText(reason, slots);
    if (!result.refusals.includes(text)) result.refusals.push(text);
  };
  if (raw === undefined) return result;
  if (!Array.isArray(raw)) { drop('not_array'); return result; }
  if (raw.length > cfg.ticket.maxPerTurn) drop('too_many');
  const roster = new Map(freeActionRosterOf(save).map(entry => [entry.id, entry]));
  const itemIds = freeActionItemIds(save), picked = new Map<string, { ticket: FreeActionTicket; weight: number }>();
  for (const item of raw.slice(0, cfg.ticket.maxPerTurn)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { drop('bad_item'); continue; }
    const t = item as Record<string, unknown>, keys = Object.keys(t);
    const label = typeof t.variant === 'string' && typeof t.actionClass === 'string' ? `${t.actionClass}.${t.variant}` : undefined;
    if (keys.some(key => !TICKET_KEYS.includes(key))) { drop('extra_fields', label); continue; }
    if (TICKET_KEYS.some(key => !OPTIONAL_KEYS.includes(key) && !(key in t))) { drop('missing_fields', label); continue; }
    if (!cfg.actionClasses.includes(t.actionClass as ActionClass)) { drop('bad_class'); continue; }
    if (t.actionClass === 'other') { if (t.performed === 'yes') result.others += 1; continue; } // 观察、闲聊等：不结算，也不算丢弃
    const spec = typeof t.variant === 'string' ? variantSpecOf(t.actionClass as string, t.variant) : undefined;
    if (!spec) { drop('bad_variant', label); continue; }
    if (!spec.enabled || spec.route === 'none') { drop('variant_disabled', label); continue; }
    if (!cfg.degrees.includes(t.degree as Degree)) { drop('bad_degree', label); continue; }
    if (t.performed !== 'yes') { drop(cfg.performed.includes(String(t.performed)) ? 'not_performed' : 'bad_performed', label); continue; }
    // 证据先核对：证据不过的票连“未发生”事实也不发（防止凭空杜撰的票误伤）。
    if (typeof t.evidence !== 'string' || !evidenceBelongs(playerText, t.evidence)) { drop('bad_evidence', label); continue; }
    // 模型常把“空”写成字符串 "null" / ""，按空处理。无对象的变体（自修、场面）不看模型报的 targetId，一律置空，也不查名单与关系。
    const targetless = spec.target === 'none';
    const reported = t.targetId === 'null' || t.targetId === '' ? null : t.targetId;
    if (!targetless) {
      if (typeof reported !== 'string' || !roster.has(reported)) { refuse('target_unavailable', 'target_not_present', label); continue; }
      if (!relationshipOf(save as any, reported) && !canonCharacterOf(save, reported)) { refuse('target_unavailable', 'target_no_record', label); continue; }
    }
    const targetId = targetless ? null : reported as string;
    // 不需要物品的变体：模型顺手带的 itemId 直接置空，不让整张票作废。
    let itemId = t.itemId === 'null' || t.itemId === '' ? null : t.itemId ?? null;
    if (!spec.needsItem) itemId = null;
    else if (itemId !== null && (typeof itemId !== 'string' || !itemIds.has(itemId))) { refuse('item_unavailable', 'bad_item_id', label); continue; }
    // 每个目标最多一张：同一人被报了几张，留分量最重的（变体行的好感基础点绝对值最大者；并列取先报的），其余丢弃。无对象的票按类去重。
    const pickKey = targetId ?? `class:${spec.actionClass}`, weight = Math.abs(spec.base ?? 0), prior = picked.get(pickKey);
    // 被挤掉的那张证据已核对、确是玩家做的事：不结算，但要留一行“未发生”，否则叙事会把它写成已成。
    if (prior && prior.weight >= weight) { refuse('dropped', 'duplicate_target', label); continue; }
    if (prior) refuse('dropped', 'duplicate_target', `${prior.ticket.actionClass}.${prior.ticket.variant}`);
    // 好感浮动位：不是有限数字就当没报（不作废整张票）；先钳到单拍上限。
    const floated = !targetless && typeof t.affinityDelta === 'number' && Number.isFinite(t.affinityDelta)
      ? Math.max(-cfg.affinity.perBeatCap, Math.min(cfg.affinity.perBeatCap, Math.round(t.affinityDelta))) : undefined;
    picked.set(pickKey, {
      weight,
      ticket: {
        actionClass: t.actionClass as ActionClass, variant: spec.variant, targetId, degree: t.degree as Degree,
        performed: 'yes', evidence: [...t.evidence].slice(0, cfg.ticket.evidenceChars).join(''), itemId: itemId as string | null,
        ...(floated !== undefined ? { affinityDelta: floated } : {}),
      },
    });
  }
  result.tickets = [...picked.values()].map(entry => entry.ticket);
  return result;
}
