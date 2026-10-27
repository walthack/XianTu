/**
 * 整线解锁（太泉解锁设计稿 2026-10-27 §3；用户 2026-10-27 01:12／01:28 定）：三条同时满足才解锁，阈值只读配置 story.lineUnlock.<lineId>。
 * - 境界：levelOf(角色.属性.境界) ≥ minRealmLevel（只看九级，小阶段不看）；境界名不认识＝未达，记 LCQ-SAV-029 realm_unreadable。
 * - 线数：closedLineIds(runtime, countTiers) 条数 ≥ minClosedLines（逐条读唯一读取点 lineClosed；只数判档线，太泉不在其中；没去、半路走掉不算）。
 * - 期限：requireDeadlinesCleared 每项 deadlineState 为 cleared；读不到（未上线、未起算）按通过（总策划 01:28）。
 * - 已走进本线（调用方传入的本线节点事件任一已完成）一律视为已解锁（总策划 2026-10-27 定 §14-4）：兼容旧档、冗余门与入口门判法一致。
 * 三项都单调（境界只升、收束档 writeOnce、期限 cleared 锁存），故解锁结果不锁存、不加存档字段；配置每次调用现读，热改即时生效。
 * 不设 enforce 开关（总策划 2026-10-27 定 §14-3）。不反向依赖 secondaryLines（避免成环），本线节点事件 id 由调用方传入。
 * 出错记 LCQ-SAV-029（同一 reason＋id 本会话只记一次）：判定抛错锁住（已走进仍放行）；说法判定抛错退回王哲版。
 */
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { closedLineIds } from './lineOutcomes';
import { deadlineState, type DeadlineState } from './progressDeadlines';
import { orderedDoneEventIds, playerLedgerRules } from './playerLedgerRules';
import { levelOf } from '../../utils/realmUtils';
import { logEventOnce } from '../diagnostics/log';
import { debugEnabled, debugLog } from '../diagnostics/debugLog';

export type LineUnlockGap = 'realm' | 'lines' | 'deadline';
/** 缺项固定顺序 realm → lines → deadline（方案 二-4「修为 → 线数 → 冰蛊」）。 */
export const LINE_UNLOCK_GAPS: readonly LineUnlockGap[] = ['realm', 'lines', 'deadline'];

export interface LineUnlockConfig {
  minRealmLevel: number;
  minClosedLines: number;
  countTiers: readonly string[];
  requireDeadlinesCleared: readonly string[];
}

export interface LineUnlockStatus {
  lineId: string;
  unlocked: boolean;
  /** 已走进本线（任一节点事件已完成）→ unlocked 恒为 true，missing 为空，不再读期限（deadlines 为空） */
  entered: boolean;
  /** 固定顺序 realm → lines → deadline */
  missing: LineUnlockGap[];
  realm: { level: number | null; need: number };
  /** short＝max(0, need − 已收束条数)，即文案里的 {X} */
  lines: { closedIds: string[]; need: number; short: number };
  deadlines: Array<{ id: string; state: DeadlineState | undefined; pass: boolean }>;
  /** 读数异常、按锁住处理时才有（SAV-029）；此时 missing 为空、realm/lines 为占位 */
  failure?: 'config_missing' | 'eval_failed';
}

export interface LineUnlockOptions {
  /** 本线节点事件 id（太泉＝secondaryLines 太泉线 nodes[*].eventId），任一已完成即 entered；缺省不追认 */
  enteredEventIds?: readonly string[];
  /** 调用方声明本线必有配置（如 secondaryLines 的 unlock 字段）：配置不在时记 config_missing 并锁住，而不是当作不设锁 */
  required?: boolean;
  /** 判定读的剧本运行时（账本条件求值时＝runtime.ts 传入的 runtime）；缺省取 save.世界.状态.剧本模组 */
  runtime?: unknown;
}

/** 进太泉的说法：原著版（萧遥逸受伤那一拍已完成）／王哲托付＋徐君房带路版。 */
export type TaiquanEntryVariant = 'song' | 'wangzhe';
/** 萧遥逸受伤那一拍（设计稿 §7：秦翰生擒萧遥逸，萧遥逸重伤线开启；原著诊断伤情在第274章，无单独事件，取最近承载拍）。 */
export const TAIQUAN_SONG_VARIANT_EVENT_ID = 'lcq.event.s12_10_rescue_xiao';

const runtimeOf = (save: unknown): any => (save as any)?.世界?.状态?.剧本模组;

/** story.lineUnlock.<lineId>；没配置为 undefined（note 不是线）。每次现读，热改即时生效。 */
export function lineUnlockConfig(lineId: string): LineUnlockConfig | undefined {
  if (lineId === 'note') return undefined;
  const table = GAME_NUMBERS.story.lineUnlock as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(table, lineId)) return undefined;
  const conf = table[lineId];
  return conf && typeof conf === 'object' && !Array.isArray(conf) ? conf as LineUnlockConfig : undefined;
}

/** 读数异常留痕（非 catch 处）：同一 reason＋id 本会话只记一次。 */
const sav029 = (reason: string, id: string, msg: string, detail: Record<string, unknown>): void => {
  logEventOnce(`LCQ-SAV-029:${reason}:${id}`, { code: 'LCQ-SAV-029', msg, detail: { reason, ...detail } });
};

function enteredLine(runtime: unknown, eventIds: readonly string[] | undefined): boolean {
  if (!eventIds?.length) return false;
  const ids = new Set(eventIds);
  return orderedDoneEventIds(runtime).some(id => ids.has(id));
}

function failedStatus(lineId: string, entered: boolean, failure: NonNullable<LineUnlockStatus['failure']>): LineUnlockStatus {
  return { lineId, unlocked: entered, entered, missing: [], realm: { level: null, need: NaN }, lines: { closedIds: [], need: NaN, short: NaN }, deadlines: [], failure };
}

const lastDebugKey = new Map<string, string>();
/** 判定结果变化时打一行（RightSidebar 的 computed 求值频繁，按上次结果去重）；大类关着时不记上次结果，打开后先打一次当前结果。 */
function debugOnChange(scope: string, msg: string, data: () => unknown): void {
  if (!debugEnabled('story') || lastDebugKey.get(scope) === msg) return;
  lastDebugKey.set(scope, msg);
  debugLog('story', msg, data);
}

const shortDeadlineId = (id: string): string => id.split('.').pop() || id;

/**
 * 整线解锁状态。没配 story.lineUnlock.<lineId> 的线返回 undefined（不设锁，调用方照旧开放）；opts.required 时改为记 config_missing 并锁住。
 * 判定抛错记 eval_failed 并锁住，但已走进本线的存档仍放行。
 */
export function lineUnlockStatus(save: unknown, lineId: string, opts: LineUnlockOptions = {}): LineUnlockStatus | undefined {
  let entered = false;
  try {
    const runtime = opts.runtime !== undefined ? opts.runtime : runtimeOf(save);
    entered = enteredLine(runtime, opts.enteredEventIds);
    const conf = lineUnlockConfig(lineId);
    if (!conf) {
      if (!opts.required) return undefined;
      if (!entered) sav029('config_missing', lineId, `整线解锁 ${lineId} 缺配置 story.lineUnlock.${lineId}，按锁住处理`, { lineId });
      return failedStatus(lineId, entered, 'config_missing');
    }
    const realmName = save && typeof save === 'object' ? (save as any).角色?.属性?.境界 : undefined;
    const level = levelOf(realmName);
    const closedIds = closedLineIds(runtime, conf.countTiers);
    const lines = { closedIds, need: conf.minClosedLines, short: Math.max(0, conf.minClosedLines - closedIds.length) };
    const realm = { level, need: conf.minRealmLevel };
    if (entered) {
      const status: LineUnlockStatus = { lineId, unlocked: true, entered, missing: [], realm, lines, deadlines: [] };
      debugOnChange(lineId, `[整线解锁] ${lineId} 已走进本线 → 解锁（追认）`, () => status);
      return status;
    }
    if (level === null) {
      sav029('realm_unreadable', lineId, `整线解锁 ${lineId} 读不出主角境界（${String(typeof realmName === 'string' ? realmName : realmName?.名称)}），按未达处理`, { lineId, realm: typeof realmName === 'string' ? realmName : realmName?.名称 });
    }
    const defs = playerLedgerRules().progressDeadlines ?? [];
    const deadlines = conf.requireDeadlinesCleared.map(id => {
      const defined = defs.some(d => d.id === id);
      // 规则表里已有期限却找不到这个 id，多半是拼错：与「读不到按通过」同口径放行，但留痕
      if (!defined && defs.length) sav029('deadline_unknown', id, `整线解锁 ${lineId} 要求的期限 ${id} 不在规则表 progressDeadlines，按通过处理`, { lineId, deadlineId: id });
      const state = defined ? deadlineState(runtime, id) : undefined;
      return { id, state, pass: state === undefined || state === 'cleared', defined };
    });
    const pass: Record<LineUnlockGap, boolean> = {
      realm: level !== null && level >= realm.need,
      lines: closedIds.length >= lines.need,
      deadline: deadlines.every(d => d.pass),
    };
    const missing = LINE_UNLOCK_GAPS.filter(gap => !pass[gap]);
    const status: LineUnlockStatus = { lineId, unlocked: !missing.length, entered, missing, realm, lines, deadlines: deadlines.map(({ id, state, pass }) => ({ id, state, pass })) };
    const deadlineText = deadlines.map(d => `${shortDeadlineId(d.id)}=${d.defined ? d.state ?? '未起算' : '未上线'}`).join(' ') || '无';
    debugOnChange(lineId, `[整线解锁] ${lineId} 境界 ${level ?? '?'}/${realm.need} 收束 ${closedIds.length}/${lines.need}（${closedIds.join(',') || '—'}）期限 ${deadlineText} → ${missing.length ? `锁（缺 ${missing.join(',')}）` : '解锁'}`, () => status);
    return status;
  } catch (error) {
    logEventOnce(`LCQ-SAV-029:eval_failed:${lineId}`, {
      code: 'LCQ-SAV-029', msg: `整线解锁 ${lineId} 判定出错，${entered ? '已走进本线，照常放行' : '按锁住处理'}`, cause: error, detail: { reason: 'eval_failed', lineId, entered },
    });
    return failedStatus(lineId, entered, 'eval_failed');
  }
}

/** 是否解锁；没配置（且未声明 required）的线为 true。 */
export function isLineUnlocked(save: unknown, lineId: string, opts: LineUnlockOptions = {}): boolean {
  return lineUnlockStatus(save, lineId, opts)?.unlocked ?? true;
}

/**
 * 账本路径 unlock.<lineId> 的读数（T5 方案 A：runtime.ts 的 resolveConditionValue 把 saveData 传进来，用户 2026-10-27 08:17 批）。
 * 没拿到存档（调用方没传 save，或占位空存档里没有 角色）→ undefined＝条件不通过；这是设计上的读不到，不记码，只打调试日志。
 */
export function lineUnlockLedgerValue(save: unknown, lineId: string, opts: LineUnlockOptions = {}): boolean | undefined {
  if (!save || typeof save !== 'object' || !(save as any).角色) {
    debugOnChange(`${lineId}:ledger`, `[整线解锁] ${lineId} 账本条件没拿到存档 → 读成 undefined（不通过）`, () => ({ lineId }));
    return undefined;
  }
  return isLineUnlocked(save, lineId, opts);
}

/** 进太泉的说法：萧遥逸受伤那一拍已完成 → 'song'，否则 → 'wangzhe'。读编年史（orderedDoneEventIds），跨关有效；抛错退回王哲版并记 variant_failed。 */
export function taiquanEntryVariant(runtime: unknown): TaiquanEntryVariant {
  try {
    const variant: TaiquanEntryVariant = orderedDoneEventIds(runtime).includes(TAIQUAN_SONG_VARIANT_EVENT_ID) ? 'song' : 'wangzhe';
    debugOnChange('taiquan:variant', `[整线解锁] taiquan 说法=${variant}（${TAIQUAN_SONG_VARIANT_EVENT_ID} ${variant === 'song' ? '已完成' : '未完成'}）`, () => ({ variant }));
    return variant;
  } catch (error) {
    logEventOnce('LCQ-SAV-029:variant_failed:taiquan', { code: 'LCQ-SAV-029', msg: '太泉进入说法判定出错，退回王哲版', cause: error, detail: { reason: 'variant_failed', lineId: 'taiquan' } });
    return 'wangzhe';
  }
}
