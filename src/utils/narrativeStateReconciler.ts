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

// 叙事是否把该目的地写出来了：整段命中，或“大区·地点·区域”的末段命中（把移动与目的地绑定）
function narrativeMentionsLocation(text: string, rawDesc: string): boolean {
  const full = normalizeDesc(rawDesc);
  if (!full) return false;
  const t = text.replace(/\s+/g, '');
  if (t.includes(full)) return true;
  const segs = full.split('·').filter(Boolean);
  const last = segs[segs.length - 1];
  return !!last && last.length >= 2 && t.includes(last);
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
 * 位置兜底：当本轮命令把 ≥2 名同队 NPC **真正移动**到同一新地点、正文写出了该地点、
 * 本轮未写玩家位置时，把玩家位置补齐为同一位置对象（整块复制，坐标随之带上）。
 *
 * provenance 严守（宁可漏，绝不误传送）：
 *  - 仅计 `action==='set'` 的整块 `当前位置` 命令；
 *  - 用 saveDataBefore 证明该 NPC 本轮地点确实变了（幂等/失败命令不算移动）；
 *  - 多个"≥2 名"目的地组同时存在 → 歧义，直接拒绝；
 *  - 目的地必须在正文出现（把移动与目的地绑定）；
 *  - 候选 NPC 的落账坐标必须一致，否则跳过。
 */
export function reconcilePlayerLocationFromNarrative(input: NarrativeReconcileInput): StateChange[] {
  const { saveData, saveDataBefore, text, commands } = input;
  const summarize = input.summarize ?? ((_k, v) => v);

  // 本轮已写玩家位置 → 不重复补
  if (commands.some((c) => c.key === '角色.位置' || c.key.startsWith('角色.位置.'))) return [];

  // 必须有移动完成词，否则可能只是 NPC 各自换房间/换镜头，不代表玩家也移动
  if (!MOVE_COMPLETION_RE.test(text)) return [];

  // 收集本轮"真正发生移动"的 NPC：set 整块当前位置，且移动前后地点确实不同
  const movedByDesc = new Map<string, { npcs: Set<string>; rawDesc: string }>();
  for (const cmd of commands) {
    if (cmd.action !== 'set') continue;
    const match = NPC_LOCATION_KEY_RE.exec(cmd.key);
    if (!match) continue;
    const rawDesc =
      typeof (cmd.value as { 描述?: unknown } | undefined)?.描述 === 'string'
        ? (cmd.value as { 描述: string }).描述
        : '';
    const desc = normalizeDesc(rawDesc);
    if (!desc) continue;
    const npcName = match[1];
    const prevDesc = normalizeDesc(get(saveDataBefore, ['社交', '关系', npcName, '当前位置', '描述']));
    if (prevDesc === desc) continue; // 没真移动（幂等/失败命令）→ 不计入
    const entry = movedByDesc.get(desc) ?? { npcs: new Set<string>(), rawDesc };
    entry.npcs.add(npcName);
    movedByDesc.set(desc, entry);
  }

  // 候选：≥2 名真正移动到同一地点；多目的地组同时存在则歧义，拒绝
  const candidates = [...movedByDesc.entries()].filter(([, g]) => g.npcs.size >= 2);
  if (candidates.length !== 1) return [];
  const [candidateDesc, group] = candidates[0];

  // 目的地必须在正文出现，把移动与该地点绑定
  if (!narrativeMentionsLocation(text, group.rawDesc)) return [];

  // 玩家已在该地 → 无需补
  if (normalizeDesc(get(saveData, '角色.位置.描述')) === candidateDesc) return [];

  // 取带坐标的完整位置对象，且候选 NPC 间坐标必须一致（避免造假坐标 / 留旧坐标错位）
  let sourceLocation: LocationObject | null = null;
  for (const npcName of group.npcs) {
    const loc = get(saveData, ['社交', '关系', npcName, '当前位置']);
    if (!isLocationObjectWithCoords(loc) || normalizeDesc(loc.描述) !== candidateDesc) continue;
    if (!sourceLocation) {
      sourceLocation = loc;
    } else if (sourceLocation.x !== loc.x || sourceLocation.y !== loc.y) {
      console.warn(`[AI双向系统] 叙事状态补账: 同队 NPC 对「${candidateDesc}」坐标不一致，跳过（仅诊断）`);
      return [];
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
  console.warn(`[AI双向系统] 叙事状态补账: 玩家位置同步至「${candidateDesc}」（随 ${group.npcs.size} 名真正移动的同队 NPC）`);

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
