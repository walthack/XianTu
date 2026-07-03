import type { SaveData } from '@/types/game';

import type { ScenarioCondition, ScenarioFlagValue, ScenarioMod, ScenarioModChapter, ScenarioModEvent } from './schema';

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

interface RuntimeState extends ScenarioProgressState {
  currentChapterId: string | null;
  flags: Record<string, ScenarioFlagValue>;
  nextStageId?: string | null;
  nextStageReadyId?: string | null;
  /** 剧情停滞轮数：连续多少轮无事件/章节推进（供收束提示分档），推进即清零 */
  stallTurns?: number;
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

export function advanceScenarioRuntime(saveData: SaveData): {
  saveData: SaveData;
  transitions: ScenarioRuntimeTransition[];
} {
  const next = structuredClone(saveData);
  const runtime = getRuntime(next);
  if (!runtime) return { saveData: next, transitions: [] };
  normalizeRuntimeFlags(runtime);

  runtime.chapters = Array.isArray(runtime.chapters) ? runtime.chapters : [];
  runtime.events = Array.isArray(runtime.events) ? runtime.events : [];
  runtime.completedChapterIds = Array.isArray(runtime.completedChapterIds) ? runtime.completedChapterIds : [];
  runtime.activeEventIds = Array.isArray(runtime.activeEventIds) ? runtime.activeEventIds : [];
  runtime.completedEventIds = Array.isArray(runtime.completedEventIds) ? runtime.completedEventIds : [];
  const transitions: ScenarioRuntimeTransition[] = [];

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
    if (runtime.completedEventIds.includes(event.id)) continue;
    if (hasCompletion(event.completion) && conditionsMatch(event.completion, next, runtime)) {
      runtime.activeEventIds = runtime.activeEventIds.filter(id => id !== event.id);
      runtime.completedEventIds.push(event.id);
      transitions.push({ type: 'event_completed', id: event.id });
    }
  }

  if (current && hasCompletion(current.completion) && conditionsMatch(current.completion, next, runtime)) {
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
  for (const eventId of chapterEventIds) {
    if (runtime.activeEventIds.includes(eventId) || runtime.completedEventIds.includes(eventId)) continue;
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
  runtime.stallTurns = progressed || !hasPendingWork ? 0 : (runtime.stallTurns || 0) + 1;

  return { saveData: next, transitions };
}
