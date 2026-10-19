/**
 * 读档时一次性修复（幂等）：旧伤势按 statuses.migrations.json 迁移（原来只在第一次访问伤势时才迁）。
 */
import { injuryStore } from '@/modules/sceneModule/host/injuries';

export function applyLoadRepairs(save: any): { injuriesMigrated: boolean } {
  const rt = save?.世界?.状态?.剧本模组;
  if (!rt || typeof rt !== 'object' || !rt.sceneLedger) return { injuriesMigrated: false };
  injuryStore(save);
  return { injuriesMigrated: true };
}
