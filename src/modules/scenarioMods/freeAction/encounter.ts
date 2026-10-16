/**
 * 在场正典人物的懒登记：玩家对在场的原著人物出手，而他还没有关系记录（初识事件没走到）时，
 * 在结算写入阶段按“初识”补一条记录（好感 0、「相识」、记忆空，和 runtime 的初识登记同一函数）。
 * 名单与校验只读；只有 prepare / settle 会写，且只在这次行动真的结算成功时才留下记录——
 * 闸门不过、写入被拒、判定刚签发还没确认，都撤回，保持“不过闸门什么都不写”。
 */
import type { SaveData } from '@/types/game';
import { relationshipOf } from '../ledger/affinityIdentity';
import { ensureEncounteredScenarioCharacter } from '../relationships';
import { canonCharacterOf, freeActionRosterOf, playerIdOf } from './ticket';
import { runtimeOf } from './state';

/** 补登记目标；返回是否新建了记录。已有记录、非正典、不在场、是玩家本人都不动。 */
function registerEncounteredTarget(save: SaveData, targetId: string): boolean {
  if (relationshipOf(save as any, targetId) || targetId === playerIdOf(save) || !canonCharacterOf(save, targetId)) return false;
  if (!freeActionRosterOf(save).some(entry => entry.id === targetId)) return false;
  const runtime = runtimeOf(save);
  ensureEncounteredScenarioCharacter(save, { ...runtime.canon, ...runtime.content, opening: runtime.opening || {} } as any, targetId);
  return Boolean(relationshipOf(save as any, targetId));
}

function unregisterEncounteredTarget(save: SaveData, targetId: string): void {
  const hit = relationshipOf(save as any, targetId);
  if (hit) delete (save as any).社交.关系[hit.key];
}

/** 先补登记再跑 run；run 的结果 keep 为假（或抛错）就撤回刚补的那条。 */
export function withEncounteredTarget<T>(save: SaveData, targetId: string | null | undefined, run: () => T, keep: (result: T) => boolean): T {
  const created = targetId ? registerEncounteredTarget(save, targetId) : false;
  let result: T;
  try { result = run(); } catch (error) { if (created) unregisterEncounteredTarget(save, targetId!); throw error; }
  if (created && !keep(result)) unregisterEncounteredTarget(save, targetId!);
  return result;
}
