/**
 * 旧状态 id 迁移表（contracts/statuses.migrations.json）：to＝改挂的新状态（可带 params），remove＝直接移除。
 * 结构化伤势仓的迁移在 injuries.ts migrateStatusIds；这里另管进行中场面的 state.statuses（旧档存着打到一半的战斗）。
 */
import type { SceneState, StatusParams } from '../types';
import { mergeParams } from '../statuses';
import statusMigrations from '../contracts/statuses.migrations.json';

export type StatusMigration = { to?: string; params?: StatusParams; remove?: boolean; label?: string };
export const STATUS_MIGRATIONS = (statusMigrations as { migrations: Record<string, StatusMigration> }).migrations;

/** 进行中场面的状态表：改挂或移除，同一参战方迁移后重复的同 id 只留一条（参数合并）。幂等，返回改动条数。 */
export function migrateSceneStateStatuses(state: Pick<SceneState, 'statuses'> | null | undefined): number {
  let changed = 0;
  for (const [party, list] of Object.entries(state?.statuses || {})) {
    if (!Array.isArray(list) || !list.some(item => STATUS_MIGRATIONS[item?.id])) continue;
    const next: typeof list = [];
    for (const item of list) {
      const rule = STATUS_MIGRATIONS[item.id];
      if (!rule) { next.push(item); continue; }
      changed++;
      if (rule.remove || !rule.to) continue;
      const params = mergeParams(item.params, rule.params);
      const twin = next.find(other => other.id === rule.to);
      if (twin) { const merged = mergeParams(twin.params, params); if (merged) twin.params = merged; continue; }
      next.push({ ...item, id: rule.to, ...(params ? { params } : {}) });
    }
    state!.statuses[party] = next;
  }
  return changed;
}
