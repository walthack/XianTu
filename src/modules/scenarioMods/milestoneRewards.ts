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
export const MILESTONE_REWARDS: MilestoneReward[] = [
  {
    stageId: 'lcq.stage_12_jiangzhou_counterwar', // 六朝清羽记·江州反攻收束
    titles: ['宋国工部屯田司员外郎'],
    note: '粮战功成，筠州知州滕甫招揽为宋国客卿，举荐任工部屯田司员外郎（清羽 ch324）。',
  },
  {
    stageId: 'lyl.luoyang_cloud_secret', // 六朝云龙吟·天石（洛都入局·买官洗白）
    titles: ['汉国关内侯（买官）', '汉国大行令（领事·加常侍郎）'],
    note: '经徐璜运作向天子买官洗白：诏拜关内侯、授大夫、领鸿胪寺大行令事、加常侍郎（可出入宫禁），全套一千四百万钱（云龙 0238-0239）。',
  },
  {
    stageId: 'lyl.luoyang_coup', // 六朝云龙吟·封侯
    titles: ['汉国舞阳侯'],
    revokeTitles: ['汉国关内侯（买官）', '汉国大行令（领事·加常侍郎）'],
    note: '洛都政局翻覆，先前买来的官爵作废（"还没捂热呢，可就飞了"，云龙 0360）；以功受封汉国舞阳侯（实封五千户，舞阳相程郑主政）。',
  },
  {
    stageId: 'lyg.shituolin_endgame', // 六朝燕歌行·尸陀林主与李辅国断点
    titles: ['唐国大都护', '上柱国'],
    note: '诛杀李辅国，唐国朝廷重赏：官拜大都护（向由亲王遥领，暗示等同亲王）、勋授上柱国（燕歌 0292）。',
  },
];

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
  const reward = MILESTONE_REWARDS.find(r => r.stageId === currentStageId);
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
    console.info(`[里程碑奖励] ${currentStageId} 完成 → ${notes.join('；')}（${reward.note}）`);
    return [`${notes.join('；')}：${reward.note}`];
  }
  return [];
}

/** prompt 用：当前已获称号行（无称号返回空串） */
export function formatEarnedTitles(saveData: AnySave): string {
  const titles = readTitles(saveData);
  return titles.length ? `主角已获称号/官职：${titles.join('、')}（未列出的头衔一律视为尚未获得，不得提前称呼）` : '';
}
