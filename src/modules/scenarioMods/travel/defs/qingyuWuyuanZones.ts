import type { OpenWorldZone } from '../../openWorldSlice';
import { CONTENT_PACKS } from '../../../contentPacks';
import { resolveOpenWorldSlice, type TsOpenWorldSlicePart } from '../openWorldSlices';

/**
 * 五原开放世界的节点表（从 wuyuanOpenWorldSlice.ts 原样迁出，P0-4 修正：位置解析器要读它，
 * 而 wuyuanOpenWorldSlice 依赖 runtime，直接引用会成环）。路线、问题、角色仍留在原文件。
 *
 * F0b（2026-11-11）：下面的 TS_* 是 TS 侧数据（五原切片的节点表一份），与内容包 openWorldSlices（key 'wuyuan'）二选一，导出名不变（文件末尾）。
 * 包里的五原切片是整份：definition.zones、constants（节点 id）、positionNodes（segment、placeLocationId）都在同一条里。
 */
const TS_WUYUAN_WORLD_LOCATION_ID = 'liuchao.location.wuyuan';
const TS_SETTLEMENT_ZONE_ID = 'lcq.zone.wuyuan.settlement';
const TS_MARKET_ZONE_ID = 'lcq.zone.wuyuan.market';
const TS_PASTRY_ZONE_ID = 'lcq.zone.wuyuan.pastry_shop';
const TS_FRONT_STREET_ZONE_ID = 'lcq.zone.wuyuan.baihu_front_street';
const TS_COMPOUND_ZONE_ID = 'lcq.zone.wuyuan.baihu_compound';
const TS_HALL_ZONE_ID = 'lcq.zone.wuyuan.baihu_hall';
const TS_PRISON_ZONE_ID = 'lcq.zone.wuyuan.water_prison';
const TS_GATE_ZONE_ID = 'lcq.zone.wuyuan.baihu_gate';

/** projectPlayerPosition 写入的位置串第二段：`中州·五原·<节点名>`。 */
const TS_WUYUAN_POSITION_SEGMENT = '五原';

const TS_WUYUAN_ZONES: OpenWorldZone[] = [
  {
    id: TS_SETTLEMENT_ZONE_ID, name: '五原城镇', kind: 'settlement', standable: false,
    worldLocationId: TS_WUYUAN_WORLD_LOCATION_ID,
  },
  {
    id: TS_MARKET_ZONE_ID, name: '五原露天市集', aliases: ['五原市集', '露天市集', '市集'],
    kind: 'street', parentZoneId: TS_SETTLEMENT_ZONE_ID, worldLocationId: TS_WUYUAN_WORLD_LOCATION_ID,
  },
  {
    id: TS_PASTRY_ZONE_ID, name: '点心铺', aliases: ['糕饼铺', '饼铺'],
    kind: 'interior', parentZoneId: TS_SETTLEMENT_ZONE_ID, worldLocationId: TS_WUYUAN_WORLD_LOCATION_ID,
  },
  {
    id: TS_FRONT_STREET_ZONE_ID, name: '白湖商馆门前街', aliases: ['商馆门前', '门前街'],
    kind: 'street', parentZoneId: TS_SETTLEMENT_ZONE_ID, worldLocationId: TS_WUYUAN_WORLD_LOCATION_ID,
  },
  {
    id: TS_COMPOUND_ZONE_ID, name: '白湖商馆', aliases: ['五原商馆'],
    kind: 'compound', parentZoneId: TS_SETTLEMENT_ZONE_ID, worldLocationId: TS_WUYUAN_WORLD_LOCATION_ID, standable: false,
  },
  {
    id: TS_HALL_ZONE_ID, name: '白湖商馆内院', aliases: ['商馆内院'],
    kind: 'interior', parentZoneId: TS_COMPOUND_ZONE_ID, worldLocationId: TS_WUYUAN_WORLD_LOCATION_ID,
  },
  {
    id: TS_PRISON_ZONE_ID, name: '白湖商馆水牢', aliases: ['水牢'],
    kind: 'interior', parentZoneId: TS_COMPOUND_ZONE_ID, worldLocationId: TS_WUYUAN_WORLD_LOCATION_ID,
  },
  {
    id: TS_GATE_ZONE_ID, name: '白湖商馆大门', aliases: ['商馆大门'],
    kind: 'interior', parentZoneId: TS_COMPOUND_ZONE_ID, worldLocationId: TS_WUYUAN_WORLD_LOCATION_ID,
  },
];

/** TS 侧的五原节点表一份（整份五原切片搬进内容包后只留 key；另一份在 wuyuanOpenWorldSlice.ts）。 */
export const TS_WUYUAN_ZONE_PART: TsOpenWorldSlicePart = {
  key: 'wuyuan',
  definition: { zones: TS_WUYUAN_ZONES },
  positionNodes: { segment: TS_WUYUAN_POSITION_SEGMENT, placeLocationId: TS_WUYUAN_WORLD_LOCATION_ID },
  constants: {
    SETTLEMENT_ZONE_ID: TS_SETTLEMENT_ZONE_ID, MARKET_ZONE_ID: TS_MARKET_ZONE_ID, PASTRY_ZONE_ID: TS_PASTRY_ZONE_ID, FRONT_STREET_ZONE_ID: TS_FRONT_STREET_ZONE_ID,
    COMPOUND_ZONE_ID: TS_COMPOUND_ZONE_ID, HALL_ZONE_ID: TS_HALL_ZONE_ID, PRISON_ZONE_ID: TS_PRISON_ZONE_ID, GATE_ZONE_ID: TS_GATE_ZONE_ID,
  },
};

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
