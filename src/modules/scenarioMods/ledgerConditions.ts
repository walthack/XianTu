import { lineClosedByWorldEvent } from './worldEvents';
/**
 * 账本条件读取（身份账设计稿 2026-10-25 §4）：变体求值用的五类路径
 * identity.* / done.* / line.*.outcome / acq.* / knows.player.*，道具来路 item.*（补充设计稿 2026-10-26 §2.4），在队 party.*（同稿 §3.4，数据源 partyLedger.ts），进度期限 deadline.*（同稿 §4.5，数据源 progressDeadlines.ts），
 * 整线解锁 unlock.<lineId>（太泉解锁设计稿 2026-10-27 §4，数据源 lineUnlock.ts；要读存档里的境界，只有传了 save 的调用方读得到，否则为 undefined），
 * 派生读取点 compass.<id>（右栏线入口复用分析 2026-10-27 §6 R-3，总策划定；数据源＝收束唯一读取点 lineClosed：line.*.outcome，规则表无本线规则时退回 closedWhen）。
 * 支线钥匙（PR-A，用户 2026-11-28 批）：物 item.<id>.held（现在背包里有）、属性 attr.<key>（魅力／心性／悟性／根骨＝先天六司＋后天六司，境界＝九级级数）、
 * 好感 favor.<characterId>（数字）与 favor.<characterId>.tier（好感档 id）。三样都读存档：没传 save 读成 undefined，任何 operator 都不成立。
 * 只读不写；读不到的账本一律当空。不是本模块的前缀交还原 flags 逻辑。
 * narrativeVariants.when 走 evaluateLedgerCondition；activation/completion 等由 runtime.ts 的 resolveConditionValue 委托 resolveLedgerPath（T4，
 * 用户 2026-10-25 23:24 批），那里 gt/gte/lt/lte 只比数字，相识等级比较只在变体里可用（validator 拦）。
 */
import type { ScenarioCondition, ScenarioConditionOperator } from './schema';
import { orderedDoneEventIds } from './playerLedgerRules';
import type { PlayerIdentityLedger } from './identityLedger';
import { lineClosed, nationClosedLineCount, readLineOutcome } from './lineOutcomes';
import { isAcquaintanceKind, rankOf, type AcquaintanceLedger } from './acquaintanceLedger';
import { firstItemReceipt, itemHeldNow } from './itemProvenance';
import { relationshipOf } from './ledger/affinityIdentity';
import { assistLevelOf } from '../sceneModule/assist';
import { levelOf } from '../../utils/realmUtils';
import { isInParty } from './partyLedger';
import { deadlineState } from './progressDeadlines';
import { lineUnlockLedgerValue } from './lineUnlock';
import { SECONDARY_LINES, secondaryLineUnlockOptions } from './secondaryLines';
import { GAME_NUMBERS, resolveNumberRef } from '../sceneModule/numbers';
import { CLOSURE_TALLY_LINE_IDS, COMPASS_CONDITIONS, NATION_LINE_OF_REGION } from '../contentPacks';
import { STAGE_REGION } from './reputationLedger';

export type LedgerPathKind = 'identity' | 'done' | 'line' | 'acq' | 'knows' | 'item' | 'party' | 'deadline' | 'unlock' | 'compass' | 'attr' | 'favor';

/**
 * attr.<key> 只许这五项（用户 2026-11-28 只批了这几项；灵性、气运等不开）：四项六司读 角色.身份.先天六司 + 角色.身份.后天六司 的同名项之和
 * （同判定引擎 judgementPreflight 的口径，不含面板上现算的装备／天赋加成），realm＝levelOf(角色.属性.境界)（同 lineUnlock.ts）。
 */
export const ATTR_KEYS = { charm: '魅力', temperament: '心性', comprehension: '悟性', root_bone: '根骨', realm: '境界' } as const;
export type AttrKey = keyof typeof ATTR_KEYS;
const isAttrKey = (key: string): key is AttrKey => Object.prototype.hasOwnProperty.call(ATTR_KEYS, key);

/** 好感档 id，按区间下限从低到高（numbers-progress affinity.tiers）；favor.<id>.tier 的 gt/gte/lt/lte 按这里的先后比较。 */
export function affinityTierIds(): string[] {
  const tiers = GAME_NUMBERS.affinity.tiers as unknown as Record<string, [number, number]>;
  return Object.entries(tiers).sort((a, b) => a[1][0] - b[1][0]).map(([id]) => id);
}

/**
 * 派生读取点 compass.<id>（R-3，总策划定）：现算，不落存档。
 * anyLineClosed＝计入线 CLOSURE_TALLY_LINE_IDS（各线包 countsTowardClosedLines，现为南荒／晋／宋／汉／唐；太泉、秦不算）里任一条 lineClosed（收束唯一读取点）。
 * 其余 id 由各包 manifest.compassConditions 声明（阶段 2a）：秦线知情拍读的 qinEntryReady 由秦包声明为 closedLinesAtLeast（计数达到配置阈值）；knownWhen 读 Q-1 done。
 * closedWhen 只许 done.*（validator 拦），lineClosed 按编年史判，不回读账本条件，不会成环。
 * 保留 id anyLineClosed 之后接包声明的 id，现值为 ['anyLineClosed','qinEntryReady','hanStillAtShouyang']（旧档事件 conditions 里烘焙了 compass.qinEntryReady，秦包必须一直声明它；
 * hanStillAtShouyang 由汉包声明为 noOtherLineEventsSince，只给「下首阳山」两张入口卡读）。
 */
export const COMPASS_DERIVED_IDS: readonly string[] = ['anyLineClosed', ...COMPASS_CONDITIONS.map(condition => condition.id)];

export interface ParsedLedgerPath {
  kind: LedgerPathKind;
  /** identityId / eventId / lineId / characterId / propositionId / 道具组 id 或 itemId / 期限 id / 整线解锁配置键；格式不对时为空串 */
  id: string;
  /** identity：active＝是否持有，status / from＝子读取；item：active＝是否得过，from＝最早回执的 sourceEventId，held＝现在背包里有；favor：tier＝好感档（缺省＝好感数值） */
  field?: 'active' | 'status' | 'from' | 'held' | 'tier';
  /** 前缀属于本模块但形状不对（如 line.<id> 缺 .outcome、knows.<非 player>、deadline.<id>.state 锁存键） */
  invalid?: boolean;
}

/** 各类路径支持的 operator（§4.1）。party.<characterId> 恒为 boolean，只有 eq / neq；deadline.<id> 的 exists＝已起算；unlock.<lineId> 恒为 boolean（没存档为 undefined），只有 eq / neq；compass.<id> 恒为 boolean，只有 eq / neq。 */
export const LEDGER_OPERATORS: Record<LedgerPathKind, readonly ScenarioConditionOperator[]> = {
  identity: ['eq', 'neq', 'exists'],
  done: ['eq', 'neq'],
  line: ['eq', 'neq', 'exists'],
  acq: ['eq', 'neq', 'exists', 'gt', 'gte', 'lt', 'lte'],
  knows: ['eq', 'neq'],
  item: ['eq', 'neq', 'exists'],
  party: ['eq', 'neq'],
  deadline: ['eq', 'neq', 'exists'],
  unlock: ['eq', 'neq'],
  compass: ['eq', 'neq'],
  attr: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
  favor: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
};

/** item.<id>（是否得过）与 item.<id>.held（现在持有）恒为 boolean，只有 eq / neq；exists 只给 item.<id>.from。 */
const ITEM_OBTAINED_OPERATORS: readonly ScenarioConditionOperator[] = ['eq', 'neq'];

/** 该路径实际可用的 operator（validator 与求值共用）。 */
export function ledgerOperatorsOf(parsed: ParsedLedgerPath): readonly ScenarioConditionOperator[] {
  return parsed.kind === 'item' && parsed.field !== 'from' ? ITEM_OBTAINED_OPERATORS : LEDGER_OPERATORS[parsed.kind];
}

const RANK_OPERATORS = new Set<ScenarioConditionOperator>(['gt', 'gte', 'lt', 'lte']);

/** 读存档的钥匙路径：没读到（没传 save、没有记录）时一律不成立，neq 也不成立（runtime.ts 那条路的 neq 例外，见 validator）。 */
const isSaveKeyPath = (parsed: ParsedLedgerPath): boolean => parsed.kind === 'attr' || parsed.kind === 'favor' || (parsed.kind === 'item' && parsed.field === 'held');

/** 不是账本前缀返回 undefined。 */
export function parseLedgerPath(path: string): ParsedLedgerPath | undefined {
  if (typeof path !== 'string') return undefined;
  const rest = (prefix: string): string => path.slice(prefix.length);
  if (path.startsWith('identity.')) {
    const tail = rest('identity.');
    for (const field of ['from', 'status'] as const) {
      if (tail.endsWith(`.${field}`)) return { kind: 'identity', id: tail.slice(0, -field.length - 1), field };
    }
    return { kind: 'identity', id: tail, field: 'active' };
  }
  if (path.startsWith('done.')) return { kind: 'done', id: rest('done.') };
  if (path.startsWith('line.')) {
    const tail = rest('line.');
    return tail.endsWith('.outcome') && tail.length > '.outcome'.length
      ? { kind: 'line', id: tail.slice(0, -'.outcome'.length) }
      : { kind: 'line', id: '', invalid: true };
  }
  if (path.startsWith('acq.')) return { kind: 'acq', id: rest('acq.') };
  if (path.startsWith('knows.')) {
    return path.startsWith('knows.player.') ? { kind: 'knows', id: rest('knows.player.') } : { kind: 'knows', id: '', invalid: true };
  }
  if (path.startsWith('item.')) {
    const tail = rest('item.');
    // itemId 自身含点号：只认末段 .from / .held（实体索引里没有末段叫 from / held 的 itemId，2026-11-28 查过）
    for (const field of ['from', 'held'] as const) {
      if (tail.endsWith(`.${field}`)) return { kind: 'item', id: tail.slice(0, -field.length - 1), field };
    }
    return { kind: 'item', id: tail, field: 'active' };
  }
  if (path.startsWith('attr.')) {
    const key = rest('attr.');
    return isAttrKey(key) ? { kind: 'attr', id: key } : { kind: 'attr', id: '', invalid: true };
  }
  if (path.startsWith('favor.')) {
    const tail = rest('favor.');
    return tail.endsWith('.tier') ? { kind: 'favor', id: tail.slice(0, -'.tier'.length), field: 'tier' } : { kind: 'favor', id: tail };
  }
  if (path.startsWith('party.')) return { kind: 'party', id: rest('party.') };
  if (path.startsWith('deadline.')) {
    // deadline.<id>.state 是 flags 锁存键，条件只读 deadline.<id>（期限 id 末段不能是 state）
    const tail = rest('deadline.');
    return tail === 'state' || tail.endsWith('.state') ? { kind: 'deadline', id: '', invalid: true } : { kind: 'deadline', id: tail };
  }
  if (path.startsWith('unlock.')) return { kind: 'unlock', id: rest('unlock.') };
  if (path.startsWith('compass.')) {
    const id = rest('compass.');
    return COMPASS_DERIVED_IDS.includes(id) ? { kind: 'compass', id } : { kind: 'compass', id: '', invalid: true };
  }
  return undefined;
}

/** 已完成事件集合（口径见 orderedDoneEventIds：编年史为准，补本关 completedEventIds）。 */
export function completedEventSet(runtime: unknown): Set<string> {
  return new Set(orderedDoneEventIds(runtime));
}

/** 带顺序的版本；与规则处理共用同一实现。 */
export const orderedCompletedEvents = orderedDoneEventIds;

type LedgerRuntime = {
  playerIdentities?: PlayerIdentityLedger;
  flags?: Record<string, unknown>;
  acquaintances?: AcquaintanceLedger;
  actorEngine?: { acquaintance?: AcquaintanceLedger };
  playerKnowledge?: Record<string, { factId?: string; propositionId?: string; status?: string } | undefined>;
};

const asRecord = <T>(value: unknown): T | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as T : undefined;

/** compass.anyLineClosed：任一计入的国家线已收束（lineClosed）。 */
function anyNationLineClosed(runtime: unknown): boolean {
  return CLOSURE_TALLY_LINE_IDS.some(lineId => lineClosed(lineId, runtime));
}

/**
 * 包声明的 compass.<id>（noOtherLineEventsSince）：sinceEventId 已完成，且编年史里排在它后面的事件要么仍在 sinceEventId 那一关，要么所在关属于 lineIds 里的线
 * （关 → 线同 lineCompass.lineOfStage；不属任何国家线的关也算「别处」）。sinceEventId 已完成但编年史尚未落账（同回合空档）时后面没有事件，成立。
 */
function noOtherLineEventsSince(sinceEventId: string, lineIds: readonly string[], runtime: unknown): boolean {
  if (!completedEventSet(runtime).has(sinceEventId)) return false;
  const chronicle = [...((asRecord<{ chronicle?: Array<{ id?: unknown; type?: unknown; stageId?: unknown; sequence?: unknown }> }>(runtime)?.chronicle) || [])]
    .filter(entry => entry?.type === 'event')
    .sort((a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0));
  const at = chronicle.findIndex(entry => typeof entry.id === 'string' && entry.id.endsWith(`.${sinceEventId}`));
  if (at < 0) return true;
  const sinceStageId = chronicle[at].stageId;
  return chronicle.slice(at + 1).every(entry => {
    if (entry.stageId === sinceStageId) return true;
    const region = typeof entry.stageId === 'string' ? STAGE_REGION[entry.stageId] : undefined;
    const lineId = region ? NATION_LINE_OF_REGION[region] : undefined;
    return lineId !== undefined && lineIds.includes(lineId);
  });
}

/** 包声明的 compass.<id>（closedLinesAtLeast）：先判 unlessLineClosedByWorldEvent，再计数（顺序同原 qinEntryReady；lineClosed 有调试日志副作用）。min 现读数值权威，热改有效。 */
function compassConditionHolds(id: string, runtime: unknown, save?: unknown): boolean | undefined {
  const condition = COMPASS_CONDITIONS.find(c => c.id === id);
  if (!condition) return undefined;
  if (condition.kind === 'noOtherLineEventsSince') return noOtherLineEventsSince(condition.sinceEventId, condition.lineIds, runtime);
  if (condition.unlessLineClosedByWorldEvent !== undefined && lineClosedByWorldEvent(save, runtime, condition.unlessLineClosedByWorldEvent)) return false;
  return nationClosedLineCount(runtime) >= resolveNumberRef(condition.min);
}

function readPath(parsed: ParsedLedgerPath, runtime: unknown, save?: unknown): unknown {
  const rt = (asRecord<LedgerRuntime>(runtime) || {}) as LedgerRuntime;
  switch (parsed.kind) {
    case 'identity': {
      // 无记录为 undefined：eq true＝持有中，exists＝曾持有（撤销后记录保留）
      const record = asRecord<PlayerIdentityLedger>(rt.playerIdentities)?.[parsed.id];
      if (!record) return undefined;
      if (parsed.field === 'status') return record.status;
      if (parsed.field === 'from') return record.acquiredAtEventId;
      return record.status === 'active';
    }
    case 'done':
      return completedEventSet(runtime).has(parsed.id);
    case 'line':
      return readLineOutcome(asRecord(rt.flags), parsed.id);
    case 'acq': {
      // 新账优先，旧 actorEngine.acquaintance 兜底，同 legacyNarratorPacket
      const record = asRecord<AcquaintanceLedger>(rt.acquaintances)?.[parsed.id]
        ?? asRecord<AcquaintanceLedger>(rt.actorEngine?.acquaintance)?.[parsed.id];
      return record?.kind;
    }
    case 'knows':
      return Object.values(asRecord<NonNullable<LedgerRuntime['playerKnowledge']>>(rt.playerKnowledge) || {})
        .some(fact => fact?.status === 'confirmed' && (fact.propositionId === parsed.id || fact.factId === parsed.id));
    case 'item': {
      // .held 只看背包现存（要存档）；其余只看回执（含读档回填）；没得过：item.<id> 为 false，.from 为 undefined
      if (parsed.field === 'held') return itemHeldNow(save, parsed.id);
      const receipt = firstItemReceipt(runtime, parsed.id);
      return parsed.field === 'from' ? receipt?.sourceEventId : receipt !== undefined;
    }
    case 'party':
      // 显式在队账（开局名单 → 编年史顺序入/离队 → 去掉 departedCast）；不在队为 false
      return isInParty(runtime, parsed.id);
    case 'deadline':
      // 锁存（due / cleared）优先，否则按编年史现算；未起算为 undefined
      return deadlineState(runtime, parsed.id);
    case 'unlock': {
      // 境界在存档里：没传 save 读成 undefined（不通过）。本线必有配置；门后节点已完成＝已走进，追认解锁
      const line = SECONDARY_LINES.find(l => l.unlock === parsed.id);
      return lineUnlockLedgerValue(save, parsed.id, { ...(line ? secondaryLineUnlockOptions(line) : { required: true }), runtime });
    }
    case 'compass':
      // 只读收束档与编年史（closedWhen 只许 done.*），不新增存档字段
      return parsed.id === 'anyLineClosed' ? anyNationLineClosed(runtime) : compassConditionHolds(parsed.id, runtime, save);
    case 'attr':
      return readAttr(save, parsed.id as AttrKey);
    case 'favor':
      return readFavor(save, parsed.id, parsed.field === 'tier');
  }
}

type KeySave = { 角色?: { 身份?: { 先天六司?: Record<string, unknown>; 后天六司?: Record<string, unknown> }; 属性?: { 境界?: unknown } }; 社交?: { 关系?: Record<string, unknown> } };

/** attr.<key>：没存档（或占位存档没有 角色）、先天六司读不出该项、境界名不认识 → undefined。后天六司缺项按 0。 */
function readAttr(save: unknown, key: AttrKey): number | undefined {
  const role = asRecord<KeySave>(save)?.角色;
  if (!role) return undefined;
  if (key === 'realm') return levelOf(role.属性?.境界) ?? undefined;
  const name = ATTR_KEYS[key];
  const innate = Number(role.身份?.先天六司?.[name]);
  if (!Number.isFinite(innate)) return undefined;
  const acquired = Number(role.身份?.后天六司?.[name]);
  return innate + (Number.isFinite(acquired) ? acquired : 0);
}

/** favor.<characterId>：社交.关系 里 角色ID 等于它的唯一记录的 好感度（relationshipOf）；没存档、没记录、好感度不是数 → undefined。.tier＝好感档 id（assistLevelOf）。 */
function readFavor(save: unknown, characterId: string, tier: boolean): number | string | undefined {
  const record = asRecord<KeySave>(save) ? relationshipOf(save as KeySave, characterId) : undefined;
  if (!record) return undefined;
  const value = Number(record.profile.好感度);
  if (!Number.isFinite(value)) return undefined;
  return tier ? assistLevelOf(value).tier : value;
}

/** 解析五类路径；不是本模块的前缀返回 { handled:false }。rankCompare＝gt/gte/lt/lte 按相识等级比较。save 给 unlock.*、item.*.held、attr.*、favor.* 用。 */
export function resolveLedgerPath(path: string, runtime: unknown, save?: unknown): { handled: boolean; value?: unknown; rankCompare?: boolean } {
  const parsed = parseLedgerPath(path);
  if (!parsed) return { handled: false };
  if (parsed.invalid || !parsed.id) return { handled: true, value: undefined };
  return { handled: true, value: readPath(parsed, runtime, save), ...(parsed.kind === 'acq' ? { rankCompare: true } : {}) };
}

/**
 * undefined＝不是本模块的路径，交给原逻辑。
 * 账本路径在没有 runtime、路径形状不对或 operator 不支持时一律不命中（false），不回落 flags。
 * save 给 unlock.*、item.*.held、attr.*、favor.* 用（读存档）：没传时这几样恒不成立；变体求值（eventNarrativeView）与右栏当前线卡的下一步表（lineCompass.ts）都传存档。
 * attr.* / favor.<id> 的 gt/gte/lt/lte 按数字比；favor.<id>.tier 按好感档先后比（value 须是档 id）。
 */
export function evaluateLedgerCondition(condition: ScenarioCondition, runtime?: unknown, save?: unknown): boolean | undefined {
  const parsed = parseLedgerPath(condition?.path);
  if (!parsed) return undefined;
  if (!runtime || parsed.invalid || !parsed.id || !ledgerOperatorsOf(parsed).includes(condition.operator)) return false;
  const { value: actual, rankCompare } = resolveLedgerPath(condition.path, runtime, save);
  if (isSaveKeyPath(parsed)) return compareSaveKey(parsed, condition, actual);
  if (condition.operator === 'exists') return actual !== undefined;
  if (condition.operator === 'eq') return actual === condition.value;
  if (condition.operator === 'neq') return actual !== condition.value;
  if (!rankCompare || !RANK_OPERATORS.has(condition.operator) || !isAcquaintanceKind(condition.value)) return false;
  const left = isAcquaintanceKind(actual) ? rankOf(actual) : 0;
  const right = rankOf(condition.value);
  if (condition.operator === 'gt') return left > right;
  if (condition.operator === 'gte') return left >= right;
  if (condition.operator === 'lt') return left < right;
  return left <= right;
}

/** item.*.held / attr.* / favor.* 的比较：读不到为不成立；favor.<id>.tier 的大小比较按档位先后，其余大小比较只比数字。 */
function compareSaveKey(parsed: ParsedLedgerPath, condition: ScenarioCondition, actual: unknown): boolean {
  if (actual === undefined) return false;
  if (condition.operator === 'eq') return actual === condition.value;
  if (condition.operator === 'neq') return actual !== condition.value;
  let left: unknown = actual, right: unknown = condition.value;
  if (parsed.kind === 'favor' && parsed.field === 'tier') {
    const order = affinityTierIds();
    left = order.indexOf(actual as string);
    right = typeof condition.value === 'string' ? order.indexOf(condition.value) : -1;
    if ((left as number) < 0 || (right as number) < 0) return false;
  }
  if (typeof left !== 'number' || typeof right !== 'number') return false;
  if (condition.operator === 'gt') return left > right;
  if (condition.operator === 'gte') return left >= right;
  if (condition.operator === 'lt') return left < right;
  return condition.operator === 'lte' && left <= right;
}
