import type { OpenWorldZone } from '../../openWorldSlice';

/**
 * 五原开放世界的节点表（从 wuyuanOpenWorldSlice.ts 原样迁出，P0-4 修正：位置解析器要读它，
 * 而 wuyuanOpenWorldSlice 依赖 runtime，直接引用会成环）。路线、问题、角色仍留在原文件。
 */
export const WUYUAN_WORLD_LOCATION_ID = 'liuchao.location.wuyuan';
export const SETTLEMENT_ZONE_ID = 'lcq.zone.wuyuan.settlement';
export const MARKET_ZONE_ID = 'lcq.zone.wuyuan.market';
export const PASTRY_ZONE_ID = 'lcq.zone.wuyuan.pastry_shop';
export const FRONT_STREET_ZONE_ID = 'lcq.zone.wuyuan.baihu_front_street';
export const COMPOUND_ZONE_ID = 'lcq.zone.wuyuan.baihu_compound';
export const HALL_ZONE_ID = 'lcq.zone.wuyuan.baihu_hall';
export const PRISON_ZONE_ID = 'lcq.zone.wuyuan.water_prison';
export const GATE_ZONE_ID = 'lcq.zone.wuyuan.baihu_gate';

/** projectPlayerPosition 写入的位置串第二段：`中州·五原·<节点名>`。 */
export const WUYUAN_POSITION_SEGMENT = '五原';

export const WUYUAN_ZONES: OpenWorldZone[] = [
  {
    id: SETTLEMENT_ZONE_ID, name: '五原城镇', kind: 'settlement', standable: false,
    worldLocationId: WUYUAN_WORLD_LOCATION_ID,
  },
  {
    id: MARKET_ZONE_ID, name: '五原露天市集', aliases: ['五原市集', '露天市集', '市集'],
    kind: 'street', parentZoneId: SETTLEMENT_ZONE_ID, worldLocationId: WUYUAN_WORLD_LOCATION_ID,
  },
  {
    id: PASTRY_ZONE_ID, name: '点心铺', aliases: ['糕饼铺', '饼铺'],
    kind: 'interior', parentZoneId: SETTLEMENT_ZONE_ID, worldLocationId: WUYUAN_WORLD_LOCATION_ID,
  },
  {
    id: FRONT_STREET_ZONE_ID, name: '白湖商馆门前街', aliases: ['商馆门前', '门前街'],
    kind: 'street', parentZoneId: SETTLEMENT_ZONE_ID, worldLocationId: WUYUAN_WORLD_LOCATION_ID,
  },
  {
    id: COMPOUND_ZONE_ID, name: '白湖商馆', aliases: ['五原商馆'],
    kind: 'compound', parentZoneId: SETTLEMENT_ZONE_ID, worldLocationId: WUYUAN_WORLD_LOCATION_ID, standable: false,
  },
  {
    id: HALL_ZONE_ID, name: '白湖商馆内院', aliases: ['商馆内院'],
    kind: 'interior', parentZoneId: COMPOUND_ZONE_ID, worldLocationId: WUYUAN_WORLD_LOCATION_ID,
  },
  {
    id: PRISON_ZONE_ID, name: '白湖商馆水牢', aliases: ['水牢'],
    kind: 'interior', parentZoneId: COMPOUND_ZONE_ID, worldLocationId: WUYUAN_WORLD_LOCATION_ID,
  },
  {
    id: GATE_ZONE_ID, name: '白湖商馆大门', aliases: ['商馆大门'],
    kind: 'interior', parentZoneId: COMPOUND_ZONE_ID, worldLocationId: WUYUAN_WORLD_LOCATION_ID,
  },
];
