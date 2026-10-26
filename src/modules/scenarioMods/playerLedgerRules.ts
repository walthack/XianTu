/**
 * 玩家账本规则表（身份账设计稿 2026-10-25 §3.1 / §6）：「事件 → 身份 / 收束档」的唯一映射。
 * 规则表 mod-kit/player-ledger-rules.json，身份定义 mod-kit/entity-catalog/identities.json；唯一道具组 itemGroups 见补充设计稿 2026-10-26 §2.2，在队账 partyJoins / partyLeaves / partyOpenings 见同稿 §3.2；
 * 档位集合、判档线集合与身份 kind 集合只读数值配置 story.lineOutcome.tiers / story.lineOutcome.judgedLines / story.identity.kinds，这里不写死。
 */
import rulesJson from '../../../mod-kit/player-ledger-rules.json';
import identitiesJson from '../../../mod-kit/entity-catalog/identities.json';
import index from '../../../mod-kit/entity-catalog/index.json';
import stageAccess from '../../../mod-kit/entity-catalog/stage-access.json';
import { GAME_NUMBERS } from '../sceneModule/numbers';

export interface IdentityGrantRule {
  eventId: string;
  identityId: string;
  /** 本身份已经 active 时怎么办。缺省 'reinforce' */
  whenHeld?: 'reinforce' | 'redirect';
  /** whenHeld='redirect' 时改授的身份（如「分号」） */
  redirectIdentityId?: string;
}
export interface IdentityRevokeRule { eventId: string; identityId: string }
/** outcome ∈ story.lineOutcome.tiers；lineId ∈ story.lineOutcome.judgedLines（太泉不判档） */
export interface LineOutcomeRule { eventId: string; lineId: string; outcome: string }

/** 唯一道具组（补充设计稿 2026-10-26 §2.2）：同一件东西在各书里的 id，组内任一件得过就不再发（口径读 story.itemProvenance.dedupeBy）。 */
export interface ItemGroupRule {
  /** liuchao.itemgroup.<名>，末段不能是 from */
  id: string;
  /** 实体索引 kind=item；≥1 个；一物只属一组 */
  itemIds: string[];
  /** 本组已得过时怎么办。缺省 'skip'（不发）；'redirect'＝改发 redirectItemId */
  whenHeld?: 'skip' | 'redirect';
  redirectItemId?: string;
}

/** 在队账入队/离队规则（补充设计稿 2026-10-26 §3.2）：事件完成时该人物入队或离队。 */
export interface PartyRule {
  /** 实体索引 kind=event */
  eventId: string;
  /** 实体索引 kind=character；主角不得入规则 */
  characterId: string;
  /** 只在玩家走了某条路径时生效（pathReceipts 键，实体索引 kind=receipt），用来表达同一事件里选离队/留队 */
  whenReceiptId?: string;
}
/** 从该关开局的存档，开局时在队的名单（stageId 为 entity-catalog/stage-access.json 的 stages 键，同一关只能出现一次）。 */
export interface PartyOpening { stageId: string; characterIds: string[] }

export interface PlayerLedgerRules {
  version: 1;
  identityGrants: IdentityGrantRule[];
  identityRevokes: IdentityRevokeRule[];
  lineOutcomes: LineOutcomeRule[];
  /** 可选键，缺键按 [] 处理 */
  itemGroups?: ItemGroupRule[];
  partyJoins?: PartyRule[];
  partyLeaves?: PartyRule[];
  partyOpenings?: PartyOpening[];
}

export interface PlayerIdentityDef {
  /** liuchao.identity.<域>.<名> */
  id: string;
  /** 展示名，只在这里 */
  name: string;
  /** 取值必须在 story.identity.kinds 里 */
  kind: string;
  /** 所属国家线 id（实体索引 kind=line） */
  lineId?: string;
  /** 所属势力 id（entity-catalog/factions.json） */
  factionId?: string;
  /** 同时持有多个身份时结论行里的排序；数值只在配置里 */
  rank?: number;
}

/** 校验用的引用集合；缺省取仓库权威（index.json / identities.json / 数值配置）。测试夹具可整体替换。 */
export interface PlayerLedgerRefs {
  identities?: PlayerIdentityDef[];
  eventIds?: Iterable<string>;
  lineIds?: Iterable<string>;
  factionIds?: Iterable<string>;
  tiers?: readonly string[];
  judgedLines?: readonly string[];
  kinds?: readonly string[];
  itemIds?: Iterable<string>;
  /** story.trades 里的 grantItemId（直写背包、不留回执，唯一道具不得走这条路） */
  tradeGrantItemIds?: Iterable<string>;
  characterIds?: Iterable<string>;
  receiptIds?: Iterable<string>;
  stageIds?: Iterable<string>;
  /** 不得写进在队规则的主角 id；缺省 PROTAGONIST_CHARACTER_IDS */
  protagonistIds?: Iterable<string>;
}

/** 身份 id 末段保留给读取子路径（identity.<id>.from / .status）。 */
const RESERVED_IDENTITY_TAILS = ['from', 'status'];
/** 授予规则 whenHeld 的取值；任务线 identityGrant 同用。 */
export const WHEN_HELD: readonly string[] = ['reinforce', 'redirect'];
/** 道具组 id 前缀与保留末段（item.<groupId>.from 读取子路径）。 */
export const ITEM_GROUP_PREFIX = 'liuchao.itemgroup.';
const RESERVED_ITEM_GROUP_TAILS = ['from'];
/** 道具组 whenHeld 的取值。 */
export const ITEM_WHEN_HELD: readonly string[] = ['skip', 'redirect'];

/** 主角人物 id（同 travelLedger / AIBS 的 isProtagonist 兜底口径）；在队账不收主角。 */
export const PROTAGONIST_CHARACTER_IDS: readonly string[] = ['liuchao.character.cheng_zongyang'];
/** 规则表里的可选数组键，缺键按 [] 处理。 */
const OPTIONAL_RULE_ARRAYS = ['itemGroups', 'partyJoins', 'partyLeaves', 'partyOpenings'] as const;

/** 实体索引里某 kind 的 id 集合。 */
export const indexIds = (kind: string): Set<string> => new Set(index.entries.filter(e => e.kind === kind).map(e => e.id));

export function playerIdentityDefs(): PlayerIdentityDef[] {
  return (identitiesJson.entries as unknown as Array<{ definition: PlayerIdentityDef }>).map(e => e.definition);
}

export function playerIdentityDef(identityId: string, defs: PlayerIdentityDef[] = playerIdentityDefs()): PlayerIdentityDef | undefined {
  return defs.find(d => d.id === identityId);
}

export const identityKinds = (): readonly string[] => GAME_NUMBERS.story.identity.kinds;

/** 返回错误列表，空＝通过。 */
export function validatePlayerLedgerRules(rules: PlayerLedgerRules, refs: PlayerLedgerRefs = {}): string[] {
  const errors: string[] = [];
  const defs = refs.identities ?? playerIdentityDefs();
  const eventIds = new Set(refs.eventIds ?? indexIds('event'));
  const lineIds = new Set(refs.lineIds ?? indexIds('line'));
  const factionIds = new Set(refs.factionIds ?? indexIds('faction'));
  const tiers = refs.tiers ?? GAME_NUMBERS.story.lineOutcome.tiers;
  const judgedLines = refs.judgedLines ?? GAME_NUMBERS.story.lineOutcome.judgedLines;
  const kinds = refs.kinds ?? identityKinds();
  const identityIds = new Set<string>();

  for (const def of defs) {
    if (!def?.id || typeof def.id !== 'string') { errors.push('身份定义缺 id'); continue; }
    if (identityIds.has(def.id)) errors.push(`身份 id 重复：${def.id}`);
    identityIds.add(def.id);
    if (!def.name) errors.push(`身份 ${def.id} 缺展示名`);
    if (RESERVED_IDENTITY_TAILS.includes(def.id.split('.').pop() || '')) errors.push(`身份 id 末段不能是 ${RESERVED_IDENTITY_TAILS.join('/')}：${def.id}`);
    if (!kinds.includes(def.kind)) errors.push(`身份 ${def.id} 的 kind 不在 story.identity.kinds：${String(def.kind)}`);
    if (def.lineId !== undefined && !lineIds.has(def.lineId)) errors.push(`身份 ${def.id} 的 lineId 未知：${def.lineId}`);
    if (def.factionId !== undefined && !factionIds.has(def.factionId)) errors.push(`身份 ${def.id} 的 factionId 未知：${def.factionId}`);
    if (def.rank !== undefined && !Number.isFinite(def.rank)) errors.push(`身份 ${def.id} 的 rank 须为数字`);
  }

  if (rules?.version !== 1) errors.push(`规则表 version 须为 1：${String(rules?.version)}`);
  for (const key of ['identityGrants', 'identityRevokes', 'lineOutcomes'] as const) {
    if (!Array.isArray(rules?.[key])) errors.push(`规则表 ${key} 须为数组`);
  }
  for (const key of OPTIONAL_RULE_ARRAYS) {
    if (rules?.[key] !== undefined && !Array.isArray(rules[key])) errors.push(`规则表 ${key} 须为数组`);
  }
  if (errors.some(e => e.startsWith('规则表'))) return errors;

  const checkEvent = (where: string, eventId: string): void => { if (!eventIds.has(eventId)) errors.push(`${where}eventId 未知：${eventId}`); };
  const checkIdentity = (where: string, field: string, identityId: string | undefined): void => { if (!identityId || !identityIds.has(identityId)) errors.push(`${where}${field} 未知：${String(identityId)}`); };

  const granted = new Set<string>();
  for (const rule of rules.identityGrants) {
    const where = `授予规则 ${rule.eventId} → ${rule.identityId}：`;
    checkEvent(where, rule.eventId);
    checkIdentity(where, 'identityId', rule.identityId);
    if (rule.whenHeld !== undefined && !WHEN_HELD.includes(rule.whenHeld)) errors.push(`${where}whenHeld 须为 ${WHEN_HELD.join('/')}`);
    if (rule.whenHeld === 'redirect') {
      if (!rule.redirectIdentityId) errors.push(`${where}whenHeld=redirect 须带 redirectIdentityId`);
      else if (rule.redirectIdentityId === rule.identityId) errors.push(`${where}redirectIdentityId 不能与原身份相同`);
      else checkIdentity(where, 'redirectIdentityId', rule.redirectIdentityId);
    } else if (rule.redirectIdentityId !== undefined) errors.push(`${where}redirectIdentityId 只用于 whenHeld=redirect`);
    granted.add(`${rule.eventId}\u0000${rule.identityId}`);
  }
  for (const rule of rules.identityRevokes) {
    const where = `撤销规则 ${rule.eventId} → ${rule.identityId}：`;
    checkEvent(where, rule.eventId);
    checkIdentity(where, 'identityId', rule.identityId);
    if (granted.has(`${rule.eventId}\u0000${rule.identityId}`)) errors.push(`${where}同一事件同一身份不能既授予又撤销`);
  }
  for (const rule of rules.lineOutcomes) {
    const where = `收束规则 ${rule.eventId} → ${rule.lineId}：`;
    checkEvent(where, rule.eventId);
    if (!lineIds.has(rule.lineId)) errors.push(`${where}lineId 未知：${rule.lineId}`);
    else if (!judgedLines.includes(rule.lineId)) errors.push(`${where}lineId 不在 story.lineOutcome.judgedLines（非判档线不写收束档）：${rule.lineId}`);
    if (!tiers.includes(rule.outcome)) errors.push(`${where}outcome 不在 story.lineOutcome.tiers：${String(rule.outcome)}`);
  }
  validateItemGroups(rules.itemGroups ?? [], refs, errors);
  validateParty(rules, refs, eventIds, errors);
  return errors;
}

/** 在队规则（§3.6）：事件/人物/回执/关卡 id 须登记，同一关开局名单只一份，主角不入规则，同事件同人物不能既入又离（whenReceiptId 不同除外）。 */
function validateParty(rules: PlayerLedgerRules, refs: PlayerLedgerRefs, eventIds: Set<string>, errors: string[]): void {
  const joins = rules.partyJoins ?? [];
  const leaves = rules.partyLeaves ?? [];
  const openings = rules.partyOpenings ?? [];
  if (!joins.length && !leaves.length && !openings.length) return;
  const characterIds = new Set(refs.characterIds ?? indexIds('character'));
  const receiptIds = new Set(refs.receiptIds ?? indexIds('receipt'));
  const stageIds = new Set(refs.stageIds ?? Object.keys(stageAccess.stages));
  const protagonists = new Set(refs.protagonistIds ?? PROTAGONIST_CHARACTER_IDS);
  const checkCharacter = (where: string, characterId: string): void => {
    if (!characterIds.has(characterId)) errors.push(`${where}characterId 未知（实体索引 kind=character）：${String(characterId)}`);
    else if (protagonists.has(characterId)) errors.push(`${where}主角不能写进在队规则：${characterId}`);
  };
  const ruleKey = (rule: PartyRule): string => `${rule?.eventId}\u0000${rule?.characterId}`;
  const joinReceipts = new Map<string, Set<string | undefined>>();
  for (const [list, label] of [[joins, '入队'], [leaves, '离队']] as const) {
    for (const rule of list) {
      const where = `${label}规则 ${String(rule?.eventId)} → ${String(rule?.characterId)}：`;
      if (!eventIds.has(rule?.eventId)) errors.push(`${where}eventId 未知：${String(rule?.eventId)}`);
      checkCharacter(where, rule?.characterId);
      if (rule?.whenReceiptId !== undefined && !receiptIds.has(rule.whenReceiptId)) errors.push(`${where}whenReceiptId 未知（实体索引 kind=receipt）：${String(rule.whenReceiptId)}`);
      if (list === joins) {
        if (!joinReceipts.has(ruleKey(rule))) joinReceipts.set(ruleKey(rule), new Set());
        joinReceipts.get(ruleKey(rule))!.add(rule?.whenReceiptId);
      } else if (joinReceipts.get(ruleKey(rule))?.has(rule?.whenReceiptId)) {
        errors.push(`${where}同一事件同一人物不能既入队又离队（whenReceiptId 不同除外）`);
      }
    }
  }
  const seenStages = new Set<string>();
  for (const opening of openings) {
    const where = `开局在队 ${String(opening?.stageId)}：`;
    if (!stageIds.has(opening?.stageId)) errors.push(`${where}stageId 未知（entity-catalog/stage-access.json stages）：${String(opening?.stageId)}`);
    if (seenStages.has(opening?.stageId)) errors.push(`${where}同一关只能有一份开局名单`);
    seenStages.add(opening?.stageId);
    if (!Array.isArray(opening?.characterIds)) { errors.push(`${where}characterIds 须为数组`); continue; }
    for (const characterId of opening.characterIds) checkCharacter(where, characterId);
  }
}

function validateItemGroups(groups: ItemGroupRule[], refs: PlayerLedgerRefs, errors: string[]): void {
  if (!groups.length) return;
  const itemIds = new Set(refs.itemIds ?? indexIds('item'));
  const tradeGrants = new Set(refs.tradeGrantItemIds ?? (GAME_NUMBERS.story.trades as Array<{ grantItemId?: string }>).map(t => t.grantItemId).filter(Boolean) as string[]);
  const groupIds = new Set<string>();
  const ownerOf = new Map<string, string>();
  for (const group of groups) {
    const where = `道具组 ${String(group?.id)}：`;
    if (!group?.id || typeof group.id !== 'string' || !group.id.startsWith(ITEM_GROUP_PREFIX) || group.id.length === ITEM_GROUP_PREFIX.length) errors.push(`${where}id 须为 ${ITEM_GROUP_PREFIX}<名>`);
    else if (RESERVED_ITEM_GROUP_TAILS.includes(group.id.split('.').pop() || '')) errors.push(`${where}id 末段不能是 ${RESERVED_ITEM_GROUP_TAILS.join('/')}`);
    if (groupIds.has(group?.id)) errors.push(`道具组 id 重复：${group.id}`);
    groupIds.add(group?.id);
    if (!Array.isArray(group?.itemIds) || group.itemIds.length === 0) { errors.push(`${where}itemIds 须为非空数组`); continue; }
    for (const itemId of group.itemIds) {
      if (!itemIds.has(itemId)) errors.push(`${where}itemId 未知（实体索引 kind=item）：${String(itemId)}`);
      const owner = ownerOf.get(itemId);
      if (owner !== undefined) errors.push(`${where}itemId ${itemId} 已属道具组 ${owner}（一物只属一组）`);
      else ownerOf.set(itemId, group.id);
      if (tradeGrants.has(itemId)) errors.push(`${where}itemId ${itemId} 出现在 story.trades 的 grantItemId（直写背包不留回执，唯一道具不得走这条路）`);
    }
  }
  for (const group of groups) {
    const where = `道具组 ${String(group?.id)}：`;
    if (group?.whenHeld !== undefined && !ITEM_WHEN_HELD.includes(group.whenHeld)) errors.push(`${where}whenHeld 须为 ${ITEM_WHEN_HELD.join('/')}`);
    if (group?.whenHeld === 'redirect') {
      if (!group.redirectItemId) errors.push(`${where}whenHeld=redirect 须带 redirectItemId`);
      else {
        if (!itemIds.has(group.redirectItemId)) errors.push(`${where}redirectItemId 未知（实体索引 kind=item）：${group.redirectItemId}`);
        const owner = ownerOf.get(group.redirectItemId);
        if (owner !== undefined) errors.push(`${where}redirectItemId ${group.redirectItemId} 属于道具组 ${owner}（改发物品不得入组，防链式改发）`);
      }
    } else if (group?.redirectItemId !== undefined) errors.push(`${where}redirectItemId 只用于 whenHeld=redirect`);
  }
}

let validatedRules: PlayerLedgerRules | undefined;
/** 仓库规则表；首次读取时交叉校验，不过就抛错（同步入口自带 try/catch，不阻断回合）。 */
export function playerLedgerRules(): PlayerLedgerRules {
  if (validatedRules) return validatedRules;
  const rules = rulesJson as unknown as PlayerLedgerRules;
  const errors = validatePlayerLedgerRules(rules);
  if (errors.length) throw new Error(`player-ledger-rules.json 校验失败：${errors.join('；')}`);
  return (validatedRules = rules);
}

/** 测试夹具：整体替换仓库规则表（不再交叉校验），传 undefined 复原为仓库权威。生产代码不调用。 */
export function setPlayerLedgerRulesForTest(rules?: PlayerLedgerRules): void {
  validatedRules = rules;
}

let knownEventIdSet: Set<string> | undefined;
/** 实体索引 kind=event 的 id 集合（缓存）。 */
export const knownEventIds = (): Set<string> => (knownEventIdSet ||= indexIds('event'));

/**
 * 已完成事件（done.* 与规则处理共用这一个口径，身份账设计稿 §4.2）：
 * ① 编年史 type='event' 且 id 恰好为 chronicle.<stageId>.<eventId> 的条目，按 sequence 排（跨关继承）；
 *    eventId 须是已知事件（实体索引 kind=event ∪ 本关 runtime.events），
 *    所以 <eventId>.refused_capture 这类附加条目、type='world' 场外结算都不算；
 * ② 本关 completedEventIds 里尚未出现的按原顺序补在后面，只为补「已完成、编年史尚未落账」的同回合空档；
 *    场外结算（offscreenResolvedEventIds / eventTimeline.outcome='offscreen'）与玩家尚未获知的事件不补，同编年史入账口径。
 * travelLedger 不参与。
 */
export function orderedDoneEventIds(runtime: unknown): string[] {
  const rt = (runtime || {}) as {
    chronicle?: Array<{ id: string; type: string; stageId: string; sequence: number }>;
    completedEventIds?: string[];
    offscreenResolvedEventIds?: string[];
    eventTimeline?: Record<string, { outcome?: string; playerLearnedAtTurn?: number } | undefined>;
    events?: Array<{ id: string; timeline?: unknown }>;
  };
  const stageEvents = new Map((rt.events || []).map(e => [e?.id, e]));
  const isEventId = (id: string): boolean => stageEvents.has(id) || knownEventIds().has(id);
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (id: string | undefined): void => { if (id && !seen.has(id)) { seen.add(id); out.push(id); } };
  const chronicle = [...(rt.chronicle || [])].filter(e => e?.type === 'event').sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  for (const entry of chronicle) {
    // 条目 id＝chronicle.<modId||'unknown'>.<eventId>，stageId＝modId||''
    const prefix = `chronicle.${entry.stageId || 'unknown'}.`;
    if (typeof entry.id !== 'string' || !entry.id.startsWith(prefix)) continue;
    const eventId = entry.id.slice(prefix.length);
    if (isEventId(eventId)) push(eventId);
  }
  const offscreen = new Set(rt.offscreenResolvedEventIds || []);
  for (const id of rt.completedEventIds || []) {
    const timeline = rt.eventTimeline?.[id];
    if (offscreen.has(id) || timeline?.outcome === 'offscreen') continue;
    if (stageEvents.get(id)?.timeline && timeline?.playerLearnedAtTurn === undefined) continue;
    push(id);
  }
  return out;
}
