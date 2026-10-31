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
import { CONTENT_PACKS } from '../contentPacks';
import { advanceScenarioRuntime } from './runtime';
import { countryOf } from './travel/mapTravel';
import locations from '../../../mod-kit/entity-catalog/locations.json';

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

/** 读档补 intentMatch 的关卡（只放确有作者后补短语、旧档会卡住的关）：stage01 s01_01（真机 69ab B16「见段强」卡住，见 scripts/dev/apply-s01-01-intent-match.mjs）、s01_02／03／05（Demo 合并压回 8 条）。 */
const INTENT_MATCH_BACKFILL_STAGES: Record<string, { scenario: { events: any[] } }> = {
  'lcq.stage_01': stage01 as unknown as { scenario: { events: any[] } },
};
const withoutIntentMatch = (contract: unknown): string => JSON.stringify(contract, (key, value) => key === 'intentMatch' ? undefined : value);

const S01_01_V1_ANY = ['稳住自己', '弄清身在何处', '观察四周', '找掩体', '确认段强', '护住段强', '秦军阵线', '盾阵'];
const S01_01_DEMO_ANY = ['稳住自己', '弄清身在何处', '确认段强', '查看段强', '弄清这片草原', '观察四周', '找掩体', '处理落地'];
const S01_01_REJECT = ['不管段强', '丢下段强'];
/**
 * 已烘焙进档、后来被内置关取代的旧短语（逐字快照，键＝事件:动作），读档时按缺失同样换成内置值：
 * fbef6792 首版 8 条；fbef6792 首版与 Demo 覆写合并的 11 条（超上限 8）；更早 Demo 单独的 8 条（缺「秦军阵线」等真机原话命中词）。
 */
/**
 * s01_02／s01_03／s01_05（REPORT-8091-fbef6792 ⑧，见 scripts/dev/apply-s01-demo-intent-match.mjs）：
 * 内置关改前的值（正式开局档），与清羽 Demo 把短语追加上去后的值（Demo 档，9／10／10 条超上限 8）。
 */
const S01_DEMO_SUPERSEDED: Record<string, { any: string[]; demo: string[]; reject: string[] }> = {
  'lcq.event.s01_02': { any: ['拉着段强躲', '带段强找掩护', '护住段强撤'], demo: ['带段强躲开', '拉段强避箭', '掩护段强', '寻找掩护', '躲开半兽人', '避开箭袭'], reject: ['不管段强', '丢下段强', '袖手旁观'] },
  'lcq.event.s01_03': { any: ['查看伤兵伤势', '扶起受伤军士', '救下受伤军士', '带伤兵离开'], demo: ['见月霜', '上前查看伤者', '看看那个伤兵', '查看伤者', '扶住伤者', '救那个伤兵'], reject: ['不管伤兵', '不救伤者', '丢下伤者', '转身离开'] },
  'lcq.event.s01_05': { any: ['请王哲诊治', '让王哲诊治', '让王哲查看伤势', '向王哲说明来历请他诊治'], demo: ['去帅帐', '前往帅帐', '走进帅帐', '见王哲', '请他看伤', '说明自己的来历'], reject: ['拒绝诊治', '隐瞒来历离开', '不让王哲查看'] },
};
const SUPERSEDED_INTENT_MATCH: Record<string, string[]> = {
  'lcq.event.s01_01:advance_declared_objective': [
    { matchAny: S01_01_V1_ANY, rejectIf: S01_01_REJECT },
    { matchAny: [...S01_01_V1_ANY, '查看段强', '弄清这片草原', '处理落地'], rejectIf: S01_01_REJECT },
    { matchAny: S01_01_DEMO_ANY, rejectIf: S01_01_REJECT },
  ].map(intent => JSON.stringify(intent)),
  ...Object.fromEntries(Object.entries(S01_DEMO_SUPERSEDED).map(([eventId, { any, demo, reject }]) => [`${eventId}:advance_declared_objective`, [
    { matchAny: any, rejectIf: reject },
    { matchAny: [...any, ...demo], rejectIf: reject },
  ].map(intent => JSON.stringify(intent))])),
};

/**
 * 旧档把事件合同烘焙进 runtime，作者后来给动作补的自由输入短语不会进档（runtime 只为 V03 一拍同步，冻结文件不改）。
 * 只补「存档动作没有 intentMatch 或是已被取代的旧快照、合同其余部分与内置逐字一致、该拍还没有任何尝试或准备」的情形：
 * 不覆盖其它 Demo 覆写或已有短语；合同哈希随之变化时 runtime 会把这一拍的空动作状态重建，没有可丢的进度。返回补了几个动作。
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
      if (!intent) continue;
      if (action.intentMatch !== undefined
        && !SUPERSEDED_INTENT_MATCH[`${source.id}:${action?.id}`]?.includes(JSON.stringify(action.intentMatch))) continue;
      action.intentMatch = structuredClone(intent);
      filled++;
    }
  }
  if (filled) debugLog('save', `读档补 intentMatch：${rt.modId} ${filled} 个动作`, { modId: rt.modId, filled });
  return filled;
}

/**
 * 旧版地图入秦（strictInitializer 入口转场）只在玩家先点过「先记下」时才把口信拍记完成；直接点地图入秦的档，
 * 口信拍被带进秦关仍是当前拍，主线目标停在「听取口信，决定何时前往咸阳」，顶栏位置是开场的「中州·咸阳」（真机 REPORT-8091-fbef6792）。
 * 读档按现行入关口径补：只修「当前关就是该入口关、mapEntryResume 指向该入口、口信拍未完成」的档，补记完成后推进一轮激活秦线当前拍；
 * 人还在入口地点而描述不是「国别·地名」的，改成与地图抵达同口径。幂等，返回修了几个入口。
 */
export function repairLingeringMapEntryMessage(save: any): number {
  const rt = save?.世界?.状态?.剧本模组, ext = save?.系统?.扩展;
  if (!rt || !ext?.mapEntryResume || !Array.isArray(rt.completedEventIds)) return 0;
  let fixed = 0;
  for (const entry of CONTENT_PACKS.mapEntries || []) {
    if (rt.modId !== entry.stageId || ext.mapEntryResume.entryId !== entry.id) continue;
    const position = save.角色?.位置, country = countryOf(entry.locationId);
    const name = locations.entries.find(e => e.id === entry.locationId)?.definition?.name;
    if (position?.locationId === entry.locationId && country && name && !String(position.描述 || '').startsWith(`${country}·`)) {
      position.描述 = `${country}·${name}`;
    }
    if (rt.completedEventIds.includes(entry.eventId)) continue;
    ((ext.mapEntryMessages ||= {})[entry.id] ||= {}).done = true;
    rt.completedEventIds = [...new Set([...rt.completedEventIds, entry.eventId])];
    rt.activeEventIds = (rt.activeEventIds || []).filter((id: string) => id !== entry.eventId);
    fixed++;
  }
  if (!fixed) return 0;
  const advanced = advanceScenarioRuntime(save).saveData as any;
  if (advanced && advanced !== save) for (const key of Object.keys(advanced)) save[key] = advanced[key];
  debugLog('save', `读档补记地图入口口信完成：${rt.modId}`, { modId: rt.modId, fixed });
  return fixed;
}

export function applyLoadRepairs(save: any): { injuriesMigrated: boolean; storyStatuses: string[]; identitiesBackfilled: number; itemReceiptsBackfilled: number } {
  migrateTrainingCapNone(save);
  let rt = save?.世界?.状态?.剧本模组;
  if (!rt || typeof rt !== 'object') return { injuriesMigrated: false, storyStatuses: [], identitiesBackfilled: 0, itemReceiptsBackfilled: 0 };
  // 旧档缺作者后补的自由输入短语（s01_01）：只补缺失或已被取代的旧快照，见 backfillMissingIntentMatch。
  backfillMissingIntentMatch(rt);
  // 旧版直接点地图入秦留下的口信当前拍（推进一轮会换掉 剧本模组 对象，之后改用新的）。
  if (repairLingeringMapEntryMessage(save)) rt = save.世界.状态.剧本模组;
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
