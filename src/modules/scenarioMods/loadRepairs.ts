/**
 * 读档时一次性修复（幂等）：旧伤势按 statuses.migrations.json 迁移（原来只在第一次访问伤势时才迁）；剧情来源状态（冰蛊）补挂；
 * 身份账与国家线收束档按已完成事件回填（身份账设计稿 2026-10-25 §5）。
 */
import { injuryStore } from '@/modules/sceneModule/host/injuries';
import { syncStoryStatuses } from './freeAction/bingGu';
import { syncPlayerLedgers } from './identityLedger';

export function applyLoadRepairs(save: any): { injuriesMigrated: boolean; storyStatuses: string[]; identitiesBackfilled: number } {
  const rt = save?.世界?.状态?.剧本模组;
  if (!rt || typeof rt !== 'object') return { injuriesMigrated: false, storyStatuses: [], identitiesBackfilled: 0 };
  if (rt.sceneLedger) injuryStore(save);
  // 冰蛊等剧情来源状态：旧档停在 05/05b 时读档补挂（幂等）。
  const storyStatuses = syncStoryStatuses(save);
  // 身份账：有进度就同步一次。旧档缺 playerIdentities 时整份回填；字段已在时只追加规则表后来新增的条目，已有记录不覆盖。
  // 新写的记录与 history 条目标 backfilled；返回身份＋收束档的改动条数。
  const hasProgress = (rt.completedEventIds?.length ?? 0) > 0 || (rt.chronicle?.length ?? 0) > 0;
  const identitiesBackfilled = hasProgress ? syncPlayerLedgers(rt, { backfilled: true }) : 0;
  return { injuriesMigrated: !!rt.sceneLedger, storyStatuses, identitiesBackfilled };
}
