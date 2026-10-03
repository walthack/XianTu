/**
 * 剧情分支决定（硬编码选项锁，用户裁定 2026-10-02）：重大抉择时只让玩家从固定选项里选，
 * 锁定时隐藏输入框、不显示任何步骤进度。每把锁只锁真正做决定的那一步，两把锁之间至少隔 3 个事件。
 * 本表之外的事件一律不锁（白夷族到达、谢艺托付不锁）。
 *
 * 判定是确定性的：表中第一个动作（决定动作）出现在当前可选动作里即为分支点；
 * 锁只作用于输入方式，选中后仍走原有结构化动作与本地合同，不改任何结算。
 */
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

export const BRANCH_DECISION_TITLE = '剧情分支需要做出决定';
export const BRANCH_DECISION_HINT = '这一步只能从下面的选项中选择一项。';

/** eventId → [动作 id, 显示文案]；第一项是决定动作，其余是同一时刻的其他固定选项（含致命选项）。 */
const LOCKED_DECISIONS: Readonly<Record<string, ReadonlyArray<readonly [string, string]>>> = {
  'lcq.event.shanghou_revealed': [['refuse_shanghou_relic_test', '认出警示标记，不碰'], ['touch_shanghou_relic', '伸手去碰那件神物']],
  // 白湖赌局（第18-19章）：凝羽入局后当面答复的那一步。不赌＝致命选项（炮烙）。
  'lcq.event.ningyu_enters_gamble': [['answer_ningyu_on_debut', '接赌'], ['refuse_gamble_take_paolao', '不赌']],
  // 撕毁阿姬曼身契（第23章）：撕契那一步；阿姬曼生气并入同一场戏。
  // 不撕：本拍照常完成、只记路线回执；冰蛊结局延后到武二郎入队那一拍触发（裁定 #169）。
  'lcq.event.free_ajiman': [['tear_bond_and_face_blockade', '当面撕契并改道出城'], ['pocket_ajiman_bond', '先收起身契，出城再说']],
  // 支不支援谢艺（原著第103–106章，反杀计划成形后、出发前）：支援只登记回执，救治判定时公开 +2（裁定 #168）。
  'lcq.event.s05b_09_temporary_pact_with_xiaozi': [['support_xieyi_counterstrike', '协助谢艺准备反杀，随队返回'], ['rest_then_follow_team', '不主动支援，先休整，随队同行']],
};

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
