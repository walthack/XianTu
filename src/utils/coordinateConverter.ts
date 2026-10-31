import { namedEntity } from '@/modules/scenarioMods/namedEntities';
import type { GameCoordinates } from '@/types/gameMap';
import type { WorldLocation } from '@/types/location';

type MapSize = { width: number; height: number };

const DEFAULT_MAP_SIZE: MapSize = { width: 10000, height: 10000 };

const LOCATION_COLOR_MAP: Record<string, string> = {
  natural_landmark: '#2D7D32',
  sect_power: '#1565C0',
  city_town: '#F57C00',
  blessed_land: '#7B1FA2',
  treasure_land: '#388E3C',
  dangerous_area: '#D32F2F',
  special_other: '#6B7280',
};

const FACTION_COLOR_RULES: Array<{ match: RegExp; color: string }> = [
  { match: /(魔|邪|诡|阴|幽)/i, color: '#7F1D1D' },
  { match: /(正|仙|道|宗门|剑|丹|符|阵)/i, color: '#1D4ED8' },
  { match: /(世家|门阀|家族)/i, color: '#0F766E' },
  { match: /(商会|商盟|商号)/i, color: '#B45309' },
  { match: /(妖|兽|灵族|异族)/i, color: '#047857' },
  { match: /(联盟|散修)/i, color: '#6B7280' },
];

const clampValue = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const resolveMapSize = (mapSize?: Partial<MapSize>): MapSize => ({
  width: Number(mapSize?.width) > 0 ? Number(mapSize?.width) : DEFAULT_MAP_SIZE.width,
  height: Number(mapSize?.height) > 0 ? Number(mapSize?.height) : DEFAULT_MAP_SIZE.height,
});

const resolveFactionColor = (typeText: string) => {
  for (const rule of FACTION_COLOR_RULES) {
    if (rule.match.test(typeText)) return rule.color;
  }
  return '#6B7280';
};

const isKnownLocationType = (typeText: string) => Object.prototype.hasOwnProperty.call(LOCATION_COLOR_MAP, typeText);

const isFactionLike = (loc: Record<string, any>, typeText: string) => {
  if (isKnownLocationType(typeText)) return false;
  if (loc.leadership || loc.领导层 || loc.memberCount || loc.成员数量) return true;
  return /(宗门|世家|商会|联盟|势力|妖族|魔道)/i.test(typeText);
};

/**
 * 验证并标准化地点数据
 * 只接受游戏坐标，不再支持经纬度
 */
export function normalizeLocationsData(locations: any[], mapSize?: Partial<MapSize>): WorldLocation[] {
  const { width: mapWidth, height: mapHeight } = resolveMapSize(mapSize);
  return locations.map((loc, index) => {
    let coordinates: GameCoordinates;
    const rawType = String(loc.type || loc.类型 || 'special_other');
    const isFaction = isFactionLike(loc, rawType);
    const defaultColor = isFaction ? resolveFactionColor(rawType) : (LOCATION_COLOR_MAP[rawType] || '#6B7280');

    // 只接受游戏坐标格式
    if (loc.coordinates?.x !== undefined && loc.coordinates?.y !== undefined) {
      coordinates = {
        x: clampValue(Number(loc.coordinates.x), 0, mapWidth),
        y: clampValue(Number(loc.coordinates.y), 0, mapHeight),
      };
    } else if (loc.位置?.x !== undefined && loc.位置?.y !== undefined) {
      coordinates = {
        x: clampValue(Number(loc.位置.x), 0, mapWidth),
        y: clampValue(Number(loc.位置.y), 0, mapHeight),
      };
    } else {
      // 缺失坐标时随机生成，确保分散
      coordinates = generateRandomCoords(
        mapWidth / 2,
        mapHeight / 2,
        Math.min(mapWidth, mapHeight) * 0.4,
        mapWidth,
        mapHeight
      );
      console.warn(`[坐标] 地点 "${loc.名称 || loc.name || `地点${index}`}" 缺少坐标，已随机生成: (${coordinates.x.toFixed(0)}, ${coordinates.y.toFixed(0)})`);
    }

    // 处理势力范围（territoryBounds）
    let territoryBounds: GameCoordinates[] | undefined;
    const rawBounds = loc.territoryBounds || loc.势力范围;
    if (rawBounds && Array.isArray(rawBounds) && rawBounds.length >= 3) {
      territoryBounds = rawBounds.map((point: any) => ({
        x: clampValue(Number(point.x), 0, mapWidth),
        y: clampValue(Number(point.y), 0, mapHeight),
      }));
      console.log(`[坐标] 势力 "${loc.名称 || loc.name}" 有势力范围，共 ${territoryBounds.length} 个边界点`);
    }

    // 标准化字段名称，确保使用英文字段名
    return {
      ...loc,
      country: namedEntity('location', loc.id)?.country || loc.country,
      id: loc.id || `loc_${index}_${Date.now()}`,
      name: loc.name || loc.名称 || `未命名地点${index}`,
      type: rawType,
      description: loc.description || loc.描述 || '',
      coordinates,
      territoryBounds,
      headquarters: coordinates, // 势力总部位置
      iconColor: loc.iconColor || defaultColor,
      color: loc.color || defaultColor,
    };
  });
}

/**
 * 验证并标准化大陆边界数据
 */
export function normalizeContinentBounds(
  bounds: any[],
  mapWidth: number = DEFAULT_MAP_SIZE.width,
  mapHeight: number = DEFAULT_MAP_SIZE.height
): GameCoordinates[] {
  return bounds.map((point) => ({
    x: clampValue(Number(point.x), 0, mapWidth),
    y: clampValue(Number(point.y), 0, mapHeight),
  }));
}

/**
 * 生成随机游戏坐标
 */
export function generateRandomCoords(
  centerX: number = 5000,
  centerY: number = 5000,
  radius: number = 3000,
  mapWidth: number = DEFAULT_MAP_SIZE.width,
  mapHeight: number = DEFAULT_MAP_SIZE.height
): GameCoordinates {
  // 为缺省坐标的地点做均匀散点，避免都挤在地图中央
  const marginX = mapWidth * 0.05;
  const marginY = mapHeight * 0.05;

  return {
    x: clampValue(marginX + Math.random() * (mapWidth - marginX * 2), 0, mapWidth),
    y: clampValue(marginY + Math.random() * (mapHeight - marginY * 2), 0, mapHeight),
  };
}

/**
 * 计算两点之间的距离
 */
export function calculateDistance(p1: GameCoordinates, p2: GameCoordinates): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 检查坐标是否在地图范围内
 */
export function isCoordinateValid(coord: GameCoordinates, mapWidth: number = 10000, mapHeight: number = 10000): boolean {
  return coord.x >= 0 && coord.x <= mapWidth && coord.y >= 0 && coord.y <= mapHeight;
}

/**
 * 真实底图上同坐标标记的显示错位（真机 REPORT-8091-cd167d7a：草原与五原城坐标相同，标记完全重叠，地图上点不到草原）。
 * 真实底图不做螺旋防重叠（会把城市群推离印刷地名数百单位），只把「同一落点的第 2、3…个标记」摆到原点周围的网格格位；
 * 第 1 个留在原点。只改画的位置，地点坐标、路程天数都不动。
 * REPORT-8091-fbef6792 复测仍「点草原弹出五原城」：旧版半径 80 的小圆周只比点击半径 50 大一点，而文字标签画在图标下方 50–100 单位处，
 * 草原的标签正压在五原城（原点）的点击圈里，点标签就命中了五原城。格位按「图标＋下方标签」整块的宽高错开，互不压盖。
 */
/** 格位列距／行距（世界单位）：列距容得下 4 字标签（字号 16×2.5），行距容得下图标顶到标签底。 */
export const CO_LOCATED_MARKER_COLUMN = 200;
export const CO_LOCATED_MARKER_ROW = 170;
/** 原点周围的格位顺序：先同行左右，再上一行，再更远的左右，标签所在的下方放最后。 */
const CO_LOCATED_SLOTS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, -1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 1], [1, 1], [-1, 1], [2, -1], [-2, -1], [2, 1], [-2, 1],
];
export function coLocatedMarkerOffset(index: number): GameCoordinates {
  if (!Number.isInteger(index) || index <= 0) return { x: 0, y: 0 };
  const slot = (index - 1) % CO_LOCATED_SLOTS.length, ring = Math.floor((index - 1) / CO_LOCATED_SLOTS.length) + 1;
  const [cx, cy] = CO_LOCATED_SLOTS[slot];
  // 超出一圈格位时整体再外扩一圈（列距×3、行距×3 的倍数），不会落回已占格位。
  const spread = ring === 1 ? 1 : 1 + (ring - 1) * 3;
  return { x: cx * CO_LOCATED_MARKER_COLUMN * spread, y: cy * CO_LOCATED_MARKER_ROW * spread };
}
/** 同落点分组键（取整坐标）。 */
export function coLocatedMarkerKey(coordinates: GameCoordinates): string {
  return `${Math.round(Number(coordinates.x) || 0)}:${Math.round(Number(coordinates.y) || 0)}`;
}

/** 地图标记的可点区域（世界坐标，左上角＋宽高）：图标外框与文字标签外框。 */
export interface MapMarkerBox { x: number; y: number; width: number; height: number }
export interface MapMarkerHitTarget<T> { center: GameCoordinates; boxes: MapMarkerBox[]; data: T }
/** 点击半径（世界单位）：没点进任何图标／标签框时，按最近图标中心兜底。 */
export const MAP_MARKER_CLICK_RADIUS = 50;
/**
 * 地图点选：先看点击是否落在某标记自己的图标或标签框内（框内有多个时取中心最近者），
 * 都不在框内才退回「最近图标中心且在点击半径内」。旧版只按最近中心判，点到草原的标签会命中更近的五原城图标。
 */
export function pickMapMarker<T>(point: GameCoordinates, targets: ReadonlyArray<MapMarkerHitTarget<T>>, radius: number = MAP_MARKER_CLICK_RADIUS): T | null {
  const dist = (t: MapMarkerHitTarget<T>) => Math.hypot(point.x - t.center.x, point.y - t.center.y);
  const inside = (b: MapMarkerBox) => point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height;
  let best: MapMarkerHitTarget<T> | null = null;
  for (const target of targets) {
    if (target.boxes.some(inside) && (!best || dist(target) < dist(best))) best = target;
  }
  if (best) return best.data;
  for (const target of targets) {
    if (dist(target) < radius && (!best || dist(target) < dist(best))) best = target;
  }
  return best ? best.data : null;
}
