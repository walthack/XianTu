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
import stage01 from './builtins/data/lcq.stage_01.json';

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

/** 读档补 intentMatch 的关卡（只放确有作者后补短语、旧档会卡住的关）：stage01 s01_01（真机 69ab B16「见段强」卡住，见 scripts/dev/apply-s01-01-intent-match.mjs）。 */
const INTENT_MATCH_BACKFILL_STAGES: Record<string, { scenario: { events: any[] } }> = {
  'lcq.stage_01': stage01 as unknown as { scenario: { events: any[] } },
};
const withoutIntentMatch = (contract: unknown): string => JSON.stringify(contract, (key, value) => key === 'intentMatch' ? undefined : value);

/**
 * 旧档把事件合同烘焙进 runtime，作者后来给动作补的自由输入短语不会进档（runtime 只为 V03 一拍同步，冻结文件不改）。
 * 只补「存档动作完全没有 intentMatch、合同其余部分与内置逐字一致、该拍还没有任何尝试或准备」的情形：
 * 不覆盖 Demo 覆写或已有短语；合同哈希随之变化时 runtime 会把这一拍的空动作状态重建，没有可丢的进度。返回补了几个动作。
 */
export function backfillMissingIntentMatch(rt: any): number {
  const canonical = INTENT_MATCH_BACKFILL_STAGES[String(rt?.modId || '')];
  if (!canonical || !Array.isArray(rt?.events)) return 0;
  let filled = 0;
  for (const source of canonical.scenario.events || []) {
    const contract = source?.playerCompletionContract;
    const saved = rt.events.find((event: any) => event?.id === source.id);
    const savedContract = saved?.playerCompletionContract;
    if (!contract || !savedContract || withoutIntentMatch(savedContract) !== withoutIntentMatch(contract)) continue;
    const state = rt.eventActionStates?.[source.id];
    if (state && ((state.attemptCount || 0) > 0 || state.preparations?.length || state.attempts?.length)) continue;
    for (const action of savedContract.actions || []) {
      const intent = (contract.actions || []).find((item: any) => item?.id === action?.id)?.intentMatch;
      if (!intent || action.intentMatch !== undefined) continue;
      action.intentMatch = structuredClone(intent);
      filled++;
    }
  }
  if (filled) debugLog('save', `读档补 intentMatch：${rt.modId} ${filled} 个动作`, { modId: rt.modId, filled });
  return filled;
}

export function applyLoadRepairs(save: any): { injuriesMigrated: boolean; storyStatuses: string[]; identitiesBackfilled: number; itemReceiptsBackfilled: number } {
  migrateTrainingCapNone(save);
  const rt = save?.世界?.状态?.剧本模组;
  if (!rt || typeof rt !== 'object') return { injuriesMigrated: false, storyStatuses: [], identitiesBackfilled: 0, itemReceiptsBackfilled: 0 };
  // 旧档缺作者后补的自由输入短语（s01_01）：只补缺失，见 backfillMissingIntentMatch。
  backfillMissingIntentMatch(rt);
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
