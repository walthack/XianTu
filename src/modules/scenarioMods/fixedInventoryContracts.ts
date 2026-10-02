import type { ScenarioPlayerCompletionEffects } from './schema';
import type { SaveData } from '@/types/game';
import { detectNarratedInventoryGainEntries, getInventoryItemIdentityKey } from '@/utils/narratedInventory';

export const SILK_POUCH_ITEM_ID = 'lcq.item.jin_nang';
export const SILK_POUCH_TRANSFER_ID = 'lcq.event.s02_01.inventory.jin_nang';
export const ZIPPER_ITEM_ID = 'lcq.item.zipper';
const ZIPPER_ALIASES = new Set(['lcq.item.np001', 'lcq.item.np002']);
const ITEM_ID_PATTERN = /(?:lcq|liuchao|playtest)\.item\.[a-z0-9_]+/gi;
export const ITEM_REFERENCE_PURPOSES = ['owned', 'scene', 'claim', 'grant'] as const;
export type ItemReferencePurpose = typeof ITEM_REFERENCE_PURPOSES[number];
export interface StructuredItemReference {
  id: string;
  purpose: ItemReferencePurpose;
}

const CLAIM_VERB = /(?:接过|收下|获得|得到|购得|买下|捡起|缴获|收入(?:囊中|袋中|包中))/;
const SCENE_MENTION_CUE = /(?:案上|桌上|台上|手里|手中|怀中|袖中|腰间|袋中|包里|地上|一旁|旁边)(?:还)?(?:放着|摆着|搁着|握着|拿着|装着|带着)/;
const UNREGISTERED_POSSESSION = /(?:你(?!们)|程宗扬)(?:把|将)?(?:那|这)?(?:一)?(?:把|枚|只|个|条|件)?([^，。！？；\n]{2,16}?)(?:别在腰间|佩上|抽出|握在手中|拿在手里)/g;

export interface RegisteredItemRecord {
  id: string;
  name: string;
}

export interface ItemReferenceContext {
  catalog: RegisteredItemRecord[];
  ownedIds: string[];
  authorizedGrantIds: string[];
  authorizedGrantNames: string[];
}

export function usesFixedScenarioInventory(save: SaveData): boolean {
  const runtime = (save as any)?.世界?.状态?.剧本模组;
  return runtime?.storyMode !== 'world_sim'
    && /^(?:lcq\.|playtest\.xingyuehu\.)/.test(String(runtime?.modId || ''));
}

export function collectRegisteredItemCatalog(save: SaveData | null | undefined): RegisteredItemRecord[] {
  const items = (save as { 世界?: { 状态?: { 剧本模组?: { canon?: { items?: unknown } } } } } | null | undefined)
    ?.世界?.状态?.剧本模组?.canon?.items;
  if (!Array.isArray(items)) return [];
  const catalog = items
    .filter((item): item is { id: string; name?: string } => !!item && typeof (item as { id?: unknown }).id === 'string')
    .map(item => ({ id: item.id, name: String(item.name || '') }));
  if (usesFixedScenarioInventory(save as SaveData) && !catalog.some(item => item.id === 'lcq.item.ajiman_bond')) catalog.push({ id: 'lcq.item.ajiman_bond', name: '阿姬曼身契' });
  return catalog;
}

export function ownedInventoryItemIds(save: SaveData | null | undefined): string[] {
  const inventory = (save as { 角色?: { 背包?: { 物品?: Record<string, unknown> } } } | null | undefined)?.角色?.背包?.物品;
  if (!inventory || typeof inventory !== 'object') return [];
  return Object.entries(inventory)
    .filter(([, item]) => {
      const quantity = Number((item as { 数量?: unknown } | null | undefined)?.数量);
      return Number.isFinite(quantity) && quantity > 0;
    })
    .map(([id]) => id);
}

export function buildItemReferenceContext(
  save: SaveData | null | undefined,
  authorizedGrantIds: string[] = [],
  authorizedGrantNames: string[] = [],
): ItemReferenceContext {
  return {
    catalog: collectRegisteredItemCatalog(save),
    ownedIds: ownedInventoryItemIds(save),
    authorizedGrantIds: [...new Set(authorizedGrantIds.filter(Boolean))],
    authorizedGrantNames: [...new Set(authorizedGrantNames.filter(Boolean))],
  };
}

function catalogIdSet(context?: ItemReferenceContext): Set<string> {
  return new Set((context?.catalog || []).map(item => item.id));
}

function resolveCatalogIdByName(name: string, context?: ItemReferenceContext): string | undefined {
  const key = getInventoryItemIdentityKey(name);
  if (!key) return undefined;
  const match = (context?.catalog || []).filter(item => getInventoryItemIdentityKey(item.name) === key
    || getInventoryItemIdentityKey(item.id) === key);
  return match.length === 1 ? match[0].id : undefined;
}

function inventoryItemIdFromKey(key: string): string | undefined {
  const prefix = '角色.背包.物品.';
  if (!key.startsWith(prefix)) return undefined;
  const rest = key.slice(prefix.length);
  if (!rest) return undefined;
  for (const field of ['数量', '已装备', '修炼中', '修炼进度', '已解锁技能']) {
    if (rest.endsWith(`.${field}`)) return rest.slice(0, -(field.length + 1));
  }
  return rest;
}

export function extractStructuredItemIds(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (node: unknown) => {
    if (node == null) return;
    if (typeof node === 'string') {
      for (const match of node.match(ITEM_ID_PATTERN) || []) found.add(match);
      const fromKey = inventoryItemIdFromKey(node);
      if (fromKey) found.add(fromKey);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node === 'object') {
      const record = node as Record<string, unknown>;
      if (typeof record.物品ID === 'string' && record.物品ID.trim()) found.add(record.物品ID.trim());
      if (typeof record.itemId === 'string' && record.itemId.trim()) found.add(record.itemId.trim());
      Object.values(record).forEach(visit);
    }
  };
  visit(value);
  return [...found];
}

export function unknownStructuredItemIds(ids: string[], context?: ItemReferenceContext): string[] {
  if (!context) return [];
  const allowed = currentSceneItemAllowlist(context);
  return ids.filter(id => !allowed.has(id));
}

export function unauthorizedStructuredItemWrites(ids: string[], context?: ItemReferenceContext): string[] {
  if (!context) return [];
  const owned = new Set(context.ownedIds);
  const granted = new Set(context.authorizedGrantIds);
  return ids.filter(id => !owned.has(id) && !granted.has(id));
}

/** 当前场景允许集：已登记 catalog、已拥有背包、本轮交付合同。同名字符串不是权威。 */
export function currentSceneItemAllowlist(context: ItemReferenceContext): Set<string> {
  return new Set([
    ...context.catalog.map(item => item.id),
    ...context.ownedIds,
    ...context.authorizedGrantIds,
  ]);
}

/** 调用级协议提示：结构化 ID 为权威，8192/max_tokens 不是正文字数上限。 */
export function formatItemReferenceProtocolHint(context: ItemReferenceContext): string {
  const allow = [...currentSceneItemAllowlist(context)];
  const allowLine = allow.length ? `当前场景允许集：${allow.join('、')}` : '当前场景允许集为空';
  return [
    '【调用级篇幅】只写本次即时过程与直接结果，不要为了写满输出预算而注水。调用级 max_tokens 不是正文字数上限。',
    `【道具引用协议】只可使用 item_references:[{id,purpose}]，purpose 仅 owned|scene|claim|grant。${allowLine}。未知 ID 与未授权领取 fail closed。scene 可提及已登记未拥有的场景道具，不得写成入手。同名字符串不是库存权威。`,
  ].join('');
}

export function parseStructuredItemReferences(raw: unknown): StructuredItemReference[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(ITEM_REFERENCE_PURPOSES);
  const parsed: StructuredItemReference[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const rec = entry as { id?: unknown; itemId?: unknown; purpose?: unknown; 用途?: unknown };
    const id = String(rec.id || rec.itemId || '').trim();
    const purpose = String(rec.purpose || rec.用途 || '').trim();
    if (!id) continue;
    parsed.push({
      id,
      purpose: allowed.has(purpose) ? purpose as ItemReferencePurpose : 'claim',
    });
  }
  return parsed;
}

/** All ownership/identity changes must come from local contracts, including catalog items. */
export function fixedInventoryCommandViolation(save: SaveData, key: string): string | null {
  if (!usesFixedScenarioInventory(save)) return null;
  const root = '角色.背包.物品';
  if (key !== root && !key.startsWith(`${root}.`) && !root.startsWith(`${key}.`)) return null;
  const inventory = (save as any)?.角色?.背包?.物品 || {};
  for (const id of Object.keys(inventory)) {
    if (['已装备', '修炼中', '修炼进度', '已解锁技能'].some(field => key === `${root}.${id}.${field}`)) return null;
  }
  return '道具身份、数量与获得/消耗仅可由本地道具合同写入，模型无权创建或改写';
}

function isAuthorizedGrantName(name: string, grantedNames: string[], context?: ItemReferenceContext): boolean {
  const key = getInventoryItemIdentityKey(name);
  if (!key) return false;
  if (grantedNames.some(item => getInventoryItemIdentityKey(item) === key)) return true;
  if ((context?.authorizedGrantNames || []).some(item => getInventoryItemIdentityKey(item) === key)) return true;
  const catalogId = resolveCatalogIdByName(name, context);
  return !!catalogId && (context?.authorizedGrantIds || []).includes(catalogId);
}

function isSceneMentionClause(clause: string): boolean {
  if (CLAIM_VERB.test(clause) && /(?:你(?!们)|程宗扬)/.test(clause)) return false;
  return SCENE_MENTION_CUE.test(clause) || /(?:看见|看到|望见|注意到|摆着|放着)/.test(clause);
}

/** Observation only: never synthesize an inventory object from prose. Same-name strings are not inventory authority. */
export function unsupportedInventoryGainNames(
  text: string,
  grantedNames: string[],
  context?: ItemReferenceContext,
): string[] {
  const allowed = new Set(grantedNames.map(getInventoryItemIdentityKey));
  const detected = detectNarratedInventoryGainEntries(text)
    .map(item => item.名称)
    .filter(name => !isAuthorizedGrantName(name, grantedNames, context) && !allowed.has(getInventoryItemIdentityKey(name)));
  // Covers named props outside the old noun dictionary, including 锦囊 and arbitrary invented swords.
  for (const match of text.matchAll(/(?:你(?!们)|程宗扬)(?:郑重|小心|顺手|当面)?(?:接过|收下|获得|得到|购得|买下|捡起|缴获)(?:了)?([^，。！？；\n]{1,22})/g)) {
    const name = match[1].replace(/^(?:一|这|那)(?:枚|把|只|个|条|件|张|颗)/, '').trim();
    if (/消息|情报|线索|回答|回应|帮助|许可|允许|支持|机会|信任|认可|结果|答案|解释|喘息|托付|差事|委托/.test(name)) continue;
    if (isAuthorizedGrantName(name, grantedNames, context)) continue;
    detected.push(name);
  }
  for (const match of text.matchAll(UNREGISTERED_POSSESSION)) {
    const name = match[1].replace(/^(?:一|这|那)(?:枚|把|只|个|条|件|张|颗)/, '').trim();
    if (!name || /消息|情报|线索|回答|回应/.test(name)) continue;
    if (isAuthorizedGrantName(name, grantedNames, context)) continue;
    if (resolveCatalogIdByName(name, context)) continue;
    detected.push(name);
  }
  return [...new Set(detected)];
}

/** 删去未授权获得句后，正文至少还要剩这么多字才保留；否则整段回落为提示。 */
export const MIN_KEPT_NARRATIVE_CHARS = 40;

/**
 * 只删除含"未授权获得"声明的句子，保留其余正文（2026-10-01 真机反馈：整段清空误伤过大）。
 * 删后整段若仍检出未授权获得（跨句写法），返回 null，由调用方 fail closed 回落为提示。
 */
export function stripUnsupportedGainClauses(
  text: string,
  grantedNames: string[],
  context?: ItemReferenceContext,
): { text: string; removed: string[] } | null {
  const segments = String(text || '').match(/[^。！？!?\n]+[。！？!?]*[”’」』"]*|\n+/g) || [];
  const removed: string[] = [];
  const kept = segments.filter(segment => {
    if (/^\n+$/.test(segment)) return true;
    if (unsupportedInventoryGainNames(segment, grantedNames, context).length) { removed.push(segment.trim()); return false; }
    return true;
  });
  const result = kept.join('').replace(/\n{3,}/g, '\n\n').trim();
  if (unsupportedInventoryGainNames(result, grantedNames, context).length) return null;
  return { text: result, removed };
}

/**
 * 发布路径：结构化 item_references ID+用途为权威；未知 ID / 未授权领取 fail closed。
 * 已登记未拥有的场景道具可提及。未登记占有写法会拒绝发布，但纯自由文本仍可能漏过未覆盖措辞。
 */
export function inspectPublishedItemReferences(
  text: string,
  commands: unknown[] | undefined,
  context: ItemReferenceContext,
  itemReferences?: StructuredItemReference[] | unknown,
): { unknownIds: string[]; unauthorizedClaims: string[]; sceneMentions: string[] } {
  const structured = parseStructuredItemReferences(itemReferences);
  const commandIds = extractStructuredItemIds(commands || []);
  const structuredIds = structured.map(item => item.id);
  const unknownIds = unknownStructuredItemIds([...commandIds, ...structuredIds], context);
  const unknownSet = new Set(unknownIds);
  const unauthorizedWrites = unauthorizedStructuredItemWrites(
    commandIds.filter(id => !unknownSet.has(id)),
    context,
  );
  const granted = new Set(context.authorizedGrantIds);
  const owned = new Set(context.ownedIds);
  const catalog = catalogIdSet(context);
  const unauthorizedStructured = structured.filter(item => {
    if (unknownSet.has(item.id)) return true;
    if (item.purpose === 'scene') return !catalog.has(item.id);
    if (item.purpose === 'owned') return !owned.has(item.id);
    return !granted.has(item.id);
  }).map(item => item.id);
  const unauthorizedClaims = [
    ...unsupportedInventoryGainNames(text, context.authorizedGrantNames, context),
    ...unauthorizedWrites,
    ...unauthorizedStructured,
  ];
  const sceneMentions: string[] = [];
  const catalogNames = context.catalog.filter(item => item.name);
  for (const clause of String(text || '').split(/[。！？；\n]/)) {
    if (!isSceneMentionClause(clause)) continue;
    for (const item of catalogNames) {
      if (clause.includes(item.name) && !owned.has(item.id)) {
        sceneMentions.push(item.id);
      }
    }
  }
  for (const item of structured) {
    if (item.purpose === 'scene' && catalog.has(item.id) && !unknownSet.has(item.id)) {
      sceneMentions.push(item.id);
    }
  }
  return {
    unknownIds: [...unknownSet],
    unauthorizedClaims: [...new Set(unauthorizedClaims)],
    sceneMentions: [...new Set(sceneMentions)],
  };
}

/** Explicit story-action contract. Prose, names in player input and model commands are not evidence. */
export function fixedStoryInventoryEffects(eventId: string, actionId: string): ScenarioPlayerCompletionEffects | undefined {
  if (eventId !== 'lcq.event.s02_01' || actionId !== 'advance_declared_objective') return undefined;
  return { inventoryTransfers: [{ transferId: SILK_POUCH_TRANSFER_ID, itemId: SILK_POUCH_ITEM_ID, quantity: 1 }] };
}

/** The stage catalogs use two IDs for the same fixed starter zipper. Map only these known aliases. */
export function mergeFixedScenarioStarterInventory(
  current: Record<string, any>,
  incoming: Record<string, any>,
): Record<string, any> {
  const result = { ...current };
  const canonicalize = (id: string, item: any) =>
    ZIPPER_ALIASES.has(id) && item?.名称 === '拉链' ? ZIPPER_ITEM_ID : id;
  for (const [id, item] of Object.entries(current)) {
    const key = canonicalize(id, item);
    if (key === id) continue;
    const quantity = Math.max(Number(result[key]?.数量) || 0, Number(item.数量) || 0);
    result[key] = { ...item, ...result[key], 物品ID: key, 数量: quantity };
    delete result[id];
  }
  for (const [id, item] of Object.entries(incoming)) {
    const key = canonicalize(id, item);
    // Switching chapters must not replenish or duplicate an existing starter object.
    if (key === ZIPPER_ITEM_ID && result[key]) continue;
    result[key] = key === id ? item : { ...item, 物品ID: key };
  }
  return result;
}
