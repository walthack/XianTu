/**
 * 剧情分支决定（硬编码选项锁，用户裁定 2026-10-02）：重大抉择时只让玩家从固定选项里选，
 * 锁定时输入框与发送键一起禁用（灰色，占位文字明示有意禁用）、不显示任何步骤进度。每把锁只锁真正做决定的那一步，两把锁之间至少隔 3 个事件。
 * 本表之外的事件一律不锁（白夷族到达不锁）。2026-11-03 用户指令加锁南荒之约、谢艺托付（修订裁定 #165「谢艺托付不锁」；南荒之约与白湖赌局相邻，间距待用户确认）。
 *
 * 判定是确定性的：表中第一个动作（决定动作）出现在当前可选动作里即为分支点；
 * 锁只作用于输入方式，选中后仍走原有结构化动作与本地合同，不改任何结算。
 */
import uiConfig from '../../../mod-kit/branch-decision-ui.json';
import { CONTENT_PACKS } from '../contentPacks';
import type { StageMeta } from '../contentPacks/stageMeta';

export interface BranchDecisionCandidate {
  source: string;
  eventId?: string;
  actionId: string;
  label: string;
}

export interface BranchDecision<T extends BranchDecisionCandidate = BranchDecisionCandidate> {
  options: T[];
  /** 与 options 一一对应的显示文案（不带步骤后缀）。 */
  labels: string[];
}

// 文案在 mod-kit/branch-decision-ui.json（REPORT-8091-75eaaee0 P2-1 改向：分支期间关闭自由输入，只能点选项）。
export const BRANCH_DECISION_TITLE: string = uiConfig.title;
export const BRANCH_DECISION_HINT: string = uiConfig.hint;
export const BRANCH_DECISION_INPUT_PLACEHOLDER: string = uiConfig.inputPlaceholder;
export const BRANCH_DECISION_BLOCKED_NOTICE: string = uiConfig.blockedSendNotice;

type LockedDecisionTable = Readonly<Record<string, ReadonlyArray<readonly [string, string]>>>;
/** eventId → [动作 id, 显示文案]；第一项是决定动作，其余是同一时刻的其他固定选项（含致命选项）。F0b：TS 侧表，与内容包 stageMeta 事件的 lockedDecision 合并。B6 起其余 5 把锁在塞外、昭南包 stageMeta（原分组注释在那两关的 note）；这一条留在 TS：合并表键顺序被 B0 快照钉住（TS 在前、包按 catalog 顺序在后），它原排在塞外 3 把锁之前，进昭南包就排不回去。 */
export const TS_LOCKED_DECISIONS: LockedDecisionTable = {
  'lcq.event.shanghou_revealed': [['refuse_shanghou_relic_test', '认出警示标记，不碰'], ['touch_shanghou_relic', '伸手去碰那件神物']],
};

/** TS 表在前、包（stageMeta 事件 lockedDecision）按 catalog 顺序在后；同一事件两边都有抛错（编译期已拦）。包里没有时返回 TS 表本身。 */
export function mergeLockedDecisions(ts: LockedDecisionTable, stageMeta: readonly StageMeta[]): LockedDecisionTable {
  const pack = stageMeta.flatMap(m => Object.entries(m.presentation?.events || {}).filter(([, e]) => e.lockedDecision).map(([id, e]) => [id, e.lockedDecision!] as const));
  if (!pack.length) return ts;
  const out: Record<string, ReadonlyArray<readonly [string, string]>> = { ...ts };
  for (const [id, entries] of pack) { if (id in out) throw Error(`分支锁 ${id} 同时在 TS 表与内容包里`); out[id] = entries; }
  return out;
}

export const LOCKED_DECISIONS: LockedDecisionTable = mergeLockedDecisions(TS_LOCKED_DECISIONS, CONTENT_PACKS.stageMeta || []);

function lockedEntry(option: BranchDecisionCandidate): ReadonlyArray<readonly [string, string]> | undefined {
  return option.source === 'event_engine' && option.eventId ? LOCKED_DECISIONS[option.eventId] : undefined;
}

export function detectBranchDecision<T extends BranchDecisionCandidate>(options: readonly T[]): BranchDecision<T> | null {
  const anchor = options.find(option => Boolean(lockedEntry(option) && lockedEntry(option)![0][0] === option.actionId));
  if (!anchor) return null;
  const picked = lockedEntry(anchor)!
    .map(([actionId, label]) => ({ option: options.find(item => item.source === 'event_engine' && item.eventId === anchor.eventId && item.actionId === actionId), label }))
    .filter((item): item is { option: T; label: string } => Boolean(item.option));
  return { options: picked.map(item => item.option), labels: picked.map(item => item.label) };
}

/** 没有锁激活时，属于某把锁的选项（如决定步之前就出现的致命选项）不提前显示。 */
export function isDormantLockedOption(option: BranchDecisionCandidate): boolean {
  return Boolean(lockedEntry(option)?.some(([actionId]) => actionId === option.actionId));
}

/** 分支点时，只有"已选中其中一个选项且输入框内容就是该选项原句"才允许发送。 */
export function branchDecisionAllowsSend<T extends BranchDecisionCandidate>(
  decision: BranchDecision<T> | null,
  selected: T | null | undefined,
  inputText: string,
  lineOf: (option: T) => string,
): boolean {
  if (!decision) return true;
  if (!selected) return false;
  const chosen = decision.options.find(option =>
    option.source === selected.source && option.actionId === selected.actionId && (option.eventId || '') === (selected.eventId || ''));
  return Boolean(chosen) && lineOf(chosen!).trim() === inputText.trim();
}

/** 分支点期间关闭自由输入：输入框与发送键一起禁用，选定后分支消失即恢复。 */
export function branchDecisionLocksInput(decision: BranchDecision | null): boolean {
  return Boolean(decision);
}
