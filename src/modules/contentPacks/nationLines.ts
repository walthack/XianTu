/**
 * 国家线注册与地区映射（秦线 PR C）：各线包 manifest.nationLines 编译出的 catalog.nationLines（编译器已按 order 排好、查过重）。
 * 只 import 生成的 catalog.json，不 import 任何 TS 模块：contentPacks/index.ts 转导出，numbersRegistry.ts 再转导出 NATION_LINE_IDS，不会成环。
 */
import raw from './generated/catalog.json';

export interface NationLine {
  lineId: string; order: number; regions: string[];
  /** 是否计入收束计数（compass.anyLineClosed、秦入口计数等；阶段 2a 自 numbers 的 story.lineCompass.anyLineClosed.lineIds 搬来），必填 */
  countsTowardClosedLines: boolean;
  /** 失败收束事件（任一已完成即判本线 unresolved 收束；阶段 2a 自 numbers 的 story.lineOutcome.failureClosureEvents 搬来），只许计入线写，缺省为空 */
  failureClosureEvents?: string[];
}

/** 参数化派生条件 compass.<id>（阶段 2a，各包 manifest.compassConditions）：已收束的计入线数 ≥ min；min 是整数或数值权威路径（运行时现读，热改有效）；
 * unlessLineClosedByWorldEvent：该线已被世界事件关闭时恒为 false（先判这一条、后计数）。 */
export interface CompassCondition { id: string; kind: 'closedLinesAtLeast'; min: number | string; unlessLineClosedByWorldEvent?: string }

/** 按 order 排好的国家线（右栏「别处」的显示顺序同此）。 */
export const NATION_LINES: readonly NationLine[] = (raw as unknown as { nationLines: NationLine[] }).nationLines;

/** 国家线 id，顺序同 NATION_LINES。 */
export const PACK_NATION_LINE_IDS: readonly string[] = NATION_LINES.map(line => line.lineId);

/** 地区名（mod-kit/entity-ledger/overrides.json stageRegions 的值）→ 国家线 id；塞外等不登记的地区没有键。 */
export const NATION_LINE_OF_REGION: Readonly<Record<string, string>> = Object.fromEntries(NATION_LINES.flatMap(line => line.regions.map(region => [region, line.lineId])));

/** 计入收束计数的国家线 id，顺序同 NATION_LINES（按 order）。 */
export const CLOSURE_TALLY_LINE_IDS: readonly string[] = NATION_LINES.filter(line => line.countsTowardClosedLines).map(line => line.lineId);

/** 计入线 → 失败收束事件（没写为空表）；非计入线没有键。 */
export const FAILURE_CLOSURE_EVENTS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(NATION_LINES.filter(line => line.countsTowardClosedLines).map(line => [line.lineId, line.failureClosureEvents ?? []]));

/** 包声明的参数化派生条件（编译器已查过 id 唯一、不是保留 id anyLineClosed）。 */
export const COMPASS_CONDITIONS: readonly CompassCondition[] = (raw as unknown as { compassConditions: CompassCondition[] }).compassConditions;
