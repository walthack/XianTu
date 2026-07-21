import type { SaveData } from '@/types/game';
import { getNarrativeAnchorEvent } from './runtime';

import type {
  ScenarioContentAccessRule,
  ScenarioModCharacter,
  ScenarioModCharacterAffiliation,
  ScenarioModFaction,
  ScenarioModItem,
  ScenarioModLocation,
  ScenarioModSkill,
  ScenarioModTechnique,
} from './schema';

interface ScenarioRuntimeState {
  modId: string;
  mode: 'strict' | 'expand';
  lockedFields?: string[];
  contentAccess?: ScenarioContentAccessRule[];
  currentChapterId?: string | null;
  activeEventIds?: string[];
  chapters?: Array<{ id: string; eventIds?: string[] }>;
  events?: Array<{
    id: string;
    critical?: boolean;
    axisSeq?: number;
    axisId?: string | null;
    axisBeat?: string;
    relatedCharacterIds?: string[];
    completion?: Array<{ path?: string; operator?: string; value?: unknown }>;
    playerCompletionContract?: { kind?: string };
    worldActor?: {
      opportunities?: Array<{ completionContract?: { kind?: string } }>;
    };
  }>;
  completedEventIds?: string[];
  opening?: {
    playerCharacterId?: string;
  };
  canon?: {
    factions?: ScenarioModFaction[];
    locations?: ScenarioModLocation[];
    characters?: ScenarioModCharacter[];
    skills?: ScenarioModSkill[];
    techniques?: ScenarioModTechnique[];
    items?: ScenarioModItem[];
  };
}

interface CommandLike {
  action?: unknown;
  key?: unknown;
  value?: unknown;
}

export interface RejectedScenarioCommand {
  command: unknown;
  reason: string;
}

export interface ScenarioCommandGuardResult {
  accepted: unknown[];
  rejected: RejectedScenarioCommand[];
}

function getRuntimeState(saveData: SaveData): ScenarioRuntimeState | null {
  const runtime = readPath(saveData, ['世界', '状态', '剧本模组']);
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) return null;
  const record = runtime as Record<string, unknown>;
  if (typeof record.modId !== 'string') return null;
  return record as unknown as ScenarioRuntimeState;
}

function readPath(root: unknown, path: string[]): unknown {
  let current = root;
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function normalizePath(path: string): string {
  return path.trim().replace(/\[(\d+)\]/g, '.$1').replace(/^\.+|\.+$/g, '');
}

function pathsIntersect(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}

function hasLock(runtime: ScenarioRuntimeState, path: string): boolean {
  return (runtime.lockedFields || []).includes(path);
}

function findEntityIndex(items: unknown, entity: { id: string; name: string }): number {
  if (!Array.isArray(items)) return -1;
  return items.findIndex(item => {
    if (!item || typeof item !== 'object') return false;
    const record = item as Record<string, unknown>;
    return record.id === entity.id || record.名称 === entity.name || record.name === entity.name;
  });
}

function addNamePaths(paths: Set<string>, basePath: string): void {
  paths.add(`${basePath}.名称`);
  paths.add(`${basePath}.名字`);
  paths.add(`${basePath}.name`);
}

function collectNamedEntityPaths(
  value: unknown,
  basePath: string,
  entities: Array<{ id: string; name: string }>,
  paths: Set<string>,
  depth = 0,
): void {
  if (!value || typeof value !== 'object' || depth > 7) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectNamedEntityPaths(item, `${basePath}.${index}`, entities, paths, depth + 1));
    return;
  }

  const record = value as Record<string, unknown>;
  const matches = entities.some(entity =>
    record.id === entity.id || record.名称 === entity.name || record.名字 === entity.name || record.name === entity.name,
  );
  if (matches) addNamePaths(paths, basePath);
  for (const [key, child] of Object.entries(record)) {
    collectNamedEntityPaths(child, `${basePath}.${key}`, entities, paths, depth + 1);
  }
}

type ScenarioContentEntity = ScenarioModSkill | ScenarioModTechnique | ScenarioModItem;

function getContentEntity(runtime: ScenarioRuntimeState, contentId: string): ScenarioContentEntity | undefined {
  const canon = runtime.canon || {};
  return [...(canon.skills || []), ...(canon.techniques || []), ...(canon.items || [])]
    .find(entity => entity.id === contentId);
}

function getCommandTargetIdentity(
  runtime: ScenarioRuntimeState,
  key: string,
): { characterId: string; isPlayer: boolean } | null {
  if (key === '角色' || key.startsWith('角色.')) {
    return {
      characterId: runtime.opening?.playerCharacterId || '$independent_player',
      isPlayer: true,
    };
  }
  const prefix = '社交.关系.';
  if (!key.startsWith(prefix)) return null;
  const characterName = key.slice(prefix.length).split('.')[0];
  const character = (runtime.canon?.characters || []).find(entity =>
    entity.id === characterName || entity.name === characterName,
  );
  return character ? { characterId: character.id, isPlayer: false } : { characterId: `$npc:${characterName}`, isPlayer: false };
}

function isContentAssignmentPath(key: string): boolean {
  const parts = key.split('.');
  if (key === '角色') return true;
  if (parts[0] === '社交' && parts[1] === '关系' && parts.length === 3) return true;
  const contentSegments = new Set(['技能', '功法', '背包', '装备', '灵根', '天赋', '特殊体质', '能力']);
  return parts.some(part => contentSegments.has(part));
}

function commandReferencesContent(command: CommandLike, entity: ScenarioContentEntity): boolean {
  let serializedValue = '';
  try {
    serializedValue = JSON.stringify(command.value) || '';
  } catch {
    serializedValue = String(command.value ?? '');
  }
  const key = typeof command.key === 'string' ? command.key : '';
  return key.includes(entity.id) || key.includes(entity.name) || serializedValue.includes(entity.id) || serializedValue.includes(entity.name);
}

function findContentAccessViolation(
  runtime: ScenarioRuntimeState,
  command: CommandLike,
  key: string,
): string | null {
  const target = getCommandTargetIdentity(runtime, key);
  if (!target || !isContentAssignmentPath(key)) return null;

  for (const rule of runtime.contentAccess || []) {
    const entity = getContentEntity(runtime, rule.contentId);
    if (!entity || !commandReferencesContent(command, entity)) continue;
    const isIndependentPlayer = target.isPlayer && target.characterId === '$independent_player';
    const allowed = (rule.allowedCharacterIds || []).includes(target.characterId) || (isIndependentPlayer && rule.playerAllowed === true);
    if (!allowed) {
      const label = rule.policy === 'exclusive' ? '专属' : '受限';
      return `${label}正典内容“${entity.name}”不得授予当前角色`;
    }
  }
  return null;
}

function getCharacterAffiliations(
  character: ScenarioModCharacter,
  factions: ScenarioModFaction[] = [],
): ScenarioModCharacterAffiliation[] {
  const affiliations = [...(character.affiliations || [])];
  if (character.factionId && !affiliations.some(item => item.factionId === character.factionId)) {
    const faction = factions.find(item => item.id === character.factionId);
    affiliations.push({
      factionId: character.factionId,
      category: faction ? affiliationCategoryForFaction(faction) : 'organization',
      exclusive: true,
    });
  }
  return affiliations;
}

function affiliationCategoryForPath(key: string): ScenarioModCharacterAffiliation['category'] | null {
  if (key.includes('宗门') || key.includes('宗派')) return 'sect';
  if (key.includes('军团') || key.includes('军籍')) return 'military';
  if (key.includes('国家') || key.includes('朝廷')) return 'state';
  if (key.includes('家族') || key.includes('氏族')) return 'clan';
  if (key.includes('势力归属') || key.includes('所属势力') || key.includes('阵营')) return 'organization';
  return null;
}

function affiliationCategoryForFaction(faction: ScenarioModFaction): ScenarioModCharacterAffiliation['category'] {
  const type = faction.type || '';
  if (/[宗门派教]/.test(type)) return 'sect';
  if (/[军兵营]/.test(type)) return 'military';
  if (/[国朝廷]/.test(type)) return 'state';
  if (/[族家]/.test(type)) return 'clan';
  return 'organization';
}

function findCharacterAffiliationViolation(
  runtime: ScenarioRuntimeState,
  command: CommandLike,
  key: string,
): string | null {
  const target = getCommandTargetIdentity(runtime, key);
  if (!target) return null;
  const character = (runtime.canon?.characters || []).find(item => item.id === target.characterId);
  if (!character) return null;
  const factions = runtime.canon?.factions || [];
  const affiliations = getCharacterAffiliations(character, factions);
  if (affiliations.length === 0) return null;

  const targetCategory = affiliationCategoryForPath(key);
  const isWholeNpcWrite = key === `社交.关系.${character.name}` || key === '角色';
  if (!targetCategory && !isWholeNpcWrite) return null;

  let value = command.value;
  if (isWholeNpcWrite && value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    value = record.势力归属 ?? record.所属势力 ?? record.宗门 ?? record.宗派;
  }
  if (typeof value !== 'string' || value.trim() === '') return null;

  const assignedFaction = factions.find(faction => faction.id === value || faction.name === value);
  const category = targetCategory && targetCategory !== 'organization'
    ? targetCategory
    : assignedFaction ? affiliationCategoryForFaction(assignedFaction) : null;
  const exclusiveAffiliations = affiliations.filter(item => item.exclusive !== false && (!category || item.category === category));
  if (exclusiveAffiliations.length === 0) return null;
  if (assignedFaction && exclusiveAffiliations.some(item => item.factionId === assignedFaction.id)) return null;

  const allowedNames = exclusiveAffiliations.map(item =>
    factions.find(faction => faction.id === item.factionId)?.name || item.factionId,
  ).join('、');
  return `正典人物“${character.name}”的${category || '势力'}归属已固定为：${allowedNames}`;
}

function findSectMembershipViolation(runtime: ScenarioRuntimeState, command: CommandLike, key: string): string | null {
  const root = '社交.宗门.宗门成员';
  const factions = runtime.canon?.factions || [];
  const assignments: Array<{ faction: ScenarioModFaction | undefined; members: unknown }> = [];
  if (key === root && command.value && typeof command.value === 'object' && !Array.isArray(command.value)) {
    for (const [factionKey, members] of Object.entries(command.value as Record<string, unknown>)) {
      assignments.push({ faction: factions.find(item => item.id === factionKey || item.name === factionKey), members });
    }
  } else if (key.startsWith(`${root}.`)) {
    const remainder = key.slice(root.length + 1);
    const faction = factions.find(item =>
      remainder === item.id || remainder === item.name || remainder.startsWith(`${item.id}.`) || remainder.startsWith(`${item.name}.`),
    );
    assignments.push({ faction, members: command.value });
  } else {
    return null;
  }

  for (const assignment of assignments) {
    const serialized = JSON.stringify(assignment.members) || '';
    for (const character of runtime.canon?.characters || []) {
      if (!serialized.includes(character.id) && !serialized.includes(character.name)) continue;
      const sects = getCharacterAffiliations(character, factions)
        .filter(item => item.category === 'sect' && item.exclusive !== false);
      if (sects.length === 0 || (assignment.faction && sects.some(item => item.factionId === assignment.faction?.id))) continue;
      const allowedNames = sects.map(item =>
        factions.find(candidate => candidate.id === item.factionId)?.name || item.factionId,
      ).join('、');
      return `正典人物“${character.name}”不得加入其他宗派；固定宗派：${allowedNames}`;
    }
  }
  return null;
}

function getScenarioEventIdsAllowedForCompletion(runtime: ScenarioRuntimeState): Set<string> {
  const currentChapter = (runtime.chapters || []).find(chapter => chapter.id === runtime.currentChapterId);
  // 初始化/单测等尚未跑 activation 的时刻，仍只允许当前章最早一拍，而不是退化为“全都可写”。
  const activeEventIds = runtime.activeEventIds?.length ? runtime.activeEventIds : currentChapter?.eventIds || [];
  const anchor = getNarrativeAnchorEvent({ ...runtime, activeEventIds } as any);
  const allowed = new Set(anchor ? [anchor.id] : []);
  // 显式 critical:false 的事件是隔离内容层：只在已经由 runtime 激活时允许落自己的
  // 唯一完成键，不取得主轴锚点地位，也不能借此完成尚未激活的未来事件。
  if (runtime.currentChapterId && runtime.activeEventIds?.length) {
    const trulyActiveIds = new Set(runtime.activeEventIds);
    for (const event of runtime.events || []) {
      if (event.critical === false && trulyActiveIds.has(event.id)) allowed.add(event.id);
    }
  }
  return allowed;
}

function findScenarioEventForCompletionFlag(
  runtime: ScenarioRuntimeState,
  flagPath: string,
): { event?: NonNullable<ScenarioRuntimeState['events']>[number]; error?: string } {
  const completionPath = `flags.${flagPath}`;
  const matches = (runtime.events || []).filter(event =>
    (event.completion || []).some(condition =>
      condition.path === completionPath
      && condition.operator === 'eq'
      && condition.value === true,
    ),
  );
  if (matches.length === 0) return { error: `未知剧本事件完成标记：${completionPath}` };
  if (matches.length > 1) return { error: `剧本事件完成标记不唯一：${completionPath}` };
  return { event: matches[0] };
}

function findScenarioFlagViolation(runtime: ScenarioRuntimeState, command: CommandLike, key: string): string | null {
  if (!key.startsWith('世界.状态.剧本模组.flags.')) return null;
  if (command.action !== 'set') return '剧本进度 flags 只能用 set 写入';

  const flagPath = key.slice('世界.状态.剧本模组.flags.'.length);
  const parts = flagPath.split('.');
  const namespace = parts[0];
  if (namespace !== 'event' && namespace !== 'chapter') return null;

  if (parts.length < 3 || parts[parts.length - 1] !== 'done') {
    return `剧本${namespace === 'event' ? '事件' : '章节'}完成标记必须写成 flags.${namespace}.<id>.done`;
  }
  // Some compatible models serialize an exact boolean completion as the string "true".
  // Normalize only inside this declared completion namespace; arbitrary flags stay untouched.
  if (command.value === 'true') command.value = true;
  if (command.value !== true) {
    return `剧本${namespace === 'event' ? '事件' : '章节'}完成标记只能写入 true`;
  }

  const id = parts.slice(1, -1).join('.');
  if (!id) return `剧本${namespace === 'event' ? '事件' : '章节'}完成标记缺少 id`;

  if (namespace === 'event') {
    const resolved = findScenarioEventForCompletionFlag(runtime, flagPath);
    if (resolved.error || !resolved.event) return resolved.error || `未知剧本事件完成标记：flags.${flagPath}`;
    if (resolved.event.worldActor?.opportunities?.some(opportunity =>
      opportunity.completionContract?.kind === 'player_action_sequence'
    )) {
      return `事件 ${resolved.event.id} 的完成标记由机会卡确定性合同与本地引擎独占写入`;
    }
    if (resolved.event.playerCompletionContract?.kind === 'local_condition') {
      return `事件 ${resolved.event.id} 的完成标记由非机会卡本地判定合同与引擎独占写入`;
    }
    const allowedIds = getScenarioEventIdsAllowedForCompletion(runtime);
    if (allowedIds.size === 0) return `当前没有可完成的剧本事件：${resolved.event.id}`;
    if (!allowedIds.has(resolved.event.id)) {
      return `不得越级完成非当前章节/活跃事件：${resolved.event.id}`;
    }
    // Canon Rail 只放行“当前叙事锚点 → 该事件唯一 completion flag → set true”。
    // 顺序、路径和值均由本地 runtime 确定性核验；事件对账仍负责漏标、等价路径与分歧自愈。
    return null;
  }

  const knownChapterIds = new Set((runtime.chapters || []).map(chapter => chapter.id));
  if (knownChapterIds.size > 0 && !knownChapterIds.has(id)) return `未知剧本章节 id：${id}`;
  if (runtime.currentChapterId && id !== runtime.currentChapterId) {
    return `不得越级完成非当前章节：${id}`;
  }
  return null;
}

export function compileScenarioProtectedPaths(saveData: SaveData): string[] {
  const runtime = getRuntimeState(saveData);
  if (!runtime) return [];

  const paths = new Set<string>([
    '世界.状态.剧本模组',
    '系统.扩展.剧本模组',
    // 称号=里程碑奖励，只能由引擎(milestoneRewards)在故事线正确落点授予，AI 不得自封/篡改
    '角色.身份.称号',
  ]);
  const canon = runtime.canon || {};
  const worldInfo = readPath(saveData, ['世界', '信息']) as Record<string, unknown> | undefined;

  if (hasLock(runtime, 'canon.factions.*.name')) {
    for (const faction of canon.factions || []) {
      const index = findEntityIndex(worldInfo?.势力信息, faction);
      if (index >= 0) addNamePaths(paths, `世界.信息.势力信息.${index}`);
    }
  }

  if (hasLock(runtime, 'canon.locations.*.name')) {
    for (const location of canon.locations || []) {
      const index = findEntityIndex(worldInfo?.地点信息, location);
      if (index >= 0) addNamePaths(paths, `世界.信息.地点信息.${index}`);
    }
  }

  if (hasLock(runtime, 'canon.characters.*.name')) {
    for (const character of canon.characters || []) {
      addNamePaths(paths, `社交.关系.${character.name}`);
      // 核心身份字段随 name 锁一并保护（G1 根因②）：这些是"天生不变"正典，AI 改写会存进档
      // （前例：凝羽灵根被改、NPC 性别被演反）。境界/性格等可成长字段不锁。
      for (const field of ['性别', '种族', '灵根', '出生日期']) {
        paths.add(`社交.关系.${character.name}.${field}`);
      }
    }
  }

  const searchableRoots: Array<[string, unknown]> = [
    ['角色.技能', readPath(saveData, ['角色', '技能'])],
    ['角色.功法', readPath(saveData, ['角色', '功法'])],
    ['角色.背包', readPath(saveData, ['角色', '背包'])],
    ['角色.装备', readPath(saveData, ['角色', '装备'])],
  ];
  const contentLocks: Array<[string, Array<{ id: string; name: string }>]> = [
    ['content.skills.*.name', canon.skills || []],
    ['content.techniques.*.name', canon.techniques || []],
    ['content.items.*.name', canon.items || []],
  ];
  for (const [lockPath, entities] of contentLocks) {
    if (!hasLock(runtime, lockPath) || entities.length === 0) continue;
    for (const [rootPath, rootValue] of searchableRoots) {
      collectNamedEntityPaths(rootValue, rootPath, entities, paths);
    }
  }

  return [...paths];
}

// #18:rail 前方事件相关角色的死亡级词表。生死权只归事件在场演出与场外结算,
// 模型命令先斩后奏会吞掉高光演出合同与生还 IF 的触发窗口。
const RAIL_AHEAD_DEATH_RE = /死亡|已死|身亡|殒命|战死|阵亡|暴毙|气绝|绝命|尸首|曝尸|失踪|下落不明/;

// 收集「尚未到达」主线事件(未完成且未激活)牵涉的正典角色名。
// 激活中的事件不保护——在场演出里写死亡是事件本身的合法进程。
function collectRailAheadCharacterNames(runtime: ScenarioRuntimeState): Set<string> {
  const names = new Set<string>();
  const completed = new Set(runtime.completedEventIds || []);
  const active = new Set(runtime.activeEventIds || []);
  const idToName = new Map(
    (runtime.canon?.characters || []).map(character => [character.id, character.name] as const),
  );
  for (const event of runtime.events || []) {
    if (!event?.id || completed.has(event.id) || active.has(event.id)) continue;
    for (const characterId of event.relatedCharacterIds || []) {
      const name = idToName.get(characterId);
      if (name) names.add(name);
    }
  }
  return names;
}

function serializeCommandValue(command: unknown): string {
  const value = (command as CommandLike)?.value;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value ?? '');
  } catch {
    return String(value ?? '');
  }
}

export function guardScenarioModCommands(saveData: SaveData, commands: unknown[]): ScenarioCommandGuardResult {
  const runtime = getRuntimeState(saveData);
  const protectedPaths = compileScenarioProtectedPaths(saveData);
  if (!runtime || protectedPaths.length === 0) return { accepted: [...commands], rejected: [] };

  const railAheadNames = collectRailAheadCharacterNames(runtime);
  const accepted: unknown[] = [];
  const rejected: RejectedScenarioCommand[] = [];
  for (const command of commands) {
    const action = typeof (command as CommandLike)?.action === 'string'
      ? (command as CommandLike).action
      : '';
    const key = typeof (command as CommandLike)?.key === 'string'
      ? normalizePath((command as CommandLike).key as string)
      : '';
    if (key === '系统.扩展.判定' || key.startsWith('系统.扩展.判定.')) {
      rejected.push({ command, reason: '行动判定状态仅可由本地引擎写入' });
      continue;
    }
    const isAllowedFlagUpdate = action === 'set' && key.startsWith('世界.状态.剧本模组.flags.');
    const scenarioFlagViolation = key ? findScenarioFlagViolation(runtime, command as CommandLike, key) : null;
    // 承重保护：正典人物的花名册条目不可被整体删除（防即兴把关键角色从世界抹掉）
    if (['delete', 'remove', 'del'].includes(String(action)) && key.startsWith('社交.关系.')) {
      const targetName = key.slice('社交.关系.'.length).split('.')[0];
      if (key === `社交.关系.${targetName}` && (runtime.canon?.characters || []).some(c => c.name === targetName)) {
        rejected.push({ command, reason: `剧本正典人物不可删除：${targetName}` });
        continue;
      }
    }
    // #18 生死护栏：牵涉 rail 前方事件的正典角色，不得由模型命令写入死亡/失踪级状态
    //（先斩后奏会吞掉高光合同与生还 IF；在场事件与场外结算不走本通道，不受影响）
    if (railAheadNames.size > 0 && key.startsWith('社交.关系.')) {
      const targetName = key.slice('社交.关系.'.length).split('.')[0];
      if (railAheadNames.has(targetName) && RAIL_AHEAD_DEATH_RE.test(serializeCommandValue(command))) {
        rejected.push({
          command,
          reason: `「${targetName}」牵涉尚未到达的主线事件，其死亡/失踪只能由对应事件在场演出或场外结算落账`,
        });
        continue;
      }
    }
    const protectedPath = key && protectedPaths.find(path => pathsIntersect(key, path));
    const accessViolation = key ? findContentAccessViolation(runtime, command as CommandLike, key) : null;
    const affiliationViolation = key
      ? findCharacterAffiliationViolation(runtime, command as CommandLike, key) || findSectMembershipViolation(runtime, command as CommandLike, key)
      : null;
    if (scenarioFlagViolation || accessViolation || affiliationViolation) {
      rejected.push({ command, reason: scenarioFlagViolation || accessViolation || affiliationViolation || '' });
    } else if (protectedPath && !isAllowedFlagUpdate) {
      rejected.push({
        command,
        reason: `剧本模组正典字段受保护：${protectedPath}`,
      });
    } else {
      accepted.push(command);
    }
  }
  return { accepted, rejected };
}

export function buildScenarioCanonPrompt(saveData: SaveData): string {
  const runtime = getRuntimeState(saveData);
  if (!runtime) return '';
  const canon = runtime.canon || {};
  const formatNames = (items: Array<{ name: string }> | undefined) => (items || []).map(item => item.name).join('、') || '无';
  // 武学带分型标注（六朝化：供"授新武学优先复用正典名"消费）
  const formatArts = (items: Array<{ name: string; type?: string }> | undefined) =>
    (items || []).map(item => `${item.name}${item.type ? `〔${item.type}〕` : ''}`).join('、') || '无';
  const playerCharacter = (canon.characters || []).find(character => character.id === runtime.opening?.playerCharacterId);
  const accessRules = (runtime.contentAccess || []).map(rule => {
    const entity = getContentEntity(runtime, rule.contentId);
    const holders = (rule.allowedCharacterIds || []).map(id =>
      (canon.characters || []).find(character => character.id === id)?.name || id,
    );
    if (rule.playerAllowed && !runtime.opening?.playerCharacterId) holders.push('独立玩家');
    return `  - ${entity?.name || rule.contentId}：${rule.policy}；允许持有者：${holders.join('、') || '无'}`;
  });
  const affiliationRules = (canon.characters || []).flatMap(character =>
    getCharacterAffiliations(character, canon.factions || []).map(affiliation => {
      const faction = (canon.factions || []).find(item => item.id === affiliation.factionId);
      return `  - ${character.name}：${affiliation.category} → ${faction?.name || affiliation.factionId}${affiliation.role ? `（${affiliation.role}）` : ''}${affiliation.exclusive === false ? '（可兼任）' : '（同类排他）'}`;
    }),
  );

  return `# 剧本模组正典（必须遵守）
- 模组：${runtime.modId}（${runtime.mode}）
- 玩家正典身份：${playerCharacter?.name || '独立玩家'}
- 势力：${formatNames(canon.factions)}
- 地点：${formatNames(canon.locations)}
- 重要人物：${formatNames(canon.characters)}
- 技能：${formatArts(canon.skills)}
- 功法：${formatArts(canon.techniques)}
- 物品：${formatNames(canon.items)}
- 锁定字段：${(runtime.lockedFields || []).join('、') || '无'}
${accessRules.length ? `- 内容归属规则：\n${accessRules.join('\n')}` : '- 内容归属规则：无（未声明内容默认开放）'}
${affiliationRules.length ? `- 人物势力归属：\n${affiliationRules.join('\n')}` : '- 人物势力归属：无'}
授予/提及武学时**优先复用上列正典技能与功法名**；确需新创的武学须符合[武学系统·六朝]命名规范并交代师承，不得造正典的同名变体。
Mod 已声明的实体与字段是权威正典。可以补充未定义内容，但不得生成同 ID 或同名替代品，不得用自动生成内容覆盖 Mod 已有值。
restricted 或 exclusive 内容只能由列出的正典身份持有；不得让其他 NPC 或独立玩家学习、复制、继承或获得等价变体。
人物 affiliation 默认在同类别内排他：可以同时拥有宗派、军队、国家等不同类别身份，但不得被写入另一个同类势力。
人物姓名、别名、称号均指向同一个既有实体：不得望文生义地改写为兵器、坐骑、功法、物品或同名新角色。人物间血缘、主从、婚配、同党、结盟与仇怨必须有本正典或当前事件的明确依据；同姓、官职、阵营、历史常识都不是建立关系的依据。叙事正文与 tavern_commands 同受此约束。
不得重命名、删除或覆盖锁定正典；除使用 set 更新“世界.状态.剧本模组.flags.*”外，不得生成修改“世界.状态.剧本模组”或“系统.扩展.剧本模组”的 tavern_commands。`;
}
