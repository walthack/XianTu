import type { SaveData } from '@/types/game';

import type {
  ScenarioCondition,
  ScenarioModChapter,
  ScenarioModCharacter,
  ScenarioModCharacterRelationship,
  ScenarioModEvent,
  ScenarioModOpening,
  ScenarioModPlayerRelationship,
} from './schema';

interface StoryRuntime {
  modId: string;
  modName?: string;
  mode: 'strict' | 'expand';
  axisVersion?: string;
  axisOrder?: number;
  axisSeqLo?: number | null;
  axisSeqHi?: number | null;
  prevStageId?: string | null;
  prevStageName?: string | null;
  nextStageId?: string | null;
  nextStageName?: string | null;
  currentChapterId: string | null;
  flags: Record<string, unknown>;
  chapters: ScenarioModChapter[];
  events: ScenarioModEvent[];
  activeEventIds: string[];
  completedChapterIds: string[];
  completedEventIds: string[];
  canon?: {
    characters?: ScenarioModCharacter[];
    factions?: Array<{ id: string; name: string }>;
    locations?: Array<{ id: string; name: string }>;
    playerRelationships?: ScenarioModPlayerRelationship[];
    relationships?: ScenarioModCharacterRelationship[];
  };
  opening?: ScenarioModOpening;
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

function formatAxisBeat(event: ScenarioModEvent, prefix = '主轴拍点'): string {
  const beat = compactText(event.axisBeat, 120);
  if (beat) return `${prefix}：${beat}`;
  if (event.axisId) return `${prefix}：${event.axisId}`;
  return '';
}

function isCriticalStoryEvent(event: ScenarioModEvent): boolean {
  if (event.critical !== undefined) return event.critical;
  if (event.axisMethod === 'reviewed-no-anchor' || event.axisId === null) return false;
  return Boolean(event.axisBeat || event.axisId || typeof event.axisSeq === 'number');
}

function namesForIds(
  ids: string[] | undefined,
  entities: Array<{ id: string; name: string }> | undefined,
): string {
  if (!ids?.length) return '';
  return ids.map(id => entities?.find(entity => entity.id === id)?.name || id).join('、');
}

function compactText(value: string | undefined, maxLength = 90): string {
  const compacted = (value || '').replace(/\s+/g, ' ').trim();
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength)}...` : compacted;
}

function formatList(values: string[] | undefined, maxItems = 4): string {
  if (!values?.length) return '';
  return values.map(value => compactText(value, 48)).filter(Boolean).slice(0, maxItems).join('、');
}

function formatCharacterRelationship(
  character: ScenarioModCharacter,
  playerRelationships: ScenarioModPlayerRelationship[] | undefined,
  relationships: ScenarioModCharacterRelationship[] | undefined,
  characters: ScenarioModCharacter[],
): string {
  const lines: string[] = [];
  const playerRelation = playerRelationships?.find(item => item.characterId === character.id);
  if (playerRelation) {
    lines.push(`与玩家：${playerRelation.relation}（好感 ${playerRelation.favorability}）`);
    const memories = formatList(playerRelation.memories, 2);
    if (memories) lines.push(`共同记忆：${memories}`);
  }
  const relationLines = (relationships || [])
    .filter(item => item.fromCharacterId === character.id || item.toCharacterId === character.id)
    .slice(0, 3)
    .map(item => {
      const otherId = item.fromCharacterId === character.id ? item.toCharacterId : item.fromCharacterId;
      const otherName = characters.find(entity => entity.id === otherId)?.name || otherId;
      return `${otherName}:${item.relation}`;
    });
  if (relationLines.length) lines.push(`人物关系：${relationLines.join('；')}`);
  return lines.join('；');
}

function formatFocusedCharacter(character: ScenarioModCharacter, runtime: StoryRuntime): string {
  const profile = character.profile || {};
  const lines: string[] = [`- ${character.name}（${[character.gender, character.role, character.realm].filter(Boolean).join('；') || '正典人物'}）`];
  const base = compactText(character.description || profile.origin || '');
  if (base) lines.push(`  身份/定位：${base}`);
  const personality = formatList(profile.personality);
  if (personality) lines.push(`  性格：${personality}`);
  if (profile.appearance) lines.push(`  外貌：${compactText(profile.appearance)}`);
  if (profile.currentAppearance) lines.push(`  当前外貌：${compactText(profile.currentAppearance)}`);
  if (profile.currentThought) lines.push(`  当前心思：${compactText(profile.currentThought)}`);
  const memories = formatList(profile.memories, 3);
  if (memories) lines.push(`  记忆：${memories}`);
  const notes = formatList(profile.notes, 6);
  if (notes) lines.push(`  正典备注：${notes}`);
  const relation = formatCharacterRelationship(
    character,
    runtime.canon?.playerRelationships,
    runtime.canon?.relationships,
    runtime.canon?.characters || [],
  );
  if (relation) lines.push(`  关系：${relation}`);
  return lines.join('\n');
}

function buildFocusedCharacterPrompt(runtime: StoryRuntime, activeEvents: ScenarioModEvent[]): string {
  const characters = runtime.canon?.characters || [];
  if (!characters.length) return '';
  const focusedIds = new Set<string>();
  for (const id of runtime.opening?.featuredCharacterIds || []) focusedIds.add(id);
  for (const event of activeEvents) {
    for (const id of event.relatedCharacterIds || []) focusedIds.add(id);
  }
  if (runtime.opening?.playerCharacterId) focusedIds.add(runtime.opening.playerCharacterId);
  const focusedCharacters = [...focusedIds]
    .map(id => characters.find(character => character.id === id))
    .filter((character): character is ScenarioModCharacter => !!character)
    .slice(0, 8);
  if (!focusedCharacters.length) return '';
  return `## 当前相关人物正典约束（防 OOC）
${focusedCharacters.map(character => formatFocusedCharacter(character, runtime)).join('\n')}

【人物正典优先级】：
1. 上述身份、关系、性格、谈吐/底线/目标等正典备注是硬约束；可以补充细节，但不得改写、否定或让角色无因突变。
2. 用户要求角色违背正典时，以角色内方式拒绝、回避、误解或转移；不得承认“设定已被修改”。
3. 角色成长必须由已发生剧情、关系变化或明确事件支撑；不得为了迎合单轮输入突然 OOC。`;
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
        const axisLine = formatAxisBeat(event);
        return `- ${event.name}：${event.description}\n  ${axisLine ? `${axisLine}\n  ` : ''}相关正典：${context || '无'}\n  完成条件：${formatConditions(event.completion)}`;
      }).join('\n')
    : '- 当前没有已触发事件，不要提前引入未触发事件。';

  // 主轴下一拍：找出依赖"当前事件完成条件"的后续事件，作为前进方向喂给 AI（避免 AI 停在原地等玩家）
  const activeCompletionPaths = new Set(
    activeEvents.flatMap(event => (event.completion || []).map(c => c.path)),
  );
  const completedIds = new Set(runtime.completedEventIds || []);
  const nextEvents = runtime.events.filter(event =>
    !activeIds.has(event.id) &&
    !completedIds.has(event.id) &&
    ((event as any).conditions || []).some((c: ScenarioCondition) => activeCompletionPaths.has(c.path)),
  );
  const pendingCriticalEvents = runtime.events.filter(event =>
    isCriticalStoryEvent(event) &&
    !completedIds.has(event.id) &&
    !activeIds.has(event.id),
  );
  // 仅给出下一拍事件名称作为推进方向，不带 description，避免提前泄露未来剧情细节
  const nextSection = nextEvents.length
    ? nextEvents.map(event => {
        const axisLine = formatAxisBeat(event, '下一拍');
        return `- ${event.name}${axisLine ? `（${axisLine}）` : ''}`;
      }).join('\n')
    : pendingCriticalEvents.length
      ? `- 本关仍有关键剧情未触发，不能切换下一关。继续围绕当前章节完成条件制造线索、调度相关人物，促成最近的关键剧情节点。`
    : runtime.nextStageId
      ? `- 本关收束后，建议切换到下一关：${runtime.nextStageName || runtime.nextStageId}（${runtime.nextStageId}）。不要在当前关提前展开下一关正文。`
      : '- （当前事件完成后将进入新章节或迎来结局）';
  const focusedCharacterSection = buildFocusedCharacterPrompt(runtime, activeEvents);
  const stageLine = [
    runtime.modName || runtime.modId,
    typeof runtime.axisSeqLo === 'number' && typeof runtime.axisSeqHi === 'number' ? `主轴范围 #${runtime.axisSeqLo}~#${runtime.axisSeqHi}` : '',
    runtime.nextStageId ? `下一关 ${runtime.nextStageName || runtime.nextStageId}` : '',
  ].filter(Boolean).join('；');

  return `# 当前剧本进度（仅限可见内容）
${stageLine ? `## 当前关卡\n${stageLine}\n\n` : ''}${chapterSection}

## 当前事件（玩家此刻所处的剧情节点）
${eventSection}

## 下一步（达成当前完成条件后，剧情将推进到）
${nextSection}

## 剧情标记
${JSON.stringify(runtime.flags || {})}

${focusedCharacterSection ? `${focusedCharacterSection}\n\n` : ''}【主动推进剧情，不要停在原地等玩家】：

1. 每一段叙事都要朝“当前事件”的完成条件前进——主动设置场景、引入相关人物、制造契机，引导玩家走向该事件的达成，而不是只描述当前一幕然后停下。
2. 当叙事中确实达成了完成条件，立即用 set 更新对应“世界.状态.剧本模组.flags.*”为 done；剧情随即推进到上面“下一步”所列事件。
3. 关键剧情事件未完成时，不要建议切换下一关；先推动当前关内关键剧情触发。
4. 避免反复描写同一幕或原地打转；玩家若无明确行动，由你主动顺着主轴往下带。
5. 不要猜测、引用或泄露后续章节，以及“下一步”之后尚未触发的事件细节。`;
}
