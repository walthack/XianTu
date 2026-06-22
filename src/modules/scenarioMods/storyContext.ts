import type { SaveData } from '@/types/game';

import type { ScenarioCondition, ScenarioModChapter, ScenarioModEvent } from './schema';

interface StoryRuntime {
  modId: string;
  mode: 'strict' | 'expand';
  currentChapterId: string | null;
  flags: Record<string, unknown>;
  chapters: ScenarioModChapter[];
  events: ScenarioModEvent[];
  activeEventIds: string[];
  completedChapterIds: string[];
  completedEventIds: string[];
  canon?: {
    characters?: Array<{ id: string; name: string }>;
    factions?: Array<{ id: string; name: string }>;
    locations?: Array<{ id: string; name: string }>;
  };
}

function readPath(root: unknown, path: string[]): unknown {
  let current = root;
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function getRuntime(saveData: SaveData): StoryRuntime | null {
  const value = readPath(saveData, ['世界', '状态', '剧本模组']);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.modId !== 'string') return null;
  return record as unknown as StoryRuntime;
}

function formatConditions(conditions: ScenarioCondition[] | undefined): string {
  if (!conditions?.length) return '无显式条件';
  return conditions
    .map(condition => `${condition.path} ${condition.operator}${condition.value !== undefined ? ` ${JSON.stringify(condition.value)}` : ''}`)
    .join('；');
}

function namesForIds(
  ids: string[] | undefined,
  entities: Array<{ id: string; name: string }> | undefined,
): string {
  if (!ids?.length) return '';
  return ids.map(id => entities?.find(entity => entity.id === id)?.name || id).join('、');
}

export function createScenarioPromptState<T extends SaveData>(saveData: T): T {
  const promptState = structuredClone(saveData);
  const runtime = getRuntime(promptState);
  if (!runtime) return promptState;

  runtime.chapters = runtime.chapters.filter(chapter => chapter.id === runtime.currentChapterId);
  const activeIds = new Set(runtime.activeEventIds || []);
  runtime.events = runtime.events.filter(event => activeIds.has(event.id));
  return promptState;
}

export function buildScenarioStoryPrompt(saveData: SaveData): string {
  const runtime = getRuntime(saveData);
  if (!runtime) return '';

  const chapter = runtime.chapters.find(item => item.id === runtime.currentChapterId);
  const activeIds = new Set(runtime.activeEventIds || []);
  const activeEvents = runtime.events.filter(event => activeIds.has(event.id));
  const characters = runtime.canon?.characters || [];
  const factions = runtime.canon?.factions || [];
  const locations = runtime.canon?.locations || [];

  const chapterSection = chapter
    ? `## 当前章节：${chapter.title}\n${chapter.summary}\n章节完成条件：${formatConditions(chapter.completion)}`
    : '## 当前章节\n暂无已激活章节。不要自行使用或透露后续章节内容。';
  const eventSection = activeEvents.length
    ? activeEvents.map(event => {
        const context = [
          namesForIds(event.relatedCharacterIds, characters),
          namesForIds(event.relatedFactionIds, factions),
          namesForIds(event.locationId ? [event.locationId] : [], locations),
        ].filter(Boolean).join('；');
        return `- ${event.name}：${event.description}\n  相关正典：${context || '无'}\n  完成条件：${formatConditions(event.completion)}`;
      }).join('\n')
    : '- 当前没有已触发事件，不要提前引入未触发事件。';

  return `# 当前剧本进度（仅限可见内容）
${chapterSection}

## 当前事件
${eventSection}

## 剧情标记
${JSON.stringify(runtime.flags || {})}

只围绕当前章节和当前事件推进。仅当叙事中确实发生了对应事实时，使用 set 更新“世界.状态.剧本模组.flags.*”；不要猜测、引用或泄露后续章节。`;
}
