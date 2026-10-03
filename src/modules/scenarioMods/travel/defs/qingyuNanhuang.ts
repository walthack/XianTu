import type { OpenWorldArea, OpenWorldRoute, OpenWorldSliceDefinition, OpenWorldZone } from '../../openWorldSlice';

/**
 * 南荒行旅定义（P0-4 第 3 步）。依据：06-地图与移动_剧情侧需求 §2/§3/§6，主策划地点裁定（2026-10-03），
 * 以及各关 rail 的实际 locationId（只按数据声明强制路线，不替数据补地点）。
 *
 * - 节点的 worldLocationId 一律填规范 id；子地点（海神殿、鬼王宫、深井祭台、驿馆）挂父节点。
 * - 强制路线：前一拍完成（afterEventDone）或转关（stageTransition）时触发，走回执，不经 LLM。
 * - 原著没写天数的跨区路程一律 dayCost:'several'（内部 3 天，顶栏「数日后」）；第118章「一天多」记 1 天。
 * - 自由段窗口只用本关事件（切关后 completedEventIds 从空开始）。
 * - 05b 前两拍挂在碧鲮（D8，待主策划裁定）与 04 的 s04_04 缺 locationId（叶媪山村）不声明路线，
 *   由已知问题名单登记；运行时照常推进，玩家可用罗盘移动。
 */
export const NANHUANG_TRAVEL_SLICE_ID = 'lcq.travel.nanhuang_v1';

/** 行旅账管理的关卡（切入 03b 时由 02→03b 转关建立）。 */
export const NANHUANG_STAGE_IDS = [
  'lcq.stage_03b_snake_flower_bridge',
  'lcq.stage_04',
  'lcq.stage_04b_lingfei_baiyi_crisis',
  'lcq.stage_05b',
] as const;

const E = (short: string): string => `lcq.event.${short}`;
const B03 = (n: string): string => E(`s03b_snake_flower_bridge_${n}`);
const B04B = (n: string): string => E(`s04b_lingfei_baiyi_crisis_${n}`);

export const NANHUANG_AREAS: OpenWorldArea[] = [
  { id: 'area.wuyuan', name: '五原', continent: '中州' },
  { id: 'area.sheyi', name: '蛇彝村', continent: '南荒', freeRoamWhen: { until: [B03('04')] } },
  { id: 'area.giant_vine', name: '万古巨藤', continent: '南荒' },
  { id: 'area.huamiao', name: '花苗寨', continent: '南荒', freeRoamWhen: { after: [B03('06')], until: [E('s03b_yinzhu_xiongerpu')] } },
  { id: 'area.xiongerpu', name: '熊耳铺', continent: '南荒' },
  // 04 整关在送亲路上，不开放自由移动。
  { id: 'area.songqin', name: '送亲路', continent: '南荒' },
  { id: 'area.baiyi', name: '白夷', continent: '南荒', freeRoamWhen: { after: [B04B('01')], until: [B04B('13')] } },
  { id: 'area.biyu', name: '碧鲮', continent: '南荒', freeRoamWhen: { after: [B04B('15')], until: [E('biling_bay_stance')] } },
  // 古道→入峒（第82–86章）强制路程，不开放自由移动。
  { id: 'area.guidao', name: '古道', continent: '南荒' },
  // 驿馆附近有限自由（第87–92章）；进宫起全部强制。窗口终点待剧情确认。
  { id: 'area.guiwang', name: '鬼王峒', continent: '南荒', freeRoamWhen: { until: [E('s05b_03_saan_secret_path')] } },
  { id: 'area.sandong', name: '散峒营地', continent: '南荒' },
  { id: 'area.yeao', name: '南荒山村', continent: '南荒', freeRoamWhen: { after: [E('s05b_wuer_suli_depart')] } },
];

export const NANHUANG_ZONES: OpenWorldZone[] = [
  { id: 'nh.wuyuan', name: '五原城', worldLocationId: 'liuchao.location.wuyuan', areaId: 'area.wuyuan' },
  { id: 'nh.sheyi', name: '蛇彝村', worldLocationId: 'lcq.location.sheyi_village', areaId: 'area.sheyi' },
  { id: 'nh.giant_vine', name: '万古巨藤', worldLocationId: 'lcq.location.giant_vine', areaId: 'area.giant_vine' },
  { id: 'nh.huamiao', name: '花苗寨', worldLocationId: 'lcq.location.huamiao_village', areaId: 'area.huamiao' },
  { id: 'nh.xiongerpu', name: '熊耳铺', worldLocationId: 'liuchao.location.xiongerpu', areaId: 'area.xiongerpu' },
  { id: 'nh.shan_jian', name: '南荒山涧', worldLocationId: 'liuchao.location.shan_jian', areaId: 'area.songqin' },
  { id: 'nh.yeao', name: '南荒山村', worldLocationId: 'lcq.location.yeao_village', areaId: 'area.yeao' },
  { id: 'nh.baiyi', name: '白夷族', worldLocationId: 'liuchao.location.baiyi', areaId: 'area.baiyi' },
  { id: 'nh.biyu', name: '碧鲮族', worldLocationId: 'liuchao.location.biyu_village', areaId: 'area.biyu', heardWhen: [B03('01')] },
  { id: 'nh.sea_temple', name: '海神殿', kind: 'interior', parentZoneId: 'nh.biyu', worldLocationId: 'liuchao.location.sea_temple', heardWhen: [B04B('16')] },
  { id: 'nh.south_wild_valley', name: '南荒山谷', worldLocationId: 'liuchao.location.south_wild_valley', areaId: 'area.guidao', heardWhen: [E('biling_bay_stance')] },
  { id: 'nh.guiwang_dong', name: '鬼王峒', worldLocationId: 'liuchao.location.guiwang_dong', areaId: 'area.guiwang' },
  { id: 'nh.guiwang_inn', name: '鬼王峒驿馆', kind: 'interior', parentZoneId: 'nh.guiwang_dong', worldLocationId: 'lcq.location.guiwang_inn' },
  // 鬼王宫是峒的子地点：进峒≠到宫，单独到达；第85章有人提及后可听闻。
  { id: 'nh.gui_wang_gong', name: '鬼王宫', kind: 'interior', parentZoneId: 'nh.guiwang_dong', worldLocationId: 'liuchao.location.gui_wang_gong', heardWhen: [E('guiwangdong_coop_pact')] },
  { id: 'nh.jingshen_tai', name: '鬼王宫深井祭台', kind: 'interior', parentZoneId: 'nh.gui_wang_gong', worldLocationId: 'liuchao.location.gui_wang_gong.jingshen_tai' },
  { id: 'nh.departure_camp', name: '南荒散峒营地', worldLocationId: 'lcq.location.nanhuang_departure_camp', areaId: 'area.sandong' },
];

function journey(id: string, from: string, to: string, label: string, forcedBy: OpenWorldRoute['forcedBy'], extra: Partial<OpenWorldRoute> = {}): OpenWorldRoute {
  return { id, fromZoneId: from, toZoneId: to, label, turnCost: 1, kind: 'journey', dayCost: 'several', forcedBy, ...extra };
}

function local(id: string, from: string, to: string, label: string, forcedBy: OpenWorldRoute['forcedBy']): OpenWorldRoute {
  return { id, fromZoneId: from, toZoneId: to, label, turnCost: 1, kind: 'local', forcedBy };
}

const after = (eventId: string): OpenWorldRoute['forcedBy'] => ({ afterEventDone: eventId });

export const NANHUANG_ROUTES: OpenWorldRoute[] = [
  journey('nh.r.stage.02_03b', 'nh.wuyuan', 'nh.sheyi', '随商队南下',
    { stageTransition: 'lcq.stage_02→lcq.stage_03b_snake_flower_bridge' },
    { summary: '出五原，经白龙江口南下，入南荒，渡河，到蛇彝村。' }),
  journey('nh.r.after.s03b_04', 'nh.sheyi', 'nh.giant_vine', '离开蛇彝村', after(B03('04'))),
  journey('nh.r.after.s03b_05', 'nh.giant_vine', 'nh.huamiao', '过巨藤去花苗寨', after(B03('05'))),
  journey('nh.r.after.wanwu_night', 'nh.huamiao', 'nh.xiongerpu', '随送亲队去熊耳铺', after(E('s03b_wanwu_night'))),
  journey('nh.r.stage.03b_04', 'nh.xiongerpu', 'nh.shan_jian', '送亲队离开熊耳铺',
    { stageTransition: 'lcq.stage_03b_snake_flower_bridge→lcq.stage_04' }),
  journey('nh.r.after.s04_06', 'nh.shan_jian', 'nh.baiyi', '送亲队到白夷', after(E('s04_06'))),
  journey('nh.r.after.s04b_13', 'nh.baiyi', 'nh.south_wild_valley', '离开白夷', after(B04B('13'))),
  journey('nh.r.after.s04b_14', 'nh.south_wild_valley', 'nh.biyu', '同往碧鲮', after(B04B('14'))),
  local('nh.r.after.s04b_19', 'nh.biyu', 'nh.sea_temple', '去海神殿', after(B04B('19'))),
  local('nh.r.after.pull_harpoon', 'nh.sea_temple', 'nh.biyu', '回碧鲮村', after(E('pull_harpoon_lemingzhu'))),
  journey('nh.r.after.biling_bay', 'nh.biyu', 'nh.south_wild_valley', '离开碧鲮', after(E('biling_bay_stance'))),
  journey('nh.r.after.yiyang', 'nh.south_wild_valley', 'nh.biyu', '回碧鲮', after(E('yiyang_repels_yinsha'))),
  journey('nh.r.after.huamiao_coop', 'nh.biyu', 'nh.south_wild_valley', '再入古道', after(E('huamiao_coop_boundary'))),
  journey('nh.r.after.coop_pact', 'nh.south_wild_valley', 'nh.guiwang_dong', '随迷谷入峒', after(E('guiwangdong_coop_pact'))),
  local('nh.r.stage.04b_05b', 'nh.guiwang_dong', 'nh.guiwang_inn', '到驿馆安顿',
    { stageTransition: 'lcq.stage_04b_lingfei_baiyi_crisis→lcq.stage_05b' }),
  local('nh.r.after.s05b_03', 'nh.guiwang_dong', 'nh.gui_wang_gong', '经密道入鬼王宫', after(E('s05b_03_saan_secret_path'))),
  local('nh.r.after.s05b_06', 'nh.gui_wang_gong', 'nh.jingshen_tai', '下深井祭台', after(E('s05b_06_breakout_and_reunion'))),
  local('nh.r.after.s05b_08b', 'nh.jingshen_tai', 'nh.gui_wang_gong', '回宫中', after(E('s05b_08b_altar_corpse_fight_and_danchen'))),
  local('nh.r.after.s05b_10', 'nh.gui_wang_gong', 'nh.jingshen_tai', '再下祭台', after(E('s05b_10_slave_revolt_and_phoenix_change'))),
  local('nh.r.after.ghost_king', 'nh.jingshen_tai', 'nh.guiwang_dong', '出宫回峒中', after(E('ghost_king_swallowed'))),
  journey('nh.r.after.tribes_pledge', 'nh.guiwang_dong', 'nh.departure_camp', '散峒', after(E('tribes_pledge'))),
  journey('nh.r.after.wuer_suli', 'nh.departure_camp', 'nh.yeao', '往南荒山村', after(E('s05b_wuer_suli_depart')),
    { dayCost: 1, summary: '朱老头说一天多工夫就到。' }),
];

export const QINGYU_NANHUANG_DEFINITION: OpenWorldSliceDefinition = {
  id: NANHUANG_TRAVEL_SLICE_ID,
  initialZoneId: 'nh.wuyuan',
  zones: NANHUANG_ZONES,
  routes: NANHUANG_ROUTES,
  areas: NANHUANG_AREAS,
  notices: [],
  actors: [],
  problems: [],
  actions: [],
};

/** 碧鲮的区内节点表（剧情裁定：海神殿是碧鲮的子地点；「南荒·海神殿」解析为碧鲮族＋海神殿）。 */
export const BIYU_POSITION_SEGMENT = '碧鲮族';
export const BIYU_WORLD_LOCATION_ID = 'liuchao.location.biyu_village';
export const BIYU_POSITION_NODES: ReadonlyArray<{ zoneId: string; names: string[] }> = [
  { zoneId: 'nh.sea_temple', names: ['海神殿'] },
];
