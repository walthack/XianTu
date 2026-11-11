import {namedEntityEntries,canonicalEntityId} from '../namedEntities';
import { CONTENT_PACKS } from '../../contentPacks';
import type { PackLocationAliases } from '../../contentPacks/coreFormats';
/**
 * 地点规范 id、别名、父子关系与规范名（P0-4 移动系统）。
 *
 * 比较（事件 locationId、到场、回执、presence）一律先过 `canonicalLocationId`。
 * 数据（B3 起）：三张手写表在核心包 `contentPacks/packs/qingyu/location-aliases.json`，权威来源是那份 JSON；
 * 原文件头的主策划／剧情裁定注释随数据进了 JSON 顶层 `note`。下面三张 TS 表为空表。
 *
 * 内容包 `locationAliases`（F0a）：canonical／parents／display 三张表分别并在下面 TS 表之后（`mergeLocationTable`），
 * 导出名与类型不变；地点实体总表派生的别名（namedEntityEntries）仍排最前。编译期查重：同一键两边都有即报错。
 */
/** 手写别名（地点实体总表派生之外的那几条）。 */
export const TS_LOCATION_ID_ALIASES: Record<string,string> = {};

/** TS 表在前、包按 catalog 顺序在后；键重复即报错（编译期已查，这里兜底）。 */
export function mergeLocationTable<T>(label: string, ts: Readonly<Record<string, T>>, pack: Readonly<Record<string, T>> | undefined): Record<string, T> {
  const out = { ...ts };
  for (const [key, value] of Object.entries(pack || {})) {
    if (key in out) throw new Error(`locationAliases ${label} ${key}: duplicate`);
    out[key] = value;
  }
  return out;
}
const PACK_LOCATIONS: Partial<PackLocationAliases> = CONTENT_PACKS.locationAliases || {};

export const LOCATION_ID_ALIASES: Readonly<Record<string,string>> = Object.freeze({
  ...Object.fromEntries(namedEntityEntries('location').flatMap(e=>e.aliases.filter(id=>id.includes('.location.')).map(id=>[id,e.id]))),
  ...mergeLocationTable('canonical', TS_LOCATION_ID_ALIASES, PACK_LOCATIONS.canonical),
});

/** 子地点 → 父地点（规范 id）。人在子地点算在父地点；人在父地点不算到了子地点。 */
export const TS_LOCATION_PARENTS: Record<string, string> = {};

/** 子地点 → 父地点：TS 表加内容包。 */
export const LOCATION_PARENTS: Readonly<Record<string, string>> = mergeLocationTable('parents', TS_LOCATION_PARENTS, PACK_LOCATIONS.parents);

/** 规范名与显示别名：位置串里出现这些名字也解析到该规范 id（当前关正典里没有该地点时用）。 */
export const TS_LOCATION_NAMES: Record<string, { name: string; displayAliases?: string[] }> = {};
/** 规范名与显示别名：TS 表加内容包 display。 */
export const LOCATION_NAMES: Readonly<Record<string, { name: string; displayAliases?: string[] }>> = mergeLocationTable('display', TS_LOCATION_NAMES, PACK_LOCATIONS.display);

export function canonicalLocationId(id: string): string;
export function canonicalLocationId(id: string | undefined): string | undefined;
export function canonicalLocationId(id: string | undefined): string | undefined {
  if (!id) return id;
  return canonicalEntityId('location',LOCATION_ID_ALIASES[id] || id);
}

export function sameCanonicalLocation(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && canonicalLocationId(left) === canonicalLocationId(right));
}

/** 规范 id 的祖先链（不含自身），由近到远。 */
export function locationAncestors(id: string | undefined): string[] {
  const chain: string[] = [];
  let current = canonicalLocationId(id);
  while (current && LOCATION_PARENTS[current] && !chain.includes(LOCATION_PARENTS[current])) {
    current = canonicalLocationId(LOCATION_PARENTS[current]);
    chain.push(current);
  }
  return chain;
}

/** 人在 at，算不算到了 target：同一规范地点，或 at 是 target 的子孙地点。 */
export function locationWithin(at: string | undefined, target: string | undefined): boolean {
  if (!at || !target) return false;
  const goal = canonicalLocationId(target);
  return canonicalLocationId(at) === goal || locationAncestors(at).includes(goal);
}

/** 名字 → 规范 id（只查规范名与显示别名表）。 */
export function locationIdByRegisteredName(name: string): string | undefined {
  const compact = name.replace(/\s+/g, '');
  return Object.entries(LOCATION_NAMES).find(([, entry]) =>
    [entry.name, ...(entry.displayAliases || [])].some(item => item.replace(/\s+/g, '') === compact))?.[0];
}

export interface LocationRecord {
  id: string;
  name: string;
  continentId?: string;
  region?: string;
  coordinates?: { x?: number; y?: number };
}

export interface StageLocationData {
  file: string;
  locations: ReadonlyArray<LocationRecord>;
  eventLocations: ReadonlyArray<{ eventId: string; locationId: string }>;
  continents?: ReadonlyArray<{ id: string; name?: string; bounds?: Array<{ x: number; y: number }> }>;
}

/** 不许豁免的类型：出现即失败。 */
export const UNWAIVABLE_LOCATION_ISSUES = ['alias_self', 'alias_cycle', 'alias_target_missing', 'event_ref_broken'] as const;

export type LocationIdIssueKind =
  | typeof UNWAIVABLE_LOCATION_ISSUES[number]
  | 'unaliased_duplicate'
  | 'shared_anchor'
  | 'coordinate_conflict'
  | 'missing_coordinates'
  | 'outside_nanhuang'
  | 'rail_move_undeclared';

export interface LocationIdIssue {
  kind: LocationIdIssueKind;
  ids: string[];
  detail: string;
}

export function locationIssueKey(issue: Pick<LocationIdIssue, 'kind' | 'ids'>): string {
  return `${issue.kind}:${[...issue.ids].sort().join('+')}`;
}

const NANHUANG_CONTINENT_IDS = new Set(['liuchao.continent.nanhuang', '南荒']);

function insidePolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x <= ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function coordsOf(location: LocationRecord): { x: number; y: number } | undefined {
  const { x, y } = location.coordinates || {};
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : undefined;
}

/** 同一组规范 id 是否全在一条父子链上（父子地点允许共用锚点）。 */
function parentChildGroup(ids: string[]): boolean {
  return ids.every(id => ids.every(other => id === other || locationWithin(id, other) || locationWithin(other, id)));
}

/**
 * 地点 id 校验关（canon:build 独立一关）。只读，返回全部问题；豁免由已知问题名单决定。
 * 南荒多边形检查只对 continentId 为南荒的地点生效。
 */
export function auditLocationIds(
  stages: ReadonlyArray<StageLocationData>,
  aliases: Readonly<Record<string, string>> = LOCATION_ID_ALIASES,
): LocationIdIssue[] {
  const issues: LocationIdIssue[] = [];
  const seen = new Set<string>();
  const push = (issue: LocationIdIssue): void => {
    const key = locationIssueKey(issue);
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(issue);
  };
  const canonical = (id: string): string => aliases[id] || id;
  const known = new Set(stages.flatMap(stage => stage.locations.map(item => item.id)));

  for (const [alias, target] of Object.entries(aliases)) {
    if (alias === target) {
      push({ kind: 'alias_self', ids: [alias], detail: '别名指向自己' });
      continue;
    }
    const chain = [alias];
    let current = target;
    while (aliases[current] && !chain.includes(current)) { chain.push(current); current = aliases[current]; }
    if (chain.includes(current) || aliases[target]) {
      push({ kind: 'alias_cycle', ids: [alias, target], detail: '别名循环或指向另一个别名' });
    }
    if (!known.has(target)) push({ kind: 'alias_target_missing', ids: [alias, target], detail: `别名目标 ${target} 不在任何关卡` });
  }

  for (const stage of stages) {
    const ids = new Set(stage.locations.map(item => item.id));
    for (const ref of stage.eventLocations) {
      if (!ids.has(ref.locationId) || !known.has(canonical(ref.locationId))) {
        push({ kind: 'event_ref_broken', ids: [ref.locationId], detail: `${stage.file} ${ref.eventId} → ${ref.locationId}（归一后 ${canonical(ref.locationId)}）` });
      }
    }
    const nanhuang = stage.continents?.find(item => NANHUANG_CONTINENT_IDS.has(item.id) || item.name === '南荒');
    for (const location of stage.locations) {
      if (!NANHUANG_CONTINENT_IDS.has(String(location.continentId || location.region || ''))) continue;
      const point = coordsOf(location);
      if (!point) {
        push({ kind: 'missing_coordinates', ids: [location.id], detail: `${location.name} 无坐标` });
      } else if (nanhuang?.bounds?.length && !insidePolygon(point, nanhuang.bounds)) {
        push({ kind: 'outside_nanhuang', ids: [location.id], detail: `${location.name} (${point.x},${point.y}) 不在南荒多边形内` });
      }
    }
  }

  const all = stages.flatMap(stage => stage.locations);
  const byNameCoord = new Map<string, Set<string>>();
  const byCoord = new Map<string, Set<string>>();
  const coordsByCanonical = new Map<string, Set<string>>();
  for (const location of all) {
    const point = coordsOf(location);
    if (!location.id || !point) continue;
    const at = `${point.x},${point.y}`;
    const nameKey = `${String(location.name || '').replace(/\s+/g, '')}@${at}`;
    if (!byNameCoord.has(nameKey)) byNameCoord.set(nameKey, new Set());
    byNameCoord.get(nameKey)!.add(location.id);
    if (!byCoord.has(at)) byCoord.set(at, new Set());
    byCoord.get(at)!.add(canonical(location.id));
    if (!coordsByCanonical.has(canonical(location.id))) coordsByCanonical.set(canonical(location.id), new Set());
    coordsByCanonical.get(canonical(location.id))!.add(at);
  }
  for (const [key, ids] of byNameCoord) {
    if (new Set([...ids].map(canonical)).size > 1) {
      push({ kind: 'unaliased_duplicate', ids: [...ids].sort(), detail: `同名同坐标未并到一个规范 id：${key}` });
    }
  }
  for (const [at, ids] of byCoord) {
    const group = [...ids].sort();
    if (group.length > 1 && !parentChildGroup(group)) {
      push({ kind: 'shared_anchor', ids: group, detail: `不同地点共用锚点 (${at})` });
    }
  }
  for (const [id, coords] of coordsByCanonical) {
    if (coords.size > 1) push({ kind: 'coordinate_conflict', ids: [id], detail: `同一规范地点坐标不一：${[...coords].join(' / ')}` });
  }
  return issues;
}

/** 旧档大陆前缀仅用于历史存储；展示国别以地点总表为准，不修改地点身份。 */
export function locationDescriptionWithCountry(position: { locationId?: string; 描述?: string } | null | undefined): string {
  const description = position?.描述 || '';
  const entries = namedEntityEntries('location');
  let entry = entries.find(e => e.id === canonicalLocationId(position?.locationId));
  if (!entry) {
    const hits = entries.filter(e => typeof e.definition.name === 'string' && description.split('·').slice(1).some(part => part === e.definition.name));
    if (hits.length === 1) entry = hits[0];
  }
  const country = entry?.definition.country;
  if (typeof country !== 'string' || !country || !description) return description;
  const parts = description.split('·');
  return parts.length > 1 ? [country, ...parts.slice(1)].join('·') : `${country}·${description}`;
}
