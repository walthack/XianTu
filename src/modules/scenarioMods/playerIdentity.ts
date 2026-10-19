/**
 * 主角（玩家）角色 id。
 * 真机 6ccb：lcq.stage_03b / 04b / 07 / 08 / 09 的 opening 没有 playerCharacterId，运行时投影也是空，
 * 只读 opening 的模块（冰蛊补挂、麻古、自由行动票、状态挂载）在这些段全部失效。
 * 这里按顺序取：opening.playerCharacterId → 本段正典里与存档主角同名的人物 id。
 */
const runtimeOf = (save: unknown): any => (save as any)?.世界?.状态?.剧本模组;

export function scenarioPlayerId(save: unknown): string | undefined {
  const runtime = runtimeOf(save);
  const direct = runtime?.opening?.playerCharacterId;
  if (direct) return String(direct);
  const name = String((save as any)?.角色?.身份?.名字 || '').trim();
  if (!name) return undefined;
  const hit = (runtime?.canon?.characters || []).find((c: any) => c?.name === name || (c?.aliases || []).includes?.(name));
  return hit?.id ? String(hit.id) : undefined;
}
