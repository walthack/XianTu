import { get, set, cloneDeep } from 'lodash';
import type { SaveData, StateChange } from '@/types/game';

/**
 * 叙事-数据同步兜底（第一版：仅位置）。
 *
 * 背景：LLM 常在正文里明确让全队抵达新地点、并已用命令更新了多名同队 NPC 的
 * `社交.关系.<NPC>.当前位置`，却漏发 `set 角色.位置`，导致玩家位置停在旧场景。
 * 位置字段早已在第2步自检清单里（却仍会漏），说明光靠提示词到不了 100%，需要一层
 * 确定性兜底。
 *
 * 设计原则：宁可漏一点，绝不误移动。只在“高置信度移动”时补：
 *  - 本轮命令把 ≥2 名 NPC 的当前位置写到了同一个新地点；
 *  - 正文含明确的移动完成词；
 *  - 本轮未写 `角色.位置`；
 *  - 且能从已落账的 NPC 当前位置里拿到带坐标的完整位置对象（避免造假坐标，也避免
 *    只换描述留下旧坐标造成地图错位——拿不到坐标就只记 diagnostic，不补）。
 */

interface ReconcileCommand {
  action: string;
  key: string;
  value?: unknown;
}

export interface NarrativeReconcileInput {
  saveDataBefore: SaveData;
  saveData: SaveData;
  text: string;
  commands: ReconcileCommand[];
  userAction?: string;
  /** 变更日志摘要器（可选，默认原样）。由调用方注入 class 的 _summarizeValueForChangeLog。 */
  summarize?: (key: string, value: unknown, action: string) => unknown;
}

interface LocationObject {
  描述: string;
  x?: number;
  y?: number;
  灵气浓度?: number;
  regionId?: string;
  buildingId?: string;
}

// 移动完成词：明确“已经到了”，不含“准备去/打算去”等未完成意图
const MOVE_COMPLETION_RE = /抵达|登岸|上岸|靠岸|入城|进城|来到|回到|赶到|住进|入住|踏入|落脚/;

// 仅匹配整块位置对象的命令：社交.关系.<NPC>.当前位置（NPC 名不含点）
const NPC_LOCATION_KEY_RE = /^社交\.关系\.([^.]+)\.当前位置$/;

function normalizeDesc(desc: unknown): string {
  return typeof desc === 'string'
    ? desc.replace(/\s+/g, '').replace(/[・]/g, '·').trim()
    : '';
}

function isLocationObjectWithCoords(value: unknown): value is LocationObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.描述 === 'string' &&
    typeof obj.x === 'number' &&
    Number.isFinite(obj.x) &&
    typeof obj.y === 'number' &&
    Number.isFinite(obj.y)
  );
}

/**
 * 位置兜底：当命令把 ≥2 名 NPC 移动到同一新地点、正文含移动完成词、本轮未写玩家位置时，
 * 把玩家位置补齐为同一位置对象（整块复制，坐标随之带上）。
 */
export function reconcilePlayerLocationFromNarrative(input: NarrativeReconcileInput): StateChange[] {
  const { saveData, text, commands } = input;
  const summarize = input.summarize ?? ((_k, v) => v);

  // 本轮已写玩家位置 → 不重复补
  const playerLocationSetThisTurn = commands.some(
    (c) => c.key === '角色.位置' || c.key.startsWith('角色.位置.')
  );
  if (playerLocationSetThisTurn) return [];

  // 必须有移动完成词，否则可能只是 NPC 各自换房间/换镜头，不代表玩家也移动
  if (!MOVE_COMPLETION_RE.test(text)) return [];

  // 收集本轮被整块写了当前位置的 NPC，按目标地点描述分组
  const npcNamesByDesc = new Map<string, Set<string>>();
  for (const cmd of commands) {
    const match = NPC_LOCATION_KEY_RE.exec(cmd.key);
    if (!match) continue;
    const desc = normalizeDesc((cmd.value as { 描述?: unknown } | undefined)?.描述);
    if (!desc) continue;
    const npcName = match[1];
    if (!npcNamesByDesc.has(desc)) npcNamesByDesc.set(desc, new Set());
    npcNamesByDesc.get(desc)!.add(npcName);
  }

  // 取“≥2 名 NPC 指向同一地点”的候选
  const candidateDesc = [...npcNamesByDesc.entries()].find(([, npcs]) => npcs.size >= 2)?.[0];
  if (!candidateDesc) return [];

  // 玩家已在该地 → 无需补
  const currentPlayerDesc = normalizeDesc(get(saveData, '角色.位置.描述'));
  if (currentPlayerDesc === candidateDesc) return [];

  // 从已落账的 NPC 当前位置里取带坐标的完整位置对象（避免造假坐标 / 留旧坐标错位）
  const npcNames = npcNamesByDesc.get(candidateDesc)!;
  let sourceLocation: LocationObject | null = null;
  for (const npcName of npcNames) {
    const loc = get(saveData, ['社交', '关系', npcName, '当前位置']);
    if (isLocationObjectWithCoords(loc) && normalizeDesc(loc.描述) === candidateDesc) {
      sourceLocation = loc;
      break;
    }
  }
  if (!sourceLocation) {
    console.warn(
      `[AI双向系统] 叙事状态补账: 检测到全队移动至「${candidateDesc}」但拿不到带坐标的位置对象，跳过位置补账（仅诊断）`
    );
    return [];
  }

  const oldValue = get(saveData, '角色.位置');
  const newValue = cloneDeep(sourceLocation);
  set(saveData, '角色.位置', newValue);
  console.warn(`[AI双向系统] 叙事状态补账: 玩家位置同步至「${candidateDesc}」（随 ${npcNames.size} 名同队 NPC）`);

  return [
    {
      key: '角色.位置',
      action: 'set',
      oldValue: summarize('角色.位置', oldValue, 'set'),
      newValue: summarize('角色.位置', newValue, 'set'),
    },
  ];
}

/**
 * 叙事状态兜底入口。第一版只做位置；即兴目标先靠提示词自检清单观察落账率，
 * 队伍 NPC 状态（二阶段）与 LLM 任务审计员（二期）暂不实现。
 */
export function reconcileNarrativeState(input: NarrativeReconcileInput): StateChange[] {
  return reconcilePlayerLocationFromNarrative(input);
}
