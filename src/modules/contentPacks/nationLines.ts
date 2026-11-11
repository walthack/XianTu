/**
 * 国家线注册与地区映射（秦线 PR C）：各线包 manifest.nationLines 编译出的 catalog.nationLines（编译器已按 order 排好、查过重）。
 * 只 import 生成的 catalog.json，不 import 任何 TS 模块：contentPacks/index.ts 转导出，numbersRegistry.ts 再转导出 NATION_LINE_IDS，不会成环。
 */
import raw from './generated/catalog.json';

export interface NationLine { lineId: string; order: number; regions: string[] }

/** 按 order 排好的国家线（右栏「别处」的显示顺序同此）。 */
export const NATION_LINES: readonly NationLine[] = (raw as unknown as { nationLines: NationLine[] }).nationLines;

/** 国家线 id，顺序同 NATION_LINES。 */
export const PACK_NATION_LINE_IDS: readonly string[] = NATION_LINES.map(line => line.lineId);

/** 地区名（mod-kit/entity-ledger/overrides.json stageRegions 的值）→ 国家线 id；塞外等不登记的地区没有键。 */
export const NATION_LINE_OF_REGION: Readonly<Record<string, string>> = Object.fromEntries(NATION_LINES.flatMap(line => line.regions.map(region => [region, line.lineId])));
