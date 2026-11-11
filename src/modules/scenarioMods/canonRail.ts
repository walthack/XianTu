import { CONTENT_PACKS } from '../contentPacks';
import {entityText,entityTemplateText} from './namedEntities';
import { quarantinedStageIds } from '../contentPacks/stageMeta';
import { mergeExtraRailBeats, type CanonRailExtraBeats } from './canonRailMerge';
/**
 * Canon Rail keeps the default Six Dynasties route on its source-backed beats.
 *
 * A rail is selected by its audited stage, not by player choice. It is not an
 * alternate scenario system: an explicit IF branch remains the only place
 * allowed to replace a canon outcome.
 */

import { GENERATED_CANON_RAIL_PROFILES } from './canonRailProfiles.generated';

/**
 * These legacy stages cannot appear on the default route: either every plot
 * beat is unanchored, or source review found a material anchor conflict. They
 * may only be reached by an explicit IF route after their canon is rebuilt.
 */
export const TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS: ReadonlySet<string> = new Set([
]);

/** 合并后的隔离集合：内容包 stageMeta 写了 defaultLineQuarantined 的关按它，没写的沿用上面的 TS 表（编译期校验两边不重复）。 */
export const DEFAULT_LINE_QUARANTINED_STAGE_IDS = quarantinedStageIds(CONTENT_PACKS.stageMeta || [], TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS);

export function isDefaultLineQuarantinedStageId(stageId: unknown): boolean {
  return typeof stageId === 'string' && DEFAULT_LINE_QUARANTINED_STAGE_IDS.has(stageId);
}

export interface CanonRailContract {
  eventId: string;
  /** Source-backed result which must happen before this node can be completed. */
  mustReach: string;
  /** Compact, source-backed anchors that must be present in reconciliation evidence. */
  completionEvidence: string[];
  /** Disallowed default-line rewrites; only an explicit IF may authorize them. */
  forbiddenInCanon: string[];
  /** Safe material the narrator may add between fixed beats. */
  allowedElaboration: string;
}

export interface CanonRailProfile {
  id: string;
  modId: string;
  chapterId: string;
  orderedEventIds: string[];
  contracts: CanonRailContract[];
}

/** Hand-reviewed exceptions. The #9/#10 source order fixes the old reversed event conditions. */
// 塞外线 S4：原有的两个塞外手审档已搬进 packs/saiwai/rails.json（handReviewed: true），这里留空
const HAND_REVIEWED_CANON_RAIL_PROFILES: CanonRailProfile[] = [];

/**
 * Load-bearing default-line beats that already exist as stage events with
 * source axes, but were never generated onto the rail. Tracked here instead of
 * re-running the generator, which would pull every hanging critical onto the
 * spine. Overlay chapter bindings remain the authoritative data hang.
 */
export const DEFAULT_LINE_EXTRA_RAIL_BEATS: CanonRailExtraBeats[] = [
  // 汉线补全（剧情策划 2026-10-28 五线补全·汉 H1–H20；用户 2026-10-28 01:26 授权）：欠账拍按原著序挂章上 rail，新建拍同上 rail。
  // 排序：按 axisSeq，同 seq 按原著行序（yly）——718：H1 抵舞都 22618 → 云如瑶私奔 22934；898：赏格争胡骑 47300 → 回绝剑玉姬 47483。
  // H17 汉宫真空（901）、H18 是否拥立（902）是「没亲历宫变之夜」的条件拍（conditions 取反），只挂汉宫突入章、不上 rail。
];

function withDefaultLineExtraRailBeats(profiles: CanonRailProfile[]): CanonRailProfile[] {
  return mergeExtraRailBeats(profiles, DEFAULT_LINE_EXTRA_RAIL_BEATS);
}

/** 包 rail 文案里的 {{entity:…}}／{{entityLabel:…}} 在这里解析成名字（编译期已校验实体与标签存在；名字不冻进 catalog）。 */
function withEntityText<T>(value: T): T {
  if (typeof value === 'string') return entityTemplateText(value) as T;
  if (Array.isArray(value)) return value.map(withEntityText) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withEntityText(v)])) as T;
  return value;
}

/**
 * Every source-anchored built-in stage is covered here. Profiles generated
 * from the source axis are deterministic; hand-reviewed profiles above take
 * precedence when a source audit supplied stronger wording or a correction.
 */
// 内容包的 rail（manifest.rails，编译期已校验关、拍、文案）；旧 catalog 没有这一段时为空，编译器自身的导入链也会走到这里
const PACK_RAILS = (CONTENT_PACKS.rails || []).map(withEntityText);
const PACK_STAGE_IDS = new Set(CONTENT_PACKS.stages.map(stage => stage.manifest.id));
const byModId = (a: CanonRailProfile, b: CanonRailProfile) => (a.modId < b.modId ? -1 : a.modId > b.modId ? 1 : 0);
// 包 rail 写了 handReviewed: true 的是搬进包的手审档（塞外，挂内置关；编译期禁止挂包内关）：去掉标记，接在 TS 手审档之后、按包顺序与文件内顺序
const PACK_HAND_REVIEWED = PACK_RAILS.filter(profile => profile.handReviewed === true).map(({ handReviewed: _mark, ...profile }) => profile);

export const CANON_RAIL_PROFILES: CanonRailProfile[] = withDefaultLineExtraRailBeats([
  ...HAND_REVIEWED_CANON_RAIL_PROFILES,
  ...PACK_HAND_REVIEWED,
  // 挂包内关的 rail（秦）排在手审档之后
  ...PACK_RAILS.filter(profile => PACK_STAGE_IDS.has(profile.modId)),
  // 挂内置关的包 rail（生成档搬进包的，如宋 rails.generated.json）与生成档一起按 modId 排：即生成器按关文件名写出的顺序
  ...[...PACK_RAILS.filter(profile => profile.handReviewed !== true && !PACK_STAGE_IDS.has(profile.modId)), ...GENERATED_CANON_RAIL_PROFILES].sort(byModId),
]);

/** Only source-anchored stages may enter the default-line registry. */
export function getCanonRailProfile(runtime: { modId?: unknown } | null | undefined): CanonRailProfile | null {
  if (typeof runtime?.modId !== 'string') return null;
  return CANON_RAIL_PROFILES.find(profile => profile.modId === runtime.modId) || null;
}

export function getCanonRailContract(profile: CanonRailProfile | null, eventId: string): CanonRailContract | null {
  return profile?.contracts.find(contract => contract.eventId === eventId) || null;
}

export function getCanonRailOrder(profile: CanonRailProfile | null): Map<string, number> {
  return new Map((profile?.orderedEventIds || []).map((id, index) => [id, index]));
}

export function isCanonRailChapter(profile: CanonRailProfile | null, chapterId: string | null | undefined): boolean {
  return Boolean(profile && profile.chapterId === chapterId);
}
