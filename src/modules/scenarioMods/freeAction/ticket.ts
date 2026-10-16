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

export interface FreeActionTicket {
  actionClass: ActionClass;
  variant: string;
  targetId: string | null;
  degree: Degree;
  performed: 'yes';
  evidence: string;
  itemId: string | null;
}
export interface RosterEntry { id: string; name: string }
export interface ItemEntry { id: string; name: string }
export interface TicketDiscard { reason: string; key?: string }
export interface TicketValidation { tickets: FreeActionTicket[]; discards: TicketDiscard[] }

const TICKET_KEYS = ['actionClass', 'variant', 'targetId', 'degree', 'performed', 'evidence', 'itemId'];
const OPTIONAL_KEYS = ['targetId', 'itemId'];

const runtimeOf = (save: unknown): any => (save as any)?.世界?.状态?.剧本模组;
export const playerIdOf = (save: unknown): string | undefined => runtimeOf(save)?.opening?.playerCharacterId;

/** 在场名单：叙事真正用的 readLocalMemoryCapsule().presentNames 对应的人物（带 id）；排除玩家自己与没有关系档案的人。 */
export function freeActionRosterOf(save: SaveData): RosterEntry[] {
  const capsule = readLocalMemoryCapsule(save, undefined, []);
  if (!capsule.presentNames.length) return [];
  const player = playerIdOf(save), seen = new Set<string>(), roster: RosterEntry[] = [];
  for (const actor of capsule.presentActors) {
    const id = actor.characterId;
    if (!id || id === player || seen.has(id) || !relationshipOf(save as any, id)) continue;
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
function squash(text: string): string {
  return [...String(text ?? '').normalize('NFKC')].filter(ch => ch.trim() !== '').join('');
}

export function evidenceBelongs(playerText: string, evidence: string): boolean {
  const needle = squash(evidence);
  return needle.length >= 2 && squash(playerText).includes(needle);
}

/** 追加到 intent 提示里的票说明（由 config 生成：只列启用的变体）。freeAction 关闭时不调用。 */
export function ticketPromptSection(save: SaveData): { system: string; payload: Record<string, unknown> } {
  const cfg = freeActionConfig();
  const byClass = new Map<string, Array<{ variant: string; label: string }>>();
  for (const row of enabledVariants()) {
    if (!byClass.has(row.actionClass)) byClass.set(row.actionClass, []);
    byClass.get(row.actionClass)!.push({ variant: row.variant, label: row.label });
  }
  const system = [
    `自由行动票：玩家这一句里若确实对在场某人做了动作，就在tickets数组里出票（最多${cfg.ticket.maxPerTurn}张，每个目标最多1张）；没有就返回空数组。`,
    '每张票字段恰好为actionClass、variant、targetId、degree、performed、evidence、itemId，不许有别的字段，也不要输出任何数值。',
    'actionClass与variant只能取freeAction.classes里的；找不到合适变体就不出票，不要就近硬套。targetId只能取freeAction.roster里的id；itemId只能取freeAction.items里的id，用不到手段物品填null。',
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
  const cfg = freeActionConfig(), result: TicketValidation = { tickets: [], discards: [] };
  const drop = (reason: string, key?: string) => { result.discards.push({ reason, ...(key ? { key } : {}) }); };
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
    if (t.actionClass === 'other') continue; // 观察、闲聊等：不结算，也不算丢弃
    const spec = typeof t.variant === 'string' ? variantSpecOf(t.actionClass as string, t.variant) : undefined;
    if (!spec) { drop('bad_variant', label); continue; }
    if (!spec.enabled || spec.route === 'none') { drop('variant_disabled', label); continue; }
    if (!cfg.degrees.includes(t.degree as Degree)) { drop('bad_degree', label); continue; }
    if (t.performed !== 'yes') { drop(cfg.performed.includes(String(t.performed)) ? 'not_performed' : 'bad_performed', label); continue; }
    // 模型常把“空”写成字符串 "null" / ""，按空处理。
    const targetId = t.targetId === 'null' || t.targetId === '' ? null : t.targetId;
    if (typeof targetId !== 'string' || !roster.has(targetId)) { drop('target_not_present', label); continue; }
    if (!relationshipOf(save as any, targetId)) { drop('target_no_record', label); continue; }
    if (typeof t.evidence !== 'string' || !evidenceBelongs(playerText, t.evidence)) { drop('bad_evidence', label); continue; }
    const itemId = t.itemId === 'null' || t.itemId === '' ? null : t.itemId ?? null;
    if (itemId !== null && (typeof itemId !== 'string' || !spec.needsItem || !itemIds.has(itemId))) { drop('bad_item_id', label); continue; }
    // 每个目标最多一张：同一人被报了几张，留分量最重的（变体行的好感基础点绝对值最大者；并列取先报的），其余丢弃。
    const weight = Math.abs(spec.base ?? 0), prior = picked.get(targetId);
    if (prior && prior.weight >= weight) { drop('duplicate_target', label); continue; }
    if (prior) drop('duplicate_target', `${prior.ticket.actionClass}.${prior.ticket.variant}`);
    picked.set(targetId, {
      weight,
      ticket: {
        actionClass: t.actionClass as ActionClass, variant: spec.variant, targetId, degree: t.degree as Degree,
        performed: 'yes', evidence: [...t.evidence].slice(0, cfg.ticket.evidenceChars).join(''), itemId,
      },
    });
  }
  result.tickets = [...picked.values()].map(entry => entry.ticket);
  return result;
}
