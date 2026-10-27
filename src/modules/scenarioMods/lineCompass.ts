/**
 * 右栏「当前线」卡（右栏线入口复用分析 2026-10-27 §5；用户 2026-10-27 09:26 定 Q1/Q2/Q4/Q6，总策划定 Q3/Q5/Q7/Q8/Q10）。
 * 回答两件事：当前在走哪条国家线、它的下一步一句；别处还有哪些已知的线（只给线名）。
 *
 * - 只有 7 条国家线（NATION_LINE_IDS，太泉算国家线）。势力线（黑魔海、星月湖、太乙）不单独上卡，只在国家线的下一步里自然出现；商道不是线，走身份账。
 * - 已知＝锚已满足（anchorLine＝旧二级线 id，锚读编年史 knownSecondaryLines）或 knownWhen 全满足；未知的线不出现，也不进折叠行。
 * - 收束＝line.<id>.outcome 有档（lineOutcomes），或 closedWhen 全满足；收束的线卡片和折叠行都撤（Q6）。
 * - 整线解锁（story.lineUnlock，太泉）：没解锁不当当前线，只在折叠行灰显，标题与缺项句复用 secondaryLineEntryView 的锁定分支。
 * - 当前线（Q7）：焦点事件所在国家线（下一步表里写了这个 eventId 的线，否则按焦点事件所在关的地区 story.lineCompass.regionLines）；
 *   不在任何线上、或那条线未知／已收束／没解锁，取编年史里最近推进过、未收束的线；都没有返回 null，右栏退回原主线指南针那一句（Q1）。
 * - 下一步：按顺序取第一条非占位、when 全满足、未过（until 全满足即过；没写 until 时 eventId 已完成即过）的一步。
 *   这一步正好是焦点事件 → 直接用主线指南针的「去X · 见Y」；否则用 hintKey 的文案。缺键记 LCQ-PCK-005 并不出这一步，绝不回退旧 entryHint（Q8）。
 *   表里没有可用的一步、而当前线是焦点事件所在的线 → 也用「去X · 见Y」（焦点事件就是这条线眼下这一拍）。
 * - 判定只读跨关账（编年史、相识账、身份账、line.*／期限 flags），不读 rt.completedEventIds，不新增存档字段（§5.3）。
 * - 条件求值传存档（evaluateLedgerCondition 第三参），unlock.* 读得到；不是账本路径的条件一律不成立（validator 已拦）。
 * 表在内容包 line-compass.json（schema 见 LineCompassTable），文案在 texts，编译期由 validator.validateLineCompassTable 校验。
 */
import { CONTENT_PACKS } from '../contentPacks';
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { logEventOnce } from '../diagnostics/log';
import { debugEnabled, debugLog } from '../diagnostics/debugLog';
import { evaluateLedgerCondition } from './ledgerConditions';
import { readLineOutcome } from './lineOutcomes';
import { lineUnlockConfig, lineUnlockStatus } from './lineUnlock';
import { orderedDoneEventIds } from './playerLedgerRules';
import { STAGE_REGION } from './reputationLedger';
import { SECONDARY_LINES, secondaryLineUnlockOptions } from './secondaryLines';
import { knownSecondaryLines, secondaryLineEntryView } from './secondaryLineEntry';
import type { ScenarioCondition } from './schema';

/**
 * 线的一步。
 * 文案口径（分析稿 §4，写文案和审稿都按这个）：**提示，不是说明**——只给方向：去哪、找谁、打听什么，玩家看了不能知道接下来会发生什么。
 * ① 知情门：只用主角当时已知的信息（knows.player.* / acq.* / done.* 满足才能提），没知道的人名、地名、组织名一律不出；
 * ② 不定性：不用评价、归类事件性质的词（怪事、闹鬼、阴谋、勾结、猎杀、危机、要打起来了、覆灭、背叛……，story.lineCompass.hint.bannedWords）；
 *    用户例：✗「去建康打听宫里的怪事」——「怪事」是定性，等于剧透；✓「去建康打听宫里最近有什么事」；
 * ③ 不预告：不写后续会发生什么、会得到什么、还会遇到什么；④ 不点名结果和动机；
 * ⑤ 句式〔去{地点}〕〔找／见{人}〕〔打听／看看／问问{中性对象}〕，一句、最好不超过 20 字（story.lineCompass.hint.maxChars）；
 * ⑥ 人名地名用主角已知的称呼，只听说没见过的用「那个人」或只给地点；⑦ 由头（为什么去）不进提示；
 * ⑧ 门槛说明（如太泉还差几条线）不是剧情提示，只在锁定视图里出。
 */
export interface LineCompassStep {
  /** 线内唯一，小写 id */
  id: string;
  /** 这一步对应的承重拍事件；焦点事件正好是它时直接用主线指南针的「去X · 见Y」，可不写 hintKey */
  eventId?: string;
  /** 全满足才轮到这一步（只许账本路径）；缺省＝总满足 */
  when?: ScenarioCondition[];
  /** 全满足＝这一步已过；缺省时 eventId 已完成即过 */
  until?: ScenarioCondition[];
  /** texts 键（lineCompass.<lineId>.step.<id>）；eventId 与 hintKey 至少写一个 */
  hintKey?: string;
  /** 【待剧情策划】占位：运行时跳过，不进玩家可见 */
  draft?: true;
  /** 制作备注，不进玩家可见 */
  note?: string;
}

export interface LineCompassLine {
  /** 国家线 id（NATION_LINE_IDS） */
  lineId: string;
  /** 线名的 texts 键 */
  nameKey: string;
  /** 已知判定沿用的旧二级线（secondaryLines.ts 的 id，锚读编年史） */
  anchorLine?: string;
  /** 另一条已知判定：全满足即已知（与 anchorLine 任一成立即可） */
  knownWhen?: ScenarioCondition[];
  /** 收束判定补充：全满足即撤（line.<id>.outcome 有档总是撤） */
  closedWhen?: ScenarioCondition[];
  steps: LineCompassStep[];
  note?: string;
}

export interface LineCompassTable {
  version: 1;
  note?: string;
  lines: LineCompassLine[];
}

export interface LineCompassCard {
  lineId: string;
  name: string;
  /** 下一步一句；空串＝这一次不出下一步（只显示线名） */
  step: string;
  /** focus＝焦点事件所在的线；recent＝编年史里最近推进过的线 */
  source: 'focus' | 'recent';
}

export interface LineCompassOther {
  lineId: string;
  /** 线名；没解锁时＝「时机未到」标题 */
  name: string;
  /** 没解锁：灰显 */
  locked: boolean;
  /** 只有没解锁时有（缺项句）；其余线展开也只列线名 */
  hintLines: string[];
}

export interface LineCompassView {
  /** null＝没有当前线，右栏退回原主线指南针那一句 */
  current: LineCompassCard | null;
  others: LineCompassOther[];
}

export interface LineCompassInput {
  /** 焦点事件 id（getScenarioFocusEvent） */
  focusEventId?: string;
  /** 玩家当前地点 id（地点锚的兜底判定用） */
  atLocationId?: string;
  /** 主线指南针的「去X · 见Y」（questCompassPhrases 连成一句）；只在用到时才算 */
  compassPointer: () => string;
  table?: LineCompassTable;
  texts?: Readonly<Record<string, string>>;
}

/** 占位文案标记：带它的句子永不显示。 */
export const LINE_COMPASS_DRAFT_MARK = '【待剧情策划】';

export const showLineCompass = (): boolean => GAME_NUMBERS.ui.rightSidebar.showLineCompass === true;

export const lineCompassTable = (): LineCompassTable =>
  ((CONTENT_PACKS as { lineCompass?: LineCompassTable }).lineCompass) ?? { version: 1, lines: [] };

const runtimeOf = (save: unknown): any => (save as any)?.世界?.状态?.剧本模组;

const lastDebug = { key: '' };
function debugOnChange(msg: string, data: () => unknown): void {
  if (!debugEnabled('story') || lastDebug.key === msg) return;
  lastDebug.key = msg;
  debugLog('story', msg, data);
}

/** 关卡 → 国家线（story.lineCompass.regionLines，按 stageRegions 的地区名）；塞外等不登记的地区为 undefined。 */
export function lineOfStage(stageId: string | undefined): string | undefined {
  if (!stageId) return undefined;
  const region = STAGE_REGION[stageId];
  return region ? (GAME_NUMBERS.story.lineCompass.regionLines as Record<string, string>)[region] : undefined;
}

/** 事件 → 国家线：下一步表里写了这个 eventId 的线优先，否则按所在关的地区。 */
export function lineOfEvent(eventId: string | undefined, stageId: string | undefined, table: LineCompassTable = lineCompassTable()): string | undefined {
  if (eventId) {
    const hit = table.lines.find(line => line.steps.some(step => step.eventId === eventId));
    if (hit) return hit.lineId;
  }
  return lineOfStage(stageId);
}

/** 已完成事件（编年史口径）连同所在关，按完成顺序；本关补上的同回合空档记在当前关。 */
function doneEventsWithStage(rt: any): Array<{ eventId: string; stageId: string | undefined }> {
  const stageOf = new Map<string, string>();
  for (const entry of Array.isArray(rt?.chronicle) ? rt.chronicle : []) {
    if (entry?.type !== 'event' || typeof entry.id !== 'string') continue;
    const prefix = `chronicle.${entry.stageId || 'unknown'}.`;
    if (entry.id.startsWith(prefix)) stageOf.set(entry.id.slice(prefix.length), entry.stageId || undefined);
  }
  return orderedDoneEventIds(rt).map(eventId => ({ eventId, stageId: stageOf.get(eventId) ?? rt?.modId }));
}

export function lineCompassView(save: unknown, input: LineCompassInput): LineCompassView {
  const table = input.table ?? lineCompassTable();
  const texts = input.texts ?? CONTENT_PACKS.texts;
  const rt = runtimeOf(save) || {};
  const holds = (conds: readonly ScenarioCondition[] | undefined): boolean =>
    (conds ?? []).every(c => evaluateLedgerCondition(c, rt, save) === true);
  const done = new Set(orderedDoneEventIds(rt));
  const knownOld = new Set(knownSecondaryLines(rt, input.atLocationId).map(line => line.id));

  const text = (line: LineCompassLine, key: string): string | undefined => {
    const value = texts[key];
    if (typeof value === 'string' && value.trim()) return value;
    // 缺键不挡卡片：带码写持久日志（同一键本会话只记一次），这一句不出
    logEventOnce(`LCQ-PCK-005:${key}`, { code: 'LCQ-PCK-005', msg: `当前线卡 ${line.lineId} 文案键 ${key} 缺失，这一句不出`, detail: { lineId: line.lineId, textKey: key, source: 'lineCompass' } });
    return undefined;
  };
  const nameOf = (line: LineCompassLine): string =>
    text(line, line.nameKey) ?? SECONDARY_LINES.find(old => old.id === line.anchorLine)?.name ?? line.lineId;
  const known = (line: LineCompassLine): boolean =>
    (line.anchorLine !== undefined && knownOld.has(line.anchorLine)) || (!!line.knownWhen?.length && holds(line.knownWhen));
  const closed = (line: LineCompassLine): boolean =>
    readLineOutcome(rt.flags, line.lineId) !== undefined || (!!line.closedWhen?.length && holds(line.closedWhen));
  const unlockLine = (line: LineCompassLine) => SECONDARY_LINES.find(old => old.unlock === line.lineId);
  const locked = (line: LineCompassLine): boolean => {
    if (!lineUnlockConfig(line.lineId)) return false;
    const old = unlockLine(line);
    const status = lineUnlockStatus(save, line.lineId, { ...(old ? secondaryLineUnlockOptions(old) : { required: true }), runtime: rt });
    return !status?.unlocked;
  };
  const open = table.lines.filter(line => known(line) && !closed(line));
  const eligible = (lineId: string | undefined): LineCompassLine | undefined => {
    const line = open.find(l => l.lineId === lineId);
    return line && !locked(line) ? line : undefined;
  };

  // 当前线：焦点事件所在的线，否则编年史里最近推进过、未收束的线
  let source: LineCompassCard['source'] = 'focus';
  let current = input.focusEventId ? eligible(lineOfEvent(input.focusEventId, rt.modId, table)) : undefined;
  if (!current) {
    source = 'recent';
    const history = doneEventsWithStage(rt);
    for (let i = history.length - 1; i >= 0 && !current; i -= 1) current = eligible(lineOfEvent(history[i].eventId, history[i].stageId, table));
  }

  let card: LineCompassCard | null = null;
  if (current) {
    const line = current;
    const step = line.steps.find(s => !s.draft && holds(s.when) && !(s.until?.length ? holds(s.until) : s.eventId !== undefined && done.has(s.eventId)));
    let stepText = '';
    if (step) {
      if (step.eventId && step.eventId === input.focusEventId) stepText = input.compassPointer();
      if (!stepText && step.hintKey) stepText = text(line, step.hintKey) ?? '';
    } else if (source === 'focus') {
      stepText = input.compassPointer();
    }
    // 占位标记的句子永不显示（draft 已跳过，这里兜底手误）
    if (stepText.includes(LINE_COMPASS_DRAFT_MARK)) stepText = '';
    card = { lineId: line.lineId, name: nameOf(line), step: stepText, source };
  }

  const others = open.filter(line => line !== current).map((line): LineCompassOther => {
    const old = locked(line) ? unlockLine(line) : undefined;
    if (old) {
      const view = secondaryLineEntryView(old, save);
      if (view.locked) return { lineId: line.lineId, name: view.title, locked: true, hintLines: view.hintLines };
    }
    if (locked(line)) return { lineId: line.lineId, name: `${nameOf(line)} · 时机未到`, locked: true, hintLines: [] };
    return { lineId: line.lineId, name: nameOf(line), locked: false, hintLines: [] };
  });

  const view: LineCompassView = { current: card, others };
  debugOnChange(`[当前线] ${card ? `${card.lineId}（${card.source}）下一步「${card.step || '—'}」` : '无 → 退回主线指南针'} 别处 ${others.map(o => `${o.lineId}${o.locked ? '(锁)' : ''}`).join(',') || '—'}`, () => ({ focusEventId: input.focusEventId, view }));
  return view;
}
