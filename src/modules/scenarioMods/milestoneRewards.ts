/**
 * 里程碑奖励：称号/身份 = 故事线正确落点的关卡完成奖励。
 *
 * 设计动机（2026-07-03，用户拍板）：
 * - 官职/称号不再是静态数据（曾致南荒 NPC 未卜先知"舞阳侯"），而是运行时状态：
 *   打到那一关才写进存档，prompt 从存档读——时代错乱从"要小心"变成"结构上不可能"。
 * - 写入路径 `角色.身份.称号` 由 canonGuard 保护：只有引擎（本模块）能授予，AI 不能自封。
 * - 触发时机 = stage_ready（该关关键剧情全部收束、可切下一关的时刻）。
 */
import type { ScenarioRuntimeTransition } from './runtime';
import { debugLog } from '../diagnostics/debugLog';
import { CONTENT_PACKS } from '../contentPacks';
import { stageMetaOf, type StageMeta } from '../contentPacks/stageMeta';
import { STAGE_ORDER } from './mainQuestAxis';

export interface MilestoneReward {
  /** 完成哪一关授予 */
  stageId: string;
  /** 授予的称号（追加进 角色.身份.称号，去重） */
  titles: string[];
  /** 剧情剥夺的称号（从 角色.身份.称号 移除；如买官爵位随政局翻覆作废） */
  revokeTitles?: string[];
  /** 授予时写进变更记录/控制台的说明 */
  note: string;
}

// 落点必须符合原文故事线（来源：milestone-grants-scan 原文扫描 + 用户裁定 2026-07-03）。
// 新增条目：补一行即可。跳过项：大行令(原文旋即被夺,引擎无撤销)/兰台典校(非正式官职)。
// 已迁进内容包 stageMeta.milestoneReward 的关（宋：packs/song/stage-meta.json；汉：packs/han/stage-meta.json；唐：packs/tang/stage-meta.json）不在本表。
export const TS_MILESTONE_REWARDS: MilestoneReward[] = [];

/**
 * 全部里程碑奖励：内容包 stageMeta 的 milestoneReward（按 catalog 顺序）与 TS 表合并，再按关的故事序（STAGE_ORDER）稳定排序；
 * 不在 STAGE_ORDER 里的关（包内关）排在最后、保持合并前的相对顺序（编译期校验两边不重复）。
 * 故事序即各线搬迁前 TS 表的原顺序（汉线 S4：汉条目迁进汉包后，catalog 顺序 han<song 与原表 宋→汉→唐 不同）。
 */
const storyIndex = (stageId: string) => { const i = STAGE_ORDER.indexOf(stageId); return i < 0 ? STAGE_ORDER.length : i; };
export const MILESTONE_REWARDS: MilestoneReward[] = [
  ...(CONTENT_PACKS.stageMeta || []).filter(m => m.milestoneReward).map(m => ({ stageId: m.stageId, ...m.milestoneReward! })),
  ...TS_MILESTONE_REWARDS,
].sort((a, b) => storyIndex(a.stageId) - storyIndex(b.stageId));

/** 某关的里程碑奖励：先查内容包 stageMeta 的 milestoneReward，没有再查 TS_MILESTONE_REWARDS（编译期校验两边不重复）。 */
export function milestoneRewardFor(stageId: unknown, stageMeta: readonly StageMeta[] = CONTENT_PACKS.stageMeta || []): MilestoneReward | undefined {
  const meta = stageMetaOf(stageMeta, stageId)?.milestoneReward;
  if (meta) return { stageId: stageId as string, ...meta };
  return TS_MILESTONE_REWARDS.find(r => r.stageId === stageId);
}

type AnySave = Record<string, any>;

function readTitles(saveData: AnySave): string[] {
  const t = saveData?.角色?.身份?.称号;
  return Array.isArray(t) ? t : [];
}

/**
 * 在 advanceScenarioRuntime 之后调用：本关 stage_ready 时授予对应里程碑称号。
 * 返回本轮新授予的说明（空数组=无授予）。幂等（已有称号不重复授）。
 */
export function applyMilestoneRewards(saveData: AnySave, transitions: ScenarioRuntimeTransition[]): string[] {
  if (!transitions.some(t => t.type === 'stage_ready')) return [];
  const currentStageId = saveData?.世界?.状态?.剧本模组?.modId;
  if (!currentStageId) return [];
  const reward = milestoneRewardFor(currentStageId);
  if (!reward) return [];

  const identity = (saveData.角色 = saveData.角色 || {}).身份 = saveData.角色.身份 || {};
  let titles: string[] = Array.isArray(identity.称号) ? identity.称号 : (identity.称号 = []);
  const notes: string[] = [];
  // 剧情剥夺（如政局翻覆、买官作废）
  const revoked = (reward.revokeTitles || []).filter(t => titles.includes(t));
  if (revoked.length) {
    titles = identity.称号 = titles.filter(t => !revoked.includes(t));
    notes.push(`失去称号「${revoked.join('、')}」`);
  }
  const granted: string[] = [];
  for (const title of reward.titles) {
    if (!titles.includes(title)) { titles.push(title); granted.push(title); }
  }
  if (granted.length) notes.push(`获得称号「${granted.join('、')}」`);
  if (notes.length) {
    debugLog('story', `[里程碑奖励] ${currentStageId} 完成 → ${notes.join('；')}（${reward.note}）`);
    return [`${notes.join('；')}：${reward.note}`];
  }
  return [];
}

/** prompt 用：当前已获称号行（无称号返回空串） */
export function formatEarnedTitles(saveData: AnySave): string {
  const titles = readTitles(saveData);
  return titles.length ? `主角已获称号/官职：${titles.join('、')}（未列出的头衔一律视为尚未获得，不得提前称呼）` : '';
}
