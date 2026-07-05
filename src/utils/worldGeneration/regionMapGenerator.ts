/**
 * 区域地图生成器
 * 根据地点信息，调用 AI 生成格子式区域地图（包含建筑列表）
 * 区域首次进入时触发，结果保存到 worldInfo.区域地图[]
 */

import { getTavernHelper } from '../tavern';
import { parseJsonSmart } from '../jsonExtract';
import { promptStorage } from '@/services/promptStorage';
import type {
  RegionMap,
  RegionBuilding,
  RegionMapScale,
  RegionBuildingType,
} from '@/types/gameMap';
import { REGION_MAP_SCALE_SIZE } from '@/types/gameMap';

export interface RegionNpcLocationHint {
  /** NPC 名称 */
  npcName: string;
  /** NPC 的完整位置路径（原始文本） */
  fullPath: string;
  /** 从路径中提取出的区域内建筑名（叶子节点） */
  buildingName: string;
}

/** 正典子地点（剧本模组 canon.locations 里坐标钉在该城的建筑级地点）——城内布局的必含骨架。 */
export interface RegionCanonBuilding {
  /** 正典 location id（如 lyg.location.xxx）——沿用为建筑 id，使剧情事件 locationId 与城内建筑咬合 */
  id: string;
  name: string;
  description?: string;
}

// ─── 规模推断 ──────────────────────────────────────────────────────────────

/**
 * 根据地点类型推断区域规模
 * 优先级：等级 > 类型 > 默认
 */
function inferScale(locationType: string, level?: string): RegionMapScale {
  // 等级关键词
  if (level) {
    if (level.includes('超级') || level.includes('帝')) return '9x9';
    if (level.includes('一流')) return '7x7';
    if (level.includes('二流')) return '5x5';
    if (level.includes('三流')) return '5x5';
    if (level.includes('末流')) return '3x3';
  }

  // 类型关键词
  const t = locationType;
  if (/帝国|王都|圣地|大陆|超级|巨.+宗/u.test(t)) return '9x9';
  if (/大城|都城|一流|超一流|大宗|名宗/u.test(t)) return '7x7';
  if (/城|宗门|门派|门|城镇|镇|秘境|灵域/u.test(t)) return '5x5';
  if (/村|驿|坊市|市集|据点|聚居/u.test(t)) return '3x3';
  if (/洞府|茅屋|小屋|独|简/u.test(t)) return '1x1';

  return '5x5'; // 默认
}

// ─── 默认提示词模板 ─────────────────────────────────────────────────────────

const DEFAULT_PROMPT_TEMPLATE = `你是一个修仙世界的地图设计师。请根据地点信息，为该地点设计内部格子地图（建筑列表）。

【坐标系规则】
- 左下角为 (1,1)，向右 x 增大，向上 y 增大
- gridX/gridY 从 1 开始，不能超过指定的格子大小

【建筑类型】
- entrance: 区域入口/大门，玩家进入时的默认落点（至少 1 个，isEntrance:true）
- main: 核心建筑（宗主殿、议事厅、神殿等）
- residential: 居所（弟子宿舍、客栈、民居等）
- functional: 功能建筑（藏经阁、炼丹房、坊市、擂台等）
- restricted: 禁区（禁地、秘库、祖地等）
- wilderness: 自然地形（山峰、湖泊、广场、道路等）

【数量参考】
- 1x1: 1个建筑
- 3x3: 3-5个建筑
- 5x5: 5-9个建筑
- 7x7: 9-15个建筑
- 9x9: 12-20个建筑

【严格输出】只输出纯 JSON，不含任何解释文字：
{"buildings":[{"id":"英文标识符_无空格","name":"建筑名称","gridX":数字,"gridY":数字,"type":"建筑类型","isEntrance":true/false,"description":"一句话描述"}]}`;

// ─── 提示词构建 ────────────────────────────────────────────────────────────

/**
 * 构建提示词（优先 promptStorage 用户自定义，然后附加地点信息）
 */
async function buildPrompt(params: {
  locationName: string;
  locationType: string;
  locationDesc: string;
  factionInfo?: string;
  gridSize: number;
  npcLocationHints?: RegionNpcLocationHint[];
  canonBuildings?: RegionCanonBuilding[];
}): Promise<string> {
  const { locationName, locationType, locationDesc, factionInfo, gridSize, npcLocationHints, canonBuildings } = params;

  // 读取用户自定义提示词（基础规则部分）
  const customBase = await promptStorage.get('regionMapGeneration');
  const baseRule = customBase?.trim() || DEFAULT_PROMPT_TEMPLATE;

  // 拼接地点具体信息（这部分每次都要动态生成）
  const locationContext = `
【本次地点信息】
名称：${locationName}
类型：${locationType}
描述：${locationDesc}${factionInfo ? `\n相关势力：${factionInfo}` : ''}
格子大小：${gridSize}×${gridSize}（gridX/gridY 均不能超过 ${gridSize}）`;

  // NPC 位置线索（只接收调用方已过滤为“当前地点匹配”的线索）
  const buildingStats = new Map<string, { count: number; npcNames: Set<string> }>();
  const hintList = (npcLocationHints ?? []).slice(0, 40);
  hintList.forEach((hint) => {
    const buildingName = String(hint.buildingName || '').trim();
    if (!buildingName) return;
    const stat = buildingStats.get(buildingName) || { count: 0, npcNames: new Set<string>() };
    stat.count += 1;
    stat.npcNames.add(String(hint.npcName || '').trim() || '未知NPC');
    buildingStats.set(buildingName, stat);
  });

  const sortedBuildings = Array.from(buildingStats.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12);

  const npcHintSection = sortedBuildings.length > 0
    ? `\n【NPC 位置线索（已过滤为当前地点）】
- 下列线索仅来自“路径第二段=当前地点（${locationName}）”的 NPC，其它地点线索已排除，无需参考。
- 请优先在区域地图中包含这些建筑（同义可合并）：
${sortedBuildings
  .map(([name, stat]) => `  - ${name}（线索${stat.count}条，涉及NPC：${Array.from(stat.npcNames).slice(0, 4).join('、')}）`)
  .join('\n')}
- 若格子数量不足，可保留高频建筑，低频建筑可并入功能区描述。`
    : '\n【NPC 位置线索】当前没有与该地点匹配的 NPC 建筑线索，可按地点信息自由设计。';

  // 正典建筑：剧情事件挂在这些地点上，缺失/改名会让剧情与城内图脱节——必含且 id/name 禁改
  const canonSection = (canonBuildings ?? []).length
    ? `\n【正典建筑（剧情关键地点·必须全部包含）】
- 下列建筑**必须全部**出现在布局中；\`name\` 与 \`id\` 必须**逐字使用给定值**（禁止改名、合并、省略或另编 id）：
${(canonBuildings ?? [])
  .map(c => `  - name:"${c.name}" id:"${c.id}"${c.description ? `（${String(c.description).slice(0, 40)}）` : ''}`)
  .join('\n')}
- 其余格子可自由设计市井建筑（商铺/客栈/民居等）；若与上方 NPC 线索同名近义，以正典名称为准合并。`
    : '';

  return `${baseRule}\n${locationContext}${canonSection}\n${npcHintSection}`;
}

function getExpectedBuildingCount(gridSize: number): string {
  switch (gridSize) {
    case 1: return '1';
    case 3: return '3-5';
    case 5: return '5-9';
    case 7: return '9-15';
    case 9: return '12-20';
    default: return '5-9';
  }
}

// ─── 校验 ─────────────────────────────────────────────────────────────────

function validateBuildings(
  buildings: RegionBuilding[],
  gridSize: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 检查坐标合法性
  for (const b of buildings) {
    if (b.gridX < 1 || b.gridX > gridSize) {
      errors.push(`建筑 "${b.name}" 的 gridX=${b.gridX} 超出范围 [1,${gridSize}]`);
    }
    if (b.gridY < 1 || b.gridY > gridSize) {
      errors.push(`建筑 "${b.name}" 的 gridY=${b.gridY} 超出范围 [1,${gridSize}]`);
    }
  }

  // 检查坐标重叠
  const usedCells = new Set<string>();
  for (const b of buildings) {
    const key = `${b.gridX},${b.gridY}`;
    if (usedCells.has(key)) {
      errors.push(`坐标 (${b.gridX},${b.gridY}) 存在重叠建筑`);
    }
    usedCells.add(key);
  }

  // 检查入口
  const hasEntrance = buildings.some((b) => b.isEntrance);
  if (!hasEntrance) {
    errors.push('区域必须包含至少一个入口建筑（isEntrance: true）');
  }

  // 检查 ID 唯一性
  const ids = buildings.map((b) => b.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    errors.push('建筑 ID 存在重复');
  }

  return { valid: errors.length === 0, errors };
}

// ─── 修复 ─────────────────────────────────────────────────────────────────

/**
 * 对不合法的坐标和少量问题做最小化自动修复
 */
function autoFixBuildings(buildings: RegionBuilding[], gridSize: number): RegionBuilding[] {
  const fixed: RegionBuilding[] = [];
  const usedCells = new Set<string>();

  for (const b of buildings) {
    // 修复坐标范围
    const gridX = Math.max(1, Math.min(gridSize, Math.round(b.gridX) || 1));
    const gridY = Math.max(1, Math.min(gridSize, Math.round(b.gridY) || 1));
    let fx = gridX;
    let fy = gridY;

    // 如果该格子已被占用，寻找最近的空格子
    if (usedCells.has(`${fx},${fy}`)) {
      let found = false;
      outer: for (let r = 1; r <= gridSize; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            const nx = fx + dx;
            const ny = fy + dy;
            if (nx >= 1 && nx <= gridSize && ny >= 1 && ny <= gridSize && !usedCells.has(`${nx},${ny}`)) {
              fx = nx;
              fy = ny;
              found = true;
              break outer;
            }
          }
        }
      }
      if (!found) continue; // 实在没地方就跳过
    }

    usedCells.add(`${fx},${fy}`);
    fixed.push({ ...b, gridX: fx, gridY: fy });
  }

  // 确保有入口
  if (fixed.length > 0 && !fixed.some((b) => b.isEntrance)) {
    fixed[0] = { ...fixed[0], isEntrance: true };
  }

  // 修复 ID 唯一性
  const seenIds = new Set<string>();
  for (let i = 0; i < fixed.length; i++) {
    let id = fixed[i].id || `building_${i}`;
    if (seenIds.has(id)) {
      id = `${id}_${i}`;
    }
    seenIds.add(id);
    fixed[i] = { ...fixed[i], id };
  }

  return fixed;
}

// ─── 正典建筑咬合 ─────────────────────────────────────────────────────────

/**
 * 确定性兜底：无论 LLM 是否听话，保证正典建筑全部在场且 id/name 与正典一致。
 * - 名称能对上（相等/互相包含）的生成建筑：改用正典 id 与正典名称
 * - 缺失的正典建筑：插入空格子（从高 y 往低扫；满了则与最后一格共享，宁可挤不可缺）
 * 幂等：重复调用不产生变化。返回是否有改动。
 */
export function enforceCanonBuildings(
  buildings: RegionBuilding[],
  canon: RegionCanonBuilding[] | undefined,
  gridSize: number,
): boolean {
  if (!canon?.length) return false;
  let changed = false;
  const used = new Set(buildings.map(b => `${b.gridX},${b.gridY}`));
  const claimed = new Set<string>(); // 已被某正典条目认领的建筑，防两个正典项抢同一建筑

  const findFreeCell = (): { x: number; y: number } | null => {
    for (let y = gridSize; y >= 1; y--) {
      for (let x = 1; x <= gridSize; x++) {
        if (!used.has(`${x},${y}`)) return { x, y };
      }
    }
    return null;
  };

  for (const c of canon) {
    if (buildings.some(b => b.id === c.id)) continue; // 已咬合
    const match = buildings.find(
      b => !claimed.has(b.id) && !b.isEntrance
        && (b.name === c.name || b.name.includes(c.name) || c.name.includes(b.name)),
    );
    if (match) {
      claimed.add(c.id);
      match.id = c.id;
      match.name = c.name;
      changed = true;
      continue;
    }
    const cell = findFreeCell() ?? { x: gridSize, y: 1 }; // 满格兜底：共享角落格，宁挤不缺
    used.add(`${cell.x},${cell.y}`);
    buildings.push({
      id: c.id,
      name: c.name,
      gridX: cell.x,
      gridY: cell.y,
      type: 'main',
      isEntrance: false,
      description: c.description || '',
    });
    claimed.add(c.id);
    changed = true;
  }
  return changed;
}

/** 旧档已生成的区域地图缓存：增量补插缺失的正典建筑（不重新生成，幂等）。返回是否有改动。 */
export function mergeCanonBuildingsIntoRegion(
  regionMap: RegionMap,
  canon: RegionCanonBuilding[] | undefined,
): boolean {
  if (!regionMap || !Array.isArray(regionMap.buildings)) return false;
  return enforceCanonBuildings(regionMap.buildings, canon, regionMap.gridWidth || 5);
}

// ─── 解析 ─────────────────────────────────────────────────────────────────

function parseAIResponse(text: string, gridSize: number): RegionBuilding[] {
  // 移除 thinking 标签
  let cleaned = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
  cleaned = cleaned.replace(/<thinking>[\s\S]*/gi, '').trim();

  const raw = parseJsonSmart<{ buildings?: any[] }>(cleaned);
  if (!Array.isArray(raw.buildings)) {
    throw new Error('AI 返回数据缺少 buildings 数组');
  }

  const buildings: RegionBuilding[] = raw.buildings.map((b: any, idx: number) => ({
    id: String(b.id || `building_${idx}`).replace(/\s/g, '_'),
    name: String(b.name || b.名称 || `建筑${idx + 1}`),
    gridX: Number(b.gridX) || 1,
    gridY: Number(b.gridY) || 1,
    type: (b.type as RegionBuildingType) || 'functional',
    description: b.description || b.描述 || '',
    isEntrance: !!b.isEntrance,
  }));

  return autoFixBuildings(buildings, gridSize);
}

// ─── 主入口 ───────────────────────────────────────────────────────────────

export interface RegionMapGenParams {
  locationName: string;
  locationType?: string;
  locationDesc?: string;
  factionInfo?: string;
  /** NPC 在当前地点的建筑级位置线索（如 炼丹房、主峰、藏经阁） */
  npcLocationHints?: RegionNpcLocationHint[];
  /** 正典子地点（剧情事件挂靠的建筑级地点）——必含骨架，id/name 禁改 */
  canonBuildings?: RegionCanonBuilding[];
  level?: string;
  /** 强制指定规模，不自动推断 */
  forceScale?: RegionMapScale;
  /** 流式输出回调 */
  onStreamChunk?: (chunk: string) => void;
}

export interface RegionMapGenResult {
  success: boolean;
  regionMap?: RegionMap;
  errors?: string[];
}

/**
 * 生成区域地图（对外主入口）
 */
export async function generateRegionMap(params: RegionMapGenParams): Promise<RegionMapGenResult> {
  const tavern = getTavernHelper();
  if (!tavern) {
    return { success: false, errors: ['AI 服务未初始化，请在设置中配置 AI 服务'] };
  }

  const {
    locationName,
    locationType = '地点',
    locationDesc = '',
    factionInfo,
    npcLocationHints,
    canonBuildings,
    level,
    forceScale,
    onStreamChunk,
  } = params;

  // 1. 确定规模；正典建筑多时升格（正典+入口+少量生成建筑要装得下）
  let scale: RegionMapScale = forceScale ?? inferScale(locationType, level);
  if (canonBuildings?.length) {
    const capacity: Record<RegionMapScale, number> = { '1x1': 1, '3x3': 5, '5x5': 9, '7x7': 15, '9x9': 20 };
    const order: RegionMapScale[] = ['1x1', '3x3', '5x5', '7x7', '9x9'];
    while (capacity[scale] < canonBuildings.length + 3 && scale !== '9x9') {
      scale = order[order.indexOf(scale) + 1];
    }
  }
  const gridSize = REGION_MAP_SCALE_SIZE[scale];

  // 1×1 特殊处理：直接生成一个入口建筑
  if (gridSize === 1) {
    const regionMap: RegionMap = {
      id: `region_${Date.now()}`,
      linkedLocationId: locationName,
      name: locationName,
      scale,
      gridWidth: 1,
      gridHeight: 1,
      buildings: [
        {
          id: 'entrance',
          name: locationName,
          gridX: 1,
          gridY: 1,
          type: 'entrance',
          isEntrance: true,
          description: locationDesc || '此处为核心所在。',
        },
      ],
      generatedAt: new Date().toISOString(),
    };
    return { success: true, regionMap };
  }

  // 2. 构建提示词
  const prompt = await buildPrompt({
    locationName,
    locationType,
    locationDesc,
    factionInfo,
    gridSize,
    npcLocationHints,
    canonBuildings,
  });

  // 3. 调用 AI
  try {
    const response = await tavern.generateRaw({
      ordered_prompts: [
        { role: 'user', content: prompt },
        { role: 'user', content: '请直接输出 JSON，不要有任何其他文字。' },
      ],
      should_stream: !!onStreamChunk,
      usageType: 'world_generation',
      overrides: { world_info_before: '', world_info_after: '' },
      onStreamChunk: (chunk: string) => {
        if (onStreamChunk) onStreamChunk(chunk);
      },
    });

    // 4. 提取文本
    let responseText: string;
    if (response && typeof response === 'object' && 'text' in response) {
      responseText = (response as { text: string }).text;
    } else if (typeof response === 'string') {
      responseText = response;
    } else {
      responseText = String(response);
    }

    console.log(`[区域地图生成] ${locationName} 响应长度:`, responseText?.length || 0);

    // 5. 解析
    const buildings = parseAIResponse(responseText, gridSize);

    // 5.5 正典建筑咬合（确定性兜底：LLM 漏了/改名了也保证在场且 id 对齐）
    enforceCanonBuildings(buildings, canonBuildings, gridSize);

    // 6. 校验
    const { valid, errors } = validateBuildings(buildings, gridSize);
    if (!valid) {
      console.warn('[区域地图生成] 校验警告（已自动修复）:', errors);
    }

    // 7. 组装 RegionMap
    const regionMap: RegionMap = {
      id: `region_${locationName}_${Date.now()}`,
      linkedLocationId: locationName,
      name: locationName,
      scale,
      gridWidth: gridSize,
      gridHeight: gridSize,
      buildings,
      generatedAt: new Date().toISOString(),
    };

    return { success: true, regionMap };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[区域地图生成] 失败:', message);
    return { success: false, errors: [message] };
  }
}
