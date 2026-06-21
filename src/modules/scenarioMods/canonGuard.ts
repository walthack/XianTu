import type { SaveData } from '@/types/game';

import type { ScenarioModCharacter, ScenarioModFaction, ScenarioModItem, ScenarioModLocation, ScenarioModSkill, ScenarioModTechnique } from './schema';

interface ScenarioRuntimeState {
  modId: string;
  mode: 'strict' | 'expand';
  lockedFields?: string[];
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
  const protectedPaths = compileScenarioProtectedPaths(saveData);
  if (protectedPaths.length === 0) return { accepted: [...commands], rejected: [] };

  const accepted: unknown[] = [];
  const rejected: RejectedScenarioCommand[] = [];
  for (const command of commands) {
    const key = typeof (command as CommandLike)?.key === 'string'
      ? normalizePath((command as CommandLike).key as string)
      : '';
    const protectedPath = key && protectedPaths.find(path => pathsIntersect(key, path));
    if (protectedPath) {
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

  return `# 剧本模组正典（必须遵守）
- 模组：${runtime.modId}（${runtime.mode}）
- 势力：${formatNames(canon.factions)}
- 地点：${formatNames(canon.locations)}
- 重要人物：${formatNames(canon.characters)}
- 技能：${formatNames(canon.skills)}
- 功法：${formatNames(canon.techniques)}
- 物品：${formatNames(canon.items)}
- 锁定字段：${(runtime.lockedFields || []).join('、') || '无'}
不得重命名、删除或覆盖锁定正典；不得生成修改“世界.状态.剧本模组”或“系统.扩展.剧本模组”的 tavern_commands。`;
}
