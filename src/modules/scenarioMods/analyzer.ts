import type { ScenarioCondition, ScenarioFlagValue, ScenarioMod, ScenarioModChapter } from './schema';

export type ScenarioAnalysisSeverity = 'error' | 'warning';

export interface ScenarioAnalysisIssue {
  severity: ScenarioAnalysisSeverity;
  path: string;
  code: string;
  message: string;
}

export interface ScenarioAnalysisResult {
  valid: boolean;
  issues: ScenarioAnalysisIssue[];
}

function conditionValue(condition: ScenarioCondition, flags: Record<string, ScenarioFlagValue>): unknown {
  if (condition.path === 'flags') return flags;
  if (!condition.path.startsWith('flags.')) return undefined;
  return flags[condition.path.slice('flags.'.length)];
}

function conditionMatchesInitial(condition: ScenarioCondition, flags: Record<string, ScenarioFlagValue>): boolean {
  const actual = conditionValue(condition, flags);
  switch (condition.operator) {
    case 'eq': return actual === condition.value;
    case 'neq': return actual !== condition.value;
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

function chapterInitiallyReachable(chapter: ScenarioModChapter, flags: Record<string, ScenarioFlagValue>): boolean {
  return !chapter.activation?.length || chapter.activation.every(condition => conditionMatchesInitial(condition, flags));
}

function conditionSignature(condition: ScenarioCondition): string {
  return `${condition.path}|${condition.operator}|${JSON.stringify(condition.value)}`;
}

function chapterCanLeadTo(source: ScenarioModChapter, target: ScenarioModChapter, initial: Record<string, ScenarioFlagValue>): boolean {
  if (!target.activation?.length) return false;
  const completions = new Set((source.completion || []).map(conditionSignature));
  return target.activation.every(condition =>
    conditionMatchesInitial(condition, initial) || completions.has(conditionSignature(condition)),
  );
}

function findCycle(graph: Map<string, string[]>): string[] | null {
  const visited = new Set<string>();
  const active = new Set<string>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    if (active.has(id)) {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    if (visited.has(id)) return null;
    visited.add(id);
    active.add(id);
    stack.push(id);
    for (const next of graph.get(id) || []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    active.delete(id);
    return null;
  };

  for (const id of graph.keys()) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

export function analyzeScenarioMod(mod: ScenarioMod): ScenarioAnalysisResult {
  const issues: ScenarioAnalysisIssue[] = [];
  const add = (severity: ScenarioAnalysisSeverity, path: string, code: string, message: string) => {
    issues.push({ severity, path, code, message });
  };
  const chapters = mod.scenario.chapters || [];
  const events = mod.scenario.events || [];
  const initialFlags = mod.scenario.initialFlags || {};

  const conditionGroups: Array<{ path: string; conditions: ScenarioCondition[] | undefined }> = [];
  chapters.forEach((chapter, index) => {
    conditionGroups.push(
      { path: `scenario.chapters[${index}].activation`, conditions: chapter.activation },
      { path: `scenario.chapters[${index}].completion`, conditions: chapter.completion },
    );
  });
  events.forEach((event, index) => {
    conditionGroups.push(
      { path: `scenario.events[${index}].conditions`, conditions: event.conditions },
      { path: `scenario.events[${index}].completion`, conditions: event.completion },
    );
  });
  for (const group of conditionGroups) {
    group.conditions?.forEach((condition, index) => {
      if (!condition.path.startsWith('flags.')) return;
      const flag = condition.path.slice('flags.'.length);
      if (!Object.prototype.hasOwnProperty.call(initialFlags, flag)) {
        add('error', `${group.path}[${index}].path`, 'uninitialized_flag', `Flag "${flag}" is not declared in scenario.initialFlags.`);
      }
    });
  }

  if (chapters.length === 0) {
    add('warning', 'scenario.chapters', 'no_chapters', 'Scenario has no chapters; only the opening can run.');
  } else if (!chapters.some(chapter => chapterInitiallyReachable(chapter, initialFlags))) {
    add('error', 'scenario.chapters', 'no_initial_chapter', 'No chapter can activate from scenario.initialFlags.');
  }

  chapters.slice(0, -1).forEach((chapter, index) => {
    if (!chapter.completion?.length) {
      add('error', `scenario.chapters[${index}].completion`, 'blocking_chapter_without_completion', `Non-terminal chapter "${chapter.id}" cannot complete, so later chapters cannot run.`);
    }
  });

  const eventUsage = new Map<string, number[]>();
  chapters.forEach((chapter, chapterIndex) => {
    chapter.eventIds?.forEach(eventId => {
      const usage = eventUsage.get(eventId) || [];
      usage.push(chapterIndex);
      eventUsage.set(eventId, usage);
    });
  });
  events.forEach((event, index) => {
    const usage = eventUsage.get(event.id) || [];
    if (usage.length === 0) {
      add('warning', `scenario.events[${index}]`, 'orphan_event', `Event "${event.id}" is not referenced by any chapter.`);
    } else if (usage.length > 1) {
      add('warning', `scenario.events[${index}]`, 'reused_event', `Event "${event.id}" is referenced by multiple chapters and shares one runtime completion state.`);
    }
  });

  const graph = new Map(chapters.map(chapter => [chapter.id, [] as string[]]));
  chapters.forEach(source => {
    chapters.forEach(target => {
      if (source.id !== target.id && chapterCanLeadTo(source, target, initialFlags)) graph.get(source.id)?.push(target.id);
    });
  });
  const roots = chapters.filter(chapter => chapterInitiallyReachable(chapter, initialFlags)).map(chapter => chapter.id);
  const reachable = new Set<string>();
  const visit = (id: string) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    (graph.get(id) || []).forEach(visit);
  };
  roots.forEach(visit);
  chapters.forEach((chapter, index) => {
    if (!reachable.has(chapter.id)) {
      add('warning', `scenario.chapters[${index}].activation`, 'unreachable_chapter', `Chapter "${chapter.id}" is not linked to an initially reachable chapter by matching completion conditions.`);
    }
  });

  const cycle = findCycle(graph);
  if (cycle) {
    add('error', 'scenario.chapters', 'chapter_cycle', `Chapter dependency cycle detected: ${cycle.join(' -> ')}.`);
  }

  return { valid: !issues.some(issue => issue.severity === 'error'), issues };
}
