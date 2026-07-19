import type { SaveData } from '@/types/game';

import { recordOffscreenDivergence } from './divergenceLedger';

export type DivergenceLevel = 'low' | 'medium' | 'high';

export interface DivergenceSignal {
  level: DivergenceLevel;
  score: number;
  knownEntityHitRate: number;
  unfamiliarProperNounDensity: number;
  stallTurns: number;
  sampleTurns: number;
  updatedAtTurn: number;
}

export interface WorldPushState {
  due: boolean;
  intensity: 1 | 2;
  reason: 'cadence' | 'low_tension' | 'failed_action' | 'return_bridge';
  scheduledAtTurn: number;
}

interface DivergenceRuntime {
  modId?: string;
  currentChapterId: string | null;
  chapters: Array<{ id: string; title: string; eventIds?: string[] }>;
  events: Array<{ id: string; name: string; objective?: string; critical?: boolean; axisId?: string | null; axisSeq?: number }>;
  activeEventIds: string[];
  completedEventIds: string[];
  flags: Record<string, unknown>;
  stallTurns?: number;
  steeringCooldown?: number;
  divergences?: any[];
  divergenceSignal?: DivergenceSignal;
  worldTurn?: number;
  worldPush?: WorldPushState;
  lastWorldPushJudgementId?: string;
  returnBridge?: {
    anchorEventId: string;
    anchorObjective: string;
    branchSummary: string;
    requestedAtTurn: number;
  };
  canon?: {
    characters?: Array<{ name?: string; aliases?: string[] }>;
    factions?: Array<{ name?: string }>;
    locations?: Array<{ name?: string }>;
  };
}

function nearestAnchor(runtime: DivergenceRuntime) {
  const active = new Set(runtime.activeEventIds || []);
  const completed = new Set(runtime.completedEventIds || []);
  return runtime.events
    .filter(event => active.has(event.id) && !completed.has(event.id)
      && (event.critical === true || event.axisId || typeof event.axisSeq === 'number'))
    .sort((a, b) => (a.axisSeq ?? Infinity) - (b.axisSeq ?? Infinity))[0]
    || runtime.events.find(event => active.has(event.id) && !completed.has(event.id));
}

const PROPER_NOUN = /[\u3400-\u9fff]{1,7}(?:宫|殿|阁|宗|派|门|盟|会|堂|教|阵|祭|典|谷|岛|山|河|湖|城|军|营|国|王|侯)/g;

function runtimeOf(saveData: SaveData): DivergenceRuntime | null {
  const value = (saveData as any)?.世界?.状态?.剧本模组;
  return value && typeof value === 'object' && !Array.isArray(value) ? value as DivergenceRuntime : null;
}

function recentNarratives(saveData: SaveData, limit = 6): string[] {
  const history = (saveData as any)?.系统?.历史?.叙事;
  if (!Array.isArray(history)) return [];
  return history.slice(-limit)
    .map((item: any) => typeof item === 'string' ? item : item?.content)
    .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0);
}

function knownNames(runtime: DivergenceRuntime): string[] {
  return [
    ...(runtime.canon?.characters || []).flatMap(item => [item.name, ...(item.aliases || [])]),
    ...(runtime.canon?.factions || []).map(item => item.name),
    ...(runtime.canon?.locations || []).map(item => item.name),
    ...runtime.events.flatMap(event => [event.name]),
    ...runtime.chapters.flatMap(chapter => [chapter.title]),
  ].filter((name): name is string => typeof name === 'string' && name.trim().length >= 2);
}

/** R2-9：只用存档内可复算事实计分；它是收束信号，不把模型猜测写成世界事实。 */
export function computeDivergenceSignal(saveData: SaveData): DivergenceSignal | null {
  const runtime = runtimeOf(saveData);
  if (!runtime) return null;
  const narratives = recentNarratives(saveData);
  const text = narratives.join('\n');
  const names = knownNames(runtime);
  const hitNames = names.filter(name => text.includes(name));
  const candidates = [...new Set(text.match(PROPER_NOUN) || [])];
  const unfamiliar = candidates.filter(candidate =>
    !names.some(name => candidate.includes(name) || name.includes(candidate)));
  const knownEntityHitRate = names.length && narratives.length
    ? Math.min(1, hitNames.length / Math.max(1, Math.min(6, narratives.length * 2)))
    : 1;
  const unfamiliarProperNounDensity = candidates.length
    ? unfamiliar.length / candidates.length
    : 0;
  const stallTurns = Math.max(0, Number(runtime.stallTurns) || 0);
  const score = Math.round(Math.min(100,
    Math.min(45, stallTurns * 6)
      + unfamiliarProperNounDensity * 35
      + (candidates.length ? (1 - knownEntityHitRate) * 20 : 0)));
  const level: DivergenceLevel = score >= 65 ? 'high' : score >= 35 ? 'medium' : 'low';
  return {
    level, score,
    knownEntityHitRate: Number(knownEntityHitRate.toFixed(3)),
    unfamiliarProperNounDensity: Number(unfamiliarProperNounDensity.toFixed(3)),
    stallTurns,
    sampleTurns: narratives.length,
    updatedAtTurn: Math.max(0, Number(runtime.worldTurn) || 0),
  };
}

function latestFailedJudgement(saveData: SaveData): { id: string } | null {
  const recent = (saveData as any)?.系统?.扩展?.判定?.recent;
  if (!Array.isArray(recent)) return null;
  const item = [...recent].reverse().find(value =>
    value?.status === 'resolved' && ['partial', 'failure', 'critical_failure'].includes(String(value?.outcome)));
  return item && typeof item.id === 'string' ? { id: item.id } : null;
}

/** 每次剧情回合结算一次：偏离评分 + 世界行动权调度。 */
export function updateDivergenceControl(saveData: SaveData, progressed: boolean): void {
  const runtime = runtimeOf(saveData);
  if (!runtime) return;
  runtime.worldTurn = Math.max(0, Number(runtime.worldTurn) || 0) + 1;
  runtime.divergenceSignal = computeDivergenceSignal(saveData) || undefined;
  // scheduledAtTurn 对应的下一次叙事已经消费世界行动权；不能让同一 push 永久重复。
  if (runtime.worldPush?.due && runtime.worldPush.scheduledAtTurn < runtime.worldTurn) {
    runtime.worldPush = undefined;
  }
  if (progressed) runtime.worldPush = undefined;

  const failed = latestFailedJudgement(saveData);
  if (failed && failed.id !== runtime.lastWorldPushJudgementId) {
    runtime.lastWorldPushJudgementId = failed.id;
    runtime.worldPush = {
      due: true, intensity: 2, reason: 'failed_action', scheduledAtTurn: runtime.worldTurn,
    };
    return;
  }
  if (runtime.worldPush?.due) return;
  const lowTension = (runtime.stallTurns || 0) >= 3;
  if (lowTension || runtime.worldTurn % 3 === 0) {
    runtime.worldPush = {
      due: true, intensity: lowTension ? 2 : 1,
      reason: lowTension ? 'low_tension' : 'cadence',
      scheduledAtTurn: runtime.worldTurn,
    };
  }
}

/**
 * 玩家主动斩断模型自生支线。只清即兴目标，不伪造主线完成：
 * 当前最近承重节点仍是落点，后续由确定性对账根据真实证据处理 done/void。
 */
export function returnToCanonAnchor(saveData: SaveData): { ok: boolean; reason?: string; anchor?: string } {
  const runtime = runtimeOf(saveData);
  if (!runtime) return { ok: false, reason: '当前存档没有严格剧本运行时' };
  const anchor = nearestAnchor(runtime);
  if (!anchor) return { ok: false, reason: '当前没有可返回的承重节点' };
  const tracker = ((saveData as any).系统 ??= {}).扩展 ??= {};
  const taskTracker = (tracker.任务追踪 ??= {});
  const goals = Array.isArray(taskTracker.即兴目标) ? taskTracker.即兴目标 : [];
  const branchSummary = goals.length
    ? goals.slice(0, 3).map((goal: any) => typeof goal === 'string' ? goal : goal?.标题).filter(Boolean).join('、')
    : '当前衍生支线';
  taskTracker.即兴目标 = [];
  runtime.returnBridge = {
    anchorEventId: anchor.id,
    anchorObjective: anchor.objective || anchor.name,
    branchSummary,
    requestedAtTurn: Math.max(0, Number(runtime.worldTurn) || 0),
  };
  runtime.steeringCooldown = 0;
  runtime.stallTurns = 0;
  runtime.worldPush = {
    due: true, intensity: 2, reason: 'return_bridge',
    scheduledAtTurn: Math.max(0, Number(runtime.worldTurn) || 0),
  };
  recordOffscreenDivergence(runtime, {
    id: `player-return.${runtime.modId || 'scenario'}.${runtime.worldTurn || 0}`,
    eventId: anchor.id,
    worldDelta: `玩家斩断衍生支线“${branchSummary}”，世界线重新落回“${anchor.objective || anchor.name}”；支线经历保留为已经发生的余波，不作梦醒抹除。`,
    evidence: '玩家在主线面板主动选择“斩线回轨”。',
  });
  return { ok: true, anchor: anchor.objective || anchor.name };
}
