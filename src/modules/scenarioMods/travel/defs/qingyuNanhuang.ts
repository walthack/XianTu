import type { OpenWorldArea, OpenWorldRoute, OpenWorldSliceDefinition, OpenWorldZone } from '../../openWorldSlice';
import { CONTENT_PACKS } from '../../../contentPacks';
import { resolveOpenWorldSlice, type TsOpenWorldSlicePart } from '../openWorldSlices';

/**
 * 南荒行旅定义（P0-4 第 3 步）。B8（2026-11-11）起数据整份在昭南包 open-world-slices.json（key 'nanhuang'，
 * 依据与原行内注释在条目 note 里）；本文件只留 TS 侧的 key 与原导出名（从内容包解析结果取，名字和类型不变）。
 */

/** TS 侧的南荒切片：已整份搬进内容包，只留 key。 */
export const TS_NANHUANG_OPEN_WORLD_SLICE: TsOpenWorldSlicePart = { key: 'nanhuang' };

const NH = resolveOpenWorldSlice(CONTENT_PACKS.openWorldSlices || [], TS_NANHUANG_OPEN_WORLD_SLICE);
export const NANHUANG_TRAVEL_SLICE_ID: string = NH.definition.id;
export const NANHUANG_STAGE_IDS: readonly string[] = NH.stageIds || [];
export const NANHUANG_STEP_SCENE_STAGE_IDS: readonly string[] = NH.stepSceneStagePrefixes || [];
export const NANHUANG_AREAS: OpenWorldArea[] = NH.definition.areas || [];
export const NANHUANG_ZONES: OpenWorldZone[] = NH.definition.zones;
export const NANHUANG_ROUTES: OpenWorldRoute[] = NH.definition.routes;
export const QINGYU_NANHUANG_DEFINITION: OpenWorldSliceDefinition = NH.definition;
export const BIYU_POSITION_SEGMENT: string = NH.positionNodes?.segment || '';
export const BIYU_WORLD_LOCATION_ID: string = NH.positionNodes?.placeLocationId || '';
export const BIYU_POSITION_NODES: ReadonlyArray<{ zoneId: string; names: string[] }> = NH.positionNodes?.nodes || [];
