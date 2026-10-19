/**
 * 读档时一次性修复（幂等）：旧伤势按 statuses.migrations.json 迁移（原来只在第一次访问伤势时才迁）；剧情来源状态（冰蛊）补挂。
 */
import { injuryStore } from '@/modules/sceneModule/host/injuries';
import { syncStoryStatuses } from './freeAction/bingGu';

export function applyLoadRepairs(save: any): { injuriesMigrated: boolean; storyStatuses: string[] } {
  const rt = save?.世界?.状态?.剧本模组;
  if (!rt || typeof rt !== 'object') return { injuriesMigrated: false, storyStatuses: [] };
  if (rt.sceneLedger) injuryStore(save);
  // 冰蛊等剧情来源状态：旧档停在 05/05b 时读档补挂（幂等）。
  const storyStatuses = syncStoryStatuses(save);
  return { injuriesMigrated: !!rt.sceneLedger, storyStatuses };
}
