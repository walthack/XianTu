import type { SaveData } from '@/types/game';

import type { ScenarioCondition, ScenarioFlagValue, ScenarioMod, ScenarioModChapter, ScenarioModEvent } from './schema';
import { getCanonRailOrder, getCanonRailProfile, isCanonRailChapter } from './canonRail';


export interface ScenarioProgressState {
  chapters: ScenarioModChapter[];
  events: ScenarioModEvent[];
  completedChapterIds: string[];
  activeEventIds: string[];
  completedEventIds: string[];
}

export interface ScenarioRuntimeTransition {
  type: 'chapter_activated' | 'chapter_completed' | 'event_activated' | 'event_completed' | 'stage_ready';
  id: string;
}

export interface RuntimeState extends ScenarioProgressState {
  modId?: string;
  currentChapterId: string | null;
  flags: Record<string, ScenarioFlagValue>;
  nextStageId?: string | null;
  nextStageReadyId?: string | null;
  /** 剧情停滞轮数：连续多少轮无事件/章节推进（供收束提示分档），推进即清零 */
  stallTurns?: number;
  /** 回主线引子偏移冷却：玩家主动偏移主线时置 N，引擎逐轮递减、期间暂停 stall 并静默引子。
   *  存于 runtime(世界.状态.剧本模组)——引擎专属字段，canonGuard 保护、LLM 命令写不到。 */
  steeringCooldown?: number;
  /** 旧档 reconcile 版本戳：与 registry 版本一致则跳过（正典更新后旧档第一回合自动对齐） */
  reconciledRegistryVersion?: string;
}

function readPath(root: unknown, path: string[]): unknown {
  let current = root;
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function getRuntime(saveData: SaveData): RuntimeState | null {
  const value = readPath(saveData, ['世界', '状态', '剧本模组']);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const runtime = value as Record<string, unknown>;
  if (!runtime.flags || typeof runtime.flags !== 'object') return null;
  return runtime as unknown as RuntimeState;
}

function resolveConditionValue(condition: ScenarioCondition, saveData: SaveData, runtime: RuntimeState): unknown {
  if (condition.path === 'flags') return runtime.flags;
  if (condition.path.startsWith('flags.')) {
    const flagPath = condition.path.slice('flags.'.length);
    // LLM 的 set 指令按嵌套路径写入（flags.event.x.done → {event:{x:{done}}}），
    // 而 initialFlags 是扁平点号键。嵌套值是较新的写入 → 嵌套优先，扁平兜底。
    const nested = readPath(runtime.flags, flagPath.split('.'));
    if (nested !== undefined) return nested;
    if (Object.prototype.hasOwnProperty.call(runtime.flags, flagPath)) return runtime.flags[flagPath];
    return undefined;
  }
  return readPath(saveData, condition.path.split('.'));
}

// LLM 偶尔把布尔写成字符串（"true"/"false"）——eq/neq 比较前归一。
function coerceScalar(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export function evaluateScenarioCondition(
  condition: ScenarioCondition,
  saveData: SaveData,
  runtime: RuntimeState,
): boolean {
  const actual = resolveConditionValue(condition, saveData, runtime);
  switch (condition.operator) {
    case 'eq': return coerceScalar(actual) === condition.value;
    case 'neq': return coerceScalar(actual) !== condition.value;
    case 'gt': return typeof actual === 'number' && typeof condition.value === 'number' && actual > condition.value;
    case 'gte': return typeof actual === 'number' && typeof condition.value === 'number' && actual >= condition.value;
    case 'lt': return typeof actual === 'number' && typeof condition.value === 'number' && actual < condition.value;
    case 'lte': return typeof actual === 'number' && typeof condition.value === 'number' && actual <= condition.value;
    case 'includes':
      return (Array.isArray(actual) && actual.includes(condition.value)) ||
        (typeof actual === 'string' && typeof condition.value === 'string' && actual.includes(condition.value));
    case 'exists': return actual !== undefined;
    default: return false;
  }
}

function conditionsMatch(
  conditions: ScenarioCondition[] | undefined,
  saveData: SaveData,
  runtime: RuntimeState,
): boolean {
  return !conditions?.length || conditions.every(condition => evaluateScenarioCondition(condition, saveData, runtime));
}

function hasCompletion(conditions: ScenarioCondition[] | undefined): conditions is ScenarioCondition[] {
  return Array.isArray(conditions) && conditions.length > 0;
}

function isCriticalStoryEvent(event: ScenarioModEvent): boolean {
  if (event.critical !== undefined) return event.critical;
  if (event.axisMethod === 'reviewed-no-anchor' || event.axisId === null) return false;
  return Boolean(event.axisBeat || event.axisId || typeof event.axisSeq === 'number');
}

/** 唯一主线锚点：当前章节中最早的已激活、未完成承重事件。
 * runtime 可同时保留资料/并行事件，但主叙事、UI 与 LLM 完成权限只能围绕这一拍推进。 */
export function getNarrativeAnchorEvent(runtime: Pick<RuntimeState, 'chapters' | 'events' | 'currentChapterId' | 'activeEventIds' | 'completedEventIds'> & Partial<Pick<RuntimeState, 'modId'>>): ScenarioModEvent | null {
  const chapter = (runtime.chapters || []).find(item => item.id === runtime.currentChapterId);
  const active = new Set(runtime.activeEventIds || []);
  const completed = new Set(runtime.completedEventIds || []);
  const order = new Map((chapter?.eventIds || []).map((id, index) => [id, index]));
  const chapterHasCritical = (runtime.events || []).some(event => order.has(event.id) && isCriticalStoryEvent(event));
  const railOrder = getCanonRailOrder(getCanonRailProfile(runtime));
  const candidates = (runtime.events || [])
    .filter(event => active.has(event.id) && !completed.has(event.id) && order.has(event.id));
  const anchored = candidates.filter(isCriticalStoryEvent);
  // 有承重链的章节绝不让资料/彩蛋事件顶替主线；承重链完成后交给 runtime 自动收章。
  return (chapterHasCritical ? anchored : candidates)
    .sort((a, b) => (railOrder.get(a.id) ?? Infinity) - (railOrder.get(b.id) ?? Infinity)
      || (a.axisSeq ?? Infinity) - (b.axisSeq ?? Infinity)
      || (order.get(a.id)! - order.get(b.id)!))[0] || null;
}

export function createScenarioProgress(mod: ScenarioMod): ScenarioProgressState {
  return {
    chapters: structuredClone(mod.scenario.chapters || []),
    events: structuredClone(mod.scenario.events || []),
    completedChapterIds: [],
    activeEventIds: [],
    completedEventIds: [],
  };
}

export function getInitialScenarioChapterId(mod: ScenarioMod): string | null {
  const progress = createScenarioProgress(mod);
  const runtime: RuntimeState = {
    ...progress,
    currentChapterId: null,
    flags: { ...(mod.scenario.initialFlags || {}) },
  };
  const emptySave = {} as SaveData;
  return runtime.chapters.find(chapter => conditionsMatch(chapter.activation, emptySave, runtime))?.id || null;
}

// 把 LLM 写成嵌套的 flags 摊平回扁平点号键（嵌套值较新、优先），并归一 "true"/"false" 字符串。
// 避免 flags 里同键扁平/嵌套双写矛盾（扁平陈旧 false + 嵌套 true），也让 prompt 的「剧情标记」显示一致。
function normalizeRuntimeFlags(runtime: RuntimeState): void {
  const flags = runtime.flags as Record<string, unknown>;
  const flatten = (obj: Record<string, unknown>, prefix: string) => {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value as Record<string, unknown>, path);
      else flags[path] = coerceScalar(value);
    }
  };
  for (const [key, value] of Object.entries(flags)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value as Record<string, unknown>, key);
      delete flags[key];
    } else {
      flags[key] = coerceScalar(value);
    }
  }
}

/** 当一章列出的事件均已完成时，补上该章的标准完成 flag。
 *
 * 事件完成由 LLM 指令或事件对账落账；章节 flag 却没有独立叙事事实，继续让模型额外填写会
 * 造成“所有事件已完成但章节永远不切换”的死锁。只处理标准的 flags.<key> = true 完成条件，
 * 其他自定义条件仍保留原有显式判定，避免覆盖作者定义的额外门槛。
 */
function settleCompletedChapterFlags(runtime: RuntimeState): void {
  const completed = new Set(runtime.completedEventIds || []);
  const flags = runtime.flags as Record<string, unknown>;
  for (const chapter of runtime.chapters || []) {
    const profile = getCanonRailProfile(runtime);
    if (isCanonRailChapter(profile, chapter.id) && !profile!.orderedEventIds.every(id => completed.has(id))) continue;
    const listedIds = chapter.eventIds || [];
    const criticalIds = listedIds.filter(id => {
      const event = runtime.events.find(item => item.id === id);
      return Boolean(event && isCriticalStoryEvent(event));
    });
    const eventIds = criticalIds.length ? criticalIds : listedIds;
    const completion = chapter.completion || [];
    const standardFlagCompletion = completion.length > 0 && completion.every(condition =>
      condition.path.startsWith('flags.') && condition.operator === 'eq' && condition.value === true,
    );
    if (!eventIds.length || !standardFlagCompletion || !eventIds.every(id => completed.has(id))) continue;
    for (const condition of completion) {
      flags[condition.path.slice('flags.'.length)] = true;
    }
  }
}

// 旧档 reconcile：registry 版本变更后，把烘焙在存档里的正典对齐到最新（保守，只动正典派生物）。
// ① canon.characters 用 resolver 重投影（personality 卡为准 / 派生 notes 重建 / 历程等新字段带上）
// ② 世界.信息.地点信息 补缺失的地图点位（此前太泉古阵类缺点只能手工修档）
// 惰性加载：builtins 用 require.context(仅 webpack 可用)、resolver 引 registry JSON——
// node 测试环境加载不了 → 安全降级为 no-op(不 stamp,真实环境仍会对齐)。
function getReconcileDeps(): { version: string; resolve: (c: unknown[] | undefined, id: string) => number; mods: ScenarioMod[] } | null {
  try {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const resolver = require('./characterResolver') as { REGISTRY_VERSION: string; resolveScenarioCharacters: (c: unknown[] | undefined, id: string) => number };
    const builtins = require('./builtins') as { BUILTIN_SCENARIO_MODS: ScenarioMod[] };
    /* eslint-enable @typescript-eslint/no-var-requires */
    return { version: resolver.REGISTRY_VERSION, resolve: resolver.resolveScenarioCharacters, mods: builtins.BUILTIN_SCENARIO_MODS || [] };
  } catch { return null; }
}

function reconcileSaveWithRegistry(saveData: SaveData, runtime: RuntimeState & { modId?: string; reconciledRegistryVersion?: string; canon?: { characters?: unknown[] } }): void {
  const deps = getReconcileDeps();
  if (!deps) return;
  if (runtime.reconciledRegistryVersion === deps.version) return;
  try {
    const modId = String((runtime as { modId?: string }).modId || '');
    deps.resolve((runtime as { canon?: { characters?: any[] } }).canon?.characters, modId);
    const mod = deps.mods.find(item => item.manifest?.id === modId);
    const worldInfo = readPath(saveData, ['世界', '信息']) as Record<string, unknown> | undefined;
    const saveLocations = worldInfo?.地点信息;
    if (mod && Array.isArray(saveLocations)) {
      const byName = new Map<string, any>();
      for (const item of saveLocations as any[]) {
        const n = item?.名称;
        if (typeof n === 'string' && n && !byName.has(n)) byName.set(n, item);
      }
      for (const loc of (mod.canon?.locations || []) as Array<{ name?: string; description?: string; type?: string; coordinates?: { x: number; y: number } }>) {
        if (!loc?.name || !loc.coordinates) continue;
        const found = byName.get(loc.name);
        if (found) {
          // 已存在：坐标是正典派生物（非玩家状态），按最新正典强制对齐——
          // 否则旧档带着修正前的错坐标（实测：建康钉在宋境）永远不更新。
          const cur = (found as any).coordinates || (found as any).坐标;
          if (!cur || cur.x !== loc.coordinates.x || cur.y !== loc.coordinates.y) {
            (found as any).coordinates = { ...loc.coordinates };
            (found as any).坐标 = { ...loc.coordinates };
          }
          continue;
        }
        byName.set(loc.name, null);
        saveLocations.push({
          名称: loc.name, 位置: '', coordinates: { ...loc.coordinates }, 坐标: { ...loc.coordinates },
          描述: loc.description || '', 特色: '', 安全等级: '较安全', 开放状态: '开放', 相关势力: [], 类型: loc.type || '城池',
        });
      }
    }
    console.info(`[剧本reconcile] 存档正典已对齐 registry ${deps.version}`);
  } catch (error) {
    console.warn('[剧本reconcile] 失败(不影响游戏):', error);
  }
  runtime.reconciledRegistryVersion = deps.version;
}

// 正典人格底线投影：把 registry principles 落到 社交.关系.<NPC>.人格底线（UI 显示 + 触犯好感暴跌机制）。
// 与提示词侧一致地按关系门控——好感≥30 或"自己人类"关系才揭示（陌生/敌对时保持"未记录"=尚未摸透）。
// 只填空的，不覆盖 LLM/玩家已写的底线；每回合运行(好感是动态的,跨过阈值即补)。
const 底线揭示好感 = 30;
const 自己人关系 = /同伴|伙伴|队友|道侣|伴侣|挚友|知己|情人|爱慕|恋|妾|后宫|侍妾|奴|婢|主仆|仆|结义|亲密|归顺|臣服|忠/;
function projectBottomLinesToNpcs(saveData: SaveData): void {
  try {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { getRegistryBottomLine } = require('./characterResolver') as { getRegistryBottomLine: (name: string) => string[] };
    /* eslint-enable @typescript-eslint/no-var-requires */
    const relations = readPath(saveData, ['社交', '关系']) as Record<string, any> | undefined;
    if (!relations || typeof relations !== 'object') return;
    for (const [key, npc] of Object.entries(relations)) {
      if (!npc || typeof npc !== 'object' || key.startsWith('_')) continue;
      if (Array.isArray(npc.人格底线) && npc.人格底线.length) continue; // 不覆盖已有
      const fav = Number(npc.好感度) || 0;
      const label = String(npc.与玩家关系 || '');
      if (fav < 底线揭示好感 && !自己人关系.test(label)) continue; // 未达揭示条件 → 保持未记录
      const name = String(npc.名字 || key);
      const canon = getRegistryBottomLine(name);
      if (canon.length) npc.人格底线 = canon;
    }
  } catch { /* 惰性 require 在 node 测试环境不可用 → 安全跳过 */ }
}

/**
 * 玩家主动偏移主线时置入的引子静默轮数。
 * 语义：置入当轮 advanceScenarioRuntime 会立即递减 1，故净静默约 (N-1) 轮；取 4 → 净静默约 3 轮，落在"3~4 轮"目标区间。
 *
 * 【判定归乙】玩家是否"主动偏移主线"由乙（分步第2步 LLM，写布尔 系统.扩展.任务追踪.主线偏移提议）判定：
 * 这需要理解整句意图（是闲逛偏离，还是借闲逛措辞执行主线目标），依赖 NPC/目标/上下文语义。
 * 曾尝试过关键词正则快判(甲)，经 Codex 五轮复审确认——正则永远追不上自然语言的否定/复合/语义，故废弃。
 * 引擎只据乙的布尔信号确定性置入本冷却值（见 AIBidirectionalSystem.processGmResponse）。
 */
export const STEERING_DIVERGENCE_COOLDOWN = 4;

export function advanceScenarioRuntime(saveData: SaveData): {
  saveData: SaveData;
  transitions: ScenarioRuntimeTransition[];
} {
  const next = structuredClone(saveData);
  const runtime = getRuntime(next);
  if (!runtime) return { saveData: next, transitions: [] };
  reconcileSaveWithRegistry(next, runtime as RuntimeState & { modId?: string });
  projectBottomLinesToNpcs(next);
  normalizeRuntimeFlags(runtime);

  runtime.chapters = Array.isArray(runtime.chapters) ? runtime.chapters : [];
  runtime.events = Array.isArray(runtime.events) ? runtime.events : [];
  runtime.completedChapterIds = Array.isArray(runtime.completedChapterIds) ? runtime.completedChapterIds : [];
  runtime.activeEventIds = Array.isArray(runtime.activeEventIds) ? runtime.activeEventIds : [];
  runtime.completedEventIds = Array.isArray(runtime.completedEventIds) ? runtime.completedEventIds : [];
  const transitions: ScenarioRuntimeTransition[] = [];
  const railProfile = getCanonRailProfile(runtime);

  const current = runtime.chapters.find(chapter => chapter.id === runtime.currentChapterId);
  const currentEventIds = new Set(current?.eventIds || []);
  for (const activeId of [...runtime.activeEventIds]) {
    const event = runtime.events.find(item => item.id === activeId);
    if (!event || !currentEventIds.has(activeId)) {
      runtime.activeEventIds = runtime.activeEventIds.filter(id => id !== activeId);
      continue;
    }
    if (hasCompletion(event.completion) && conditionsMatch(event.completion, next, runtime)) {
      runtime.activeEventIds = runtime.activeEventIds.filter(id => id !== activeId);
      if (!runtime.completedEventIds.includes(activeId)) runtime.completedEventIds.push(activeId);
      transitions.push({ type: 'event_completed', id: activeId });
    }
  }

  // 清算未曾活跃但完成条件已满足的事件（LLM 可能提前/越序 set 了 done flag）。
  // 否则章节一完成清空 activeEventIds 后，这些 critical 事件永远进不了 completedEventIds → stage_ready 死锁。
  for (const event of runtime.events) {
    if (railProfile?.orderedEventIds.includes(event.id)) continue;
    if (runtime.completedEventIds.includes(event.id)) continue;
    if (hasCompletion(event.completion) && conditionsMatch(event.completion, next, runtime)) {
      runtime.activeEventIds = runtime.activeEventIds.filter(id => id !== event.id);
      runtime.completedEventIds.push(event.id);
      transitions.push({ type: 'event_completed', id: event.id });
    }
  }

  // 事件落账后立即派生本章完成 flag，保证后续章节 activation 能在同一轮生效。
  settleCompletedChapterFlags(runtime);

  const currentRailComplete = isCanonRailChapter(railProfile, current?.id)
    && railProfile!.orderedEventIds.every(id => runtime.completedEventIds.includes(id));
  if (current && hasCompletion(current.completion) && (currentRailComplete || (!isCanonRailChapter(railProfile, current.id) && conditionsMatch(current.completion, next, runtime)))) {
    if (!runtime.completedChapterIds.includes(current.id)) runtime.completedChapterIds.push(current.id);
    transitions.push({ type: 'chapter_completed', id: current.id });
    runtime.currentChapterId = null;
    runtime.activeEventIds = [];
  }

  if (!runtime.currentChapterId) {
    const nextChapter = runtime.chapters.find(chapter =>
      !runtime.completedChapterIds.includes(chapter.id) && conditionsMatch(chapter.activation, next, runtime),
    );
    if (nextChapter) {
      runtime.currentChapterId = nextChapter.id;
      transitions.push({ type: 'chapter_activated', id: nextChapter.id });
    }
  }

  const activeChapter = runtime.chapters.find(chapter => chapter.id === runtime.currentChapterId);
  const chapterEventIds = new Set(activeChapter?.eventIds || []);
  if (isCanonRailChapter(railProfile, activeChapter?.id)) {
    const nextRailEventId = railProfile!.orderedEventIds.find(id => !runtime.completedEventIds.includes(id));
    if (nextRailEventId && !runtime.activeEventIds.includes(nextRailEventId)) {
      runtime.activeEventIds.push(nextRailEventId);
      transitions.push({ type: 'event_activated', id: nextRailEventId });
    }
  }
  for (const eventId of chapterEventIds) {
    if (runtime.activeEventIds.includes(eventId) || runtime.completedEventIds.includes(eventId)) continue;
    if (railProfile?.orderedEventIds.includes(eventId)) continue;
    const event = runtime.events.find(item => item.id === eventId);
    if (event && conditionsMatch(event.conditions, next, runtime)) {
      runtime.activeEventIds.push(eventId);
      transitions.push({ type: 'event_activated', id: eventId });
    }
  }

  const hasPendingCriticalEvent = runtime.events.some(event =>
    isCriticalStoryEvent(event) && !runtime.completedEventIds.includes(event.id),
  );
  if (
    runtime.nextStageId &&
    !runtime.currentChapterId &&
    runtime.activeEventIds.length === 0 &&
    !hasPendingCriticalEvent &&
    runtime.nextStageReadyId !== runtime.nextStageId
  ) {
    runtime.nextStageReadyId = runtime.nextStageId;
    transitions.push({ type: 'stage_ready', id: runtime.nextStageId });
  }

  // 剧情停滞计数：有待推进内容却本轮无任何推进 → +1；推进/无内容 → 清零。供收束提示分档。
  const progressed = transitions.some(t =>
    t.type === 'event_completed' || t.type === 'chapter_completed' || t.type === 'stage_ready',
  );
  const hasPendingWork = Boolean(runtime.currentChapterId) || runtime.activeEventIds.length > 0 || hasPendingCriticalEvent;
  // 主线偏移冷却（runtime 专属字段 steeringCooldown，由 processGmResponse 甲/乙确定性置入）：
  // 冷却期间暂停 stall 计数（玩家主动选支线，不算"迷路"）、抑制引子(见 storyContext)，引擎逐轮递减至 0。
  const steeringCooldown = typeof runtime.steeringCooldown === 'number' && runtime.steeringCooldown > 0 ? runtime.steeringCooldown : 0;
  if (progressed || !hasPendingWork) {
    runtime.stallTurns = 0;
  } else if (steeringCooldown === 0) {
    runtime.stallTurns = (runtime.stallTurns || 0) + 1;
  } // 冷却期：保持 stallTurns 不变（暂停累加）
  if (steeringCooldown > 0) {
    runtime.steeringCooldown = steeringCooldown - 1;
  }

  return { saveData: next, transitions };
}
