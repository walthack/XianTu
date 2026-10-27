/**
 * 读档时一次性修复（幂等）：旧伤势按 statuses.migrations.json 迁移（原来只在第一次访问伤势时才迁）；剧情来源状态（冰蛊）补挂；
 * 身份账与国家线收束档按已完成事件回填（身份账设计稿 2026-10-25 §5）；唯一道具窄回填回执（补充设计稿 2026-10-26 §2.3 / Q5）；
 * 旧档练功上限改不设限（只迁一次，标记见 LOAD_MIGRATIONS_KEY）。
 */
import { injuryStore } from '@/modules/sceneModule/host/injuries';
import { syncStoryStatuses } from './freeAction/bingGu';
import { syncPlayerLedgers } from './identityLedger';
import { backfillItemReceipts, noteChronicleGap } from './itemProvenance';
import { logError } from '../diagnostics/log';
import { debugLog } from '../diagnostics/debugLog';

/** 读档一次性迁移的标记：系统.扩展.读档迁移.<迁移名> = 迁移版本号；标了就不再迁，玩家之后在设置里改回的值不会被冲掉。 */
export const LOAD_MIGRATIONS_KEY = '读档迁移';
export const TRAINING_CAP_NONE_MIGRATION = '练功不设限';
const TRAINING_CAP_NONE_VERSION = 1;

/**
 * 总策划裁定（接用户 2026-10-27 13:40 取消练功章节上限）：旧档也一律不设限——存档 系统.难度设置.trainingCap 为 'canon'/'canon+1' 的改成 'none'，
 * 只动 trainingCap、不动 autoRaiseLevel；已是 'none' 或没存难度设置的只打标记。没有 系统 的不动。
 * 失败记 LCQ-SAV-030，不抛、不写半截、不打标记（下次读档重试）。返回改前的值（没改返回 null）。
 */
export function migrateTrainingCapNone(save: any): 'canon' | 'canon+1' | null {
  const sys = save?.系统;
  if (!sys || typeof sys !== 'object') return null;
  try {
    const ext = sys.扩展 && typeof sys.扩展 === 'object' && !Array.isArray(sys.扩展) ? sys.扩展 : {};
    const done = ext[LOAD_MIGRATIONS_KEY] && typeof ext[LOAD_MIGRATIONS_KEY] === 'object' ? ext[LOAD_MIGRATIONS_KEY] : {};
    if (Number(done[TRAINING_CAP_NONE_MIGRATION]) >= TRAINING_CAP_NONE_VERSION) return null;
    const d = sys.难度设置;
    const from = d && typeof d === 'object' && (d.trainingCap === 'canon' || d.trainingCap === 'canon+1') ? d.trainingCap as 'canon' | 'canon+1' : null;
    const nextExt = { ...ext, [LOAD_MIGRATIONS_KEY]: { ...done, [TRAINING_CAP_NONE_MIGRATION]: TRAINING_CAP_NONE_VERSION } };
    if (from) sys.难度设置 = { ...d, trainingCap: 'none' };
    sys.扩展 = nextExt;
    debugLog('save', from ? `读档迁移：练功上限 ${from} → none` : '读档迁移：练功上限无需改，只打标记', { from, version: TRAINING_CAP_NONE_VERSION });
    return from;
  } catch (error) {
    logError('LCQ-SAV-030', error, { detail: { reason: 'migrate_failed', migration: TRAINING_CAP_NONE_MIGRATION } });
    return null;
  }
}

export function applyLoadRepairs(save: any): { injuriesMigrated: boolean; storyStatuses: string[]; identitiesBackfilled: number; itemReceiptsBackfilled: number } {
  migrateTrainingCapNone(save);
  const rt = save?.世界?.状态?.剧本模组;
  if (!rt || typeof rt !== 'object') return { injuriesMigrated: false, storyStatuses: [], identitiesBackfilled: 0, itemReceiptsBackfilled: 0 };
  if (rt.sceneLedger) injuryStore(save);
  // 冰蛊等剧情来源状态：旧档停在 05/05b 时读档补挂（幂等）。
  const storyStatuses = syncStoryStatuses(save);
  // 身份账：有进度就同步一次。旧档缺 playerIdentities 时整份回填；字段已在时只追加规则表后来新增的条目，已有记录不覆盖。
  // 新写的记录与 history 条目标 backfilled；返回身份＋收束档的改动条数。
  const hasProgress = (rt.completedEventIds?.length ?? 0) > 0 || (rt.chronicle?.length ?? 0) > 0;
  const identitiesBackfilled = hasProgress ? syncPlayerLedgers(rt, { backfilled: true }) : 0;
  // 道具来路：背包现存的唯一道具组成员没有回执的补回填回执（幂等，规则表为空不动）；done.* 不推断回填，编年史缺口只打调试日志。
  const itemReceiptsBackfilled = backfillItemReceipts(save, rt);
  noteChronicleGap(rt);
  return { injuriesMigrated: !!rt.sceneLedger, storyStatuses, identitiesBackfilled, itemReceiptsBackfilled };
}
