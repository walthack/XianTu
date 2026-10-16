/**
 * 敌人种类与场上个体（实例）的 id 规则。
 *
 * - 每个敌人种类在角色总表里有一条记录（entityType='enemy_kind'），一个种类一个 id，例如 lcq.enemy.merfolk。
 *   等级、战斗强度等基础属性存在种类上；种类本身不记录伤势。
 * - 场上每个个体带实例编号：`<种类id>#<场景id>:<n>`。n 是该个体在本场景里同种类参战方的出场顺序（从 1 起），
 *   由合同参战方顺序推出，不另存计数。伤势、状态一律写在实例 id 下，从不写回种类 id。
 * 种类 id 与场景 id 都含 "."，但不含 "#"；场景 id 不含 ":"。
 */
import registry from './builtins/character-registry.json';

export const ENEMY_KIND_TYPE = 'enemy_kind';
const enemyKinds = new Set<string>(
  (registry as { characters: Array<{ id: string; entityType?: string; idAliases?: string[] }> }).characters
    .filter(c => c.entityType === ENEMY_KIND_TYPE).flatMap(c => [c.id, ...(c.idAliases || [])]),
);

/** 该 id（含旧 id 别名）是否是总表里的敌人种类。 */
export function isEnemyKindId(id: string): boolean { return enemyKinds.has(id); }

export function instanceId(kindId: string, scopeId: string, n: number): string {
  if (!kindId || kindId.includes('#') || !scopeId || scopeId.includes('#') || scopeId.includes(':') || !Number.isInteger(n) || n < 1) {
    throw new Error(`非法的实例编号：${kindId} / ${scopeId} / ${n}`);
  }
  return `${kindId}#${scopeId}:${n}`;
}

export function parseInstanceId(id: string): { kindId: string; scopeId: string; n: number } | undefined {
  const m = /^([^#]+)#([^#:]+):([1-9]\d*)$/.exec(id);
  return m ? { kindId: m[1], scopeId: m[2], n: Number(m[3]) } : undefined;
}

/** 实例 id → 种类 id；本来就是种类或人物 id 则原样返回。 */
export function kindIdOf(id: string): string { return parseInstanceId(id)?.kindId ?? id; }
