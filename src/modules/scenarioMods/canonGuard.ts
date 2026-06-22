import type { SaveData } from '@/types/game';

import type {
  ScenarioContentAccessRule,
  ScenarioModCharacter,
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

export function compileScenarioProtectedPaths(saveData: SaveData): string[] {
  const runtime = getRuntimeState(saveData);
  if (!runtime) return [];

  const paths = new Set<string>([
    '世界.状态.剧本模组',
    '系统.扩展.剧本模组',
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

export function guardScenarioModCommands(saveData: SaveData, commands: unknown[]): ScenarioCommandGuardResult {
  const runtime = getRuntimeState(saveData);
  const protectedPaths = compileScenarioProtectedPaths(saveData);
  if (!runtime || protectedPaths.length === 0) return { accepted: [...commands], rejected: [] };

  const accepted: unknown[] = [];
  const rejected: RejectedScenarioCommand[] = [];
  for (const command of commands) {
    const action = typeof (command as CommandLike)?.action === 'string'
      ? (command as CommandLike).action
      : '';
    const key = typeof (command as CommandLike)?.key === 'string'
      ? normalizePath((command as CommandLike).key as string)
      : '';
    const isAllowedFlagUpdate = action === 'set' && key.startsWith('世界.状态.剧本模组.flags.');
    const protectedPath = key && protectedPaths.find(path => pathsIntersect(key, path));
    const accessViolation = key ? findContentAccessViolation(runtime, command as CommandLike, key) : null;
    if (accessViolation) {
      rejected.push({ command, reason: accessViolation });
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
  const playerCharacter = (canon.characters || []).find(character => character.id === runtime.opening?.playerCharacterId);
  const accessRules = (runtime.contentAccess || []).map(rule => {
    const entity = getContentEntity(runtime, rule.contentId);
    const holders = (rule.allowedCharacterIds || []).map(id =>
      (canon.characters || []).find(character => character.id === id)?.name || id,
    );
    if (rule.playerAllowed && !runtime.opening?.playerCharacterId) holders.push('独立玩家');
    return `  - ${entity?.name || rule.contentId}：${rule.policy}；允许持有者：${holders.join('、') || '无'}`;
  });

  return `# 剧本模组正典（必须遵守）
- 模组：${runtime.modId}（${runtime.mode}）
- 玩家正典身份：${playerCharacter?.name || '独立玩家'}
- 势力：${formatNames(canon.factions)}
- 地点：${formatNames(canon.locations)}
- 重要人物：${formatNames(canon.characters)}
- 技能：${formatNames(canon.skills)}
- 功法：${formatNames(canon.techniques)}
- 物品：${formatNames(canon.items)}
- 锁定字段：${(runtime.lockedFields || []).join('、') || '无'}
${accessRules.length ? `- 内容归属规则：\n${accessRules.join('\n')}` : '- 内容归属规则：无（未声明内容默认开放）'}
Mod 已声明的实体与字段是权威正典。可以补充未定义内容，但不得生成同 ID 或同名替代品，不得用自动生成内容覆盖 Mod 已有值。
restricted 或 exclusive 内容只能由列出的正典身份持有；不得让其他 NPC 或独立玩家学习、复制、继承或获得等价变体。
不得重命名、删除或覆盖锁定正典；除使用 set 更新“世界.状态.剧本模组.flags.*”外，不得生成修改“世界.状态.剧本模组”或“系统.扩展.剧本模组”的 tavern_commands。`;
}
