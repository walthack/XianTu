import type { OpenWorldZone } from '../../openWorldSlice';
import { CONTENT_PACKS } from '../../../contentPacks';
import { resolveOpenWorldSlice, type TsOpenWorldSlicePart } from '../openWorldSlices';

/**
 * 五原开放世界的节点表（从 wuyuanOpenWorldSlice.ts 原样迁出，P0-4 修正：位置解析器要读它，
 * 而 wuyuanOpenWorldSlice 依赖 runtime，直接引用会成环）。
 *
 * B8（2026-11-11）起五原切片整份在塞外包 open-world-slices.json（key 'wuyuan'：definition.zones、constants 里的节点 id、
 * positionNodes 的 segment／placeLocationId 都在同一条里）；本文件只留 TS 侧的 key 与原导出名（从解析结果取，名字和类型不变）。
 */

/** TS 侧的五原节点表一份：已整份搬进内容包，只留 key（另一份在 wuyuanOpenWorldSlice.ts）。 */
export const TS_WUYUAN_ZONE_PART: TsOpenWorldSlicePart = { key: 'wuyuan' };

const W = resolveOpenWorldSlice(CONTENT_PACKS.openWorldSlices || [], TS_WUYUAN_ZONE_PART);
const zoneId = (name: string): string => W.constants?.[name] || '';
export const WUYUAN_WORLD_LOCATION_ID: string = W.positionNodes?.placeLocationId || '';
export const SETTLEMENT_ZONE_ID = zoneId('SETTLEMENT_ZONE_ID');
export const MARKET_ZONE_ID = zoneId('MARKET_ZONE_ID');
export const PASTRY_ZONE_ID = zoneId('PASTRY_ZONE_ID');
export const FRONT_STREET_ZONE_ID = zoneId('FRONT_STREET_ZONE_ID');
export const COMPOUND_ZONE_ID = zoneId('COMPOUND_ZONE_ID');
export const HALL_ZONE_ID = zoneId('HALL_ZONE_ID');
export const PRISON_ZONE_ID = zoneId('PRISON_ZONE_ID');
export const GATE_ZONE_ID = zoneId('GATE_ZONE_ID');

/** projectPlayerPosition 写入的位置串第二段：`中州·五原·<节点名>`。 */
export const WUYUAN_POSITION_SEGMENT: string = W.positionNodes?.segment || '';
export const WUYUAN_ZONES: OpenWorldZone[] = W.definition.zones || [];
